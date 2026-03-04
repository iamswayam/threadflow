import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import {
  MessageSquare, RefreshCw, Heart, Reply, Search, AlertCircle, Send, Filter, Smile, Plus,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";

const MAX_CHARS = 500;
const CUSTOM_EMOJI_STORAGE_KEY = "threadflow-custom-emojis";
const MAX_CUSTOM_EMOJIS = 40;
type CustomEmoji = { emoji: string; label: string };
type EmojiItem = { emoji: string; label: string; isCustom: boolean };
const EMOJI_CATALOG = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎", "🤔", "😴",
  "😇", "🤩", "🥳", "😌", "😋", "😜", "🤗", "🤝", "🙏", "💪",
  "👀", "🔥", "✨", "💯", "✅", "⭐", "🚀", "🎯", "📈", "💡",
  "👏", "🙌", "👍", "👎", "❤️", "🩵", "💙", "💚", "💛", "🧡",
  "💜", "🤍", "🖤", "💬", "🗣️", "📣", "🎉", "🌟", "🌍", "🌙",
  "☀️", "⚡", "🌈", "🧠", "📌", "📝", "📊", "⏰", "🔁", "🔍",
  "📍", "🎵", "🎬", "📷", "🫶", "🤞", "😅", "🙂", "🙃", "😄",
];

interface Comment {
  id: string;
  text: string;
  timestamp: string;
  username?: string;
  profile_picture_url?: string;
}

function CommentCard({
  comment,
  postId,
  onLike,
  onReply,
  customEmojis,
  onAddCustomEmoji,
  liking,
  replying,
  isNew,
}: {
  comment: Comment;
  postId: string;
  onLike: (id: string) => void;
  onReply: (id: string, text: string) => void;
  customEmojis: CustomEmoji[];
  onAddCustomEmoji: (emoji: string, label: string) => boolean;
  liking: boolean;
  replying: boolean;
  isNew: boolean;
}) {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [openEmoji, setOpenEmoji] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState("");
  const [showAddCustomEmoji, setShowAddCustomEmoji] = useState(false);
  const [customEmojiInput, setCustomEmojiInput] = useState("");
  const [customEmojiLabel, setCustomEmojiLabel] = useState("");
  const replyInputRef = useRef<HTMLTextAreaElement | null>(null);

  const handleReply = () => {
    if (!replyText.trim()) return;
    onReply(comment.id, replyText);
    setReplyText("");
    setShowReply(false);
    setOpenEmoji(false);
    setEmojiSearch("");
    setShowAddCustomEmoji(false);
    setCustomEmojiInput("");
    setCustomEmojiLabel("");
  };

  const emojiItems: EmojiItem[] = [
    ...EMOJI_CATALOG.map((emoji) => ({ emoji, label: "", isCustom: false })),
    ...customEmojis.map((item) => ({ emoji: item.emoji, label: item.label, isCustom: true })),
  ];

  const visibleEmojis = emojiSearch.trim()
    ? emojiItems.filter((item) => `${item.emoji} ${item.label}`.includes(emojiSearch.trim().toLowerCase()))
    : emojiItems;

  const handleAddCustomEmoji = () => {
    const emoji = customEmojiInput.trim();
    const label = customEmojiLabel.trim().toLowerCase();
    const added = onAddCustomEmoji(emoji, label);
    if (added) {
      setShowAddCustomEmoji(false);
      setCustomEmojiInput("");
      setCustomEmojiLabel("");
    }
  };

  const insertEmoji = (emoji: string) => {
    setReplyText((prev) => {
      const current = prev || "";
      const el = replyInputRef.current;
      if (!el) return `${current}${emoji}`.slice(0, MAX_CHARS);

      const start = el.selectionStart ?? current.length;
      const end = el.selectionEnd ?? current.length;
      const next = `${current.slice(0, start)}${emoji}${current.slice(end)}`.slice(0, MAX_CHARS);
      requestAnimationFrame(() => {
        el.focus();
        const cursor = Math.min(start + emoji.length, next.length);
        el.setSelectionRange(cursor, cursor);
      });
      return next;
    });
  };

  return (
    <div
      className={`p-4 rounded-md border space-y-3 ${isNew ? "border-l-2 border-l-primary border-border" : "border-border"}`}
      data-testid={`card-comment-${comment.id}`}
    >
      <div className="flex items-start gap-3">
        <Avatar className="w-8 h-8 flex-shrink-0">
          <AvatarImage src={comment.profile_picture_url} />
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
            {comment.username?.[0]?.toUpperCase() || "?"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-medium text-username">
              {comment.username ? `@${comment.username}` : "Anonymous"}
            </span>
            {isNew && <Badge variant="outline" className="text-xs border-primary/30 text-primary">New</Badge>}
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(comment.timestamp), { addSuffix: true })}
            </span>
          </div>
          <p className="text-sm text-foreground mt-1">{comment.text}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 ml-11">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onLike(comment.id)}
          disabled={liking}
          data-testid={`button-like-${comment.id}`}
        >
          <Heart className="w-3.5 h-3.5 mr-1.5" />
          Like
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowReply(!showReply)}
          data-testid={`button-reply-toggle-${comment.id}`}
        >
          <Reply className="w-3.5 h-3.5 mr-1.5" />
          Reply
        </Button>
      </div>

      {showReply && (
        <div className="ml-11 space-y-2">
          <div className="relative">
            <Textarea
              placeholder="Write a reply..."
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              ref={replyInputRef}
              className="resize-none min-h-[80px]"
              maxLength={MAX_CHARS}
              data-testid={`textarea-reply-${comment.id}`}
            />
            <span className="absolute bottom-2 right-3 text-xs font-mono text-muted-foreground">
              {replyText.length}/{MAX_CHARS}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Popover
              open={openEmoji}
              onOpenChange={(next) => {
                setOpenEmoji(next);
                if (!next) {
                  setEmojiSearch("");
                  setShowAddCustomEmoji(false);
                  setCustomEmojiInput("");
                  setCustomEmojiLabel("");
                }
              }}
            >
              <PopoverTrigger asChild>
                <Button size="sm" variant="ghost" data-testid={`button-emoji-${comment.id}`}>
                  <Smile className="w-3.5 h-3.5 mr-1.5" />
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
                        key={`${emojiItem.emoji}-${emojiItem.isCustom ? "c" : "b"}-${idx}`}
                        type="button"
                        className="h-8 w-8 rounded hover:bg-muted text-lg leading-none"
                        onClick={() => insertEmoji(emojiItem.emoji)}
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
                      <Button size="sm" className="h-7 px-2 text-xs" onClick={handleAddCustomEmoji}>
                        Add
                      </Button>
                    </div>
                  </div>
                )}
              </PopoverContent>
            </Popover>
            <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleReply}
              disabled={replying || !replyText.trim()}
              data-testid={`button-send-reply-${comment.id}`}
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              {replying ? "Sending..." : "Send Reply"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowReply(false);
                setReplyText("");
                setOpenEmoji(false);
                setEmojiSearch("");
                setShowAddCustomEmoji(false);
                setCustomEmojiInput("");
                setCustomEmojiLabel("");
              }}
              data-testid={`button-cancel-reply-${comment.id}`}
            >
              Cancel
            </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Comments() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [postId, setPostId] = useState("");
  const [inputPostId, setInputPostId] = useState("");
  const [commentSearch, setCommentSearch] = useState("");
  const [likingId, setLikingId] = useState<string | null>(null);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [customEmojis, setCustomEmojis] = useState<CustomEmoji[]>([]);

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

  const addCustomEmoji = (emoji: string, label: string): boolean => {
    if (!emoji) {
      toast({ title: "Emoji required", description: "Paste an emoji first.", variant: "destructive" });
      return false;
    }
    if (customEmojis.some((item) => item.emoji === emoji)) {
      toast({ title: "Already added", description: "That emoji is already in your custom list." });
      return false;
    }
    const next = [{ emoji, label }, ...customEmojis].slice(0, MAX_CUSTOM_EMOJIS);
    setCustomEmojis(next);
    localStorage.setItem(CUSTOM_EMOJI_STORAGE_KEY, JSON.stringify(next));
    toast({ title: "Custom emoji added" });
    return true;
  };

  const hasToken = !!user?.threadsAccessToken;

  const { data: rawComments = [], isLoading, error, refetch, isFetching } = useQuery<Comment[]>({
    queryKey: ["/api/comments", postId],
    queryFn: async () => {
      const token = localStorage.getItem("tf_token");
      const res = await fetch(`/api/comments?postId=${postId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to fetch comments");
      }
      return res.json();
    },
    enabled: !!postId,
    retry: false,
  });

  const now = Date.now();
  const comments = commentSearch.trim()
    ? rawComments.filter(c => c.text?.toLowerCase().includes(commentSearch.toLowerCase()) || c.username?.toLowerCase().includes(commentSearch.toLowerCase()))
    : rawComments;

  const replyMutation = useMutation({
    mutationFn: ({ commentId, content }: { commentId: string; content: string }) =>
      apiRequest("POST", `/api/comments/${commentId}/reply`, { content }),
    onMutate: ({ commentId }) => setReplyingId(commentId),
    onSuccess: () => {
      toast({ title: "Reply sent!", description: "Your reply is now live on Threads." });
      refetch();
    },
    onError: (err: any) => {
      const msg = err.message?.includes("NO_TOKEN")
        ? "Connect your Threads account first."
        : err.message || "Failed to send reply";
      toast({ title: "Failed to reply", description: msg, variant: "destructive" });
    },
    onSettled: () => setReplyingId(null),
  });

  const likeMutation = useMutation({
    mutationFn: (commentId: string) => apiRequest("POST", `/api/comments/${commentId}/like`, {}),
    onMutate: (commentId) => setLikingId(commentId),
    onSuccess: () => {
      toast({ title: "Liked!" });
    },
    onError: (err: any) => {
      const msg = err.message?.includes("NO_TOKEN")
        ? "Connect your Threads account first."
        : err.message || "Failed to like comment";
      toast({ title: "Could not like", description: msg, variant: "destructive" });
    },
    onSettled: () => setLikingId(null),
  });

  const handleSearch = () => {
    if (!inputPostId.trim()) return;
    setPostId(inputPostId.trim());
  };

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Comment Manager</h1>
        <p className="text-muted-foreground mt-1">View, reply to, and like comments on your posts</p>
      </div>

      {!hasToken && (
        <div className="flex items-start gap-3 p-4 rounded-md bg-amber-500/10 border border-amber-500/20">
          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-amber-200">
              No Threads account connected. Connect your account to fetch and manage comments.
            </p>
          </div>
          <Link href="/settings">
            <Button size="sm" variant="outline">Connect</Button>
          </Link>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Find Post Comments</CardTitle>
          <CardDescription>Enter a Threads post ID to view its comments</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Post ID (e.g. 18234567890123456)"
                value={inputPostId}
                onChange={e => setInputPostId(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSearch()}
                className="pl-9"
                data-testid="input-post-id-search"
              />
            </div>
            <Button onClick={handleSearch} disabled={!inputPostId.trim()} data-testid="button-fetch-comments">
              <MessageSquare className="w-4 h-4 mr-2" />
              Fetch Comments
            </Button>
            {postId && (
              <Button
                variant="outline"
                onClick={() => refetch()}
                disabled={isFetching}
                data-testid="button-refresh-comments"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {postId && !isLoading && rawComments.length > 0 && (
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Filter comments by keyword or username..."
            value={commentSearch}
            onChange={e => setCommentSearch(e.target.value)}
            className="pl-9"
            data-testid="input-comment-filter"
          />
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="w-8 h-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {error && postId && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <AlertCircle className="w-8 h-8 text-destructive mb-3" />
            <p className="text-sm font-medium text-foreground">Failed to load comments</p>
            <p className="text-xs text-muted-foreground mt-1">
              {(error as Error).message?.includes("NO_TOKEN")
                ? "API token not configured"
                : (error as Error).message || "Unknown error"}
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && postId && rawComments.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <MessageSquare className="w-8 h-8 text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-foreground">No comments found</p>
            <p className="text-xs text-muted-foreground mt-1">This post doesn't have any comments yet</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && comments.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              {commentSearch ? `${comments.length} matching comments` : `${comments.length} comment${comments.length !== 1 ? "s" : ""}`}
            </p>
            <Badge variant="secondary">Post {postId.slice(0, 8)}...</Badge>
          </div>
          {comments.map((comment, idx) => {
            const commentAge = now - new Date(comment.timestamp).getTime();
            const isNew = commentAge < 24 * 60 * 60 * 1000;
            return (
              <CommentCard
                key={comment.id}
                comment={comment}
                postId={postId}
                onLike={(id) => likeMutation.mutate(id)}
                onReply={(id, text) => replyMutation.mutate({ commentId: id, content: text })}
                customEmojis={customEmojis}
                onAddCustomEmoji={addCustomEmoji}
                liking={likingId === comment.id}
                replying={replyingId === comment.id}
                isNew={isNew}
              />
            );
          })}
        </div>
      )}

      {!postId && !isLoading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-4">
              <MessageSquare className="w-7 h-7 text-primary" />
            </div>
            <p className="text-base font-medium text-foreground">Enter a Post ID to get started</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Copy the post ID from your Threads app and paste it above to view and manage comments
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
