import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import type { ScheduledPost } from "@shared/schema";

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

export default function MyContent() {
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("tf_token");
    void fetch("/api/posts/refresh-insights", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).catch(() => {});
  }, []);

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
    enabled: !selectedTag,
  });

  const { data: tagInsights, isLoading: loadingInsights } = useQuery<TagInsights>({
    queryKey: ["/api/posts/tag-insights", selectedTag],
    queryFn: () =>
      apiRequest("GET", `/api/posts/tag-insights?tag=${encodeURIComponent(selectedTag!)}`),
    enabled: !!selectedTag,
  });

  const getTagCount = (tag: string) =>
    allPosts.filter((p) => p.appTag?.split(",").map((t) => t.trim()).includes(tag)).length;
  const totalPosts = allPosts.length;

  const displayPosts: PostWithInsights[] = selectedTag ? (tagInsights?.posts ?? []) : posts;
  const latestPost =
    displayPosts.length > 0
      ? [...displayPosts].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )[0]
      : null;

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">My Content</h1>
        <p className="text-muted-foreground mt-1">Organize and track your posts by personal tags</p>
      </div>

      <div className="flex gap-6">
        <div className="w-52 flex-shrink-0">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">My Tags</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <Button
                variant={selectedTag === null ? "default" : "ghost"}
                size="sm"
                className="w-full justify-start font-normal"
                onClick={() => setSelectedTag(null)}
              >
                <FileText className="w-4 h-4 mr-2" />
                All Posts
                <Badge variant="secondary" className="ml-auto text-xs">
                  {totalPosts}
                </Badge>
              </Button>

              {loadingTags ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : tags.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">No tags yet</p>
              ) : (
                tags.map((tag) => (
                  <Button
                    key={tag}
                    variant={selectedTag === tag ? "default" : "ghost"}
                    size="sm"
                    className="w-full justify-start font-normal"
                    onClick={() => setSelectedTag(tag)}
                  >
                    <Hash className="w-4 h-4 mr-2" />
                    {tag}
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {getTagCount(tag)}
                    </Badge>
                  </Button>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex-1 space-y-4">
          {selectedTag && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {loadingInsights ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))
              ) : tagInsights?.averages ? (
                <>
                  <Card className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                      <Eye className="w-3.5 h-3.5" /> Avg Views
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {tagInsights.averages.views.toLocaleString()}
                    </p>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                      <Heart className="w-3.5 h-3.5" /> Avg Likes
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {tagInsights.averages.likes.toLocaleString()}
                    </p>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                      <MessageCircle className="w-3.5 h-3.5" /> Avg Replies
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {tagInsights.averages.replies.toLocaleString()}
                    </p>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                      <TrendingUp className="w-3.5 h-3.5" /> Total Posts
                    </div>
                    <p className="text-2xl font-bold text-foreground">{tagInsights.totalPosts}</p>
                  </Card>
                </>
              ) : tagInsights && !tagInsights.averages ? (
                <div className="col-span-4 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
                  No insights available yet for <strong>#{selectedTag}</strong> - insights appear after
                  posts are published to Threads.
                </div>
              ) : null}
            </div>
          )}

          {selectedTag && tagInsights?.bestPost && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="py-3 px-4">
                <div className="flex items-start gap-2">
                  <TrendingUp className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-primary mb-0.5">
                      Best performing #{selectedTag} post
                    </p>
                    <p className="text-sm text-foreground line-clamp-1">{tagInsights.bestPost.content}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {tagInsights.bestPost.views !== undefined && (
                        <span>
                          {Number(tagInsights.bestPost.views).toLocaleString()} views
                        </span>
                      )}
                      {tagInsights.bestPost.likes !== undefined && (
                        <span>
                          {Number(tagInsights.bestPost.likes).toLocaleString()} likes
                        </span>
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

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{selectedTag ? `#${selectedTag}` : "All Posts"}</CardTitle>
                {selectedTag && latestPost && (
                  <span className="text-xs text-muted-foreground">
                    Latest: {format(new Date(latestPost.createdAt), "MMM d, h:mm a")}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loadingPosts || (selectedTag && loadingInsights) ? (
                <div className="space-y-3">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : displayPosts.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {selectedTag ? `No posts found with tag "${selectedTag}"` : "No posts yet"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {displayPosts.map((post) => (
                    <div
                      key={post.id}
                      className="p-4 rounded-lg border border-border bg-card hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground line-clamp-2">{post.content}</p>

                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            {post.appTag && (
                              <div className="flex flex-wrap gap-1">
                                {post.appTag.split(",").map(tag => tag.trim()).filter(Boolean).map(tag => (
                                  <span
                                    key={tag}
                                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary border border-primary/30"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                            {post.topicTag && <span className="text-xs text-primary">* {post.topicTag}</span>}
                          </div>

                          {post.insights ? (
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                              {post.insights.views !== undefined && (
                                <span className="flex items-center gap-1">
                                  <Eye className="w-3 h-3" />
                                  {Number(post.insights.views).toLocaleString()}
                                </span>
                              )}
                              {post.insights.likes !== undefined && (
                                <span className="flex items-center gap-1">
                                  <Heart className="w-3 h-3" />
                                  {Number(post.insights.likes).toLocaleString()}
                                </span>
                              )}
                              {post.insights.replies !== undefined && (
                                <span className="flex items-center gap-1">
                                  <MessageCircle className="w-3 h-3" />
                                  {Number(post.insights.replies).toLocaleString()}
                                </span>
                              )}
                              {post.insights.reposts !== undefined && (
                                <span className="flex items-center gap-1">
                                  <Repeat2 className="w-3 h-3" />
                                  {Number(post.insights.reposts).toLocaleString()}
                                </span>
                              )}
                            </div>
                          ) : selectedTag ? (
                            <div className="mt-2 text-xs text-muted-foreground">No insights</div>
                          ) : null}
                        </div>

                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          <StatusBadge status={post.status} />
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(post.scheduledAt), "MMM d, h:mm a")}
                          </div>
                          {post.threadsPostId && (
                            <a
                              href={`https://threads.net/t/${post.threadsPostId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              View on Threads
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
