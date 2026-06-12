import { useListAuditLog } from "@workspace/api-client-react";

export default function AuditLog() {
  const { data: logs } = useListAuditLog();

  return (
    <div className="space-y-8 animate-in fade-in">
      <h1 className="text-4xl font-black uppercase border-b-4 border-foreground pb-4">Audit Log</h1>
      
      <div className="border-4 border-foreground bg-card overflow-x-auto brutal-shadow">
        <table className="w-full text-left font-mono text-xs">
          <thead className="bg-muted border-b-4 border-foreground uppercase">
            <tr>
              <th className="p-4 border-r-4 border-foreground w-48">Timestamp</th>
              <th className="p-4 border-r-4 border-foreground w-32">Actor</th>
              <th className="p-4 border-r-4 border-foreground w-48">Action</th>
              <th className="p-4 border-r-4 border-foreground w-48">Entity</th>
              <th className="p-4">Details</th>
            </tr>
          </thead>
          <tbody>
            {logs?.map((log) => (
              <tr key={log.id} className="border-b-4 border-foreground hover:bg-muted/50">
                <td className="p-4 border-r-4 border-foreground whitespace-nowrap">{new Date(log.ts).toLocaleString()}</td>
                <td className="p-4 border-r-4 border-foreground font-bold">{log.actor || 'System'}</td>
                <td className="p-4 border-r-4 border-foreground text-primary font-bold uppercase">{log.action}</td>
                <td className="p-4 border-r-4 border-foreground">{log.entity} {log.entityId}</td>
                <td className="p-4 truncate max-w-[200px]" title={log.detail || ""}>{log.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
