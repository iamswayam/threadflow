import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Send, Calendar, Clock, Trash2, Edit2, CheckCircle2, XCircle,
  AlertTriangle, Image, Link2, PenSquare,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import type { ScheduledPost } from "@shared/schema";

const MAX_CHARS = 500;

const composeSchema = z.object({
  content: z.string().min(1, "Content is required").max(MAX_CHARS, `Max ${MAX_CHARS} characters`),
  mediaUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  mediaType: z.enum(["TEXT", "IMAGE", "VIDEO"]).default("TEXT"),
  scheduledAt: z.string().optional(),
});

type ComposeForm = z.infer<typeof composeSchema>;

function StatusIcon({ status }: { status: string }) {
  if (status === "published" || status === "sent") return <CheckCircle2 className="w-3.5 h-3.5 text-status-online" />;
  if (status === "failed") return <XCircle className="w-3.5 h-3.5 text-destructive" />;
  return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
}

export default function Compose() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showSchedule, setShowSchedule] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: scheduled = [], isLoading } = useQuery<ScheduledPost[]>({
    queryKey: ["/api/posts/scheduled"],
  });

  const form = useForm<ComposeForm>({
    resolver: zodResolver(composeSchema),
    defaultValues: { content: "", mediaUrl: "", mediaType: "TEXT" },
  });

  const content = form.watch("content");
  const mediaUrl = form.watch("mediaUrl");
  const charCount = content.length;

  const publishMutation = useMutation({
    mutationFn: (data: { content: string; mediaUrl?: string; mediaType?: string }) =>
      apiRequest("POST", "/api/posts/publish", data),
    onSuccess: () => {
      toast({ title: "Post published!", description: "Your thread is now live on Threads." });
      form.reset();
    },
    onError: (err: any) => {
      const msg = err.message?.includes("NO_TOKEN")
        ? "No API token configured. Add THREADS_ACCESS_TOKEN to publish."
        : err.message || "Failed to publish post";
      toast({ title: "Failed to publish", description: msg, variant: "destructive" });
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/posts/schedule", data),
    onSuccess: () => {
      toast({ title: "Post scheduled!", description: "Your thread will be published at the set time." });
      form.reset();
      setShowSchedule(false);
      queryClient.invalidateQueries({ queryKey: ["/api/posts/scheduled"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to schedule", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/posts/scheduled/${id}`),
    onSuccess: () => {
      toast({ title: "Removed", description: "Scheduled post cancelled." });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/scheduled"] });
    },
  });

  const onPostNow = (data: ComposeForm) => {
    publishMutation.mutate({
      content: data.content,
      mediaUrl: data.mediaUrl || undefined,
      mediaType: data.mediaType,
    });
  };

  const onSchedule = (data: ComposeForm) => {
    if (!data.scheduledAt) {
      toast({ title: "Pick a date", description: "Please select when to publish this post.", variant: "destructive" });
      return;
    }
    scheduleMutation.mutate({
      content: data.content,
      mediaUrl: data.mediaUrl || null,
      mediaType: data.mediaType,
      scheduledAt: new Date(data.scheduledAt).toISOString(),
    });
  };

  const pending = scheduled.filter(p => p.status === "pending");
  const published = scheduled.filter(p => p.status !== "pending");

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Compose</h1>
        <p className="text-muted-foreground mt-1">Write, publish, or schedule a new post</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-3 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <PenSquare className="w-4 h-4 text-primary" />
                New Thread
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form className="space-y-4">
                  <FormField
                    control={form.control}
                    name="content"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <div className="relative">
                            <Textarea
                              placeholder="What's on your mind? Share your thread..."
                              className="resize-none min-h-[140px] text-base pr-16"
                              data-testid="textarea-compose"
                              {...field}
                            />
                            <span
                              className={`absolute bottom-3 right-3 text-xs font-mono ${charCount > MAX_CHARS * 0.9 ? charCount >= MAX_CHARS ? "text-destructive font-bold" : "text-amber-500" : "text-muted-foreground"}`}
                              data-testid="text-char-count"
                            >
                              {charCount}/{MAX_CHARS}
                            </span>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-3">
                    <FormField
                      control={form.control}
                      name="mediaUrl"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center gap-2">
                            <Link2 className="w-4 h-4 text-muted-foreground" />
                            <FormControl>
                              <Input
                                placeholder="Media URL (optional)"
                                className="flex-1"
                                data-testid="input-media-url"
                                {...field}
                              />
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {mediaUrl && (
                      <FormField
                        control={form.control}
                        name="mediaType"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center gap-2">
                              <Label className="text-sm text-muted-foreground w-20">Media type</Label>
                              <div className="flex gap-2">
                                {(["IMAGE", "VIDEO"] as const).map(type => (
                                  <button
                                    key={type}
                                    type="button"
                                    onClick={() => field.onChange(type)}
                                    className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors ${field.value === type ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}
                                    data-testid={`button-media-type-${type.toLowerCase()}`}
                                  >
                                    {type}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </FormItem>
                        )}
                      />
                    )}
                  </div>

                  {showSchedule && (
                    <FormField
                      control={form.control}
                      name="scheduledAt"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <FormControl>
                              <Input
                                type="datetime-local"
                                min={new Date().toISOString().slice(0, 16)}
                                className="flex-1"
                                data-testid="input-scheduled-at"
                                {...field}
                              />
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <Button
                      type="button"
                      onClick={form.handleSubmit(onPostNow)}
                      disabled={publishMutation.isPending || charCount === 0}
                      data-testid="button-post-now"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      {publishMutation.isPending ? "Posting..." : "Post Now"}
                    </Button>

                    {showSchedule ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={form.handleSubmit(onSchedule)}
                        disabled={scheduleMutation.isPending || charCount === 0}
                        data-testid="button-confirm-schedule"
                      >
                        <Calendar className="w-4 h-4 mr-2" />
                        {scheduleMutation.isPending ? "Scheduling..." : "Confirm Schedule"}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setShowSchedule(true)}
                        disabled={charCount === 0}
                        data-testid="button-schedule"
                      >
                        <Calendar className="w-4 h-4 mr-2" />
                        Schedule
                      </Button>
                    )}

                    {showSchedule && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setShowSchedule(false)}
                        data-testid="button-cancel-schedule"
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
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
                <div className="space-y-2">
                  {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : pending.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Clock className="w-7 h-7 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No scheduled posts</p>
                </div>
              ) : (
                pending.map((post) => (
                  <div key={post.id} className="p-3 rounded-md border border-border space-y-2" data-testid={`card-scheduled-${post.id}`}>
                    <p className="text-sm text-foreground line-clamp-2">{post.content}</p>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <StatusIcon status={post.status} />
                        <span>{format(new Date(post.scheduledAt), "MMM d, h:mm a")}</span>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(post.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-scheduled-${post.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {published.length > 0 && (
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
                      {post.status === "failed" && post.errorMessage && (
                        <span className="text-destructive ml-1">— {post.errorMessage}</span>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
