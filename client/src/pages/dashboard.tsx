import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "wouter";
import {
  Clock, Layers, CheckCircle2, Timer, MessageSquare, ArrowRight,
  PenSquare, Send, Zap, TrendingUp,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ScheduledPost, BulkQueueWithItems, FollowUpThread } from "@shared/schema";
import { formatDistanceToNow, format } from "date-fns";

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
  return <Badge variant={cfg.variant} data-testid={`badge-status-${status}`}>{cfg.label}</Badge>;
}

function ProfileCard() {
  const { user } = useAuth();
  const { data: profile, isLoading, error } = useQuery<any>({
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
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-56" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const displayProfile = profile || { username: user?.threadsUsername, threads_profile_picture_url: user?.threadsProfilePicUrl, followers_count: user?.threadsFollowerCount };
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
          <p className="font-bold text-foreground">@{displayProfile.username}</p>
          {displayProfile.threads_biography && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{displayProfile.threads_biography}</p>
          )}
        </div>
        <div className="flex items-center gap-4 ml-auto flex-shrink-0">
          {displayProfile.followers_count !== undefined && (
            <div className="text-center">
              <p className="font-bold text-lg text-foreground">{displayProfile.followers_count.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Followers</p>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-status-online" />
            <span className="text-xs text-muted-foreground">Connected</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickPost() {
  const [content, setContent] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();

  const { mutate: publish, isPending } = useMutation({
    mutationFn: (text: string) => apiRequest("POST", "/api/posts/publish", { content: text }),
    onSuccess: () => {
      toast({ title: "Posted!", description: "Your thread was published successfully." });
      setContent("");
      qc.invalidateQueries({ queryKey: ["/api/posts/scheduled"] });
    },
    onError: (err: any) => {
      const msg = err.message?.includes(":") ? err.message.split(":").slice(1).join(":").trim() : err.message;
      toast({ title: "Failed to post", description: msg, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          Quick Post
        </CardTitle>
        <CardDescription>Post directly to Threads right now</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          placeholder={user?.threadsAccessToken ? "What's on your mind?" : "Connect your Threads account to post..."}
          value={content}
          onChange={e => setContent(e.target.value)}
          disabled={!user?.threadsAccessToken}
          rows={3}
          maxLength={500}
          data-testid="textarea-quick-post"
          className="resize-none"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{content.length}/500</span>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!content.trim() || isPending || !user?.threadsAccessToken}
              onClick={() => publish(content.trim())}
              data-testid="button-quick-post"
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              {isPending ? "Posting..." : "Post Now"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: scheduledPosts = [], isLoading: loadingScheduled } = useQuery<ScheduledPost[]>({
    queryKey: ["/api/posts/scheduled"],
  });
  const { data: bulkQueues = [], isLoading: loadingBulk } = useQuery<BulkQueueWithItems[]>({
    queryKey: ["/api/bulk-queues"],
  });
  const { data: followUps = [], isLoading: loadingFollowUps } = useQuery<FollowUpThread[]>({
    queryKey: ["/api/follow-ups"],
  });

  const pendingScheduled = scheduledPosts.filter(p => p.status === "pending");
  const publishedPosts = scheduledPosts.filter(p => p.status === "published");
  const lastPublished = publishedPosts.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())[0];
  const runningQueues = bulkQueues.filter(q => q.status === "running");
  const pendingFollowUps = followUps.filter(f => f.status === "pending");

  const stats = [
    {
      title: "Scheduled Posts",
      value: pendingScheduled.length,
      icon: Clock,
      description: lastPublished ? `Last: ${formatDistanceToNow(new Date(lastPublished.scheduledAt), { addSuffix: true })}` : "No posts yet",
      color: "text-chart-1",
      bg: "bg-chart-1/10",
    },
    {
      title: "Active Queues",
      value: runningQueues.length,
      icon: Layers,
      description: `${bulkQueues.length} total queues`,
      color: "text-chart-2",
      bg: "bg-chart-2/10",
    },
    {
      title: "Follow-Ups",
      value: pendingFollowUps.length,
      icon: Timer,
      description: "Awaiting send",
      color: "text-chart-3",
      bg: "bg-chart-3/10",
    },
    {
      title: "Published",
      value: publishedPosts.length,
      icon: CheckCircle2,
      description: lastPublished ? `Last ${formatDistanceToNow(new Date(lastPublished.scheduledAt), { addSuffix: true })}` : "None yet",
      color: "text-chart-4",
      bg: "bg-chart-4/10",
    },
  ];

  const quickActions = [
    { label: "Compose Post", href: "/compose", icon: PenSquare, desc: "Write and schedule a new post" },
    { label: "Bulk Post", href: "/bulk", icon: Layers, desc: "Send multiple posts in sequence" },
    { label: "Follow-Up", href: "/followup", icon: Timer, desc: "Schedule a timed reply" },
    { label: "Comments", href: "/comments", icon: MessageSquare, desc: "Manage replies and likes" },
  ];

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of your ThreadFlow activity</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <ProfileCard />
        {stats.map((stat) => (
          <Card
            key={stat.title}
            data-testid={`card-stat-${stat.title.toLowerCase().replace(/\s+/g, "-")}`}
            className="group transition-all duration-200 hover:border-primary/40"
            style={{ "--hover-glow": "0 0 0 1px hsl(187 75% 48% / 0.25), 0 4px 16px hsl(187 75% 48% / 0.08)" } as React.CSSProperties}
          >
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <QuickPost />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Quick Actions
            </CardTitle>
            <CardDescription>Jump to any feature</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {quickActions.map((action) => (
              <Link key={action.href} href={action.href}>
                <div
                  className="flex flex-col gap-2 p-3 rounded-md border border-border hover-elevate cursor-pointer group"
                  data-testid={`card-quick-${action.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">Scheduled Queue</CardTitle>
              <CardDescription>Upcoming posts</CardDescription>
            </div>
            <Link href="/compose">
              <Button variant="ghost" size="sm" data-testid="button-view-scheduled">
                View all <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {loadingScheduled ? (
              <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : pendingScheduled.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Clock className="w-8 h-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No scheduled posts yet</p>
                <Link href="/compose">
                  <Button size="sm" variant="outline" className="mt-3" data-testid="button-schedule-first">
                    Schedule your first post
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingScheduled.slice(0, 5).map((post) => (
                  <div key={post.id} className="flex items-start gap-3 p-2.5 rounded-md bg-muted/40" data-testid={`row-scheduled-${post.id}`}>
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

        {followUps.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Follow-Up Threads</CardTitle>
              <CardDescription>Timed replies</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {followUps.slice(0, 4).map((followUp) => (
                  <div key={followUp.id} className="flex items-start gap-3 p-2.5 rounded-md bg-muted/40" data-testid={`row-followup-${followUp.id}`}>
                    <Timer className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{followUp.content}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {followUp.status === "pending"
                          ? `In ${formatDistanceToNow(new Date(followUp.scheduledAt))}`
                          : format(new Date(followUp.scheduledAt), "MMM d, h:mm a")}
                      </p>
                    </div>
                    <StatusBadge status={followUp.status} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
