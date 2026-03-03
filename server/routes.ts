import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import * as threads from "./threads";
import { requireAuth, hashPassword, verifyPassword, signToken } from "./auth";

function getUser(req: Request) { return (req as any).user as { userId: string; email: string }; }

function normalizeInsightsTimeParam(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const raw = value.trim();
  if (!raw) return undefined;

  // Threads insights expects Unix timestamp seconds for since/until.
  if (/^\d+$/.test(raw)) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return undefined;
    const normalized = parsed > 9999999999 ? Math.floor(parsed / 1000) : Math.floor(parsed);
    return String(normalized);
  }

  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return undefined;
  return String(Math.floor(ms / 1000));
}

function normalizePostsLimit(value: unknown): number {
  const allowed = new Set([10, 50, 100]);
  const raw = typeof value === "string" ? Number(value) : Number.NaN;
  return allowed.has(raw) ? raw : 10;
}

function startScheduler() {
  setInterval(async () => {
    try {
      const duePosts = await storage.getPendingDueScheduledPosts();
      for (const post of duePosts) {
        if (!post.userToken) {
          await storage.updateScheduledPost(post.id, { status: "failed", errorMessage: "No API token configured" });
          continue;
        }
        try {
          const user = await storage.getUserById(post.userId!);
          const profile = await threads.getProfile(post.userToken);
          const threadId = await threads.postThread(post.userToken, profile.id, post.content, {
            imageUrl: post.mediaType === "IMAGE" ? post.mediaUrl || undefined : undefined,
            videoUrl: post.mediaType === "VIDEO" ? post.mediaUrl || undefined : undefined,
            topicTag: (post as any).topicTag || user?.defaultTopic || undefined,
          });
          await storage.updateScheduledPost(post.id, { status: "published", threadsPostId: threadId });
        } catch (err: any) {
          await storage.updateScheduledPost(post.id, { status: "failed", errorMessage: err.message });
        }
      }

      const dueItems = await storage.getPendingDueBulkItems();
      for (const item of dueItems) {
        if (!item.userToken) {
          await storage.updateBulkQueueItem(item.id, { status: "failed", errorMessage: "No API token" });
          continue;
        }
        try {
          const user = await storage.getUserById(item.userId!);
          const profile = await threads.getProfile(item.userToken);
          const threadId = await threads.postThread(item.userToken, profile.id, item.content, {
            imageUrl: item.mediaUrl || undefined,
            topicTag: (item as any).topicTag || user?.defaultTopic || undefined,
          });
          await storage.updateBulkQueueItem(item.id, { status: "sent", publishedAt: new Date(), threadsPostId: threadId });
        } catch (err: any) {
          await storage.updateBulkQueueItem(item.id, { status: "failed", errorMessage: err.message });
        }
      }

      const dueFollowUps = await storage.getPendingDueFollowUps();
      for (const followUp of dueFollowUps) {
        if (!followUp.userToken) {
          await storage.updateFollowUpThread(followUp.id, { status: "failed", errorMessage: "No API token" });
          continue;
        }
        try {
          const profile = await threads.getProfile(followUp.userToken);
          const replyId = await threads.postThread(followUp.userToken, profile.id, followUp.content, { replyToId: followUp.originalPostId });
          await storage.updateFollowUpThread(followUp.id, { status: "published", threadsReplyId: replyId });
        } catch (err: any) {
          await storage.updateFollowUpThread(followUp.id, { status: "failed", errorMessage: err.message });
        }
      }
    } catch (_) {}
  }, 60_000);
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  startScheduler();

  // ── Auth ────────────────────────────────────────────────────────────────────
  app.post("/api/auth/signup", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ error: "Invalid email format" });
    try {
      const existing = await storage.getUserByEmail(email);
      if (existing) return res.status(409).json({ error: "An account with this email already exists" });
      const hashed = await hashPassword(password);
      await storage.createUser({ email, password: hashed });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/auth/signin", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
    try {
      const user = await storage.getUserByEmail(email);
      if (!user) return res.status(401).json({ error: "Invalid email or password" });
      const valid = await verifyPassword(password, user.password);
      if (!valid) return res.status(401).json({ error: "Invalid email or password" });
      const token = signToken({ userId: user.id, email: user.email });
      const { password: _, ...safeUser } = user;
      res.json({ token, user: safeUser });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const { password: _, ...safeUser } = user;
    res.json(safeUser);
  });

  app.post("/api/auth/connect-threads", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const { threadsAppId, threadsAppSecret, threadsAccessToken } = req.body;
    if (!threadsAccessToken) return res.status(400).json({ error: "Access token is required" });
    try {
      const profile = await threads.getProfile(threadsAccessToken);
      const user = await storage.updateUserThreadsCredentials(userId, {
        threadsAppId: threadsAppId || undefined,
        threadsAppSecret: threadsAppSecret || undefined,
        threadsAccessToken,
        threadsUsername: profile.username,
        threadsProfilePicUrl: profile.threads_profile_picture_url,
        threadsFollowerCount: undefined,
      });
      const { password: _, ...safeUser } = user;
      res.json({ success: true, user: safeUser, profile });
    } catch (err: any) { res.status(400).json({ error: `Could not connect: ${err.message}` }); }
  });

  app.patch("/api/auth/default-topic", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const { defaultTopic } = req.body;
    try {
      await storage.updateUserDefaultTopic(userId, defaultTopic || null);
      const user = await storage.getUserById(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      const { password: _, ...safeUser } = user;
      res.json({ success: true, user: safeUser });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.patch("/api/auth/password", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: "Both passwords required" });
    if (newPassword.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
    const user = await storage.getUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const valid = await verifyPassword(currentPassword, user.password);
    if (!valid) return res.status(401).json({ error: "Current password is incorrect" });
    const hashed = await hashPassword(newPassword);
    await storage.updateUserPassword(userId, hashed);
    res.json({ success: true });
  });

  app.delete("/api/auth/account", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    await storage.deleteUser(userId);
    res.json({ success: true });
  });

  app.post("/api/auth/disconnect-threads", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    await storage.updateUserThreadsCredentials(userId, {
      threadsAppId: undefined, threadsAppSecret: undefined,
      threadsAccessToken: undefined, threadsUsername: undefined,
      threadsProfilePicUrl: undefined, threadsFollowerCount: undefined,
    });
    res.json({ success: true });
  });

  // ── Profile & Posts ─────────────────────────────────────────────────────────
  app.get("/api/profile", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user?.threadsAccessToken) return res.status(401).json({ error: "NO_TOKEN" });
    try {
      const profile = await threads.getProfile(user.threadsAccessToken);
      res.json(profile);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/posts/recent", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user?.threadsAccessToken) return res.status(401).json({ error: "NO_TOKEN" });
    try {
      const profile = await threads.getProfile(user.threadsAccessToken);
      const posts = await threads.getUserPosts(user.threadsAccessToken, profile.id);
      res.json(posts);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/posts/publish", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user?.threadsAccessToken) return res.status(401).json({ error: "NO_TOKEN", message: "Connect your Threads account first" });
    const { content, mediaUrl, mediaType, topicTag } = req.body;
    if (!content) return res.status(400).json({ error: "Content is required" });
    try {
      const profile = await threads.getProfile(user.threadsAccessToken);
      const postId = await threads.postThread(user.threadsAccessToken, profile.id, content, {
        imageUrl: mediaType === "IMAGE" ? mediaUrl : undefined,
        videoUrl: mediaType === "VIDEO" ? mediaUrl : undefined,
        topicTag: topicTag || user.defaultTopic || undefined,
      });
      res.json({ success: true, postId });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ✅ NEW: Repost
  app.post("/api/posts/:postId/repost", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user?.threadsAccessToken) return res.status(401).json({ error: "NO_TOKEN" });
    try {
      const profile = await threads.getProfile(user.threadsAccessToken);
      const repostId = await threads.repostThread(user.threadsAccessToken, profile.id, req.params.postId);
      res.json({ success: true, repostId });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ✅ NEW: Quote post
  app.post("/api/posts/:postId/quote", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user?.threadsAccessToken) return res.status(401).json({ error: "NO_TOKEN" });
    const { content, topicTag } = req.body;
    if (!content) return res.status(400).json({ error: "Content is required" });
    try {
      const profile = await threads.getProfile(user.threadsAccessToken);
      const quoteId = await threads.quoteThread(
        user.threadsAccessToken, profile.id, content, req.params.postId,
        topicTag || user.defaultTopic || undefined
      );
      res.json({ success: true, quoteId });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ✅ NEW: Per-post insights
  app.get("/api/posts/:postId/insights", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user?.threadsAccessToken) return res.status(401).json({ error: "NO_TOKEN" });
    try {
      const insights = await threads.getPostInsights(user.threadsAccessToken, req.params.postId);
      res.json(insights);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ✅ NEW: Account-level analytics
  app.get("/api/analytics", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user?.threadsAccessToken) return res.status(401).json({ error: "NO_TOKEN" });
    try {
      const since = normalizeInsightsTimeParam(req.query.since);
      const until = normalizeInsightsTimeParam(req.query.until);
      const postsLimit = normalizePostsLimit(req.query.postsLimit);
      const profile = await threads.getProfile(user.threadsAccessToken);
      const [accountInsights, recentPosts] = await Promise.all([
        threads.getAccountInsights(user.threadsAccessToken, profile.id, {
          since,
          until,
        }),
        threads.getUserPosts(user.threadsAccessToken, profile.id, postsLimit),
      ]);
      const rangeFollowersCount = (since || until)
        ? await threads.getFollowersCountInRange(user.threadsAccessToken, profile.id, { since, until })
        : undefined;
      const followersCount = rangeFollowersCount ?? await threads.getFollowersCount(user.threadsAccessToken, profile.id);

      // Avoid overwhelming Threads API on very large selections.
      const INSIGHTS_FETCH_CAP = 100;
      const selectedPosts = recentPosts.slice(0, postsLimit);
      const detailedPosts = selectedPosts.slice(0, INSIGHTS_FETCH_CAP);
      const remainingPosts = selectedPosts.slice(INSIGHTS_FETCH_CAP);

      const detailedWithInsights = await Promise.all(
        detailedPosts.map(async (post: any) => {
          try {
            const insights = await threads.getPostInsights(user.threadsAccessToken!, post.id);
            return { ...post, insights };
          } catch {
            return { ...post, insights: null };
          }
        })
      );
      const remainingWithoutInsights = remainingPosts.map((post: any) => ({ ...post, insights: null }));
      const postsWithInsights = [...detailedWithInsights, ...remainingWithoutInsights];

      res.json({
        account: { ...profile, ...accountInsights, followers_count: followersCount },
        posts: postsWithInsights,
      });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ── Scheduling ───────────────────────────────────────────────────────────────
  app.post("/api/posts/schedule", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    try {
      const post = await storage.createScheduledPost(userId, req.body);
      res.json(post);
    } catch (err: any) { res.status(400).json({ error: err.message }); }
  });

  app.get("/api/posts/scheduled", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const posts = await storage.getScheduledPosts(userId);
    res.json(posts);
  });

  app.patch("/api/posts/scheduled/:id", requireAuth, async (req, res) => {
    try {
      const post = await storage.updateScheduledPost(req.params.id, req.body);
      res.json(post);
    } catch (err: any) { res.status(400).json({ error: err.message }); }
  });

  app.delete("/api/posts/scheduled/:id", requireAuth, async (req, res) => {
    await storage.deleteScheduledPost(req.params.id);
    res.json({ success: true });
  });

  // ── Bulk Queues ──────────────────────────────────────────────────────────────
  app.get("/api/bulk-queues", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const queues = await storage.getBulkQueues(userId);
    res.json(queues);
  });

  app.post("/api/bulk-queues", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const { name, delayMinutes, items, topicTag } = req.body;
    if (!name || !items || !Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: "Invalid bulk queue data" });
    const user = await storage.getUserById(userId);
    const resolvedTopic = topicTag || user?.defaultTopic || undefined;
    const now = new Date();
    const queueItems = items.map((item: any, idx: number) => ({
      content: item.content, mediaUrl: item.mediaUrl || null, orderIndex: idx,
      topicTag: resolvedTopic,
      scheduledAt: idx === 0 ? now : new Date(now.getTime() + idx * delayMinutes * 60 * 1000),
    }));
    const queue = await storage.createBulkQueue(userId, { name, delayMinutes, topicTag: resolvedTopic }, queueItems);
    await storage.updateBulkQueue(queue.id, { status: "running" });
    res.json({ ...queue, status: "running" });
  });

  app.patch("/api/bulk-queues/:id", requireAuth, async (req, res) => {
    await storage.updateBulkQueue(req.params.id, req.body);
    res.json({ success: true });
  });

  app.delete("/api/bulk-queues/:id", requireAuth, async (req, res) => {
    await storage.deleteBulkQueue(req.params.id);
    res.json({ success: true });
  });

  // ── Follow-Ups ───────────────────────────────────────────────────────────────
  app.get("/api/follow-ups", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const followUps = await storage.getFollowUpThreads(userId);
    res.json(followUps);
  });

  app.post("/api/follow-ups", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    try {
      const followUp = await storage.createFollowUpThread(userId, req.body);
      res.json(followUp);
    } catch (err: any) { res.status(400).json({ error: err.message }); }
  });

  app.delete("/api/follow-ups/:id", requireAuth, async (req, res) => {
    await storage.deleteFollowUpThread(req.params.id);
    res.json({ success: true });
  });

  // ── Thread Chain ─────────────────────────────────────────────────────────────
  app.post("/api/thread-chain", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user?.threadsAccessToken) return res.status(401).json({ error: "NO_TOKEN" });
    const { posts, topicTag } = req.body;
    if (!posts || !Array.isArray(posts) || posts.length === 0)
      return res.status(400).json({ error: "Posts array is required" });
    if (posts.length > 20) return res.status(400).json({ error: "Max 20 posts per chain" });

    const resolvedTopic = topicTag || user.defaultTopic || undefined;
    try {
      const profile = await threads.getProfile(user.threadsAccessToken);
      const publishedIds: string[] = [];
      let previousPostId: string | undefined = undefined;

      for (let i = 0; i < posts.length; i++) {
        const text = posts[i];
        if (!text?.trim()) continue;
        const postId = await threads.postThread(user.threadsAccessToken, profile.id, text, {
          replyToId: previousPostId,
          topicTag: i === 0 ? resolvedTopic : undefined,
        });
        publishedIds.push(postId);
        previousPostId = postId;
        if (i < posts.length - 1) await new Promise(r => setTimeout(r, 1500));
      }

      res.json({ success: true, publishedIds, count: publishedIds.length });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ── Comments ─────────────────────────────────────────────────────────────────
  app.get("/api/comments", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user?.threadsAccessToken) return res.status(401).json({ error: "NO_TOKEN" });
    const { postId } = req.query;
    if (!postId || typeof postId !== "string") return res.status(400).json({ error: "postId required" });
    try {
      const replies = await threads.getReplies(user.threadsAccessToken, postId);
      res.json(replies);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/comments/:postId/reply", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user?.threadsAccessToken) return res.status(401).json({ error: "NO_TOKEN" });
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: "Content required" });
    try {
      const profile = await threads.getProfile(user.threadsAccessToken);
      const replyId = await threads.postThread(user.threadsAccessToken, profile.id, content, { replyToId: req.params.postId });
      res.json({ success: true, replyId });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/comments/:mediaId/like", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user?.threadsAccessToken) return res.status(401).json({ error: "NO_TOKEN" });
    try {
      const profile = await threads.getProfile(user.threadsAccessToken);
      await threads.likePost(user.threadsAccessToken, req.params.mediaId, profile.id);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  return httpServer;
}
