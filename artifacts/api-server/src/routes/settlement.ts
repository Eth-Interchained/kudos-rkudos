import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "../middleware/adminAuth";
import {
  db,
  blocksTable,
  payoutsTable,
  participantsTable,
  settlementsTable,
} from "@workspace/db";
import { SettleBlockResponse, GetSettlementResponse } from "@workspace/api-zod";
import { getBlockBySeq, buildSettlementProof } from "../services/queries";
import { settleBlock } from "../services/settlement";
import { toPayoutDto } from "../services/mappers";

const router: IRouter = Router();

function parseSeq(raw: string | string[]): number | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

router.post("/blocks/:seq/settle", requireAdmin, async (req, res) => {
  const seq = parseSeq(req.params.seq);
  if (seq === null) {
    res.status(400).json({ error: "Invalid block sequence" });
    return;
  }
  const block = await getBlockBySeq(seq);
  if (!block) {
    res.status(400).json({ error: "Block not found" });
    return;
  }
  if (block.status !== "closed" && block.status !== "settled") {
    res.status(400).json({
      error: `Block must be "closed" to settle (currently "${block.status}")`,
    });
    return;
  }

  const loadPayouts = () =>
    db
      .select({ payout: payoutsTable, participant: participantsTable })
      .from(payoutsTable)
      .innerJoin(
        participantsTable,
        eq(payoutsTable.participantId, participantsTable.id),
      )
      .where(eq(payoutsTable.blockId, block.id));

  const respondWithSettlement = async () => {
    const existing = await db
      .select()
      .from(settlementsTable)
      .where(eq(settlementsTable.blockId, block.id))
      .limit(1);
    const settlement = existing[0];
    if (!settlement) return false;
    const payoutRows = await loadPayouts();
    res.json(
      SettleBlockResponse.parse({
        blockId: block.id,
        totalHashpower: settlement.totalHashpower,
        validMiners: settlement.validMiners,
        merkleRoot: settlement.merkleRoot,
        anchorTxid: settlement.anchorTxid,
        payouts: payoutRows.map(({ payout, participant }) =>
          toPayoutDto(payout, block.seq, participant.xHandle),
        ),
      }),
    );
    return true;
  };

  // Idempotent: an already-settled block returns its frozen settlement instead
  // of re-running distribution and minting a fresh anchor txid each call.
  if (block.status === "settled") {
    if (await respondWithSettlement()) return;
    res
      .status(409)
      .json({ error: "Block marked settled but settlement is missing" });
    return;
  }

  // Single-flight: atomically claim the closed->settled transition. Only the
  // request that wins the compare-and-set runs distribution + anchoring; a
  // concurrent settle finds zero rows claimed and never double-anchors.
  const claimed = await db
    .update(blocksTable)
    .set({ status: "settled", settledAt: new Date().toISOString() })
    .where(and(eq(blocksTable.id, block.id), eq(blocksTable.status, "closed")))
    .returning();

  if (claimed.length === 0) {
    if (await respondWithSettlement()) return;
    res
      .status(409)
      .json({ error: "Settlement already in progress for this block" });
    return;
  }

  let outcome;
  try {
    outcome = await settleBlock(block, req.log);
  } catch (err) {
    // Anchoring/distribution failed: release the claim so settle can be retried.
    await db
      .update(blocksTable)
      .set({ status: "closed", settledAt: null })
      .where(eq(blocksTable.id, block.id));
    throw err;
  }

  const payoutRows = await loadPayouts();

  res.json(
    SettleBlockResponse.parse({
      blockId: outcome.blockId,
      totalHashpower: outcome.totalHashpower,
      validMiners: outcome.validMiners,
      merkleRoot: outcome.merkleRoot,
      anchorTxid: outcome.anchorTxid,
      payouts: payoutRows.map(({ payout, participant }) =>
        toPayoutDto(payout, block.seq, participant.xHandle),
      ),
    }),
  );
});

router.get("/blocks/:seq/settlement", async (req, res) => {
  const seq = parseSeq(req.params.seq);
  if (seq === null) {
    res.status(404).json({ error: "Invalid block sequence" });
    return;
  }
  const block = await getBlockBySeq(seq);
  if (!block) {
    res.status(404).json({ error: "Block not found" });
    return;
  }
  const proof = await buildSettlementProof(block);
  if (!proof) {
    res.status(404).json({ error: "Block not settled yet" });
    return;
  }
  res.json(GetSettlementResponse.parse(proof));
});

export default router;
