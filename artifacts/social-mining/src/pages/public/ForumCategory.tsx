import { useState, useEffect } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCategoryThreads, createThread } from "@/lib/forumApi";
import type { ForumThread, CategoryThreads } from "@/lib/forumApi";
import { useMinerIdentity } from "@/hooks/useMinerIdentity";
import { useToast } from "@/hooks/use-toast";

function relativeTime(value: string | null): string {
  if (!value) return "—";
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

export default function ForumCategory() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";
  const queryClient = useQueryClient();
  const { identity } = useMinerIdentity();
  const { toast } = useToast();

  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allThreads, setAllThreads] = useState<ForumThread[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [composerError, setComposerError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<CategoryThreads>({
    queryKey: ["forum", "category", slug, cursor],
    queryFn: () => getCategoryThreads(slug, cursor),
    enabled: !!slug,
  });

  useEffect(() => {
    if (!data) return;
    setNextCursor(data.nextCursor);
    if (!cursor) {
      // First page: replace
      setAllThreads(data.threads);
    } else {
      // Subsequent page: append, dedup by id
      setAllThreads((prev) => {
        const existingIds = new Set(prev.map((t) => t.id));
        const fresh = data.threads.filter((t) => !existingIds.has(t.id));
        return fresh.length > 0 ? [...prev, ...fresh] : prev;
      });
    }
  }, [data, cursor]);

  const createMutation = useMutation({
    mutationFn: () => {
      if (!identity) throw new Error("No identity");
      return createThread(
        { miningKeyHash: identity.miningKeyHash, handle: identity.xHandle },
        { categorySlug: slug, title: newTitle.trim(), rawMd: newBody.trim() },
      );
    },
    onSuccess: (result) => {
      toast({ title: "Thread created", description: `Post ID: ${result.postId}` });
      setNewTitle("");
      setNewBody("");
      setShowComposer(false);
      setComposerError(null);
      // Reset to first page and invalidate
      setCursor(undefined);
      setAllThreads([]);
      queryClient.invalidateQueries({ queryKey: ["forum", "category", slug] });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setComposerError(msg);
    },
  });

  function handleLoadMore() {
    if (nextCursor) {
      setCursor(nextCursor);
    }
  }

  const category = data?.category;

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="space-y-2">
        <div className="font-mono text-sm text-muted-foreground uppercase font-bold">
          <Link href="/forum" className="hover:text-primary transition-colors">Forum</Link>
          <span className="mx-2">/</span>
          <span>{category?.name ?? slug}</span>
        </div>
        {category && (
          <>
            <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter">
              {category.name}
            </h1>
            <p className="font-mono text-sm text-muted-foreground max-w-2xl">
              {category.description}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="font-mono text-xs border-2 border-foreground px-2 py-1 bg-muted/30 font-bold">
                Trust level {category.minTrustLevel}+
              </span>
              {category.miningEligible && (
                <span className="bg-primary text-primary-foreground px-2 py-1 text-xs font-mono font-bold uppercase border-2 border-foreground">
                  Mining eligible
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex justify-between items-center gap-4">
        <div className="font-mono text-sm text-muted-foreground">
          {allThreads.length} thread{allThreads.length !== 1 ? "s" : ""}
        </div>
        {identity?.miningKeyHash && (
          <button
            onClick={() => setShowComposer((v) => !v)}
            className="border-4 border-foreground bg-foreground text-background font-mono font-bold uppercase px-4 py-2 hover:bg-primary hover:border-primary transition-colors"
          >
            {showComposer ? "Cancel" : "+ New Thread"}
          </button>
        )}
      </div>

      {showComposer && (
        <div className="border-4 border-foreground bg-card brutal-shadow p-6 space-y-4">
          <h2 className="font-black text-lg uppercase">New Thread</h2>
          {composerError && (
            <div className="border-2 border-destructive bg-destructive/10 p-3 font-mono text-sm text-destructive font-bold">
              {composerError}
            </div>
          )}
          <div className="space-y-2">
            <label className="font-mono text-xs font-bold uppercase text-muted-foreground">
              Title
            </label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Thread title..."
              className="w-full border-4 border-foreground bg-background font-mono text-sm px-4 py-3 focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label className="font-mono text-xs font-bold uppercase text-muted-foreground">
              Body
            </label>
            <textarea
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder="Write your post..."
              rows={6}
              className="w-full border-4 border-foreground bg-background font-mono text-sm px-4 py-3 focus:outline-none focus:border-primary transition-colors resize-y"
            />
          </div>
          <button
            onClick={() => {
              if (!newTitle.trim()) {
                setComposerError("Title is required");
                return;
              }
              if (!newBody.trim()) {
                setComposerError("Body is required");
                return;
              }
              setComposerError(null);
              createMutation.mutate();
            }}
            disabled={createMutation.isPending}
            className="border-4 border-foreground bg-primary text-primary-foreground font-mono font-bold uppercase px-6 py-3 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {createMutation.isPending ? "Posting..." : "Post Thread"}
          </button>
        </div>
      )}

      {isLoading && allThreads.length === 0 && (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 border-4 border-foreground bg-muted animate-pulse brutal-shadow"
            />
          ))}
        </div>
      )}

      {error && (
        <div className="border-4 border-destructive bg-destructive/10 p-6 font-mono font-bold text-destructive">
          Failed to load threads: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      )}

      <div className="grid gap-4">
        {allThreads.map((thread) => (
          <Link key={thread.id} href={`/forum/t/${thread.id}`} className="block">
            <div className="border-4 border-foreground bg-card brutal-shadow p-5 hover:bg-secondary/10 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-black text-lg break-words">{thread.title}</h2>
                  {thread.status === "pinned" && (
                    <span className="bg-secondary text-secondary-foreground px-2 py-0.5 text-[10px] font-mono font-bold uppercase border-2 border-foreground">
                      Pinned
                    </span>
                  )}
                  {thread.status === "locked" && (
                    <span className="bg-muted text-muted-foreground px-2 py-0.5 text-[10px] font-mono font-bold uppercase border-2 border-foreground">
                      Locked
                    </span>
                  )}
                  {thread.solvedPostId && (
                    <span className="bg-green-500 text-white px-2 py-0.5 text-[10px] font-mono font-bold uppercase border-2 border-foreground">
                      Solved
                    </span>
                  )}
                  {thread.blockId && (
                    <span className="bg-primary text-primary-foreground px-2 py-0.5 text-[10px] font-mono font-bold uppercase border-2 border-foreground">
                      Mining
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0 flex gap-4 sm:flex-col sm:items-end sm:gap-0 font-mono text-xs text-muted-foreground">
                <span>{thread.postCount} post{thread.postCount !== 1 ? "s" : ""}</span>
                <span>{relativeTime(thread.lastPostAt)}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {allThreads.length === 0 && !isLoading && !error && (
        <div className="border-4 border-foreground bg-card p-12 text-center brutal-shadow font-mono font-bold uppercase text-muted-foreground">
          No threads yet — be the first!
        </div>
      )}

      {nextCursor && (
        <div className="text-center">
          <button
            onClick={handleLoadMore}
            disabled={isLoading}
            className="border-4 border-foreground bg-card font-mono font-bold uppercase px-8 py-3 hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            {isLoading ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
