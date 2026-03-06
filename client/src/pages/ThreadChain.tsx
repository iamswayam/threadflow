import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import {
  Plus, Trash2, Play, GripVertical, Loader2, Link2, Hash, Info,
} from "lucide-react";

const MAX_CHARS = 500;
const THREADCHAIN_PREFILL_KEY = "threadchain_prefill";

interface ChainPost {
  id: string;
  content: string;
  useTopicTag: boolean;
}

const POPULAR_TOPICS = [
  "Astrology Threads", "Motivation Threads", "Business Threads",
  "Health Threads", "Fitness Threads", "Tech Threads", "AI Threads",
  "Spirituality Threads", "Mindset Threads", "Writing Threads",
  "Finance Threads", "Education Threads", "Daily Life Threads",
];

export default function ThreadChain() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [posts, setPosts] = useState<ChainPost[]>([
    { id: "1", content: "", useTopicTag: true },
    { id: "2", content: "", useTopicTag: true },
    { id: "3", content: "", useTopicTag: true },
  ]);
  const [topicInput, setTopicInput] = useState(user?.defaultTopic || "");
  const [rootAppTags, setRootAppTags] = useState<string[]>([]);
  const [rootAppTagInput, setRootAppTagInput] = useState("");
  const [applyTopicToAll, setApplyTopicToAll] = useState(true);
  const [showTopicSuggestions, setShowTopicSuggestions] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [publishedCount, setPublishedCount] = useState(0);
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    const serialized = sessionStorage.getItem(THREADCHAIN_PREFILL_KEY);
    if (!serialized) return;

    try {
      const parsed = JSON.parse(serialized);
      if (!Array.isArray(parsed)) return;

      const prefilled = parsed
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .slice(0, 20);

      if (prefilled.length === 0) return;

      setPosts(
        prefilled.map((content, index) => ({
          id: `prefill-${Date.now()}-${index + 1}`,
          content,
          useTopicTag: true,
        })),
      );

      toast({
        title: "Thread Chain prefilled",
        description: `${prefilled.length} post${prefilled.length === 1 ? "" : "s"} imported from composer.`,
      });
    } catch {
      // Ignore invalid prefill payload.
    } finally {
      sessionStorage.removeItem(THREADCHAIN_PREFILL_KEY);
    }
  }, [toast]);

  const filteredTopics = POPULAR_TOPICS.filter(t =>
    t.toLowerCase().includes(topicInput.toLowerCase()) && t !== topicInput
  );

  const addPost = () => {
    if (posts.length >= 20) {
      toast({ title: "Max 20 posts per chain", variant: "destructive" });
      return;
    }
    setPosts(prev => [...prev, { id: Date.now().toString(), content: "", useTopicTag: applyTopicToAll }]);
  };

  const removePost = (id: string) => {
    if (posts.length <= 1) return;
    setPosts(prev => prev.filter(p => p.id !== id));
  };

  const updatePost = (id: string, content: string) => {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, content } : p));
  };

  const updatePostTopicUsage = (id: string, useTopicTag: boolean) => {
    setPosts(prev => prev.map(p => (p.id === id ? { ...p, useTopicTag } : p)));
  };

  const setAllPostsTopicUsage = (enabled: boolean) => {
    setApplyTopicToAll(enabled);
    setPosts(prev => prev.map(p => ({ ...p, useTopicTag: enabled })));
  };

  const addRootAppTag = (rawTagValue: string) => {
    const rawTag = rawTagValue.trim();
    if (!rawTag || rootAppTags.length >= 5) return;

    const nextTag = rawTag.charAt(0).toUpperCase() + rawTag.slice(1);
    if (rootAppTags.some((tag) => tag.toLowerCase() === nextTag.toLowerCase())) {
      setRootAppTagInput("");
      return;
    }

    setRootAppTags((prev) => [...prev, nextTag]);
    setRootAppTagInput("");
  };

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragIndex(idx);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === idx) return;
    const newPosts = [...posts];
    const [dragged] = newPosts.splice(dragIndex, 1);
    newPosts.splice(idx, 0, dragged);
    setPosts(newPosts);
    setDragIndex(idx);
  };

  const handlePublish = async () => {
    const validPosts = posts.filter(p => p.content.trim());
    if (validPosts.length === 0) {
      toast({ title: "No content", description: "Add content to at least one post.", variant: "destructive" });
      return;
    }
    if (!user?.threadsAccessToken) {
      toast({ title: "Not connected", description: "Connect your Threads account first.", variant: "destructive" });
      return;
    }

    setIsPublishing(true);
    setPublishedCount(0);

    try {
      const result = await apiRequest("POST", "/api/thread-chain", {
        posts: validPosts.map((p) => ({ content: p.content.trim(), useTopicTag: p.useTopicTag })),
        topicTag: topicInput.trim() || undefined,
        appTag: rootAppTags.join(",") || undefined,
      });

      setPublishedCount(result.count);
      toast({
        title: `Chain published! ${result.count} posts live`,
        description: topicInput
          ? `Topic: ${topicInput} | Applied to ${result.topicTagAppliedCount ?? 0} post(s)`
          : "Check your Threads profile!",
      });

      // Reset
      setPosts([
        { id: "1", content: "", useTopicTag: applyTopicToAll },
        { id: "2", content: "", useTopicTag: applyTopicToAll },
        { id: "3", content: "", useTopicTag: applyTopicToAll },
      ]);
      setTopicInput(user?.defaultTopic || "");
      setRootAppTags([]);
      setRootAppTagInput("");
    } catch (err: any) {
      const msg = err.message?.includes(":") ? err.message.split(":").slice(1).join(":").trim() : err.message;
      toast({ title: "Failed to publish chain", description: msg, variant: "destructive" });
    } finally {
      setIsPublishing(false);
    }
  };

  const validCount = posts.filter(p => p.content.trim()).length;

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Thread Chain</h1>
        <p className="text-muted-foreground mt-1">
          Post a series of threads instantly — each replies to the previous, creating a 1/N → 2/N → 3/N chain
        </p>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 rounded-md bg-primary/5 border border-primary/20">
        <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <div className="text-sm text-muted-foreground space-y-1">
          <p><span className="text-foreground font-medium">How it works:</span> All posts are published instantly. Post 1 is the root, Post 2 replies to Post 1, Post 3 replies to Post 2, and so on — just like you see on Threads.</p>
          <p>Set one topic on the right, apply it to all posts in one click, then remove it from specific posts on the left.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-3 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="w-4 h-4 text-primary" />
                Chain Posts
                <Badge variant="secondary" className="ml-auto">{validCount}/{posts.length} filled</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {posts.map((post, idx) => (
                <div
                  key={post.id}
                  className={`p-4 rounded-md border space-y-2 transition-opacity ${dragIndex === idx ? "opacity-50 border-primary/50" : "border-border"}`}
                  draggable
                  onDragStart={e => handleDragStart(e, idx)}
                  onDragOver={e => handleDragOver(e, idx)}
                  onDragEnd={() => setDragIndex(null)}
                  data-testid={`card-chain-post-${idx}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10">
                        <span className="text-xs font-bold text-primary">{idx + 1}</span>
                      </div>
                      <span className="text-sm font-medium text-foreground">
                        {idx === 0 ? "Root post" : `Reply ${idx + 1}`}
                      </span>
                      {idx > 0 && (
                        <span className="text-xs text-muted-foreground">↩ replies to post {idx}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`checkbox-chain-topic-${post.id}`}
                          checked={post.useTopicTag}
                          disabled={!topicInput.trim()}
                          onCheckedChange={(checked) => updatePostTopicUsage(post.id, checked === true)}
                        />
                        <label
                          htmlFor={`checkbox-chain-topic-${post.id}`}
                          className={`text-xs font-medium ${topicInput.trim() ? "text-foreground" : "text-muted-foreground"}`}
                        >
                          Use topic
                        </label>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removePost(post.id)}
                        disabled={posts.length <= 1}
                        data-testid={`button-remove-chain-post-${idx}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="relative">
                    <Textarea
                      placeholder={idx === 0 ? "Start your thread here..." : `Continue the thread...`}
                      value={post.content}
                      onChange={e => updatePost(post.id, e.target.value)}
                      className="resize-none min-h-[90px]"
                      maxLength={MAX_CHARS}
                      data-testid={`textarea-chain-post-${idx}`}
                    />
                    <span className={`absolute bottom-2 right-3 text-xs font-mono ${post.content.length > MAX_CHARS * 0.9 ? "text-amber-500" : "text-muted-foreground"}`}>
                      {post.content.length}/{MAX_CHARS}
                    </span>
                  </div>
                  {idx === 0 ? (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <span className="text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">APP TAG</span>
                        <span className="text-xs text-muted-foreground font-normal">Root post only (used in My Content)</span>
                      </label>
                      {rootAppTags.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                          {rootAppTags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/15 text-primary border border-primary/30"
                            >
                              {tag}
                              <button
                                type="button"
                                onClick={() => setRootAppTags((prev) => prev.filter((item) => item !== tag))}
                                className="ml-0.5 hover:text-destructive transition-colors"
                              >
                                x
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {rootAppTags.length < 5 ? (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-muted/20 focus-within:border-primary/50 transition-colors">
                          <input
                            className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
                            placeholder="e.g. Saturn"
                            value={rootAppTagInput}
                            onChange={(e) => setRootAppTagInput(e.target.value)}
                            onKeyDown={(e) => {
                              if ((e.key === "Enter" || e.key === ",") && rootAppTagInput.trim()) {
                                e.preventDefault();
                                addRootAppTag(rootAppTagInput);
                                return;
                              }
                              if (e.key === "Backspace" && !rootAppTagInput && rootAppTags.length > 0) {
                                setRootAppTags((prev) => prev.slice(0, -1));
                              }
                            }}
                            maxLength={60}
                            data-testid="input-chain-root-app-tag"
                          />
                          {rootAppTagInput.trim() ? (
                            <button
                              type="button"
                              className="text-xs text-primary hover:text-primary/80 font-medium"
                              onClick={() => addRootAppTag(rootAppTagInput)}
                            >
                              Add
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Maximum 5 tags</p>
                      )}
                    </div>
                  ) : null}
                </div>
              ))}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button
                  variant="outline"
                  onClick={addPost}
                  disabled={posts.length >= 20}
                  data-testid="button-add-chain-post"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Post
                </Button>
                <span className="text-xs text-muted-foreground">{posts.length}/20 posts</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-2 space-y-4">
          {/* Topic Tag */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Hash className="w-4 h-4 text-primary" />
                Topic Tag
              </CardTitle>
              <CardDescription>Apply to all posts, then customize per post</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {user?.defaultTopic && topicInput === user.defaultTopic && (
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-primary/10 text-xs text-primary">
                  <span>✦ Using your default topic</span>
                </div>
              )}
              <div className="relative">
                <Input
                  placeholder="e.g. Astrology Threads"
                  value={topicInput}
                  onChange={e => { setTopicInput(e.target.value); setShowTopicSuggestions(true); }}
                  onFocus={() => setShowTopicSuggestions(true)}
                  data-testid="input-chain-topic"
                />
                {showTopicSuggestions && filteredTopics.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                    {filteredTopics.slice(0, 6).map(topic => (
                      <button
                        key={topic}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2"
                        onClick={() => { setTopicInput(topic); setShowTopicSuggestions(false); }}
                      >
                        <span className="text-primary text-xs">✦</span>
                        {topic}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">Apply topic to all posts</p>
                  <p className="text-xs text-muted-foreground">You can uncheck any post from the Chain Posts list.</p>
                </div>
                <Checkbox
                  checked={applyTopicToAll}
                  disabled={!topicInput.trim()}
                  onCheckedChange={(checked) => setAllPostsTopicUsage(checked === true)}
                />
              </div>
              {topicInput && (
                <p className="text-xs text-muted-foreground">
                  Topic selected: <span className="text-primary font-medium">{topicInput}</span>
                </p>
              )}
            </CardContent>
          </Card>

          {/* Publish */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Play className="w-4 h-4 text-primary" />
                Publish Chain
              </CardTitle>
              <CardDescription>
                All {validCount} post{validCount !== 1 ? "s" : ""} will go live instantly
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isPublishing && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    Publishing chain... please wait
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This may take {validCount * 3}–{validCount * 5} seconds. Don't close the tab.
                  </p>
                </div>
              )}

              <Button
                className="w-full"
                onClick={handlePublish}
                disabled={isPublishing || validCount === 0 || !user?.threadsAccessToken}
                data-testid="button-publish-chain"
              >
                {isPublishing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Publish {validCount} Post{validCount !== 1 ? "s" : ""} Now
                  </>
                )}
              </Button>

              {!user?.threadsAccessToken && (
                <p className="text-xs text-destructive text-center">Connect your Threads account in Settings first</p>
              )}

              <div className="text-xs text-muted-foreground space-y-1 pt-1 border-t border-border">
                <p>⚡ Posts publish in sequence with a small delay between each</p>
                <p>📌 Pin the first post manually in the Threads app after publishing</p>
                <p>✦ Topic can be set globally and removed per post from the chain list</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
