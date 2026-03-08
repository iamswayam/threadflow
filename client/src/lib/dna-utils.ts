export type DnaPost = {
  id?: string | null;
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

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const DAY_MS = 24 * 60 * 60 * 1000;

export type HookStylePerf = {
  style: string;
  avgReplies: number;
  totalReplies: number;
  count: number;
};

export type TagPerf = {
  tag: string;
  avgViews: number;
  totalViews: number;
  count: number;
  lastUsedMs: number;
};

export type DnaPatterns = {
  postCount: number;
  overallAvgViews: number;
  avgViewsOverall: number;
  bestHookStyle: string | null;
  worstHookStyle: string | null;
  hookStyles: HookStylePerf[];
  hookMultiplier: number | null;
  sweetSpot: {
    min: number;
    max: number;
    optimalLength: number;
  } | null;
  bestHour: number | null;
  bestHourAvgViews: number;
  hourAverages: number[];
  bestDay: number | null;
  bestDayAvgViews: number;
  dayAverages: number[];
  topTag: string | null;
  topTagAvgViews: number;
  tagRankings: TagPerf[];
  ctaBoostPct: number | null;
  ctaAvgRepliesWith: number;
  ctaAvgRepliesWithout: number;
  mediaWinner: "Media" | "Text" | null;
  amOrPmWinner: "Morning" | "Evening" | null;
  amPmPctDiff: number | null;
  topPostsByViews: DnaPost[];
};

export type SignalResult = {
  label: string;
  description: string;
  points: number;
  maxPoints: number;
  status: "pass" | "neutral" | "fail";
};

export type DraftScore = {
  total: number;
  label: "Needs Work" | "Average" | "Good" | "Strong";
  signals: SignalResult[];
  expectedLow: number;
  expectedHigh: number;
  firstLineScore: number;
};

export function toNumberOrZero(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatNum(value: unknown): string {
  const n = toNumberOrZero(value);
  const trim = (num: number) => {
    const rounded = Math.round(num * 10) / 10;
    return Number.isInteger(rounded) ? String(Math.trunc(rounded)) : rounded.toFixed(1);
  };

  if (n >= 1000000) return `${trim(n / 1000000)}M`;
  if (n >= 1000) return `${trim(n / 1000)}K`;
  return `${Math.round(n)}`;
}

export function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function normalizeAppTags(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function getPostViews(post: DnaPost): number {
  return toNumberOrZero(post.views ?? post.insightsViews ?? post.view_count);
}

export function getPostLikes(post: DnaPost): number {
  return toNumberOrZero(post.likes ?? post.insightsLikes ?? post.like_count);
}

export function getPostReplies(post: DnaPost): number {
  return toNumberOrZero(post.replies ?? post.insightsReplies ?? post.replies_count);
}

export function getPostReposts(post: DnaPost): number {
  return toNumberOrZero(post.repost_count ?? post.reposts ?? post.insightsReposts);
}

export function getPostTimestampMs(post: DnaPost): number | null {
  const raw = post.scheduledAt || post.timestamp || post.createdAt;
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function formatHourLabel(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  const hour12 = ((normalized + 11) % 12) + 1;
  const suffix = normalized >= 12 ? "PM" : "AM";
  return `${hour12} ${suffix}`;
}

export function detectCta(text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  if (value.includes("?")) return true;
  return /(comment|reply|share|tell me|drop|let me know|what do you think|save this|follow)/i.test(value);
}

export function inferHookStyle(text: string): string {
  const value = text.trim();
  if (!value) return "unknown";

  if (/^\d+[\.)]\s+/.test(value)) return "list";
  if (/^(how|why|what|when|where|who|is|are|can|should|do|did)\b/i.test(value) || value.includes("?")) {
    return "question";
  }
  if (/^(story|once|today|yesterday|i\s)/i.test(value)) return "story";
  if (/^(stop|never|always|you)\b/i.test(value)) return "command";
  return "statement";
}

export function detectHookStyle(post: DnaPost): string {
  const fromData = typeof post.hookStyle === "string" ? post.hookStyle.trim() : "";
  if (fromData) return fromData.toLowerCase();
  return inferHookStyle(post.text || "");
}

export function detectPostLength(post: DnaPost): number {
  const storedLength = toNumberOrZero(post.postLength);
  if (storedLength > 0) return storedLength;
  const text = post.text || "";
  return text.length;
}

function normalizeStyleKey(style: string): string {
  return style.trim().toLowerCase();
}

export function computeDnaPatterns(postsInput: DnaPost[]): DnaPatterns {
  const posts = Array.isArray(postsInput) ? postsInput : [];

  const viewsValues = posts.map((post) => getPostViews(post)).filter((views) => views > 0);
  const avgViewsOverall =
    viewsValues.length > 0
      ? viewsValues.reduce((sum, value) => sum + value, 0) / viewsValues.length
      : 0;

  const hookStats = new Map<string, { replies: number; count: number }>();
  for (const post of posts) {
    const styleKey = normalizeStyleKey(detectHookStyle(post));
    if (!styleKey || styleKey === "unknown") continue;
    const current = hookStats.get(styleKey) || { replies: 0, count: 0 };
    hookStats.set(styleKey, { replies: current.replies + getPostReplies(post), count: current.count + 1 });
  }

  const hookStyles: HookStylePerf[] = Array.from(hookStats.entries())
    .map(([style, stat]) => ({
      style,
      avgReplies: stat.count > 0 ? stat.replies / stat.count : 0,
      totalReplies: stat.replies,
      count: stat.count,
    }))
    .sort((a, b) => b.avgReplies - a.avgReplies);

  const bestHookStyle = hookStyles[0]?.style ?? null;
  const worstHookStyle = hookStyles.length > 1 ? hookStyles[hookStyles.length - 1]?.style ?? null : null;

  let hookMultiplier: number | null = null;
  if (hookStyles.length > 1 && hookStyles[0].avgReplies > 0) {
    const otherReplies = hookStyles.slice(1).reduce((sum, item) => sum + item.totalReplies, 0);
    const otherCount = hookStyles.slice(1).reduce((sum, item) => sum + item.count, 0);
    const otherAvg = otherCount > 0 ? otherReplies / otherCount : 0;
    if (otherAvg > 0) {
      hookMultiplier = Math.round((hookStyles[0].avgReplies / otherAvg) * 10) / 10;
    }
  }

  const lengthCandidates = posts
    .map((post) => ({ post, length: detectPostLength(post), views: getPostViews(post) }))
    .filter((item) => item.length > 0 && item.views > 0)
    .sort((a, b) => b.views - a.views);

  let sweetSpot: DnaPatterns["sweetSpot"] = null;
  if (lengthCandidates.length > 0) {
    const topCount = Math.max(1, Math.ceil(lengthCandidates.length * 0.3));
    const topSlice = lengthCandidates.slice(0, topCount);
    const lengths = topSlice.map((item) => item.length).sort((a, b) => a - b);
    const min = lengths[0];
    const max = lengths[lengths.length - 1];
    const optimalLength = Math.round(lengths.reduce((sum, value) => sum + value, 0) / lengths.length);
    sweetSpot = { min, max, optimalLength };
  }

  const hourStats = new Map<number, { views: number; count: number }>();
  for (const post of posts) {
    const hour = Number(post.hourOfDay);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;
    const views = getPostViews(post);
    if (views <= 0) continue;
    const current = hourStats.get(hour) || { views: 0, count: 0 };
    hourStats.set(hour, { views: current.views + views, count: current.count + 1 });
  }

  const hourAverages = Array.from({ length: 24 }, (_, hour) => {
    const stat = hourStats.get(hour);
    return stat && stat.count > 0 ? stat.views / stat.count : 0;
  });

  let bestHour: number | null = null;
  let bestHourAvgViews = 0;
  hourAverages.forEach((avg, hour) => {
    if (avg > bestHourAvgViews) {
      bestHourAvgViews = avg;
      bestHour = hour;
    }
  });

  const dayStats = new Map<number, { views: number; count: number }>();
  for (const post of posts) {
    const views = getPostViews(post);
    if (views <= 0) continue;

    let day: number;
    const dayOfWeekRaw = Number(post.dayOfWeek);
    if (Number.isInteger(dayOfWeekRaw) && dayOfWeekRaw >= 0 && dayOfWeekRaw <= 6) {
      day = dayOfWeekRaw;
    } else {
      const timestampMs = getPostTimestampMs(post);
      if (!timestampMs) continue;
      day = new Date(timestampMs).getDay();
    }

    const current = dayStats.get(day) || { views: 0, count: 0 };
    dayStats.set(day, { views: current.views + views, count: current.count + 1 });
  }

  const dayAverages = Array.from({ length: 7 }, (_, day) => {
    const stat = dayStats.get(day);
    return stat && stat.count > 0 ? stat.views / stat.count : 0;
  });

  let bestDay: number | null = null;
  let bestDayAvgViews = 0;
  dayAverages.forEach((avg, day) => {
    if (avg > bestDayAvgViews) {
      bestDayAvgViews = avg;
      bestDay = day;
    }
  });

  const tagStats = new Map<string, { views: number; count: number; lastUsedMs: number }>();
  for (const post of posts) {
    const tags = normalizeAppTags(post.appTag);
    if (!tags.length) continue;
    const views = getPostViews(post);
    const timestampMs = getPostTimestampMs(post) ?? 0;
    for (const tag of tags) {
      const key = tag.trim();
      if (!key) continue;
      const current = tagStats.get(key) || { views: 0, count: 0, lastUsedMs: 0 };
      tagStats.set(key, {
        views: current.views + views,
        count: current.count + 1,
        lastUsedMs: Math.max(current.lastUsedMs, timestampMs),
      });
    }
  }

  const tagRankings: TagPerf[] = Array.from(tagStats.entries())
    .map(([tag, stat]) => ({
      tag,
      avgViews: stat.count > 0 ? stat.views / stat.count : 0,
      totalViews: stat.views,
      count: stat.count,
      lastUsedMs: stat.lastUsedMs,
    }))
    .sort((a, b) => b.avgViews - a.avgViews);

  const topTag = tagRankings[0]?.tag ?? null;
  const topTagAvgViews = tagRankings[0]?.avgViews ?? 0;

  const ctaWith = posts.filter((post) => {
    if (typeof post.hasCta === "boolean") return post.hasCta;
    return detectCta(post.text || "");
  });
  const ctaWithout = posts.filter((post) => {
    if (typeof post.hasCta === "boolean") return !post.hasCta;
    return !detectCta(post.text || "");
  });

  const ctaAvgRepliesWith =
    ctaWith.length > 0
      ? ctaWith.reduce((sum, post) => sum + getPostReplies(post), 0) / ctaWith.length
      : 0;
  const ctaAvgRepliesWithout =
    ctaWithout.length > 0
      ? ctaWithout.reduce((sum, post) => sum + getPostReplies(post), 0) / ctaWithout.length
      : 0;

  let ctaBoostPct: number | null = null;
  if (ctaAvgRepliesWith > 0 && ctaAvgRepliesWithout > 0) {
    ctaBoostPct = Math.round(((ctaAvgRepliesWith - ctaAvgRepliesWithout) / ctaAvgRepliesWithout) * 100);
  }

  const mediaPosts = posts.filter((post) => post.hasMedia === true);
  const textPosts = posts.filter((post) => post.hasMedia === false);
  let mediaWinner: "Media" | "Text" | null = null;
  if (mediaPosts.length > 0 && textPosts.length > 0) {
    const mediaAvg = mediaPosts.reduce((sum, post) => sum + getPostViews(post), 0) / mediaPosts.length;
    const textAvg = textPosts.reduce((sum, post) => sum + getPostViews(post), 0) / textPosts.length;
    mediaWinner = mediaAvg >= textAvg ? "Media" : "Text";
  }

  const morningPosts = posts.filter((post) => {
    const hour = Number(post.hourOfDay);
    return Number.isInteger(hour) && hour >= 6 && hour <= 11;
  });
  const eveningPosts = posts.filter((post) => {
    const hour = Number(post.hourOfDay);
    return Number.isInteger(hour) && hour >= 17 && hour <= 23;
  });

  let amOrPmWinner: "Morning" | "Evening" | null = null;
  let amPmPctDiff: number | null = null;
  if (morningPosts.length > 0 && eveningPosts.length > 0) {
    const morningAvg = morningPosts.reduce((sum, post) => sum + getPostViews(post), 0) / morningPosts.length;
    const eveningAvg = eveningPosts.reduce((sum, post) => sum + getPostViews(post), 0) / eveningPosts.length;
    if (morningAvg > 0 && eveningAvg > 0) {
      amOrPmWinner = morningAvg >= eveningAvg ? "Morning" : "Evening";
      const high = Math.max(morningAvg, eveningAvg);
      const low = Math.min(morningAvg, eveningAvg);
      amPmPctDiff = Math.round(((high - low) / low) * 100);
    }
  }

  const topPostsByViews = [...posts]
    .filter((post) => getPostViews(post) > 0)
    .sort((a, b) => getPostViews(b) - getPostViews(a));

  return {
    postCount: posts.length,
    overallAvgViews: avgViewsOverall,
    avgViewsOverall,
    bestHookStyle,
    worstHookStyle,
    hookStyles,
    hookMultiplier,
    sweetSpot,
    bestHour,
    bestHourAvgViews,
    hourAverages,
    bestDay,
    bestDayAvgViews,
    dayAverages,
    topTag,
    topTagAvgViews,
    tagRankings,
    ctaBoostPct,
    ctaAvgRepliesWith,
    ctaAvgRepliesWithout,
    mediaWinner,
    amOrPmWinner,
    amPmPctDiff,
    topPostsByViews,
  };
}

const HOOK_CONTRAST_WORDS = [
  "never",
  "always",
  "nobody",
  "everyone",
  "stop",
  "wrong",
  "truth",
  "lie",
  "real",
  "fake",
  "myth",
  "secret",
  "hidden",
];

const HOOK_POWER_WORDS = [
  "cremated",
  "destroyed",
  "dead",
  "free",
  "trap",
  "prison",
  "broken",
  "lost",
  "found",
  "afraid",
  "obsessed",
  "starving",
  "haunted",
  "cursed",
  "gifted",
  "wounded",
  "exhausted",
];

const EMOTIONAL_CONTRAST_WORDS = [
  "never",
  "always",
  "nobody",
  "everyone",
  "nothing",
  "everything",
  "wrong",
  "right",
  "truth",
  "lie",
  "real",
  "fake",
  "myth",
  "hidden",
  "stop",
  "start",
  "before",
  "after",
  "without",
  "despite",
];

const EMOTIONAL_POWER_WORDS = [
  "cremated",
  "destroyed",
  "dead",
  "alive",
  "free",
  "trapped",
  "prison",
  "broken",
  "lost",
  "found",
  "afraid",
  "obsessed",
  "starving",
  "haunted",
  "cursed",
  "gifted",
  "wounded",
  "exhausted",
  "silenced",
  "awakened",
  "forgotten",
  "seen",
];

const EMOTIONAL_QUESTION_PHRASES = ["why", "what if", "how long", "when did", "do you"];
const FILLER_HOOK_PHRASES = ["so today", "just wanted", "hey everyone", "in this post", "let me", "going to"];
const CTA_PHRASES = [
  "comment",
  "reply",
  "share",
  "repost",
  "follow",
  "save",
  "tag someone",
  "let me know",
  "what do you",
  "drop a",
  "agree",
  "thoughts",
  "your take",
  "tell me",
  "have you",
  "do you",
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getWords(value: string): string[] {
  return (value.match(/[a-zA-Z0-9']+/g) || []).filter(Boolean);
}

function containsWord(text: string, word: string): boolean {
  if (word.includes(" ")) return text.includes(word);
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

export function extractFirstLine(draft: string): string {
  const text = draft.trim();
  if (!text) return "";

  const newlineIndex = text.indexOf("\n");
  const punctuationMatch = text.match(/[.!?]/);
  const punctuationIndex = punctuationMatch?.index ?? -1;

  let end = text.length;
  if (newlineIndex >= 0) end = Math.min(end, newlineIndex);
  if (punctuationIndex >= 0) end = Math.min(end, punctuationIndex + 1);

  return text.slice(0, end).trim();
}

export function computeFirstLineFeedback(firstLine: string): string[] {
  const line = firstLine.trim();
  if (!line) return ["Start with a clear first line hook."];

  const lower = line.toLowerCase();
  const words = getWords(line);
  const wordCount = words.length;
  const hasContrast = HOOK_CONTRAST_WORDS.some((word) => containsWord(lower, word));
  const hasPower = HOOK_POWER_WORDS.some((word) => containsWord(lower, word));

  const tips: string[] = [];

  if (/^(you|your)\b/i.test(line)) {
    tips.push("Strong opener -- addresses reader directly.");
  }
  if (/^i(?:\s|')/i.test(line)) {
    tips.push("Avoid starting with 'I' -- try leading with the idea.");
  }
  if (wordCount > 15) {
    tips.push("First line is too long -- aim for under 15 words.");
  } else if (wordCount < 6) {
    tips.push("First line is short -- add one specific detail.");
  }
  if (hasContrast) {
    tips.push("Strong hook -- contrast language creates tension.");
  } else {
    tips.push("Add a contrast word to create tension.");
  }
  if (hasPower) {
    tips.push("Strong hook -- unexpected word creates curiosity.");
  } else {
    tips.push("Try one unexpected power word to boost curiosity.");
  }

  return Array.from(new Set(tips)).slice(0, 3);
}

function scoreLabel(score: number): DraftScore["label"] {
  if (score >= 75) return "Strong";
  if (score >= 60) return "Good";
  if (score >= 40) return "Average";
  return "Needs Work";
}

function computeHookSignal(firstLine: string): { signal: SignalResult; firstLineScore: number } {
  const line = firstLine.trim();
  const lower = line.toLowerCase();
  const words = getWords(line);
  const wordCount = words.length;

  let points = 0;
  if (wordCount >= 6 && wordCount <= 15) points += 10;
  if (line.endsWith("?")) points += 8;
  if (HOOK_CONTRAST_WORDS.some((word) => containsWord(lower, word))) points += 8;
  if (HOOK_POWER_WORDS.some((word) => containsWord(lower, word))) points += 7;
  if (/\d/.test(line)) points += 6;
  if (/^(you|your)\b/i.test(line)) points += 5;
  if (/^i(?:\s|')/i.test(line)) points -= 8;
  if (wordCount > 20) points -= 5;
  if (FILLER_HOOK_PHRASES.some((phrase) => lower.includes(phrase))) points -= 5;

  const clamped = clamp(points, 0, 35);
  const firstLineScore = Math.round((clamped / 35) * 100);

  let status: SignalResult["status"] = "fail";
  if (clamped >= 24) status = "pass";
  else if (clamped >= 12) status = "neutral";

  return {
    signal: {
      label: "Hook Quality",
      description: `${wordCount} words in first line`,
      points: clamped,
      maxPoints: 35,
      status,
    },
    firstLineScore,
  };
}

function computeReadabilitySignal(text: string): SignalResult {
  const sentences = text
    .split(/[.!?]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const sentenceList = sentences.length > 0 ? sentences : [text];
  const totalWords = sentenceList.reduce((sum, sentence) => sum + getWords(sentence).length, 0);
  const avgWords = totalWords / Math.max(sentenceList.length, 1);

  let points = 0;
  if (avgWords <= 8) points = 20;
  else if (avgWords <= 12) points = 15;
  else if (avgWords <= 16) points = 10;
  else if (avgWords <= 20) points = 5;

  const status: SignalResult["status"] = points >= 15 ? "pass" : points >= 5 ? "neutral" : "fail";
  return {
    label: "Readability",
    description: `Avg ${avgWords.toFixed(1)} words per sentence`,
    points,
    maxPoints: 20,
    status,
  };
}

function computeEmotionalSignal(text: string): SignalResult {
  const lower = text.toLowerCase();
  const contrastHits = EMOTIONAL_CONTRAST_WORDS.filter((word) => containsWord(lower, word));
  const powerHits = EMOTIONAL_POWER_WORDS.filter((word) => containsWord(lower, word));
  const hasQuestionTrigger = EMOTIONAL_QUESTION_PHRASES.some((phrase) => lower.includes(phrase));

  const contrastPoints = Math.min(9, contrastHits.length * 3);
  const powerPoints = Math.min(12, powerHits.length * 4);
  const questionPoints = hasQuestionTrigger ? 3 : 0;
  const points = Math.min(20, contrastPoints + powerPoints + questionPoints);
  const triggerCount = contrastHits.length + powerHits.length + (hasQuestionTrigger ? 1 : 0);

  const status: SignalResult["status"] = points >= 12 ? "pass" : points >= 6 ? "neutral" : "fail";
  return {
    label: "Emotional Intensity",
    description: `${triggerCount} emotional triggers detected`,
    points,
    maxPoints: 20,
    status,
  };
}

function computeLengthSignal(textLength: number, patterns: DnaPatterns): SignalResult {
  const optimalLength = toNumberOrZero(patterns.sweetSpot?.optimalLength);
  let sweetMin = 120;
  let sweetMax = 280;

  if (optimalLength > 0) {
    sweetMin = clamp(optimalLength - 60, 80, 420);
    sweetMax = clamp(optimalLength + 60, 80, 420);
  }

  if (sweetMin > sweetMax) {
    const swap = sweetMin;
    sweetMin = sweetMax;
    sweetMax = swap;
  }

  let distance = 0;
  if (textLength < sweetMin) distance = sweetMin - textLength;
  else if (textLength > sweetMax) distance = textLength - sweetMax;

  let points = 0;
  let positionLabel = "outside";
  if (distance === 0) {
    points = 15;
    positionLabel = "in";
  } else if (distance <= 100) {
    points = 8;
    positionLabel = "near";
  } else if (distance <= 150) {
    points = 4;
    positionLabel = "near";
  }

  const status: SignalResult["status"] = points === 15 ? "pass" : points >= 4 ? "neutral" : "fail";
  return {
    label: "Length Sweet Spot",
    description: `${textLength} chars -- ${positionLabel} your sweet spot`,
    points,
    maxPoints: 15,
    status,
  };
}

function computeCtaSignal(text: string): SignalResult | null {
  const lowerTail = text.toLowerCase().slice(-120).trim();
  const hasCtaPhrase = CTA_PHRASES.some((phrase) => lowerTail.includes(phrase));
  const endsWithQuestion = lowerTail.endsWith("?");

  let points = 0;
  if (endsWithQuestion) points = Math.max(points, 10);
  if (hasCtaPhrase) points = Math.max(points, 8);

  return {
    label: "CTA Presence",
    description: points > 0 ? "Strong CTA detected" : "No CTA -- consider ending with a question",
    points,
    maxPoints: 10,
    status: points > 0 ? "pass" : "neutral",
  };
}

export function scoreDraft(draft: string, patterns: DnaPatterns): DraftScore {
  const text = draft.trim();
  const firstLine = extractFirstLine(text);
  const textLength = text.length;

  const { signal: hookSignal, firstLineScore } = computeHookSignal(firstLine);
  const readabilitySignal = computeReadabilitySignal(text);
  const emotionalSignal = computeEmotionalSignal(text);
  const lengthSignal = computeLengthSignal(textLength, patterns);

  const signals: SignalResult[] = [hookSignal, readabilitySignal, emotionalSignal, lengthSignal];

  const shouldShowCta = toNumberOrZero(patterns.ctaBoostPct) > 10 || textLength > 100;
  if (shouldShowCta) {
    const ctaSignal = computeCtaSignal(text);
    if (ctaSignal) signals.push(ctaSignal);
  }

  const total = clamp(
    Math.round(signals.reduce((sum, signal) => sum + signal.points, 0)),
    0,
    100,
  );

  const baseline = patterns.overallAvgViews > 0 ? patterns.overallAvgViews : 500;
  const multiplier = total / 60;
  const estimate = baseline * multiplier;
  const expectedLow = Math.round(estimate * 0.75);
  const expectedHigh = Math.round(estimate * 1.25);

  return {
    total,
    label: scoreLabel(total),
    signals,
    expectedLow,
    expectedHigh,
    firstLineScore,
  };
}
