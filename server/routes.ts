import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import * as threads from "./threads";
import { insertScheduledPostSchema, insertBulkQueueSchema, insertFollowUpThreadSchema } from "@shared/schema";
import { z } from "zod";

async function publishScheduledPost(postId: string) {
  const post = await storage.getScheduledPost(postId);
  if (!post || post.status !== "pending") return;

  try {
    const profile = await threads.getProfile();
    const threadId = await threads.postThread(profile.id, post.content, {
      imageUrl: post.mediaType === "IMAGE" ? post.mediaUrl || undefined : undefined,
      videoUrl: post.mediaType === "VIDEO" ? post.mediaUrl || undefined : undefined,
    });
    await storage.updateScheduledPost(postId, { status: "published", threadsPostId: threadId });
  } catch (err: any) {
    const msg = err.message || "Unknown error";
    if (msg === "NO_TOKEN") {
      await storage.updateScheduledPost(postId, { status: "failed", errorMessage: "No API token configured" });
    } else {
      await storage.updateScheduledPost(postId, { status: "failed", errorMessage: msg });
    }
  }
}

function startScheduler() {
  setInterval(async () => {
    try {
      const duePosts = await storage.getPendingDueScheduledPosts();
      for (const post of duePosts) {
        await publishScheduledPost(post.id);
      }

      const dueItems = await storage.getPendingDueBulkItems();
      for (const item of dueItems) {
        try {
          const profile = await threads.getProfile();
          const threadId = await threads.postThread(profile.id, item.content, {
            imageUrl: item.mediaUrl || undefined,
          });
          await storage.updateBulkQueueItem(item.id, {
            status: "sent",
            publishedAt: new Date(),
            threadsPostId: threadId,
          });
        } catch (err: any) {
          await storage.updateBulkQueueItem(item.id, {
            status: "failed",
            errorMessage: err.message || "Unknown error",
          });
        }
      }

      const dueFollowUps = await storage.getPendingDueFollowUps();
      for (const followUp of dueFollowUps) {
        try {
          const profile = await threads.getProfile();
          const replyId = await threads.postThread(profile.id, followUp.content, {
            replyToId: followUp.originalPostId,
          });
          await storage.updateFollowUpThread(followUp.id, {
            status: "published",
            threadsReplyId: replyId,
          });
        } catch (err: any) {
          await storage.updateFollowUpThread(followUp.id, {
            status: "failed",
            errorMessage: err.message || "Unknown error",
          });
        }
      }
    } catch (_) {}
  }, 60_000);
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  startScheduler();

  app.get("/api/status", (_req, res) => {
    res.json({ hasToken: threads.hasToken() });
  });

  app.get("/api/profile", async (_req, res) => {
    try {
      const profile = await threads.getProfile();
      res.json(profile);
    } catch (err: any) {
      if (err.message === "NO_TOKEN") {
        res.status(401).json({ error: "NO_TOKEN", message: "No access token configured" });
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  });

  app.get("/api/posts/recent", async (_req, res) => {
    try {
      const profile = await threads.getProfile();
      const posts = await threads.getUserPosts(profile.id);
      res.json(posts);
    } catch (err: any) {
      if (err.message === "NO_TOKEN") {
        res.status(401).json({ error: "NO_TOKEN" });
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  });

  app.post("/api/posts/publish", async (req, res) => {
    const { content, mediaUrl, mediaType } = req.body;
    if (!content) return res.status(400).json({ error: "Content is required" });
    try {
      const profile = await threads.getProfile();
      const postId = await threads.postThread(profile.id, content, {
        imageUrl: mediaType === "IMAGE" ? mediaUrl : undefined,
        videoUrl: mediaType === "VIDEO" ? mediaUrl : undefined,
      });
      res.json({ success: true, postId });
    } catch (err: any) {
      if (err.message === "NO_TOKEN") {
        res.status(401).json({ error: "NO_TOKEN", message: "No access token configured" });
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  });

  app.post("/api/posts/schedule", async (req, res) => {
    try {
      const data = insertScheduledPostSchema.parse(req.body);
      const post = await storage.createScheduledPost(data);
      res.json(post);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/posts/scheduled", async (_req, res) => {
    const posts = await storage.getScheduledPosts();
    res.json(posts);
  });

  app.patch("/api/posts/scheduled/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const post = await storage.updateScheduledPost(id, req.body);
      res.json(post);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete("/api/posts/scheduled/:id", async (req, res) => {
    await storage.deleteScheduledPost(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/bulk-queues", async (_req, res) => {
    const queues = await storage.getBulkQueues();
    res.json(queues);
  });

  app.post("/api/bulk-queues", async (req, res) => {
    try {
      const { name, delayMinutes, items } = req.body;
      if (!name || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Invalid bulk queue data" });
      }

      const now = new Date();
      const queueItems = items.map((item: any, idx: number) => ({
        content: item.content,
        mediaUrl: item.mediaUrl || null,
        orderIndex: idx,
        scheduledAt: idx === 0 ? now : new Date(now.getTime() + idx * delayMinutes * 60 * 1000),
      }));

      const queue = await storage.createBulkQueue(
        { name, delayMinutes },
        queueItems
      );

      await storage.updateBulkQueue(queue.id, { status: "running" });
      res.json({ ...queue, status: "running" });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete("/api/bulk-queues/:id", async (req, res) => {
    await storage.deleteBulkQueue(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/follow-ups", async (_req, res) => {
    const followUps = await storage.getFollowUpThreads();
    res.json(followUps);
  });

  app.post("/api/follow-ups", async (req, res) => {
    try {
      const data = insertFollowUpThreadSchema.parse(req.body);
      const followUp = await storage.createFollowUpThread(data);
      res.json(followUp);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete("/api/follow-ups/:id", async (req, res) => {
    await storage.deleteFollowUpThread(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/comments", async (req, res) => {
    const { postId } = req.query;
    if (!postId || typeof postId !== "string") {
      return res.status(400).json({ error: "postId is required" });
    }
    try {
      const replies = await threads.getReplies(postId);
      res.json(replies);
    } catch (err: any) {
      if (err.message === "NO_TOKEN") {
        res.status(401).json({ error: "NO_TOKEN" });
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  });

  app.post("/api/comments/:postId/reply", async (req, res) => {
    const { postId } = req.params;
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: "Content is required" });
    try {
      const profile = await threads.getProfile();
      const replyId = await threads.postThread(profile.id, content, { replyToId: postId });
      res.json({ success: true, replyId });
    } catch (err: any) {
      if (err.message === "NO_TOKEN") {
        res.status(401).json({ error: "NO_TOKEN", message: "No access token configured" });
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  });

  app.post("/api/comments/:mediaId/like", async (req, res) => {
    const { mediaId } = req.params;
    try {
      const profile = await threads.getProfile();
      await threads.likePost(mediaId, profile.id);
      res.json({ success: true });
    } catch (err: any) {
      if (err.message === "NO_TOKEN") {
        res.status(401).json({ error: "NO_TOKEN" });
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  });

  return httpServer;
}
