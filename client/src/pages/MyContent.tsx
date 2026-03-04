import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Hash, Calendar, ExternalLink, FileText } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import type { ScheduledPost } from "@shared/schema";

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

export default function MyContent() {
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const { data: tags = [], isLoading: loadingTags } = useQuery<string[]>({
    queryKey: ["/api/posts/tags"],
    queryFn: () => apiRequest("GET", "/api/posts/tags"),
  });

  const { data: posts = [], isLoading: loadingPosts } = useQuery<ScheduledPost[]>({
    queryKey: ["/api/posts/my-content", selectedTag],
    queryFn: () => apiRequest("GET", `/api/posts/my-content${selectedTag ? `?tag=${encodeURIComponent(selectedTag)}` : ""}`),
  });

  // Get post count for each tag
  const { data: allPosts = [] } = useQuery<ScheduledPost[]>({
    queryKey: ["/api/posts/my-content"],
    queryFn: () => apiRequest("GET", "/api/posts/my-content"),
  });

  const getTagCount = (tag: string) => {
    return allPosts.filter(p => p.appTag === tag).length;
  };

  const selectedTagPosts = selectedTag 
    ? posts.filter(p => p.appTag === selectedTag)
    : posts;

  const totalPosts = allPosts.length;
  const latestPost = selectedTagPosts.length > 0 
    ? selectedTagPosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    : null;

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">My Content</h1>
        <p className="text-muted-foreground mt-1">Organize and track your posts by personal tags</p>
      </div>

      <div className="flex gap-6">
        {/* LEFT PANEL - Tags Sidebar */}
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
                <Badge variant="secondary" className="ml-auto text-xs">{totalPosts}</Badge>
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
                    <Badge variant="secondary" className="ml-auto text-xs">{getTagCount(tag)}</Badge>
                  </Button>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT PANEL - Posts List */}
        <div className="flex-1">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {selectedTag ? `#${selectedTag}` : "All Posts"}
                </CardTitle>
                {selectedTag && (
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>{selectedTagPosts.length} posts</span>
                    {latestPost && (
                      <span>Latest: {format(new Date(latestPost.createdAt), "MMM d, h:mm a")}</span>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loadingPosts ? (
                <div className="space-y-3">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : selectedTagPosts.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {selectedTag ? `No posts found with tag "${selectedTag}"` : "No posts yet"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedTagPosts.map((post) => (
                    <div
                      key={post.id}
                      className="p-4 rounded-lg border border-border bg-card hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground line-clamp-2">{post.content}</p>
                          
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            {post.appTag && (
                              <Badge className="bg-primary/10 text-primary hover:bg-primary/20">
                                #{post.appTag}
                              </Badge>
                            )}
                            {post.topicTag && (
                              <span className="text-xs text-primary">✦ {post.topicTag}</span>
                            )}
                          </div>
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
