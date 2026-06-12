import * as React from "react";
import { useState, useEffect } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getThread,
  getRelated,
  createPost,
  react,
  flag,
  solve,
  subscribe,
  summarize,
  ask,
  subscribeThread,
} from "@/lib/forumApi";
import type { ThreadView, RelatedThread, ForumPost } from "@/lib/forumApi";
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

const REACTIONS = [
  { kind: "kudos", label: "Kudos" },
  { kind: "insightful", label: "Insightful" },
  { kind: "solution_assist", label: "Assist" },
];

const FLAG_REASONS = ["spam", "abuse", "off_topic", "plagiarism", "reward_farming", "other"] as const;

function PostCard({
  post,
  handle,
  threadId,
  isSolved,
  onQuote,
}: {
  post: ForumPost;
  handle: string;
  threadId: string;
  isSolved: boolean;
  onQuote: (p: ForumPost, h: string) => void;
}) {
  const { identity } = useMinerIdentity();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [flagOpen, setFlagOpen] = useState(false);
  const [flagReason, setFlagReason] = useState<string>("spam");
  const [flagNote, setFlagNote] = useState("");
  const [flagError, setFlagError] = useState<string | null>(null);

  const reactMut = useMutation({
    mutationFn: (kind: string) => {
      if (!identity) throw new Error("No identity");
      return react(
        { miningKeyHash: identity.miningKeyHash, handle: identity.xHandle },
        post.id,
        kind,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forum", "thread", threadId] });
    },
    onError: (err) => {
      toast({ title: "Reaction failed", description: err instanceof Error ? err.message : "Unknown error" });
    },
  });

  const flagMut = useMutation({
    mutationFn: () => {
      if (!identity) throw new Error("No identity");
      return flag(
        { miningKeyHash: identity.miningKeyHash, handle: identity.xHandle },
        post.id,
        flagReason,
        flagNote || undefined,
      );
    },
    onSuccess: () => {
      toast({ title: "Flagged", description: "Your report has been submitted." });
      setFlagOpen(false);
      setFlagNote("");
      setFlagError(null);
    },
    onError: (err) => {
      setFlagError(err instanceof Error ? err.message : "Unknown error");
    },
  });

  const solveMut = useMutation({
    mutationFn: () => {
      if (!identity) throw new Error("No identity");
      return solve(
        { miningKeyHash: identity.miningKeyHash, handle: identity.xHandle },
        threadId,
        post.id,
      );
    },
    onSuccess: () => {
      toast({ title: "Marked as solution" });
      queryClient.invalidateQueries({ queryKey: ["forum", "thread", threadId] });
    },
    onError: (err) => {
      toast({ title: "Could not mark solution", description: err instanceof Error ? err.message : "Unknown error" });
    },
  });

  const isMirrored = post.miningKeyHash === null;

  return (
    <div
      id={`post-${post.id}`}
      className={`border-4 border-foreground bg-card brutal-shadow p-6 space-y-4 ${isSolved ? "border-green-500" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-black text-base">@{handle}</span>
          {isMirrored && (
            <span className="bg-muted text-muted-foreground px-2 py-0.5 text-[10px] font-mono font-bold uppercase border-2 border-foreground">
              mirrored / read-only
            </span>
          )}
          {isSolved && (
            <span className="bg-green-500 text-white px-2 py-0.5 text-[10px] font-mono font-bold uppercase border-2 border-foreground">
              Solution
            </span>
          )}
          {post.editedAt && (
            <span className="font-mono text-[10px] text-muted-foreground">(edited)</span>
          )}
        </div>
        <span className="font-mono text-xs text-muted-foreground">{relativeTime(post.createdAt)}</span>
      </div>

      {post.replyToPostId && (
        <div className="border-l-4 border-primary pl-3 py-1 font-mono text-xs text-muted-foreground">
          Replying to{" "}
          <a href={`#post-${post.replyToPostId}`} className="hover:text-primary transition-colors underline">
            #{post.replyToPostId.slice(0, 8)}
          </a>
        </div>
      )}

      <div className="whitespace-pre-wrap break-words font-medium text-base leading-relaxed">
        {post.rawMd}
      </div>

      {identity?.miningKeyHash && (
        <div className="flex flex-wrap gap-2 pt-2 border-t-2 border-foreground/20">
          {REACTIONS.map((r) => (
            <button
              key={r.kind}
              onClick={() => reactMut.mutate(r.kind)}
              disabled={reactMut.isPending}
              className="border-2 border-foreground bg-muted/30 font-mono text-xs font-bold uppercase px-3 py-1.5 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors disabled:opacity-50"
            >
              {r.label}
            </button>
          ))}
          <button
            onClick={() => onQuote(post, handle)}
            className="border-2 border-foreground bg-muted/30 font-mono text-xs font-bold uppercase px-3 py-1.5 hover:bg-secondary hover:border-secondary transition-colors"
          >
            Quote
          </button>
          <button
            onClick={() => solveMut.mutate()}
            disabled={solveMut.isPending}
            className="border-2 border-green-500 text-green-700 bg-green-50 font-mono text-xs font-bold uppercase px-3 py-1.5 hover:bg-green-500 hover:text-white transition-colors disabled:opacity-50"
          >
            Mark Solution
          </button>
          <button
            onClick={() => setFlagOpen((v) => !v)}
            className="border-2 border-destructive text-destructive bg-destructive/10 font-mono text-xs font-bold uppercase px-3 py-1.5 hover:bg-destructive hover:text-white transition-colors"
          >
            Flag
          </button>
        </div>
      )}

      {flagOpen && (
        <div className="border-2 border-destructive bg-destructive/5 p-4 space-y-3">
          {flagError && (
            <div className="font-mono text-xs text-destructive font-bold">{flagError}</div>
          )}
          <div className="flex flex-wrap gap-2">
            {FLAG_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => setFlagReason(r)}
                className={`border-2 border-foreground font-mono text-xs font-bold uppercase px-2 py-1 transition-colors ${
                  flagReason === r ? "bg-destructive text-white" : "bg-muted/30 hover:bg-muted"
                }`}
              >
                {r.replace("_", " ")}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={flagNote}
            onChange={(e) => setFlagNote(e.target.value)}
            placeholder="Optional note..."
            className="w-full border-2 border-foreground bg-background font-mono text-xs px-3 py-2 focus:outline-none focus:border-destructive"
          />
          <div className="flex gap-2">
            <button
              onClick={() => flagMut.mutate()}
              disabled={flagMut.isPending}
              className="border-2 border-destructive bg-destructive text-white font-mono text-xs font-bold uppercase px-4 py-2 hover:opacity-90 disabled:opacity-50"
            >
              {flagMut.isPending ? "Flagging..." : "Submit Flag"}
            </button>
            <button
              onClick={() => { setFlagOpen(false); setFlagError(null); }}
              className="border-2 border-foreground font-mono text-xs font-bold uppercase px-4 py-2 hover:bg-muted/50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ForumThread() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  const queryClient = useQueryClient();
  const { identity } = useMinerIdentity();
  const { toast } = useToast();

  const [replyBody, setReplyBody] = useState("");
  const [replyTo, setReplyTo] = useState<{ postId: string; handle: string } | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);

  const [subscribeLevel, setSubscribeLevel] = useState<"watching" | "tracking" | "muted">("tracking");

  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [askQ, setAskQ] = useState("");
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<ThreadView>({
    queryKey: ["forum", "thread", id],
    queryFn: () => getThread(id),
    enabled: !!id,
  });

  const { data: related } = useQuery<RelatedThread[]>({
    queryKey: ["forum", "related", id],
    queryFn: () => getRelated(id),
    enabled: !!id,
  });

  useEffect(() => {
    if (!id) return;
    const cleanup = subscribeThread(id, () => {
      queryClient.invalidateQueries({ queryKey: ["forum", "thread", id] });
    });
    return cleanup;
  }, [id, queryClient]);

  const replyMut = useMutation({
    mutationFn: () => {
      if (!identity) throw new Error("No identity");
      return createPost(
        { miningKeyHash: identity.miningKeyHash, handle: identity.xHandle },
        id,
        { rawMd: replyBody.trim(), replyToPostId: replyTo?.postId ?? null },
      );
    },
    onSuccess: () => {
      toast({ title: "Reply posted" });
      setReplyBody("");
      setReplyTo(null);
      setReplyError(null);
      queryClient.invalidateQueries({ queryKey: ["forum", "thread", id] });
    },
    onError: (err) => {
      setReplyError(err instanceof Error ? err.message : "Unknown error");
    },
  });

  const subscribeMut = useMutation({
    mutationFn: (level: "watching" | "tracking" | "muted") => {
      if (!identity) throw new Error("No identity");
      return subscribe(
        { miningKeyHash: identity.miningKeyHash, handle: identity.xHandle },
        id,
        level,
      );
    },
    onSuccess: (_, level) => {
      setSubscribeLevel(level);
      toast({ title: "Subscription updated", description: level });
    },
    onError: (err) => {
      toast({ title: "Subscription failed", description: err instanceof Error ? err.message : "Unknown error" });
    },
  });

  async function handleSummarize() {
    setSummaryLoading(true);
    setSummaryError(null);
    setSummary(null);
    try {
      const res = await summarize(id);
      if (!res.available) {
        setSummaryError("AiAS unavailable right now");
      } else {
        setSummary(res.summary ?? "No summary available.");
      }
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSummaryLoading(false);
    }
  }

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    const q = askQ.trim();
    if (!q) return;
    setAskLoading(true);
    setAskError(null);
    setAskAnswer(null);
    try {
      const res = await ask(id, q);
      if (!res.available) {
        setAskError("AiAS unavailable right now");
      } else {
        setAskAnswer(res.answer ?? "No answer.");
      }
    } catch (err) {
      setAskError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setAskLoading(false);
    }
  }

  function handleQuote(post: ForumPost, handle: string) {
    setReplyTo({ postId: post.id, handle });
    const quoteText = `> @${handle} wrote:\n> ${post.rawMd.split("\n").join("\n> ")}\n\n`;
    setReplyBody(quoteText);
    document.getElementById("reply-composer")?.scrollIntoView({ behavior: "smooth" });
  }

  const thread = data?.thread;
  const posts = data?.posts ?? [];
  const solvedPostId = thread?.solvedPostId;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in">
        <div className="h-16 border-4 border-foreground bg-muted animate-pulse brutal-shadow" />
        <div className="h-48 border-4 border-foreground bg-muted animate-pulse brutal-shadow" />
        <div className="h-32 border-4 border-foreground bg-muted animate-pulse brutal-shadow" />
      </div>
    );
  }

  if (error || !thread) {
    return (
      <div className="border-4 border-destructive bg-destructive/10 p-8 font-mono font-bold text-destructive">
        {error instanceof Error ? error.message : "Thread not found"}
      </div>
    );
  }

  const categoryLink = `/forum`;

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="space-y-2">
        <div className="font-mono text-sm text-muted-foreground uppercase font-bold">
          <Link href={categoryLink} className="hover:text-primary transition-colors">Forum</Link>
          <span className="mx-2">/</span>
          <span className="truncate">{thread.title}</span>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter leading-tight flex-1">
            {thread.title}
          </h1>
          <div className="flex flex-wrap gap-2 pt-1">
            {thread.status === "pinned" && (
              <span className="bg-secondary text-secondary-foreground px-2 py-1 text-[10px] font-mono font-bold uppercase border-2 border-foreground">
                Pinned
              </span>
            )}
            {thread.status === "locked" && (
              <span className="bg-muted text-muted-foreground px-2 py-1 text-[10px] font-mono font-bold uppercase border-2 border-foreground">
                Locked
              </span>
            )}
            {solvedPostId && (
              <span className="bg-green-500 text-white px-2 py-1 text-[10px] font-mono font-bold uppercase border-2 border-foreground">
                Solved
              </span>
            )}
            {thread.blockId && (
              <span className="bg-primary text-primary-foreground px-2 py-1 text-[10px] font-mono font-bold uppercase border-2 border-foreground">
                Mining
              </span>
            )}
          </div>
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          {thread.postCount} posts · last activity {relativeTime(thread.lastPostAt)}
        </div>
      </div>

      {/* Subscribe control */}
      {identity?.miningKeyHash && (
        <div className="flex items-center gap-3 border-2 border-foreground p-3 bg-muted/20">
          <span className="font-mono text-xs font-bold uppercase text-muted-foreground">Subscribe:</span>
          {(["watching", "tracking", "muted"] as const).map((level) => (
            <button
              key={level}
              onClick={() => subscribeMut.mutate(level)}
              disabled={subscribeMut.isPending}
              className={`border-2 border-foreground font-mono text-xs font-bold uppercase px-3 py-1.5 transition-colors disabled:opacity-50 ${
                subscribeLevel === level
                  ? "bg-primary text-primary-foreground"
                  : "bg-card hover:bg-muted"
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      )}

      {/* Posts */}
      <div className="space-y-4">
        {posts.map(({ post, handle }) => (
          <PostCard
            key={post.id}
            post={post}
            handle={handle}
            threadId={id}
            isSolved={post.id === solvedPostId}
            onQuote={handleQuote}
          />
        ))}
      </div>

      {/* Reply composer */}
      {identity?.miningKeyHash && thread.status !== "locked" && (
        <div id="reply-composer" className="border-4 border-foreground bg-card brutal-shadow p-6 space-y-4">
          <h2 className="font-black text-lg uppercase">Reply</h2>
          {replyTo && (
            <div className="border-l-4 border-primary pl-3 py-1 flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                Quoting @{replyTo.handle} — #{replyTo.postId.slice(0, 8)}
              </span>
              <button
                onClick={() => { setReplyTo(null); setReplyBody(""); }}
                className="font-mono text-xs text-destructive hover:underline"
              >
                Clear
              </button>
            </div>
          )}
          {replyError && (
            <div className="border-2 border-destructive bg-destructive/10 p-3 font-mono text-sm text-destructive font-bold">
              {replyError}
            </div>
          )}
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Write your reply..."
            rows={5}
            className="w-full border-4 border-foreground bg-background font-mono text-sm px-4 py-3 focus:outline-none focus:border-primary transition-colors resize-y"
          />
          <button
            onClick={() => {
              if (!replyBody.trim()) {
                setReplyError("Reply cannot be empty");
                return;
              }
              setReplyError(null);
              replyMut.mutate();
            }}
            disabled={replyMut.isPending}
            className="border-4 border-foreground bg-foreground text-background font-mono font-bold uppercase px-6 py-3 hover:bg-primary hover:border-primary transition-colors disabled:opacity-50"
          >
            {replyMut.isPending ? "Posting..." : "Post Reply"}
          </button>
        </div>
      )}

      {thread.status === "locked" && (
        <div className="border-4 border-foreground bg-muted/20 p-4 font-mono text-sm font-bold uppercase text-center text-muted-foreground">
          This thread is locked — no new replies
        </div>
      )}

      {/* AiAS Section */}
      <div className="border-4 border-foreground bg-card brutal-shadow p-6 space-y-4">
        <h2 className="font-black text-base uppercase tracking-tight">AiAS — AI Thread Assistant</h2>

        <div className="flex gap-2">
          <button
            onClick={handleSummarize}
            disabled={summaryLoading}
            className="border-4 border-foreground bg-muted/30 font-mono text-xs font-bold uppercase px-4 py-2 hover:bg-muted transition-colors disabled:opacity-50"
          >
            {summaryLoading ? "Summarizing..." : "Summarize Thread"}
          </button>
        </div>

        {summaryError && (
          <div className="font-mono text-xs text-destructive font-bold border-l-4 border-destructive pl-3 py-1">
            {summaryError}
          </div>
        )}
        {summary && (
          <div className="border-2 border-foreground bg-muted/20 p-4 font-mono text-sm whitespace-pre-wrap break-words">
            <div className="font-bold uppercase text-[10px] text-muted-foreground mb-2">Summary</div>
            {summary}
          </div>
        )}

        <form onSubmit={handleAsk} className="flex gap-2">
          <input
            type="text"
            value={askQ}
            onChange={(e) => setAskQ(e.target.value)}
            placeholder="Ask AiAS a question about this thread..."
            className="flex-1 border-4 border-foreground bg-background font-mono text-sm px-4 py-2 focus:outline-none focus:border-primary transition-colors"
          />
          <button
            type="submit"
            disabled={askLoading}
            className="border-4 border-foreground bg-foreground text-background font-mono font-bold uppercase px-4 py-2 hover:bg-primary hover:border-primary transition-colors disabled:opacity-50"
          >
            {askLoading ? "..." : "Ask"}
          </button>
        </form>

        {askError && (
          <div className="font-mono text-xs text-destructive font-bold border-l-4 border-destructive pl-3 py-1">
            {askError}
          </div>
        )}
        {askAnswer && (
          <div className="border-2 border-foreground bg-muted/20 p-4 font-mono text-sm whitespace-pre-wrap break-words">
            <div className="font-bold uppercase text-[10px] text-muted-foreground mb-2">Answer</div>
            {askAnswer}
          </div>
        )}
      </div>

      {/* Related threads */}
      {related && related.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-black text-base uppercase tracking-tight border-b-4 border-foreground pb-2">
            Related Threads
          </h2>
          <div className="grid gap-2">
            {related.map((r) => (
              <Link key={r.id} href={`/forum/t/${r.id}`} className="block">
                <div className="border-2 border-foreground bg-card p-3 hover:bg-muted/30 transition-colors flex items-center justify-between gap-3">
                  <span className="font-bold text-sm break-words">{r.title}</span>
                  <span className="font-mono text-xs text-muted-foreground shrink-0">
                    {r.postCount} posts
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
