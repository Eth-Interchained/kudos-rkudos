import { useState } from "react";
import { 
  useListPayouts, 
  useApprovePayout, 
  useHoldPayout, 
  useBroadcastPayouts, 
  getListPayoutsQueryKey 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatItc } from "@/lib/utils";

export default function ReviewQueue() {
  const { data: payouts } = useListPayouts({ status: "pending" });
  const approve = useApprovePayout();
  const hold = useHoldPayout();
  const broadcast = useBroadcastPayouts();
  const queryClient = useQueryClient();

  const [broadcastSeq, setBroadcastSeq] = useState("");

  const handleAction = (id: string, action: 'approve' | 'hold') => {
    const mut = action === 'approve' ? approve : hold;
    mut.mutate({ id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListPayoutsQueryKey() })
    });
  };

  const handleBroadcast = () => {
    const seq = parseInt(broadcastSeq, 10);
    if (!seq) return;
    broadcast.mutate({ data: { blockSeq: seq } }, {
      onSuccess: () => {
        setBroadcastSeq("");
        queryClient.invalidateQueries({ queryKey: getListPayoutsQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in">
      <h1 className="text-4xl font-black uppercase border-b-4 border-foreground pb-4">Review Queue</h1>
      
      <div className="border-4 border-foreground bg-card p-6 brutal-shadow flex flex-col md:flex-row gap-4 items-end md:items-center justify-between">
        <div>
          <h2 className="text-xl font-black uppercase">Broadcast Payouts</h2>
          <p className="text-sm font-mono text-muted-foreground">Broadcast all approved payouts for a specific block.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <Input 
            placeholder="Block Seq (e.g. 1)" 
            type="number"
            value={broadcastSeq}
            onChange={(e) => setBroadcastSeq(e.target.value)}
            className="border-2 border-foreground rounded-none shadow-none font-mono w-40"
          />
          <Button 
            onClick={handleBroadcast} 
            disabled={broadcast.isPending || !broadcastSeq}
            className="rounded-none border-2 border-foreground brutal-shadow bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            Broadcast
          </Button>
        </div>
      </div>

      <div className="border-4 border-foreground bg-card overflow-x-auto brutal-shadow">
        <table className="w-full text-left font-mono text-sm">
          <thead className="bg-muted border-b-4 border-foreground uppercase">
            <tr>
              <th className="p-4 border-r-4 border-foreground">Block</th>
              <th className="p-4 border-r-4 border-foreground">Handle</th>
              <th className="p-4 border-r-4 border-foreground">Amount</th>
              <th className="p-4 border-r-4 border-foreground">Status</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {payouts?.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center font-bold uppercase text-muted-foreground">Queue is empty</td></tr>
            ) : (
              payouts?.map((p) => (
                <tr key={p.id} className="border-b-4 border-foreground hover:bg-muted/50 transition-colors">
                  <td className="p-4 border-r-4 border-foreground font-bold text-center">#{p.blockSeq}</td>
                  <td className="p-4 border-r-4 border-foreground font-bold">@{p.handle}</td>
                  <td className="p-4 border-r-4 border-foreground text-primary font-bold">{formatItc(p.amountItc)}</td>
                  <td className="p-4 border-r-4 border-foreground uppercase font-bold text-xs">
                    <span className="bg-muted px-2 py-1 border-2 border-foreground">{p.status}</span>
                  </td>
                  <td className="p-4 flex gap-2">
                    <Button size="sm" onClick={() => handleAction(p.id, 'approve')} className="rounded-none border-2 border-foreground brutal-shadow h-8">Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => handleAction(p.id, 'hold')} className="rounded-none border-2 border-destructive text-destructive hover:bg-destructive hover:text-white brutal-shadow h-8">Hold</Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
