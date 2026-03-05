import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
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
  Crown,
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

interface PersonaBreakdownItem {
  label: string;
  value: number;
}

interface PersonaPost {
  id: string;
  text: string;
  timestamp: string;
  permalink: string | null;
  score: number;
  metrics: {
    views: number;
    likes: number;
    replies: number;
    reposts: number;
    quotes: number;
  };
}

interface PersonaSegment {
  segmentType: "country" | "city" | "age" | "gender";
  label: string;
  value: number;
  sharePct: number;
  recommendedPostIds: string[];
}

interface PersonaData {
  followersCount?: number;
  minFollowersRequired: number;
  eligible: boolean;
  reason?: "FOLLOWERS_LT_100" | "MISSING_PERMISSION" | "NO_DATA";
  errorMessage?: string;
  demographics: {
    countries: PersonaBreakdownItem[];
    cities: PersonaBreakdownItem[];
    ages: PersonaBreakdownItem[];
    genders: PersonaBreakdownItem[];
  } | null;
  mapping: {
    mode: "estimated_global";
    disclaimer: string;
    segments: PersonaSegment[];
    posts: PersonaPost[];
  } | null;
}

const WORLD_TOPOJSON_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const COUNTRY_NAME_ALIASES: Record<string, string[]> = {
  "united states": ["united states of america", "usa", "us"],
  "united kingdom": ["great britain", "britain", "england", "uk", "gb"],
  "united arab emirates": ["uae"],
  "russia": ["russian federation"],
  "south korea": ["korea republic of", "republic of korea"],
  "north korea": ["korea democratic peoples republic of", "democratic peoples republic of korea"],
  "czech republic": ["czechia"],
  "ivory coast": ["cote divoire", "cote d ivoire"],
};

const countryDisplayNames =
  typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

const countryCodeFallbacks: Record<string, string> = {
  US: "United States",
  USA: "United States",
  IN: "India",
  IND: "India",
  AE: "United Arab Emirates",
  ARE: "United Arab Emirates",
  UK: "United Kingdom",
  GB: "United Kingdom",
  GBR: "United Kingdom",
  CA: "Canada",
  CAN: "Canada",
  AU: "Australia",
  AUS: "Australia",
};

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeCountryKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toCountryFullForm(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const compact = trimmed.replace(/[\s_.-]+/g, "").toUpperCase();
  if (/^[A-Z]{2}$/.test(compact)) {
    return countryCodeFallbacks[compact] || countryDisplayNames?.of(compact) || compact;
  }
  if (/^[A-Z]{3}$/.test(compact)) {
    return countryCodeFallbacks[compact] || compact;
  }
  return toTitleCase(trimmed.replace(/[_-]+/g, " "));
}

function toGenderFullForm(value: string): string {
  const compact = value.trim().replace(/[\s_.-]+/g, "").toUpperCase();
  if (!compact) return value;
  if (compact === "M" || compact === "MALE" || compact === "MAN" || compact === "MEN") return "Male";
  if (compact === "F" || compact === "FEMALE" || compact === "WOMAN" || compact === "WOMEN") return "Female";
  if (compact === "NB" || compact === "NONBINARY" || compact === "NONBINARYPERSON") return "Non-binary";
  if (compact === "U" || compact === "UNKNOWN" || compact === "UNSPECIFIED" || compact === "OTHER") return "Unknown";
  return toTitleCase(value.trim().replace(/[_-]+/g, " "));
}

function toCityFullForm(value: string): string {
  const parts = value
    .split(/[|,/]/g)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 2) {
    const [a, b] = parts;
    const aCode = /^[A-Za-z]{2,3}$/.test(a.replace(/\s+/g, ""));
    const bCode = /^[A-Za-z]{2,3}$/.test(b.replace(/\s+/g, ""));
    if (aCode && !bCode) return `${toTitleCase(b)}, ${toCountryFullForm(a)}`;
    if (!aCode && bCode) return `${toTitleCase(a)}, ${toCountryFullForm(b)}`;
  }
  return toTitleCase(value.trim().replace(/[_-]+/g, " "));
}

function collapsePersonaItems(
  items: PersonaBreakdownItem[],
  formatter: (label: string) => string,
): PersonaBreakdownItem[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const label = formatter(item.label || "").trim() || item.label;
    map.set(label, (map.get(label) || 0) + item.value);
  }
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function getCountryFollowersCount(countryName: string, normalizedCounts: Map<string, number>): number {
  const normalized = normalizeCountryKey(countryName);
  if (normalizedCounts.has(normalized)) return normalizedCounts.get(normalized) || 0;

  for (const [baseName, aliases] of Object.entries(COUNTRY_NAME_ALIASES)) {
    if (normalized === baseName || aliases.includes(normalized)) {
      if (normalizedCounts.has(baseName)) return normalizedCounts.get(baseName) || 0;
      for (const alias of aliases) {
        if (normalizedCounts.has(alias)) return normalizedCounts.get(alias) || 0;
      }
    }
  }

  return 0;
}

function getMapFillColor(value: number, maxValue: number): string {
  if (value <= 0 || maxValue <= 0) return "hsl(var(--muted))";
  const ratio = Math.max(0, Math.min(1, value / maxValue));
  const lightness = 86 - ratio * 42;
  return `hsl(193 90% ${lightness}%)`;
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
  const [devProMode, setDevProMode] = useState(false);
  const [activeTab, setActiveTab] = useState<"performance" | "persona">("performance");
  const [chartMetric, setChartMetric] = useState<keyof PostInsights>("views");
  const [analyticsWindow, setAnalyticsWindow] = useState<AnalyticsWindow>("24h");
  const [postPerformanceLimit, setPostPerformanceLimit] = useState<PostPerformanceLimit>(10);
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

  const selectedWindow = analyticsWindowOptions.find((option) => option.value === analyticsWindow) || analyticsWindowOptions[0];
  const windowAnalyticsUrl = (() => {
    const until = new Date();
    const since = new Date(until.getTime() - selectedWindow.ms);
    const sinceUnix = Math.floor(since.getTime() / 1000);
    const untilUnix = Math.floor(until.getTime() / 1000);
    return `/api/analytics?since=${sinceUnix}&until=${untilUnix}&summaryOnly=1`;
  })();

  const {
    data: baseData,
    isLoading: isBaseLoading,
    error: baseError,
    refetch: refetchBase,
  } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics", "base", postPerformanceLimit],
    queryFn: () => apiRequest("GET", `/api/analytics?postsLimit=${postPerformanceLimit}`),
    enabled: !!user?.threadsAccessToken && isProPlan,
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
    enabled: !!user?.threadsAccessToken && isProPlan,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  const {
    data: personaData,
    isLoading: isPersonaLoading,
    error: personaError,
    refetch: refetchPersona,
  } = useQuery<PersonaData>({
    queryKey: ["/api/analytics/persona"],
    queryFn: () => apiRequest("GET", "/api/analytics/persona"),
    enabled: !!user?.threadsAccessToken && isProPlan,
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

  if (!isProPlan) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-full text-center gap-4">
        <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
          <Crown className="w-6 h-6 text-amber-400" />
        </div>
        <div>
          <p className="font-semibold text-foreground">Analytics is a Pro feature</p>
          <p className="text-sm text-muted-foreground mt-1">
            Enable Pro from the sidebar toggle to unlock analytics.
          </p>
        </div>
        <Link href="/settings">
          <Button variant="outline">View Plan Settings</Button>
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
  const personaDemographics = personaData?.demographics;
  const personaCountryItems = useMemo(
    () => collapsePersonaItems(personaDemographics?.countries || [], toCountryFullForm),
    [personaDemographics?.countries],
  );
  const personaCityItems = useMemo(
    () => collapsePersonaItems(personaDemographics?.cities || [], toCityFullForm),
    [personaDemographics?.cities],
  );
  const personaAgeItems = useMemo(
    () => collapsePersonaItems(personaDemographics?.ages || [], (label) => label),
    [personaDemographics?.ages],
  );
  const personaGenderItems = useMemo(
    () => collapsePersonaItems(personaDemographics?.genders || [], toGenderFullForm),
    [personaDemographics?.genders],
  );
  const personaTopCountryEntry = personaCountryItems[0];
  const personaTopCityEntry = personaCityItems[0];
  const personaTopAgeEntry = personaAgeItems[0];
  const personaTopGenderEntry = personaGenderItems[0];
  const personaTopCountry = personaTopCountryEntry?.label || "-";
  const personaTopCity = personaTopCityEntry?.label || "-";
  const personaTopAge = personaTopAgeEntry?.label || "-";
  const personaTopGender = personaTopGenderEntry?.label || "-";
  const personaSegments = useMemo(
    () =>
      (personaData?.mapping?.segments || []).map((segment) => ({
        ...segment,
        label:
          segment.segmentType === "country"
            ? toCountryFullForm(segment.label)
            : segment.segmentType === "gender"
              ? toGenderFullForm(segment.label)
              : segment.segmentType === "city"
                ? toCityFullForm(segment.label)
                : segment.label,
      })),
    [personaData?.mapping?.segments],
  );
  const personaPostsById = new Map((personaData?.mapping?.posts || []).map((post) => [post.id, post]));
  const totalCountryFollowers = personaCountryItems.reduce((sum, item) => sum + item.value, 0);
  const totalCityFollowers = personaCityItems.reduce((sum, item) => sum + item.value, 0);
  const totalAgeFollowers = personaAgeItems.reduce((sum, item) => sum + item.value, 0);
  const totalGenderFollowers = personaGenderItems.reduce((sum, item) => sum + item.value, 0);
  const maxCountryFollowers = personaCountryItems[0]?.value || 0;
  const normalizedCountryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of personaCountryItems) {
      const key = normalizeCountryKey(item.label);
      map.set(key, (map.get(key) || 0) + item.value);
    }
    return map;
  }, [personaCountryItems]);

  const renderBreakdownCard = (
    title: string,
    items: PersonaBreakdownItem[],
    totalFollowers: number,
    emptyText: string,
  ) => {
    const maxValue = items[0]?.value || 1;
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>
            {totalFollowers > 0
              ? `${totalFollowers.toLocaleString()} followers represented in this breakdown`
              : "Follower count breakdown"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{emptyText}</p>
          ) : (
            <div className="space-y-2.5">
              {items.slice(0, 8).map((item) => (
                <div key={`${title}-${item.label}`} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-foreground">{item.label}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {item.value.toLocaleString()} followers
                      {totalFollowers > 0 ? ` (${((item.value / totalFollowers) * 100).toFixed(1)}%)` : ""}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary/80 rounded-full"
                      style={{ width: `${Math.max((item.value / maxValue) * 100, 6)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
            {activeTab === "performance" && (
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
            )}
          </div>
          <p className="text-muted-foreground mt-1">Performance insights for your Threads account</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void refetchBase();
            void refetchWindow();
            void refetchPersona();
          }}
        >
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "performance" | "persona")} className="space-y-4">
        <TabsList className="h-9">
          <TabsTrigger value="performance" className="text-xs">Performance</TabsTrigger>
          <TabsTrigger value="persona" className="text-xs">Audience Persona</TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="mt-0 space-y-6">
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
        {" "} - Daily-aggregated metrics can lag; replies count top-level replies only
      </p>
        </TabsContent>

        <TabsContent value="persona" className="mt-0 space-y-6">
          {isPersonaLoading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                {Array(5).fill(0).map((_, i) => <Skeleton key={`persona-card-${i}`} className="h-24 w-full" />)}
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            </div>
          ) : personaError ? (
            <Card>
              <CardContent className="flex items-center gap-3 py-6 text-destructive">
                <AlertTriangle className="w-5 h-5" />
                <div>
                  <p className="font-medium">Could not load follower persona</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Check your <code className="text-xs bg-muted px-1 rounded">threads_manage_insights</code> permission and try refresh.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : !personaData ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Persona data is not available right now.
              </CardContent>
            </Card>
          ) : !personaData.eligible ? (
            <Card>
              <CardContent className="py-8 space-y-2">
                <p className="font-medium text-foreground">Follower Persona Panel unavailable</p>
                {personaData.reason === "FOLLOWERS_LT_100" ? (
                  <p className="text-sm text-muted-foreground">
                    Needs at least {personaData.minFollowersRequired} followers. Current count: {(personaData.followersCount ?? 0).toLocaleString()}.
                  </p>
                ) : personaData.reason === "MISSING_PERMISSION" ? (
                  <p className="text-sm text-muted-foreground">
                    Enable <code className="text-xs bg-muted px-1 rounded">threads_manage_insights</code> in Meta App and reconnect token.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Persona data could not be loaded. Try refreshing in a moment.
                  </p>
                )}
                {personaData.errorMessage && (
                  <p className="text-xs text-muted-foreground break-words">{personaData.errorMessage}</p>
                )}
              </CardContent>
            </Card>
          ) : personaData.reason === "NO_DATA" ? (
            <Card>
              <CardContent className="py-8 space-y-2">
                <p className="font-medium text-foreground">No follower demographic breakdown yet</p>
                <p className="text-sm text-muted-foreground">
                  Threads returned no country/city/age/gender data for this account at the moment.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                <StatCard
                  label="Followers"
                  value={personaData.followersCount ?? "-"}
                  icon={Users}
                  color="text-amber-500"
                  sub="Total account followers"
                />
                <StatCard
                  label="Top Country"
                  value={personaTopCountry}
                  icon={TrendingUp}
                  color="text-primary"
                  sub={personaTopCountryEntry ? `${personaTopCountryEntry.value.toLocaleString()} followers` : "No follower data"}
                />
                <StatCard
                  label="Top City"
                  value={personaTopCity}
                  icon={TrendingUp}
                  color="text-primary"
                  sub={personaTopCityEntry ? `${personaTopCityEntry.value.toLocaleString()} followers` : "No follower data"}
                />
                <StatCard
                  label="Top Age"
                  value={personaTopAge}
                  icon={TrendingUp}
                  color="text-primary"
                  sub={personaTopAgeEntry ? `${personaTopAgeEntry.value.toLocaleString()} followers` : "No follower data"}
                />
                <StatCard
                  label="Top Gender"
                  value={personaTopGender}
                  icon={TrendingUp}
                  color="text-primary"
                  sub={personaTopGenderEntry ? `${personaTopGenderEntry.value.toLocaleString()} followers` : "No follower data"}
                />
              </div>

              <Card>
                <CardContent className="pt-4 pb-4 text-sm text-muted-foreground">
                  Every number in Audience Persona is a follower count from Threads follower demographics.
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Global Audience Map</CardTitle>
                  <CardDescription>
                    Country shading reflects follower count. Darker highlight means more followers.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="w-full h-[280px] rounded-md border border-border overflow-hidden bg-muted/20">
                    <ComposableMap
                      projectionConfig={{ scale: 145 }}
                      width={980}
                      height={380}
                      style={{ width: "100%", height: "100%" }}
                    >
                      <Geographies geography={WORLD_TOPOJSON_URL}>
                        {({ geographies }) =>
                          geographies.map((geo) => {
                            const countryName = String(geo.properties?.name || "Unknown");
                            const followers = getCountryFollowersCount(countryName, normalizedCountryCounts);
                            return (
                              <Geography
                                key={geo.rsmKey}
                                geography={geo}
                                fill={getMapFillColor(followers, maxCountryFollowers)}
                                stroke="hsl(var(--border))"
                                strokeWidth={0.4}
                                style={{
                                  default: { outline: "none" },
                                  hover: {
                                    fill: followers > 0 ? "hsl(193 90% 38%)" : "hsl(var(--muted))",
                                    outline: "none",
                                  },
                                  pressed: { outline: "none" },
                                }}
                              >
                                <title>
                                  {followers > 0
                                    ? `${countryName}: ${followers.toLocaleString()} followers`
                                    : `${countryName}: no follower data`}
                                </title>
                              </Geography>
                            );
                          })
                        }
                      </Geographies>
                    </ComposableMap>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Hover over a country to view its follower count.
                  </p>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {renderBreakdownCard("Top Countries", personaCountryItems, totalCountryFollowers, "No country data")}
                {renderBreakdownCard("Top Cities", personaCityItems, totalCityFollowers, "No city data")}
                {renderBreakdownCard("Age Mix", personaAgeItems, totalAgeFollowers, "No age data")}
                {renderBreakdownCard("Gender Mix", personaGenderItems, totalGenderFollowers, "No gender data")}
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Content Fit by Segment (Estimated)</CardTitle>
                  <CardDescription>{personaData.mapping?.disclaimer}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {personaSegments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No segment mapping generated yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {personaSegments.map((segment, index) => (
                        <div key={`${segment.segmentType}-${segment.label}-${index}`} className="rounded-md border border-border p-3 space-y-2">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="px-2 py-0.5 rounded-full bg-muted text-foreground capitalize">{segment.segmentType}</span>
                            <span className="font-medium text-foreground">{segment.label}</span>
                            <span className="text-muted-foreground">({segment.sharePct}% - {segment.value.toLocaleString()} followers)</span>
                          </div>
                          <div className="space-y-1.5">
                            {segment.recommendedPostIds.map((postId) => {
                              const post = personaPostsById.get(postId);
                              if (!post) return null;
                              return (
                                <div key={`${segment.label}-${post.id}`} className="text-sm text-muted-foreground">
                                  <span className="text-foreground">{post.text ? `${post.text.slice(0, 80)}${post.text.length > 80 ? "..." : ""}` : "(no text)"}</span>
                                  <span className="ml-2">
                                    Score {post.score} - Views {post.metrics.views.toLocaleString()} - Likes {post.metrics.likes.toLocaleString()}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <p className="text-xs text-muted-foreground text-center pb-2">
                Follower demographics come from Threads <code className="bg-muted px-1 rounded">follower_demographics</code> and require at least 100 followers.
              </p>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}



