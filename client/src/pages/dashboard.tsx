import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "wouter";
import {
  Users, PenSquare, Clock, Layers, CheckCircle2, XCircle, AlertCircle,
  ArrowRight, Timer, MessageSquare, Waves, BarChart3, TrendingUp,
} from "lucide-react";
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
  const { data: profile, isLoading, error } = useQuery<any>({
    queryKey: ["/api/profile"],
    retry: false,
  });
  const { data: status } = useQuery<{ hasToken: boolean }>({ queryKey: ["/api/status"] });

  if (!status?.hasToken) {
    return (
      <Card className="col-span-full">
        <CardContent className="flex items-center gap-4 py-6">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
            <Waves className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-foreground">No API Token Configured</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Add your THREADS_ACCESS_TOKEN to connect your Threads account. All scheduling features still work and will publish once connected.
            </p>
          </div>
          <Badge variant="secondary">Token Required</Badge>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="col-span-full">
        <CardContent className="flex items-center gap-4 py-6">
          <Skeleton className="w-14 h-14 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !profile) return null;

  return (
    <Card className="col-span-full">
      <CardContent className="flex flex-wrap items-center gap-4 py-6">
        <Avatar className="w-14 h-14">
          <AvatarImage src={profile.threads_profile_picture_url} />
          <AvatarFallback className="bg-primary/10 text-primary text-lg font-bold">
            {profile.username?.[0]?.toUpperCase() || "T"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-lg text-foreground truncate">@{profile.username}</p>
          {profile.threads_biography && (
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{profile.threads_biography}</p>
          )}
        </div>
        <div className="flex items-center gap-6 ml-auto">
          {profile.followers_count !== undefined && (
            <div className="text-center">
              <p className="font-bold text-xl text-foreground">{profile.followers_count.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Followers</p>
            </div>
          )}
          <Badge className="bg-status-online/15 text-status-online border-0">Connected</Badge>
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
  const publishedToday = scheduledPosts.filter(p => {
    if (p.status !== "published") return false;
    const today = new Date();
    const pub = new Date(p.scheduledAt);
    return pub.toDateString() === today.toDateString();
  });
  const runningQueues = bulkQueues.filter(q => q.status === "running");
  const pendingFollowUps = followUps.filter(f => f.status === "pending");

  const stats = [
    {
      title: "Scheduled Posts",
      value: pendingScheduled.length,
      icon: Clock,
      description: "Pending publication",
      color: "text-chart-1",
      bg: "bg-chart-1/10",
    },
    {
      title: "Bulk Queues",
      value: runningQueues.length,
      icon: Layers,
      description: "Active queues",
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
      title: "Published Today",
      value: publishedToday.length,
      icon: CheckCircle2,
      description: "Posts sent today",
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
          <Card key={stat.title} data-testid={`card-stat-${stat.title.toLowerCase().replace(/\s+/g, "-")}`}>
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
              <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
            <CardDescription>Jump to any feature</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {quickActions.map((action) => (
              <Link key={action.href} href={action.href}>
                <div
                  className="flex flex-col gap-2 p-3 rounded-md border border-border hover-elevate cursor-pointer"
                  data-testid={`card-quick-${action.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10">
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
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
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
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
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(post.scheduledAt), "MMM d, h:mm a")}
                      </p>
                    </div>
                    <StatusBadge status={post.status} />
                  </div>
                ))}
                {pendingScheduled.length > 5 && (
                  <p className="text-xs text-center text-muted-foreground pt-1">
                    +{pendingScheduled.length - 5} more scheduled
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {(bulkQueues.length > 0 || followUps.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {bulkQueues.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Bulk Queues</CardTitle>
                <CardDescription>Multi-post sequences</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {bulkQueues.slice(0, 4).map((queue) => {
                    const sent = queue.items.filter(i => i.status === "sent").length;
                    const total = queue.items.length;
                    return (
                      <div key={queue.id} className="flex items-center gap-3 p-2.5 rounded-md bg-muted/40" data-testid={`row-queue-${queue.id}`}>
                        <Layers className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{queue.name}</p>
                          <p className="text-xs text-muted-foreground">{sent}/{total} posts sent</p>
                        </div>
                        <StatusBadge status={queue.status} />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {followUps.length > 0 && (
            <Card>
              <CardHeader>
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
      )}
    </div>
  );
}
