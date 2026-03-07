import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "wouter";
import {
  Clock, Layers, CheckCircle2, Timer, MessageSquare, ArrowRight,
  PenSquare, Zap, TrendingUp, BarChart2, Repeat2,
  Quote, Link2, ExternalLink, Sparkles, WandSparkles, Users, AlertCircle, Eye, Crown,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { addNotification } from "@/lib/notifications";
import { useToast } from "@/hooks/use-toast";
import { PostComposerCard } from "@/components/post-composer-card";
import { TICKER_MESSAGES, buildInterleavedPool, isConditionMet, shuffleArray } from "@/lib/ticker-messages";
import type { ScheduledPost, BulkQueueWithItems, FollowUpThread } from "@shared/schema";
import { formatDistanceToNow, format } from "date-fns";

type AiRole = "user" | "assistant";
type AiChatMessage = {
  id: number;
  role: AiRole;
  content: string;
};

type QuickComposeDraft = {
  id: number;
  text: string;
};

type AiProviderOption = {
  provider: string;
  label: string;
  models: string[];
};

type AiUsage = {
  plan: string;
  used: number;
  limit: number;
  unlimited: boolean;
};

type AiKeyStatus = {
  openaiConfigured: boolean;
  anthropicConfigured: boolean;
  geminiConfigured: boolean;
  perplexityConfigured: boolean;
};

type DnaPost = {
  text?: string | null;
  views?: number | null;
  likes?: number | null;
  replies?: number | null;
  reposts?: number | null;
  replies_count?: number | null;
  repost_count?: number | null;
  hookStyle?: string | null;
  hourOfDay?: number | null;
  dayOfWeek?: number | null;
  topicTag?: string | null;
  appTag?: string | null;
  postLength?: number | null;
  hasCta?: boolean | null;
  hasMedia?: boolean | null;
  insightsViews?: number | null;
  insightsLikes?: number | null;
  insightsReplies?: number | null;
  insightsReposts?: number | null;
  timestamp?: string | null;
  scheduledAt?: string | null;
  createdAt?: string | null;
  like_count?: number | null;
  view_count?: number | null;
};

type DnaDataResponse = {
  count: number;
  ready: boolean;
  posts: DnaPost[];
  recentPosts?: DnaPost[];
};

type AnalyticsSummaryResponse = {
  account?: {
    followers_count?: number | null;
    views?: number | null;
    likes?: number | null;
    replies?: number | null;
    reposts?: number | null;
  } | null;
};

type PersonaBreakdownItem = {
  label?: string | null;
  value?: number | null;
  sharePct?: number | null;
};

type PersonaTopPost = {
  text?: string | null;
  views?: number | null;
  likes?: number | null;
  replies?: number | null;
  metrics?: {
    views?: number | null;
    likes?: number | null;
    replies?: number | null;
  } | null;
};

type PersonaDataResponse = {
  eligible?: boolean;
  demographics?: {
    countries?: PersonaBreakdownItem[] | null;
    cities?: PersonaBreakdownItem[] | null;
    ages?: PersonaBreakdownItem[] | null;
    genders?: PersonaBreakdownItem[] | null;
  } | null;
  mapping?: {
    posts?: PersonaTopPost[] | null;
  } | null;
} | null;

type MarqueeItem = {
  category: string;
  value: string;
  tone?: "default" | "milestone" | "milestone-major";
};

function toNumberOrZero(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getPostViews(post: DnaPost): number {
  return toNumberOrZero(post.views ?? post.insightsViews ?? post.view_count);
}

function getPostLikes(post: DnaPost): number {
  return toNumberOrZero(post.likes ?? post.insightsLikes ?? post.like_count);
}

function getPostReplies(post: DnaPost): number {
  return toNumberOrZero(post.replies ?? post.insightsReplies ?? post.replies_count);
}

function getPostReposts(post: DnaPost): number {
  return toNumberOrZero(post.repost_count ?? post.reposts ?? post.insightsReposts);
}

function normalizeAppTags(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function formatNum(value: unknown): string {
  const n = toNumberOrZero(value);
  const trimDecimal = (num: number) => {
    const rounded = Math.round(num * 10) / 10;
    return Number.isInteger(rounded) ? String(Math.trunc(rounded)) : rounded.toFixed(1);
  };
  if (n >= 1000000) return `${trimDecimal(n / 1000000)}M`;
  if (n >= 1000) return `${trimDecimal(n / 1000)}K`;
  return `${Math.round(n)}`;
}

function getNextFollowerMilestone(followers: number): number {
  if (followers < 100) return 100;

  if (followers < 1000) {
    if (followers < 250) return 250;
    if (followers < 500) return 500;
    return 1000;
  }

  if (followers < 10000) {
    if (followers < 5000) return Math.ceil((followers + 1) / 500) * 500;
    return Math.ceil((followers + 1) / 1000) * 1000;
  }

  if (followers < 100000) {
    return Math.ceil((followers + 1) / 5000) * 5000;
  }

  if (followers < 1000000) {
    return Math.ceil((followers + 1) / 50000) * 50000;
  }

  return Math.ceil((followers + 1) / 250000) * 250000;
}

const FOLLOWER_CONGRATS_MILESTONES: number[] = (() => {
  const values = new Set<number>([1000]);
  for (let v = 5000; v <= 100000; v += 5000) values.add(v);
  for (let v = 110000; v <= 200000; v += 10000) values.add(v);
  for (let v = 250000; v <= 1000000; v += 50000) values.add(v);
  return Array.from(values).sort((a, b) => a - b);
})();

const MAJOR_FOLLOWER_MILESTONES = new Set<number>([
  1000,
  10000,
  25000,
  50000,
  100000,
  200000,
  300000,
  1000000,
]);

const DNA_UNLOCK_STORAGE_KEY = "threadflow_dna_unlocked";
const FOLLOWER_MILESTONE_STORAGE_KEY = "threadflow_last_milestone";
const FOLLOWER_COUNT_STORAGE_KEY = "threadflow_last_follower_count";

function getActiveFollowerCongratsMilestone(
  followers: number,
): { milestone: number; major: boolean } | null {
  if (followers < 1000) return null;
  for (let i = FOLLOWER_CONGRATS_MILESTONES.length - 1; i >= 0; i -= 1) {
    const milestone = FOLLOWER_CONGRATS_MILESTONES[i];
    if (followers >= milestone && followers < milestone + 100) {
      return {
        milestone,
        major: MAJOR_FOLLOWER_MILESTONES.has(milestone),
      };
    }
  }
  return null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatHourLabel(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  const hour12 = ((normalized + 11) % 12) + 1;
  const suffix = normalized >= 12 ? "PM" : "AM";
  return `${hour12} ${suffix}`;
}

function getPostTimestampMs(post: DnaPost): number | null {
  const raw = post.scheduledAt || post.timestamp || post.createdAt;
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function formatTimeAgo(ms: number, nowMs: number): string {
  const diff = Math.max(0, nowMs - ms);
  if (diff < 60 * 60 * 1000) return `${Math.max(1, Math.floor(diff / (60 * 1000)))}m`;
  if (diff < DAY_MS) return `${Math.max(1, Math.floor(diff / (60 * 60 * 1000)))}h`;
  return `${Math.max(1, Math.floor(diff / DAY_MS))}d`;
}

function getDateKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function minutesUntilHour(targetHour: number, now: Date): number {
  const target = new Date(now);
  target.setMinutes(0, 0, 0);
  target.setHours(targetHour);
  if (target.getTime() < now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return Math.max(0, Math.round((target.getTime() - now.getTime()) / (60 * 1000)));
}

function getTopBreakdownItem(items: PersonaBreakdownItem[] | null | undefined): PersonaBreakdownItem | null {
  if (!Array.isArray(items)) return null;
  const sorted = [...items]
    .filter((item) => typeof item?.label === "string" && String(item.label).trim() && toNumberOrZero(item.value) > 0)
    .sort((a, b) => toNumberOrZero(b.value) - toNumberOrZero(a.value));
  return sorted[0] ?? null;
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getCountryTimezone(label: string): string {
  const key = label.trim().toLowerCase();
  const map: Record<string, string> = {
    india: "Asia/Kolkata",
    "united states": "America/New_York",
    usa: "America/New_York",
    us: "America/New_York",
    "united kingdom": "Europe/London",
    uk: "Europe/London",
    england: "Europe/London",
    canada: "America/Toronto",
    australia: "Australia/Sydney",
    "united arab emirates": "Asia/Dubai",
    uae: "Asia/Dubai",
    singapore: "Asia/Singapore",
    germany: "Europe/Berlin",
    france: "Europe/Paris",
    spain: "Europe/Madrid",
    italy: "Europe/Rome",
    brazil: "America/Sao_Paulo",
    mexico: "America/Mexico_City",
    japan: "Asia/Tokyo",
    indonesia: "Asia/Jakarta",
    philippines: "Asia/Manila",
    "south africa": "Africa/Johannesburg",
  };
  return map[key] || "UTC";
}

function resolveTemplate(
  template: string,
  values: Record<string, string | number | undefined | null>,
): string | null {
  let resolved = template;
  const matches = Array.from(template.matchAll(/\{([a-zA-Z0-9_]+)\}/g));
  for (const match of matches) {
    const key = match[1];
    const value = values[key];
    if (value === undefined || value === null) return null;
    const textValue = String(value).trim();
    if (!textValue) return null;
    resolved = resolved.replaceAll(`{${key}}`, textValue);
  }
  if (/\{[a-zA-Z0-9_]+\}/.test(resolved)) return null;
  return resolved;
}

function isValidResolvedMessage(msg: string): boolean {
  if (msg.includes("{")) return false;
  // Reject only if a value resolved to exactly "0"
  // standalone (not part of "10", "100", "40" etc)
  if (/(?<![0-9])0(?![0-9,.KMk%])/.test(msg)) return false;
  if (/\b0K\b/i.test(msg)) return false;
  if (/\b0\.0\b/.test(msg)) return false;
  if (msg.trim().length < 10) return false;
  return true;
}

function buildTickerItems(
  dnaData: DnaDataResponse | undefined,
  recentPosts: DnaPost[] | undefined,
  user: ReturnType<typeof useAuth>["user"],
  analyticsData: AnalyticsSummaryResponse | null | undefined,
  personaData: PersonaDataResponse,
  publishedCount: number,
): MarqueeItem[] {
  const now = new Date();
  const nowMs = now.getTime();
  const posts = Array.isArray(dnaData?.posts) ? dnaData.posts : [];
  const recent = Array.isArray(recentPosts) ? recentPosts : [];
  const account = analyticsData?.account;

  const recentWithTime = recent
    .map((post) => {
      const ms = getPostTimestampMs(post);
      return Number.isFinite(ms) ? { post, ms: Number(ms) } : null;
    })
    .filter(Boolean) as Array<{ post: DnaPost; ms: number }>;
  recentWithTime.sort((a, b) => b.ms - a.ms);
  const latest = recentWithTime[0];

  const thisWeekPosts = recentWithTime.filter((item) => nowMs - item.ms <= WEEK_MS);
  const lastWeekPosts = recentWithTime.filter(
    (item) => nowMs - item.ms > WEEK_MS && nowMs - item.ms <= 2 * WEEK_MS,
  );

  const profileFollowers = toNumberOrZero(user?.threadsFollowerCount ?? account?.followers_count);
  const activeFollowerCongrats = getActiveFollowerCongratsMilestone(profileFollowers);

  const placeholders: Record<string, string | number | undefined | null> = {
    currentTime: format(now, "h:mm a"),
    minsLeft: minutesUntilHour(22, now),
    minsUntilPeak: minutesUntilHour(20, now),
  };

  const dnaCount = toNumberOrZero(dnaData?.count);
  placeholders.dnaCount = dnaCount;
  placeholders.dnaRemaining = Math.max(15 - dnaCount, 0);
  placeholders.publishedCount = publishedCount;

  const latestMs = latest?.ms ?? null;
  const hoursSincePost = latestMs !== null ? Math.max(0, Math.floor((nowMs - latestMs) / (60 * 60 * 1000))) : null;
  const daysSincePost = latestMs !== null ? Math.max(0, Math.floor((nowMs - latestMs) / DAY_MS)) : null;
  const latestViews = latest ? toNumberOrZero(
    latest.post.views ??
    latest.post.insightsViews ??
    (latest.post as any).view_count ??
    0
  ) : 0;
  const latestLikes = latest ? toNumberOrZero(latest.post.likes ?? latest.post.like_count) : 0;
  console.log("[ticker] latest post fields:",
    latest?.post ? Object.keys(latest.post) : "no post",
    "views:", latest?.post?.views,
    "insightsViews:", latest?.post?.insightsViews
  );

  if (latestMs !== null) {
    placeholders.daysSincePost = daysSincePost;
    placeholders.hoursSincePost = hoursSincePost;
    placeholders.timeAgo = formatTimeAgo(latestMs, nowMs);
    if (latestViews > 0) {
      placeholders.lastViews = formatNum(latestViews);
    }
    if (latestLikes > 0) {
      placeholders.lastLikes = formatNum(latestLikes);
    }
  }

  placeholders.postsThisWeek = thisWeekPosts.length;
  placeholders.postsLastWeek = lastWeekPosts.length;

  const repostCountThisWeek = thisWeekPosts.reduce((sum, item) => sum + getPostReposts(item.post), 0);
  const repostCountLastWeek = lastWeekPosts.reduce((sum, item) => sum + getPostReposts(item.post), 0);
  if (repostCountLastWeek > 0 && repostCountThisWeek > repostCountLastWeek) {
    placeholders.repostPct = Math.round(((repostCountThisWeek - repostCountLastWeek) / repostCountLastWeek) * 100);
  } else if (repostCountLastWeek === 0 && repostCountThisWeek > 0) {
    placeholders.repostPct = 100;
  }

  const totalRepliesWeek = thisWeekPosts.reduce((sum, item) => sum + getPostReplies(item.post), 0);
  if (totalRepliesWeek > 0) {
    placeholders.replyCount = totalRepliesWeek;
  }

  const postedDateSet = new Set(recentWithTime.map((item) => getDateKey(item.ms)));
  let streakDays = 0;
  const cursor = new Date(now);
  while (postedDateSet.has(getDateKey(cursor.getTime()))) {
    streakDays += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  if (streakDays > 0) {
    placeholders.streakDays = streakDays;
  }

  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const postsThisMonth = recentWithTime.filter((item) => {
    const d = new Date(item.ms);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).length;
  placeholders.postsThisMonth = postsThisMonth;
  placeholders.daysLeft = new Date(currentYear, currentMonth + 1, 0).getDate() - now.getDate();

  const topRecentByReplies = [...recent].sort((a, b) => getPostReplies(b) - getPostReplies(a))[0];
  if (topRecentByReplies && getPostReplies(topRecentByReplies) > 0) {
    placeholders.topReplyCount = getPostReplies(topRecentByReplies);
  }

  const postedDays = new Set<number>();
  for (const item of recentWithTime) postedDays.add(new Date(item.ms).getDay());
  for (const post of posts) {
    const dayOfWeekRaw = Number(post.dayOfWeek);
    if (Number.isInteger(dayOfWeekRaw) && dayOfWeekRaw >= 0 && dayOfWeekRaw <= 6) {
      postedDays.add(dayOfWeekRaw);
      continue;
    }
    const ms = getPostTimestampMs(post);
    if (ms) postedDays.add(new Date(ms).getDay());
  }
  const neverPostedDay = [1, 2, 3, 4, 5, 6, 0].find((day) => !postedDays.has(day));
  if (neverPostedDay !== undefined) {
    placeholders.dayName = DAY_NAMES[neverPostedDay];
  }

  const totalViews = toNumberOrZero(account?.views) || posts.reduce((sum, post) => sum + getPostViews(post), 0);
  const totalLikes = toNumberOrZero(account?.likes) || posts.reduce((sum, post) => sum + getPostLikes(post), 0);
  if (totalViews > 0) placeholders.totalViews = formatNum(totalViews);
  if (totalLikes > 0) placeholders.totalLikes = formatNum(totalLikes);

  if (profileFollowers > 0) {
    const nextMilestoneValue = getNextFollowerMilestone(profileFollowers);
    placeholders.followersToNext = Math.max(0, nextMilestoneValue - profileFollowers);
    placeholders.nextMilestone = formatNum(nextMilestoneValue);
  }

  let bestHour: number | null = null;
  const hourStats = new Map<number, { views: number; count: number }>();
  for (const post of posts) {
    const hour = Number(post.hourOfDay);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;
    const views = getPostViews(post);
    if (views <= 0) continue;
    const current = hourStats.get(hour) || { views: 0, count: 0 };
    hourStats.set(hour, { views: current.views + views, count: current.count + 1 });
  }
  let bestHourAvg = 0;
  hourStats.forEach((stats, hour) => {
    const avg = stats.views / stats.count;
    if (avg > bestHourAvg) {
      bestHourAvg = avg;
      bestHour = hour;
    }
  });
  if (bestHour !== null) {
    placeholders.bestHourStart = formatHourLabel(bestHour);
    placeholders.peakStart = formatHourLabel(bestHour);
    placeholders.peakEnd = formatHourLabel(bestHour + 2);
  } else {
    placeholders.peakStart = formatHourLabel(20);
    placeholders.peakEnd = formatHourLabel(22);
  }

  const tagStats = new Map<string, { views: number; reposts: number; count: number; lastMs: number }>();
  for (const post of posts) {
    const tags = normalizeAppTags(post.appTag);
    if (!tags.length) continue;
    const views = getPostViews(post);
    const reposts = getPostReposts(post);
    const ms = getPostTimestampMs(post) ?? 0;
    for (const tag of tags) {
      const current = tagStats.get(tag) || { views: 0, reposts: 0, count: 0, lastMs: 0 };
      tagStats.set(tag, {
        views: current.views + views,
        reposts: current.reposts + reposts,
        count: current.count + 1,
        lastMs: Math.max(current.lastMs, ms),
      });
    }
  }
  let topTag: string | null = null;
  let topTagAvgViews = 0;
  tagStats.forEach((stats, tag) => {
    const avg = stats.count > 0 ? stats.views / stats.count : 0;
    if (avg > topTagAvgViews) {
      topTagAvgViews = avg;
      topTag = tag;
    }
  });
  if (topTag && topTagAvgViews > 0) {
    placeholders.topTag = topTag;
    placeholders.avgViews = formatNum(topTagAvgViews);
    const topTagLastMs = tagStats.get(topTag)?.lastMs ?? 0;
    if (topTagLastMs > 0) {
      placeholders.daysSinceTag = Math.max(0, Math.floor((nowMs - topTagLastMs) / DAY_MS));
    }
    const topTagStats = tagStats.get(topTag);
    if (topTagStats) {
      const topAvgReposts = topTagStats.reposts / Math.max(topTagStats.count, 1);
      const others = Array.from(tagStats.entries()).filter(([tag]) => tag !== topTag);
      const otherReposts = others.reduce((sum, [, stats]) => sum + stats.reposts, 0);
      const otherCount = others.reduce((sum, [, stats]) => sum + stats.count, 0);
      const otherAvgReposts = otherCount > 0 ? otherReposts / otherCount : 0;
      if (topAvgReposts > 0 && otherAvgReposts > 0) {
        placeholders.repostMultiplier = Math.round((topAvgReposts / otherAvgReposts) * 10) / 10;
      }
    }
  }

  const dayStats = new Map<number, { views: number; count: number }>();
  for (const post of posts) {
    const views = getPostViews(post);
    if (views <= 0) continue;
    let day: number;
    const dayOfWeekRaw = Number(post.dayOfWeek);
    if (Number.isInteger(dayOfWeekRaw) && dayOfWeekRaw >= 0 && dayOfWeekRaw <= 6) {
      day = dayOfWeekRaw;
    } else {
      const ms = getPostTimestampMs(post);
      if (!ms) continue;
      day = new Date(ms).getDay();
    }
    const current = dayStats.get(day) || { views: 0, count: 0 };
    dayStats.set(day, { views: current.views + views, count: current.count + 1 });
  }
  let bestDay: number | null = null;
  let bestDayAvg = 0;
  dayStats.forEach((stats, day) => {
    const avg = stats.views / stats.count;
    if (avg > bestDayAvg) {
      bestDayAvg = avg;
      bestDay = day;
    }
  });
  if (bestDay !== null) {
    placeholders.bestDay = DAY_NAMES[bestDay];
  }

  const hookStats = new Map<string, { replies: number; count: number }>();
  for (const post of posts) {
    const style = typeof post.hookStyle === "string" ? post.hookStyle.trim() : "";
    if (!style) continue;
    const current = hookStats.get(style) || { replies: 0, count: 0 };
    hookStats.set(style, { replies: current.replies + getPostReplies(post), count: current.count + 1 });
  }
  let bestHookStyle: string | null = null;
  let bestHookAvgReplies = 0;
  hookStats.forEach((stats, style) => {
    const avg = stats.count > 0 ? stats.replies / stats.count : 0;
    if (avg > bestHookAvgReplies) {
      bestHookAvgReplies = avg;
      bestHookStyle = style;
    }
  });
  if (bestHookStyle) {
    placeholders.hookStyle = toTitleCase(bestHookStyle);
    const otherStats = Array.from(hookStats.entries()).filter(([style]) => style !== bestHookStyle);
    const othersReplies = otherStats.reduce((sum, [, stats]) => sum + stats.replies, 0);
    const othersCount = otherStats.reduce((sum, [, stats]) => sum + stats.count, 0);
    const othersAvg = othersCount > 0 ? othersReplies / othersCount : 0;
    if (bestHookAvgReplies > 0 && othersAvg > 0) {
      placeholders.hookMultiplier = Math.round((bestHookAvgReplies / othersAvg) * 10) / 10;
    }
  }

  const lengthCandidates = posts
    .filter((post) => toNumberOrZero(post.postLength) > 0 && getPostViews(post) > 0)
    .sort((a, b) => getPostViews(b) - getPostViews(a));
  if (lengthCandidates.length > 0) {
    const topCount = Math.max(1, Math.ceil(lengthCandidates.length * 0.3));
    const topSlice = lengthCandidates.slice(0, topCount);
    const avgLength = topSlice.reduce((sum, post) => sum + toNumberOrZero(post.postLength), 0) / topSlice.length;
    placeholders.optimalLength = Math.round(avgLength);
  }

  const ctaTrue = posts.filter((post) => Boolean(post.hasCta));
  const ctaFalse = posts.filter((post) => post.hasCta === false);
  if (ctaTrue.length > 0 && ctaFalse.length > 0) {
    const avgTrue = ctaTrue.reduce((sum, post) => sum + getPostReplies(post), 0) / ctaTrue.length;
    const avgFalse = ctaFalse.reduce((sum, post) => sum + getPostReplies(post), 0) / ctaFalse.length;
    if (avgTrue > 0 && avgFalse > 0) {
      placeholders.ctaBoost = Math.round(((avgTrue - avgFalse) / avgFalse) * 100);
    }
  }

  const mediaPosts = posts.filter((post) => Boolean(post.hasMedia));
  const textPosts = posts.filter((post) => post.hasMedia === false);
  if (mediaPosts.length > 0 && textPosts.length > 0) {
    const mediaAvg = mediaPosts.reduce((sum, post) => sum + getPostViews(post), 0) / mediaPosts.length;
    const textAvg = textPosts.reduce((sum, post) => sum + getPostViews(post), 0) / textPosts.length;
    placeholders.mediaWinner = mediaAvg >= textAvg ? "Media" : "Text";
  }

  const morningPosts = posts.filter((post) => Number(post.hourOfDay) >= 6 && Number(post.hourOfDay) <= 11);
  const eveningPosts = posts.filter((post) => Number(post.hourOfDay) >= 17 && Number(post.hourOfDay) <= 23);
  if (morningPosts.length > 0 && eveningPosts.length > 0) {
    const morningAvg = morningPosts.reduce((sum, post) => sum + getPostViews(post), 0) / morningPosts.length;
    const eveningAvg = eveningPosts.reduce((sum, post) => sum + getPostViews(post), 0) / eveningPosts.length;
    if (morningAvg > 0 && eveningAvg > 0) {
      placeholders.amOrPm = morningAvg >= eveningAvg ? "Morning" : "Evening";
      const high = Math.max(morningAvg, eveningAvg);
      const low = Math.min(morningAvg, eveningAvg);
      placeholders.pctDiff = Math.round(((high - low) / low) * 100);
    }
  }

  const streakSource = [...recentWithTime].map((item) => ({
    hookStyle: typeof item.post.hookStyle === "string" ? item.post.hookStyle.trim() : "",
  }));
  if (streakSource.length > 0 && streakSource[0].hookStyle) {
    const firstHook = streakSource[0].hookStyle;
    let streakCount = 0;
    for (const item of streakSource) {
      if (item.hookStyle && item.hookStyle === firstHook) streakCount += 1;
      else break;
    }
    if (streakCount > 1) {
      placeholders.streakCount = streakCount;
      if (!placeholders.hookStyle) {
        placeholders.hookStyle = toTitleCase(firstHook);
      }
    }
  }

  const personaCountries = Array.isArray(personaData?.demographics?.countries) ? personaData.demographics.countries : [];
  const personaCities = Array.isArray(personaData?.demographics?.cities) ? personaData.demographics.cities : [];
  const personaAges = Array.isArray(personaData?.demographics?.ages) ? personaData.demographics.ages : [];
  const personaGenders = Array.isArray(personaData?.demographics?.genders) ? personaData.demographics.genders : [];
  const hasPersonaDemographics =
    personaCountries.length > 0 || personaCities.length > 0 || personaAges.length > 0 || personaGenders.length > 0;

  if (personaData?.eligible && hasPersonaDemographics && personaData.demographics) {
    const topCountry = getTopBreakdownItem(personaData.demographics.countries);
    const topCity = getTopBreakdownItem(personaData.demographics.cities);
    const topGender = getTopBreakdownItem(personaData.demographics.genders);
    const topAge = getTopBreakdownItem(personaData.demographics.ages);

    if (topCountry?.label) placeholders.topCountry = String(topCountry.label);
    if (topCity?.label) placeholders.topCity = String(topCity.label);
    if (topGender?.label) placeholders.topGender = String(topGender.label);
    if (topAge?.label) placeholders.topAge = String(topAge.label);

    if (topGender?.label) {
      if (typeof topGender.sharePct === "number") {
        placeholders.genderPct = Math.round(topGender.sharePct);
      } else {
        const allGender = personaGenders;
        const total = allGender.reduce((sum, item) => sum + toNumberOrZero(item?.value), 0);
        const topValue = toNumberOrZero(topGender.value);
        if (total > 0 && topValue > 0) {
          placeholders.genderPct = Math.round((topValue / total) * 100);
        }
      }
    }

    if (topCountry?.label) {
      const timezone = getCountryTimezone(String(topCountry.label));
      const localTime = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: timezone,
      }).format(now);
      const localHour = Number(
        new Intl.DateTimeFormat("en-US", {
          hour: "numeric",
          hour12: false,
          timeZone: timezone,
        }).format(now),
      );
      placeholders.localTime = localTime;
      placeholders.awakeAsleep = localHour >= 6 && localHour < 23 ? "awake" : "asleep";
    }
  }

  const timePoolRaw = TICKER_MESSAGES
    .filter((message) => message.category === "time")
    .filter((message) => isConditionMet(message));

  const motivPoolRaw = TICKER_MESSAGES.filter((message) => message.category === "motiv");
  const dnaPoolRaw = dnaData?.ready === true ? TICKER_MESSAGES.filter((message) => message.category === "dna") : [];

  const hasRecentPostsData = recent.length > 0;
  const behaviorPoolRaw = hasRecentPostsData
    ? TICKER_MESSAGES.filter((message) => message.category === "behavior")
    : [];

  const hasMilestoneData = profileFollowers > 0;
  const milestonePoolRaw = hasMilestoneData
    ? TICKER_MESSAGES.filter((message) => message.category === "milestone")
    : [];

  const hasGlobalData = personaData?.eligible === true && hasPersonaDemographics;
  const globalPoolRaw = hasGlobalData
    ? TICKER_MESSAGES.filter((message) => message.category === "global")
    : [];

  const usedDynamicKeys = new Set<string>();
  const nowDay = now.getDay();
  const nowHour = now.getHours();
  const isSundayEveningWindow = nowDay === 0 && nowHour >= 18 && nowHour < 22;
  const isPeakWindow = nowHour >= 20 && nowHour < 22;

  const numericPlaceholder = (key: string): number => toNumberOrZero(placeholders[key]);
  const shouldIncludeMessage = (message: (typeof TICKER_MESSAGES)[number]): boolean => {
    switch (message.id) {
      case "peak_open":
        return isConditionMet(message) && !isPeakWindow;
      case "peak_left":
        return isConditionMet(message) && isPeakWindow;
      case "sunday_general":
        return isConditionMet(message) && !isSundayEveningWindow;
      case "sunday_evening":
        return isConditionMet(message) && isSundayEveningWindow;
      case "behavior_12h":
        return hoursSincePost !== null && hoursSincePost >= 12 && daysSincePost !== null && daysSincePost < 3;
      case "behavior_3d":
        return daysSincePost !== null && daysSincePost >= 3;
      case "dna_tag_gap":
        return numericPlaceholder("daysSinceTag") >= 3;
      case "behavior_weekly":
        return numericPlaceholder("postsLastWeek") > 0;
      case "behavior_streak":
        return numericPlaceholder("streakDays") >= 2;
      case "milestone_dna":
        return dnaCount > 0 && dnaCount < 15;
      case "dna_hook_style":
        return numericPlaceholder("hookMultiplier") >= 1.2;
      case "dna_length":
        return numericPlaceholder("optimalLength") > 50;
      case "behavior_last_post":
        return latestMs !== null && (latestViews > 0 || latestLikes > 0);
      case "global_top_country":
      case "global_top_city":
      case "global_gender":
      case "global_age":
      case "global_country_time":
      case "global_reposts_trend":
        return hasGlobalData;
      default:
        return true;
    }
  };

  const getPrimaryDynamicKey = (message: (typeof TICKER_MESSAGES)[number]): string | null => {
    switch (message.id) {
      case "peak_open":
      case "peak_left":
        return "peak_window";
      case "sunday_general":
      case "sunday_evening":
        return "sunday_window";
      case "behavior_12h":
      case "behavior_3d":
        return "silence";
      case "behavior_last_post":
        return "last_post";
      case "dna_top_tag_views":
      case "dna_top_tag_strong":
      case "dna_tag_gap":
      case "dna_reposts":
      case "dna_formula":
        return "topTag";
      default: {
        if (!message.dynamic) return null;
        const match = message.message.match(/\{([a-zA-Z0-9_]+)\}/);
        return match ? match[1] : `id:${message.id}`;
      }
    }
  };

  const resolveMessage = (message: (typeof TICKER_MESSAGES)[number]): (typeof TICKER_MESSAGES)[number] | null => {
    if (!shouldIncludeMessage(message)) return null;
    const primaryKey = getPrimaryDynamicKey(message);
    if (primaryKey && usedDynamicKeys.has(primaryKey)) return null;

    if (message.id === "milestone_followers" && activeFollowerCongrats) {
      const milestoneLabel = formatNum(activeFollowerCongrats.milestone);
      const messageText = activeFollowerCongrats.major
        ? `Major milestone -- ${milestoneLabel} followers reached`
        : `Congrats -- ${milestoneLabel} followers reached`;
      if (!isValidResolvedMessage(messageText)) return null;
      if (primaryKey) usedDynamicKeys.add(primaryKey);
      return { ...message, message: messageText };
    }

    if (message.id === "behavior_last_post") {
      const timeAgo = typeof placeholders.timeAgo === "string" ? placeholders.timeAgo : "";
      if (!timeAgo) return null;
      const messageText =
        latestViews > 0
          ? `Last post -- ${formatNum(latestViews)} views -- ${timeAgo} ago`
          : latestLikes > 0
            ? `Last post -- ${formatNum(latestLikes)} likes -- ${timeAgo} ago`
            : null;
      if (!messageText) return null;
      if (!isValidResolvedMessage(messageText)) return null;
      if (primaryKey) usedDynamicKeys.add(primaryKey);
      return { ...message, message: messageText };
    }

    if (message.id === "dna_best_day") {
      const bestDayName = typeof placeholders.bestDay === "string" ? placeholders.bestDay : "";
      if (!bestDayName) return null;
      const todayName = DAY_NAMES[now.getDay()];
      if (bestDayName !== todayName) return null;
      const bestDayText = `${bestDayName} is your best day -- Post today`;
      if (!isValidResolvedMessage(bestDayText)) return null;
      if (primaryKey) usedDynamicKeys.add(primaryKey);
      return { ...message, message: bestDayText };
    }

    const resolved = resolveTemplate(message.message, placeholders);
    if (!resolved) return null;
    if (!isValidResolvedMessage(resolved)) return null;
    if (primaryKey) usedDynamicKeys.add(primaryKey);
    return { ...message, message: resolved };
  };

  const resolvePool = (pool: typeof TICKER_MESSAGES): (typeof TICKER_MESSAGES)[number][] =>
    shuffleArray(pool)
      .map((message) => resolveMessage(message))
      .filter((message): message is (typeof TICKER_MESSAGES)[number] => Boolean(message));

  const timePool = resolvePool(timePoolRaw);
  const motivPool = resolvePool(motivPoolRaw);
  const cappedMotivPool = shuffleArray(motivPool).slice(0, 2);
  const dnaPool = resolvePool(dnaPoolRaw);
  const behaviorPool = resolvePool(behaviorPoolRaw);
  const milestonePool = resolvePool(milestonePoolRaw);
  const globalPool = resolvePool(globalPoolRaw);

  const resolvedMessages = [
    ...timePool,
    ...cappedMotivPool,
    ...dnaPool,
    ...behaviorPool,
    ...milestonePool,
    ...globalPool,
  ];

  const interleaved = buildInterleavedPool(resolvedMessages);
  return interleaved.map((item) => ({
    category: item.category,
    value: item.message,
    tone:
      item.id === "milestone_followers" && activeFollowerCongrats?.major
        ? "milestone-major"
        : item.category === "milestone"
          ? "milestone"
          : "default",
  }));
}
function getFriendlyAiError(err: unknown): string {
  const fallback = "AI request failed. Please try again.";
  const rawMessage = typeof (err as any)?.message === "string" ? (err as any).message : "";
  if (!rawMessage) return fallback;

  let message = rawMessage.replace(/^\d+\s*:\s*/, "").trim();

  if (message.startsWith("{")) {
    try {
      const parsed = JSON.parse(message);
      if (typeof parsed?.error === "string" && parsed.error.trim()) {
        message = parsed.error.trim();
      } else if (typeof parsed?.message === "string" && parsed.message.trim()) {
        message = parsed.message.trim();
      }
    } catch {
      // keep original message
    }
  }

  const lower = message.toLowerCase();

  if (
    lower.includes("exceeded your current quota") ||
    lower.includes("insufficient_quota") ||
    lower.includes("billing")
  ) {
    return "Quota exceeded for this provider. Check billing/usage limits, or switch provider/model.";
  }
  if (lower.includes("invalid api key") || lower.includes("incorrect api key")) {
    return "Invalid API key for selected provider. Check .env key and restart server.";
  }
  if (lower.includes("not configured on server")) {
    return "This provider is not configured. Add its API key in .env and restart server.";
  }
  if (
    lower.includes("model") &&
    (lower.includes("not found") || lower.includes("not available") || lower.includes("does not exist"))
  ) {
    return "Selected model is unavailable for this account. Choose another model.";
  }
  if (lower.includes("rate limit") || lower.includes("too many requests")) {
    return "Rate limit reached. Wait a moment and try again.";
  }
  if (lower.includes("provider returned empty response")) {
    return "Provider returned empty output. Try again or switch model/provider.";
  }

  return message || fallback;
}

function parseApiErrorPayload(err: unknown): Record<string, any> | null {
  const rawMessage = typeof (err as any)?.message === "string" ? (err as any).message : "";
  if (!rawMessage) return null;
  const cleaned = rawMessage.replace(/^\d+\s*:\s*/, "").trim();
  if (!cleaned.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "Pending", variant: "secondary" },
    published: { label: "Published", variant: "default" },
    sent: { label: "Sent", variant: "default" },
    failed: { label: "Failed", variant: "destructive" },
    running: { label: "Running", variant: "default" },
    completed: { label: "Completed", variant: "default" },
  };
  const cfg = map[status] || { label: status, variant: "outline" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

// Character count warning component for AI responses
function CharacterCount({ count }: { count: number }) {
  const THREADS_LIMIT = 500; // Threads post limit
  const WARNING_THRESHOLD = 450;
  
  const isOverLimit = count > THREADS_LIMIT;
  const isNearLimit = count > WARNING_THRESHOLD && !isOverLimit;
  
  if (count <= WARNING_THRESHOLD) return null;
  
  return (
    <span className={`flex items-center gap-1 text-[10px] ${isOverLimit ? "text-destructive" : "text-amber-500"}`}>
      <AlertCircle className="w-3 h-3" />
      {isOverLimit ? `${count} chars (OVER LIMIT)` : `${count} chars`}
    </span>
  );
}

function ProfileCard({
  isProPlan,
  onAnalyticsLocked,
}: {
  isProPlan: boolean;
  onAnalyticsLocked: () => void;
}) {
  const { user } = useAuth();
  const { data: profile, isLoading } = useQuery<any>({
    queryKey: ["/api/profile"],
    retry: false,
    enabled: !!user?.threadsAccessToken,
  });

  if (!user?.threadsAccessToken) {
    return (
      <Card className="col-span-full border-[#22313d]/90 bg-[linear-gradient(160deg,rgba(17,26,36,0.97)_0%,rgba(11,17,23,0.98)_100%)] text-[#eaf2f8] shadow-[0_14px_34px_rgba(0,0,0,0.5)] backdrop-blur transition-all duration-300 hover:border-[#59c3c3]/45 hover:shadow-[0_20px_44px_rgba(0,0,0,0.56)]">
        <CardContent className="flex items-center gap-4 py-5">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#d9b26f]/15 border border-[#d9b26f]/30 flex-shrink-0">
            <Zap className="w-5 h-5 text-[#d9b26f]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#eaf2f8] text-sm">Threads account not connected</p>
            <p className="text-xs mt-0.5 text-[#9fb0c0]">Connect your Threads API credentials to start posting and scheduling.</p>
          </div>
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full border border-[#3e5466] bg-[#16222d]/90 flex-shrink-0">
            <div className="w-2 h-2 rounded-full bg-[#9fb0c0]" />
            <span className="text-xs text-[#9fb0c0]">Disconnected</span>
          </div>
          <Link href="/settings">
            <Button size="sm" variant="outline" className="border-[#375164] bg-[#101d28] text-[#d7e8f4] hover:bg-[#173043] hover:text-white">
              Connect Now
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="col-span-full border-[#22313d]/90 bg-[linear-gradient(160deg,rgba(17,26,36,0.97)_0%,rgba(11,17,23,0.98)_100%)] text-[#eaf2f8] shadow-[0_14px_34px_rgba(0,0,0,0.5)] backdrop-blur">
        <CardContent className="flex items-center gap-4 py-5">
          <Skeleton className="w-12 h-12 rounded-full flex-shrink-0 bg-[#1e2d38]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-36 bg-[#1e2d38]" />
            <Skeleton className="h-3 w-56 bg-[#1e2d38]" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const displayProfile = profile || {
    name: undefined,
    username: user?.threadsUsername,
    threads_profile_picture_url: user?.threadsProfilePicUrl,
    followers_count: user?.threadsFollowerCount,
  };
  if (!displayProfile?.username) return null;

  return (
    <Card className="col-span-full relative overflow-hidden border-[#2b4650] bg-[radial-gradient(120%_120%_at_0%_0%,rgba(89,195,195,0.26)_0%,rgba(17,26,36,0.95)_45%,rgba(11,17,23,0.98)_100%)] shadow-[0_22px_52px_rgba(0,0,0,0.58)]">
      <div className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full bg-[#d9b26f]/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 left-16 h-44 w-44 rounded-full bg-[#59c3c3]/20 blur-3xl" />
      <CardContent className="relative z-10 flex flex-wrap items-center gap-3.5 py-5">
        <Avatar className="w-12 h-12 flex-shrink-0 ring-2 ring-[#59c3c3]/35 ring-offset-2 ring-offset-[#111a24]">
          <AvatarImage src={displayProfile.threads_profile_picture_url} />
          <AvatarFallback className="bg-[#59c3c3]/15 text-[#8ce1e1] text-base font-bold">
            {displayProfile.username?.[0]?.toUpperCase() || "T"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-[#f2f8fc] leading-tight">
            {displayProfile.name || displayProfile.username}
            <span className="text-sm font-medium ml-1 text-[#8fb8d6]">@{displayProfile.username}</span>
          </p>
          <div className="flex items-center gap-1 text-xs mt-1 text-[#a8cde3]">
            <Users className="w-3.5 h-3.5 text-[#59c3c3]" />
            <span>
              {typeof displayProfile.followers_count === "number"
                ? `${displayProfile.followers_count.toLocaleString()} followers`
                : "Followers unavailable"}
            </span>
          </div>
          {displayProfile.threads_biography && (
            <p className="text-xs mt-1 line-clamp-1 text-[#9fb0c0]">{displayProfile.threads_biography}</p>
          )}
        </div>
        <div className="flex items-center gap-3 ml-auto flex-shrink-0">
          {isProPlan ? (
            <Link href="/analytics">
              <Button size="sm" variant="outline" className="h-8 rounded-full border-[#355368] bg-[#101d28]/70 px-3 text-xs text-[#d3eaf6] hover:bg-[#173043] hover:text-white">
                <BarChart2 className="w-3.5 h-3.5 mr-1.5 text-[#59c3c3]" />
                Analytics
                <Crown className="w-3 h-3 ml-1 text-[#d9b26f]" />
              </Button>
            </Link>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-full border-[#355368] bg-[#101d28]/70 px-3 text-xs text-[#d3eaf6] hover:bg-[#173043] hover:text-white"
              onClick={onAnalyticsLocked}
            >
              <BarChart2 className="w-3.5 h-3.5 mr-1.5 text-[#59c3c3]" />
              Analytics
              <Crown className="w-3 h-3 ml-1 text-[#d9b26f]" />
            </Button>
          )}
          <div className="flex items-center gap-1.5 rounded-full border border-[#2d6c6a] bg-[#163034]/90 px-3 py-1">
            <div className="w-2 h-2 rounded-full bg-[#6be4de]" />
            <span className="text-xs text-[#a7efe9]">Connected</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// AI assistant
function AiPostAssistant({
  onUseDraft,
}: {
  onUseDraft: (draft: string) => void;
}) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [showDailyLimitPrompt, setShowDailyLimitPrompt] = useState(false);

  const { data: providers = [], isLoading: loadingProviders } = useQuery<AiProviderOption[]>({
    queryKey: ["/api/ai/providers"],
    queryFn: () => apiRequest("GET", "/api/ai/providers"),
  });
  const { data: usageData, refetch: refetchUsage } = useQuery<AiUsage>({
    queryKey: ["/api/ai/usage"],
    queryFn: () => apiRequest("GET", "/api/ai/usage"),
  });

  useEffect(() => {
    if (usageData) setUsage(usageData);
  }, [usageData]);

  useEffect(() => {
    const onFocus = () => {
      void refetchUsage();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refetchUsage]);

  useEffect(() => {
    if (!providers.length) {
      setProvider("");
      setModel("");
      return;
    }

    if (!provider || !providers.some((p) => p.provider === provider)) {
      const first = providers[0];
      setProvider(first.provider);
      setModel(first.models[0] || "");
      return;
    }

    const current = providers.find((p) => p.provider === provider);
    if (current && (!model || !current.models.includes(model))) {
      setModel(current.models[0] || "");
    }
  }, [providers, provider, model]);

  const { mutateAsync: askAi, isPending } = useMutation({
    mutationFn: (payload: {
      provider: string;
      model: string;
      message: string;
      history: Array<{ role: AiRole; content: string }>;
    }) =>
      apiRequest("POST", "/api/ai/chat", payload),
  });

  const latestAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const selectedProvider = providers.find((p) => p.provider === provider);

  const sendPrompt = async (rawPrompt?: string) => {
    const message = (rawPrompt ?? prompt).trim();
    if (!message) return;
    if (!provider || !model) {
      toast({ title: "Choose provider/model first", variant: "destructive" });
      return;
    }

    const history = messages.slice(-8).map((m) => ({ role: m.role, content: m.content }));
    const userMessage: AiChatMessage = { id: Date.now(), role: "user", content: message };
    setMessages((prev) => [...prev, userMessage]);
    setPrompt("");
    setShowDailyLimitPrompt(false);

    try {
      const result = await askAi({ provider, model, message, history });
      const reply = typeof result?.reply === "string" ? result.reply.trim() : "";
      if (!reply) throw new Error("Empty response from AI");
      setMessages((prev) => [...prev, { id: Date.now() + 1, role: "assistant", content: reply }]);
      setUsage((prev) =>
        prev && !prev.unlimited
          ? { ...prev, used: Math.min(prev.limit, prev.used + 1) }
          : prev,
      );
    } catch (err: any) {
      const apiError = parseApiErrorPayload(err);
      if (apiError?.error === "DAILY_LIMIT_REACHED") {
        setShowDailyLimitPrompt(true);
        setUsage((prev) =>
          prev && !prev.unlimited ? { ...prev, used: Math.max(prev.used, prev.limit) } : prev,
        );
        return;
      }
      const msg = getFriendlyAiError(err);
      toast({ title: "AI request failed", description: msg, variant: "destructive" });
      setMessages((prev) => [...prev, { id: Date.now() + 1, role: "assistant", content: "I could not generate right now. Please try again." }]);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          AI Post Assistant
        </CardTitle>
        <CardDescription className="text-xs">Draft hooks, rewrites, and full post ideas</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Select value={provider} onValueChange={setProvider} disabled={loadingProviders || !providers.length || isPending}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              {providers.map((p) => (
                <SelectItem key={p.provider} value={p.provider}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={model} onValueChange={setModel} disabled={!selectedProvider || isPending}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Model" />
            </SelectTrigger>
            <SelectContent>
              {(selectedProvider?.models || []).map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!providers.length && !loadingProviders && (
          <div className="rounded-md border border-border p-2 text-xs text-muted-foreground">
            No AI provider API keys found. Add any of these in `.env`:
            <span className="block mt-1 font-mono text-[11px]">
              OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_AI_API_KEY (or GEMINI_API_KEY), PERPLEXITY_API_KEY
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {[
            "Write 5 hooks for this topic",
            "Rewrite this in stronger tone",
          ].map((preset) => (
            <Button
              key={preset}
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[11px] w-full"
              disabled={isPending || !providers.length}
              onClick={() => void sendPrompt(preset)}
            >
              <WandSparkles className="w-3 h-3 mr-1.5" />
              {preset}
            </Button>
          ))}
        </div>

        <div className="h-[170px] overflow-y-auto rounded-md border border-border bg-muted/20 p-2 space-y-2">
          {showDailyLimitPrompt && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 space-y-2">
              <p className="text-xs font-medium text-destructive">âœ¦ Daily limit reached</p>
              <p className="text-xs text-muted-foreground">
                You've used all 10 free AI requests today. Resets at midnight.
              </p>
              <Link href="/settings">
                <Button type="button" size="sm">Upgrade to Pro -&gt;</Button>
              </Link>
            </div>
          )}
          {messages.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Ask for post drafts, thread ideas, CTA variants, hashtag sets, or tone rewrites.
            </p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`rounded-md px-2.5 py-2 text-xs leading-relaxed ${
                  message.role === "user"
                    ? "ml-5 bg-primary/10 text-foreground"
                    : "mr-5 bg-background border border-border text-foreground"
                }`}
              >
                {message.role === "assistant" && (
                  <div className="flex items-center gap-2 mb-1.5">
                    <Sparkles className="w-3 h-3 text-primary" />
                    <span className="font-medium text-[10px] uppercase text-muted-foreground">AI Response</span>
                    <CharacterCount count={message.content.length} />
                  </div>
                )}
                {message.content}
              </div>
            ))
          )}
        </div>

        {usage && (
          <div className="flex justify-end">
            {usage.plan === "pro" ? (
              <span className="text-xs text-orange-400">âœ¦ Pro -- Unlimited</span>
            ) : usage.unlimited ? (
              <span className="text-xs text-muted-foreground">âœ¦ Own key -- Unlimited</span>
            ) : (
              <span
                className={`text-xs ${
                  usage.used >= usage.limit
                    ? "text-destructive"
                    : usage.used >= 8
                      ? "text-amber-500"
                      : "text-muted-foreground"
                }`}
              >
                âœ¦ {usage.used} / {usage.limit} today
              </span>
            )}
          </div>
        )}

        <Textarea
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Example: Write a short Threads post about discipline and consistency."
          className="resize-none min-h-[82px]"
        />

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Generate, then send to Quick Compose</span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!latestAssistant?.content}
              onClick={() => {
                if (!latestAssistant?.content) return;
                onUseDraft(latestAssistant.content);
                toast({ title: "Inserted", description: "AI draft moved to Quick Compose." });
              }}
            >
              Use in Quick Compose
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isPending || !prompt.trim() || !providers.length}
              onClick={() => void sendPrompt()}
            >
              {isPending ? "Generating..." : "Generate"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentPosts({
  isProPlan,
  onAnalyticsLocked,
}: {
  isProPlan: boolean;
  onAnalyticsLocked: () => void;
}) {
  const { user } = useAuth();

  const { data: posts = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/posts/recent"],
    enabled: !!user?.threadsAccessToken,
  });
  const visiblePosts = posts.slice(0, 8);
  const visiblePostIds = visiblePosts.map((post) => post.id).filter(Boolean);
  const { data: insightsByPostId = {} } = useQuery<Record<string, any>>({
    queryKey: ["/api/posts/recent/insights", visiblePostIds.join(",")],
    enabled: !!user?.threadsAccessToken && visiblePostIds.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        visiblePostIds.map(async (postId: string) => {
          try {
            const insights = await apiRequest("GET", `/api/posts/${postId}/insights`);
            return [postId, insights] as const;
          } catch {
            return [postId, null] as const;
          }
        }),
      );
      return Object.fromEntries(results);
    },
  });

  if (!user?.threadsAccessToken) return null;

  const getRelativeTime = (timestamp: string | number | Date) => {
    const ms = new Date(timestamp).getTime();
    if (Number.isNaN(ms)) return "";

    const diffMs = Math.max(0, Date.now() - ms);
    const minutes = Math.floor(diffMs / (1000 * 60));
    if (minutes < 60) return `${Math.max(1, minutes)}m`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;

    return format(new Date(ms), "MMM d");
  };

  const username = user.threadsUsername || user.email || "Unknown";
  const avatarFallback = username.slice(0, 2).toUpperCase();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">Recent Posts</CardTitle>
          <CardDescription>Repost or quote from here</CardDescription>
        </div>
        {isProPlan ? (
          <Link href="/analytics">
            <Button variant="ghost" size="sm">
              View insights <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={onAnalyticsLocked}>
            View insights <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : posts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No posts yet</p>
        ) : (
          <div
            className="h-[420px] overflow-y-auto rounded-lg bg-slate-950/35 px-2 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/45"
            style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(148,163,184,0.45) transparent" }}
          >
            {visiblePosts.map((post, index) => {
              const insights = insightsByPostId[post.id] || null;
              const topicTag = post.topicTag || post.topic_tag || post.internalTopicTag || null;
              const likeCount = Number(
                insights?.likes ?? post.like_count ?? post.likes ?? post.insights?.likes ?? post.insightsLikes ?? 0,
              ) || 0;
              const repliesCount = Number(
                insights?.replies ?? post.replies_count ?? post.replies ?? post.insights?.replies ?? post.insightsReplies ?? 0,
              ) || 0;
              const repostCount = Number(
                insights?.reposts ?? post.repost_count ?? post.reposts ?? post.insights?.reposts ?? post.insightsReposts ?? 0,
              ) || 0;
              const quoteCount = Number(
                insights?.quotes ?? post.quote_count ?? post.quotes ?? post.insights?.quotes ?? post.insightsQuotes ?? 0,
              ) || 0;
              const viewsCount = Number(
                insights?.views ?? post.views ?? post.view_count ?? post.insights?.views ?? post.insightsViews ?? 0,
              ) || 0;

              return (
                <div
                  key={post.id}
                  className={`py-4 ${index < Math.min(posts.length, 8) - 1 ? "border-b border-border/40" : ""}`}
                >
                <div className="flex items-start gap-3">
                  <Avatar className="w-8 h-8 flex-shrink-0 mt-0.5">
                    <AvatarImage src={user.threadsProfilePicUrl || undefined} />
                    <AvatarFallback className="text-[11px]">{avatarFallback}</AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0 relative pr-10">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[13px] font-semibold text-foreground truncate">{username}</span>
                        {topicTag && (
                          <>
                            <span className="text-xs text-muted-foreground">{"\u203A"}</span>
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-500 truncate">
                              <Sparkles className="w-3 h-3" />
                              {topicTag}
                            </span>
                          </>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {getRelativeTime(post.timestamp)}
                      </span>
                    </div>
                    {post.permalink && (
                      <a
                        href={post.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute right-0 top-4"
                      >
                        <Button size="icon" variant="ghost" className="h-7 w-7">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </a>
                    )}

                    <p className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap">
                      {post.text || "(media post)"}
                    </p>

                    <div className="flex items-center gap-4 mt-2">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        {"\u2661"} {likeCount}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        {"\uD83D\uDCAC"} {repliesCount}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Repeat2 className="w-3 h-3" />
                        {repostCount}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Quote className="w-3 h-3" />
                        {quoteCount}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Eye className="w-3 h-3" />
                        {viewsCount}
                      </span>
                    </div>

                    {post.appTag && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {post.appTag
                          .split(",")
                          .map((tag: string) => tag.trim())
                          .filter((tag: string) => Boolean(tag))
                          .map((tag: string) => (
                            <span
                              key={tag}
                              className="inline-flex items-center rounded-md border border-black/10 bg-white px-2.5 py-1 text-[11px] font-['JetBrains_Mono'] font-extrabold tracking-[0.05em] text-black shadow-[0_1px_4px_rgba(0,0,0,0.25)]"
                            >
                              #{tag.toUpperCase()}
                            </span>
                          ))}
                      </div>
                    )}

                  </div>
                </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
// â”€â”€â”€ Main Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [quickComposeDraft, setQuickComposeDraft] = useState<QuickComposeDraft | null>(null);
  const [devProMode, setDevProMode] = useState(false);
  const [isMarqueePaused, setIsMarqueePaused] = useState(false);
  const { data: scheduledPosts = [], isLoading: loadingScheduled } = useQuery<ScheduledPost[]>({ queryKey: ["/api/posts/scheduled"] });
  const { data: bulkQueues = [], isLoading: loadingBulk } = useQuery<BulkQueueWithItems[]>({ queryKey: ["/api/bulk-queues"] });
  const { data: followUps = [], isLoading: loadingFollowUps } = useQuery<FollowUpThread[]>({ queryKey: ["/api/follow-ups"] });
  const { data: usage } = useQuery<AiUsage>({
    queryKey: ["/api/ai/usage"],
    queryFn: () => apiRequest("GET", "/api/ai/usage"),
  });
  const { data: recentPostsForInsight = [] } = useQuery<DnaPost[]>({
    queryKey: ["/api/posts/recent"],
    queryFn: () => apiRequest("GET", "/api/posts/recent"),
  });
  const { data: dnaData, isLoading: loadingDna } = useQuery<DnaDataResponse>({
    queryKey: ["/api/posts/dna-data"],
    queryFn: () => apiRequest("GET", "/api/posts/dna-data"),
  });
  const { data: analyticsData = null } = useQuery<AnalyticsSummaryResponse | null>({
    queryKey: ["/api/analytics", "summary-only", 10],
    queryFn: async () => {
      try {
        return await apiRequest("GET", "/api/analytics?summaryOnly=true&postsLimit=10");
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!user?.threadsAccessToken,
    retry: false,
  });
  const { data: personaData = null } = useQuery<PersonaDataResponse>({
    queryKey: ["/api/analytics/persona", "dashboard"],
    queryFn: async () => {
      try {
        return await apiRequest("GET", "/api/analytics/persona");
      } catch {
        return null;
      }
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!user?.threadsAccessToken,
    retry: false,
  });
  const scheduledStatusMapRef = useRef<Record<string, string>>({});
  const hasInitializedScheduledStatusRef = useRef(false);
  const followersForNotification = toNumberOrZero(
    user?.threadsFollowerCount ?? analyticsData?.account?.followers_count,
  );

  useEffect(() => {
    const currentStatusMap: Record<string, string> = {};
    for (const post of scheduledPosts) {
      if (!post?.id) continue;
      currentStatusMap[String(post.id)] = String(post.status ?? "");
    }

    if (!hasInitializedScheduledStatusRef.current) {
      scheduledStatusMapRef.current = currentStatusMap;
      hasInitializedScheduledStatusRef.current = true;
      return;
    }

    for (const post of scheduledPosts) {
      if (!post?.id) continue;
      const id = String(post.id);
      const prevStatus = scheduledStatusMapRef.current[id];
      const nextStatus = String(post.status ?? "");
      if (!prevStatus || prevStatus === nextStatus) continue;

      if (prevStatus === "pending" && nextStatus === "published") {
        addNotification({
          type: "success",
          title: "Scheduled post published",
          message: "Your post went live as scheduled",
        });
      } else if (prevStatus === "pending" && nextStatus === "failed") {
        addNotification({
          type: "error",
          title: "Scheduled post failed",
          message: "A scheduled post could not be published — check your connection",
        });
      }
    }

    scheduledStatusMapRef.current = currentStatusMap;
  }, [scheduledPosts]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (toNumberOrZero(dnaData?.count) < 15) return;

    try {
      if (window.localStorage.getItem(DNA_UNLOCK_STORAGE_KEY) === "true") return;
      addNotification({
        type: "dna",
        title: "Performance DNA unlocked",
        message: "15 posts tracked -- your personalized insights are now active",
      });
      window.localStorage.setItem(DNA_UNLOCK_STORAGE_KEY, "true");
    } catch {
      // Ignore localStorage access issues in restricted contexts.
    }
  }, [dnaData?.count]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!user?.threadsAccessToken) return;
    if (followersForNotification <= 0) return;

    try {
      const rawLastCount = window.localStorage.getItem(FOLLOWER_COUNT_STORAGE_KEY);
      const lastCount = rawLastCount ? Number(rawLastCount) : Number.NaN;
      if (Number.isFinite(lastCount) && followersForNotification > lastCount) {
        const gained = followersForNotification - lastCount;
        addNotification({
          type: "info",
          title: "Follower growth detected",
          message: `+${gained.toLocaleString()} followers -- now at ${followersForNotification.toLocaleString()}`,
        });
      }
      window.localStorage.setItem(FOLLOWER_COUNT_STORAGE_KEY, String(followersForNotification));

      const activeAchievement = getActiveFollowerCongratsMilestone(followersForNotification);
      if (!activeAchievement) return;

      const achievedMilestone = activeAchievement.milestone;
      const rawLastMilestone = window.localStorage.getItem(FOLLOWER_MILESTONE_STORAGE_KEY);
      const lastMilestone = rawLastMilestone ? Number(rawLastMilestone) : 0;

      if (achievedMilestone > lastMilestone) {
        const milestoneLabel = formatNum(achievedMilestone);
        addNotification({
          type: "milestone",
          title: activeAchievement.major
            ? "Major milestone reached"
            : `${milestoneLabel} followers reached`,
          message: activeAchievement.major
            ? `${milestoneLabel} followers unlocked -- strong momentum`
            : `Congrats -- you crossed ${milestoneLabel} followers`,
        });
        window.localStorage.setItem(FOLLOWER_MILESTONE_STORAGE_KEY, String(achievedMilestone));
      }
    } catch {
      // Ignore localStorage access issues in restricted contexts.
    }
  }, [followersForNotification, user?.threadsAccessToken]);

  useEffect(() => {
    const syncProMode = () => {
      try {
        setDevProMode(localStorage.getItem("threadflow_dev_pro") === "true");
      } catch {
        setDevProMode(false);
      }
    };

    syncProMode();
    window.addEventListener("focus", syncProMode);
    window.addEventListener("threadflow-pro-mode-change", syncProMode);
    return () => {
      window.removeEventListener("focus", syncProMode);
      window.removeEventListener("threadflow-pro-mode-change", syncProMode);
    };
  }, []);

  const pendingScheduled = scheduledPosts.filter(p => p.status === "pending");
  const publishedPosts = scheduledPosts.filter(p => p.status === "published");
  const lastPublished = publishedPosts.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())[0];
  const runningQueues = bulkQueues.filter(q => q.status === "running");
  const pendingFollowUps = followUps.filter(f => f.status === "pending");
  const isProPlan = devProMode;

  const stats = [
    { title: "Scheduled Posts", value: pendingScheduled.length, icon: Clock, description: lastPublished ? `Last: ${formatDistanceToNow(new Date(lastPublished.scheduledAt), { addSuffix: true })}` : "No posts yet", color: "text-chart-1", bg: "bg-chart-1/10" },
    { title: "Active Queues", value: runningQueues.length, icon: Layers, description: `${bulkQueues.length} total queues`, color: "text-chart-2", bg: "bg-chart-2/10" },
    { title: "Follow-Ups", value: pendingFollowUps.length, icon: Timer, description: "Awaiting send", color: "text-chart-3", bg: "bg-chart-3/10" },
    { title: "Published", value: publishedPosts.length, icon: CheckCircle2, description: lastPublished ? `Last ${formatDistanceToNow(new Date(lastPublished.scheduledAt), { addSuffix: true })}` : "None yet", color: "text-chart-4", bg: "bg-chart-4/10" },
  ];

  const quickActions = [
    { label: "Thread Chain", href: "/chain", icon: Link2, desc: "Post a series instantly", proOnly: true },
    { label: "Bulk Post", href: "/bulk", icon: Layers, desc: "Multiple posts in sequence" },
    { label: "Analytics", href: "/analytics", icon: BarChart2, desc: "View performance insights", proOnly: true },
    { label: "Follow-Up", href: "/followup", icon: Timer, desc: "Schedule a timed reply" },
    { label: "Comments", href: "/comments", icon: MessageSquare, desc: "Manage replies and likes" },
  ];

  const injectDraftIntoQuickCompose = (text: string) => {
    setQuickComposeDraft({ id: Date.now(), text });
  };

  const showAnalyticsLockedToast = () =>
    toast({
      title: "Feature available in Pro",
      description: "Analytics is available on Pro. Turn on Pro from the sidebar to unlock it.",
    });

  const marqueeItems = useMemo(() => {
    return buildTickerItems(
      dnaData,
      recentPostsForInsight,
      user,
      analyticsData,
      personaData,
      publishedPosts.length,
    );
  }, [dnaData, recentPostsForInsight, user, analyticsData, personaData, publishedPosts.length]);
  const marqueeLoopItems = useMemo(() => [...marqueeItems, ...marqueeItems], [marqueeItems]);

  const quickPostCompactStyles = `
    .quick-post-compact > div:first-child {
      padding: 1rem 1rem 0.75rem !important;
    }
    .quick-post-compact > div:nth-child(2) {
      padding: 0 1rem 1rem !important;
    }
    .quick-post-compact form > * + * {
      margin-top: 0.5rem !important;
    }
    .quick-post-compact .space-y-1\\.5 > * + * {
      margin-top: 0.5rem !important;
    }
    .quick-post-compact textarea {
      min-height: 120px !important;
      padding-top: 0.625rem !important;
      padding-bottom: 0.625rem !important;
    }
    .quick-post-compact input {
      padding-top: 0.4rem !important;
      padding-bottom: 0.4rem !important;
      font-size: 0.875rem !important;
    }
    .quick-post-compact .bg-muted\\/20 {
      padding: 0.35rem 0.5rem !important;
    }
    @keyframes marquee {
      0% { transform: translateX(0); }
      100% { transform: translateX(-50%); }
    }
  `;

  return (
    <div className="px-6 pt-3 pb-6 space-y-6 h-full overflow-y-auto">
      <style>{quickPostCompactStyles}</style>
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-bold text-foreground">
          Dashboard
        </h1>
        <span className="text-sm text-muted-foreground">
          Overview of your ThreadFlow activity
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <ProfileCard isProPlan={isProPlan} onAnalyticsLocked={showAnalyticsLockedToast} />
        <div className="col-span-full rounded-lg border border-border/30 bg-muted/30 px-4 py-2 overflow-hidden">
          {loadingDna ? (
            <Skeleton className="h-4 w-64" />
          ) : (
            <div
              className="w-full overflow-hidden"
              onMouseEnter={() => setIsMarqueePaused(true)}
              onMouseLeave={() => setIsMarqueePaused(false)}
            >
              <div
                className="flex w-max items-center whitespace-nowrap"
                style={{
                  animation: "marquee 80s linear infinite",
                  animationPlayState: isMarqueePaused ? "paused" : "running",
                }}
              >
                {marqueeLoopItems.map((item, index) => (
                  <span key={`${item.category}-${item.value}-${index}`} className="inline-flex items-center">
                    <span className={`inline-flex items-baseline gap-1.5 ${item.value.length > 20 ? "mx-8" : "mx-4"}`}>
                      <span
                        className="font-bold tracking-widest"
                        style={{
                          color:
                            item.tone === "milestone-major"
                              ? "#FBBF24"
                              : item.tone === "milestone"
                                ? "#2DD4BF"
                                : "#FB923C",
                          fontSize: "14.4px",
                        }}
                      >
                        {item.value}
                      </span>
                    </span>
                    {index < marqueeLoopItems.length - 1 ? (
                      <span className="text-muted-foreground/30 text-xs mx-2">{" -- "}</span>
                    ) : null}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        {stats.map((stat) => (
          <Card key={stat.title} className="group transition-all duration-200 hover:border-primary/40">
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
              <div className={`p-1.5 rounded-md ${stat.bg}`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              {loadingScheduled || loadingBulk || loadingFollowUps ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-3xl font-bold text-foreground">{stat.value}</div>
              )}
              <p className="text-xs text-muted-foreground mt-1 truncate">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[2fr_3.2fr_3.4fr_3.4fr] gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Quick Actions
            </CardTitle>
            <CardDescription>Jump to any feature</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-1">
            {quickActions.map((action, index) => (
              (() => {
                const isProOnlyLocked = !!(action as any).proOnly && !isProPlan;
                const actionCard = (
                  <div
                    className="relative flex flex-col gap-1 px-3 py-2 rounded-md border border-border hover-elevate cursor-pointer group"
                  >
                    {(action as any).proOnly && (
                      <Crown className="absolute top-2 right-2 w-3.5 h-3.5 text-orange-400" />
                    )}
                    <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 group-hover:bg-primary/20 transition-colors">
                      <action.icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{action.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{action.desc}</p>
                    </div>
                  </div>
                );

                if (isProOnlyLocked) {
                  return (
                    <button
                      key={action.href}
                      type="button"
                      className="text-left"
                      onClick={() =>
                        toast({
                          title: "Feature available in Pro",
                          description: `${action.label} is available on Pro. Turn on Pro from the sidebar to unlock it.`,
                        })
                      }
                    >
                      {actionCard}
                    </button>
                  );
                }

                return (
                  <Link key={action.href} href={action.href} className="text-left">
                    {actionCard}
                  </Link>
                );
              })()
            ))}
          </CardContent>
        </Card>

        <div>
          <PostComposerCard
            title="Quick Post"
            mode="quick"
            description="Publish now or schedule from the dashboard"
            icon={PenSquare}
            className="quick-post-compact"
            injectedDraft={quickComposeDraft}
            onDraftConsumed={() => setQuickComposeDraft(null)}
            testIds={{
              topicInput: "input-quick-compose-topic",
              textarea: "textarea-quick-compose",
              mediaUrl: "input-quick-compose-media-url",
              postNowButton: "button-quick-compose-post-now",
              scheduleButton: "button-quick-compose-schedule",
              confirmScheduleButton: "button-quick-compose-confirm-schedule",
              scheduledDateInput: "input-quick-compose-scheduled-date",
              scheduledTimeInput: "input-quick-compose-scheduled-time",
            }}
          />
        </div>

        <div>
          <AiPostAssistant onUseDraft={injectDraftIntoQuickCompose} />
        </div>

        <div>
          <RecentPosts isProPlan={isProPlan} onAnalyticsLocked={showAnalyticsLockedToast} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">Scheduled Queue</CardTitle>
              <CardDescription>Upcoming posts</CardDescription>
            </div>
            <Link href="/compose">
              <Button variant="ghost" size="sm">
                View all <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {loadingScheduled ? (
              <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : pendingScheduled.length === 0 ? (
              <div
                className="h-[420px] overflow-y-auto flex flex-col items-center justify-center py-8 text-center [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/45"
                style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(148,163,184,0.45) transparent" }}
              >
                <Clock className="w-8 h-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No scheduled posts yet</p>
                <Link href="/compose">
                  <Button size="sm" variant="outline" className="mt-3">Schedule your first post</Button>
                </Link>
              </div>
            ) : (
              <div
                className="h-[420px] overflow-y-auto space-y-2 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/45"
                style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(148,163,184,0.45) transparent" }}
              >
                {pendingScheduled.slice(0, 5).map((post) => (
                  <div key={post.id} className="flex items-start gap-3 p-2.5 rounded-md bg-muted/40">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{post.content}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(post.scheduledAt), "MMM d, h:mm a")}</p>
                    </div>
                    <StatusBadge status={post.status} />
                  </div>
                ))}
                {pendingScheduled.length > 5 && (
                  <p className="text-xs text-center text-muted-foreground pt-1">+{pendingScheduled.length - 5} more</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}









