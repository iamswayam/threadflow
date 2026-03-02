import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  threadsAppId: text("threads_app_id"),
  threadsAppSecret: text("threads_app_secret"),
  threadsAccessToken: text("threads_access_token"),
  threadsUsername: text("threads_username"),
  threadsProfilePicUrl: text("threads_profile_pic_url"),
  threadsFollowerCount: integer("threads_follower_count"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const scheduledPosts = pgTable("scheduled_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  mediaUrl: text("media_url"),
  mediaType: text("media_type"),
  scheduledAt: timestamp("scheduled_at").notNull(),
  status: text("status").notNull().default("pending"),
  threadsPostId: text("threads_post_id"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const bulkQueues = pgTable("bulk_queues", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  delayMinutes: integer("delay_minutes").notNull().default(5),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const bulkQueueItems = pgTable("bulk_queue_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  queueId: varchar("queue_id").notNull().references(() => bulkQueues.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  mediaUrl: text("media_url"),
  orderIndex: integer("order_index").notNull(),
  status: text("status").notNull().default("pending"),
  scheduledAt: timestamp("scheduled_at"),
  publishedAt: timestamp("published_at"),
  threadsPostId: text("threads_post_id"),
  errorMessage: text("error_message"),
});

export const followUpThreads = pgTable("follow_up_threads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  originalPostId: text("original_post_id").notNull(),
  originalPostContent: text("original_post_content"),
  content: text("content").notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  status: text("status").notNull().default("pending"),
  threadsReplyId: text("threads_reply_id"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertUserSchema = createInsertSchema(users).pick({ email: true, password: true });
export const insertScheduledPostSchema = createInsertSchema(scheduledPosts).omit({
  id: true, status: true, threadsPostId: true, errorMessage: true, createdAt: true, userId: true,
});
export const insertBulkQueueSchema = createInsertSchema(bulkQueues).omit({
  id: true, status: true, createdAt: true, userId: true,
});
export const insertBulkQueueItemSchema = createInsertSchema(bulkQueueItems).omit({
  id: true, status: true, scheduledAt: true, publishedAt: true, threadsPostId: true, errorMessage: true,
});
export const insertFollowUpThreadSchema = createInsertSchema(followUpThreads).omit({
  id: true, status: true, threadsReplyId: true, errorMessage: true, createdAt: true, userId: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type ScheduledPost = typeof scheduledPosts.$inferSelect;
export type InsertScheduledPost = z.infer<typeof insertScheduledPostSchema>;
export type BulkQueue = typeof bulkQueues.$inferSelect;
export type InsertBulkQueue = z.infer<typeof insertBulkQueueSchema>;
export type BulkQueueItem = typeof bulkQueueItems.$inferSelect;
export type InsertBulkQueueItem = z.infer<typeof insertBulkQueueItemSchema>;
export type FollowUpThread = typeof followUpThreads.$inferSelect;
export type InsertFollowUpThread = z.infer<typeof insertFollowUpThreadSchema>;
export type BulkQueueWithItems = BulkQueue & { items: BulkQueueItem[] };
