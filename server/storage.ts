import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import { eq, desc, and, lte, sql } from "drizzle-orm";
import {
  scheduledPosts, bulkQueues, bulkQueueItems, followUpThreads,
  type ScheduledPost, type InsertScheduledPost,
  type BulkQueue, type InsertBulkQueue,
  type BulkQueueItem, type InsertBulkQueueItem,
  type FollowUpThread, type InsertFollowUpThread,
  type BulkQueueWithItems,
} from "@shared/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool);

export interface IStorage {
  // Scheduled Posts
  getScheduledPosts(): Promise<ScheduledPost[]>;
  getScheduledPost(id: string): Promise<ScheduledPost | undefined>;
  createScheduledPost(post: InsertScheduledPost): Promise<ScheduledPost>;
  updateScheduledPost(id: string, updates: Partial<ScheduledPost>): Promise<ScheduledPost>;
  deleteScheduledPost(id: string): Promise<void>;
  getPendingDueScheduledPosts(): Promise<ScheduledPost[]>;

  // Bulk Queues
  getBulkQueues(): Promise<BulkQueueWithItems[]>;
  getBulkQueue(id: string): Promise<BulkQueueWithItems | undefined>;
  createBulkQueue(queue: InsertBulkQueue, items: Omit<InsertBulkQueueItem, "queueId">[]): Promise<BulkQueueWithItems>;
  updateBulkQueue(id: string, updates: Partial<BulkQueue>): Promise<void>;
  updateBulkQueueItem(id: string, updates: Partial<BulkQueueItem>): Promise<void>;
  deleteBulkQueue(id: string): Promise<void>;
  getPendingDueBulkItems(): Promise<(BulkQueueItem & { queue: BulkQueue })[]>;

  // Follow-Up Threads
  getFollowUpThreads(): Promise<FollowUpThread[]>;
  createFollowUpThread(followUp: InsertFollowUpThread): Promise<FollowUpThread>;
  updateFollowUpThread(id: string, updates: Partial<FollowUpThread>): Promise<void>;
  deleteFollowUpThread(id: string): Promise<void>;
  getPendingDueFollowUps(): Promise<FollowUpThread[]>;
}

export class DatabaseStorage implements IStorage {
  async getScheduledPosts(): Promise<ScheduledPost[]> {
    return db.select().from(scheduledPosts).orderBy(desc(scheduledPosts.createdAt));
  }

  async getScheduledPost(id: string): Promise<ScheduledPost | undefined> {
    const [post] = await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, id));
    return post;
  }

  async createScheduledPost(post: InsertScheduledPost): Promise<ScheduledPost> {
    const [created] = await db.insert(scheduledPosts).values(post).returning();
    return created;
  }

  async updateScheduledPost(id: string, updates: Partial<ScheduledPost>): Promise<ScheduledPost> {
    const [updated] = await db.update(scheduledPosts).set(updates).where(eq(scheduledPosts.id, id)).returning();
    return updated;
  }

  async deleteScheduledPost(id: string): Promise<void> {
    await db.delete(scheduledPosts).where(eq(scheduledPosts.id, id));
  }

  async getPendingDueScheduledPosts(): Promise<ScheduledPost[]> {
    return db.select().from(scheduledPosts).where(
      and(
        eq(scheduledPosts.status, "pending"),
        lte(scheduledPosts.scheduledAt, new Date())
      )
    );
  }

  async getBulkQueues(): Promise<BulkQueueWithItems[]> {
    const queues = await db.select().from(bulkQueues).orderBy(desc(bulkQueues.createdAt));
    const result: BulkQueueWithItems[] = [];
    for (const queue of queues) {
      const items = await db.select().from(bulkQueueItems)
        .where(eq(bulkQueueItems.queueId, queue.id))
        .orderBy(bulkQueueItems.orderIndex);
      result.push({ ...queue, items });
    }
    return result;
  }

  async getBulkQueue(id: string): Promise<BulkQueueWithItems | undefined> {
    const [queue] = await db.select().from(bulkQueues).where(eq(bulkQueues.id, id));
    if (!queue) return undefined;
    const items = await db.select().from(bulkQueueItems)
      .where(eq(bulkQueueItems.queueId, id))
      .orderBy(bulkQueueItems.orderIndex);
    return { ...queue, items };
  }

  async createBulkQueue(queue: InsertBulkQueue, items: Omit<InsertBulkQueueItem, "queueId">[]): Promise<BulkQueueWithItems> {
    const [created] = await db.insert(bulkQueues).values(queue).returning();
    const insertedItems: BulkQueueItem[] = [];
    for (const item of items) {
      const [insertedItem] = await db.insert(bulkQueueItems).values({ ...item, queueId: created.id }).returning();
      insertedItems.push(insertedItem);
    }
    return { ...created, items: insertedItems };
  }

  async updateBulkQueue(id: string, updates: Partial<BulkQueue>): Promise<void> {
    await db.update(bulkQueues).set(updates).where(eq(bulkQueues.id, id));
  }

  async updateBulkQueueItem(id: string, updates: Partial<BulkQueueItem>): Promise<void> {
    await db.update(bulkQueueItems).set(updates).where(eq(bulkQueueItems.id, id));
  }

  async deleteBulkQueue(id: string): Promise<void> {
    await db.delete(bulkQueues).where(eq(bulkQueues.id, id));
  }

  async getPendingDueBulkItems(): Promise<(BulkQueueItem & { queue: BulkQueue })[]> {
    const now = new Date();
    const items = await db.select({
      item: bulkQueueItems,
      queue: bulkQueues,
    }).from(bulkQueueItems)
      .innerJoin(bulkQueues, eq(bulkQueueItems.queueId, bulkQueues.id))
      .where(
        and(
          eq(bulkQueueItems.status, "pending"),
          lte(bulkQueueItems.scheduledAt, now)
        )
      );
    return items.map(r => ({ ...r.item, queue: r.queue }));
  }

  async getFollowUpThreads(): Promise<FollowUpThread[]> {
    return db.select().from(followUpThreads).orderBy(desc(followUpThreads.createdAt));
  }

  async createFollowUpThread(followUp: InsertFollowUpThread): Promise<FollowUpThread> {
    const [created] = await db.insert(followUpThreads).values(followUp).returning();
    return created;
  }

  async updateFollowUpThread(id: string, updates: Partial<FollowUpThread>): Promise<void> {
    await db.update(followUpThreads).set(updates).where(eq(followUpThreads.id, id));
  }

  async deleteFollowUpThread(id: string): Promise<void> {
    await db.delete(followUpThreads).where(eq(followUpThreads.id, id));
  }

  async getPendingDueFollowUps(): Promise<FollowUpThread[]> {
    return db.select().from(followUpThreads).where(
      and(
        eq(followUpThreads.status, "pending"),
        lte(followUpThreads.scheduledAt, new Date())
      )
    );
  }
}

export const storage = new DatabaseStorage();
