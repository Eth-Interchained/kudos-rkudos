import { useState } from "react";
import { useListBlocks, useGetSettings, useSubscribe } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import BlockCountdown from "@/components/BlockCountdown";
import { formatItc } from "@/lib/utils";

export default function Landing() {
  const { data: blocks, isLoading, refetch: refetchBlocks } = useListBlocks();
  const { data: settings, refetch: refetchSettings } = useGetSettings();
  const { toast } = useToast();
  const subscribe = useSubscribe();
  const [email, setEmail] = useState("");

  const handleSubscribe = () => {
    if (!email.trim()) return;
    subscribe.mutate(
      { data: { email: email.trim() } },
      {
        onSuccess: () => {
          toast({ title: "Subscribed", description: "You're on the weekly digest list." });
          setEmail("");
        },
        onError: (err: unknown) => {
          const description =
            (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
            "Could not subscribe";
          toast({ title: "Error", description, variant: "destructive" });
        },
      },
    );
  };

  const intervalMin = settings?.blockIntervalMinutes ?? 10;
  const blockReward = settings?.blockRewardItc;
  const govBlocks = settings?.governanceBlocks;
  const govSharePct = settings?.governanceSharePct;
  const govSum = settings?.governanceRewardSumItc;
  const rewardLive = settings?.rewardSourceLive;
  // Imported genesis posts also carry status "open" and (on re-import) the
  // highest seq numbers, so an unfiltered list surfaces them ahead of real
  // mining blocks. Only postMode !== "imported" blocks are mineable.
  const mineable = blocks?.filter((b) => b.postMode !== "imported") ?? [];
  const openBlock = mineable.find((b) => b.status === "open");
  // Every block currently accepting replies — imported genesis posts can be
  // open too, so this is the full live set, surfaced in the marquee below.
  const openBlocks = (blocks ?? []).filter((b) => b.status === "open");

  return (
    <div className="space-y-16 animate-in fade-in slide-in-from-bottom-8 duration-700">
      <section className="py-20 md:py-32 flex flex-col items-center text-center space-y-8">
        <h1 className="text-5xl md:text-8xl font-black tracking-tighter uppercase leading-[0.9]">
          <span className="bg-primary text-primary-foreground px-4 py-2 brutal-shadow block mb-4">Inverted</span>
          <span className="text-foreground">Hashpower</span>
        </h1>
        <p className="text-xl md:text-2xl max-w-2xl font-mono bg-secondary text-secondary-foreground p-4 brutal-shadow border-4 border-foreground">
          Quality × Trust × Uniqueness × Reach
        </p>
        <BlockCountdown
          opensAt={openBlock?.opensAt ?? null}
          intervalMin={intervalMin}
          seq={openBlock?.seq}
          rewardItc={openBlock?.rewardItc}
          paused={settings?.rewardsEnabled === false}
          onSolve={() => {
            // The live block just solved — pull the freshly-opened block and
            // updated reward so the hero flips over without a manual refresh.
            void refetchBlocks();
            void refetchSettings();
          }}
        />
        <div className="flex flex-col gap-4 sm:flex-row">
          <Button asChild size="lg" className="brutal-shadow text-lg border-4 border-foreground h-16 px-8 rounded-none w-full sm:w-auto">
            <Link href="/blocks">View Mining Blocks</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="brutal-shadow text-lg border-4 border-foreground h-16 px-8 rounded-none w-full sm:w-auto">
            <Link href="/wallet">Bind Wallet</Link>
          </Button>
        </div>
      </section>

      {openBlocks.length > 0 && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b-4 border-foreground pb-4">
            <span className="pulse-glow inline-block h-3 w-3 shrink-0 bg-primary" />
            <h2 className="text-2xl md:text-3xl font-black uppercase">
              Open Blocks · Live
            </h2>
            <span className="font-mono text-xs sm:text-sm font-bold text-muted-foreground">
              {openBlocks.length} accepting replies
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {openBlocks.map((block) => (
              <Link
                key={block.id}
                href={`/blocks/${block.seq}`}
                className="block"
                data-testid={`open-block-${block.seq}`}
              >
                <div className="flex h-full flex-col gap-3 border-4 border-foreground bg-card p-4 brutal-shadow">
                  <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs font-bold uppercase">
                    <span className="bg-foreground px-2 py-1 text-background">
                      #{block.seq}
                    </span>
                    <span className="border-2 border-foreground bg-secondary px-2 py-1 text-secondary-foreground">
                      {block.status}
                    </span>
                  </div>
                  <h3 className="flex-1 text-lg font-black uppercase leading-tight break-words">
                    {block.title}
                  </h3>
                  <div className="border-2 border-foreground bg-primary px-2 py-2 text-center font-mono text-sm font-bold text-primary-foreground break-words">
                    {block.rewardItc} ITC
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-8">
        <h2 className="text-3xl font-black uppercase border-b-4 border-foreground pb-4">Latest Mining Blocks</h2>
        {isLoading ? (
          <div className="h-32 bg-muted animate-pulse border-4 border-border brutal-shadow" />
        ) : mineable.length === 0 ? (
          <div className="border-4 border-foreground bg-card p-6 brutal-shadow font-mono text-sm text-muted-foreground">
            No mining blocks open yet — check back at the next block interval.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {mineable.slice(0, 3).map((block) => (
              <Link key={block.id} href={`/blocks/${block.seq}`} className="block">
                <div className="border-4 border-foreground bg-card p-6 brutal-shadow h-full flex flex-col hover:-translate-y-2 transition-transform">
                  <div className="uppercase font-mono text-sm font-bold text-muted-foreground mb-4">
                    Block #{block.seq} • {block.status}
                  </div>
                  <h3 className="text-2xl font-black uppercase mb-4 flex-1">{block.title}</h3>
                  <div className="bg-primary text-primary-foreground p-3 font-mono text-center font-bold border-2 border-foreground">
                    {block.rewardItc} ITC Pool
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {blockReward != null && (
        <section className="space-y-8">
          <h2 className="text-3xl font-black uppercase border-b-4 border-foreground pb-4">Governance-Linked Block Reward</h2>
          <p className="font-mono text-sm text-muted-foreground max-w-3xl">
            Each block's reward pool is pegged to the live Interchained chain:{" "}
            {govSharePct ?? 10}% of the governance (treasury) reward summed over the
            last {govBlocks ?? 10} ITC blocks. No fixed subsidy, no inflation knob —
            it tracks the real chain.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="border-4 border-foreground bg-primary text-primary-foreground p-6 brutal-shadow">
              <div className="font-mono text-sm font-bold uppercase mb-2">Current Block Reward</div>
              <div className="text-4xl font-black">{formatItc(blockReward)} ITC</div>
              <div className="font-mono text-xs mt-2 opacity-80">Minted into each new block</div>
            </div>
            <div className="border-4 border-foreground bg-card p-6 brutal-shadow">
              <div className="font-mono text-sm font-bold uppercase mb-2">Governance Reward · {govBlocks ?? 10} Blocks</div>
              <div className="text-4xl font-black">{govSum != null ? `${formatItc(govSum)} ITC` : "—"}</div>
              <div className="font-mono text-xs mt-2 text-muted-foreground">Treasury reward from the live chain</div>
            </div>
            <div className="border-4 border-foreground bg-card p-6 brutal-shadow">
              <div className="font-mono text-sm font-bold uppercase mb-2">Formula</div>
              <div className="text-2xl font-black">{govSharePct ?? 10}% × {govBlocks ?? 10} blocks</div>
              <div className="font-mono text-xs mt-2 text-muted-foreground">
                {rewardLive ? "Source: live ITC explorer" : "Source: fallback (explorer unreachable)"}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="space-y-6">
        <div className="border-4 border-foreground bg-card p-8 brutal-shadow space-y-4">
          <h2 className="text-3xl font-black uppercase">Weekly Digest</h2>
          <p className="font-mono text-sm text-muted-foreground max-w-2xl">
            A once-a-week snapshot of the posts that powered the chain, straight to your inbox.
            No spam, unsubscribe anytime.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 max-w-xl">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.trim())}
              onKeyDown={(e) => e.key === "Enter" && handleSubscribe()}
              placeholder="you@example.com"
              className="border-2 border-foreground rounded-none shadow-none font-mono h-12 flex-1"
              data-testid="input-subscribe-email"
            />
            <Button
              onClick={handleSubscribe}
              disabled={subscribe.isPending || !email.trim()}
              className="border-2 border-foreground rounded-none brutal-shadow h-12 px-8"
              data-testid="button-subscribe"
            >
              {subscribe.isPending ? "Subscribing…" : "Subscribe"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
