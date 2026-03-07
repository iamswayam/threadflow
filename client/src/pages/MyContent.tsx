import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Hash,
  Calendar,
  ExternalLink,
  FileText,
  Eye,
  Heart,
  MessageCircle,
  Repeat2,
  TrendingUp,
  Trash2,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";
import type { ScheduledPost } from "@shared/schema";

const DELETED_TAG = "__deleted__";

function StatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    {
      label: string;
      variant: "default" | "secondary" | "destructive" | "outline";
    }
  > = {
    pending: { label: "Pending", variant: "secondary" },
    published: { label: "Published", variant: "default" },
    sent: { label: "Sent", variant: "default" },
    failed: { label: "Failed", variant: "destructive" },
    running: { label: "Running", variant: "default" },
    completed: { label: "Completed", variant: "default" },
    deleted: { label: "Deleted", variant: "destructive" },
  };
  const cfg = map[status] || { label: status, variant: "outline" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

type PostInsightMetrics = {
  views?: number;
  likes?: number;
  replies?: number;
  reposts?: number;
  quotes?: number;
};

type PostWithInsights = ScheduledPost & {
  insights?: PostInsightMetrics | null;
};

type ContentListItem =
  | { kind: "single"; post: PostWithInsights }
  | { kind: "chain"; root: PostWithInsights; followUps: PostWithInsights[] };

type TagInsights = {
  tag: string;
  totalPosts: number;
  postsWithInsights: number;
  totals: {
    views: number;
    likes: number;
    replies: number;
    reposts: number;
    quotes: number;
  };
  averages: { views: number; likes: number; replies: number } | null;
  bestPost: {
    content: string;
    threadsPostId?: string;
    views?: number;
    likes?: number;
  } | null;
  posts: PostWithInsights[];
};

function toMetric(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function getInsights(post: PostWithInsights): PostInsightMetrics {
  return {
    views: toMetric(post.insights?.views ?? (post as any).insightsViews),
    likes: toMetric(post.insights?.likes ?? (post as any).insightsLikes),
    replies: toMetric(post.insights?.replies ?? (post as any).insightsReplies),
    reposts: toMetric(post.insights?.reposts ?? (post as any).insightsReposts),
    quotes: toMetric(post.insights?.quotes ?? (post as any).insightsQuotes),
  };
}

const CHAIN_MAX_GAP_MS = 2 * 60 * 1000;

function getPostSortTime(post: PostWithInsights): number {
  const raw = (post as any).createdAt ?? post.scheduledAt;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function normalizeTopicTag(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

function hasAppTag(post: PostWithInsights): boolean {
  return Boolean(post.appTag && post.appTag.trim().length > 0);
}

function buildChainAwareItems(posts: PostWithInsights[]): ContentListItem[] {
  const items: ContentListItem[] = [];
  let index = 0;

  while (index < posts.length) {
    const run: PostWithInsights[] = [posts[index]];
    let cursor = index + 1;

    while (cursor < posts.length) {
      const previous = posts[cursor - 1];
      const current = posts[cursor];
      const gapMs = Math.abs(getPostSortTime(previous) - getPostSortTime(current));
      const sameTopic = normalizeTopicTag(previous.topicTag) === normalizeTopicTag(current.topicTag);

      if (gapMs <= CHAIN_MAX_GAP_MS && sameTopic) {
        run.push(current);
        cursor += 1;
        continue;
      }

      break;
    }

    const root = run[run.length - 1];
    const followUps = [...run.slice(0, -1)].reverse();
    const rootHasTag = hasAppTag(root);
    const followUpsHaveNoTags = followUps.every((post) => !hasAppTag(post));
    const allPostsInRunHaveNoTag = run.every((post) => !hasAppTag(post));
    const likelyChain =
      run.length >= 3 &&
      (
        (rootHasTag && followUpsHaveNoTags) ||
        // Legacy chains created before root APP_TAG support.
        allPostsInRunHaveNoTag
      );

    if (likelyChain) {
      items.push({ kind: "chain", root, followUps });
      index += run.length;
      continue;
    }

    items.push({ kind: "single", post: posts[index] });
    index += 1;
  }

  return items;
}

export default function MyContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [confirmDeletePostId, setConfirmDeletePostId] = useState<string | null>(null);
  const [devProMode, setDevProMode] = useState(false);
  const [tagSearchInput, setTagSearchInput] = useState("");
  const [expandedChainRoots, setExpandedChainRoots] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<"date" | "views" | "likes" | "replies">("date");

  const isDeletedView = selectedTag === DELETED_TAG;
  const isProPlan = devProMode;

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

  useEffect(() => {
    if (!isProPlan && selectedTag && selectedTag !== DELETED_TAG) {
      setSelectedTag(null);
    }
  }, [isProPlan, selectedTag]);

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem("tf_token");
    void fetch("/api/posts/refresh-insights", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!cancelled && res.ok) {
          queryClient.invalidateQueries({ queryKey: ["/api/posts/my-content"] });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  const { data: tags = [], isLoading: loadingTags } = useQuery<string[]>({
    queryKey: ["/api/posts/tags"],
    queryFn: () => apiRequest("GET", "/api/posts/tags"),
  });

  const { data: allPosts = [] } = useQuery<ScheduledPost[]>({
    queryKey: ["/api/posts/my-content"],
    queryFn: () => apiRequest("GET", "/api/posts/my-content"),
  });

  const { data: posts = [], isLoading: loadingPosts } = useQuery<ScheduledPost[]>({
    queryKey: ["/api/posts/my-content", selectedTag],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/posts/my-content${selectedTag ? `?tag=${encodeURIComponent(selectedTag)}` : ""}`,
      ),
    enabled: selectedTag === null,
  });

  const { data: deletedPosts = [], isLoading: loadingDeleted } = useQuery<ScheduledPost[]>({
    queryKey: ["/api/posts/deleted"],
    queryFn: () => apiRequest("GET", "/api/posts/deleted"),
  });

  const { data: tagInsights, isLoading: loadingInsights } = useQuery<TagInsights>({
    queryKey: ["/api/posts/tag-insights", selectedTag],
    queryFn: () =>
      apiRequest("GET", `/api/posts/tag-insights?tag=${encodeURIComponent(selectedTag!)}`),
    enabled: !!selectedTag && selectedTag !== DELETED_TAG,
  });

  const allPostsLiveInsightTargets = posts
    .filter((post) => Boolean(post.threadsPostId))
    .slice(0, 30);

  const { data: allPostsLiveInsights = {} } = useQuery<Record<string, PostInsightMetrics>>({
    queryKey: [
      "/api/posts/my-content/live-insights",
      allPostsLiveInsightTargets.map((post) => post.id).join(","),
    ],
    enabled: selectedTag === null && allPostsLiveInsightTargets.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        allPostsLiveInsightTargets.map(async (post) => {
          try {
            const live = await apiRequest(
              "GET",
              `/api/posts/${encodeURIComponent(post.threadsPostId!)}/insights`,
            );
            return [
              post.id,
              {
                views: toMetric(live?.views),
                likes: toMetric(live?.likes),
                replies: toMetric(live?.replies),
                reposts: toMetric(live?.reposts),
                quotes: toMetric(live?.quotes),
              } satisfies PostInsightMetrics,
            ] as const;
          } catch {
            return [post.id, {} satisfies PostInsightMetrics] as const;
          }
        }),
      );
      return Object.fromEntries(results);
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: (postId: string) => apiRequest("DELETE", `/api/posts/${postId}`),
    onSuccess: (result: any) => {
      if (result?.deletedFromThreads === false) {
        toast({
          title: "Moved to Deleted",
          description: "Could not delete from Threads. Reconnect Threads in Settings and try again.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Moved to Deleted" });
      }
      setConfirmDeletePostId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/posts/my-content"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/deleted"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/tag-insights"] });
    },
    onError: (err: any) => {
      toast({
        title: "Delete failed",
        description: err?.message || "Unable to delete post",
        variant: "destructive",
      });
    },
  });

  const recoverPostMutation = useMutation({
    mutationFn: (postId: string) => apiRequest("POST", `/api/posts/${postId}/recover`),
    onSuccess: () => {
      toast({ title: "Post recovered" });
      setConfirmDeletePostId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/posts/my-content"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/deleted"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/tag-insights"] });
    },
    onError: (err: any) => {
      toast({
        title: "Recover failed",
        description: err?.message || "Unable to recover post",
        variant: "destructive",
      });
    },
  });

  const getTagCount = (tag: string) =>
    allPosts.filter((p) => p.appTag?.split(",").map((t) => t.trim()).includes(tag)).length;
  const visibleTags = tags.filter((tag) => getTagCount(tag) > 0);
  const filteredVisibleTags = visibleTags.filter((tag) =>
    tagSearchInput.trim() ? tag.toLowerCase().includes(tagSearchInput.trim().toLowerCase()) : true,
  );
  const totalPosts = allPosts.length;
  const deletedCount = deletedPosts.length;

  const displayPosts: PostWithInsights[] = isDeletedView
    ? (deletedPosts as PostWithInsights[])
    : selectedTag
      ? (tagInsights?.posts ?? [])
      : (posts as PostWithInsights[]);

  const loadingDisplayPosts =
    selectedTag === null ? loadingPosts : isDeletedView ? loadingDeleted : loadingInsights;

  const latestPost =
    selectedTag && !isDeletedView && displayPosts.length > 0
      ? [...displayPosts].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )[0]
      : null;

  const contentItems = useMemo<ContentListItem[]>(() => {
    if (selectedTag === null && !isDeletedView) {
      const grouped = buildChainAwareItems(displayPosts);
      const followUpIds = new Set<string>();
      const followUpThreadsIds = new Set<string>();

      for (const item of grouped) {
        if (item.kind !== "chain") continue;
        for (const followUp of item.followUps) {
          followUpIds.add(followUp.id);
          if (followUp.threadsPostId) {
            followUpThreadsIds.add(followUp.threadsPostId);
          }
        }
      }

      // Safety net: never render chain follow-ups as standalone cards.
      return grouped.filter((item) => {
        if (item.kind !== "single") return true;
        if (followUpIds.has(item.post.id)) return false;
        if (item.post.threadsPostId && followUpThreadsIds.has(item.post.threadsPostId)) return false;
        return true;
      });
    }
    return displayPosts.map((post) => ({ kind: "single", post }));
  }, [displayPosts, isDeletedView, selectedTag]);

  const getSortableMetric = (
    post: PostWithInsights,
    metric: "views" | "likes" | "replies",
  ): number | undefined => {
    const stored = getInsights(post);
    const live = selectedTag === null ? allPostsLiveInsights[post.id] : undefined;
    if (metric === "views") return live?.views ?? stored.views;
    if (metric === "likes") return live?.likes ?? stored.likes;
    return live?.replies ?? stored.replies;
  };

  const sortedContentItems = useMemo<ContentListItem[]>(() => {
    const sorted = [...contentItems];
    const itemPost = (item: ContentListItem) => (item.kind === "single" ? item.post : item.root);

    if (sortBy === "date") {
      return sorted.sort((a, b) => getPostSortTime(itemPost(b)) - getPostSortTime(itemPost(a)));
    }

    const metricKey = sortBy;
    return sorted.sort((a, b) => {
      const aVal = getSortableMetric(itemPost(a), metricKey);
      const bVal = getSortableMetric(itemPost(b), metricKey);
      if (aVal === undefined && bVal === undefined) return 0;
      if (aVal === undefined) return 1;
      if (bVal === undefined) return -1;
      return bVal - aVal;
    });
  }, [contentItems, sortBy, selectedTag, allPostsLiveInsights]);

  const toggleChainRoot = (rootId: string) => {
    setExpandedChainRoots((prev) => ({ ...prev, [rootId]: !prev[rootId] }));
  };

  const renderPostCard = (
    post: PostWithInsights,
    options?: {
      key?: string;
      isFollowUp?: boolean;
      onToggleChain?: () => void;
    },
  ) => {
    const isChainRoot = typeof options?.onToggleChain === "function";
    const storedInsights = getInsights(post);
    const liveInsights = selectedTag === null ? allPostsLiveInsights[post.id] : undefined;
    const insights: PostInsightMetrics = {
      views: liveInsights?.views ?? storedInsights.views,
      likes: liveInsights?.likes ?? storedInsights.likes,
      replies: liveInsights?.replies ?? storedInsights.replies,
      reposts: liveInsights?.reposts ?? storedInsights.reposts,
      quotes: liveInsights?.quotes ?? storedInsights.quotes,
    };
    const hasMetrics =
      (insights.views ?? 0) > 0 ||
      (insights.likes ?? 0) > 0 ||
      (insights.replies ?? 0) > 0 ||
      (insights.reposts ?? 0) > 0;
    const deletedAtValue = (post as any).deletedAt ? new Date((post as any).deletedAt) : null;
    const deletedTimeText =
      deletedAtValue && !Number.isNaN(deletedAtValue.getTime())
        ? formatDistanceToNow(deletedAtValue, { addSuffix: true })
        : null;

    return (
      <div
        key={options?.key ?? post.id}
        onClick={options?.onToggleChain}
        className={`${options?.isFollowUp ? "p-3.5" : "p-4"} rounded-lg border transition-all duration-150 ${
          isDeletedView
            ? "border-destructive/35 border-l-4 bg-[rgba(55,22,22,0.6)] opacity-80"
            : options?.isFollowUp
              ? "border-white/10 bg-[linear-gradient(165deg,rgba(16,19,26,0.96),rgba(11,13,19,0.96))] shadow-[0_4px_14px_rgba(0,0,0,0.22)]"
              : "border-white/10 bg-[linear-gradient(165deg,rgba(18,21,29,0.98),rgba(10,12,18,0.98))] shadow-[0_10px_30px_rgba(0,0,0,0.32)] hover:border-primary/50 hover:bg-primary/[0.02]"
        } ${isChainRoot ? "cursor-pointer" : ""}`}
      >
        <div className="space-y-2.5 min-w-0">
          <p className="text-sm text-foreground line-clamp-2 leading-relaxed overflow-hidden">{post.content}</p>

          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0 space-y-2">
              {hasMetrics ? (
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  {(insights.views ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[13px] font-semibold text-slate-100">
                      <Eye className="w-4 h-4 text-sky-300" />
                      {Number(insights.views).toLocaleString()}
                    </span>
                  )}
                  {(insights.likes ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[13px] font-semibold text-slate-100">
                      <Heart className="w-4 h-4 text-rose-300" />
                      {Number(insights.likes).toLocaleString()}
                    </span>
                  )}
                  {(insights.replies ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[13px] font-semibold text-slate-100">
                      <MessageCircle className="w-4 h-4 text-amber-300" />
                      {Number(insights.replies).toLocaleString()}
                    </span>
                  )}
                  {(insights.reposts ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[13px] font-semibold text-slate-100">
                      <Repeat2 className="w-4 h-4 text-emerald-300" />
                      {Number(insights.reposts).toLocaleString()}
                    </span>
                  )}
                </div>
              ) : selectedTag && !isDeletedView ? (
                <div className="text-xs text-muted-foreground">No insights</div>
              ) : null}

              {(post.appTag || post.topicTag) && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {post.appTag
                    ?.split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean)
                    .map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center rounded-md border border-black/10 bg-white px-2.5 py-1 text-[11px] font-['JetBrains_Mono'] font-extrabold tracking-[0.05em] text-black shadow-[0_1px_4px_rgba(0,0,0,0.25)]"
                      >
                        #{tag.toUpperCase()}
                      </span>
                    ))}
                  {post.topicTag && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-slate-950/80 px-2.5 py-1 text-xs font-semibold text-sky-500 shadow-[0_1px_4px_rgba(0,0,0,0.18)]">
                      <Sparkles className="w-3 h-3" />
                      {post.topicTag}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="relative flex flex-col items-end gap-1 flex-shrink-0 min-w-[196px] pl-4 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-px before:bg-white/12">
              {isDeletedView ? (
                <>
                  <div className="rounded-md border border-destructive/35 bg-destructive/10 px-2 py-1">
                    <StatusBadge status="deleted" />
                  </div>
                  {deletedTimeText ? (
                    <div className="text-xs text-destructive/90">Deleted {deletedTimeText}</div>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs border-primary/35 text-primary hover:bg-primary/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      recoverPostMutation.mutate(post.id);
                    }}
                    disabled={recoverPostMutation.isPending}
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1" />
                    {recoverPostMutation.isPending ? "Recovering..." : "Recover"}
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={post.status} />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 rounded-md border border-destructive/35 bg-destructive/10 text-destructive hover:text-destructive hover:bg-destructive/20"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeletePostId((prev) => (prev === post.id ? null : post.id));
                      }}
                      disabled={deletePostMutation.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="inline-flex items-center gap-1.5 text-xs text-slate-300/85 leading-none whitespace-nowrap">
                    <Calendar className="w-3 h-3 text-primary/80" />
                    {format(new Date((post as any).createdAt ?? post.scheduledAt), "MMM d, h:mm a")}
                  </div>
                  {post.threadsPostId && (
                    <a
                      href={`https://threads.net/t/${post.threadsPostId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary/90 hover:text-primary leading-none"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="w-3 h-3" />
                      View on Threads
                    </a>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {!isDeletedView && confirmDeletePostId === post.id && (
          <div
            className="mt-3 flex items-center justify-between gap-3 rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs text-destructive">Delete this post from Threads and ThreadFlow?</p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  deletePostMutation.mutate(post.id);
                }}
                disabled={deletePostMutation.isPending}
              >
                {deletePostMutation.isPending && confirmDeletePostId === post.id ? "Deleting..." : "Delete"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDeletePostId(null);
                }}
                disabled={deletePostMutation.isPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden px-6 pt-3 pb-6">
      <div className="flex items-baseline gap-3 mb-4">
        <h1 className="text-2xl font-bold text-foreground">
          My Content
        </h1>
        <span className="text-sm text-muted-foreground">
          Organize and track your posts by personal tags
        </span>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        <div className="w-52 flex-shrink-0">
          <Card className="border-white/10 bg-[linear-gradient(160deg,rgba(20,23,30,0.96),rgba(12,14,20,0.96))] shadow-[0_10px_28px_rgba(0,0,0,0.35)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">My Tags</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <Button
                variant={selectedTag === null ? "default" : "ghost"}
                size="sm"
                className="w-full justify-start font-normal"
                onClick={() => {
                  setSelectedTag(null);
                  setConfirmDeletePostId(null);
                }}
              >
                <FileText className="w-4 h-4 mr-2" />
                All Posts
                <Badge variant="secondary" className="ml-auto text-xs">
                  {totalPosts}
                </Badge>
              </Button>

              <div className="space-y-2 pt-0.5">
                <div>
                  <Input
                    value={tagSearchInput}
                    onChange={(e) => setTagSearchInput(e.target.value)}
                    placeholder="Search hashtags"
                    className="h-8 text-xs placeholder:text-center"
                  />
                </div>

                {loadingTags ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : filteredVisibleTags.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    {visibleTags.length === 0 ? "No tags yet" : "No matching hashtags"}
                  </p>
                ) : (
                  <div className="relative">
                    <div
                      className="h-[360px] overflow-y-auto pr-1 space-y-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[rgba(255,255,255,0.1)] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-[rgba(255,255,255,0.2)]"
                      style={{ scrollbarWidth: "thin", scrollbarColor: "transparent transparent" }}
                    >
                      {filteredVisibleTags.map((tag) => (
                        <Button
                          key={tag}
                          variant={selectedTag === tag ? "default" : "ghost"}
                          size="sm"
                          className="w-full justify-start font-normal"
                          onClick={() => {
                            if (!isProPlan) {
                              toast({
                                title: "Tag filters are a Pro feature.",
                                description: "Enable Pro from the sidebar to unlock tag filtering.",
                              });
                              return;
                            }
                            setSelectedTag(tag);
                            setConfirmDeletePostId(null);
                          }}
                        >
                          <Hash className="w-4 h-4 mr-2" />
                          <span className="font-['JetBrains_Mono'] font-bold tracking-[0.04em]">
                            {tag.toUpperCase()}
                          </span>
                          <Badge variant="secondary" className="ml-auto text-xs">
                            {getTagCount(tag)}
                          </Badge>
                        </Button>
                      ))}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-card to-transparent pointer-events-none" />
                  </div>
                )}
              </div>

              <div className="my-2 border-t border-border/60" />

              <Button
                variant={isDeletedView ? "secondary" : "ghost"}
                size="sm"
                className={`w-full justify-start font-normal ${
                  isDeletedView
                    ? "bg-destructive/15 text-destructive hover:bg-destructive/20"
                    : "text-destructive/80 hover:text-destructive hover:bg-destructive/10"
                }`}
                onClick={() => {
                  setSelectedTag(DELETED_TAG);
                  setConfirmDeletePostId(null);
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Deleted
                <Badge variant="outline" className="ml-auto text-xs border-destructive/40 text-destructive">
                  {deletedCount}
                </Badge>
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="flex-1 min-h-0 flex flex-col gap-4">
          {selectedTag && !isDeletedView && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {loadingInsights ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))
              ) : tagInsights?.averages ? (
                <>
                  <Card className="p-4 border-white/10 bg-[linear-gradient(160deg,rgba(22,25,32,0.96),rgba(14,16,22,0.96))] shadow-[0_10px_24px_rgba(0,0,0,0.3)]">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                      <Eye className="w-3.5 h-3.5" /> Avg Views
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {tagInsights.averages.views.toLocaleString()}
                    </p>
                  </Card>
                  <Card className="p-4 border-white/10 bg-[linear-gradient(160deg,rgba(22,25,32,0.96),rgba(14,16,22,0.96))] shadow-[0_10px_24px_rgba(0,0,0,0.3)]">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                      <Heart className="w-3.5 h-3.5" /> Avg Likes
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {tagInsights.averages.likes.toLocaleString()}
                    </p>
                  </Card>
                  <Card className="p-4 border-white/10 bg-[linear-gradient(160deg,rgba(22,25,32,0.96),rgba(14,16,22,0.96))] shadow-[0_10px_24px_rgba(0,0,0,0.3)]">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                      <MessageCircle className="w-3.5 h-3.5" /> Avg Replies
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {tagInsights.averages.replies.toLocaleString()}
                    </p>
                  </Card>
                  <Card className="p-4 border-white/10 bg-[linear-gradient(160deg,rgba(22,25,32,0.96),rgba(14,16,22,0.96))] shadow-[0_10px_24px_rgba(0,0,0,0.3)]">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                      <TrendingUp className="w-3.5 h-3.5" /> Total Posts
                    </div>
                    <p className="text-2xl font-bold text-foreground">{tagInsights.totalPosts}</p>
                  </Card>
                </>
              ) : tagInsights && !tagInsights.averages ? (
                <div className="col-span-4 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
                  No insights available yet for <strong>#{selectedTag.toUpperCase()}</strong> - insights appear after
                  posts are published to Threads.
                </div>
              ) : null}
            </div>
          )}

          {selectedTag && !isDeletedView && tagInsights?.bestPost && (
            <Card className="border-primary/35 bg-[linear-gradient(160deg,rgba(14,35,38,0.65),rgba(12,18,24,0.9))] shadow-[0_10px_24px_rgba(0,0,0,0.28)]">
              <CardContent className="py-3 px-4">
                <div className="flex items-start gap-2">
                  <TrendingUp className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-primary mb-0.5">
                      Best performing #{selectedTag.toUpperCase()} post
                    </p>
                    <p className="text-sm text-foreground line-clamp-1">{tagInsights.bestPost.content}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {tagInsights.bestPost.views !== undefined && (
                        <span>{Number(tagInsights.bestPost.views).toLocaleString()} views</span>
                      )}
                      {tagInsights.bestPost.likes !== undefined && (
                        <span>{Number(tagInsights.bestPost.likes).toLocaleString()} likes</span>
                      )}
                      {tagInsights.bestPost.threadsPostId && (
                        <a
                          href={`https://threads.net/t/${tagInsights.bestPost.threadsPostId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-primary flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" /> View
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-white/10 bg-[linear-gradient(160deg,rgba(20,23,30,0.96),rgba(12,14,20,0.96))] shadow-[0_10px_28px_rgba(0,0,0,0.35)] flex flex-col flex-1 min-h-0">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {isDeletedView ? "Deleted Posts" : selectedTag ? `#${selectedTag.toUpperCase()}` : "All Posts"}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {!isDeletedView && (
                    <Select value={sortBy} onValueChange={(v) => setSortBy(v as "date" | "views" | "likes" | "replies")}>
                      <SelectTrigger className="w-32 h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="date">Latest</SelectItem>
                        <SelectItem value="views">Most Views</SelectItem>
                        <SelectItem value="likes">Most Likes</SelectItem>
                        <SelectItem value="replies">Most Replies</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {selectedTag && !isDeletedView && latestPost && (
                    <span className="text-xs text-muted-foreground">
                      Latest: {format(new Date(latestPost.createdAt), "MMM d, h:mm a")}
                    </span>
                  )}
                </div>
              </div>
              {isDeletedView && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Deleted posts are permanently removed after 30 days.
                </p>
              )}
            </CardHeader>
            <CardContent className="flex-1 min-h-0">
              {loadingDisplayPosts ? (
                <div className="space-y-3">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : displayPosts.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {isDeletedView
                      ? "No deleted posts yet"
                      : selectedTag
                        ? `No posts found with tag "${selectedTag}"`
                        : "No posts yet"}
                  </p>
                </div>
              ) : (
                <div className="relative h-full">
                  <div
                    className="h-full overflow-y-auto pr-1 space-y-3 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[rgba(255,255,255,0.1)] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-[rgba(255,255,255,0.2)]"
                    style={{ scrollbarWidth: "thin", scrollbarColor: "transparent transparent" }}
                  >
                    {sortedContentItems.map((item) => {
                      if (item.kind === "single") {
                        return renderPostCard(item.post);
                      }

                      const expanded = !!expandedChainRoots[item.root.id];
                      return (
                        <div key={`chain-${item.root.id}`} className="space-y-0.5">
                          {renderPostCard(item.root, {
                            key: item.root.id,
                            onToggleChain: () => toggleChainRoot(item.root.id),
                          })}

                          {!expanded && item.followUps.length > 0 && (
                            <div className="ml-2 -mt-1">
                              <div className="h-1 w-[94%] rounded-full bg-[#0EA5E9]/22 shadow-[0_1px_4px_rgba(14,165,233,0.22)]" />
                              <div className="mt-0.5 h-1 w-[88%] rounded-full bg-[#0EA5E9]/15 shadow-[0_1px_3px_rgba(14,165,233,0.20)]" />
                            </div>
                          )}

                          {expanded && (
                            <div className="relative ml-3 pl-2.5 space-y-1.5">
                              <div className="absolute left-0 top-1.5 bottom-1.5 w-px bg-[#0EA5E9]/75" />
                              {item.followUps.map((followUpPost) => (
                                <div key={followUpPost.id} className="relative">
                                  <div className="absolute -left-2.5 top-5 h-px w-2 bg-[#0EA5E9]/65" />
                                  {renderPostCard(followUpPost, {
                                    key: followUpPost.id,
                                    isFollowUp: true,
                                  })}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-card to-transparent pointer-events-none" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
