const BASE_URL = "https://graph.threads.net/v1.0";

export function getAccessToken(): string | null {
  return process.env.THREADS_ACCESS_TOKEN || null;
}

export function hasToken(): boolean {
  return !!getAccessToken();
}

async function threadsRequest(path: string, options: RequestInit = {}): Promise<any> {
  const token = getAccessToken();
  if (!token) throw new Error("NO_TOKEN");

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

export async function getProfile(): Promise<{
  id: string;
  username: string;
  name: string;
  threads_profile_picture_url?: string;
  threads_biography?: string;
  followers_count?: number;
}> {
  return threadsRequest("/me?fields=id,username,name,threads_profile_picture_url,threads_biography,followers_count");
}

export async function createPostContainer(
  userId: string,
  params: {
    text: string;
    media_type?: "TEXT" | "IMAGE" | "VIDEO";
    image_url?: string;
    video_url?: string;
    reply_to_id?: string;
  }
): Promise<{ id: string }> {
  const body = new URLSearchParams({
    media_type: params.media_type || "TEXT",
    text: params.text,
  });
  if (params.image_url) body.set("image_url", params.image_url);
  if (params.video_url) body.set("video_url", params.video_url);
  if (params.reply_to_id) body.set("reply_to_id", params.reply_to_id);

  return threadsRequest(`/${userId}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

export async function publishPost(userId: string, containerId: string): Promise<{ id: string }> {
  const body = new URLSearchParams({ creation_id: containerId });
  return threadsRequest(`/${userId}/threads_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

export async function postThread(
  userId: string,
  text: string,
  options: { imageUrl?: string; videoUrl?: string; replyToId?: string } = {}
): Promise<string> {
  let mediaType: "TEXT" | "IMAGE" | "VIDEO" = "TEXT";
  if (options.imageUrl) mediaType = "IMAGE";
  if (options.videoUrl) mediaType = "VIDEO";

  const container = await createPostContainer(userId, {
    text,
    media_type: mediaType,
    image_url: options.imageUrl,
    video_url: options.videoUrl,
    reply_to_id: options.replyToId,
  });

  await new Promise(r => setTimeout(r, 2000));
  const published = await publishPost(userId, container.id);
  return published.id;
}

export async function getUserPosts(userId: string): Promise<any[]> {
  const data = await threadsRequest(
    `/${userId}/threads?fields=id,text,timestamp,media_type,permalink,like_count,replies_count`
  );
  return data.data || [];
}

export async function getReplies(postId: string): Promise<any[]> {
  const data = await threadsRequest(
    `/${postId}/replies?fields=id,text,timestamp,username,profile_picture_url`
  );
  return data.data || [];
}

export async function likePost(mediaId: string, userId: string): Promise<void> {
  await threadsRequest(`/${mediaId}/likes`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ user_id: userId }).toString(),
  });
}
