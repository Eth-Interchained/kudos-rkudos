import { useState } from "react";
import { useListPayouts } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { formatItc, formatHash, formatDate } from "@/lib/utils";

export default function Payouts() {
  const [search, setSearch] = useState("");
  const { data: payouts, isLoading } = useListPayouts({ handle: search || undefined });

  return (
    <div className="space-y-8 animate-in fade-in">
      <h1 className="text-4xl font-black uppercase border-b-4 border-foreground pb-4">Payout Lookup</h1>
      
      <div className="max-w-md">
        <Input 
          placeholder="Search by handle..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-4 border-foreground rounded-none shadow-none font-mono text-lg p-6 brutal-shadow focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>

      <div className="border-4 border-foreground bg-card overflow-x-auto brutal-shadow">
        <table className="w-full text-left font-mono">
          <thead className="bg-muted border-b-4 border-foreground uppercase text-sm">
            <tr>
              <th className="p-4 border-r-4 border-foreground">Block</th>
              <th className="p-4 border-r-4 border-foreground">Handle</th>
              <th className="p-4 border-r-4 border-foreground">Amount</th>
              <th className="p-4 border-r-4 border-foreground">Status</th>
              <th className="p-4">TXID</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="p-8 text-center">Loading...</td></tr>
            ) : payouts?.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center text-muted-foreground uppercase font-bold">No payouts found</td></tr>
            ) : (
              payouts?.map((p) => (
                <tr key={p.id} className="border-b-4 border-foreground last:border-b-0 hover:bg-muted/50">
                  <td className="p-4 border-r-4 border-foreground font-bold">#{p.blockSeq}</td>
                  <td className="p-4 border-r-4 border-foreground font-bold">@{p.handle}</td>
                  <td className="p-4 border-r-4 border-foreground text-primary font-bold">{formatItc(p.amountItc)}</td>
                  <td className="p-4 border-r-4 border-foreground uppercase text-xs font-bold">
                    <span className={`px-2 py-1 ${p.status === 'confirmed' ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-muted-foreground'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="p-4 text-xs text-muted-foreground">{formatHash(p.batchTxid)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
