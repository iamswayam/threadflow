import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, Clock, PenSquare, Pencil, Trash2, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { PostComposerCard } from "@/components/post-composer-card";
import type { ScheduledPost } from "@shared/schema";

function StatusIcon({ status }: { status: string }) {
  if (status === "published" || status === "sent") return <CheckCircle2 className="w-3.5 h-3.5 text-status-online" />;
  if (status === "failed") return <XCircle className="w-3.5 h-3.5 text-destructive" />;
  return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
}

export default function Compose() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingScheduledId, setEditingScheduledId] = useState<string | null>(null);

  const { data: scheduled = [], isLoading } = useQuery<ScheduledPost[]>({
    queryKey: ["/api/posts/scheduled"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/posts/scheduled/${id}`),
    onSuccess: () => {
      toast({ title: "Removed", description: "Scheduled post cancelled." });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/scheduled"] });
    },
  });

  const pending = scheduled.filter((post) => post.status === "pending");
  const published = scheduled.filter((post) => post.status !== "pending");
  const editingScheduledPost = pending.find((post) => post.id === editingScheduledId) || null;

  useEffect(() => {
    if (!editingScheduledId) return;
    if (!editingScheduledPost) {
      setEditingScheduledId(null);
    }
  }, [editingScheduledId, editingScheduledPost]);

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Compose</h1>
        <p className="text-muted-foreground mt-1">Write, publish, or schedule a new post</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-3 space-y-4">
          <PostComposerCard
            title="New Thread"
            mode="full"
            icon={PenSquare}
            editingScheduledPost={editingScheduledPost}
            onEditFinished={() => setEditingScheduledId(null)}
            testIds={{
              topicInput: "input-compose-topic",
              textarea: "textarea-compose",
              mediaUrl: "input-media-url",
              postNowButton: "button-post-now",
              scheduleButton: "button-schedule",
              confirmScheduleButton: "button-confirm-schedule",
              scheduledDateInput: "input-scheduled-date",
              scheduledTimeInput: "input-scheduled-time",
            }}
          />
        </div>

        <div className="xl:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                Scheduled Queue
              </CardTitle>
              <CardDescription>{pending.length} post{pending.length !== 1 ? "s" : ""} pending</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoading ? (
                <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
              ) : pending.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Clock className="w-7 h-7 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No scheduled posts</p>
                </div>
              ) : (
                pending.map((post) => (
                  <div
                    key={post.id}
                    className={`p-3 rounded-md border space-y-2 ${
                      editingScheduledId === post.id ? "border-primary/60 bg-primary/5" : "border-border"
                    }`}
                    data-testid={`card-scheduled-${post.id}`}
                  >
                    <p className="text-sm text-foreground line-clamp-2">{post.content}</p>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <StatusIcon status={post.status} />
                        <span>{format(new Date(post.scheduledAt), "MMM d, h:mm a")}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditingScheduledId(post.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-edit-scheduled-${post.id}`}
                        >
                          <Pencil className="w-3.5 h-3.5 text-primary" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (editingScheduledId === post.id) {
                              setEditingScheduledId(null);
                            }
                            deleteMutation.mutate(post.id);
                          }}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-scheduled-${post.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {published.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {published.slice(0, 5).map((post) => (
                  <div key={post.id} className="p-3 rounded-md bg-muted/40 space-y-1.5" data-testid={`card-history-${post.id}`}>
                    <p className="text-sm text-foreground line-clamp-2">{post.content}</p>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <StatusIcon status={post.status} />
                      <span className="capitalize">{post.status}</span>
                      {post.status === "failed" && post.errorMessage ? (
                        <span className="text-destructive ml-1">- {post.errorMessage}</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
