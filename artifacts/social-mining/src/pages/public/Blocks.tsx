import { useListBlocks } from "@workspace/api-client-react";
import { Link } from "wouter";

export default function Blocks() {
  const { data: blocks, isLoading } = useListBlocks();

  if (isLoading) return <div>Loading...</div>;

  const mining = blocks?.filter((b) => b.postMode !== "imported") ?? [];
  const imported = blocks?.filter((b) => b.postMode === "imported") ?? [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-500">
      <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter border-b-4 border-foreground pb-4 break-words">Mining Blocks</h1>

      <div className="grid gap-6">
        {mining.map((block) => (
          <Link key={block.id} href={`/blocks/${block.seq}`} className="block">
            <div className="border-4 border-foreground bg-card p-4 md:p-6 brutal-shadow flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 hover:bg-secondary/10 transition-colors">
              <div className="space-y-2 min-w-0">
                <div className="flex flex-wrap items-center gap-2 md:gap-3 font-mono text-xs md:text-sm font-bold uppercase">
                  <span className="bg-foreground text-background px-2 py-1">#{block.seq}</span>
                  <span className="text-primary">{block.status}</span>
                </div>
                <h2 className="text-xl md:text-2xl font-black uppercase break-words">{block.title}</h2>
                <p className="text-muted-foreground break-words">{block.topic}</p>
              </div>
              <div className="flex shrink-0 flex-row items-baseline gap-2 md:flex-col md:items-end md:gap-0 md:text-right">
                <div className="text-2xl md:text-3xl font-black text-primary break-words">{block.rewardItc} ITC</div>
                <div className="font-mono text-xs md:text-sm text-muted-foreground">Reward Pool</div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {imported.length > 0 && (
        <div className="space-y-6 pt-4">
          <div className="border-b-4 border-foreground pb-4">
            <h2 className="text-3xl font-black uppercase tracking-tighter">Past Posts</h2>
            <p className="font-mono text-sm text-muted-foreground mt-1">
              Imported @interchained history — the genesis of the chain. Each carries its
              halving subsidy and is awaiting settlement.
            </p>
          </div>
          <div className="grid gap-4">
            {imported.map((block) => (
              <Link key={block.id} href={`/blocks/${block.seq}`} className="block">
                <div className="border-4 border-foreground bg-muted/30 p-4 brutal-shadow flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 hover:bg-secondary/10 transition-colors">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="bg-foreground text-background px-2 py-1 font-mono text-xs font-bold shrink-0">#{block.seq}</span>
                    <span className="font-bold break-words">{block.title}</span>
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                    <span className="font-mono text-sm font-black text-primary break-words">{block.rewardItc} ITC</span>
                    <span className="font-mono text-xs uppercase border-2 border-foreground px-2 py-1 bg-card shrink-0">{block.status}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
