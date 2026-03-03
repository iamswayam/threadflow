import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  Eye,
  Heart,
  MessageSquare,
  Repeat2,
  Quote,
  Share2,
  MousePointerClick,
  TrendingUp,
  Users,
  ExternalLink,
  BarChart2,
  AlertTriangle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";

interface PostInsights {
  views: number;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  shares: number;
  clicks: number;
}

type AnalyticsWindow = "24h" | "48h" | "7d" | "30d";
type PostPerformanceLimit = 10 | 50 | 100;

const analyticsWindowOptions: Array<{ value: AnalyticsWindow; label: string; ms: number }> = [
  { value: "24h", label: "Last 24h", ms: 24 * 60 * 60 * 1000 },
  { value: "48h", label: "Last 48h", ms: 48 * 60 * 60 * 1000 },
  { value: "7d", label: "Last 1 week", ms: 7 * 24 * 60 * 60 * 1000 },
  { value: "30d", label: "Last 1 month", ms: 30 * 24 * 60 * 60 * 1000 },
];

const postPerformanceLimitOptions: Array<{ value: PostPerformanceLimit; label: string }> = [
  { value: 10, label: "10 posts" },
  { value: 50, label: "50 posts" },
  { value: 100, label: "100 posts" },
];

interface AnalyticsData {
  account: {
    id: string;
    username: string;
    threads_profile_picture_url?: string;
    views?: number;
    likes?: number;
    replies?: number;
    reposts?: number;
    quotes?: number;
    followers_count?: number;
  };
  posts: Array<{
    id: string;
    text: string;
    timestamp: string;
    media_type: string;
    permalink?: string;
    like_count?: number;
    replies_count?: number;
    repost_count?: number;
    quote_count?: number;
    views?: number;
    insights: PostInsights | null;
  }>;
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  sub,
}: {
  label: string;
  value: number | string;
  icon: any;
  color: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>
              {typeof value === "number" ? value.toLocaleString() : value}
            </p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <Icon className={`w-4 h-4 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function fallbackMetrics(post: AnalyticsData["posts"][0]): PostInsights {
  return {
    views: post.views || 0,
    likes: post.like_count || 0,
    replies: post.replies_count || 0,
    reposts: post.repost_count || 0,
    quotes: post.quote_count || 0,
    shares: 0,
    clicks: 0,
  };
}

function metricFromPost(post: AnalyticsData["posts"][0], metric: keyof PostInsights): number {
  const metrics = post.insights || fallbackMetrics(post);
  return metrics[metric] || 0;
}

function hasAnyPostMetric(post: AnalyticsData["posts"][0]): boolean {
  return !!(
    post.insights ||
    post.views ||
    post.like_count ||
    post.replies_count ||
    post.repost_count ||
    post.quote_count
  );
}

function PostRow({ post, rank }: { post: AnalyticsData["posts"][0]; rank: number }) {
  const ins = post.insights;
  const metrics = ins || fallbackMetrics(post);

  return (
    <div className="flex items-start gap-3 p-3 rounded-md border border-border hover:bg-muted/30 transition-colors">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
        <span className="text-xs font-bold text-primary">{rank}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground line-clamp-2">{post.text || "(no text)"}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {formatDistanceToNow(new Date(post.timestamp), { addSuffix: true })}
        </p>

        {hasAnyPostMetric(post) ? (
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Eye className="w-3 h-3" />
              {metrics.views.toLocaleString()}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Heart className="w-3 h-3 text-rose-500" />
              {metrics.likes.toLocaleString()}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <MessageSquare className="w-3 h-3 text-blue-500" />
              {metrics.replies.toLocaleString()}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Repeat2 className="w-3 h-3 text-green-500" />
              {metrics.reposts.toLocaleString()}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Quote className="w-3 h-3 text-purple-500" />
              {metrics.quotes.toLocaleString()}
            </span>
            {ins && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Share2 className="w-3 h-3 text-amber-500" />
                {metrics.shares.toLocaleString()}
              </span>
            )}
            {ins && metrics.clicks > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <MousePointerClick className="w-3 h-3 text-cyan-500" />
                {metrics.clicks.toLocaleString()}
              </span>
            )}
          </div>
        ) : null}
      </div>

      {post.permalink && (
        <a
          href={post.permalink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 text-muted-foreground hover:text-primary mt-0.5"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}

export default function Analytics() {
  const { user } = useAuth();
  const [chartMetric, setChartMetric] = useState<keyof PostInsights>("views");
  const [analyticsWindow, setAnalyticsWindow] = useState<AnalyticsWindow>("24h");
  const [postPerformanceLimit, setPostPerformanceLimit] = useState<PostPerformanceLimit>(10);

  const selectedWindow = analyticsWindowOptions.find((option) => option.value === analyticsWindow) || analyticsWindowOptions[0];
  const windowAnalyticsUrl = (() => {
    const until = new Date();
    const since = new Date(until.getTime() - selectedWindow.ms);
    const sinceUnix = Math.floor(since.getTime() / 1000);
    const untilUnix = Math.floor(until.getTime() / 1000);
    return `/api/analytics?since=${sinceUnix}&until=${untilUnix}`;
  })();

  const {
    data: baseData,
    isLoading: isBaseLoading,
    error: baseError,
    refetch: refetchBase,
  } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics", "base", postPerformanceLimit],
    queryFn: () => apiRequest("GET", `/api/analytics?postsLimit=${postPerformanceLimit}`),
    enabled: !!user?.threadsAccessToken,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: windowData,
    isLoading: isWindowLoading,
    error: windowError,
    refetch: refetchWindow,
  } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics", "window", analyticsWindow],
    queryFn: () => apiRequest("GET", windowAnalyticsUrl),
    enabled: !!user?.threadsAccessToken,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  if (!user?.threadsAccessToken) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-full text-center gap-4">
        <BarChart2 className="w-12 h-12 text-muted-foreground" />
        <div>
          <p className="font-semibold text-foreground">Threads account not connected</p>
          <p className="text-sm text-muted-foreground mt-1">
            Connect your account in Settings to view analytics.
          </p>
        </div>
        <Link href="/settings">
          <Button variant="outline">Go to Settings</Button>
        </Link>
      </div>
    );
  }

  const acc = windowData?.account || baseData?.account;
  const posts = baseData?.posts || [];
  const isAnalyticsLoading = !acc && (isWindowLoading || isBaseLoading);
  const showAnalyticsError = !acc && (windowError || baseError);

  const sortedPosts = [...posts]
    .filter((post) => !!post.timestamp)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const chartData = sortedPosts.map((post, index) => {
    const postDate = new Date(post.timestamp);
    const validDate = Number.isFinite(postDate.getTime());
    const monthLabel = validDate ? postDate.toLocaleString("en-US", { month: "short" }) : "Unknown";
    const monthKey = validDate ? `${postDate.getFullYear()}-${postDate.getMonth()}` : "unknown";
    const dayOfMonth = validDate ? postDate.getDate() : 0;
    const shortText = post.text
      ? post.text.slice(0, 20) + (post.text.length > 20 ? "..." : "")
      : `Post ${index + 1}`;
    const tooltipText = post.text
      ? post.text.slice(0, 60) + (post.text.length > 60 ? "..." : "")
      : `Post ${index + 1}`;

    return {
      id: post.id,
      shortText,
      tooltipText,
      value: metricFromPost(post, chartMetric),
      monthLabel,
      monthKey,
      dayOfMonth,
    };
  });

  const timelineMarkers = chartData.map((item, index) => {
    const prev = chartData[index - 1];
    const isMonthStart = index === 0 || prev?.monthKey !== item.monthKey;
    const showMonthLabel = isMonthStart && item.dayOfMonth === 1;
    return {
      id: item.id,
      monthLabel: item.monthLabel,
      showMonthLabel,
    };
  });

  const topByViews = [...posts].sort((a, b) => metricFromPost(b, "views") - metricFromPost(a, "views"));
  const topByLikes = [...posts].sort((a, b) => metricFromPost(b, "likes") - metricFromPost(a, "likes"));

  const metricOptions: { key: keyof PostInsights; label: string; color: string }[] = [
    { key: "views", label: "Views", color: "#6366f1" },
    { key: "likes", label: "Likes", color: "#f43f5e" },
    { key: "replies", label: "Replies", color: "#3b82f6" },
    { key: "reposts", label: "Reposts", color: "#22c55e" },
    { key: "quotes", label: "Quotes", color: "#a855f7" },
  ];

  const activeMetric = metricOptions.find((m) => m.key === chartMetric)!;

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
            <Select value={analyticsWindow} onValueChange={(v) => setAnalyticsWindow(v as AnalyticsWindow)}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {analyticsWindowOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-muted-foreground mt-1">Performance insights for your Threads account</p>
        </div>
        {(baseData || windowData) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void refetchBase();
              void refetchWindow();
            }}
          >
            Refresh
          </Button>
        )}
      </div>

      {isAnalyticsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array(6)
            .fill(0)
            .map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
        </div>
      ) : showAnalyticsError ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            <div>
              <p className="font-medium">Could not load analytics</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Make sure you have the{" "}
                <code className="text-xs bg-muted px-1 rounded">threads_manage_insights</code> permission
                enabled in your Meta app.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : acc ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard label="Total Views" value={acc.views || 0} icon={Eye} color="text-indigo-500" sub={selectedWindow.label} />
          <StatCard label="Total Likes" value={acc.likes || 0} icon={Heart} color="text-rose-500" sub={selectedWindow.label} />
          <StatCard label="Total Replies" value={acc.replies || 0} icon={MessageSquare} color="text-blue-500" sub={selectedWindow.label} />
          <StatCard label="Total Reposts" value={acc.reposts || 0} icon={Repeat2} color="text-green-500" sub={selectedWindow.label} />
          <StatCard label="Total Quotes" value={acc.quotes || 0} icon={Quote} color="text-purple-500" sub={selectedWindow.label} />
          <StatCard
            label="Followers"
            value={acc.followers_count ?? "-"}
            icon={Users}
            color="text-amber-500"
            sub={`@${acc.username} | ${selectedWindow.label}`}
          />
        </div>
      ) : null}

      {posts.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Post Performance
              </CardTitle>
              <CardDescription>Last {postPerformanceLimit} posts</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={String(postPerformanceLimit)}
                onValueChange={(v) => setPostPerformanceLimit(Number(v) as PostPerformanceLimit)}
              >
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {postPerformanceLimitOptions.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={chartMetric} onValueChange={(v) => setChartMetric(v as keyof PostInsights)}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {metricOptions.map((m) => (
                    <SelectItem key={m.key} value={m.key}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="shortText" tick={false} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  formatter={(value: any) => [Number(value || 0).toLocaleString(), activeMetric.label]}
                  labelFormatter={(_, payload: any) => {
                    const data = payload?.[0]?.payload;
                    if (!data) return "";
                    return data.tooltipText;
                  }}
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Bar dataKey="value" fill={activeMetric.color} radius={[4, 4, 0, 0]} name={activeMetric.label} />
              </BarChart>
            </ResponsiveContainer>

            {timelineMarkers.length > 0 && (
              <div className="mt-3 border-t border-border/60 pt-2 space-y-1">
                <div
                  className="grid gap-0 text-[10px] text-muted-foreground"
                  style={{ gridTemplateColumns: `repeat(${timelineMarkers.length}, minmax(0, 1fr))` }}
                >
                  {timelineMarkers.map((item) => (
                    <div key={`${item.id}-month`} className="pr-1 text-left whitespace-nowrap overflow-visible">
                      {item.showMonthLabel ? item.monthLabel : ""}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isBaseLoading ? (
        <div className="space-y-3">
          {Array(5)
            .fill(0)
            .map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
        </div>
      ) : posts.length > 0 ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="w-4 h-4 text-primary" />
                Top by Views
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {topByViews.slice(0, 5).map((post, i) => (
                <PostRow key={post.id} post={post} rank={i + 1} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Heart className="w-4 h-4 text-rose-500" />
                Top by Likes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {topByLikes.slice(0, 5).map((post, i) => (
                <PostRow key={post.id} post={post} rank={i + 1} />
              ))}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BarChart2 className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="font-medium text-foreground">No posts found</p>
            <p className="text-sm text-muted-foreground mt-1">Publish some posts to see your analytics here.</p>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground text-center pb-2">
        Analytics data pulled from Threads API - Insights require{" "}
        <code className="bg-muted px-1 rounded">threads_manage_insights</code> permission
        {" "}· Daily-aggregated metrics can lag; replies count top-level replies only
      </p>
    </div>
  );
}
