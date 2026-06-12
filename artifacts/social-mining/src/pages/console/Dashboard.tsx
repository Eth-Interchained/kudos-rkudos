import { useGetOverview, useGetTreasury, useGetChainStats, useListBlocks } from "@workspace/api-client-react";
import { Link } from "wouter";
import { formatItc, formatHash } from "@/lib/utils";

export default function Dashboard() {
  const { data: overview } = useGetOverview();
  const { data: treasury } = useGetTreasury();
  const { data: chain } = useGetChainStats();
  const { data: blocks } = useListBlocks();

  return (
    <div className="space-y-8 animate-in fade-in">
      <h1 className="text-4xl font-black uppercase tracking-tighter border-b-4 border-foreground pb-4">Operator Dashboard</h1>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-black uppercase">ITC Chain Stats</h2>
        <span className={`font-mono text-xs font-bold uppercase px-2 py-1 border-2 border-foreground ${chain?.source === "live" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
          {chain?.source === "live" ? "● Live" : "Offline"}
        </span>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="border-4 border-foreground bg-card p-6 brutal-shadow">
          <div className="text-sm font-bold uppercase text-muted-foreground mb-2">Network Hashrate</div>
          <div className="text-3xl font-black">{chain?.hashrateLabel ?? "—"}</div>
          <div className="text-xs font-mono text-primary mt-2">{chain?.windowBlocks ? `${chain.windowBlocks}-block window` : ""}</div>
        </div>
        <div className="border-4 border-foreground bg-primary text-primary-foreground p-6 brutal-shadow">
          <div className="text-sm font-bold uppercase mb-2">Circulating Supply</div>
          <div className="text-3xl font-black">{formatItc(chain?.circulatingItc)} ITC</div>
          <div className="text-xs font-mono mt-2 opacity-80">Live from chain</div>
        </div>
        <div className="border-4 border-foreground bg-card p-6 brutal-shadow">
          <div className="text-sm font-bold uppercase text-muted-foreground mb-2">Block Height</div>
          <div className="text-3xl font-black">{chain?.tipHeight?.toLocaleString() ?? "—"}</div>
          <div className="text-xs font-mono mt-2">Chain tip</div>
        </div>
        <div className="border-4 border-foreground bg-card p-6 brutal-shadow">
          <div className="text-sm font-bold uppercase text-muted-foreground mb-2">Difficulty</div>
          <div className="text-3xl font-black">{chain?.difficulty ? formatItc(chain.difficulty) : "—"}</div>
          <div className="text-xs font-mono mt-2">
            <a href={chain?.explorerUrl ?? "https://vision.interchained.org"} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Open explorer ↗</a>
          </div>
        </div>
      </div>

      {chain?.recentBlocks && chain.recentBlocks.length > 0 && (
        <div className="border-4 border-foreground bg-card brutal-shadow overflow-hidden">
          <div className="bg-foreground text-background px-4 py-2 font-black uppercase text-sm">Recent ITC Blocks</div>
          <div className="divide-y-2 divide-foreground">
            {chain.recentBlocks.slice(0, 5).map((b) => (
              <a key={b.hash} href={b.explorerUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-4 px-4 py-3 font-mono text-sm hover:bg-muted/40 transition-colors">
                <span className="font-black">#{b.height.toLocaleString()}</span>
                <span className="text-muted-foreground truncate flex-1">{formatHash(b.hash, 10, 8)}</span>
                <span className="text-primary text-xs uppercase font-bold">View ↗</span>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="border-4 border-foreground bg-card p-6 brutal-shadow">
          <div className="text-sm font-bold uppercase text-muted-foreground mb-2">Total Blocks</div>
          <div className="text-4xl font-black">{overview?.totalBlocks || 0}</div>
          <div className="text-xs font-mono text-primary mt-2">{overview?.openBlocks} Open • {overview?.settledBlocks} Settled</div>
        </div>
        <div className="border-4 border-foreground bg-card p-6 brutal-shadow">
          <div className="text-sm font-bold uppercase text-muted-foreground mb-2">Replies</div>
          <div className="text-4xl font-black">{overview?.totalReplies || 0}</div>
          <div className="text-xs font-mono mt-2">{overview?.validReplies} Valid • {overview?.rejectedReplies} Rejected</div>
        </div>
        <div className="border-4 border-foreground bg-primary text-primary-foreground p-6 brutal-shadow">
          <div className="text-sm font-bold uppercase mb-2">Total Rewarded</div>
          <div className="text-4xl font-black">{formatItc(overview?.totalRewardItc)}</div>
          <div className="text-xs font-mono mt-2">{formatItc(overview?.totalPaidItc)} Paid</div>
        </div>
        <div className="border-4 border-destructive bg-destructive/10 p-6 brutal-shadow">
          <div className="text-sm font-bold uppercase text-destructive mb-2">Pending Review</div>
          <div className="text-4xl font-black text-destructive">{overview?.pendingReview || 0}</div>
          <div className="text-xs font-mono text-destructive mt-2">Requires attention</div>
        </div>
      </div>

      <h2 className="text-2xl font-black uppercase mt-12 mb-6">Treasury Status</h2>
      <div className="grid md:grid-cols-3 gap-6">
        <div className="border-4 border-foreground bg-card p-6 brutal-shadow col-span-full md:col-span-1">
          <div className="text-sm font-bold uppercase text-muted-foreground mb-2">Hot Wallet</div>
          <div className="text-3xl font-black">{formatItc(treasury?.hotWalletBalanceItc)}</div>
        </div>
        <div className="border-4 border-foreground bg-card p-6 brutal-shadow col-span-full md:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs font-bold uppercase text-muted-foreground">Daily Cap</div>
            <div className="font-mono font-bold">{formatItc(treasury?.dailyCapItc)}</div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase text-muted-foreground">Daily Spent</div>
            <div className="font-mono font-bold text-primary">{formatItc(treasury?.dailySpentItc)}</div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase text-muted-foreground">Pending</div>
            <div className="font-mono font-bold">{formatItc(treasury?.pendingItc)}</div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase text-muted-foreground">Held</div>
            <div className="font-mono font-bold text-destructive">{formatItc(treasury?.heldItc)}</div>
          </div>
        </div>
      </div>

      <h2 className="text-2xl font-black uppercase mt-12 mb-6">Block Posts</h2>
      <div className="border-4 border-foreground bg-card brutal-shadow overflow-hidden">
        <div className="divide-y-2 divide-foreground">
          {(!blocks || blocks.length === 0) ? (
            <div className="p-8 text-center font-mono font-bold uppercase text-muted-foreground">No blocks yet</div>
          ) : (
            blocks.map((b) => {
              const postLink = b.xPostUrl ?? b.shareUrl ?? null;
              return (
                <div key={b.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="bg-foreground text-background px-2 py-1 font-mono text-xs font-bold">#{b.seq}</span>
                    <Link href={`/blocks/${b.seq}`} className="font-bold truncate hover:text-primary transition-colors">{b.title}</Link>
                  </div>
                  {postLink ? (
                    <a href={postLink} target="_blank" rel="noopener noreferrer" className="shrink-0 font-mono text-xs font-bold uppercase border-2 border-foreground px-3 py-1 bg-secondary text-secondary-foreground hover:-translate-y-0.5 transition-transform">
                      {b.xPostUrl ? "View Post ↗" : "Share on X ↗"}
                    </a>
                  ) : (
                    <span className="shrink-0 font-mono text-xs uppercase text-muted-foreground">No post yet</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
