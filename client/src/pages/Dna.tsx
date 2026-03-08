import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlignLeft,
  Calendar,
  Clock,
  Crown,
  Dna as DnaIcon,
  Hash,
  MessageCircle,
  Sparkles,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import {
  DAY_NAMES,
  computeFirstLineFeedback,
  computeDnaPatterns,
  detectPostLength,
  extractFirstLine,
  formatHourLabel,
  formatNum,
  getPostLikes,
  getPostTimestampMs,
  getPostViews,
  scoreDraft,
  toNumberOrZero,
  toTitleCase,
  type DnaPost,
} from "@/lib/dna-utils";

type DnaDataResponse = {
  count: number;
  ready: boolean;
  posts: DnaPost[];
};

type AnalyticsSummaryResponse = {
  account?: {
    followers_count?: number | null;
    views?: number | null;
    likes?: number | null;
    replies?: number | null;
    reposts?: number | null;
  } | null;
};

type RhythmState = {
  counterClass: string;
  barClass: string;
  label: string | null;
  labelClass: string;
};

function getRhythmState(charCount: number): RhythmState {
  if (charCount >= 500) {
    return {
      counterClass: "text-destructive",
      barClass: "bg-destructive/80",
      label: "At limit",
      labelClass: "text-destructive",
    };
  }

  if (charCount >= 400) {
    return {
      counterClass: "text-orange-400",
      barClass: "bg-orange-400/60",
      label: "Almost at limit",
      labelClass: "text-orange-400",
    };
  }

  if (charCount >= 281) {
    return {
      counterClass: "text-amber-400",
      barClass: "bg-amber-400/60",
      label: "Getting long",
      labelClass: "text-amber-400",
    };
  }

  if (charCount >= 150) {
    return {
      counterClass: "text-primary",
      barClass: "bg-primary/60",
      label: "Sweet spot",
      labelClass: "text-primary",
    };
  }

  if (charCount >= 100) {
    return {
      counterClass: "text-muted-foreground",
      barClass: "bg-muted/50",
      label: null,
      labelClass: "text-muted-foreground",
    };
  }

  return {
    counterClass: "text-muted-foreground/50",
    barClass: "bg-muted/30",
    label: null,
    labelClass: "text-muted-foreground/50",
  };
}

function getScoreToneClass(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-primary";
  if (score >= 40) return "text-amber-400";
  return "text-destructive";
}

function getDayFromPost(post: DnaPost): number | null {
  const raw = Number(post.dayOfWeek);
  if (Number.isInteger(raw) && raw >= 0 && raw <= 6) return raw;
  const timestamp = getPostTimestampMs(post);
  if (!timestamp) return null;
  return new Date(timestamp).getDay();
}

function getHourFromPost(post: DnaPost): number | null {
  const raw = Number(post.hourOfDay);
  if (Number.isInteger(raw) && raw >= 0 && raw <= 23) return raw;
  const timestamp = getPostTimestampMs(post);
  if (!timestamp) return null;
  return new Date(timestamp).getHours();
}

export default function DnaPage() {
  const { user } = useAuth();
  const [draft, setDraft] = useState("");
  const [devProMode, setDevProMode] = useState(false);
  const isProPlan = devProMode || user?.plan === "pro";

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

  const { data: dnaData, isLoading: isDnaLoading } = useQuery<DnaDataResponse>({
    queryKey: ["/api/posts/dna-data"],
    queryFn: () => apiRequest("GET", "/api/posts/dna-data"),
    enabled: !!user?.threadsAccessToken && isProPlan,
  });

  const { data: recentPosts = [] } = useQuery<DnaPost[]>({
    queryKey: ["/api/posts/recent"],
    queryFn: () => apiRequest("GET", "/api/posts/recent"),
    enabled: !!user?.threadsAccessToken && isProPlan,
  });

  const { data: analyticsData = null } = useQuery<AnalyticsSummaryResponse | null>({
    queryKey: ["/api/analytics", "dna-summary"],
    queryFn: async () => {
      try {
        return await apiRequest("GET", "/api/analytics?summaryOnly=true");
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!user?.threadsAccessToken && isProPlan,
    retry: false,
  });

  const dnaCount = toNumberOrZero(dnaData?.count);
  const ready = Boolean(dnaData?.ready);
  const posts = Array.isArray(dnaData?.posts) ? dnaData.posts : [];

  const patterns = useMemo(() => computeDnaPatterns(posts), [posts]);

  const rhythm = getRhythmState(draft.length);
  const scorePreview = useMemo(() => scoreDraft(draft, patterns), [draft, patterns]);
  const hasScorableDraft = draft.trim().length > 20;
  const activeScore = hasScorableDraft ? scorePreview : null;
  const firstLine = useMemo(() => extractFirstLine(draft), [draft]);
  const firstLineTips = useMemo(() => computeFirstLineFeedback(firstLine), [firstLine]);
  const progressWidth = Math.min((draft.length / 500) * 100, 100);

  const dayOrder = [1, 2, 3, 4, 5, 6, 0];
  const todayDay = new Date().getDay();

  const topPosts = patterns.topPostsByViews.slice(0, 5);
  const totalRecentPosts = recentPosts.length;
  const totalAccountViews = toNumberOrZero(analyticsData?.account?.views);

  if (!user?.threadsAccessToken) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-full text-center gap-4">
        <DnaIcon className="w-12 h-12 text-muted-foreground" />
        <div>
          <p className="font-semibold text-foreground">Threads account not connected</p>
          <p className="text-sm text-muted-foreground mt-1">
            Connect your account in Settings to view Performance DNA.
          </p>
        </div>
        <Link href="/settings">
          <Button variant="outline">Go to Settings</Button>
        </Link>
      </div>
    );
  }

  if (!isProPlan) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-full text-center gap-4">
        <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
          <Crown className="w-6 h-6 text-amber-400" />
        </div>
        <div>
          <p className="font-semibold text-foreground">Performance DNA is a Pro feature</p>
          <p className="text-sm text-muted-foreground mt-1">
            Enable Pro from the sidebar toggle to unlock Performance DNA.
          </p>
        </div>
        <Link href="/settings">
          <Button variant="outline">View Plan Settings</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="px-6 pt-3 pb-6 space-y-6 h-full overflow-y-auto">
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-bold text-foreground">Performance DNA</h1>
        <span className="text-sm text-muted-foreground">Your personalized content patterns</span>
      </div>

      <Card>
        <CardContent className="pt-5 pb-5 space-y-3">
          {isDnaLoading ? (
            <>
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-2 w-full" />
            </>
          ) : ready ? (
            <>
              <div className="flex items-center gap-2 text-sm text-foreground font-medium">
                <span className="w-2 h-2 rounded-full bg-primary" />
                Performance DNA Active -- {dnaCount} posts analyzed
              </div>
              <p className="text-xs text-muted-foreground">Patterns update as you publish more posts</p>
              <p className="text-[11px] text-muted-foreground/80">
                {totalRecentPosts} recent posts synced -- {formatNum(totalAccountViews)} account views tracked
              </p>
              <div className="h-2 w-full rounded-full bg-muted/30">
                <div className="h-2 rounded-full bg-primary/70" style={{ width: "100%" }} />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="font-medium text-foreground">{dnaCount}/15 posts tracked</span>
                <span className="text-muted-foreground">Performance DNA activates at 15 posts</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted/30 overflow-hidden">
                <div
                  className="h-2 rounded-full bg-primary/70 transition-all duration-300"
                  style={{ width: `${Math.min((dnaCount / 15) * 100, 100)}%` }}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {ready ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Zap className="w-4 h-4 text-primary" />Best Hook Style</CardTitle>
              <CardDescription>Leading style by average replies</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xl font-bold" style={{ color: "#FB923C" }}>
                {patterns.bestHookStyle ? toTitleCase(patterns.bestHookStyle) : "Not enough data"}
              </div>
              <p className="text-xs text-muted-foreground">
                {patterns.hookMultiplier && patterns.hookMultiplier > 1
                  ? `Gets ${patterns.hookMultiplier}x more replies than other styles`
                  : "Collect more hook data to compare style lift"}
              </p>
              <div className="space-y-2">
                {patterns.hookStyles.slice(0, 5).map((item) => {
                  const max = Math.max(...patterns.hookStyles.map((style) => style.avgReplies), 1);
                  return (
                    <div key={item.style} className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{toTitleCase(item.style)}</span>
                        <span>{item.avgReplies.toFixed(1)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                        <div className="h-1.5 rounded-full bg-primary/70" style={{ width: `${(item.avgReplies / max) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><AlignLeft className="w-4 h-4 text-primary" />Sweet Spot Length</CardTitle>
              <CardDescription>Top 30% posts by views</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xl font-bold" style={{ color: "#FB923C" }}>
                {patterns.sweetSpot ? `${patterns.sweetSpot.min}-${patterns.sweetSpot.max} chars` : "Not enough data"}
              </div>
              <p className="text-xs text-muted-foreground">Top performing posts stay in this range</p>
              <div className="space-y-1.5">
                <div className="relative h-2 rounded-full bg-muted/30 overflow-hidden">
                  {patterns.sweetSpot ? (
                    <div
                      className="absolute top-0 h-2 bg-primary/70 rounded-full"
                      style={{
                        left: `${(patterns.sweetSpot.min / 500) * 100}%`,
                        width: `${Math.max(((patterns.sweetSpot.max - patterns.sweetSpot.min) / 500) * 100, 2)}%`,
                      }}
                    />
                  ) : null}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>0</span>
                  <span>500</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4 text-primary" />Peak Posting Time</CardTitle>
              <CardDescription>Hour window with highest average views</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xl font-bold" style={{ color: "#FB923C" }}>
                {patterns.bestHour !== null
                  ? `${formatHourLabel(patterns.bestHour)} - ${formatHourLabel(patterns.bestHour + 2)}`
                  : "Not enough data"}
              </div>
              <p className="text-xs text-muted-foreground">
                {patterns.bestHourAvgViews > 0
                  ? `${formatNum(patterns.bestHourAvgViews)} avg views in this window`
                  : "Need more view data by hour"}
              </p>
              <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
                {patterns.hourAverages.map((avg, hour) => {
                  const maxHourAvg = Math.max(...patterns.hourAverages, 1);
                  const intensity = avg > 0 ? Math.max(0.18, avg / maxHourAvg) : 0.12;
                  const isPeak = patterns.bestHour !== null && (hour === patterns.bestHour || hour === ((patterns.bestHour + 1) % 24));
                  return (
                    <div
                      key={hour}
                      className={`h-5 rounded-sm border ${isPeak ? "border-orange-400/70" : "border-border/30"}`}
                      style={{ backgroundColor: `rgba(14, 165, 233, ${intensity})` }}
                      title={`${hour}:00`}
                    />
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" />Best Day</CardTitle>
              <CardDescription>Day with highest average views</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xl font-bold" style={{ color: "#FB923C" }}>
                {patterns.bestDay !== null ? DAY_NAMES[patterns.bestDay] : "Not enough data"}
              </div>
              <p className="text-xs text-muted-foreground">
                {patterns.bestDay !== null
                  ? `${formatNum(patterns.bestDayAvgViews)} avg views on ${DAY_NAMES[patterns.bestDay]}`
                  : "Need more day-level view data"}
              </p>
              <div className="grid grid-cols-7 gap-2 items-end">
                {dayOrder.map((day) => {
                  const avg = patterns.dayAverages[day] || 0;
                  const maxDayAvg = Math.max(...patterns.dayAverages, 1);
                  const h = maxDayAvg > 0 ? Math.max(8, Math.round((avg / maxDayAvg) * 40)) : 8;
                  const isBest = patterns.bestDay === day;
                  const isToday = day === todayDay;
                  return (
                    <div key={day} className="flex flex-col items-center gap-1">
                      <div className={`w-full rounded-sm ${isBest ? "bg-primary" : "bg-muted/50"}`} style={{ height: `${h}px` }} />
                      <span className="text-[10px] text-muted-foreground">{DAY_NAMES[day].slice(0, 3)}</span>
                      <span className={`w-1 h-1 rounded-full ${isToday ? "bg-primary" : "bg-transparent"}`} />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Hash className="w-4 h-4 text-primary" />Top Topic</CardTitle>
              <CardDescription>Best APP_TAG by average views</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xl font-bold font-['JetBrains_Mono'] uppercase" style={{ color: "#FB923C" }}>
                {patterns.topTag ? patterns.topTag : "Not enough data"}
              </div>
              <p className="text-xs text-muted-foreground">
                {patterns.topTagAvgViews > 0
                  ? `${formatNum(patterns.topTagAvgViews)} avg views per post`
                  : "Need more tagged posts"}
              </p>
              <div className="space-y-2">
                {patterns.tagRankings.slice(0, 5).map((item) => {
                  const maxTagAvg = Math.max(...patterns.tagRankings.map((tag) => tag.avgViews), 1);
                  return (
                    <div key={item.tag} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-xs">
                      <span className="font-['JetBrains_Mono'] font-semibold text-foreground">#{item.tag.toUpperCase()}</span>
                      <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                        <div className="h-1.5 rounded-full bg-primary/70" style={{ width: `${(item.avgViews / maxTagAvg) * 100}%` }} />
                      </div>
                      <span className="text-muted-foreground">{formatNum(item.avgViews)} avg</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {toNumberOrZero(patterns.ctaBoostPct) > 10 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><MessageCircle className="w-4 h-4 text-primary" />CTA Boost</CardTitle>
                <CardDescription>Reply impact of question/CTA endings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xl font-bold" style={{ color: "#FB923C" }}>
                  +{toNumberOrZero(patterns.ctaBoostPct)}% replies
                </div>
                <p className="text-xs text-muted-foreground">Posts ending with a question or CTA</p>
                <div className="space-y-2">
                  {[
                    { label: "With CTA", value: patterns.ctaAvgRepliesWith },
                    { label: "Without CTA", value: patterns.ctaAvgRepliesWithout },
                  ].map((row) => {
                    const max = Math.max(patterns.ctaAvgRepliesWith, patterns.ctaAvgRepliesWithout, 1);
                    return (
                      <div key={row.label} className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{row.label}</span>
                          <span>{row.value.toFixed(1)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                          <div className="h-1.5 rounded-full bg-primary/70" style={{ width: `${(row.value / max) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><MessageCircle className="w-4 h-4 text-primary" />CTA Boost</CardTitle>
                <CardDescription>No meaningful CTA lift yet</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">CTA impact card appears once your reply lift crosses 10%.</p>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="py-10 flex flex-col items-center text-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <p className="font-medium text-foreground">Winning Patterns Locked</p>
            <p className="text-sm text-muted-foreground">Publish at least {Math.max(0, 15 - dnaCount)} more posts to unlock your personalized patterns.</p>
          </CardContent>
        </Card>
      )}

      {ready ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score Your Post Before Publishing</CardTitle>
            <CardDescription>Draft a post and get pattern-based score in real time</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, 500))}
                placeholder="Paste or type your draft here..."
                className="min-h-[220px] resize-none"
              />
              <div className="flex items-center justify-between text-xs">
                <span className={rhythm.counterClass}>{draft.length}/500</span>
                {rhythm.label ? <span className={rhythm.labelClass}>{rhythm.label}</span> : <span className="text-muted-foreground/50"> </span>}
              </div>
              <div className="h-0.5 w-full rounded-full bg-muted/20 overflow-hidden">
                <div
                  className={`h-0.5 rounded-full transition-all duration-200 ${rhythm.barClass}`}
                  style={{ width: `${progressWidth}%` }}
                />
              </div>

              {draft.trim().length > 0 ? (
                <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">First line:</span>
                    <span className={`text-xs font-semibold ${getScoreToneClass(scorePreview.firstLineScore)}`}>
                      {scorePreview.firstLineScore}/100 scroll-stop score
                    </span>
                  </div>
                  <p className="text-sm text-foreground bg-background/50 rounded px-2 py-1.5 border border-border/40">
                    {firstLine || "No first line detected"}
                  </p>
                  <div className="space-y-1">
                    {firstLineTips.map((tip, idx) => {
                      const isPositive = /^strong/i.test(tip.trim());
                      return (
                        <div key={`${tip}-${idx}`} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <span>{isPositive ? "✅" : "💡"}</span>
                          <span>{tip}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-border/50 p-4">
                <div className={`text-4xl font-bold ${activeScore ? getScoreToneClass(activeScore.total) : "text-muted-foreground"}`}>
                  {activeScore ? activeScore.total : "--"}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {activeScore ? activeScore.label : "Start typing to see your score"}
                </p>
                <div className="mt-3 h-2 w-full rounded-full bg-muted/20 overflow-hidden">
                  <div className="h-2 rounded-full bg-primary/70" style={{ width: `${activeScore ? activeScore.total : 0}%` }} />
                </div>
              </div>

              {activeScore ? (
                <>
                  <div className="space-y-2">
                    {activeScore.signals.map((signal) => (
                      <div key={signal.label} className="flex items-start justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs">
                              {signal.status === "pass" ? "✅" : signal.status === "fail" ? "❌" : "⚪"}
                            </span>
                            <span className="text-foreground font-medium">{signal.label}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{signal.description}</p>
                        </div>
                        <span
                          className={`text-xs font-semibold whitespace-nowrap ${
                            signal.points > 0
                              ? "text-emerald-400"
                              : signal.points < 0
                                ? "text-destructive"
                                : "text-muted-foreground"
                          }`}
                        >
                          {signal.points > 0
                            ? `+${signal.points}`
                            : signal.points < 0
                              ? `${signal.points}`
                              : `0/${signal.maxPoints}`}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-border/50 pt-3">
                    <p className="text-xs text-muted-foreground">
                      Expected reach: {formatNum(activeScore.expectedLow)} - {formatNum(activeScore.expectedHigh)} views
                    </p>
                  </div>
                </>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center space-y-1">
            <p className="font-medium text-foreground">Pre-Publish Scorer Locked</p>
            <p className="text-sm text-muted-foreground">Score previews become available once DNA is active.</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Top Performing Posts</CardTitle>
          <CardDescription>Learn from what already worked</CardDescription>
        </CardHeader>
        <CardContent>
          {topPosts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No post performance data available yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border/50">
                    <th className="py-2 pr-3">Content</th>
                    <th className="py-2 pr-3">Views</th>
                    <th className="py-2 pr-3">Likes</th>
                    <th className="py-2 pr-3">Hook Style</th>
                    <th className="py-2 pr-3">Length</th>
                    <th className="py-2 pr-3">Day Posted</th>
                    <th className="py-2">Hour Posted</th>
                  </tr>
                </thead>
                <tbody>
                  {topPosts.map((post, idx) => {
                    const day = getDayFromPost(post);
                    const hour = getHourFromPost(post);
                    const hook = post.hookStyle ? toTitleCase(post.hookStyle) : "Unknown";
                    return (
                      <tr key={`${post.id || "dna"}-${idx}`} className="border-b border-border/30 last:border-0">
                        <td className="py-2 pr-3 text-foreground max-w-[360px]">{(post.text || "(no text)").slice(0, 60)}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{formatNum(getPostViews(post))}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{formatNum(getPostLikes(post))}</td>
                        <td className="py-2 pr-3">
                          <Badge variant="secondary" className="text-[10px]">{hook}</Badge>
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">{detectPostLength(post)}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{day !== null ? DAY_NAMES[day] : "-"}</td>
                        <td className="py-2 text-muted-foreground">{hour !== null ? formatHourLabel(hour) : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

