import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Plus, Trash2, Play, Layers, CheckCircle2, XCircle, Clock,
  AlertCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import type { BulkQueueWithItems } from "@shared/schema";

const MAX_CHARS = 500;

interface PostItem {
  id: string;
  content: string;
  mediaUrl: string;
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; className: string }> = {
    pending: { label: "Pending", className: "bg-secondary text-secondary-foreground" },
    sent: { label: "Sent", className: "bg-status-online/15 text-status-online" },
    failed: { label: "Failed", className: "bg-destructive/15 text-destructive" },
    running: { label: "Running", className: "bg-primary/15 text-primary" },
    completed: { label: "Completed", className: "bg-status-online/15 text-status-online" },
  };
  const c = cfg[status] || cfg.pending;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border-0 ${c.className}`} data-testid={`badge-${status}`}>
      {c.label}
    </span>
  );
}

function QueueCard({ queue, onDelete }: { queue: BulkQueueWithItems; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const sent = queue.items.filter(i => i.status === "sent").length;
  const failed = queue.items.filter(i => i.status === "failed").length;
  const total = queue.items.length;
  const progress = total > 0 ? Math.round((sent / total) * 100) : 0;

  return (
    <Card data-testid={`card-queue-${queue.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base">{queue.name}</CardTitle>
              <StatusBadge status={queue.status} />
            </div>
            <CardDescription className="mt-1">
              {sent}/{total} posts sent · {queue.delayMinutes}min delay
              {failed > 0 && <span className="text-destructive"> · {failed} failed</span>}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setExpanded(!expanded)}
              data-testid={`button-expand-queue-${queue.id}`}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onDelete(queue.id)}
              data-testid={`button-delete-queue-${queue.id}`}
            >
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        </div>
        <div className="w-full bg-muted rounded-full h-1.5 mt-2">
          <div
            className="bg-primary h-1.5 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-2">
          {queue.items.map((item, idx) => (
            <div key={item.id} className="flex items-start gap-3 p-3 rounded-md bg-muted/40" data-testid={`row-queue-item-${item.id}`}>
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-xs font-medium text-primary">{idx + 1}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">{item.content}</p>
                {item.scheduledAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {item.status === "pending"
                      ? `Scheduled: ${format(new Date(item.scheduledAt), "MMM d, h:mm a")}`
                      : item.publishedAt
                      ? `Sent: ${format(new Date(item.publishedAt), "MMM d, h:mm a")}`
                      : ""}
                  </p>
                )}
                {item.status === "failed" && item.errorMessage && (
                  <p className="text-xs text-destructive mt-1">{item.errorMessage}</p>
                )}
              </div>
              <StatusBadge status={item.status} />
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}

export default function BulkPost() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [queueName, setQueueName] = useState("My Bulk Queue");
  const [delay, setDelay] = useState("5");
  const [posts, setPosts] = useState<PostItem[]>([
    { id: "1", content: "", mediaUrl: "" },
    { id: "2", content: "", mediaUrl: "" },
  ]);

  const { data: queues = [], isLoading } = useQuery<BulkQueueWithItems[]>({
    queryKey: ["/api/bulk-queues"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/bulk-queues", data),
    onSuccess: () => {
      toast({ title: "Bulk queue started!", description: "Your posts are being published in sequence." });
      setQueueName("My Bulk Queue");
      setPosts([{ id: "1", content: "", mediaUrl: "" }, { id: "2", content: "", mediaUrl: "" }]);
      queryClient.invalidateQueries({ queryKey: ["/api/bulk-queues"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create queue", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/bulk-queues/${id}`),
    onSuccess: () => {
      toast({ title: "Queue deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/bulk-queues"] });
    },
  });

  const addPost = () => {
    setPosts(prev => [...prev, { id: Date.now().toString(), content: "", mediaUrl: "" }]);
  };

  const removePost = (id: string) => {
    if (posts.length <= 1) return;
    setPosts(prev => prev.filter(p => p.id !== id));
  };

  const updatePost = (id: string, field: "content" | "mediaUrl", value: string) => {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const handleStart = () => {
    const validPosts = posts.filter(p => p.content.trim());
    if (validPosts.length === 0) {
      toast({ title: "No content", description: "Add content to at least one post.", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      name: queueName,
      delayMinutes: parseInt(delay),
      items: validPosts.map(p => ({ content: p.content, mediaUrl: p.mediaUrl || null })),
    });
  };

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Bulk Post</h1>
        <p className="text-muted-foreground mt-1">Send multiple threads in sequence with automatic delays</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-3 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                Create Bulk Queue
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="queue-name">Queue Name</Label>
                  <Input
                    id="queue-name"
                    value={queueName}
                    onChange={e => setQueueName(e.target.value)}
                    placeholder="My campaign posts"
                    data-testid="input-queue-name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Delay Between Posts</Label>
                  <Select value={delay} onValueChange={setDelay}>
                    <SelectTrigger data-testid="select-delay">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 minutes</SelectItem>
                      <SelectItem value="10">10 minutes</SelectItem>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="60">1 hour</SelectItem>
                      <SelectItem value="120">2 hours</SelectItem>
                      <SelectItem value="240">4 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3">
                {posts.map((post, idx) => (
                  <div key={post.id} className="p-4 rounded-md border border-border space-y-3" data-testid={`card-bulk-post-${idx}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10">
                          <span className="text-xs font-bold text-primary">{idx + 1}</span>
                        </div>
                        <span className="text-sm font-medium text-foreground">
                          {idx === 0 ? "First post (sends immediately)" : `Post ${idx + 1}`}
                        </span>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removePost(post.id)}
                        disabled={posts.length <= 1}
                        data-testid={`button-remove-post-${idx}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                    <div className="relative">
                      <Textarea
                        placeholder={`Thread ${idx + 1} content...`}
                        value={post.content}
                        onChange={e => updatePost(post.id, "content", e.target.value)}
                        className="resize-none min-h-[90px]"
                        maxLength={MAX_CHARS}
                        data-testid={`textarea-bulk-post-${idx}`}
                      />
                      <span className="absolute bottom-2 right-3 text-xs font-mono text-muted-foreground">
                        {post.content.length}/{MAX_CHARS}
                      </span>
                    </div>
                    <Input
                      placeholder="Media URL (optional)"
                      value={post.mediaUrl}
                      onChange={e => updatePost(post.id, "mediaUrl", e.target.value)}
                      data-testid={`input-bulk-media-${idx}`}
                    />
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={addPost} data-testid="button-add-thread">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Thread
                </Button>
                <Button
                  onClick={handleStart}
                  disabled={createMutation.isPending}
                  data-testid="button-start-queue"
                >
                  <Play className="w-4 h-4 mr-2" />
                  {createMutation.isPending ? "Starting..." : "Start Bulk Queue"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Active Queues</h2>
            {queues.length > 0 && (
              <Badge variant="secondary">{queues.length} total</Badge>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : queues.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                <Layers className="w-8 h-8 text-muted-foreground mb-3" />
                <p className="text-sm font-medium text-foreground">No bulk queues yet</p>
                <p className="text-xs text-muted-foreground mt-1">Create your first bulk queue to send multiple threads in sequence</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {queues.map(queue => (
                <QueueCard key={queue.id} queue={queue} onDelete={id => deleteMutation.mutate(id)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
