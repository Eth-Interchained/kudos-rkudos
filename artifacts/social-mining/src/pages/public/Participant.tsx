import { useGetParticipant, getGetParticipantQueryKey } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { formatItc } from "@/lib/utils";

export default function Participant() {
  const params = useParams();
  const handle = params.handle || "";
  
  const { data, isLoading } = useGetParticipant(handle, { query: { enabled: !!handle, queryKey: getGetParticipantQueryKey(handle) } });

  if (isLoading) return <div className="p-8 text-center font-mono">Loading profile...</div>;
  if (!data) return <div className="p-8 text-center font-mono text-destructive">Miner not found</div>;

  const { participant, replies, payouts, totalEarnedItc } = data;

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="border-4 border-foreground p-8 bg-card brutal-shadow flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl font-black uppercase">@{participant.xHandle}</h1>
          <div className="flex gap-4 mt-2 text-sm font-mono font-bold text-muted-foreground">
            <span>{participant.followersCount} Followers</span>
            <span>PoH Tier {participant.pohTier}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black text-primary">{formatItc(totalEarnedItc)} ITC</div>
          <div className="text-sm font-mono font-bold text-muted-foreground">Total Earned</div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h2 className="text-2xl font-black uppercase tracking-tighter">Scores</h2>
          <div className="border-4 border-foreground bg-card p-6 brutal-shadow space-y-4">
            <div>
              <div className="flex justify-between mb-1 font-mono text-sm font-bold">
                <span>Trust Score</span>
                <span>{(participant.trustScore * 100).toFixed(0)}%</span>
              </div>
              <div className="h-4 bg-muted border-2 border-foreground w-full">
                <div className="h-full bg-primary border-r-2 border-foreground" style={{ width: `${participant.trustScore * 100}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1 font-mono text-sm font-bold">
                <span>Behavior Score</span>
                <span>{(participant.behaviorScore * 100).toFixed(0)}%</span>
              </div>
              <div className="h-4 bg-muted border-2 border-foreground w-full">
                <div className="h-full bg-secondary border-r-2 border-foreground" style={{ width: `${participant.behaviorScore * 100}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-2xl font-black uppercase tracking-tighter">Identity</h2>
          <div className="border-4 border-foreground bg-card p-6 brutal-shadow space-y-4">
            <div className="flex justify-between items-center border-b-2 border-foreground pb-2">
              <span className="font-bold uppercase text-muted-foreground">Verified</span>
              <span className="font-mono font-bold">{participant.verified ? "YES" : "NO"}</span>
            </div>
            <div className="flex justify-between items-center border-b-2 border-foreground pb-2">
              <span className="font-bold uppercase text-muted-foreground">Banned</span>
              <span className={`font-mono font-bold ${participant.banned ? "text-destructive" : ""}`}>{participant.banned ? "YES" : "NO"}</span>
            </div>
            <div>
              <div className="font-bold uppercase text-muted-foreground mb-1">Bound Address</div>
              <div className="font-mono text-xs break-all bg-muted p-2 border-2 border-foreground">
                {participant.itcAddress || "No address bound"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
