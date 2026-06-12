import { eq } from "drizzle-orm";
import { db, subscribersTable } from "@workspace/db";
import { recordAudit } from "./audit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SubscribeOutcome {
  ok: boolean;
  status: "active" | "invalid";
}

/**
 * Opt an email into the weekly digest. Idempotent: re-subscribing an existing
 * address reactivates it instead of creating a duplicate. Returns
 * `{ ok: false, status: "invalid" }` for malformed input so callers (e.g. the
 * optional email on wallet bind) can ignore it without failing their own flow.
 */
export async function subscribeEmail(
  rawEmail: string,
  actor?: string,
): Promise<SubscribeOutcome> {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { ok: false, status: "invalid" };
  }

  const existing = await db
    .select()
    .from(subscribersTable)
    .where(eq(subscribersTable.email, email))
    .limit(1);

  if (existing.length > 0) {
    if (existing[0].status !== "active") {
      await db
        .update(subscribersTable)
        .set({ status: "active", unsubscribedAt: null })
        .where(eq(subscribersTable.id, existing[0].id));
    }
    return { ok: true, status: "active" };
  }

  await db.insert(subscribersTable).values({ email });
  await recordAudit({
    actor: actor ?? email,
    action: "subscriber.subscribed",
    entity: "subscriber",
  });
  return { ok: true, status: "active" };
}
