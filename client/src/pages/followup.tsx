import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Timer, Trash2, CheckCircle2, XCircle, Clock, Bell, Link2,
} from "lucide-react";
import { format, addMinutes, addHours } from "date-fns";
import type { FollowUpThread } from "@shared/schema";

const MAX_CHARS = 500;

const followUpSchema = z.object({
  originalPostId: z.string().min(1, "Post ID is required"),
  originalPostContent: z.string().optional(),
  content: z.string().min(1, "Content is required").max(MAX_CHARS),
  timerPreset: z.string().default("30min"),
  customMinutes: z.string().optional(),
});

type FollowUpForm = z.infer<typeof followUpSchema>;

const TIMER_PRESETS = [
  { value: "30min", label: "30 minutes", minutes: 30 },
  { value: "1hr", label: "1 hour", minutes: 60 },
  { value: "2hr", label: "2 hours", minutes: 120 },
  { value: "4hr", label: "4 hours", minutes: 240 },
  { value: "custom", label: "Custom", minutes: 0 },
];

function StatusIcon({ status }: { status: string }) {
  if (status === "published") return <CheckCircle2 className="w-3.5 h-3.5 text-status-online" />;
  if (status === "failed") return <XCircle className="w-3.5 h-3.5 text-destructive" />;
  return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
}

export default function FollowUp() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [notifDismissed, setNotifDismissed] = useState(false);

  const { data: followUps = [], isLoading } = useQuery<FollowUpThread[]>({
    queryKey: ["/api/follow-ups"],
  });

  const form = useForm<FollowUpForm>({
    resolver: zodResolver(followUpSchema),
    defaultValues: {
      originalPostId: "",
      originalPostContent: "",
      content: "",
      timerPreset: "30min",
      customMinutes: "60",
    },
  });

  const content = form.watch("content");
  const timerPreset = form.watch("timerPreset");
  const customMinutes = form.watch("customMinutes");

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/follow-ups", data),
    onSuccess: () => {
      toast({
        title: "Follow-up scheduled!",
        description: "Your reply will be posted at the scheduled time.",
      });
      form.reset({ originalPostId: "", originalPostContent: "", content: "", timerPreset: "30min", customMinutes: "60" });
      queryClient.invalidateQueries({ queryKey: ["/api/follow-ups"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to schedule", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/follow-ups/${id}`),
    onSuccess: () => {
      toast({ title: "Follow-up cancelled" });
      queryClient.invalidateQueries({ queryKey: ["/api/follow-ups"] });
    },
  });

  const getScheduledAt = (preset: string, custom: string) => {
    const now = new Date();
    const p = TIMER_PRESETS.find(t => t.value === preset);
    if (preset === "custom") {
      const mins = parseInt(custom || "60");
      return addMinutes(now, isNaN(mins) ? 60 : mins);
    }
    return addMinutes(now, p?.minutes || 30);
  };

  const onSubmit = (data: FollowUpForm) => {
    const scheduledAt = getScheduledAt(data.timerPreset, data.customMinutes || "60");
    createMutation.mutate({
      originalPostId: data.originalPostId,
      originalPostContent: data.originalPostContent || null,
      content: data.content,
      scheduledAt: scheduledAt.toISOString(),
    });
  };

  const publishedFollowUps = followUps.filter(f => f.status === "published");

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Follow-Up Thread</h1>
        <p className="text-muted-foreground mt-1">Schedule a timed reply to one of your posts</p>
      </div>

      {!notifDismissed && publishedFollowUps.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-md bg-primary/10 border border-primary/20">
          <Bell className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Follow-up posted!</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your follow-up was posted. Don't forget to pin it manually in the Threads app — the API doesn't support pinning yet.
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setNotifDismissed(true)} data-testid="button-dismiss-notif">
            Dismiss
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Timer className="w-4 h-4 text-primary" />
                Schedule Follow-Up Reply
              </CardTitle>
              <CardDescription>Set a timed reply to any of your published posts</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                  <FormField
                    control={form.control}
                    name="originalPostId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Original Post ID</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-2">
                            <Link2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            <Input
                              placeholder="Paste your Threads post ID (e.g. 18234567890123456)"
                              data-testid="input-original-post-id"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="originalPostContent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Original Post Preview <span className="text-muted-foreground">(optional)</span></FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Brief description of the original post for your reference"
                            data-testid="input-original-preview"
                            {...field}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="content"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Follow-Up Reply</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Textarea
                              placeholder="Write your follow-up reply..."
                              className="resize-none min-h-[120px]"
                              data-testid="textarea-followup-content"
                              {...field}
                            />
                            <span className={`absolute bottom-2 right-3 text-xs font-mono ${content.length > MAX_CHARS * 0.9 ? "text-destructive" : "text-muted-foreground"}`}>
                              {content.length}/{MAX_CHARS}
                            </span>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="timerPreset"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Send After</FormLabel>
                        <div className="flex flex-wrap gap-2">
                          {TIMER_PRESETS.map(preset => (
                            <button
                              key={preset.value}
                              type="button"
                              onClick={() => field.onChange(preset.value)}
                              className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                                field.value === preset.value
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "border-border text-foreground"
                              }`}
                              data-testid={`button-timer-${preset.value}`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </FormItem>
                    )}
                  />

                  {timerPreset === "custom" && (
                    <FormField
                      control={form.control}
                      name="customMinutes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Custom Delay (minutes)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="1"
                              placeholder="60"
                              className="w-32"
                              data-testid="input-custom-minutes"
                              {...field}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  )}

                  {content && (
                    <div className="p-3 rounded-md bg-muted/50 border border-border">
                      <p className="text-xs text-muted-foreground">
                        Will post at:{" "}
                        <span className="font-medium text-foreground">
                          {format(getScheduledAt(timerPreset, customMinutes || "60"), "EEEE, MMM d · h:mm a")}
                        </span>
                      </p>
                    </div>
                  )}

                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-schedule-followup">
                    <Timer className="w-4 h-4 mr-2" />
                    {createMutation.isPending ? "Scheduling..." : "Schedule Follow-Up"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-2 space-y-4">
          <h2 className="text-base font-semibold text-foreground">Scheduled Follow-Ups</h2>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : followUps.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                <Timer className="w-8 h-8 text-muted-foreground mb-3" />
                <p className="text-sm font-medium text-foreground">No follow-ups yet</p>
                <p className="text-xs text-muted-foreground mt-1">Schedule a timed reply to keep your audience engaged</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {followUps.map((followUp) => (
                <Card key={followUp.id} data-testid={`card-followup-${followUp.id}`}>
                  <CardContent className="py-4 space-y-3">
                    {followUp.originalPostContent && (
                      <div className="p-2 rounded-md bg-muted/50 border-l-2 border-primary">
                        <p className="text-xs text-muted-foreground">Reply to:</p>
                        <p className="text-xs text-foreground mt-0.5">{followUp.originalPostContent}</p>
                      </div>
                    )}
                    <p className="text-sm text-foreground">{followUp.content}</p>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <StatusIcon status={followUp.status} />
                        <span>
                          {followUp.status === "pending"
                            ? format(new Date(followUp.scheduledAt), "MMM d, h:mm a")
                            : followUp.status === "published"
                            ? "Published"
                            : `Failed: ${followUp.errorMessage}`}
                        </span>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(followUp.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-followup-${followUp.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
