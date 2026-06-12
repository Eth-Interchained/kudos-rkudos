import * as React from "react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getCategories } from "@/lib/forumApi";
import type { ForumCategory } from "@/lib/forumApi";

export default function Forum() {
  const [, navigate] = useLocation();
  const [searchInput, setSearchInput] = useState("");

  const { data: categories, isLoading, error } = useQuery<ForumCategory[]>({
    queryKey: ["forum", "categories"],
    queryFn: getCategories,
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchInput.trim();
    if (q) {
      navigate(`/forum/search?q=${encodeURIComponent(q)}`);
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="space-y-2">
        <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter">
          rKudos Forum
        </h1>
        <p className="font-mono text-sm text-muted-foreground max-w-2xl">
          Community discussion for Kudos miners. Ask questions, share insights, earn signal.
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search threads..."
          className="flex-1 border-4 border-foreground bg-background font-mono text-sm px-4 py-3 focus:outline-none focus:border-primary transition-colors"
        />
        <button
          type="submit"
          className="border-4 border-foreground bg-foreground text-background font-mono font-bold uppercase px-6 py-3 hover:bg-primary hover:border-primary transition-colors"
        >
          Search
        </button>
      </form>

      {isLoading && (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 border-4 border-foreground bg-muted animate-pulse brutal-shadow"
            />
          ))}
        </div>
      )}

      {error && (
        <div className="border-4 border-destructive bg-destructive/10 p-6 font-mono font-bold text-destructive">
          Failed to load categories: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      )}

      {categories && (
        <div className="grid gap-4">
          {categories
            .filter((c) => c.active)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((cat) => (
              <Link key={cat.id} href={`/forum/c/${cat.slug}`} className="block">
                <div className="border-4 border-foreground bg-card brutal-shadow p-6 hover:bg-secondary/10 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-black uppercase tracking-tight">{cat.name}</h2>
                      {cat.miningEligible && (
                        <span className="bg-primary text-primary-foreground px-2 py-0.5 text-[10px] font-mono font-bold uppercase border-2 border-foreground">
                          Mining
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground font-mono text-sm">{cat.description}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-xs text-muted-foreground uppercase font-bold">
                      Min Trust
                    </div>
                    <div className="font-black text-2xl">{cat.minTrustLevel}</div>
                  </div>
                </div>
              </Link>
            ))}
        </div>
      )}

      {categories && categories.filter((c) => c.active).length === 0 && !isLoading && (
        <div className="border-4 border-foreground bg-card p-12 text-center brutal-shadow font-mono font-bold uppercase text-muted-foreground">
          No categories yet
        </div>
      )}
    </div>
  );
}
