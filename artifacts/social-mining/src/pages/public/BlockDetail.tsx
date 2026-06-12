import { useGetBlock, getGetBlockQueryKey, useListReplies, getListRepliesQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { formatItc } from "@/lib/utils";

export default function BlockDetail() {
  const params = useParams();
  const seq = parseInt(params.seq || "0", 10);
  
  const { data: blockData, isLoading: isLoadingBlock } = useGetBlock(seq, { query: { enabled: !!seq, queryKey: getGetBlockQueryKey(seq) } });
  const { data: replies, isLoading: isLoadingReplies } = useListReplies(seq, { query: { enabled: !!seq, queryKey: getListRepliesQueryKey(seq) } });
  
  if (isLoadingBlock) return <div className="p-8 text-center font-mono font-bold uppercase animate-pulse">Loading block data...</div>;
  if (!blockData) return <div className="p-8 text-center font-mono font-bold uppercase text-destructive">Block not found</div>;

  const { block, leaderboard } = blockData;
  const isSettled = block.status === "settled" || block.status === "paid";

  return (
    <div className="space-y-12 animate-in fade-in">
      <div className="border-4 border-foreground p-8 bg-card brutal-shadow space-y-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -z-10 translate-x-1/2 -translate-y-1/2" />
        
        <div className="flex items-center gap-4 font-mono font-bold uppercase">
          <span className="bg-foreground text-background px-3 py-1 text-lg brutal-shadow">#{block.seq}</span>
          <span className="border-2 border-primary text-primary px-3 py-1 text-lg bg-primary/10">{block.status}</span>
        </div>
        <h1 className="text-4xl md:text-6xl font-black uppercase leading-none tracking-tighter">{block.title}</h1>
        <p className="text-xl md:text-2xl border-l-8 border-primary pl-6 py-2 font-medium">{block.topic}</p>
        
        <div className="flex flex-wrap gap-4 pt-6">
          <div className="bg-secondary text-secondary-foreground px-6 py-3 font-mono font-bold border-4 border-foreground brutal-shadow text-lg">
            Reward: {formatItc(block.rewardItc)} ITC
          </div>
          <div className="bg-muted text-muted-foreground px-6 py-3 font-mono font-bold border-4 border-foreground brutal-shadow text-lg">
            Valid Replies: {block.validCount}
          </div>
          {isSettled && (
            <Link href={`/blocks/${block.seq}/settlement`} className="bg-primary text-primary-foreground px-6 py-3 font-mono font-bold border-4 border-foreground brutal-shadow text-lg hover:-translate-y-1 transition-transform inline-block">
              View Settlement Proof →
            </Link>
          )}
        </div>

        <div className="border-t-4 border-foreground pt-6 space-y-4">
          <div className="font-mono text-sm font-bold uppercase text-muted-foreground">Mine This Block</div>
          {block.postContent && (
            <p className="whitespace-pre-wrap font-medium bg-muted/30 border-2 border-foreground p-4 text-base">{block.postContent}</p>
          )}
          <div className="flex flex-wrap gap-4">
            {block.xPostUrl ? (
              <a href={block.xPostUrl} target="_blank" rel="noopener noreferrer" className="bg-foreground text-background px-6 py-3 font-mono font-bold border-4 border-foreground brutal-shadow hover:-translate-y-1 transition-transform inline-block">
                Reply on X →
              </a>
            ) : block.shareUrl ? (
              <a href={block.shareUrl} target="_blank" rel="noopener noreferrer" className="bg-foreground text-background px-6 py-3 font-mono font-bold border-4 border-foreground brutal-shadow hover:-translate-y-1 transition-transform inline-block">
                Share on X →
              </a>
            ) : (
              <span className="px-6 py-3 font-mono font-bold border-4 border-foreground text-muted-foreground bg-muted/30">Post not published yet</span>
            )}
            <a href="https://x.com/intent/follow?screen_name=interchained" target="_blank" rel="noopener noreferrer" className="bg-primary text-primary-foreground px-6 py-3 font-mono font-bold border-4 border-foreground brutal-shadow hover:-translate-y-1 transition-transform inline-block">
              Follow @interchained
            </a>
          </div>
          <p className="font-mono text-xs text-muted-foreground">Follow @interchained, then reply to the post above with your original take to mine ITC.</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <h2 className="text-3xl font-black uppercase tracking-tighter border-b-4 border-foreground pb-2">Top Miners</h2>
          <div className="border-4 border-foreground bg-card brutal-shadow p-0">
            {(!leaderboard || leaderboard.length === 0) ? (
              <div className="p-8 text-center text-muted-foreground font-mono font-bold uppercase">No valid replies yet</div>
            ) : (
              <div className="flex flex-col">
                {leaderboard.map((entry, idx) => (
                  <div key={entry.handle} className={`flex items-center gap-4 p-4 border-b-4 border-foreground last:border-b-0 ${idx === 0 ? 'bg-secondary/20' : ''}`}>
                    <div className={`font-black text-2xl w-8 text-center ${idx === 0 ? 'text-secondary-foreground' : 'text-muted-foreground'}`}>{entry.rank}</div>
                    <div className="flex-1">
                      <Link href={`/participants/${entry.handle}`} className="font-bold hover:text-primary transition-colors text-lg break-all">@{entry.handle}</Link>
                      <div className="font-mono text-xs text-muted-foreground">
                        Q:{entry.qualityScore.toFixed(1)} • T:{entry.trustWeight.toFixed(2)}x
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-primary text-lg">{formatItc(entry.estimatedItc)}</div>
                      <div className="font-mono text-[10px] uppercase text-muted-foreground">Est. ITC</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-3xl font-black uppercase tracking-tighter border-b-4 border-foreground pb-2">Reply Stream</h2>
          
          <div className="space-y-6">
            {isLoadingReplies ? (
              <div className="h-32 bg-muted animate-pulse border-4 border-foreground brutal-shadow" />
            ) : replies?.length === 0 ? (
              <div className="border-4 border-foreground bg-card p-12 text-center brutal-shadow font-mono font-bold uppercase text-muted-foreground">
                No replies processed yet
              </div>
            ) : (
              replies?.map((reply) => (
                <div key={reply.id} className={`border-4 border-foreground bg-card brutal-shadow p-6 space-y-4 ${reply.flagged ? 'border-destructive bg-destructive/5' : ''}`}>
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex items-center gap-3">
                      <Link href={`/participants/${reply.handle}`} className="font-black text-xl hover:text-primary transition-colors">@{reply.handle}</Link>
                      {reply.status === "valid" || reply.status === "settled" ? (
                         <span className="bg-primary text-primary-foreground px-2 py-0.5 text-xs font-mono font-bold uppercase border-2 border-foreground">Valid</span>
                      ) : (
                         <span className="bg-muted text-muted-foreground px-2 py-0.5 text-xs font-mono font-bold uppercase border-2 border-foreground">{reply.status}</span>
                      )}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground text-right">
                      {new Date(reply.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                  
                  <p className="text-lg font-medium whitespace-pre-wrap">{reply.replyText}</p>
                  
                  <div className="bg-muted/30 p-4 border-2 border-foreground grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-sm">
                    <div>
                      <div className="text-muted-foreground uppercase text-[10px] font-bold">Quality</div>
                      <div className="font-black text-lg">{reply.qualityScore.toFixed(1)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground uppercase text-[10px] font-bold">Trust Wgt</div>
                      <div className="font-black text-lg">{reply.trustWeight.toFixed(2)}x</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground uppercase text-[10px] font-bold">Unique</div>
                      <div className="font-black text-lg">{reply.uniqueness.toFixed(2)}x</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground uppercase text-[10px] font-bold">Hashpower</div>
                      <div className="font-black text-lg text-primary">{reply.socialHashpower.toFixed(0)}</div>
                    </div>
                  </div>
                  
                  {reply.status === "invalid" && reply.rejectionReason && (
                    <div className="text-sm font-mono text-destructive font-bold uppercase border-l-4 border-destructive pl-3 py-1">
                      Rejected: {reply.rejectionReason}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
