import { db, auditLogTable } from "@workspace/db";

export async function recordAudit(entry: {
  actor?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  detail?: unknown;
}): Promise<void> {
  await db.insert(auditLogTable).values({
    actor: entry.actor ?? "system",
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    detail:
      entry.detail === undefined
        ? null
        : typeof entry.detail === "string"
          ? entry.detail
          : JSON.stringify(entry.detail),
  });
}
