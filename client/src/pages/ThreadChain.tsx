import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import {
  Plus, Trash2, Play, GripVertical, CheckCircle2, XCircle,
  Loader2, Link2, Hash, ChevronDown, ChevronUp, Info,
} from "lucide-react";

const MAX_CHARS = 500;

interface ChainPost {
  id: string;
  content: string;
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
    { id: "1", content: "" },
    { id: "2", content: "" },
    { id: "3", content: "" },
  ]);
  const [topicInput, setTopicInput] = useState(user?.defaultTopic || "");
  const [showTopicSuggestions, setShowTopicSuggestions] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [publishedCount, setPublishedCount] = useState(0);
  const [isPublishing, setIsPublishing] = useState(false);

  const filteredTopics = POPULAR_TOPICS.filter(t =>
    t.toLowerCase().includes(topicInput.toLowerCase()) && t !== topicInput
  );

  const addPost = () => {
    if (posts.length >= 20) {
      toast({ title: "Max 20 posts per chain", variant: "destructive" });
      return;
    }
    setPosts(prev => [...prev, { id: Date.now().toString(), content: "" }]);
  };

  const removePost = (id: string) => {
    if (posts.length <= 1) return;
    setPosts(prev => prev.filter(p => p.id !== id));
  };

  const updatePost = (id: string, content: string) => {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, content } : p));
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
        posts: validPosts.map(p => p.content.trim()),
        topicTag: topicInput.trim() || undefined,
      });

      setPublishedCount(result.count);
      toast({
        title: `✅ Chain published! ${result.count} posts live`,
        description: topicInput ? `Tagged as ✦ ${topicInput}` : "Check your Threads profile!",
      });

      // Reset
      setPosts([{ id: "1", content: "" }, { id: "2", content: "" }, { id: "3", content: "" }]);
      setTopicInput(user?.defaultTopic || "");
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
          <p>The <span className="text-primary">topic tag</span> is only applied to the first post (Threads API limitation for replies).</p>
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
              <CardDescription>Applied to the first post only</CardDescription>
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
              {topicInput && (
                <p className="text-xs text-muted-foreground">
                  Post 1 will show: <span className="text-primary font-medium">✦ {topicInput}</span>
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
                <p>✦ Topic tag applies to Post 1 only (API limitation)</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
