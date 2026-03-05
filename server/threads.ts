const BASE_URL = "https://graph.threads.net/v1.0";

async function threadsRequest(token: string, path: string, options: RequestInit = {}): Promise<any> {
  const url = `${BASE_URL}${path}`;
  const sep = url.includes("?") ? "&" : "?";
  const finalUrl = `${url}${sep}access_token=${token}`;

  const response = await fetch(finalUrl, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `Threads API error ${response.status}`);
  }
  return data;
}

export async function getProfile(token: string): Promise<{
  id: string; username: string; name: string;
  threads_profile_picture_url?: string; threads_biography?: string;
}> {
  return threadsRequest(token, "/me?fields=id,username,name,threads_profile_picture_url,threads_biography");
}

export interface ThreadReplyItem {
  id: string;
  text?: string;
  timestamp?: string;
  username?: string;
  profile_picture_url?: string;
  permalink?: string;
  root_post?: { id?: string };
  replied_to?: { id?: string };
  is_reply?: boolean;
  is_reply_owned_by_me?: boolean;
  hide_status?: string;
}

export interface ThreadReplyQuota {
  replyQuotaUsage: number;
  quotaTotal: number;
  quotaDurationSeconds: number;
}

function extractFollowersCountFromInsights(data: any): number | undefined {
  for (const item of data.data || []) {
    if (item.name !== "followers_count") continue;
    const values = Array.isArray(item.values) ? item.values : [];
    for (let i = values.length - 1; i >= 0; i--) {
      const value = values[i]?.value;
      if (typeof value === "number") return value;
    }
    const total = item.total_value?.value;
    if (typeof total === "number") return total;
  }
  return undefined;
}

export async function getFollowersCount(token: string, userId?: string): Promise<number | undefined> {
  const paths = [
    ...(userId ? [`/${userId}/threads_insights?metric=followers_count&period=day`] : []),
    "/me/threads_insights?metric=followers_count&period=day",
    "/me/threads_insights?metric=followers_count",
  ];

  for (const path of paths) {
    try {
      const data = await threadsRequest(token, path);
      const followers = extractFollowersCountFromInsights(data);
      if (typeof followers === "number") return followers;
    } catch {
      // Try next fallback path
    }
  }

  try {
    const data = await threadsRequest(token, "/me?fields=followers_count");
    return typeof data.followers_count === "number" ? data.followers_count : undefined;
  } catch {
    return undefined;
  }
}

export async function getFollowersCountInRange(
  token: string,
  userId: string,
  options: { since?: string; until?: string } = {},
): Promise<number | undefined> {
  const pathSuffix = `${options.since ? `&since=${options.since}` : ""}${options.until ? `&until=${options.until}` : ""}`;
  const paths = [
    `/${userId}/threads_insights?metric=followers_count&period=day${pathSuffix}`,
    `/me/threads_insights?metric=followers_count&period=day${pathSuffix}`,
  ];

  for (const path of paths) {
    try {
      const data = await threadsRequest(token, path);
      const followers = extractFollowersCountFromInsights(data);
      if (typeof followers === "number") return followers;
    } catch {
      // Try next fallback path
    }
  }

  return undefined;
}

export async function createPostContainer(token: string, userId: string, params: {
  text: string; media_type?: "TEXT" | "IMAGE" | "VIDEO";
  image_url?: string; video_url?: string; reply_to_id?: string;
  topic_tag?: string; quote_post_id?: string;
}): Promise<{ id: string }> {
  const body = new URLSearchParams({
    media_type: params.media_type || "TEXT",
    text: params.text,
  });
  if (params.image_url) body.set("image_url", params.image_url);
  if (params.video_url) body.set("video_url", params.video_url);
  if (params.reply_to_id) body.set("reply_to_id", params.reply_to_id);
  if (params.topic_tag) body.set("topic_tag", params.topic_tag);
  if (params.quote_post_id) body.set("quote_post_id", params.quote_post_id); // ✅ quote

  return threadsRequest(token, `/${userId}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

export async function publishPost(token: string, userId: string, containerId: string): Promise<{ id: string }> {
  const body = new URLSearchParams({ creation_id: containerId });
  return threadsRequest(token, `/${userId}/threads_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

export async function postThread(token: string, userId: string, text: string,
  options: {
    imageUrl?: string; videoUrl?: string; replyToId?: string;
    topicTag?: string; quotePostId?: string;
  } = {}
): Promise<string> {
  let mediaType: "TEXT" | "IMAGE" | "VIDEO" = "TEXT";
  if (options.imageUrl) mediaType = "IMAGE";
  if (options.videoUrl) mediaType = "VIDEO";

  const container = await createPostContainer(token, userId, {
    text, media_type: mediaType,
    image_url: options.imageUrl,
    video_url: options.videoUrl,
    reply_to_id: options.replyToId,
    topic_tag: options.topicTag,
    quote_post_id: options.quotePostId,
  });
  await new Promise(r => setTimeout(r, 2000));
  const published = await publishPost(token, userId, container.id);
  return published.id;
}

// ✅ Repost a public thread (no text needed — pure repost)
export async function repostThread(token: string, userId: string, postId: string): Promise<string> {
  const body = new URLSearchParams({ repost_id: postId });
  const result = await threadsRequest(token, `/${userId}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  await new Promise(r => setTimeout(r, 2000));
  const published = await publishPost(token, userId, result.id);
  return published.id;
}

// ✅ Quote post — text + the quoted post id
export async function quoteThread(token: string, userId: string, text: string, quotePostId: string, topicTag?: string): Promise<string> {
  return postThread(token, userId, text, { quotePostId, topicTag });
}

// ✅ Account-level insights — views, followers, etc.
export async function getAccountInsights(token: string, userId: string, options: {
  since?: string; // Unix timestamp (seconds)
  until?: string;
} = {}): Promise<{
  views: number;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
}> {
  const metrics = "views,likes,replies,reposts,quotes";
  let path = `/${userId}/threads_insights?metric=${metrics}&period=day`;
  if (options.since) path += `&since=${options.since}`;
  if (options.until) path += `&until=${options.until}`;

  const data = await threadsRequest(token, path);
  const result: any = {};
  for (const item of data.data || []) {
    result[item.name] = item.values?.reduce((sum: number, v: any) => sum + (v.value || 0), 0) ?? item.total_value?.value ?? 0;
  }
  return result;
}

export type FollowerDemographicsBreakdown = "country" | "city" | "age" | "gender";

export interface FollowerDemographicEntry {
  label: string;
  value: number;
}

const countryDisplayNames =
  typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

const countryCodeFallbacks: Record<string, string> = {
  US: "United States",
  USA: "United States",
  IN: "India",
  IND: "India",
  AE: "United Arab Emirates",
  UK: "United Kingdom",
  GBR: "United Kingdom",
  GB: "United Kingdom",
  UAE: "United Arab Emirates",
  CA: "Canada",
  CAN: "Canada",
  AU: "Australia",
  AUS: "Australia",
  NZ: "New Zealand",
  NZL: "New Zealand",
  SG: "Singapore",
  SGP: "Singapore",
  DE: "Germany",
  DEU: "Germany",
  FR: "France",
  FRA: "France",
  IT: "Italy",
  ITA: "Italy",
  ES: "Spain",
  ESP: "Spain",
  NL: "Netherlands",
  NLD: "Netherlands",
  BR: "Brazil",
  BRA: "Brazil",
  MX: "Mexico",
  MEX: "Mexico",
  JP: "Japan",
  JPN: "Japan",
};

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeCountryLabel(value: string): string {
  const trimmed = value.trim().replace(/[_-]+/g, " ");
  if (!trimmed) return trimmed;
  const upper = trimmed.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) {
    const resolved = countryCodeFallbacks[upper] || countryDisplayNames?.of(upper);
    return resolved || upper;
  }
  if (/^[A-Z]{3}$/.test(upper)) {
    return countryCodeFallbacks[upper] || upper;
  }
  return toTitleCase(trimmed);
}

function normalizeGenderLabel(value: string): string {
  const token = value.trim().toUpperCase().replace(/[\s_-]+/g, "");
  if (!token) return value;
  if (token === "M" || token === "MALE" || token === "MAN" || token === "MEN") return "Male";
  if (token === "F" || token === "FEMALE" || token === "WOMAN" || token === "WOMEN") return "Female";
  if (token === "NB" || token === "NONBINARY" || token === "NONBINARYPERSON") return "Non-binary";
  if (token === "U" || token === "UNKNOWN" || token === "UNSPECIFIED" || token === "OTHER") return "Unknown";
  return toTitleCase(value.trim().replace(/[_-]+/g, " "));
}

function normalizeCityLabel(parts: string[]): string {
  if (parts.length === 2) {
    const [aRaw, bRaw] = parts;
    const a = aRaw.trim();
    const b = bRaw.trim();
    const aIsCountryCode = /^[A-Za-z]{2}$/.test(a);
    const bIsCountryCode = /^[A-Za-z]{2}$/.test(b);

    if (aIsCountryCode && !bIsCountryCode) {
      return `${toTitleCase(b)}, ${normalizeCountryLabel(a)}`;
    }
    if (!aIsCountryCode && bIsCountryCode) {
      return `${toTitleCase(a)}, ${normalizeCountryLabel(b)}`;
    }
  }

  return parts.map((part) => toTitleCase(part.trim().replace(/[_-]+/g, " "))).join(" / ");
}

function splitCityPartsFromString(value: string): string[] {
  return value
    .split(/[|,/]/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeDemographicLabel(raw: unknown, breakdown: FollowerDemographicsBreakdown): string | null {
  if (Array.isArray(raw)) {
    const parts = raw.map((item) => String(item || "").trim()).filter(Boolean);
    if (!parts.length) return null;
    if (breakdown === "city") return normalizeCityLabel(parts);
    if (breakdown === "country") return parts.map((part) => normalizeCountryLabel(part)).join(" / ");
    if (breakdown === "gender") return parts.map((part) => normalizeGenderLabel(part)).join(" / ");
    return parts.join(" / ");
  }
  if (typeof raw === "string") {
    const value = raw.trim();
    if (!value) return null;
    if (breakdown === "country") return normalizeCountryLabel(value);
    if (breakdown === "gender") return normalizeGenderLabel(value);
    if (breakdown === "city") {
      const splitParts = splitCityPartsFromString(value);
      if (splitParts.length >= 2 && splitParts.length <= 3) {
        return normalizeCityLabel(splitParts.slice(0, 2));
      }
      return toTitleCase(value.replace(/[_-]+/g, " "));
    }
    return value;
  }
  return null;
}

function extractDemographicEntries(
  data: any,
  breakdown: FollowerDemographicsBreakdown,
): FollowerDemographicEntry[] {
  const totals = new Map<string, number>();
  const add = (label: string | null, value: unknown) => {
    if (!label || typeof value !== "number" || !Number.isFinite(value) || value < 0) return;
    totals.set(label, (totals.get(label) || 0) + value);
  };

  for (const item of data?.data || []) {
    const totalValue = item?.total_value;

    // Some Graph responses flatten as key-value maps.
    if (totalValue && typeof totalValue === "object" && !Array.isArray(totalValue)) {
      for (const [key, value] of Object.entries(totalValue)) {
        if (key === "breakdowns") continue;
        if (typeof value === "number" && Number.isFinite(value)) {
          add(normalizeDemographicLabel(key, breakdown), value);
        }
      }
    }

    const breakdowns = Array.isArray(totalValue?.breakdowns) ? totalValue.breakdowns : [];
    for (const breakdown of breakdowns) {
      const results = Array.isArray(breakdown?.results) ? breakdown.results : [];
      for (const result of results) {
        const label =
          normalizeDemographicLabel(result?.dimension_values, breakdown) ||
          normalizeDemographicLabel(result?.dimension_value, breakdown) ||
          normalizeDemographicLabel(result?.label, breakdown) ||
          normalizeDemographicLabel(result?.name, breakdown) ||
          normalizeDemographicLabel(result?.key, breakdown);
        const value =
          typeof result?.value === "number"
            ? result.value
            : typeof result?.total_value?.value === "number"
              ? result.total_value.value
              : null;
        add(label, value);
      }
    }
  }

  return Array.from(totals.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export async function getFollowerDemographics(
  token: string,
  userId: string,
  breakdown: FollowerDemographicsBreakdown,
): Promise<FollowerDemographicEntry[]> {
  const paths = [
    `/${userId}/threads_insights?metric=follower_demographics&period=lifetime&breakdown=${encodeURIComponent(breakdown)}`,
    `/me/threads_insights?metric=follower_demographics&period=lifetime&breakdown=${encodeURIComponent(breakdown)}`,
  ];

  let lastError: Error | null = null;
  for (const path of paths) {
    try {
      const data = await threadsRequest(token, path);
      return extractDemographicEntries(data, breakdown);
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err?.message || err));
    }
  }

  if (lastError) throw lastError;
  return [];
}

// ✅ Per-post insights — views, likes, replies, reposts, quotes, shares, clicks
export async function getPostInsights(token: string, postId: string): Promise<{
  views: number; likes: number; replies: number;
  reposts: number; quotes: number; shares: number; clicks: number;
}> {
  const baseResult: any = { views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0, shares: 0, clicks: 0 };
  const mapInsights = (data: any) => {
    const result = { ...baseResult };
    for (const item of data.data || []) {
      result[item.name] = item.values?.[0]?.value ?? item.total_value?.value ?? 0;
    }
    return result;
  };

  try {
    const metrics = "views,likes,replies,reposts,quotes,shares,clicks";
    const data = await threadsRequest(token, `/${postId}/insights?metric=${metrics}`);
    return mapInsights(data);
  } catch {
    // Fallback to core metrics for accounts/posts where shares/clicks are not available.
    const metrics = "views,likes,replies,reposts,quotes";
    const data = await threadsRequest(token, `/${postId}/insights?metric=${metrics}`);
    return mapInsights(data);
  }
}

export async function deletePost(accessToken: string, postId: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/${postId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.ok) return;

  let message = `Threads API error ${response.status}`;
  try {
    const data = await response.json();
    message = data?.error?.message || message;
  } catch {
    // Ignore parse failures and keep default message.
  }
  throw new Error(message);
}
// Get recent posts with full fields including engagement counts
export async function getUserPosts(token: string, userId: string, limit = 25): Promise<any[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const collected: any[] = [];
  let after: string | undefined = undefined;

  while (collected.length < safeLimit) {
    const remaining = safeLimit - collected.length;
    const pageSize = Math.min(remaining, 100);
    let path = `/${userId}/threads?fields=id,text,timestamp,media_type,permalink,like_count,replies_count,repost_count,quote_count,views,topic_tag&limit=${pageSize}`;
    if (after) path += `&after=${encodeURIComponent(after)}`;

    const page = await threadsRequest(token, path);
    const pageData = page.data || [];
    if (!Array.isArray(pageData) || pageData.length === 0) break;

    collected.push(...pageData);
    after = page.paging?.cursors?.after;
    if (!after && typeof page.paging?.next === "string") {
      try {
        const nextUrl = new URL(page.paging.next);
        after = nextUrl.searchParams.get("after") || undefined;
      } catch {
        after = undefined;
      }
    }
    if (!after) break;
  }

  return collected.slice(0, safeLimit);
}

export async function getReplies(token: string, postId: string): Promise<any[]> {
  const data = await threadsRequest(
    token,
    `/${postId}/replies?fields=id,text,timestamp,username,profile_picture_url,permalink,root_post,replied_to,is_reply,is_reply_owned_by_me,hide_status`,
  );
  return data.data || [];
}

export async function getConversationReplies(token: string, postId: string, limit = 200): Promise<ThreadReplyItem[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const collected: ThreadReplyItem[] = [];
  let after: string | undefined = undefined;

  while (collected.length < safeLimit) {
    const remaining = safeLimit - collected.length;
    const pageSize = Math.min(remaining, 100);
    let path =
      `/${postId}/conversation?fields=id,text,timestamp,username,profile_picture_url,permalink,root_post,replied_to,is_reply,is_reply_owned_by_me,hide_status` +
      `&reverse=false&limit=${pageSize}`;
    if (after) path += `&after=${encodeURIComponent(after)}`;

    const page = await threadsRequest(token, path);
    const pageData = Array.isArray(page?.data) ? (page.data as ThreadReplyItem[]) : [];
    if (pageData.length === 0) break;

    collected.push(...pageData);
    after = page?.paging?.cursors?.after;
    if (!after && typeof page?.paging?.next === "string") {
      try {
        const nextUrl = new URL(page.paging.next);
        after = nextUrl.searchParams.get("after") || undefined;
      } catch {
        after = undefined;
      }
    }
    if (!after) break;
  }

  return collected.slice(0, safeLimit);
}

export async function setReplyHiddenStatus(token: string, replyId: string, hide: boolean): Promise<void> {
  const body = new URLSearchParams({ hide: hide ? "true" : "false" });
  await threadsRequest(token, `/${replyId}/manage_reply`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

export async function getReplyQuotaUsage(token: string, userId: string): Promise<ThreadReplyQuota | null> {
  try {
    const data = await threadsRequest(
      token,
      `/${userId}/threads_publishing_limit?fields=reply_quota_usage,reply_config`,
    );
    const first = Array.isArray(data?.data) ? data.data[0] : undefined;
    if (!first) return null;
    const usage = typeof first.reply_quota_usage === "number" ? first.reply_quota_usage : 0;
    const total = typeof first.reply_config?.quota_total === "number" ? first.reply_config.quota_total : 0;
    const duration = typeof first.reply_config?.quota_duration === "number" ? first.reply_config.quota_duration : 0;
    return {
      replyQuotaUsage: usage,
      quotaTotal: total,
      quotaDurationSeconds: duration,
    };
  } catch {
    return null;
  }
}

export async function likePost(token: string, mediaId: string, userId: string): Promise<void> {
  await threadsRequest(token, `/${mediaId}/likes`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ user_id: userId }).toString(),
  });
}

// ✅ Thread chain — each post replies to the previous one
export async function postThreadChain(
  token: string,
  userId: string,
  posts: string[],
  topicTag?: string,
  onProgress?: (index: number, postId: string) => void
): Promise<string[]> {
  const publishedIds: string[] = [];
  let previousPostId: string | undefined = undefined;

  for (let i = 0; i < posts.length; i++) {
    const postId = await postThread(token, userId, posts[i], {
      replyToId: previousPostId,
      topicTag: i === 0 ? topicTag : undefined,
    });
    publishedIds.push(postId);
    previousPostId = postId;
    if (onProgress) onProgress(i, postId);
    if (i < posts.length - 1) await new Promise(r => setTimeout(r, 1500));
  }

  return publishedIds;
}

