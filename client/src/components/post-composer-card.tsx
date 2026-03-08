import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useLocation } from "wouter";
import type { LucideIcon } from "lucide-react";
import {
  BarChart2,
  Calendar,
  Hash,
  Image as ImageIcon,
  Info,
  LayoutGrid,
  Link2,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { addNotification } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import type { ScheduledPost } from "@shared/schema";

const MAX_CHARS = 500;
const THREADCHAIN_PREFILL_KEY = "threadchain_prefill";

const POPULAR_TOPICS = [
  "Astrology Threads", "Motivation Threads", "Business Threads",
  "Health Threads", "Fitness Threads", "Tech Threads", "AI Threads",
  "Spirituality Threads", "Mindset Threads", "Writing Threads",
  "Finance Threads", "Education Threads", "Daily Life Threads",
  "Crypto Threads", "Travel Threads", "Food Threads", "Music Threads",
  "Art Threads", "Sports Threads", "Parenting Threads",
];

const composeSchema = z.object({
  content: z.string().min(1, "Content is required").max(MAX_CHARS, `Max ${MAX_CHARS} characters`),
  mediaUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  mediaType: z.enum(["TEXT", "IMAGE", "VIDEO"]).default("TEXT"),
  scheduledAt: z.string().optional(),
});

type ComposeForm = z.infer<typeof composeSchema>;
type MediaMode = "none" | "image" | "gif" | "poll" | "carousel";
type GifResult = { id: string; url: string; preview: string };

type RhythmState = {
  counterClass: string;
  barClass: string;
  label: string | null;
  labelClass: string;
};

const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_KEY || "dc6zaTOxFJmzC";

function toDateTimeLocalString(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function getSmartDefaultScheduleTime(now = new Date()): Date {
  const next = new Date(now);
  const minutes = next.getMinutes();

  if (minutes <= 24) {
    next.setMinutes(30, 0, 0);
    return next;
  }

  if (minutes <= 54) {
    next.setHours(next.getHours() + 1, 0, 0, 0);
    return next;
  }

  next.setHours(next.getHours() + 1, 30, 0, 0);
  return next;
}

function getRhythmState(charCount: number): RhythmState {
  if (charCount >= MAX_CHARS) {
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
      label: "âœ¦ Sweet spot",
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

function splitLongSegment(segment: string, maxChars = MAX_CHARS): string[] {
  const words = segment.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const chunks: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word.length > maxChars ? word.slice(0, maxChars) : word;
      continue;
    }

    const candidate = `${current} ${word}`;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      chunks.push(current);
      current = word.length > maxChars ? word.slice(0, maxChars) : word;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function splitIntoThreadChunks(content: string, maxChars = MAX_CHARS): string[] {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const sentences = normalized
    .split(/(?<=\.)\s+|(?<=\.)\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const units = sentences.length > 0 ? sentences : [normalized];
  const chunks: string[] = [];
  let current = "";

  const pushUnit = (unit: string) => {
    if (!current) {
      current = unit;
      return;
    }

    const candidate = `${current} ${unit}`.trim();
    if (candidate.length <= maxChars) {
      current = candidate;
      return;
    }

    chunks.push(current);
    current = unit;
  };

  for (const unit of units) {
    if (unit.length <= maxChars) {
      pushUnit(unit);
      continue;
    }

    const longChunks = splitLongSegment(unit, maxChars);
    for (const longChunk of longChunks) {
      pushUnit(longChunk);
    }
  }

  if (current) chunks.push(current);
  return chunks.filter(Boolean);
}

type TestIds = {
  topicInput?: string;
  textarea?: string;
  mediaUrl?: string;
  postNowButton?: string;
  scheduleButton?: string;
  confirmScheduleButton?: string;
  scheduledDateInput?: string;
  scheduledTimeInput?: string;
};

type DraftPayload = {
  id: number;
  text: string;
};

type PostComposerCardProps = {
  title: string;
  mode?: "quick" | "full";
  description?: string;
  icon: LucideIcon;
  className?: string;
  injectedDraft?: DraftPayload | null;
  editingScheduledPost?: ScheduledPost | null;
  onEditFinished?: () => void;
  onDraftConsumed?: () => void;
  showSchedule?: boolean;
  testIds?: TestIds;
};

export function PostComposerCard({
  title,
  mode = "full",
  description,
  icon: Icon,
  className,
  injectedDraft = null,
  editingScheduledPost = null,
  onEditFinished,
  onDraftConsumed,
  showSchedule = true,
  testIds,
}: PostComposerCardProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showScheduleFields, setShowScheduleFields] = useState(false);
  const [topicInput, setTopicInput] = useState(user?.defaultTopic || "");
  const [showTopicSuggestions, setShowTopicSuggestions] = useState(false);
  const [appTags, setAppTags] = useState<string[]>([]);
  const [appTagInput, setAppTagInput] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isAppTagDropdownOpen, setIsAppTagDropdownOpen] = useState(false);
  const [isSplitSuggestionDismissed, setIsSplitSuggestionDismissed] = useState(false);
  const [mediaMode, setMediaMode] = useState<MediaMode>("none");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollDuration, setPollDuration] = useState<24 | 48 | 72 | 168>(24);
  const [gifSearch, setGifSearch] = useState("");
  const [gifResults, setGifResults] = useState<GifResult[]>([]);
  const [selectedGif, setSelectedGif] = useState<string | null>(null);
  const [gifSearching, setGifSearching] = useState(false);
  const [gifCaption, setGifCaption] = useState("");
  const [carouselItems, setCarouselItems] = useState<Array<{ url: string; type: "IMAGE" | "VIDEO" }>>([]);
  const appTagContainerRef = useRef<HTMLDivElement | null>(null);

  const filteredTopics = POPULAR_TOPICS.filter((topic) =>
    topic.toLowerCase().includes(topicInput.toLowerCase()) && topic !== topicInput,
  );
  const { data: existingTags = [] } = useQuery<string[]>({
    queryKey: ["/api/posts/tags"],
    queryFn: async () => {
      try {
        const payload = await apiRequest("GET", "/api/posts/tags");
        if (!Array.isArray(payload)) return [];
        return payload.filter((tag): tag is string => typeof tag === "string");
      } catch {
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  const form = useForm<ComposeForm>({
    resolver: zodResolver(composeSchema),
    defaultValues: { content: "", mediaUrl: "", mediaType: "TEXT", scheduledAt: "" },
  });

  const content = form.watch("content");
  const mediaUrl = form.watch("mediaUrl");
  const scheduledAtValue = form.watch("scheduledAt");
  const charCount = content.length;
  const canUseToolbar = Boolean(user?.threadsAccessToken);
  const canShowCarouselMode = mode === "full";
  const isMediaModeBlockingSchedule = mediaMode === "gif" || mediaMode === "poll" || mediaMode === "carousel";
  const canShowSchedule = mode === "full" && showSchedule;
  const isEditingScheduled = Boolean(editingScheduledPost);
  const rhythm = getRhythmState(charCount);
  const progressWidth = Math.min((charCount / MAX_CHARS) * 100, 100);
  const showSplitSuggestion = charCount > 450 && !isSplitSuggestionDismissed;
  const canSubmitCurrentMode = mediaMode === "gif"
    ? Boolean(content.trim() || gifCaption.trim())
    : charCount > 0;
  const appTagSuggestions = useMemo(() => {
    const keyword = appTagInput.trim().toLowerCase();
    if (!keyword) return [];

    const added = new Set(appTags.map((tag) => tag.toLowerCase()));
    const startsWith: string[] = [];
    const includesMatch: string[] = [];

    for (const rawTag of existingTags) {
      const tag = rawTag.trim();
      if (!tag) continue;
      const lowerTag = tag.toLowerCase();
      if (added.has(lowerTag)) continue;

      if (lowerTag.startsWith(keyword)) {
        startsWith.push(tag);
      } else if (lowerTag.includes(keyword)) {
        includesMatch.push(tag);
      }
    }

    return Array.from(new Set([...startsWith, ...includesMatch])).slice(0, 5);
  }, [appTagInput, appTags, existingTags]);
  const showAppTagSuggestions =
    isAppTagDropdownOpen && appTagInput.trim().length > 0 && appTagSuggestions.length > 0;

  const resetMediaState = () => {
    setMediaMode("none");
    setPollOptions(["", ""]);
    setPollDuration(24);
    setGifSearch("");
    setGifResults([]);
    setSelectedGif(null);
    setGifSearching(false);
    setGifCaption("");
    setCarouselItems([]);
    form.setValue("mediaUrl", "", { shouldDirty: false, shouldTouch: false });
    form.setValue("mediaType", "TEXT", { shouldDirty: false, shouldTouch: false });
  };

  const toggleMediaMode = (nextMode: MediaMode) => {
    const resolvedMode = mediaMode === nextMode ? "none" : nextMode;
    setMediaMode(resolvedMode);
    if (resolvedMode !== "gif") {
      setGifSearch("");
      setGifResults([]);
      setSelectedGif(null);
      setGifSearching(false);
      setGifCaption("");
    }
    if (resolvedMode !== "poll") {
      setPollOptions(["", ""]);
      setPollDuration(24);
    }
    if (resolvedMode !== "carousel") {
      setCarouselItems([]);
    }
    if (resolvedMode !== "image") {
      form.setValue("mediaUrl", "", { shouldDirty: false, shouldTouch: false });
      form.setValue("mediaType", "TEXT", { shouldDirty: false, shouldTouch: false });
    }
  };

  const resetComposer = () => {
    form.reset();
    setShowScheduleFields(false);
    setTopicInput(user?.defaultTopic || "");
    setAppTags([]);
    setAppTagInput("");
    setHighlightedIndex(-1);
    setIsAppTagDropdownOpen(false);
    resetMediaState();
  };

  useEffect(() => {
    setTopicInput(user?.defaultTopic || "");
  }, [user?.defaultTopic]);

  useEffect(() => {
    if (charCount <= 450) {
      setIsSplitSuggestionDismissed(false);
    }
  }, [charCount]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [appTagInput]);

  useEffect(() => {
    if (!canUseToolbar && mediaMode !== "none") {
      resetMediaState();
    }
  }, [canUseToolbar, mediaMode]);

  useEffect(() => {
    if (mediaMode !== "gif") {
      setGifSearching(false);
      setGifResults([]);
      return;
    }

    const query = gifSearch.trim();
    if (!query) {
      setGifResults([]);
      setGifSearching(false);
      return;
    }

    let isCancelled = false;
    const timeout = window.setTimeout(async () => {
      setGifSearching(true);
      try {
        const response = await fetch(
          `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(GIPHY_API_KEY)}&q=${encodeURIComponent(query)}&limit=9&rating=g`,
        );
        const data = await response.json().catch(() => ({}));
        if (isCancelled) return;
        const items: GifResult[] = Array.isArray(data?.data)
          ? data.data
              .map((item: any) => ({
                id: String(item?.id || ""),
                url: String(item?.images?.original?.url || ""),
                preview: String(item?.images?.fixed_width_downsampled?.url || item?.images?.fixed_width?.url || ""),
              }))
              .filter((item: GifResult) => item.id && item.url && item.preview)
          : [];
        setGifResults(items);
      } catch {
        if (!isCancelled) setGifResults([]);
      } finally {
        if (!isCancelled) setGifSearching(false);
      }
    }, 500);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeout);
    };
  }, [gifSearch, mediaMode]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!appTagContainerRef.current) return;
      if (appTagContainerRef.current.contains(event.target as Node)) return;
      setIsAppTagDropdownOpen(false);
      setHighlightedIndex(-1);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    if (!injectedDraft?.text) return;
    form.setValue("content", injectedDraft.text, { shouldDirty: true, shouldTouch: true });
    setShowTopicSuggestions(false);
    onDraftConsumed?.();
  }, [form, injectedDraft?.id, injectedDraft?.text, onDraftConsumed]);

  useEffect(() => {
    if (!editingScheduledPost) return;
    const parsedSchedule = new Date(editingScheduledPost.scheduledAt);
    form.reset({
      content: editingScheduledPost.content || "",
      mediaUrl: editingScheduledPost.mediaUrl || "",
      mediaType:
        editingScheduledPost.mediaType === "IMAGE" || editingScheduledPost.mediaType === "VIDEO"
          ? editingScheduledPost.mediaType
          : "TEXT",
      scheduledAt: Number.isNaN(parsedSchedule.getTime())
        ? ""
        : toDateTimeLocalString(parsedSchedule),
    });
    setTopicInput(editingScheduledPost.topicTag || user?.defaultTopic || "");
    setAppTags(
      (editingScheduledPost.appTag || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    );
    setAppTagInput("");
    setMediaMode(editingScheduledPost.mediaUrl ? "image" : "none");
    setPollOptions(["", ""]);
    setPollDuration(24);
    setGifSearch("");
    setGifResults([]);
    setSelectedGif(null);
    setGifSearching(false);
    setGifCaption("");
    setCarouselItems([]);
    setShowScheduleFields(true);
  }, [editingScheduledPost?.id, form, user?.defaultTopic]);

  const publishMutation = useMutation({
    mutationFn: ({ endpoint, payload }: { endpoint: string; payload: any }) =>
      apiRequest("POST", endpoint, payload),
    onSuccess: () => {
      toast({
        title: "Post published!",
        description: topicInput ? `Tagged as ${topicInput}` : "Your thread is now live on Threads.",
      });
      addNotification({
        type: "success",
        title: "Post published",
        message: "Your post is now live on Threads",
      });
      resetComposer();
      queryClient.invalidateQueries({ queryKey: ["/api/posts/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/scheduled"] });
    },
    onError: (err: any) => {
      const msg = err.message?.includes("NO_TOKEN")
        ? "Connect your Threads account first."
        : err.message || "Failed to publish post";
      toast({ title: "Failed to publish", description: msg, variant: "destructive" });
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/posts/schedule", data),
    onSuccess: () => {
      toast({ title: "Post scheduled!", description: "Your thread will be published at the set time." });
      addNotification({
        type: "info",
        title: "Post scheduled",
        message: "Your post has been queued for publishing",
      });
      resetComposer();
      queryClient.invalidateQueries({ queryKey: ["/api/posts/scheduled"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to schedule", description: err.message, variant: "destructive" });
    },
  });

  const updateScheduledMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest("PATCH", `/api/posts/scheduled/${id}`, data),
    onSuccess: () => {
      toast({ title: "Scheduled post updated", description: "Your queued post has been updated." });
      resetComposer();
      onEditFinished?.();
      queryClient.invalidateQueries({ queryKey: ["/api/posts/scheduled"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  const onPostNow = (data: ComposeForm) => {
    const topicTag = topicInput.trim() || undefined;
    const appTag = appTags.join(",") || undefined;

    if (mediaMode === "gif") {
      if (!selectedGif) {
        toast({ title: "Please select a GIF first", variant: "destructive" });
        return;
      }
      publishMutation.mutate({
        endpoint: "/api/posts/publish-gif",
        payload: {
          gifUrl: selectedGif,
          content: data.content.trim() || gifCaption.trim() || undefined,
          topicTag,
          appTag,
        },
      });
      return;
    }

    if (mediaMode === "poll") {
      const options = pollOptions.map((option) => option.trim()).filter(Boolean);
      if (options.length < 2) {
        toast({ title: "Add at least 2 poll options", variant: "destructive" });
        return;
      }
      publishMutation.mutate({
        endpoint: "/api/posts/publish-poll",
        payload: {
          content: data.content,
          options,
          durationHours: pollDuration,
          topicTag,
          appTag,
        },
      });
      return;
    }

    if (mediaMode === "carousel") {
      const mediaItems = carouselItems
        .map((item) => ({ url: item.url.trim(), type: item.type }))
        .filter((item) => item.url);
      if (mediaItems.length < 1) {
        toast({ title: "Add at least one image URL", variant: "destructive" });
        return;
      }
      publishMutation.mutate({
        endpoint: "/api/posts/publish-carousel",
        payload: {
          content: data.content.trim() || undefined,
          mediaItems,
          topicTag,
          appTag,
        },
      });
      return;
    }

    publishMutation.mutate({
      endpoint: "/api/posts/publish",
      payload: {
        content: data.content,
        mediaUrl: mediaMode === "image" ? data.mediaUrl || undefined : undefined,
        mediaType: mediaMode === "image" ? data.mediaType : "TEXT",
        topicTag,
        appTag,
      },
    });
  };

  const onSchedule = (data: ComposeForm) => {
    if (isMediaModeBlockingSchedule) {
      toast({
        title: "Scheduling is only available for text and image posts",
        description: "Post this now instead.",
      });
      onPostNow(data);
      return;
    }
    if (!data.scheduledAt) {
      toast({
        title: "Pick a date",
        description: "Please select when to publish this post.",
        variant: "destructive",
      });
      return;
    }
    scheduleMutation.mutate({
      content: data.content,
      mediaUrl: mediaMode === "image" ? data.mediaUrl || null : null,
      mediaType: mediaMode === "image" ? data.mediaType : "TEXT",
      topicTag: topicInput.trim() || undefined,
      appTag: appTags.join(",") || undefined,
      scheduledAt: new Date(data.scheduledAt).toISOString(),
    });
  };

  const onUpdateScheduledPost = (data: ComposeForm) => {
    if (!editingScheduledPost?.id) return;
    if (!data.scheduledAt) {
      toast({
        title: "Pick a date",
        description: "Please select when to publish this post.",
        variant: "destructive",
      });
      return;
    }
    updateScheduledMutation.mutate({
      id: editingScheduledPost.id,
      data: {
        status: "pending",
        content: data.content,
        mediaUrl: data.mediaUrl || null,
        mediaType: data.mediaType,
        topicTag: topicInput.trim() || null,
        appTag: appTags.join(",") || null,
        scheduledAt: new Date(data.scheduledAt).toISOString(),
      },
    });
  };

  const handlePostNowClick = () => {
    if (mediaMode === "gif" && !form.getValues("content").trim() && gifCaption.trim()) {
      form.setValue("content", gifCaption.trim(), { shouldDirty: true, shouldTouch: true });
    }
    form.handleSubmit(onPostNow)();
  };

  const splitIntoThreadChain = () => {
    const chunks = splitIntoThreadChunks(form.getValues("content"), MAX_CHARS);
    if (chunks.length === 0) {
      toast({
        title: "Nothing to split",
        description: "Write some content first before creating a Thread Chain.",
        variant: "destructive",
      });
      return;
    }

    sessionStorage.setItem(THREADCHAIN_PREFILL_KEY, JSON.stringify(chunks));
    setLocation("/multi");
  };

  const addAppTag = (rawTagValue: string) => {
    const rawTag = rawTagValue.trim();
    if (!rawTag || appTags.length >= 5) return;

    const nextTag = rawTag.charAt(0).toUpperCase() + rawTag.slice(1);
    if (appTags.some((tag) => tag.toLowerCase() === nextTag.toLowerCase())) {
      return;
    }

    setAppTags((prev) => [...prev, nextTag]);
    setAppTagInput("");
    setIsAppTagDropdownOpen(false);
    setHighlightedIndex(-1);
  };

  const renderSuggestionLabel = (tag: string) => {
    const keyword = appTagInput.trim();
    if (!keyword) return <span className="text-foreground">{tag}</span>;

    const lowerTag = tag.toLowerCase();
    const lowerKeyword = keyword.toLowerCase();
    const matchIndex = lowerTag.indexOf(lowerKeyword);

    if (matchIndex < 0) {
      return <span className="text-foreground">{tag}</span>;
    }

    const before = tag.slice(0, matchIndex);
    const match = tag.slice(matchIndex, matchIndex + keyword.length);
    const after = tag.slice(matchIndex + keyword.length);

    return (
      <span>
        <span className="text-foreground">{before}</span>
        <span className="text-primary font-medium">{match}</span>
        <span className="text-foreground">{after}</span>
      </span>
    );
  };

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary" />
          {title}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
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
                        data-testid={testIds?.textarea}
                        onKeyDown={(e) => {
                          const textarea = e.currentTarget;
                          const value = textarea.value;
                          const selectionStart = textarea.selectionStart ?? 0;
                          const selectionEnd = textarea.selectionEnd ?? 0;
                          const isRangeSelection = selectionStart !== selectionEnd;
                          const lineStart = value.lastIndexOf("\n", Math.max(selectionStart - 1, 0)) + 1;
                          const lineEndIndex = value.indexOf("\n", selectionStart);
                          const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
                          const lineText = value.slice(lineStart, lineEnd);
                          const lineBeforeCursor = value.slice(lineStart, selectionStart);

                          const applyAutoInsert = (nextValue: string, cursorPosition: number) => {
                            e.preventDefault();
                            field.onChange(nextValue);
                            requestAnimationFrame(() => {
                              textarea.selectionStart = cursorPosition;
                              textarea.selectionEnd = cursorPosition;
                            });
                          };

                          if (!isRangeSelection && e.key === " ") {
                            if ((lineBeforeCursor === "-" || lineBeforeCursor === "*") && lineText === lineBeforeCursor) {
                              const nextValue = `${value.slice(0, lineStart)}â€¢ ${value.slice(selectionStart)}`;
                              applyAutoInsert(nextValue, lineStart + 2);
                              return;
                            }

                            if (lineBeforeCursor === "1." && lineText === lineBeforeCursor) {
                              const nextValue = `${value.slice(0, lineStart)}1. ${value.slice(selectionStart)}`;
                              applyAutoInsert(nextValue, lineStart + 3);
                              return;
                            }
                          }

                          if (isRangeSelection || e.key !== "Enter") return;

                          const emptyBulletLine = /^â€¢\s*$/.test(lineText);
                          if (emptyBulletLine) {
                            const trailing = lineEndIndex === -1 ? "" : value.slice(lineEndIndex + 1);
                            const nextValue = `${value.slice(0, lineStart)}\n${trailing}`;
                            applyAutoInsert(nextValue, lineStart + 1);
                            return;
                          }

                          const bulletWithContent = /^â€¢\s+\S+/.test(lineText);
                          if (bulletWithContent && selectionStart === lineEnd) {
                            const insertion = "\nâ€¢ ";
                            const nextValue = `${value.slice(0, selectionStart)}${insertion}${value.slice(selectionEnd)}`;
                            applyAutoInsert(nextValue, selectionStart + insertion.length);
                            return;
                          }

                          const emptyNumberedMatch = lineText.match(/^(\d+)\.\s*$/);
                          if (emptyNumberedMatch) {
                            const trailing = lineEndIndex === -1 ? "" : value.slice(lineEndIndex + 1);
                            const nextValue = `${value.slice(0, lineStart)}\n${trailing}`;
                            applyAutoInsert(nextValue, lineStart + 1);
                            return;
                          }

                          const numberedWithContent = lineText.match(/^(\d+)\.\s+\S+/);
                          if (numberedWithContent && selectionStart === lineEnd) {
                            const nextNumber = Number.parseInt(numberedWithContent[1], 10) + 1;
                            const insertion = `\n${nextNumber}. `;
                            const nextValue = `${value.slice(0, selectionStart)}${insertion}${value.slice(selectionEnd)}`;
                            applyAutoInsert(nextValue, selectionStart + insertion.length);
                          }
                        }}
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <div className="mt-2 space-y-1.5">
                    {canUseToolbar ? (
                      <div className="flex items-center gap-1 py-1">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className={cn(
                                  "h-7 px-2",
                                  mediaMode === "image" ? "bg-primary/10 text-primary rounded" : "text-muted-foreground",
                                )}
                                onClick={() => toggleMediaMode("image")}
                              >
                                <ImageIcon className="w-3.5 h-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">Add image or video</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className={cn(
                                  "h-7 px-2 text-[11px] font-semibold",
                                  mediaMode === "gif" ? "bg-primary/10 text-primary rounded" : "text-muted-foreground",
                                )}
                                onClick={() => toggleMediaMode("gif")}
                              >
                                GIF
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">Add GIF</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className={cn(
                                  "h-7 px-2",
                                  mediaMode === "poll" ? "bg-primary/10 text-primary rounded" : "text-muted-foreground",
                                )}
                                onClick={() => toggleMediaMode("poll")}
                              >
                                <BarChart2 className="w-3.5 h-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">Create a poll</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        {canShowCarouselMode ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className={cn(
                                    "h-7 px-2",
                                    mediaMode === "carousel" ? "bg-primary/10 text-primary rounded" : "text-muted-foreground",
                                  )}
                                  onClick={() => toggleMediaMode("carousel")}
                                >
                                  <LayoutGrid className="w-3.5 h-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">Add multiple images</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : null}
                      </div>
                    ) : null}

                    {canUseToolbar && mediaMode === "image" ? (
                      <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
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
                                    data-testid={testIds?.mediaUrl}
                                    {...field}
                                  />
                                </FormControl>
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        {mediaUrl ? (
                          <FormField
                            control={form.control}
                            name="mediaType"
                            render={({ field }) => (
                              <FormItem>
                                <div className="flex items-center gap-2">
                                  <Label className="text-sm text-muted-foreground w-20">Media type</Label>
                                  <div className="flex gap-2">
                                    {(["IMAGE", "VIDEO"] as const).map((type) => (
                                      <button
                                        key={type}
                                        type="button"
                                        onClick={() => field.onChange(type)}
                                        className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors ${
                                          field.value === type
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "border-border text-muted-foreground"
                                        }`}
                                      >
                                        {type}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </FormItem>
                            )}
                          />
                        ) : null}
                      </div>
                    ) : null}

                    {canUseToolbar && mediaMode === "gif" ? (
                      <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                        <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2">
                          <Search className="w-3.5 h-3.5 text-muted-foreground" />
                          <Input
                            value={gifSearch}
                            onChange={(event) => setGifSearch(event.target.value)}
                            placeholder="Search GIFs..."
                            className="border-0 px-0 focus-visible:ring-0"
                          />
                        </div>
                        {gifSearching ? (
                          <p className="text-xs text-muted-foreground">Searching GIFs...</p>
                        ) : null}
                        {!selectedGif && gifResults.length > 0 ? (
                          <div className="grid grid-cols-3 gap-2">
                            {gifResults.map((gif) => (
                              <button
                                key={gif.id}
                                type="button"
                                className="overflow-hidden rounded-md border border-border hover:border-primary/50"
                                onClick={() => {
                                  setSelectedGif(gif.url);
                                  setGifResults([]);
                                  setGifSearch("");
                                }}
                              >
                                <img src={gif.preview} alt="GIF result" className="h-20 w-full object-cover" />
                              </button>
                            ))}
                          </div>
                        ) : null}
                        {selectedGif ? (
                          <div className="space-y-2">
                            <img src={selectedGif} alt="Selected GIF" className="max-h-32 rounded-md border border-border object-cover" />
                            <div className="flex items-center gap-2">
                              <Input
                                value={gifCaption}
                                onChange={(event) => setGifCaption(event.target.value)}
                                placeholder="Add a caption..."
                              />
                              <Button type="button" size="sm" variant="outline" onClick={() => setSelectedGif(null)}>
                                Remove
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {canUseToolbar && mediaMode === "poll" ? (
                      <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                        <p className="text-xs font-medium text-muted-foreground">Poll Options</p>
                        {pollOptions.map((option, index) => (
                          <div key={`poll-option-${index}`} className="flex items-center gap-2">
                            <Input
                              placeholder={`Option ${index + 1}`}
                              value={option}
                              maxLength={30}
                              onChange={(event) => {
                                const next = [...pollOptions];
                                next[index] = event.target.value;
                                setPollOptions(next);
                              }}
                            />
                            {index >= 2 ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => setPollOptions((prev) => prev.filter((_, idx) => idx !== index))}
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            ) : null}
                          </div>
                        ))}
                        {pollOptions.length < 4 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-xs px-2 h-7"
                            onClick={() => setPollOptions((prev) => [...prev, ""])}
                          >
                            + Add option
                          </Button>
                        ) : null}
                        <div className="flex items-center gap-2 pt-1">
                          <span className="text-xs text-muted-foreground">Duration:</span>
                          <Select
                            value={String(pollDuration)}
                            onValueChange={(value) => {
                              const parsed = Number(value);
                              if ([24, 48, 72, 168].includes(parsed)) {
                                setPollDuration(parsed as 24 | 48 | 72 | 168);
                              }
                            }}
                          >
                            <SelectTrigger className="w-36 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="24">24 hours</SelectItem>
                              <SelectItem value="48">48 hours</SelectItem>
                              <SelectItem value="72">72 hours</SelectItem>
                              <SelectItem value="168">7 days</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ) : null}

                    {canUseToolbar && canShowCarouselMode && mediaMode === "carousel" ? (
                      <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">Add up to 20 images or videos</p>
                        {carouselItems.map((item, index) => (
                          <div key={`carousel-item-${index}`} className="flex items-center gap-2">
                            <span className="w-4 text-xs text-muted-foreground">{index + 1}</span>
                            <Input
                              placeholder="Image or video URL..."
                              value={item.url}
                              onChange={(event) => {
                                const next = [...carouselItems];
                                next[index] = { ...next[index], url: event.target.value };
                                setCarouselItems(next);
                              }}
                            />
                            <Select
                              value={item.type}
                              onValueChange={(value) => {
                                if (value !== "IMAGE" && value !== "VIDEO") return;
                                const next = [...carouselItems];
                                next[index] = { ...next[index], type: value };
                                setCarouselItems(next);
                              }}
                            >
                              <SelectTrigger className="w-20 h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="IMAGE">IMG</SelectItem>
                                <SelectItem value="VIDEO">VID</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setCarouselItems((prev) => prev.filter((_, idx) => idx !== index))}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ))}
                        {carouselItems.length < 20 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-xs px-2 h-7"
                            onClick={() => setCarouselItems((prev) => [...prev, { url: "", type: "IMAGE" }])}
                          >
                            + Add item
                          </Button>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="flex items-center justify-end gap-2">
                      <span className={cn("text-xs font-mono transition-colors duration-200", rhythm.counterClass)}>
                        {charCount}/{MAX_CHARS}
                      </span>
                      {rhythm.label ? (
                        <span className={cn("text-xs transition-colors duration-200", rhythm.labelClass)}>
                          {rhythm.label}
                        </span>
                      ) : null}
                    </div>
                    <div className="h-0.5 w-full rounded-full bg-muted/20 overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all duration-200", rhythm.barClass)}
                        style={{ width: `${progressWidth}%` }}
                      />
                    </div>
                    <div
                      className={cn(
                        "overflow-hidden transition-all duration-200",
                        showSplitSuggestion ? "max-h-24 opacity-100" : "max-h-0 opacity-0",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
                        <span className="text-muted-foreground">* This is getting long - split into a Thread Chain?</span>
                        <div className="flex items-center gap-2">
                          <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={splitIntoThreadChain}>
                            Split into Chain
                          </Button>
                          <button
                            type="button"
                            aria-label="Dismiss split suggestion"
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => setIsSplitSuggestionDismissed(true)}
                          >
                            x
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Hash className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm text-muted-foreground">Topic Tag</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      Topic Tag is Threads&apos; official category system. Your post will appear under this topic on Threads,
                      making it discoverable to people browsing that category. Example: Astrology Threads, Sports, Technology.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {user?.defaultTopic && topicInput === user.defaultTopic ? (
                  <span className="text-xs text-[#0EA5E9]">default</span>
                ) : null}
              </div>
              <div className="relative">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="e.g. Astrology Threads"
                    value={topicInput}
                    onChange={(e) => {
                      setTopicInput(e.target.value);
                      setShowTopicSuggestions(true);
                    }}
                    onFocus={() => setShowTopicSuggestions(true)}
                    data-testid={testIds?.topicInput}
                  />
                  {topicInput ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setTopicInput("");
                        setShowTopicSuggestions(false);
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  ) : null}
                </div>
                {showTopicSuggestions && filteredTopics.length > 0 ? (
                  <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                    {filteredTopics.slice(0, 6).map((topic) => (
                      <button
                        key={topic}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setTopicInput(topic);
                          setShowTopicSuggestions(false);
                        }}
                      >
                        <span className="text-[#0EA5E9] text-xs">*</span>
                        {topic}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {topicInput ? (
                <p className="text-xs text-muted-foreground">
                  Post will show: <span className="text-[#0EA5E9]">{topicInput}</span>
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <span className="text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">APP TAG</span>
                <span className="text-xs text-muted-foreground font-normal">Personal label - not posted to Threads</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      APP Tag is your personal internal label â€” it is never posted to Threads and nobody else can see it. Use it to
                      organize your content by theme (e.g. Saturn, Hooks, Promotion) so you can track which topics perform best in
                      My Content.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </label>

              {appTags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {appTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-md border border-black/10 bg-white px-2.5 py-1 text-[11px] font-['JetBrains_Mono'] font-extrabold tracking-[0.05em] text-black shadow-[0_1px_4px_rgba(0,0,0,0.25)]"
                    >
                      #{tag.toUpperCase()}
                      <button
                        type="button"
                        onClick={() => setAppTags((prev) => prev.filter((item) => item !== tag))}
                        className="ml-0.5 hover:text-destructive transition-colors"
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}

              {appTags.length < 5 ? (
                <div ref={appTagContainerRef} className="relative">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-muted/20 focus-within:border-primary/50 transition-colors">
                    <input
                      className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
                      placeholder="Add a personal tag"
                      value={appTagInput}
                      onFocus={() => {
                        if (appTagInput.trim()) {
                          setIsAppTagDropdownOpen(true);
                        }
                      }}
                      onChange={(e) => {
                        setAppTagInput(e.target.value);
                        setIsAppTagDropdownOpen(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown" && showAppTagSuggestions) {
                          e.preventDefault();
                          setHighlightedIndex((prev) =>
                            prev >= appTagSuggestions.length - 1 ? 0 : prev + 1,
                          );
                          return;
                        }

                        if (e.key === "ArrowUp" && showAppTagSuggestions) {
                          e.preventDefault();
                          setHighlightedIndex((prev) =>
                            prev <= 0 ? appTagSuggestions.length - 1 : prev - 1,
                          );
                          return;
                        }

                        if (e.key === "Escape" && isAppTagDropdownOpen) {
                          e.preventDefault();
                          setIsAppTagDropdownOpen(false);
                          setHighlightedIndex(-1);
                          return;
                        }

                        if (e.key === "Enter" && showAppTagSuggestions && highlightedIndex >= 0) {
                          e.preventDefault();
                          addAppTag(appTagSuggestions[highlightedIndex]);
                          return;
                        }

                        if ((e.key === "Enter" || e.key === ",") && appTagInput.trim()) {
                          e.preventDefault();
                          addAppTag(appTagInput);
                          return;
                        }

                        if (e.key === "Backspace" && !appTagInput && appTags.length > 0) {
                          setAppTags((prev) => prev.slice(0, -1));
                        }
                      }}
                      maxLength={60}
                      disabled={!user?.threadsAccessToken}
                    />
                    {appTagInput.trim() ? (
                      <button
                        type="button"
                        className="text-xs text-primary hover:text-primary/80 font-medium"
                        onClick={() => addAppTag(appTagInput)}
                      >
                        Add
                      </button>
                    ) : null}
                  </div>
                  {showAppTagSuggestions ? (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 w-full max-h-40 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                      {appTagSuggestions.map((tag, index) => (
                        <button
                          key={tag}
                          type="button"
                          className={cn(
                            "w-full px-3 py-2 text-sm cursor-pointer flex items-center gap-2 hover:bg-accent text-left",
                            index === highlightedIndex ? "bg-accent" : "",
                          )}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            addAppTag(tag);
                          }}
                        >
                          <Hash className="w-3 h-3 text-primary" />
                          {renderSuggestionLabel(tag)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {canShowSchedule && (showScheduleFields || isEditingScheduled) ? (
              <FormField
                control={form.control}
                name="scheduledAt"
                render={({ field }) => {
                  const nowLocal = toDateTimeLocalString(new Date());
                  const todayDate = nowLocal.slice(0, 10);
                  const nowTime = nowLocal.slice(11, 16);
                  const value = typeof field.value === "string" ? field.value : "";
                  const [datePart, rawTimePart] = value.split("T");
                  const timePart = (rawTimePart || "").slice(0, 5);

                  const applyQuick = (date: Date) => field.onChange(toDateTimeLocalString(date));

                  return (
                    <FormItem>
                      <div className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 via-background to-muted/20 p-4 space-y-3 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-primary" />
                            <span className="text-sm font-medium text-foreground">Schedule Date & Time</span>
                          </div>
                          <Badge variant="secondary" className="text-[10px]">Local time</Badge>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <FormControl>
                            <Input
                              type="date"
                              min={todayDate}
                              value={datePart || ""}
                              onChange={(e) => {
                                const nextDate = e.target.value;
                                if (!nextDate) {
                                  field.onChange("");
                                  return;
                                }
                                field.onChange(`${nextDate}T${timePart || "09:00"}`);
                              }}
                              className="bg-background/70"
                              data-testid={testIds?.scheduledDateInput}
                            />
                          </FormControl>
                          <FormControl>
                            <Input
                              type="time"
                              step={300}
                              min={datePart === todayDate ? nowTime : undefined}
                              value={timePart || ""}
                              onChange={(e) => {
                                const nextTime = e.target.value;
                                field.onChange(`${datePart || todayDate}T${nextTime || "09:00"}`);
                              }}
                              className="bg-background/70"
                              data-testid={testIds?.scheduledTimeInput}
                            />
                          </FormControl>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const date = new Date();
                              date.setMinutes(date.getMinutes() + 30, 0, 0);
                              applyQuick(date);
                            }}
                          >
                            In 30 min
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const date = new Date();
                              date.setHours(21, 0, 0, 0);
                              if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1);
                              applyQuick(date);
                            }}
                          >
                            Tonight 9:00 PM
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const date = new Date();
                              date.setDate(date.getDate() + 1);
                              date.setHours(9, 0, 0, 0);
                              applyQuick(date);
                            }}
                          >
                            Tomorrow 9:00 AM
                          </Button>
                        </div>

                        {value ? (
                          <p className="text-xs text-muted-foreground">
                            Scheduled for <span className="text-primary font-medium">{format(new Date(value), "EEE, MMM d - h:mm a")}</span>
                          </p>
                        ) : null}
                      </div>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            ) : null}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              {isEditingScheduled ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={form.handleSubmit(onUpdateScheduledPost)}
                    disabled={updateScheduledMutation.isPending || charCount === 0 || !scheduledAtValue}
                    data-testid={testIds?.confirmScheduleButton}
                  >
                    <Calendar className="w-4 h-4 mr-2" />
                    {updateScheduledMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      resetComposer();
                      onEditFinished?.();
                    }}
                  >
                    Cancel Edit
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    onClick={handlePostNowClick}
                    disabled={publishMutation.isPending || !canSubmitCurrentMode}
                    data-testid={testIds?.postNowButton}
                  >
                    <Send className="w-4 h-4 mr-2" />
                    {publishMutation.isPending ? "Posting..." : "Post Now"}
                  </Button>

                  {canShowSchedule ? (
                    showScheduleFields ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={form.handleSubmit(onSchedule)}
                        disabled={scheduleMutation.isPending || charCount === 0 || !scheduledAtValue}
                        data-testid={testIds?.confirmScheduleButton}
                      >
                        <Calendar className="w-4 h-4 mr-2" />
                        {scheduleMutation.isPending ? "Scheduling..." : "Confirm Schedule"}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          if (isMediaModeBlockingSchedule) {
                            toast({
                              title: "Scheduling is only available for text and image posts",
                              description: "Post this now instead.",
                            });
                            handlePostNowClick();
                            return;
                          }
                          const current = form.getValues("scheduledAt");
                          if (!current) {
                            form.setValue("scheduledAt", toDateTimeLocalString(getSmartDefaultScheduleTime(new Date())), {
                              shouldDirty: true,
                              shouldTouch: true,
                            });
                          }
                          setShowScheduleFields(true);
                        }}
                        disabled={charCount === 0}
                        data-testid={testIds?.scheduleButton}
                      >
                        <Calendar className="w-4 h-4 mr-2" />
                        Schedule
                      </Button>
                    )
                  ) : null}

                  {canShowSchedule && showScheduleFields ? (
                    <Button type="button" variant="ghost" onClick={() => setShowScheduleFields(false)}>Cancel</Button>
                  ) : null}
                </>
              )}
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}


