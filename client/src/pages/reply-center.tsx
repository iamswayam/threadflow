import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  AlertCircle,
  ExternalLink,
  EyeOff,
  Eye,
  Filter,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldAlert,
  TrendingUp,
  Send,
  Users,
  Smile,
  Plus,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type HiddenFilter = "all" | "hidden" | "visible";
type CustomEmoji = { emoji: string; label: string };
type EmojiItem = { emoji: string; label: string; isCustom: boolean };
const CUSTOM_EMOJI_STORAGE_KEY = "threadflow-custom-emojis";
const MAX_CUSTOM_EMOJIS = 40;

const EMOJI_CATALOG = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎", "🤔", "😴",
  "😇", "🤩", "🥳", "😌", "😋", "😜", "🤗", "🤝", "🙏", "💪",
  "👀", "🔥", "✨", "💯", "✅", "⭐", "🚀", "🎯", "📈", "💡",
  "👏", "🙌", "👍", "👎", "❤️", "🩵", "💙", "💚", "💛", "🧡",
  "💜", "🤍", "🖤", "💬", "🗣️", "📣", "🎉", "🌟", "🌍", "🌙",
  "☀️", "⚡", "🌈", "🧠", "📌", "📝", "📊", "⏰", "🔁", "🔍",
  "📍", "🎵", "🎬", "📷", "🫶", "🤞", "😅", "🙂", "🙃", "😄",
];

interface ReplyCenterItem {
  id: string;
  text: string;
  timestamp: string;
  username: string;
  profilePictureUrl: string | null;
  permalink: string | null;
  isReplyOwnedByMe: boolean;
  isHidden: boolean;
  hideStatus: string;
  toxicityScore: number;
  toxicityLevel: "low" | "medium" | "high";
  isUnanswered: boolean;
  responseTimeMs: number | null;
  firstResponseAt: string | null;
  respondedWithin1Hour: boolean;
  highFollowerAuthorProxy: boolean;
  authorReplyCountInWindow: number;
  isReplyToMe: boolean;
  isDirectReplyToPost: boolean;
  repliedToUsername: string | null;
  post: {
    id: string;
    text: string;
    timestamp: string;
    permalink: string | null;
  };
}

interface ReplyCenterData {
  meta: { days: number; postsLimit: number; repliesPerPost: number; since: string };
  quota: { replyQuotaUsage: number; quotaTotal: number; quotaDurationSeconds: number } | null;
  sla: {
    totalIncomingReplies: number;
    answeredReplies: number;
    unansweredReplies: number;
    avgFirstResponseTimeMs: number | null;
    repliedWithin1HourPercent: number;
    unansweredOver1Hour: number;
    unansweredOver24Hours: number;
  };
  inbox: ReplyCenterItem[];
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "-";
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 1) return "<1m";
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return `${hours}h ${minutes}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export default function ReplyCenter() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [days, setDays] = useState("7");
  const [postsLimit, setPostsLimit] = useState("25");
  const [showMine, setShowMine] = useState(false);
  const [onlyRepliesToMe, setOnlyRepliesToMe] = useState(true);
  const [onlyToxicRisk, setOnlyToxicRisk] = useState(false);
  const [onlyHighFollowerProxy, setOnlyHighFollowerProxy] = useState(false);
  const [hiddenFilter, setHiddenFilter] = useState<HiddenFilter>("all");
  const [search, setSearch] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [openReplyComposerId, setOpenReplyComposerId] = useState<string | null>(null);
  const [openEmojiForId, setOpenEmojiForId] = useState<string | null>(null);
  const [emojiSearch, setEmojiSearch] = useState("");
  const [customEmojis, setCustomEmojis] = useState<CustomEmoji[]>([]);
  const [showAddCustomEmoji, setShowAddCustomEmoji] = useState(false);
  const [customEmojiInput, setCustomEmojiInput] = useState("");
  const [customEmojiLabel, setCustomEmojiLabel] = useState("");
  const replyInputRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const queryKey = ["/api/reply-center", days, postsLimit];
  const queryUrl = `/api/reply-center?days=${days}&postsLimit=${postsLimit}&repliesPerPost=100`;

  const { data, isLoading, isFetching, error, refetch } = useQuery<ReplyCenterData>({
    queryKey,
    queryFn: () => apiRequest("GET", queryUrl),
    enabled: !!user?.threadsAccessToken,
    staleTime: 60 * 1000,
  });

  const replyMutation = useMutation({
    mutationFn: ({ replyId, content }: { replyId: string; content: string }) =>
      apiRequest("POST", `/api/reply-center/${replyId}/reply`, { content }),
    onSuccess: () => {
      toast({ title: "Reply sent", description: "Your response is now posted." });
      setOpenReplyComposerId(null);
      setOpenEmojiForId(null);
      setEmojiSearch("");
      setShowAddCustomEmoji(false);
      setCustomEmojiInput("");
      setCustomEmojiLabel("");
      setReplyDrafts({});
      void queryClient.invalidateQueries({ queryKey: ["/api/reply-center"] });
    },
    onError: (err: any) => {
      toast({ title: "Reply failed", description: err?.message || "Could not send reply", variant: "destructive" });
    },
  });

  const hideMutation = useMutation({
    mutationFn: ({ replyId, hide }: { replyId: string; hide: boolean }) =>
      apiRequest("POST", `/api/reply-center/${replyId}/hide`, { hide }),
    onSuccess: (_, vars) => {
      toast({ title: vars.hide ? "Reply hidden" : "Reply unhidden" });
      void queryClient.invalidateQueries({ queryKey: ["/api/reply-center"] });
    },
    onError: (err: any) => {
      toast({
        title: "Action failed",
        description: err?.message || "Could not update hide status",
        variant: "destructive",
      });
    },
  });

  const filteredInbox = useMemo(() => {
    const inbox = data?.inbox || [];
    const q = search.trim().toLowerCase();
    return inbox.filter((item) => {
      if (!showMine && item.isReplyOwnedByMe) return false;
      if (onlyRepliesToMe && !item.isReplyToMe) return false;
      if (onlyToxicRisk && item.toxicityLevel === "low") return false;
      if (onlyHighFollowerProxy && !item.highFollowerAuthorProxy) return false;
      if (hiddenFilter === "hidden" && !item.isHidden) return false;
      if (hiddenFilter === "visible" && item.isHidden) return false;
      if (!q) return true;
      return (
        item.text.toLowerCase().includes(q) ||
        item.username.toLowerCase().includes(q) ||
        item.post.text.toLowerCase().includes(q)
      );
    });
  }, [data?.inbox, hiddenFilter, onlyHighFollowerProxy, onlyRepliesToMe, onlyToxicRisk, search, showMine]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_EMOJI_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const normalized = parsed
        .map((item) => ({
          emoji: typeof item?.emoji === "string" ? item.emoji.trim() : "",
          label: typeof item?.label === "string" ? item.label.trim().toLowerCase() : "",
        }))
        .filter((item) => !!item.emoji)
        .slice(0, MAX_CUSTOM_EMOJIS);
      setCustomEmojis(normalized);
    } catch {
      // Ignore malformed local storage values.
    }
  }, []);

  const emojiItems = useMemo<EmojiItem[]>(
    () => [
      ...EMOJI_CATALOG.map((emoji) => ({ emoji, label: "", isCustom: false })),
      ...customEmojis.map((item) => ({ emoji: item.emoji, label: item.label, isCustom: true })),
    ],
    [customEmojis],
  );

  const visibleEmojis = useMemo(() => {
    const q = emojiSearch.trim().toLowerCase();
    if (!q) return emojiItems;
    return emojiItems.filter((item) => `${item.emoji} ${item.label}`.includes(q));
  }, [emojiItems, emojiSearch]);

  const saveCustomEmojis = (next: CustomEmoji[]) => {
    setCustomEmojis(next);
    localStorage.setItem(CUSTOM_EMOJI_STORAGE_KEY, JSON.stringify(next));
  };

  const addCustomEmoji = () => {
    const emoji = customEmojiInput.trim();
    const label = customEmojiLabel.trim().toLowerCase();
    if (!emoji) {
      toast({ title: "Emoji required", description: "Paste an emoji first.", variant: "destructive" });
      return;
    }
    if (customEmojis.some((item) => item.emoji === emoji)) {
      toast({ title: "Already added", description: "That emoji is already in your custom list." });
      return;
    }

    const next = [{ emoji, label }, ...customEmojis].slice(0, MAX_CUSTOM_EMOJIS);
    saveCustomEmojis(next);
    setCustomEmojiInput("");
    setCustomEmojiLabel("");
    setShowAddCustomEmoji(false);
    toast({ title: "Custom emoji added" });
  };

  const insertEmojiToDraft = (replyId: string, emoji: string) => {
    setReplyDrafts((prev) => {
      const current = prev[replyId] || "";
      const el = replyInputRefs.current[replyId];
      if (!el) return { ...prev, [replyId]: `${current}${emoji}`.slice(0, 500) };

      const start = el.selectionStart ?? current.length;
      const end = el.selectionEnd ?? current.length;
      const next = `${current.slice(0, start)}${emoji}${current.slice(end)}`.slice(0, 500);
      requestAnimationFrame(() => {
        el.focus();
        const cursor = Math.min(start + emoji.length, next.length);
        el.setSelectionRange(cursor, cursor);
      });
      return { ...prev, [replyId]: next };
    });
  };

  if (!user?.threadsAccessToken) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-full text-center gap-4">
        <MessageSquare className="w-12 h-12 text-muted-foreground" />
        <div>
          <p className="font-semibold text-foreground">Threads account not connected</p>
          <p className="text-sm text-muted-foreground mt-1">Connect your account in Settings to use Reply Center.</p>
        </div>
        <Link href="/settings">
          <Button variant="outline">Go to Settings</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reply Center</h1>
          <p className="text-muted-foreground mt-1">Operational inbox with SLA tracking and moderation actions</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 24h</SelectItem>
              <SelectItem value="2">Last 48h</SelectItem>
              <SelectItem value="7">Last 7d</SelectItem>
              <SelectItem value="30">Last 30d</SelectItem>
            </SelectContent>
          </Select>
          <Select value={postsLimit} onValueChange={setPostsLimit}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 posts</SelectItem>
              <SelectItem value="25">25 posts</SelectItem>
              <SelectItem value="50">50 posts</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array(4).fill(0).map((_, idx) => (
            <Skeleton key={idx} className="h-24 w-full" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-6 flex items-start gap-3 text-destructive">
            <AlertCircle className="w-5 h-5 mt-0.5" />
            <div>
              <p className="font-medium">Could not load Reply Center</p>
              <p className="text-sm text-muted-foreground mt-1">{(error as Error).message}</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-xs text-muted-foreground">Avg first reply time</p>
                <p className="text-2xl font-bold text-foreground mt-1">{formatDuration(data?.sla.avgFirstResponseTimeMs ?? null)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {data?.sla.answeredReplies || 0} answered of {data?.sla.totalIncomingReplies || 0}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-xs text-muted-foreground">% replied within 1h</p>
                <p className="text-2xl font-bold text-emerald-500 mt-1">{(data?.sla.repliedWithin1HourPercent || 0).toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground mt-0.5">SLA speed score</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-xs text-muted-foreground">Unanswered</p>
                <p className="text-2xl font-bold text-amber-500 mt-1">{data?.sla.unansweredReplies || 0}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  &gt;1h: {data?.sla.unansweredOver1Hour || 0} | &gt;24h: {data?.sla.unansweredOver24Hours || 0}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-xs text-muted-foreground">Reply quota</p>
                <p className="text-2xl font-bold text-blue-500 mt-1">
                  {data?.quota ? `${data.quota.replyQuotaUsage}/${data.quota.quotaTotal}` : "-"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {data?.quota ? `Window: ${Math.round(data.quota.quotaDurationSeconds / 3600)}h` : "Not available"}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="w-4 h-4 text-primary" />
                Inbox Filters
              </CardTitle>
              <CardDescription>Filter replies by SLA urgency, moderation risk, and visibility state</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by reply text, author, or post text..."
                    className="pl-9"
                  />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant={showMine ? "default" : "outline"} size="sm" onClick={() => setShowMine((v) => !v)}>
                    <Users className="w-3.5 h-3.5 mr-1.5" />
                    Include my replies
                  </Button>
                  <Button
                    variant={onlyRepliesToMe ? "default" : "outline"}
                    size="sm"
                    onClick={() => setOnlyRepliesToMe((v) => !v)}
                  >
                    <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                    Only to me
                  </Button>
                  <Button variant={onlyToxicRisk ? "default" : "outline"} size="sm" onClick={() => setOnlyToxicRisk((v) => !v)}>
                    <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />
                    Toxic risk
                  </Button>
                  <Button
                    variant={onlyHighFollowerProxy ? "default" : "outline"}
                    size="sm"
                    onClick={() => setOnlyHighFollowerProxy((v) => !v)}
                  >
                    <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
                    High-follower proxy
                  </Button>
                  <Select value={hiddenFilter} onValueChange={(v) => setHiddenFilter(v as HiddenFilter)}>
                    <SelectTrigger className="w-28 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="visible">Unhidden</SelectItem>
                      <SelectItem value="hidden">Hidden</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                High-follower is a proxy based on repeated engagement in the selected window. Threads API does not expose
                follower count per reply author.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reply Inbox</CardTitle>
              <CardDescription>
                {filteredInbox.length} items in view ({data?.inbox.length || 0} total)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {filteredInbox.length === 0 ? (
                <div className="py-10 text-center">
                  <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-medium text-foreground">No replies match this filter</p>
                  <p className="text-xs text-muted-foreground mt-1">Try broadening filters or refresh data.</p>
                </div>
              ) : (
                filteredInbox.map((item) => {
                  const draft = replyDrafts[item.id] || "";
                  const isReplying = replyMutation.isPending && openReplyComposerId === item.id;
                  const isHiding = hideMutation.isPending;

                  return (
                    <div key={item.id} className="p-4 rounded-md border border-border space-y-3">
                      <div className="flex items-start gap-3">
                        <Avatar className="w-8 h-8 flex-shrink-0">
                          <AvatarImage src={item.profilePictureUrl || undefined} />
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                            {item.username?.[0]?.toUpperCase() || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-username">@{item.username}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                            </span>
                            {item.isReplyOwnedByMe && <Badge variant="outline">My reply</Badge>}
                            {!item.isReplyOwnedByMe && item.isUnanswered && <Badge variant="destructive">Unanswered</Badge>}
                            {!item.isReplyOwnedByMe && item.isReplyToMe && !item.isDirectReplyToPost && (
                              <Badge className="bg-white text-black border border-white/80 hover:bg-white font-semibold">
                                To your reply
                              </Badge>
                            )}
                            {!item.isReplyOwnedByMe && !item.isReplyToMe && item.repliedToUsername && (
                              <Badge className="bg-white text-black border border-white/80 hover:bg-white font-semibold">
                                <span className="text-black">To </span>
                                <span className="text-blue-600">@{item.repliedToUsername}</span>
                              </Badge>
                            )}
                            {item.isHidden && <Badge variant="secondary">Hidden</Badge>}
                            {item.toxicityLevel !== "low" && (
                              <Badge variant={item.toxicityLevel === "high" ? "destructive" : "secondary"}>
                                {item.toxicityLevel} risk ({item.toxicityScore})
                              </Badge>
                            )}
                            {item.highFollowerAuthorProxy && <Badge variant="outline">High-follower proxy</Badge>}
                          </div>
                          <p className="text-sm text-foreground mt-1 whitespace-pre-wrap break-words">{item.text || "(no text)"}</p>
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-1">
                            On post: {item.post.text || item.post.id}
                          </p>
                          {!item.isReplyOwnedByMe && (
                            <p className="text-xs text-muted-foreground mt-1">
                              First response: {formatDuration(item.responseTimeMs)} {item.respondedWithin1Hour ? "(within 1h)" : ""}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {item.permalink && (
                            <a
                              href={item.permalink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-primary"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      </div>

                      {!item.isReplyOwnedByMe && (
                        <div className="flex items-center gap-2 ml-11 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setOpenReplyComposerId((prev) => (prev === item.id ? null : item.id))}
                          >
                            <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                            Reply
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isHiding}
                            onClick={() => hideMutation.mutate({ replyId: item.id, hide: !item.isHidden })}
                          >
                            {item.isHidden ? (
                              <>
                                <Eye className="w-3.5 h-3.5 mr-1.5" />
                                Unhide
                              </>
                            ) : (
                              <>
                                <EyeOff className="w-3.5 h-3.5 mr-1.5" />
                                Hide
                              </>
                            )}
                          </Button>
                        </div>
                      )}

                      {openReplyComposerId === item.id && !item.isReplyOwnedByMe && (
                        <div className="ml-11 space-y-2">
                          <Textarea
                            value={draft}
                            onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [item.id]: e.target.value.slice(0, 500) }))}
                            ref={(el) => { replyInputRefs.current[item.id] = el; }}
                            placeholder="Write your reply..."
                            className="min-h-[84px] resize-none"
                            maxLength={500}
                          />
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">{draft.length}/500</span>
                              <Popover
                                open={openEmojiForId === item.id}
                                onOpenChange={(next) => {
                                  setOpenEmojiForId(next ? item.id : null);
                                  if (!next) {
                                    setEmojiSearch("");
                                    setShowAddCustomEmoji(false);
                                    setCustomEmojiInput("");
                                    setCustomEmojiLabel("");
                                  }
                                }}
                              >
                                <PopoverTrigger asChild>
                                  <Button size="sm" variant="ghost" className="h-7 px-2">
                                    <Smile className="w-3.5 h-3.5 mr-1" />
                                    Emoji
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-72 p-2" align="start">
                                  <Input
                                    value={emojiSearch}
                                    onChange={(e) => setEmojiSearch(e.target.value)}
                                    placeholder="Search emoji..."
                                    className="h-8 text-xs mb-2"
                                  />
                                  <div className="max-h-40 overflow-y-auto">
                                    <div className="grid grid-cols-8 gap-1">
                                      {visibleEmojis.map((emojiItem, idx) => (
                                        <button
                                          key={`${item.id}-${emojiItem.emoji}-${emojiItem.isCustom ? "c" : "b"}-${idx}`}
                                          type="button"
                                          className="h-8 w-8 rounded hover:bg-muted text-lg leading-none"
                                          onClick={() => insertEmojiToDraft(item.id, emojiItem.emoji)}
                                          title={emojiItem.label || "emoji"}
                                        >
                                          {emojiItem.emoji}
                                        </button>
                                      ))}
                                      <button
                                        type="button"
                                        className="h-8 w-8 rounded border border-border hover:bg-muted flex items-center justify-center"
                                        onClick={() => setShowAddCustomEmoji((prev) => !prev)}
                                        title="Add custom emoji"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                  {showAddCustomEmoji && (
                                    <div className="mt-2 space-y-2 border-t border-border pt-2">
                                      <div className="grid grid-cols-[78px_1fr] gap-2">
                                        <Input
                                          value={customEmojiInput}
                                          onChange={(e) => setCustomEmojiInput(e.target.value)}
                                          placeholder="Emoji"
                                          className="h-8 text-xs"
                                        />
                                        <Input
                                          value={customEmojiLabel}
                                          onChange={(e) => setCustomEmojiLabel(e.target.value)}
                                          placeholder="Label (for search)"
                                          className="h-8 text-xs"
                                        />
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-muted-foreground">
                                          Custom emojis are saved on this browser.
                                        </span>
                                        <Button size="sm" className="h-7 px-2 text-xs" onClick={addCustomEmoji}>
                                          Add
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </PopoverContent>
                              </Popover>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setOpenReplyComposerId(null);
                                  setOpenEmojiForId(null);
                                  setEmojiSearch("");
                                  setShowAddCustomEmoji(false);
                                  setCustomEmojiInput("");
                                  setCustomEmojiLabel("");
                                  setReplyDrafts((prev) => ({ ...prev, [item.id]: "" }));
                                }}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                disabled={isReplying || !draft.trim()}
                                onClick={() => replyMutation.mutate({ replyId: item.id, content: draft.trim() })}
                              >
                                <Send className="w-3.5 h-3.5 mr-1.5" />
                                {isReplying ? "Sending..." : "Send Reply"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
