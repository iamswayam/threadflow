import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import * as threads from "./threads";
import { requireAuth, hashPassword, verifyPassword, signToken, verifyToken } from "./auth";

/*
 * =====================================================
 * PERFORMANCE DNA - PROTECTED PUBLISH RULE
 * =====================================================
 * Every publish path in this file MUST call
 * extractDnaSignals() and save the result to scheduledPosts.
 *
 * Covered paths (do not remove or skip):
 *   1. POST /api/posts/publish       (Quick Post + Compose)
 *   2. startScheduler() scheduled    (auto-publish pending posts)
 *   3. startScheduler() bulk items   (bulk queue publish)
 *   4. POST /api/thread-chain        (chain post publish)
 *
 * If you add a NEW publish path, you MUST also:
 *   - Call extractDnaSignals()
 *   - Create or update a scheduledPost record with DNA signals
 *   - Set a 10-min setTimeout to fetch and save insights
 *
 * Skipping this silently breaks the Performance DNA Engine.
 * =====================================================
 */

function getUser(req: Request) { return (req as any).user as { userId: string; email: string }; }

function sanitizeUserForClient(user: any) {
  const {
    password: _password,
    aiOpenaiApiKey: _aiOpenaiApiKey,
    aiAnthropicApiKey: _aiAnthropicApiKey,
    aiGoogleApiKey: _aiGoogleApiKey,
    aiPerplexityApiKey: _aiPerplexityApiKey,
    ...safeUser
  } = user;
  return safeUser;
}

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

function normalizeBooleanFlag(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const raw = value.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function normalizeReplyCenterDays(value: unknown): number {
  const raw = typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(raw)) return 7;
  return Math.min(Math.max(Math.floor(raw), 1), 30);
}

function normalizeReplyCenterPostsLimit(value: unknown): number {
  const allowed = new Set([10, 25, 50]);
  const raw = typeof value === "string" ? Number(value) : Number.NaN;
  return allowed.has(raw) ? raw : 25;
}

function normalizeReplyCenterRepliesPerPost(value: unknown): number {
  const raw = typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(raw)) return 100;
  return Math.min(Math.max(Math.floor(raw), 25), 200);
}

function normalizeAppTag(value: unknown): string | undefined {
  let tags: string[] = [];

  if (Array.isArray(value)) {
    tags = value.map((v) => String(v).trim()).filter(Boolean);
  } else if (typeof value === "string") {
    tags = value
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  } else {
    return undefined;
  }

  tags = tags.map((t) => t.charAt(0).toUpperCase() + t.slice(1));
  tags = tags.slice(0, 5);

  if (tags.some((t) => t.length > 60)) {
    throw new Error("Each tag must be 60 characters or less");
  }

  if (tags.length === 0) return undefined;
  return tags.join(",");
}

function extractDnaSignals(content: string, publishedAt: Date, mediaUrl?: string | null) {
  const normalizedContent = String(content || "");
  const trimmedContent = normalizedContent.trim();
  const firstLine = normalizedContent.split(/\r?\n/)[0]?.trim() || "";
  const firstLineLower = firstLine.toLowerCase();

  const questionWordPattern = /^(who|what|when|where|why|how|is|are|can|could|should|do|does|did|will|would)\b/i;
  const numberPattern = /^(?:\d+)\b|\b\d+\s+(reasons|ways|things|tips|rules)\b/i;
  const quotePattern = /^["']/;
  const commandPattern = /^(stop|never|always|start|don't|dont|do)\b/i;

  let hookStyle: "question" | "number" | "statement" | "quote" | "command" = "statement";
  if (questionWordPattern.test(firstLine) || firstLine.endsWith("?")) {
    hookStyle = "question";
  } else if (numberPattern.test(firstLineLower)) {
    hookStyle = "number";
  } else if (quotePattern.test(firstLine)) {
    hookStyle = "quote";
  } else if (commandPattern.test(firstLineLower)) {
    hookStyle = "command";
  }

  const ctaPattern =
    /\b(comment|share|follow|save|tag someone|let me know|what do you|drop a|agree|thoughts|your take)\b/i;
  const hasCta = trimmedContent.endsWith("?") || ctaPattern.test(normalizedContent);
  const hasMedia = !!(mediaUrl && String(mediaUrl).trim());

  return {
    postLength: normalizedContent.length,
    wordCount: trimmedContent ? trimmedContent.split(/\s+/).filter(Boolean).length : 0,
    hourOfDay: publishedAt.getHours(),
    dayOfWeek: publishedAt.getDay(),
    hookStyle,
    hasCta,
    hasMedia,
  };
}

function toNullableInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function isThreadsMissingPostError(err: unknown): boolean {
  const message = String((err as any)?.message || "").toLowerCase();
  return (
    message.includes("not found") ||
    message.includes("invalid media") ||
    message.includes("does not exist") ||
    message.includes("unknown media") ||
    message.includes("#100")
  );
}

function isAcceptableDeleteError(err: unknown): boolean {
  const message = String((err as any)?.message || "").toLowerCase();
  return message.includes("404") || message.includes("already deleted") || isThreadsMissingPostError(err);
}

async function refreshScheduledPostInsights(
  accessToken: string,
  scheduledPostId: string,
  threadsPostId: string,
) {
  const insights = await threads.getPostInsights(accessToken, threadsPostId);
  await storage.updateScheduledPost(scheduledPostId, {
    insightsViews: toNullableInt(insights?.views),
    insightsLikes: toNullableInt(insights?.likes),
    insightsReplies: toNullableInt(insights?.replies),
    insightsReposts: toNullableInt(insights?.reposts),
    insightsQuotes: toNullableInt(insights?.quotes),
    insightsFetchedAt: new Date(),
  });
}

function scheduleInsightsRefresh(accessToken: string, scheduledPostId: string, threadsPostId: string) {
  setTimeout(async () => {
    try {
      await refreshScheduledPostInsights(accessToken, scheduledPostId, threadsPostId);
    } catch {
      // Background insights refresh is best-effort only.
    }
  }, 10 * 60 * 1000);
}

function toTimestampMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return ms;
}

function calculateToxicityRisk(text: string | undefined): { score: number; level: "low" | "medium" | "high" } {
  const value = (text || "").toLowerCase();
  if (!value) return { score: 0, level: "low" };

  const severeTerms = ["kill", "die", "hate", "fraud", "scam"];
  const abuseTerms = ["idiot", "stupid", "dumb", "trash", "nonsense", "worst", "shut up"];
  let score = 0;

  for (const token of severeTerms) {
    if (value.includes(token)) score += 25;
  }
  for (const token of abuseTerms) {
    if (value.includes(token)) score += 12;
  }

  const punctuationHits = ((text || "").match(/[!?]/g) || []).length;
  if (punctuationHits >= 4) score += 8;

  const uppercaseChars = (text || "").replace(/[^A-Z]/g, "").length;
  const alphaChars = (text || "").replace(/[^A-Za-z]/g, "").length;
  if (alphaChars >= 12 && uppercaseChars / alphaChars > 0.55) score += 12;

  score = Math.min(score, 100);
  if (score >= 60) return { score, level: "high" };
  if (score >= 30) return { score, level: "medium" };
  return { score, level: "low" };
}

type AiProvider = "openai" | "anthropic" | "gemini" | "perplexity";
type AiRole = "user" | "assistant";
type AiHistoryMessage = { role: AiRole; content: string };

const AI_SYSTEM_PROMPT =
  "You are a social media writing assistant for Threads. Provide concise, clear, high-engagement drafts. " +
  "When relevant, include 3-5 variants and keep each variant ready to post.";
const FREE_DAILY_AI_LIMIT = 10;

const AI_PROVIDER_CATALOG: Record<
  AiProvider,
  { label: string; envKeys: string[]; models: string[]; defaultModel: string }
> = {
  openai: {
    label: "ChatGPT (OpenAI)",
    envKeys: ["OPENAI_API_KEY"],
    models: [
      "gpt-5.2",
      "gpt-5.2-chat-latest",
      "gpt-5.2-pro",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-4.1",
    ],
    defaultModel: "gpt-5.2",
  },
  anthropic: {
    label: "Claude (Anthropic)",
    envKeys: ["ANTHROPIC_API_KEY"],
    models: ["claude-3-5-haiku-latest", "claude-3-7-sonnet-latest"],
    defaultModel: "claude-3-5-haiku-latest",
  },
  gemini: {
    label: "Gemini (Google)",
    envKeys: ["GOOGLE_AI_API_KEY", "GEMINI_API_KEY"],
    models: ["gemini-2.0-flash", "gemini-1.5-pro"],
    defaultModel: "gemini-2.0-flash",
  },
  perplexity: {
    label: "Perplexity",
    envKeys: ["PERPLEXITY_API_KEY"],
    models: ["sonar", "sonar-pro"],
    defaultModel: "sonar",
  },
};

function getEnvKeyValue(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function normalizeApiKey(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  return normalized.slice(0, 500);
}

function getUserProviderApiKey(user: any, provider: AiProvider): string | undefined {
  if (provider === "openai") return normalizeApiKey(user?.aiOpenaiApiKey);
  if (provider === "anthropic") return normalizeApiKey(user?.aiAnthropicApiKey);
  if (provider === "gemini") return normalizeApiKey(user?.aiGoogleApiKey);
  if (provider === "perplexity") return normalizeApiKey(user?.aiPerplexityApiKey);
  return undefined;
}

function getEffectiveProviderApiKey(user: any, provider: AiProvider): string | undefined {
  return getUserProviderApiKey(user, provider) || getEnvKeyValue(AI_PROVIDER_CATALOG[provider].envKeys);
}

function getConfiguredAiProviders(user?: any): Array<{ provider: AiProvider; label: string; models: string[]; defaultModel: string }> {
  return (Object.keys(AI_PROVIDER_CATALOG) as AiProvider[])
    .filter((provider) => !!getEffectiveProviderApiKey(user, provider))
    .map((provider) => ({
      provider,
      label: AI_PROVIDER_CATALOG[provider].label,
      models: AI_PROVIDER_CATALOG[provider].models,
      defaultModel: AI_PROVIDER_CATALOG[provider].defaultModel,
    }));
}

function hasAnyUserProvidedAiKey(user: any): boolean {
  return (Object.keys(AI_PROVIDER_CATALOG) as AiProvider[]).some(
    (provider) => !!getUserProviderApiKey(user, provider),
  );
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function getNextUtcMidnight(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
}

function sanitizeAiHistory(input: unknown): AiHistoryMessage[] {
  if (!Array.isArray(input)) return [];
  const cleaned = input
    .map((item) => {
      const role = item && typeof item === "object" ? (item as any).role : undefined;
      const content = item && typeof item === "object" ? (item as any).content : undefined;
      if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
      const text = content.trim().slice(0, 2000);
      if (!text) return null;
      return { role, content: text } as AiHistoryMessage;
    })
    .filter(Boolean) as AiHistoryMessage[];
  return cleaned.slice(-8);
}

function getOpenAiReply(data: any): string {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  if (!Array.isArray(data?.output)) return "";
  const parts: string[] = [];
  for (const item of data.output) {
    if (!Array.isArray(item?.content)) continue;
    for (const content of item.content) {
      const text = content?.text;
      if (typeof text === "string" && text.trim()) parts.push(text.trim());
    }
  }
  return parts.join("\n").trim();
}

async function callOpenAi(apiKey: string, model: string, history: AiHistoryMessage[], message: string): Promise<string> {
  const input = [
    { role: "system", content: [{ type: "input_text", text: AI_SYSTEM_PROMPT }] },
    ...history.map((m) => ({ role: m.role, content: [{ type: "input_text", text: m.content }] })),
    { role: "user", content: [{ type: "input_text", text: message }] },
  ];
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input, temperature: 0.7 }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `OpenAI request failed (${response.status})`);
  }
  return getOpenAiReply(data);
}

async function callAnthropic(apiKey: string, model: string, history: AiHistoryMessage[], message: string): Promise<string> {
  const messages = [
    ...history.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
    { role: "user", content: message },
  ];
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      system: AI_SYSTEM_PROMPT,
      messages,
      temperature: 0.7,
      max_tokens: 700,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `Anthropic request failed (${response.status})`);
  }
  const text = (data?.content || [])
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
  return text;
}

async function callGemini(apiKey: string, model: string, history: AiHistoryMessage[], message: string): Promise<string> {
  const contents = [
    ...history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: AI_SYSTEM_PROMPT }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 700 },
      }),
    }
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `Gemini request failed (${response.status})`);
  }
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
  return text;
}

async function callPerplexity(apiKey: string, model: string, history: AiHistoryMessage[], message: string): Promise<string> {
  const messages = [
    { role: "system", content: AI_SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];
  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, temperature: 0.7 }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `Perplexity request failed (${response.status})`);
  }
  const text = data?.choices?.[0]?.message?.content;
  return typeof text === "string" ? text.trim() : "";
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
          const publishedAt = new Date();
          const dnaSignals = extractDnaSignals(post.content, publishedAt, post.mediaUrl || null);
          await storage.updateScheduledPost(post.id, {
            status: "published",
            threadsPostId: threadId,
            ...dnaSignals,
          });
          scheduleInsightsRefresh(post.userToken, post.id, threadId);
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
          if (!item.queue.userId) {
            await storage.updateBulkQueueItem(item.id, { status: "failed", errorMessage: "No user ID in queue" });
            continue;
          }
          const user = await storage.getUserById(item.queue.userId);
          const profile = await threads.getProfile(item.userToken);
          const threadId = await threads.postThread(item.userToken, profile.id, item.content, {
            imageUrl: item.mediaUrl || undefined,
            topicTag: (item as any).topicTag || user?.defaultTopic || undefined,
          });
          const publishedAt = new Date();
          const dnaSignals = extractDnaSignals(item.content, publishedAt, item.mediaUrl || null);
          await storage.updateBulkQueueItem(item.id, {
            status: "sent",
            publishedAt,
            threadsPostId: threadId,
            ...(dnaSignals as any),
          } as any);
          const publishedPost = await storage.createScheduledPost(item.queue.userId, {
            content: item.content,
            scheduledAt: publishedAt,
            topicTag: (item as any).topicTag || item.queue.topicTag || null,
            mediaUrl: item.mediaUrl || null,
            mediaType: "TEXT",
            status: "published",
            threadsPostId: threadId,
            ...dnaSignals,
          } as any);
          scheduleInsightsRefresh(item.userToken, publishedPost.id, threadId);
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

  // â”€â”€ Auth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      const safeUser = sanitizeUserForClient(user);
      res.json({ token, user: safeUser });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const safeUser = sanitizeUserForClient(user);
    res.json(safeUser);
  });

  app.post("/api/auth/connect-threads", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const { threadsAppId, threadsAppSecret, threadsAccessToken } = req.body;
    if (!threadsAccessToken) return res.status(400).json({ error: "Access token is required" });
    try {
      const profile = await threads.getProfile(threadsAccessToken);
      const followersCount = await threads.getFollowersCount(threadsAccessToken, profile.id);
      const user = await storage.updateUserThreadsCredentials(userId, {
        threadsAppId: threadsAppId || undefined,
        threadsAppSecret: threadsAppSecret || undefined,
        threadsAccessToken,
        threadsUsername: profile.username,
        threadsProfilePicUrl: profile.threads_profile_picture_url,
        threadsFollowerCount: followersCount,
      });
      const safeUser = sanitizeUserForClient(user);
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
      const safeUser = sanitizeUserForClient(user);
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

  app.get("/api/auth/threads/connect", requireAuth, async (req, res) => {
    const appId = process.env.THREADS_APP_ID;
    const redirectUri = process.env.THREADS_REDIRECT_URI;
    if (!appId || !redirectUri) {
      return res
        .status(400)
        .json({ error: "THREADS_APP_ID and THREADS_REDIRECT_URI must be set in environment" });
    }

    const authHeader = req.headers.authorization;
    const state = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!state) return res.status(401).json({ error: "UNAUTHORIZED" });

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      scope: [
        "threads_basic",
        "threads_content_publish",
        "threads_manage_replies",
        "threads_read_replies",
        "threads_manage_insights",
      ].join(","),
      response_type: "code",
      state,
    });
    res.json({ url: `https://threads.net/oauth/authorize?${params.toString()}` });
  });

  app.get("/api/auth/threads/callback", async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;

    if (!code) return res.status(400).json({ error: "code param required" });

    const jwtPayload = state ? verifyToken(state) : null;
    if (!jwtPayload?.userId) return res.redirect("/settings?error=oauth_state_invalid");

    const appId = process.env.THREADS_APP_ID;
    const appSecret = process.env.THREADS_APP_SECRET;
    const redirectUri = process.env.THREADS_REDIRECT_URI;
    if (!appId || !appSecret || !redirectUri) return res.redirect("/settings?error=oauth_failed");

    try {
      const shortTokenResponse = await fetch("https://graph.threads.net/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }).toString(),
      });

      if (!shortTokenResponse.ok) return res.redirect("/settings?error=oauth_token_failed");

      const shortTokenPayload = (await shortTokenResponse.json().catch(() => null)) as
        | { access_token?: string }
        | null;
      const shortLivedToken = shortTokenPayload?.access_token;
      if (!shortLivedToken) return res.redirect("/settings?error=oauth_token_failed");

      let finalAccessToken = shortLivedToken;
      try {
        const exchangeParams = new URLSearchParams({
          grant_type: "th_exchange_token",
          client_id: appId,
          client_secret: appSecret,
          access_token: shortLivedToken,
        });
        const longTokenResponse = await fetch(
          `https://graph.threads.net/access_token?${exchangeParams.toString()}`,
        );
        if (longTokenResponse.ok) {
          const longTokenPayload = (await longTokenResponse.json().catch(() => null)) as
            | { access_token?: string }
            | null;
          if (longTokenPayload?.access_token) {
            finalAccessToken = longTokenPayload.access_token;
          }
        }
      } catch {
        // Fallback to short-lived token when exchange fails.
      }

      const profile = await threads.getProfile(finalAccessToken);
      const followersCount = await threads.getFollowersCount(finalAccessToken, profile.id);

      await storage.updateUserThreadsCredentials(jwtPayload.userId, {
        threadsAppId: appId,
        threadsAppSecret: appSecret,
        threadsAccessToken: finalAccessToken,
        threadsUsername: profile.username,
        threadsProfilePicUrl: profile.threads_profile_picture_url,
        threadsFollowerCount: followersCount,
      });

      return res.redirect("/settings?oauth=success");
    } catch {
      return res.redirect("/settings?error=oauth_failed");
    }
  });

  // â”€â”€ Profile & Posts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  app.get("/api/profile", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user?.threadsAccessToken) return res.status(401).json({ error: "NO_TOKEN" });
    try {
      const profile = await threads.getProfile(user.threadsAccessToken);
      const liveFollowers = await threads.getFollowersCount(user.threadsAccessToken, profile.id);
      const followersCount = liveFollowers ?? user.threadsFollowerCount ?? undefined;

      if (typeof liveFollowers === "number" && liveFollowers !== user.threadsFollowerCount) {
        await storage.updateUserThreadsCredentials(userId, { threadsFollowerCount: liveFollowers });
      }

      res.json({ ...profile, followers_count: followersCount });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/ai/providers", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const providers = getConfiguredAiProviders(user).map((provider) => ({
      provider: provider.provider,
      label: provider.label,
      models: provider.models,
      defaultModel: provider.defaultModel,
    }));
    res.json(providers);
  });

  app.get("/api/ai/usage", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const usage = await storage.getUserAiUsage(userId);
    const now = new Date();
    const used =
      usage.aiRequestsResetAt && isSameUtcDay(usage.aiRequestsResetAt, now)
        ? usage.aiRequestsToday
        : 0;
    const plan = usage.plan === "pro" ? "pro" : "free";
    const unlimited = plan === "pro" || hasAnyUserProvidedAiKey(user);

    res.json({
      plan,
      used,
      limit: FREE_DAILY_AI_LIMIT,
      unlimited,
    });
  });

  app.patch("/api/admin/set-plan", requireAuth, async (req, res) => {
    const requester = getUser(req);
    const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    if (!adminEmail || requester.email.toLowerCase() !== adminEmail) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    const targetEmail = typeof req.body?.targetEmail === "string" ? req.body.targetEmail.trim() : "";
    const rawPlan = typeof req.body?.plan === "string" ? req.body.plan.trim().toLowerCase() : "";
    const plan = rawPlan === "free" || rawPlan === "pro" ? rawPlan : null;
    if (!targetEmail || !plan) {
      return res.status(400).json({ error: "targetEmail and valid plan are required" });
    }

    const targetUser = await storage.getUserByEmail(targetEmail);
    if (!targetUser) return res.status(404).json({ error: "Target user not found" });

    await storage.setUserPlan(targetUser.id, plan);
    res.json({ success: true });
  });

  app.get("/api/ai/keys", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      openaiConfigured: !!normalizeApiKey(user.aiOpenaiApiKey),
      anthropicConfigured: !!normalizeApiKey(user.aiAnthropicApiKey),
      geminiConfigured: !!normalizeApiKey(user.aiGoogleApiKey),
      perplexityConfigured: !!normalizeApiKey(user.aiPerplexityApiKey),
    });
  });

  app.patch("/api/ai/keys", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const updates: {
      aiOpenaiApiKey?: string | null;
      aiAnthropicApiKey?: string | null;
      aiGoogleApiKey?: string | null;
      aiPerplexityApiKey?: string | null;
    } = {};

    const applyKeyUpdate = (payloadKey: string, targetKey: keyof typeof updates) => {
      if (!(payloadKey in (req.body || {}))) return;
      const raw = (req.body as any)[payloadKey];
      if (raw == null || raw === "") {
        updates[targetKey] = null;
        return;
      }
      const normalized = normalizeApiKey(raw);
      if (!normalized) {
        updates[targetKey] = null;
        return;
      }
      updates[targetKey] = normalized;
    };

    applyKeyUpdate("openaiApiKey", "aiOpenaiApiKey");
    applyKeyUpdate("anthropicApiKey", "aiAnthropicApiKey");
    applyKeyUpdate("geminiApiKey", "aiGoogleApiKey");
    applyKeyUpdate("perplexityApiKey", "aiPerplexityApiKey");

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No key updates provided" });
    }

    await storage.updateUserAiKeys(userId, updates);
    const refreshed = await storage.getUserById(userId);
    if (!refreshed) return res.status(404).json({ error: "User not found" });

    res.json({
      success: true,
      keys: {
        openaiConfigured: !!normalizeApiKey(refreshed.aiOpenaiApiKey),
        anthropicConfigured: !!normalizeApiKey(refreshed.aiAnthropicApiKey),
        geminiConfigured: !!normalizeApiKey(refreshed.aiGoogleApiKey),
        perplexityConfigured: !!normalizeApiKey(refreshed.aiPerplexityApiKey),
      },
    });
  });

  app.post("/api/ai/chat", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const rawProvider = typeof req.body?.provider === "string" ? req.body.provider : "";
    const provider = (Object.keys(AI_PROVIDER_CATALOG) as AiProvider[]).find((p) => p === rawProvider);
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!provider) return res.status(400).json({ error: "Invalid provider" });
    if (!message) return res.status(400).json({ error: "Message is required" });
    if (message.length > 4000) return res.status(400).json({ error: "Message too long (max 4000 chars)" });

    const catalog = AI_PROVIDER_CATALOG[provider];
    const userProviderApiKey = getUserProviderApiKey(user, provider);
    const configuredKey = userProviderApiKey || getEnvKeyValue(catalog.envKeys);
    if (!configuredKey) {
      return res.status(400).json({ error: `${provider} is not configured. Add key in Dashboard or server env.` });
    }
    const usingServerKey = !userProviderApiKey;

    if (usingServerKey) {
      const usage = await storage.getUserAiUsage(userId);
      const now = new Date();
      const used =
        usage.aiRequestsResetAt && isSameUtcDay(usage.aiRequestsResetAt, now)
          ? usage.aiRequestsToday
          : 0;
      const plan = usage.plan === "pro" ? "pro" : "free";
      if (plan !== "pro" && used >= FREE_DAILY_AI_LIMIT) {
        return res.status(429).json({
          error: "DAILY_LIMIT_REACHED",
          message: "You've used all 10 free AI requests today. Upgrade to Pro for unlimited access.",
          limit: FREE_DAILY_AI_LIMIT,
          used,
          resetsAt: getNextUtcMidnight(now).toISOString(),
        });
      }
    }

    const requestedModel = typeof req.body?.model === "string" ? req.body.model : "";
    const model = catalog.models.includes(requestedModel) ? requestedModel : catalog.defaultModel;
    const history = sanitizeAiHistory(req.body?.history);

    try {
      let reply = "";
      if (provider === "openai") {
        reply = await callOpenAi(configuredKey, model, history, message);
      } else if (provider === "anthropic") {
        reply = await callAnthropic(configuredKey, model, history, message);
      } else if (provider === "gemini") {
        reply = await callGemini(configuredKey, model, history, message);
      } else if (provider === "perplexity") {
        reply = await callPerplexity(configuredKey, model, history, message);
      }

      const normalizedReply = reply?.trim();
      if (!normalizedReply) {
        return res.status(502).json({ error: "Provider returned empty response" });
      }

      if (usingServerKey) {
        await storage.incrementAiUsage(userId);
      }

      res.json({ provider, model, reply: normalizedReply });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "AI request failed" });
    }
  });

  app.get("/api/posts/recent", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user?.threadsAccessToken) return res.status(401).json({ error: "NO_TOKEN" });
    try {
      const profile = await threads.getProfile(user.threadsAccessToken);
      const posts = await threads.getUserPosts(user.threadsAccessToken, profile.id);
      const postIds = posts
        .map((post: any) => (typeof post?.id === "string" ? post.id : ""))
        .filter(Boolean);
      const metadata = await storage.getPostMetadataByThreadsIds(userId, postIds);
      const metadataById = new Map(metadata.map((item) => [item.threadsPostId, item]));

      const mergedPosts = posts.map((post: any) => {
        const meta = typeof post?.id === "string" ? metadataById.get(post.id) : undefined;
        const apiTopicTag =
          typeof post?.topic_tag === "string"
            ? post.topic_tag
            : typeof post?.topicTag === "string"
              ? post.topicTag
              : null;
        return {
          ...post,
          appTag: meta?.appTag || null,
          internalTopicTag: meta?.topicTag || null,
          topicTag: apiTopicTag || meta?.topicTag || null,
        };
      });
      res.json(mergedPosts);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/posts/publish", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user?.threadsAccessToken) return res.status(401).json({ error: "NO_TOKEN", message: "Connect your Threads account first" });
    const { content, mediaUrl, mediaType, topicTag, appTag: rawAppTag } = req.body;
    if (!content) return res.status(400).json({ error: "Content is required" });
    try {
      const appTag = normalizeAppTag(rawAppTag) || null;
      const profile = await threads.getProfile(user.threadsAccessToken);
      const resolvedTopicTag = topicTag || user.defaultTopic || undefined;
      const postId = await threads.postThread(user.threadsAccessToken, profile.id, content, {
        imageUrl: mediaType === "IMAGE" ? mediaUrl : undefined,
        videoUrl: mediaType === "VIDEO" ? mediaUrl : undefined,
        topicTag: resolvedTopicTag,
      });
      const publishedAt = new Date();
      const dnaSignals = extractDnaSignals(content, publishedAt, mediaUrl || null);
      await storage.upsertPostMetadata(userId, {
        threadsPostId: postId,
        appTag,
        topicTag: resolvedTopicTag || null,
        contentPreview: typeof content === "string" ? content.slice(0, 280) : null,
      });
      // Save to scheduledPosts for tracking
      console.log("[publish] saving appTag:", appTag, "for post:", postId);
      const createdPost = await storage.createScheduledPost(userId, {
        content,
        scheduledAt: publishedAt,
        topicTag: resolvedTopicTag || null,
        mediaUrl: mediaUrl || null,
        mediaType: mediaType || "TEXT",
        appTag,
        ...dnaSignals,
        status: "published",
        threadsPostId: postId,
      } as any);
      scheduleInsightsRefresh(user.threadsAccessToken, createdPost.id, postId);
      res.json({ success: true, postId, appTag });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // âœ… NEW: Repost
  app.post("/api/posts/:postId/repost", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user?.threadsAccessToken) return res.status(401).json({ error: "NO_TOKEN" });
    const postId = Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId;
    try {
      const profile = await threads.getProfile(user.threadsAccessToken);
      const repostId = await threads.repostThread(user.threadsAccessToken, profile.id, postId);
      res.json({ success: true, repostId });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // âœ… NEW: Quote post
  app.post("/api/posts/:postId/quote", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user?.threadsAccessToken) return res.status(401).json({ error: "NO_TOKEN" });
    const { content, topicTag } = req.body;
    if (!content) return res.status(400).json({ error: "Content is required" });
    const postId = Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId;
    try {
      const profile = await threads.getProfile(user.threadsAccessToken);
      const quoteId = await threads.quoteThread(
        user.threadsAccessToken, profile.id, content, postId,
        topicTag || user.defaultTopic || undefined
      );
      res.json({ success: true, quoteId });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // âœ… NEW: Per-post insights
  app.get("/api/posts/:postId/insights", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user?.threadsAccessToken) return res.status(401).json({ error: "NO_TOKEN" });
    try {
      const postId = Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId;
      const insights = await threads.getPostInsights(user.threadsAccessToken, postId);
      res.json(insights);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // âœ… NEW: Account-level analytics
  app.get("/api/analytics", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user?.threadsAccessToken) return res.status(401).json({ error: "NO_TOKEN" });
    try {
      const since = normalizeInsightsTimeParam(req.query.since);
      const until = normalizeInsightsTimeParam(req.query.until);
      const postsLimit = normalizePostsLimit(req.query.postsLimit);
      const summaryOnly = normalizeBooleanFlag(req.query.summaryOnly);
      const profile = await threads.getProfile(user.threadsAccessToken);
      const accountInsights = await threads.getAccountInsights(user.threadsAccessToken, profile.id, {
        since,
        until,
      });
      const recentPosts = summaryOnly ? [] : await threads.getUserPosts(user.threadsAccessToken, profile.id, postsLimit);

      const rangeFollowersCount = (since || until)
        ? await threads.getFollowersCountInRange(user.threadsAccessToken, profile.id, { since, until })
        : undefined;
      const followersCount = rangeFollowersCount ?? await threads.getFollowersCount(user.threadsAccessToken, profile.id);

      if (summaryOnly) {
        return res.json({
          account: { ...profile, ...accountInsights, followers_count: followersCount },
          posts: [],
        });
      }

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

  // â”€â”€ Scheduling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  app.get("/api/analytics/persona", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user?.threadsAccessToken) return res.status(401).json({ error: "NO_TOKEN" });

    const minFollowersRequired = 100;
    try {
      const profile = await threads.getProfile(user.threadsAccessToken);
      const followersCount = await threads.getFollowersCount(user.threadsAccessToken, profile.id);

      if (typeof followersCount === "number" && followersCount < minFollowersRequired) {
        return res.json({
          followersCount,
          minFollowersRequired,
          eligible: false,
          reason: "FOLLOWERS_LT_100",
          demographics: null,
          mapping: null,
        });
      }

      let countries: threads.FollowerDemographicEntry[] = [];
      let cities: threads.FollowerDemographicEntry[] = [];
      let ages: threads.FollowerDemographicEntry[] = [];
      let genders: threads.FollowerDemographicEntry[] = [];
      try {
        [countries, cities, ages, genders] = await Promise.all([
          threads.getFollowerDemographics(user.threadsAccessToken, profile.id, "country"),
          threads.getFollowerDemographics(user.threadsAccessToken, profile.id, "city"),
          threads.getFollowerDemographics(user.threadsAccessToken, profile.id, "age"),
          threads.getFollowerDemographics(user.threadsAccessToken, profile.id, "gender"),
        ]);
      } catch (err: any) {
        const message = String(err?.message || "");
        const lower = message.toLowerCase();
        if (
          lower.includes("threads_manage_insights") ||
          lower.includes("missing permissions") ||
          lower.includes("permission")
        ) {
          return res.json({
            followersCount,
            minFollowersRequired,
            eligible: false,
            reason: "MISSING_PERMISSION",
            errorMessage: message,
            demographics: null,
            mapping: null,
          });
        }
        if (lower.includes("100 followers")) {
          return res.json({
            followersCount,
            minFollowersRequired,
            eligible: false,
            reason: "FOLLOWERS_LT_100",
            errorMessage: message,
            demographics: null,
            mapping: null,
          });
        }
        throw err;
      }

      const demographics = { countries, cities, ages, genders };
      const hasAnyDemographics = [countries, cities, ages, genders].some((list) => list.length > 0);
      if (!hasAnyDemographics) {
        return res.json({
          followersCount,
          minFollowersRequired,
          eligible: true,
          reason: "NO_DATA",
          demographics,
          mapping: null,
        });
      }

      const posts = await threads.getUserPosts(user.threadsAccessToken, profile.id, 50);
      const postsForScoring = posts.slice(0, 40);
      const scoredPosts = await Promise.all(
        postsForScoring.map(async (post: any) => {
          let insights: Awaited<ReturnType<typeof threads.getPostInsights>> | null = null;
          try {
            insights = await threads.getPostInsights(user.threadsAccessToken!, post.id);
          } catch {
            insights = null;
          }
          const views = Number(insights?.views ?? post.views ?? 0);
          const likes = Number(insights?.likes ?? post.like_count ?? 0);
          const replies = Number(insights?.replies ?? post.replies_count ?? 0);
          const reposts = Number(insights?.reposts ?? post.repost_count ?? 0);
          const quotes = Number(insights?.quotes ?? post.quote_count ?? 0);

          // Weighted with log(views) so likes/replies/reposts still matter.
          const score = Math.round(
            Math.log10(Math.max(views, 0) + 1) * 22 +
            likes * 3.2 +
            replies * 3.8 +
            reposts * 4.2 +
            quotes * 4.2,
          );

          return {
            id: String(post.id),
            text: typeof post.text === "string" ? post.text : "",
            timestamp: post.timestamp,
            permalink: typeof post.permalink === "string" ? post.permalink : null,
            score,
            metrics: { views, likes, replies, reposts, quotes },
          };
        }),
      );

      scoredPosts.sort((a, b) => b.score - a.score);
      const topPosts = scoredPosts.slice(0, 5);
      const recommendedPostIds = topPosts.slice(0, 3).map((post) => post.id);

      const buildSegments = (
        segmentType: "country" | "city" | "age" | "gender",
        values: threads.FollowerDemographicEntry[],
        topN: number,
      ) => {
        const total = values.reduce((sum, item) => sum + item.value, 0);
        return values.slice(0, topN).map((item) => ({
          segmentType,
          label: item.label,
          value: item.value,
          sharePct: total > 0 ? Math.round((item.value / total) * 1000) / 10 : 0,
          recommendedPostIds,
        }));
      };

      const segments = [
        ...buildSegments("country", countries, 2),
        ...buildSegments("city", cities, 2),
        ...buildSegments("age", ages, 2),
        ...buildSegments("gender", genders, 2),
      ];

      res.json({
        followersCount,
        minFollowersRequired,
        eligible: true,
        demographics,
        mapping: {
          mode: "estimated_global",
          disclaimer:
            "Threads API does not expose direct per-segment post performance. Recommendations below reuse top overall posts.",
          segments,
          posts: topPosts,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message || err) });
    }
  });
  app.get("/api/reply-center", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user?.threadsAccessToken) return res.status(401).json({ error: "NO_TOKEN" });

    try {
      const days = normalizeReplyCenterDays(req.query.days);
      const postsLimit = normalizeReplyCenterPostsLimit(req.query.postsLimit);
      const repliesPerPost = normalizeReplyCenterRepliesPerPost(req.query.repliesPerPost);
      const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;

      const profile = await threads.getProfile(user.threadsAccessToken);
      const posts = await threads.getUserPosts(user.threadsAccessToken, profile.id, postsLimit);
      const quota = await threads.getReplyQuotaUsage(user.threadsAccessToken, profile.id);

      const conversations = await Promise.all(
        posts.map(async (post: any) => {
          try {
            const replies = await threads.getConversationReplies(user.threadsAccessToken!, post.id, repliesPerPost);
            return { post, replies };
          } catch {
            try {
              const replies = await threads.getReplies(user.threadsAccessToken!, post.id);
              return { post, replies };
            } catch {
              return { post, replies: [] };
            }
          }
        }),
      );

      const normalized = conversations.flatMap(({ post, replies }) =>
        (replies || [])
          .map((reply: any) => {
            const timestampMs = toTimestampMs(reply.timestamp);
            if (timestampMs == null || timestampMs < sinceMs) return null;
            const username = typeof reply.username === "string" ? reply.username : "unknown";
            const repliedToId = typeof reply.replied_to?.id === "string" ? reply.replied_to.id : null;
            const isReply = reply.is_reply === true || !!repliedToId;
            if (!isReply) return null;
            const rootPostId = typeof reply.root_post?.id === "string" ? reply.root_post.id : post.id;
            const hideRaw = String(reply.hide_status || "").toUpperCase();
            const hidden = hideRaw === "HIDDEN" || hideRaw === "HIDE";
            const toxicity = calculateToxicityRisk(reply.text);

            return {
              id: String(reply.id),
              text: typeof reply.text === "string" ? reply.text : "",
              timestamp: reply.timestamp,
              timestampMs,
              username,
              profilePictureUrl: typeof reply.profile_picture_url === "string" ? reply.profile_picture_url : null,
              permalink: typeof reply.permalink === "string" ? reply.permalink : null,
              repliedToId,
              rootPostId,
              isReplyOwnedByMe: !!reply.is_reply_owned_by_me,
              hideStatus: hideRaw || "UNKNOWN",
              isHidden: hidden,
              toxicityScore: toxicity.score,
              toxicityLevel: toxicity.level,
              post: {
                id: post.id,
                text: typeof post.text === "string" ? post.text : "",
                timestamp: post.timestamp,
                permalink: typeof post.permalink === "string" ? post.permalink : null,
              },
            };
          })
          .filter(Boolean),
      ) as Array<{
        id: string;
        text: string;
        timestamp: string;
        timestampMs: number;
        username: string;
        profilePictureUrl: string | null;
        permalink: string | null;
        repliedToId: string | null;
        rootPostId: string;
        isReplyOwnedByMe: boolean;
        hideStatus: string;
        isHidden: boolean;
        toxicityScore: number;
        toxicityLevel: "low" | "medium" | "high";
        post: { id: string; text: string; timestamp: string; permalink: string | null };
      }>;

      normalized.sort((a, b) => a.timestampMs - b.timestampMs);
      const itemById = new Map(normalized.map((item) => [item.id, item]));
      const isReplyToMe = (item: { repliedToId: string | null; post: { id: string } }) => {
        if (item.repliedToId === item.post.id) return true;
        const repliedToItem = item.repliedToId ? itemById.get(item.repliedToId) : undefined;
        return !!repliedToItem?.isReplyOwnedByMe;
      };

      const incoming = normalized.filter((item) => !item.isReplyOwnedByMe && isReplyToMe(item));
      const ownerRepliesByParent = new Map<string, number[]>();
      for (const item of normalized) {
        if (!item.isReplyOwnedByMe || !item.repliedToId) continue;
        const bucket = ownerRepliesByParent.get(item.repliedToId) || [];
        bucket.push(item.timestampMs);
        ownerRepliesByParent.set(item.repliedToId, bucket);
      }
      for (const value of Array.from(ownerRepliesByParent.values())) {
        value.sort((a, b) => a - b);
      }

      const authorCounts = new Map<string, number>();
      for (const item of incoming) {
        authorCounts.set(item.username, (authorCounts.get(item.username) || 0) + 1);
      }

      const oneHourMs = 60 * 60 * 1000;
      const oneDayMs = 24 * oneHourMs;
      const nowMs = Date.now();
      let answeredCount = 0;
      let totalResponseMs = 0;
      let repliedWithin1HourCount = 0;
      let unansweredOver1Hour = 0;
      let unansweredOver24Hours = 0;

      const inbox = normalized
        .map((item) => {
          const repliedToItem = item.repliedToId ? itemById.get(item.repliedToId) : undefined;
          const repliedToUsername = repliedToItem?.username || null;
          const isDirectReplyToPost = item.repliedToId === item.post.id;
          const isReplyToMeValue = isDirectReplyToPost || !!repliedToItem?.isReplyOwnedByMe;

          if (item.isReplyOwnedByMe) {
            return {
              ...item,
              repliedToUsername,
              isDirectReplyToPost,
              isReplyToMe: true,
              responseTimeMs: null,
              firstResponseAt: null,
              respondedWithin1Hour: false,
              isUnanswered: false,
              highFollowerAuthorProxy: false,
              authorReplyCountInWindow: 0,
            };
          }

          const responseCandidates = ownerRepliesByParent.get(item.id) || [];
          const firstResponseMs = responseCandidates.find((candidate) => candidate >= item.timestampMs) ?? null;
          const responseTimeMs = firstResponseMs == null ? null : firstResponseMs - item.timestampMs;
          const respondedWithin1Hour = responseTimeMs != null && responseTimeMs <= oneHourMs;
          const isUnanswered = firstResponseMs == null;
          const authorReplyCountInWindow = isReplyToMeValue ? (authorCounts.get(item.username) || 0) : 0;
          const highFollowerAuthorProxy = authorReplyCountInWindow >= 3;

          if (isReplyToMeValue && isUnanswered && nowMs - item.timestampMs > oneHourMs) unansweredOver1Hour++;
          if (isReplyToMeValue && isUnanswered && nowMs - item.timestampMs > oneDayMs) unansweredOver24Hours++;

          if (isReplyToMeValue && responseTimeMs != null) {
            answeredCount++;
            totalResponseMs += responseTimeMs;
            if (respondedWithin1Hour) repliedWithin1HourCount++;
          }

          return {
            ...item,
            repliedToUsername,
            isDirectReplyToPost,
            isReplyToMe: isReplyToMeValue,
            responseTimeMs,
            firstResponseAt: firstResponseMs == null ? null : new Date(firstResponseMs).toISOString(),
            respondedWithin1Hour,
            isUnanswered,
            highFollowerAuthorProxy,
            authorReplyCountInWindow,
          };
        })
        .sort((a, b) => b.timestampMs - a.timestampMs)
        .slice(0, 1000);

      const totalIncomingReplies = incoming.length;
      const unansweredReplies = Math.max(totalIncomingReplies - answeredCount, 0);
      const avgFirstResponseTimeMs = answeredCount > 0 ? Math.round(totalResponseMs / answeredCount) : null;
      const repliedWithin1HourPercent =
        answeredCount > 0 ? Math.round((repliedWithin1HourCount / answeredCount) * 1000) / 10 : 0;

      const postReplyCounts = new Map<string, number>();
      for (const item of inbox) {
        postReplyCounts.set(item.post.id, (postReplyCounts.get(item.post.id) || 0) + 1);
      }

      const topAuthors = Array.from(authorCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([username, count]) => ({ username, count }));

      res.json({
        meta: {
          days,
          postsLimit,
          repliesPerPost,
          since: new Date(sinceMs).toISOString(),
        },
        quota,
        sla: {
          totalIncomingReplies,
          answeredReplies: answeredCount,
          unansweredReplies,
          avgFirstResponseTimeMs,
          repliedWithin1HourPercent,
          unansweredOver1Hour,
          unansweredOver24Hours,
        },
        posts: posts.map((post: any) => ({
          id: post.id,
          text: typeof post.text === "string" ? post.text : "",
          timestamp: post.timestamp,
          permalink: typeof post.permalink === "string" ? post.permalink : null,
          replyCountInWindow: postReplyCounts.get(post.id) || 0,
        })),
        topAuthors,
        inbox,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/reply-center/:replyId/hide", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user?.threadsAccessToken) return res.status(401).json({ error: "NO_TOKEN" });

    const hideRaw = req.body?.hide;
    const hide = typeof hideRaw === "boolean" ? hideRaw : normalizeBooleanFlag(String(hideRaw));
    try {
      const replyId = String(req.params.replyId || "");
      if (!replyId) return res.status(400).json({ error: "replyId required" });
      await threads.setReplyHiddenStatus(user.threadsAccessToken, replyId, hide);
      res.json({ success: true, hide });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/reply-center/:replyId/reply", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user?.threadsAccessToken) return res.status(401).json({ error: "NO_TOKEN" });
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    if (!content) return res.status(400).json({ error: "Content required" });
    if (content.length > 500) return res.status(400).json({ error: "Content exceeds 500 characters" });

    try {
      const profile = await threads.getProfile(user.threadsAccessToken);
      const parentReplyId = String(req.params.replyId || "");
      if (!parentReplyId) return res.status(400).json({ error: "replyId required" });
      const replyId = await threads.postThread(user.threadsAccessToken, profile.id, content, {
        replyToId: parentReplyId,
        topicTag: req.body?.topicTag || user.defaultTopic || undefined,
      });
      res.json({ success: true, replyId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/posts/schedule", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    try {
      const scheduledAtInput = req.body?.scheduledAt;
      const scheduledAt = new Date(scheduledAtInput);
      if (!scheduledAtInput || Number.isNaN(scheduledAt.getTime())) {
        return res.status(400).json({ error: "Invalid scheduledAt value" });
      }

      const post = await storage.createScheduledPost(userId, {
        ...req.body,
        scheduledAt,
        appTag: normalizeAppTag(req.body?.appTag) || null,
      });
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
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const updates = { ...(req.body || {}) } as Record<string, unknown>;
      if (updates.scheduledAt != null) {
        const parsed = new Date(String(updates.scheduledAt));
        if (Number.isNaN(parsed.getTime())) {
          return res.status(400).json({ error: "Invalid scheduledAt value" });
        }
        updates.scheduledAt = parsed;
      }
      const post = await storage.updateScheduledPost(id, updates);
      res.json(post);
    } catch (err: any) { res.status(400).json({ error: err.message }); }
  });

  app.delete("/api/posts/scheduled/:id", requireAuth, async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await storage.deleteScheduledPost(id);
    res.json({ success: true });
  });

  // Get all unique tags for current user
  app.get("/api/posts/tags", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const tags = await storage.getUserAppTags(userId);
    res.json(tags);
  });

  // Get posts filtered by tag (optional ?tag= query param)
  app.get("/api/posts/my-content", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const tag = req.query.tag as string | undefined;
    const posts = await storage.getPostsByAppTag(userId, tag || null);
    res.json(posts);
  });

  app.get("/api/posts/deleted", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const posts = await storage.getDeletedPosts(userId);
    res.json(posts);
  });

  app.get("/api/posts/dna-data", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const posts = await storage.getPostsWithDnaData(userId);
    res.json({
      count: posts.length,
      ready: posts.length >= 15,
      posts,
    });
  });

  app.post("/api/posts/refresh-insights", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user?.threadsAccessToken) return res.status(401).json({ error: "NO_TOKEN" });

    try {
      const candidates = await storage.getPostsNeedingInsightsRefresh(userId);
      const targets = candidates.slice(0, 20);
      let refreshed = 0;

      for (const post of targets) {
        if (!post.threadsPostId) continue;
        try {
          await refreshScheduledPostInsights(user.threadsAccessToken, post.id, post.threadsPostId);
          refreshed++;
        } catch (err) {
          if (isThreadsMissingPostError(err)) {
            await storage.markPostDeleted(post.id, userId);
          }
          // Best-effort per-post refresh, continue remaining posts.
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      res.json({ refreshed, total: targets.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/posts/tag-insights", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user?.threadsAccessToken) return res.status(401).json({ error: "NO_TOKEN" });

    const tag = req.query.tag as string | undefined;
    if (!tag) return res.status(400).json({ error: "tag param required" });

    try {
      const posts = await storage.getPostsByAppTag(userId, tag);
      const postsWithThreadsId = posts.filter((p) => p.threadsPostId);

      const insightResults = await Promise.all(
        postsWithThreadsId.map(async (post) => {
          try {
            const insights = await threads.getPostInsights(
              user.threadsAccessToken!,
              post.threadsPostId!,
            );
            return { post, insights };
          } catch {
            return { post, insights: null };
          }
        }),
      );

      const totals = insightResults.reduce(
        (acc, { insights }) => {
          if (!insights) return acc;
          return {
            views: acc.views + (Number(insights.views) || 0),
            likes: acc.likes + (Number(insights.likes) || 0),
            replies: acc.replies + (Number(insights.replies) || 0),
            reposts: acc.reposts + (Number(insights.reposts) || 0),
            quotes: acc.quotes + (Number(insights.quotes) || 0),
          };
        },
        { views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0 },
      );

      const postsWithInsights = posts.map((post) => {
        const match = insightResults.find((r) => r.post.id === post.id);
        return { ...post, insights: match?.insights || null };
      });

      const bestPost =
        postsWithInsights
          .filter((p) => p.insights?.views)
          .sort(
            (a, b) =>
              (Number(b.insights?.views) || 0) - (Number(a.insights?.views) || 0),
          )[0] || null;

      const postsWithData = insightResults.filter((r) => r.insights).length;
      const averages =
        postsWithData > 0
          ? {
              views: Math.round(totals.views / postsWithData),
              likes: Math.round(totals.likes / postsWithData),
              replies: Math.round(totals.replies / postsWithData),
            }
          : null;

      res.json({
        tag,
        totalPosts: posts.length,
        postsWithInsights: postsWithData,
        totals,
        averages,
        bestPost: bestPost
          ? {
              content: bestPost.content,
              threadsPostId: bestPost.threadsPostId,
              views: bestPost.insights?.views,
              likes: bestPost.insights?.likes,
            }
          : null,
        posts: postsWithInsights,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/posts/:postId", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const postId = Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId;

    const user = await storage.getUserById(userId);
    const activePosts = await storage.getPostsByAppTag(userId, null);
    const deletedPosts = await storage.getDeletedPosts(userId);
    const post = activePosts.find((p) => p.id === postId) || deletedPosts.find((p) => p.id === postId);

    if (!post) return res.status(404).json({ error: "Post not found" });

    let deletedFromThreads = false;
    if (post.threadsPostId && user?.threadsAccessToken) {
      try {
        await threads.deletePost(user.threadsAccessToken, post.threadsPostId);
        deletedFromThreads = true;
      } catch (err) {
        if (isAcceptableDeleteError(err)) {
          deletedFromThreads = true;
        }
      }
    }

    await storage.markPostDeleted(post.id, userId);
    res.json({ success: true, deletedFromThreads });
  });

  // â”€â”€ Bulk Queues â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await storage.updateBulkQueue(id, req.body);
    res.json({ success: true });
  });

  app.delete("/api/bulk-queues/:id", requireAuth, async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await storage.deleteBulkQueue(id);
    res.json({ success: true });
  });

  // â”€â”€ Follow-Ups â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await storage.deleteFollowUpThread(id);
    res.json({ success: true });
  });

  // â”€â”€ Thread Chain â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  app.post("/api/thread-chain", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user?.threadsAccessToken) return res.status(401).json({ error: "NO_TOKEN" });
    const { posts, topicTag } = req.body;
    if (!posts || !Array.isArray(posts) || posts.length === 0)
      return res.status(400).json({ error: "Posts array is required" });
    if (posts.length > 20) return res.status(400).json({ error: "Max 20 posts per chain" });

    const normalizedPosts = posts
      .map((item: any) => {
        if (typeof item === "string") {
          return { content: item, useTopicTag: true };
        }
        if (item && typeof item === "object" && typeof item.content === "string") {
          return { content: item.content, useTopicTag: item.useTopicTag !== false };
        }
        return null;
      })
      .filter(Boolean) as Array<{ content: string; useTopicTag: boolean }>;

    if (normalizedPosts.length === 0) {
      return res.status(400).json({ error: "Posts array is required" });
    }

    const resolvedTopic = topicTag || user.defaultTopic || undefined;
    try {
      const profile = await threads.getProfile(user.threadsAccessToken);
      const publishedIds: string[] = [];
      let previousPostId: string | undefined = undefined;
      let topicTagAppliedCount = 0;
      let topicTagSkippedCount = 0;

      for (let i = 0; i < normalizedPosts.length; i++) {
        const text = normalizedPosts[i].content;
        if (!text?.trim()) continue;
        const applyTopicTag = !!resolvedTopic && !!normalizedPosts[i].useTopicTag;
        let postId: string;
        try {
          postId = await threads.postThread(user.threadsAccessToken, profile.id, text, {
            replyToId: previousPostId,
            topicTag: applyTopicTag ? resolvedTopic : undefined,
          });
        } catch (err: any) {
          const message = String(err?.message || "").toLowerCase();
          const isTopicFallbackCandidate =
            applyTopicTag &&
            !!previousPostId &&
            (message.includes("topic") || message.includes("unsupported") || message.includes("parameter"));

          if (!isTopicFallbackCandidate) {
            throw err;
          }

          postId = await threads.postThread(user.threadsAccessToken, profile.id, text, {
            replyToId: previousPostId,
            topicTag: undefined,
          });
          topicTagSkippedCount++;
        }
        if (applyTopicTag) topicTagAppliedCount++;
        const publishedAt = new Date();
        const dnaSignals = extractDnaSignals(text, publishedAt, null);
        const publishedPost = await storage.createScheduledPost(userId, {
          content: text,
          scheduledAt: publishedAt,
          topicTag: applyTopicTag ? resolvedTopic || null : null,
          mediaUrl: null,
          mediaType: "TEXT",
          status: "published",
          threadsPostId: postId,
          ...dnaSignals,
        } as any);
        scheduleInsightsRefresh(user.threadsAccessToken, publishedPost.id, postId);
        publishedIds.push(postId);
        previousPostId = postId;
        if (i < normalizedPosts.length - 1) await new Promise(r => setTimeout(r, 1500));
      }

      res.json({
        success: true,
        publishedIds,
        count: publishedIds.length,
        topicTagAppliedCount: Math.max(topicTagAppliedCount - topicTagSkippedCount, 0),
        topicTagSkippedCount,
      });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // â”€â”€ Comments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      const postId = Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId;
      const replyId = await threads.postThread(user.threadsAccessToken, profile.id, content, { replyToId: postId });
      res.json({ success: true, replyId });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/comments/:mediaId/like", requireAuth, async (req, res) => {
    const { userId } = getUser(req);
    const user = await storage.getUserById(userId);
    if (!user?.threadsAccessToken) return res.status(401).json({ error: "NO_TOKEN" });
    try {
      const profile = await threads.getProfile(user.threadsAccessToken);
      const mediaId = Array.isArray(req.params.mediaId) ? req.params.mediaId[0] : req.params.mediaId;
      await threads.likePost(user.threadsAccessToken, mediaId, profile.id);
      res.json({ success: true });
    } catch (err: any) {
      const message = String(err?.message || "");
      const lower = message.toLowerCase();
      if (lower.includes("does not support this operation") || lower.includes("unsupported post request")) {
        return res.status(400).json({ error: "LIKE_NOT_SUPPORTED", message });
      }
      res.status(500).json({ error: message });
    }
  });

  return httpServer;
}
