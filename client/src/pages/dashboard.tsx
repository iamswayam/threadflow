import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "wouter";
import {
  Clock, Layers, CheckCircle2, Timer, MessageSquare, ArrowRight,
  PenSquare, Send, Zap, TrendingUp, Hash, X, BarChart2, Repeat2,
  Quote, Link2, ExternalLink,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ScheduledPost, BulkQueueWithItems, FollowUpThread } from "@shared/schema";
import { formatDistanceToNow, format } from "date-fns";

const POPULAR_TOPICS = [
  "Astrology Threads", "Motivation Threads", "Business Threads",
  "Health Threads", "Fitness Threads", "Tech Threads", "AI Threads",
  "Spirituality Threads", "Mindset Threads", "Writing Threads",
  "Finance Threads", "Education Threads", "Daily Life Threads",
  "Crypto Threads", "Travel Threads", "Food Threads", "Music Threads",
];

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

  const displayProfile = profile || { username: user?.threadsUsername, threads_profile_picture_url: user?.threadsProfilePicUrl };
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

// ─── Quick Post with topic ABOVE textarea ────────────────────────────────────
function QuickPost() {
  const [content, setContent] = useState("");
  const [topicInput, setTopicInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  // Pre-fill with user's default topic
  useState(() => { setTopicInput(user?.defaultTopic || ""); });

  const filteredTopics = POPULAR_TOPICS.filter(t =>
    t.toLowerCase().includes(topicInput.toLowerCase()) && t !== topicInput
  );

  const { mutate: publish, isPending } = useMutation({
    mutationFn: (data: { content: string; topicTag?: string }) =>
      apiRequest("POST", "/api/posts/publish", data),
    onSuccess: () => {
      toast({ title: "Posted!", description: topicInput ? `Tagged ✦ ${topicInput}` : "Thread published!" });
      setContent("");
      setTopicInput(user?.defaultTopic || "");
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

        {/* ✅ Topic dropdown ABOVE the post box */}
        <div className="relative">
          <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-muted/30 focus-within:border-primary/50 transition-colors">
            <Hash className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <input
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
              placeholder={user?.defaultTopic ? `✦ ${user.defaultTopic}` : "Add topic (optional)"}
              value={topicInput}
              onChange={e => { setTopicInput(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              disabled={!user?.threadsAccessToken}
              data-testid="input-quick-post-topic"
            />
            {topicInput && (
              <button onClick={() => { setTopicInput(""); setShowSuggestions(false); }} className="text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Suggestions dropdown */}
          {showSuggestions && filteredTopics.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-36 overflow-y-auto">
              {filteredTopics.slice(0, 6).map(topic => (
                <button
                  key={topic}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2"
                  onMouseDown={e => { e.preventDefault(); setTopicInput(topic); setShowSuggestions(false); }}
                >
                  <span className="text-primary text-xs font-medium">✦</span>
                  {topic}
                </button>
              ))}
            </div>
          )}

          {topicInput && (
            <p className="text-xs text-primary mt-1 px-1">Will show as ✦ {topicInput}</p>
          )}
        </div>

        {/* Post textarea */}
        <Textarea
          placeholder={user?.threadsAccessToken ? "What's on your mind?" : "Connect your Threads account to post..."}
          value={content}
          onChange={e => setContent(e.target.value)}
          onFocus={() => setShowSuggestions(false)}
          disabled={!user?.threadsAccessToken}
          rows={3}
          maxLength={500}
          data-testid="textarea-quick-post"
          className="resize-none"
        />

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{content.length}/500</span>
          <Button
            size="sm"
            disabled={!content.trim() || isPending || !user?.threadsAccessToken}
            onClick={() => publish({ content: content.trim(), topicTag: topicInput.trim() || undefined })}
            data-testid="button-quick-post"
          >
            <Send className="w-3.5 h-3.5 mr-1.5" />
            {isPending ? "Posting..." : "Post Now"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Recent Posts with Repost / Quote ────────────────────────────────────────
function RecentPosts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [quotingPostId, setQuotingPostId] = useState<string | null>(null);
  const [quoteText, setQuoteText] = useState("");

  const { data: posts = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/posts/recent"],
    enabled: !!user?.threadsAccessToken,
  });

  const repostMutation = useMutation({
    mutationFn: (postId: string) => apiRequest("POST", `/api/posts/${postId}/repost`, {}),
    onSuccess: () => toast({ title: "Reposted!" }),
    onError: (err: any) => toast({ title: "Repost failed", description: err.message, variant: "destructive" }),
  });

  const quoteMutation = useMutation({
    mutationFn: ({ postId, content }: { postId: string; content: string }) =>
      apiRequest("POST", `/api/posts/${postId}/quote`, { content }),
    onSuccess: () => {
      toast({ title: "Quote posted!" });
      setQuotingPostId(null);
      setQuoteText("");
    },
    onError: (err: any) => toast({ title: "Quote failed", description: err.message, variant: "destructive" }),
  });

  if (!user?.threadsAccessToken) return null;

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
          <div className="space-y-2">
            {posts.slice(0, 5).map(post => (
              <div key={post.id}>
                <div className="flex items-start gap-2 p-2.5 rounded-md bg-muted/40 group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground line-clamp-2">{post.text || "(media post)"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(post.timestamp), { addSuffix: true })}
                      {post.like_count > 0 && <span className="ml-2">❤️ {post.like_count}</span>}
                      {post.replies_count > 0 && <span className="ml-2">💬 {post.replies_count}</span>}
                    </p>
                  </div>
                  {/* Repost + Quote buttons appear on hover */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title="Repost"
                      onClick={() => repostMutation.mutate(post.id)}
                      disabled={repostMutation.isPending}
                    >
                      <Repeat2 className="w-3.5 h-3.5 text-green-500" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title="Quote"
                      onClick={() => { setQuotingPostId(post.id === quotingPostId ? null : post.id); setQuoteText(""); }}
                    >
                      <Quote className="w-3.5 h-3.5 text-purple-500" />
                    </Button>
                    {post.permalink && (
                      <a href={post.permalink} target="_blank" rel="noopener noreferrer">
                        <Button size="icon" variant="ghost" className="h-7 w-7">
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                      </a>
                    )}
                  </div>
                </div>

                {/* Inline quote composer */}
                {quotingPostId === post.id && (
                  <div className="mt-1 ml-2 p-3 rounded-md border border-primary/30 bg-primary/5 space-y-2">
                    <p className="text-xs text-primary font-medium">✎ Quote this post</p>
                    <Textarea
                      placeholder="Add your comment..."
                      value={quoteText}
                      onChange={e => setQuoteText(e.target.value)}
                      className="resize-none text-sm min-h-[70px]"
                      maxLength={500}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={!quoteText.trim() || quoteMutation.isPending}
                        onClick={() => quoteMutation.mutate({ postId: post.id, content: quoteText })}
                      >
                        {quoteMutation.isPending ? "Posting..." : "Post Quote"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setQuotingPostId(null)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
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
    { label: "Compose Post", href: "/compose", icon: PenSquare, desc: "Write and schedule a post" },
    { label: "Thread Chain", href: "/chain", icon: Link2, desc: "Post a series instantly" },
    { label: "Bulk Post", href: "/bulk", icon: Layers, desc: "Multiple posts in sequence" },
    { label: "Analytics", href: "/analytics", icon: BarChart2, desc: "View performance insights" },
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ✅ Topic dropdown is now INSIDE QuickPost, above the textarea */}
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
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Clock className="w-8 h-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No scheduled posts yet</p>
                <Link href="/compose">
                  <Button size="sm" variant="outline" className="mt-3">Schedule your first post</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
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
