import { useListAbuseEvents } from "@workspace/api-client-react";

export default function AbuseEvents() {
  const { data: events } = useListAbuseEvents();

  return (
    <div className="space-y-8 animate-in fade-in">
      <h1 className="text-4xl font-black uppercase border-b-4 border-foreground pb-4 text-destructive">Abuse Events</h1>
      
      <div className="space-y-4">
        {events?.length === 0 ? (
          <div className="p-8 text-center font-mono font-bold uppercase border-4 border-foreground bg-card brutal-shadow">No events</div>
        ) : (
          events?.map((e) => (
            <div key={e.id} className="border-4 border-destructive bg-destructive/5 p-4 brutal-shadow font-mono text-sm">
              <div className="flex gap-4 font-bold uppercase mb-2">
                <span className="text-destructive">{e.kind}</span>
                <span className="text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</span>
              </div>
              <div>Handle: @{e.handle}</div>
              <div className="text-muted-foreground mt-1">{e.detail}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
