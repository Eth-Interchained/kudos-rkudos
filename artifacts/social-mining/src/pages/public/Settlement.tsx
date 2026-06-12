import { useGetSettlement, getGetSettlementQueryKey } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { formatItc, formatHash, formatDate } from "@/lib/utils";

export default function Settlement() {
  const params = useParams();
  const seq = parseInt(params.seq || "0", 10);
  
  const { data: proof, isLoading } = useGetSettlement(seq, { query: { enabled: !!seq, queryKey: getGetSettlementQueryKey(seq) } });

  if (isLoading) return <div className="p-8 text-center font-mono">Loading settlement...</div>;
  if (!proof) return <div className="p-8 text-center font-mono text-destructive">Settlement not found</div>;

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="border-4 border-foreground p-8 bg-card brutal-shadow space-y-6">
        <h1 className="text-3xl font-black uppercase">Settlement Proof: Block #{proof.blockSeq}</h1>
        
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2 p-4 border-2 border-foreground bg-secondary/20">
            <div className="text-sm font-bold uppercase text-muted-foreground">Merkle Root</div>
            <div className="font-mono text-xs break-all">{proof.merkleRoot}</div>
          </div>
          <div className="space-y-2 p-4 border-2 border-foreground bg-primary/10">
            <div className="text-sm font-bold uppercase text-muted-foreground">Anchor TXID</div>
            <div className="font-mono text-xs break-all text-primary">{proof.anchorTxid || "Pending"}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 pt-4">
          <div className="bg-foreground text-background px-4 py-2 font-mono font-bold">
            Total Reward: {formatItc(proof.rewardItc)} ITC
          </div>
          <div className="border-2 border-foreground px-4 py-2 font-mono font-bold">
            Valid Miners: {proof.validMiners}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-black uppercase tracking-tighter">Merkle Leaves</h2>
        <div className="border-4 border-foreground bg-card overflow-x-auto brutal-shadow">
          <table className="w-full text-left font-mono">
            <thead className="bg-muted border-b-4 border-foreground uppercase text-sm">
              <tr>
                <th className="p-4 border-r-4 border-foreground">Handle</th>
                <th className="p-4 border-r-4 border-foreground">ITC Address</th>
                <th className="p-4 border-r-4 border-foreground">Amount</th>
                <th className="p-4">Leaf Hash</th>
              </tr>
            </thead>
            <tbody>
              {proof.leaves?.map((leaf, i) => (
                <tr key={i} className="border-b-4 border-foreground last:border-b-0 hover:bg-muted/50">
                  <td className="p-4 border-r-4 border-foreground font-bold">@{leaf.handle}</td>
                  <td className="p-4 border-r-4 border-foreground text-xs">{formatHash(leaf.itcAddress)}</td>
                  <td className="p-4 border-r-4 border-foreground text-primary font-bold">{formatItc(leaf.amountItc)}</td>
                  <td className="p-4 text-xs text-muted-foreground">{formatHash(leaf.leafHash)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
