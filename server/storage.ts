import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import { eq, desc, and, lte, inArray, isNotNull, isNull, lt, or, ne } from "drizzle-orm";
import {
  users, scheduledPosts, bulkQueues, bulkQueueItems, followUpThreads, postMetadata,
  type User, type InsertUser,
  type ScheduledPost, type InsertScheduledPost,
  type BulkQueue, type InsertBulkQueue,
  type BulkQueueItem, type InsertBulkQueueItem,
  type FollowUpThread, type InsertFollowUpThread,
  type BulkQueueWithItems,
  type PostMetadata,
  type InsertPostMetadata,
} from "@shared/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool);

export interface IStorage {
  createUser(user: { email: string; password: string }): Promise<User>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  updateUserThreadsCredentials(userId: string, data: {
    threadsAppId?: string; threadsAppSecret?: string; threadsAccessToken?: string;
    threadsUsername?: string; threadsProfilePicUrl?: string; threadsFollowerCount?: number;
  }): Promise<User>;
  updateUserAiKeys(userId: string, data: {
    aiOpenaiApiKey?: string | null;
    aiAnthropicApiKey?: string | null;
    aiGoogleApiKey?: string | null;
    aiPerplexityApiKey?: string | null;
  }): Promise<User>;
  incrementAiUsage(userId: string): Promise<number>;
  getUserAiUsage(userId: string): Promise<{
    plan: string;
    aiRequestsToday: number;
    aiRequestsResetAt: Date | null;
  }>;
  setUserPlan(userId: string, plan: "free" | "pro"): Promise<void>;
  updateUserPassword(userId: string, password: string): Promise<void>;
  updateUserDefaultTopic(userId: string, topic: string | null): Promise<User>;
  deleteUser(userId: string): Promise<void>;

  getScheduledPosts(userId: string): Promise<ScheduledPost[]>;
  getScheduledPost(id: string): Promise<ScheduledPost | undefined>;
  createScheduledPost(userId: string, post: InsertScheduledPost): Promise<ScheduledPost>;
  updateScheduledPost(id: string, updates: Partial<ScheduledPost>): Promise<ScheduledPost>;
  deleteScheduledPost(id: string): Promise<void>;
  markPostDeleted(postId: string, userId: string): Promise<void>;
  recoverDeletedPost(postId: string, userId: string): Promise<void>;
  getDeletedPosts(userId: string): Promise<ScheduledPost[]>;
  getPendingDueScheduledPosts(): Promise<(ScheduledPost & { userToken: string | null; userId: string | null })[]>;

  getBulkQueues(userId: string): Promise<BulkQueueWithItems[]>;
  getBulkQueue(id: string): Promise<BulkQueueWithItems | undefined>;
  createBulkQueue(userId: string, queue: InsertBulkQueue, items: Omit<InsertBulkQueueItem, "queueId">[]): Promise<BulkQueueWithItems>;
  updateBulkQueue(id: string, updates: Partial<BulkQueue>): Promise<void>;
  updateBulkQueueItem(id: string, updates: Partial<BulkQueueItem>): Promise<void>;
  deleteBulkQueue(id: string): Promise<void>;
  getPendingDueBulkItems(): Promise<(BulkQueueItem & { queue: BulkQueue; userToken: string | null })[]>;

  getFollowUpThreads(userId: string): Promise<FollowUpThread[]>;
  createFollowUpThread(userId: string, followUp: InsertFollowUpThread): Promise<FollowUpThread>;
  updateFollowUpThread(id: string, updates: Partial<FollowUpThread>): Promise<void>;
  deleteFollowUpThread(id: string): Promise<void>;
  getPendingDueFollowUps(): Promise<(FollowUpThread & { userToken: string | null })[]>;

  upsertPostMetadata(
    userId: string,
    metadata: { threadsPostId: string; appTag?: string | null; topicTag?: string | null; contentPreview?: string | null },
  ): Promise<PostMetadata>;
  getPostMetadataByThreadsIds(userId: string, threadsPostIds: string[]): Promise<PostMetadata[]>;

  getUserAppTags(userId: string): Promise<string[]>;
  getPostsByAppTag(userId: string, appTag: string | null): Promise<ScheduledPost[]>;
  getPostsNeedingInsightsRefresh(userId: string): Promise<ScheduledPost[]>;
  getPostsWithDnaData(userId: string): Promise<ScheduledPost[]>;
}

export class DatabaseStorage implements IStorage {
  private async purgeExpiredDeletedPosts(userId: string): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await db
      .delete(scheduledPosts)
      .where(
        and(
          eq(scheduledPosts.userId, userId),
          eq(scheduledPosts.status, "deleted"),
          isNotNull(scheduledPosts.deletedAt),
          lt(scheduledPosts.deletedAt, cutoff),
        ),
      );
  }

  private isSameUtcDay(a: Date, b: Date): boolean {
    return (
      a.getUTCFullYear() === b.getUTCFullYear() &&
      a.getUTCMonth() === b.getUTCMonth() &&
      a.getUTCDate() === b.getUTCDate()
    );
  }

  async createUser(data: { email: string; password: string }): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }
  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }
  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }
  async updateUserThreadsCredentials(userId: string, data: any): Promise<User> {
    const [user] = await db.update(users).set(data).where(eq(users.id, userId)).returning();
    return user;
  }
  async updateUserAiKeys(userId: string, data: {
    aiOpenaiApiKey?: string | null;
    aiAnthropicApiKey?: string | null;
    aiGoogleApiKey?: string | null;
    aiPerplexityApiKey?: string | null;
  }): Promise<User> {
    const [user] = await db.update(users).set(data).where(eq(users.id, userId)).returning();
    return user;
  }
  async incrementAiUsage(userId: string): Promise<number> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error("User not found");

    const now = new Date();
    const needsReset =
      !user.aiRequestsResetAt || !this.isSameUtcDay(user.aiRequestsResetAt, now);

    const currentCount = needsReset ? 0 : Number(user.aiRequestsToday || 0);
    const nextCount = currentCount + 1;

    const [updated] = await db
      .update(users)
      .set({
        aiRequestsToday: nextCount,
        aiRequestsResetAt: now,
      })
      .where(eq(users.id, userId))
      .returning({ aiRequestsToday: users.aiRequestsToday });

    return updated?.aiRequestsToday ?? nextCount;
  }
  async getUserAiUsage(userId: string): Promise<{
    plan: string;
    aiRequestsToday: number;
    aiRequestsResetAt: Date | null;
  }> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error("User not found");

    return {
      plan: user.plan || "free",
      aiRequestsToday: Number(user.aiRequestsToday || 0),
      aiRequestsResetAt: user.aiRequestsResetAt ?? null,
    };
  }
  async setUserPlan(userId: string, plan: "free" | "pro"): Promise<void> {
    if (plan !== "free" && plan !== "pro") {
      throw new Error("Invalid plan");
    }
    await db.update(users).set({ plan }).where(eq(users.id, userId));
  }
  async updateUserPassword(userId: string, password: string): Promise<void> {
    await db.update(users).set({ password }).where(eq(users.id, userId));
  }
  async updateUserDefaultTopic(userId: string, topic: string | null): Promise<User> {
    const [user] = await db.update(users).set({ defaultTopic: topic }).where(eq(users.id, userId)).returning();
    return user;
  }
  async deleteUser(userId: string): Promise<void> {
    await db.delete(users).where(eq(users.id, userId));
  }

  async getScheduledPosts(userId: string): Promise<ScheduledPost[]> {
    await this.purgeExpiredDeletedPosts(userId);
    return db.select().from(scheduledPosts).where(and(
      eq(scheduledPosts.userId, userId),
      ne(scheduledPosts.status, "deleted"),
    )).orderBy(desc(scheduledPosts.createdAt));
  }
  async getScheduledPost(id: string): Promise<ScheduledPost | undefined> {
    const [post] = await db.select().from(scheduledPosts).where(and(
      eq(scheduledPosts.id, id),
      ne(scheduledPosts.status, "deleted"),
    ));
    return post;
  }
  async createScheduledPost(userId: string, post: InsertScheduledPost): Promise<ScheduledPost> {
    const [created] = await db.insert(scheduledPosts).values({ ...post, userId }).returning();
    return created;
  }
  async updateScheduledPost(id: string, updates: Partial<ScheduledPost>): Promise<ScheduledPost> {
    const [updated] = await db.update(scheduledPosts).set(updates).where(eq(scheduledPosts.id, id)).returning();
    return updated;
  }
  async deleteScheduledPost(id: string): Promise<void> {
    await db.delete(scheduledPosts).where(eq(scheduledPosts.id, id));
  }
  async markPostDeleted(postId: string, userId: string): Promise<void> {
    await db
      .update(scheduledPosts)
      .set({ status: "deleted", deletedAt: new Date() })
      .where(and(
        eq(scheduledPosts.id, postId),
        eq(scheduledPosts.userId, userId),
      ));
  }
  async recoverDeletedPost(postId: string, userId: string): Promise<void> {
    await this.purgeExpiredDeletedPosts(userId);
    await db
      .update(scheduledPosts)
      .set({ status: "published", deletedAt: null })
      .where(and(
        eq(scheduledPosts.id, postId),
        eq(scheduledPosts.userId, userId),
        eq(scheduledPosts.status, "deleted"),
      ));
  }
  async getDeletedPosts(userId: string): Promise<ScheduledPost[]> {
    await this.purgeExpiredDeletedPosts(userId);
    return db
      .select()
      .from(scheduledPosts)
      .where(and(
        eq(scheduledPosts.userId, userId),
        eq(scheduledPosts.status, "deleted"),
      ))
      .orderBy(desc(scheduledPosts.deletedAt))
      .limit(100);
  }
  async getPendingDueScheduledPosts() {
    const rows = await db.select({ post: scheduledPosts, userToken: users.threadsAccessToken, userId: users.id })
      .from(scheduledPosts).leftJoin(users, eq(scheduledPosts.userId, users.id))
      .where(and(
        eq(scheduledPosts.status, "pending"),
        ne(scheduledPosts.status, "deleted"),
        lte(scheduledPosts.scheduledAt, new Date()),
      ));
    return rows.map(r => ({ ...r.post, userToken: r.userToken, userId: r.userId }));
  }

  async getBulkQueues(userId: string): Promise<BulkQueueWithItems[]> {
    const queues = await db.select().from(bulkQueues).where(eq(bulkQueues.userId, userId)).orderBy(desc(bulkQueues.createdAt));
    const result: BulkQueueWithItems[] = [];
    for (const queue of queues) {
      const items = await db.select().from(bulkQueueItems).where(eq(bulkQueueItems.queueId, queue.id)).orderBy(bulkQueueItems.orderIndex);
      result.push({ ...queue, items });
    }
    return result;
  }
  async getBulkQueue(id: string): Promise<BulkQueueWithItems | undefined> {
    const [queue] = await db.select().from(bulkQueues).where(eq(bulkQueues.id, id));
    if (!queue) return undefined;
    const items = await db.select().from(bulkQueueItems).where(eq(bulkQueueItems.queueId, id)).orderBy(bulkQueueItems.orderIndex);
    return { ...queue, items };
  }
  async createBulkQueue(userId: string, queue: InsertBulkQueue, items: Omit<InsertBulkQueueItem, "queueId">[]): Promise<BulkQueueWithItems> {
    const [created] = await db.insert(bulkQueues).values({ ...queue, userId }).returning();
    const insertedItems: BulkQueueItem[] = [];
    for (const item of items) {
      const [inserted] = await db.insert(bulkQueueItems).values({ ...item, queueId: created.id }).returning();
      insertedItems.push(inserted);
    }
    return { ...created, items: insertedItems };
  }
  async updateBulkQueue(id: string, updates: Partial<BulkQueue>): Promise<void> {
    await db.update(bulkQueues).set(updates).where(eq(bulkQueues.id, id));
  }
  async updateBulkQueueItem(id: string, updates: Partial<BulkQueueItem>): Promise<void> {
    const allowed: Array<keyof BulkQueueItem> = [
      "queueId",
      "content",
      "mediaUrl",
      "orderIndex",
      "status",
      "scheduledAt",
      "publishedAt",
      "threadsPostId",
      "errorMessage",
    ];
    const sanitized: Partial<BulkQueueItem> = {};
    for (const key of allowed) {
      if (key in updates) {
        (sanitized as any)[key] = (updates as any)[key];
      }
    }
    if (Object.keys(sanitized).length === 0) return;
    await db.update(bulkQueueItems).set(sanitized).where(eq(bulkQueueItems.id, id));
  }
  async deleteBulkQueue(id: string): Promise<void> {
    await db.delete(bulkQueues).where(eq(bulkQueues.id, id));
  }
  async getPendingDueBulkItems() {
    const rows = await db.select({ item: bulkQueueItems, queue: bulkQueues, userToken: users.threadsAccessToken })
      .from(bulkQueueItems)
      .innerJoin(bulkQueues, eq(bulkQueueItems.queueId, bulkQueues.id))
      .leftJoin(users, eq(bulkQueues.userId, users.id))
      .where(and(eq(bulkQueueItems.status, "pending"), lte(bulkQueueItems.scheduledAt, new Date())));
    return rows.map(r => ({ ...r.item, queue: r.queue, userToken: r.userToken }));
  }

  async getFollowUpThreads(userId: string): Promise<FollowUpThread[]> {
    return db.select().from(followUpThreads).where(eq(followUpThreads.userId, userId)).orderBy(desc(followUpThreads.createdAt));
  }
  async createFollowUpThread(userId: string, followUp: InsertFollowUpThread): Promise<FollowUpThread> {
    const [created] = await db.insert(followUpThreads).values({ ...followUp, userId }).returning();
    return created;
  }
  async updateFollowUpThread(id: string, updates: Partial<FollowUpThread>): Promise<void> {
    await db.update(followUpThreads).set(updates).where(eq(followUpThreads.id, id));
  }
  async deleteFollowUpThread(id: string): Promise<void> {
    await db.delete(followUpThreads).where(eq(followUpThreads.id, id));
  }
  async getPendingDueFollowUps() {
    const rows = await db.select({ followUp: followUpThreads, userToken: users.threadsAccessToken })
      .from(followUpThreads)
      .leftJoin(users, eq(followUpThreads.userId, users.id))
      .where(and(eq(followUpThreads.status, "pending"), lte(followUpThreads.scheduledAt, new Date())));
    return rows.map(r => ({ ...r.followUp, userToken: r.userToken }));
  }

  async upsertPostMetadata(
    userId: string,
    metadata: { threadsPostId: string; appTag?: string | null; topicTag?: string | null; contentPreview?: string | null },
  ): Promise<PostMetadata> {
    const [existing] = await db.select()
      .from(postMetadata)
      .where(and(eq(postMetadata.userId, userId), eq(postMetadata.threadsPostId, metadata.threadsPostId)));

    const updates = {
      appTag: metadata.appTag ?? null,
      topicTag: metadata.topicTag ?? null,
      contentPreview: metadata.contentPreview ?? null,
    };

    if (existing) {
      const [updated] = await db.update(postMetadata)
        .set(updates)
        .where(eq(postMetadata.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(postMetadata)
      .values({
        userId,
        threadsPostId: metadata.threadsPostId,
        ...updates,
      })
      .returning();
    return created;
  }

  async getPostMetadataByThreadsIds(userId: string, threadsPostIds: string[]): Promise<PostMetadata[]> {
    if (!threadsPostIds.length) return [];
    return db.select()
      .from(postMetadata)
      .where(and(eq(postMetadata.userId, userId), inArray(postMetadata.threadsPostId, threadsPostIds)));
  }

  async getUserAppTags(userId: string): Promise<string[]> {
    await this.purgeExpiredDeletedPosts(userId);
    const rows = await db
      .selectDistinct({ appTag: scheduledPosts.appTag })
      .from(scheduledPosts)
      .where(
        and(
          eq(scheduledPosts.userId, userId),
          isNotNull(scheduledPosts.appTag),
          ne(scheduledPosts.status, "deleted"),
        ),
      );
    const allTags = rows
      .flatMap((r) => (r.appTag || "").split(","))
      .map((t) => t.trim())
      .filter(Boolean);
    return Array.from(new Set(allTags)).sort();
  }

  async getPostsByAppTag(
    userId: string,
    appTag: string | null
  ): Promise<ScheduledPost[]> {
    await this.purgeExpiredDeletedPosts(userId);
    const activePublishedPosts = await db
      .select()
      .from(scheduledPosts)
      .where(
        and(
          eq(scheduledPosts.userId, userId),
          eq(scheduledPosts.status, "published"),
          isNotNull(scheduledPosts.threadsPostId),
        ),
      )
      .orderBy(desc(scheduledPosts.createdAt));

    if (appTag) {
      const requestedTag = appTag.trim();
      return activePublishedPosts.filter((p) =>
        p.appTag
          ?.split(",")
          .map((t) => t.trim())
          .includes(requestedTag),
      );
    }
    return activePublishedPosts;
  }

  async getPostsNeedingInsightsRefresh(userId: string): Promise<ScheduledPost[]> {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    return db
      .select()
      .from(scheduledPosts)
      .where(
        and(
          eq(scheduledPosts.userId, userId),
          eq(scheduledPosts.status, "published"),
          ne(scheduledPosts.status, "deleted"),
          isNotNull(scheduledPosts.threadsPostId),
          or(
            isNull(scheduledPosts.insightsFetchedAt),
            lt(scheduledPosts.insightsFetchedAt, sixHoursAgo),
          ),
        ),
      )
      .orderBy(desc(scheduledPosts.createdAt))
      .limit(50);
  }

  async getPostsWithDnaData(userId: string): Promise<ScheduledPost[]> {
    return db
      .select()
      .from(scheduledPosts)
      .where(
        and(
          eq(scheduledPosts.userId, userId),
          eq(scheduledPosts.status, "published"),
          ne(scheduledPosts.status, "deleted"),
          isNotNull(scheduledPosts.threadsPostId),
          isNotNull(scheduledPosts.insightsViews),
        ),
      )
      .orderBy(desc(scheduledPosts.createdAt))
      .limit(200);
  }
}

export const storage = new DatabaseStorage();
