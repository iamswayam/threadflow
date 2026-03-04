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
  aiOpenaiApiKey: text("ai_openai_api_key"),
  aiAnthropicApiKey: text("ai_anthropic_api_key"),
  aiGoogleApiKey: text("ai_google_api_key"),
  aiPerplexityApiKey: text("ai_perplexity_api_key"),
  defaultTopic: text("default_topic"), // âœ… NEW: saved default topic tag
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const postMetadata = pgTable("post_metadata", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  threadsPostId: text("threads_post_id").notNull(),
  appTag: text("app_tag"),
  topicTag: text("topic_tag"),
  contentPreview: text("content_preview"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const scheduledPosts = pgTable("scheduled_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  mediaUrl: text("media_url"),
  mediaType: text("media_type"),
  topicTag: text("topic_tag"), // âœ… NEW: per-post topic tag
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
  topicTag: text("topic_tag"), // âœ… NEW: topic for whole queue
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

// âœ… NEW: Thread chain table â€” series of posts linked as replies
export const threadChains = pgTable("thread_chains", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  topicTag: text("topic_tag"),
  status: text("status").notNull().default("pending"), // pending | running | completed | failed
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const threadChainPosts = pgTable("thread_chain_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chainId: varchar("chain_id").notNull().references(() => threadChains.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  orderIndex: integer("order_index").notNull(),
  status: text("status").notNull().default("pending"), // pending | sent | failed
  threadsPostId: text("threads_post_id"),
  errorMessage: text("error_message"),
  publishedAt: timestamp("published_at"),
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
export const insertThreadChainSchema = createInsertSchema(threadChains).omit({
  id: true, status: true, createdAt: true, userId: true,
});
export const insertPostMetadataSchema = createInsertSchema(postMetadata).omit({
  id: true,
  createdAt: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type ScheduledPost = typeof scheduledPosts.$inferSelect;
export type InsertScheduledPost = z.infer<typeof insertScheduledPostSchema>;
export type BulkQueue = typeof bulkQueues.$inferSelect;
export type InsertBulkQueue = z.infer<typeof insertBulkQueueSchema>;
export type BulkQueueItem = typeof bulkQueueItems.$inferSelect;
export type InsertBulkQueueItem = z.infer<typeof insertBulkQueueItemSchema>;
export type BulkQueueWithItems = BulkQueue & { items: BulkQueueItem[] };
export type FollowUpThread = typeof followUpThreads.$inferSelect;
export type InsertFollowUpThread = z.infer<typeof insertFollowUpThreadSchema>;
export type ThreadChain = typeof threadChains.$inferSelect;
export type ThreadChainPost = typeof threadChainPosts.$inferSelect;
export type ThreadChainWithPosts = ThreadChain & { posts: ThreadChainPost[] };
export type PostMetadata = typeof postMetadata.$inferSelect;
export type InsertPostMetadata = z.infer<typeof insertPostMetadataSchema>;

