import { and, eq, isNotNull, inArray } from "drizzle-orm";
import type { Logger } from "pino";
import { db, payoutsTable, type Block } from "@workspace/db";
import { sendBatchPsbt, BroadcastAmbiguousError } from "./integrations/itc";
import { recordAudit } from "./audit";

export interface BroadcastResult {
  batchTxid: string;
  recipients: number;
  totalItc: number;
}

/**
 * Disburse a block's approved, wallet-bound payouts in a single on-chain
 * transaction. Returns null when there is nothing to broadcast.
 *
 * Concurrency-safe: payouts are atomically claimed (approved -> broadcasting)
 * before the send, so a concurrent caller (e.g. the manual route racing the
 * scheduler's auto-broadcast) finds nothing left to claim and cannot double-pay.
 *
 * Failure handling is outcome-aware to avoid double-pays:
 *  - A pre-broadcast failure (funding/signing/finalizing) means nothing hit the
 *    network, so the claim is released back to "approved" for a safe retry.
 *  - A BroadcastAmbiguousError (failure at/after sendrawtransaction) means the
 *    tx MAY already be on-chain, so the rows are deliberately LEFT in
 *    "broadcasting" (never released) and flagged for manual reconciliation.
 */
export async function broadcastApprovedPayouts(
  block: Block,
  actor: string,
  log?: Logger,
): Promise<BroadcastResult | null> {
  const claimed = await db
    .update(payoutsTable)
    .set({ status: "broadcasting" })
    .where(
      and(
        eq(payoutsTable.blockId, block.id),
        eq(payoutsTable.status, "approved"),
        isNotNull(payoutsTable.itcAddress),
      ),
    )
    .returning();

  if (claimed.length === 0) return null;

  const claimedIds = claimed.map((p) => p.id);

  let txid: string;
  try {
    txid = await sendBatchPsbt(
      claimed.map((p) => ({
        address: p.itcAddress as string,
        amountItc: p.amountItc,
      })),
      `social-mining block #${block.seq}`,
      log,
    );
  } catch (err) {
    if (err instanceof BroadcastAmbiguousError) {
      // Uncertain outcome: the tx may already be on-chain. Do NOT release the
      // claim — releasing to "approved" would let a retry double-pay. Leave the
      // rows stuck in "broadcasting" and record the incident for an operator to
      // reconcile (look up the wallet's recent txs, then finalize or release).
      await recordAudit({
        actor,
        action: "payouts.broadcast_uncertain",
        entity: "block",
        entityId: block.id,
        detail: {
          blockSeq: block.seq,
          payoutIds: claimedIds,
          error: err.message,
        },
      });
      throw err;
    }
    // Definite pre-broadcast failure: nothing was sent, so release the claim so
    // the batch can be safely retried.
    await db
      .update(payoutsTable)
      .set({ status: "approved" })
      .where(inArray(payoutsTable.id, claimedIds));
    throw err;
  }

  const totalItc = claimed.reduce((s, p) => s + p.amountItc, 0);
  const now = new Date().toISOString();

  await db
    .update(payoutsTable)
    .set({ status: "broadcast", batchTxid: txid, confirmations: 1, paidAt: now })
    .where(inArray(payoutsTable.id, claimedIds));

  await recordAudit({
    actor,
    action: "payouts.broadcast",
    entity: "block",
    entityId: block.id,
    detail: { blockSeq: block.seq, txid, recipients: claimed.length, totalItc },
  });

  return { batchTxid: txid, recipients: claimed.length, totalItc };
}
