import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { LucideIcon } from "lucide-react";
import { Calendar, Hash, Link2, Send, Sparkles, X } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";

const MAX_CHARS = 500;

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
  injectedDraft?: DraftPayload | null;
  onDraftConsumed?: () => void;
  showSchedule?: boolean;
  testIds?: TestIds;
};

export function PostComposerCard({
  title,
  mode = "full",
  description,
  icon: Icon,
  injectedDraft = null,
  onDraftConsumed,
  showSchedule = true,
  testIds,
}: PostComposerCardProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showScheduleFields, setShowScheduleFields] = useState(false);
  const [topicInput, setTopicInput] = useState(user?.defaultTopic || "");
  const [showTopicSuggestions, setShowTopicSuggestions] = useState(false);
  const [appTags, setAppTags] = useState<string[]>([]);
  const [appTagInput, setAppTagInput] = useState("");

  const filteredTopics = POPULAR_TOPICS.filter((topic) =>
    topic.toLowerCase().includes(topicInput.toLowerCase()) && topic !== topicInput,
  );

  const form = useForm<ComposeForm>({
    resolver: zodResolver(composeSchema),
    defaultValues: { content: "", mediaUrl: "", mediaType: "TEXT", scheduledAt: "" },
  });

  const content = form.watch("content");
  const mediaUrl = form.watch("mediaUrl");
  const scheduledAtValue = form.watch("scheduledAt");
  const charCount = content.length;
  const canShowMedia = mode === "full";
  const canShowSchedule = mode === "full" && showSchedule;

  useEffect(() => {
    setTopicInput(user?.defaultTopic || "");
  }, [user?.defaultTopic]);

  useEffect(() => {
    if (!injectedDraft?.text) return;
    form.setValue("content", injectedDraft.text, { shouldDirty: true, shouldTouch: true });
    setShowTopicSuggestions(false);
    onDraftConsumed?.();
  }, [form, injectedDraft?.id, injectedDraft?.text, onDraftConsumed]);

  const publishMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/posts/publish", data),
    onSuccess: () => {
      toast({
        title: "Post published!",
        description: topicInput ? `Tagged as ${topicInput}` : "Your thread is now live on Threads.",
      });
      form.reset();
      setTopicInput(user?.defaultTopic || "");
      setAppTags([]);
      setAppTagInput("");
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
      form.reset();
      setShowScheduleFields(false);
      setTopicInput(user?.defaultTopic || "");
      setAppTags([]);
      setAppTagInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/posts/scheduled"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to schedule", description: err.message, variant: "destructive" });
    },
  });

  const onPostNow = (data: ComposeForm) => {
    publishMutation.mutate({
      content: data.content,
      mediaUrl: data.mediaUrl || undefined,
      mediaType: data.mediaType,
      topicTag: topicInput.trim() || undefined,
      appTag: appTags.join(",") || undefined,
    });
  };

  const onSchedule = (data: ComposeForm) => {
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
      mediaUrl: data.mediaUrl || null,
      mediaType: data.mediaType,
      topicTag: topicInput.trim() || undefined,
      appTag: appTags.join(",") || undefined,
      scheduledAt: new Date(data.scheduledAt).toISOString(),
    });
  };

  return (
    <Card>
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
                        {...field}
                      />
                      <span
                        className={`absolute bottom-3 right-3 text-xs font-mono ${
                          charCount > MAX_CHARS * 0.9
                            ? charCount >= MAX_CHARS
                              ? "text-destructive font-bold"
                              : "text-amber-500"
                            : "text-muted-foreground"
                        }`}
                      >
                        {charCount}/{MAX_CHARS}
                      </span>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Hash className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm text-muted-foreground">Topic Tag</Label>
                {user?.defaultTopic && topicInput === user.defaultTopic ? (
                  <span className="text-xs text-primary">default</span>
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
                        <span className="text-primary text-xs">*</span>
                        {topic}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {topicInput ? (
                <p className="text-xs text-muted-foreground">
                  Post will show: <span className="text-primary">{topicInput}</span>
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <span className="text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">APP TAG</span>
                <span className="text-xs text-muted-foreground font-normal">Personal label - not posted to Threads</span>
              </label>

              {appTags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {appTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/15 text-primary border border-primary/30"
                    >
                      {tag}
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
                <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-muted/20 focus-within:border-primary/50 transition-colors">
                  <input
                    className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
                    placeholder="Add a personal tag"
                    value={appTagInput}
                    onChange={(e) => setAppTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === ",") && appTagInput.trim()) {
                        e.preventDefault();
                        const rawTag = appTagInput.trim();
                        const nextTag = rawTag.charAt(0).toUpperCase() + rawTag.slice(1);
                        if (!appTags.includes(nextTag) && appTags.length < 5) {
                          setAppTags((prev) => [...prev, nextTag]);
                        }
                        setAppTagInput("");
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
                      onClick={() => {
                        const rawTag = appTagInput.trim();
                        const nextTag = rawTag.charAt(0).toUpperCase() + rawTag.slice(1);
                        if (!appTags.includes(nextTag) && appTags.length < 5) {
                          setAppTags((prev) => [...prev, nextTag]);
                        }
                        setAppTagInput("");
                      }}
                    >
                      Add
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {canShowMedia ? (
              <div className="space-y-3">
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

            {canShowSchedule && showScheduleFields ? (
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
              <Button
                type="button"
                onClick={form.handleSubmit(onPostNow)}
                disabled={publishMutation.isPending || charCount === 0}
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
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
