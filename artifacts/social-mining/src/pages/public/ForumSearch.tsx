import * as React from "react";
import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { search } from "@/lib/forumApi";
import type { SearchHit } from "@/lib/forumApi";

function parseQuery(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("q") ?? "";
  } catch {
    return "";
  }
}

export default function ForumSearch() {
  const [, navigate] = useLocation();
  const [liveQ, setLiveQ] = useState<string>(() => parseQuery());
  const [submittedQ, setSubmittedQ] = useState<string>(() => parseQuery());

  // Sync from URL on mount / navigation
  useEffect(() => {
    const q = parseQuery();
    setLiveQ(q);
    setSubmittedQ(q);
  }, []);

  const { data: hits, isLoading, error } = useQuery<SearchHit[]>({
    queryKey: ["forum", "search", submittedQ],
    queryFn: () => search(submittedQ),
    enabled: submittedQ.length > 0,
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = liveQ.trim();
    setSubmittedQ(q);
    if (q) {
      navigate(`/forum/search?q=${encodeURIComponent(q)}`);
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="space-y-2">
        <div className="font-mono text-sm text-muted-foreground uppercase font-bold">
          <Link href="/forum" className="hover:text-primary transition-colors">Forum</Link>
          <span className="mx-2">/</span>
          <span>Search</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter">
          Search Forum
        </h1>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={liveQ}
          onChange={(e) => setLiveQ(e.target.value)}
          placeholder="Search threads and posts..."
          className="flex-1 border-4 border-foreground bg-background font-mono text-sm px-4 py-3 focus:outline-none focus:border-primary transition-colors"
          autoFocus
        />
        <button
          type="submit"
          className="border-4 border-foreground bg-foreground text-background font-mono font-bold uppercase px-6 py-3 hover:bg-primary hover:border-primary transition-colors"
        >
          Search
        </button>
      </form>

      {submittedQ && (
        <div className="font-mono text-sm text-muted-foreground">
          Results for: <strong className="text-foreground">{submittedQ}</strong>
        </div>
      )}

      {isLoading && (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 border-4 border-foreground bg-muted animate-pulse brutal-shadow"
            />
          ))}
        </div>
      )}

      {error && (
        <div className="border-4 border-destructive bg-destructive/10 p-6 font-mono font-bold text-destructive">
          Search failed: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      )}

      {hits && hits.length > 0 && (
        <div className="grid gap-4">
          {hits.map((hit) => (
            <Link key={hit.postId} href={`/forum/t/${hit.threadId}#post-${hit.postId}`} className="block">
              <div className="border-4 border-foreground bg-card brutal-shadow p-5 hover:bg-secondary/10 transition-colors space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs text-muted-foreground uppercase font-bold">
                    Thread #{hit.threadId.slice(0, 8)} · Post #{hit.postId.slice(0, 8)}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    rank {hit.rank.toFixed(2)}
                  </span>
                </div>
                <p className="font-mono text-sm break-words whitespace-pre-wrap leading-relaxed">
                  {hit.snippet}
                </p>
                <div className="font-mono text-xs text-primary font-bold">View thread →</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {hits && hits.length === 0 && !isLoading && submittedQ && (
        <div className="border-4 border-foreground bg-card p-12 text-center brutal-shadow font-mono font-bold uppercase text-muted-foreground">
          No results for &ldquo;{submittedQ}&rdquo;
        </div>
      )}

      {!submittedQ && (
        <div className="border-4 border-foreground bg-card p-12 text-center brutal-shadow font-mono text-muted-foreground">
          Enter a query above to search forum threads and posts.
        </div>
      )}
    </div>
  );
}
