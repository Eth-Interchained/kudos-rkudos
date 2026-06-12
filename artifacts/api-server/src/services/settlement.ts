import { eq } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  blocksTable,
  repliesTable,
  participantsTable,
  payoutsTable,
  settlementsTable,
  type Block,
} from "@workspace/db";
import { buildMerkle, type MerkleLeafInput } from "./merkle";
import { anchorMerkleRoot } from "./integrations/itc";
import { treasuryConfig } from "./config";
import { recordAudit } from "./audit";
import { getRewardsEnabled } from "./settings";

const floor8 = (n: number) => Math.floor(n * 1e8) / 1e8;

export interface SettlementOutcome {
  blockId: string;
  totalHashpower: number;
  validMiners: number;
  merkleRoot: string;
  anchorTxid: string | null;
  anchorMode: "rpc" | "simulated";
}

/**
 * Settle a closed block: distribute reward pro-rata by social_hashpower,
 * apply per-account caps, build + anchor the merkle proof, and create payouts
 * (auto-approved when small + bound, held for HITL otherwise).
 */
export async function settleBlock(block: Block, log?: Logger): Promise<SettlementOutcome> {
  // Master pause switch: no distribution happens while rewards are disabled.
  if (!(await getRewardsEnabled())) {
    throw new Error(
      "Rewards are paused (rewardsEnabled=false); enable rewards in the console before settling.",
    );
  }
  const treasury = treasuryConfig();
  const perAccountCap = block.perAccountCapItc ?? treasury.perAccountCapItc;

  const validRows = await db
    .select({
      reply: repliesTable,
      participant: participantsTable,
    })
    .from(repliesTable)
    .innerJoin(
      participantsTable,
      eq(repliesTable.participantId, participantsTable.id),
    )
    .where(eq(repliesTable.blockId, block.id));

  const valid = validRows.filter((r) => r.reply.status === "valid");
  const totalHashpower = valid.reduce(
    (sum, r) => sum + r.reply.socialHashpower,
    0,
  );

  const leaves: MerkleLeafInput[] = [];
  const payoutRows: Array<{
    replyId: string;
    participantId: string;
    handle: string;
    itcAddress: string | null;
    amount: number;
    flagged: boolean;
  }> = [];

  if (totalHashpower > 0) {
    for (const { reply, participant } of valid) {
      const share = reply.socialHashpower / totalHashpower;
      const amount = floor8(Math.min(block.rewardItc * share, perAccountCap));
      if (amount <= 0) continue;
      const addr = participant.itcAddress ?? "UNBOUND";
      payoutRows.push({
        replyId: reply.id,
        participantId: participant.id,
        handle: participant.xHandle,
        itcAddress: participant.itcAddress,
        amount,
        flagged: reply.flagged,
      });
      leaves.push({ handle: participant.xHandle, itcAddress: addr, amountItc: amount });
    }
  }

  const { root, leaves: merkleLeaves } = buildMerkle(leaves);
  const frozenLeaves = merkleLeaves.map((l) => ({
    handle: l.handle,
    itcAddress: l.itcAddress,
    amountItc: l.amountItc,
    leafHash: l.leafHash,
  }));
  const anchor = await anchorMerkleRoot(root, log);

  // Persist payouts (idempotent per block+participant).
  for (const p of payoutRows) {
    const idempotencyKey = `${block.id}:${p.participantId}`;
    const bound = Boolean(p.itcAddress);
    const autoApprove =
      bound && !p.flagged && p.amount < treasury.autoApproveUnderItc;
    const status = autoApprove ? "approved" : "held";
    const holdReason = !bound
      ? "wallet_not_bound"
      : p.flagged
        ? "flagged_reply"
        : autoApprove
          ? null
          : "exceeds_auto_approve_threshold";

    const existing = await db
      .select()
      .from(payoutsTable)
      .where(eq(payoutsTable.idempotencyKey, idempotencyKey))
      .limit(1);
    if (existing[0]) continue;

    await db.insert(payoutsTable).values({
      blockId: block.id,
      replyId: p.replyId,
      participantId: p.participantId,
      itcAddress: p.itcAddress,
      amountItc: p.amount,
      idempotencyKey,
      status,
      flagged: p.flagged,
      holdReason,
    });
  }

  await db
    .insert(settlementsTable)
    .values({
      blockId: block.id,
      totalHashpower,
      validMiners: payoutRows.length,
      totalReplies: validRows.length,
      rewardItc: block.rewardItc,
      merkleRoot: root,
      leaves: frozenLeaves,
      anchorTxid: anchor.txid,
      anchorMode: anchor.mode,
    })
    .onConflictDoUpdate({
      target: settlementsTable.blockId,
      set: {
        totalHashpower,
        validMiners: payoutRows.length,
        totalReplies: validRows.length,
        rewardItc: block.rewardItc,
        merkleRoot: root,
        leaves: frozenLeaves,
        anchorTxid: anchor.txid,
        anchorMode: anchor.mode,
        computedAt: new Date().toISOString(),
      },
    });

  await db
    .update(blocksTable)
    .set({ status: "settled", settledAt: new Date().toISOString() })
    .where(eq(blocksTable.id, block.id));

  await recordAudit({
    action: "block.settled",
    entity: "block",
    entityId: block.id,
    detail: {
      blockSeq: block.seq,
      totalHashpower,
      validMiners: payoutRows.length,
      merkleRoot: root,
      anchorTxid: anchor.txid,
      anchorMode: anchor.mode,
    },
  });

  return {
    blockId: block.id,
    totalHashpower,
    validMiners: payoutRows.length,
    merkleRoot: root,
    anchorTxid: anchor.txid,
    anchorMode: anchor.mode,
  };
}
