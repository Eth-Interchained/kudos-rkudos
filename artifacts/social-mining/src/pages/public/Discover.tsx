import { useState, useMemo } from "react";
import { useListParticipants } from "@workspace/api-client-react";
import { Link } from "wouter";
import { useMinerIdentity } from "@/hooks/useMinerIdentity";

export default function Discover() {
  const { data: participants, isLoading } = useListParticipants();
  const { identity } = useMinerIdentity();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"trust" | "followers" | "recent">("trust");
  const [filterVerified, setFilterVerified] = useState(false);

  const filtered = useMemo(() => {
    if (!participants) return [];
    let list = [...participants];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase().replace(/^@/, "");
      list = list.filter(
        (p) =>
          p.xHandle.toLowerCase().includes(q) ||
          (p.displayName ?? "").toLowerCase().includes(q),
      );
    }

    // Filter
    if (filterVerified) {
      list = list.filter((p) => p.verified);
    }

    // Sort
    if (sortBy === "trust") {
      list.sort((a, b) => b.trustScore - a.trustScore);
    } else if (sortBy === "followers") {
      list.sort((a, b) => b.followersCount - a.followersCount);
    } else {
      list.sort(
        (a, b) =>
          new Date(b.accountCreated || 0).getTime() - new Date(a.accountCreated || 0).getTime(),
      );
    }

    return list;
  }, [participants, search, sortBy, filterVerified]);

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter">
          Discover Miners
        </h1>
        <p className="font-mono text-sm text-muted-foreground max-w-2xl">
          Browse the network. Find signal producers. Link up.
          DMs are <strong className="text-primary">end-to-end encrypted</strong> — even admins can't read them.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by @handle..."
            className="w-full border-4 border-foreground bg-background font-mono text-sm px-4 py-3 focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <div className="flex gap-2">
          {(["trust", "followers", "recent"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`border-2 border-foreground px-4 py-2 font-mono text-xs font-bold uppercase transition-colors ${
                sortBy === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-card hover:bg-muted"
              }`}
            >
              {s === "trust" ? "⚡ Trust" : s === "followers" ? "👥 Reach" : "🕐 Recent"}
            </button>
          ))}
          <button
            onClick={() => setFilterVerified(!filterVerified)}
            className={`border-2 border-foreground px-4 py-2 font-mono text-xs font-bold uppercase transition-colors ${
              filterVerified
                ? "bg-blue-500 text-white"
                : "bg-card hover:bg-muted"
            }`}
          >
            ✓ Verified
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-4 font-mono text-xs text-muted-foreground">
        <span>{participants?.length ?? 0} total miners</span>
        <span>·</span>
        <span>{filtered.length} shown</span>
        {identity?.xHandle && (
          <>
            <span>·</span>
            <span>You: <strong className="text-foreground">@{identity.xHandle}</strong></span>
          </>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-48 border-4 border-foreground bg-muted animate-pulse brutal-shadow"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border-4 border-foreground bg-card p-12 text-center brutal-shadow font-mono text-muted-foreground">
          {search ? `No miners matching "${search}"` : "No miners registered yet"}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((miner) => {
            const isMe = identity?.xHandle === miner.xHandle;
            return (
              <div
                key={miner.id}
                className={`border-4 border-foreground bg-card brutal-shadow flex flex-col hover:-translate-y-1 transition-transform ${
                  isMe ? "ring-2 ring-primary ring-offset-2" : ""
                }`}
              >
                {/* Card top */}
                <div className="p-5 flex-1 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 border-4 border-foreground bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center text-xl font-black shrink-0">
                      {miner.xHandle[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <Link
                        href={`/participants/${miner.xHandle}`}
                        className="font-black text-sm hover:text-primary transition-colors block truncate"
                      >
                        @{miner.xHandle}
                      </Link>
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        {miner.verified && (
                          <span className="text-[10px] font-mono font-bold bg-blue-500 text-white px-1.5 py-0.5">
                            ✓ VERIFIED
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-muted-foreground">
                          PoH {miner.pohTier}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px]">
                    <div className="border border-foreground/20 px-2 py-1 bg-muted/20">
                      <div className="text-muted-foreground">Trust</div>
                      <div className="font-bold text-sm">{miner.trustScore.toFixed(2)}</div>
                    </div>
                    <div className="border border-foreground/20 px-2 py-1 bg-muted/20">
                      <div className="text-muted-foreground">Reach</div>
                      <div className="font-bold text-sm">{miner.followersCount.toLocaleString()}</div>
                    </div>
                  </div>
                </div>

                {/* Card footer */}
                <div className="border-t-2 border-foreground flex">
                  <Link
                    href={`/participants/${miner.xHandle}`}
                    className="flex-1 text-center py-2.5 font-mono text-xs font-bold uppercase hover:bg-primary hover:text-primary-foreground transition-colors"
                  >
                    Profile
                  </Link>
                  {!isMe && identity?.miningKeyHash && (
                    <Link
                      href={`/participants/${miner.xHandle}?dm=true`}
                      className="flex-1 text-center py-2.5 font-mono text-xs font-bold uppercase border-l-2 border-foreground hover:bg-secondary hover:text-secondary-foreground transition-colors"
                    >
                      🔒 DM
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* E2E Notice */}
      <div className="border-2 border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
        <span className="text-2xl shrink-0">🔐</span>
        <div className="space-y-1">
          <div className="font-bold text-xs uppercase">End-to-End Encrypted DMs</div>
          <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
            Messages are encrypted in your browser before being sent. The server only stores ciphertext.
            Admins, operators, and even Kudos itself cannot read your conversations.
            Your mining key is your identity — guard it.
          </p>
        </div>
      </div>
    </div>
  );
}
