import { useEffect, useState } from "react";
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
  Quote, Link2, ExternalLink, Sparkles, WandSparkles, Users, AlertCircle, Eye,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PostComposerCard } from "@/components/post-composer-card";
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

function ProfileCard() {
  const { user } = useAuth();
  const { data: profile, isLoading } = useQuery<any>({
    queryKey: ["/api/profile"],
    retry: false,
    enabled: !!user?.threadsAccessToken,
  });

  if (!user?.threadsAccessToken) {
    return (
      <Card className="col-span-full">
        <CardContent className="flex items-center gap-4 py-5">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-500/10 flex-shrink-0">
            <Zap className="w-5 h-5 text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground text-sm">Threads account not connected</p>
            <p className="text-xs text-muted-foreground mt-0.5">Connect your Threads API credentials to start posting and scheduling.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-2 h-2 rounded-full bg-status-offline" />
            <span className="text-xs text-muted-foreground">Disconnected</span>
          </div>
          <Link href="/settings">
            <Button size="sm" variant="outline">Connect Now</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="col-span-full">
        <CardContent className="flex items-center gap-4 py-5">
          <Skeleton className="w-12 h-12 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2"><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-56" /></div>
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
    <Card className="col-span-full">
      <CardContent className="flex flex-wrap items-center gap-4 py-5">
        <Avatar className="w-12 h-12 flex-shrink-0">
          <AvatarImage src={displayProfile.threads_profile_picture_url} />
          <AvatarFallback className="bg-primary/10 text-primary text-base font-bold">
            {displayProfile.username?.[0]?.toUpperCase() || "T"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-foreground">
            {displayProfile.name || displayProfile.username}
            <span className="text-sm font-medium ml-1 text-username">@{displayProfile.username}</span>
          </p>
          <div className="flex items-center gap-1 text-xs mt-0.5 text-usernameaccent">
            <Users className="w-3.5 h-3.5" />
            <span>
              {typeof displayProfile.followers_count === "number"
                ? `${displayProfile.followers_count.toLocaleString()} followers`
                : "Followers unavailable"}
            </span>
          </div>
          {displayProfile.threads_biography && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{displayProfile.threads_biography}</p>
          )}
          {user?.defaultTopic && (
            <p className="text-xs text-primary mt-0.5">✦ {user.defaultTopic} (default topic)</p>
          )}
        </div>
        <div className="flex items-center gap-4 ml-auto flex-shrink-0">
          <Link href="/analytics">
            <Button size="sm" variant="outline" className="text-xs">
              <BarChart2 className="w-3.5 h-3.5 mr-1.5" /> Analytics
            </Button>
          </Link>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-status-online" />
            <span className="text-xs text-muted-foreground">Connected</span>
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
  const { data: usageData } = useQuery<AiUsage>({
    queryKey: ["/api/ai/usage"],
    queryFn: () => apiRequest("GET", "/api/ai/usage"),
  });

  useEffect(() => {
    if (usageData) setUsage(usageData);
  }, [usageData]);

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

        <div className="flex flex-wrap gap-1.5">
          {[
            "Write 5 hooks for this topic",
            "Rewrite this in stronger tone",
            "Make this under 280 chars",
          ].map((preset) => (
            <Button
              key={preset}
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
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
              <p className="text-xs font-medium text-destructive">✦ Daily limit reached</p>
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

        {usage && !usage.unlimited && (
          <div className="flex justify-end">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                usage.used >= usage.limit
                  ? "border-destructive/40 text-destructive bg-destructive/10"
                  : usage.used >= 8
                    ? "border-amber-500/40 text-amber-500 bg-amber-500/10"
                    : "border-border text-muted-foreground bg-muted/30"
              }`}
            >
              ✦ {usage.used} / {usage.limit} AI requests today
            </span>
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

function RecentPosts() {
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
        <Link href="/analytics">
          <Button variant="ghost" size="sm">
            View insights <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </Link>
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
                        <span className="text-sm font-semibold text-foreground truncate">{username}</span>
                        {topicTag && (
                          <>
                            <span className="text-xs text-muted-foreground">{"\u203A"}</span>
                            <span className="inline-flex items-center gap-1 text-sm font-semibold text-sky-500 truncate">
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

                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
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
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary/10 text-primary border border-primary/20"
                            >
                              {tag}
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
// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [quickComposeDraft, setQuickComposeDraft] = useState<QuickComposeDraft | null>(null);
  const { data: scheduledPosts = [], isLoading: loadingScheduled } = useQuery<ScheduledPost[]>({ queryKey: ["/api/posts/scheduled"] });
  const { data: bulkQueues = [], isLoading: loadingBulk } = useQuery<BulkQueueWithItems[]>({ queryKey: ["/api/bulk-queues"] });
  const { data: followUps = [], isLoading: loadingFollowUps } = useQuery<FollowUpThread[]>({ queryKey: ["/api/follow-ups"] });

  const pendingScheduled = scheduledPosts.filter(p => p.status === "pending");
  const publishedPosts = scheduledPosts.filter(p => p.status === "published");
  const lastPublished = publishedPosts.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())[0];
  const runningQueues = bulkQueues.filter(q => q.status === "running");
  const pendingFollowUps = followUps.filter(f => f.status === "pending");

  const stats = [
    { title: "Scheduled Posts", value: pendingScheduled.length, icon: Clock, description: lastPublished ? `Last: ${formatDistanceToNow(new Date(lastPublished.scheduledAt), { addSuffix: true })}` : "No posts yet", color: "text-chart-1", bg: "bg-chart-1/10" },
    { title: "Active Queues", value: runningQueues.length, icon: Layers, description: `${bulkQueues.length} total queues`, color: "text-chart-2", bg: "bg-chart-2/10" },
    { title: "Follow-Ups", value: pendingFollowUps.length, icon: Timer, description: "Awaiting send", color: "text-chart-3", bg: "bg-chart-3/10" },
    { title: "Published", value: publishedPosts.length, icon: CheckCircle2, description: lastPublished ? `Last ${formatDistanceToNow(new Date(lastPublished.scheduledAt), { addSuffix: true })}` : "None yet", color: "text-chart-4", bg: "bg-chart-4/10" },
  ];

  const quickActions = [
    { label: "Thread Chain", href: "/chain", icon: Link2, desc: "Post a series instantly" },
    { label: "Bulk Post", href: "/bulk", icon: Layers, desc: "Multiple posts in sequence" },
    { label: "Analytics", href: "/analytics", icon: BarChart2, desc: "View performance insights" },
    { label: "Follow-Up", href: "/followup", icon: Timer, desc: "Schedule a timed reply" },
    { label: "Comments", href: "/comments", icon: MessageSquare, desc: "Manage replies and likes" },
  ];

  const injectDraftIntoQuickCompose = (text: string) => {
    setQuickComposeDraft({ id: Date.now(), text });
  };

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of your ThreadFlow activity</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <ProfileCard />
        {stats.map((stat) => (
          <Card key={stat.title} className="group transition-all duration-200 hover:border-primary/40">
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
              <div className={`p-1.5 rounded-md ${stat.bg}`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Shared Quick Compose card */}
        <PostComposerCard
          title="Quick Post"
          mode="quick"
          description="Publish now or schedule from the dashboard"
          icon={PenSquare}
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

        <AiPostAssistant onUseDraft={injectDraftIntoQuickCompose} />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Quick Actions
            </CardTitle>
            <CardDescription>Jump to any feature</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {quickActions.map((action, index) => (
              <Link 
                key={action.href} 
                href={action.href}
                className={index === quickActions.length - 1 && quickActions.length % 2 !== 0 ? "col-span-2" : ""}
              >
                <div className="flex flex-col gap-2 p-3 rounded-md border border-border hover-elevate cursor-pointer group">
                  <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <action.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{action.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{action.desc}</p>
                  </div>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ✅ Recent posts with repost/quote */}
        <RecentPosts />

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



