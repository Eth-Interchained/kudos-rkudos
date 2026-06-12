import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { requireAdmin } from "../middleware/adminAuth";
import {
  db,
  payoutsTable,
  participantsTable,
  blocksTable,
} from "@workspace/db";
import {
  ListPayoutsResponse,
  ApprovePayoutResponse,
  HoldPayoutResponse,
  BroadcastPayoutsBody,
  BroadcastPayoutsResponse,
} from "@workspace/api-zod";
import { toPayoutDto } from "../services/mappers";
import { getBlockBySeq } from "../services/queries";
import { broadcastApprovedPayouts } from "../services/broadcast";
import { recordAudit } from "../services/audit";

const router: IRouter = Router();

async function loadPayout(id: string) {
  const rows = await db
    .select({ payout: payoutsTable, participant: participantsTable, block: blocksTable })
    .from(payoutsTable)
    .innerJoin(
      participantsTable,
      eq(payoutsTable.participantId, participantsTable.id),
    )
    .innerJoin(blocksTable, eq(payoutsTable.blockId, blocksTable.id))
    .where(eq(payoutsTable.id, id))
    .limit(1);
  return rows[0];
}

router.get("/payouts", async (req, res) => {
  const statusFilter =
    typeof req.query.status === "string" ? req.query.status : undefined;
  const handleFilter =
    typeof req.query.handle === "string"
      ? req.query.handle.replace(/^@/, "")
      : undefined;

  const rows = await db
    .select({ payout: payoutsTable, participant: participantsTable, block: blocksTable })
    .from(payoutsTable)
    .innerJoin(
      participantsTable,
      eq(payoutsTable.participantId, participantsTable.id),
    )
    .innerJoin(blocksTable, eq(payoutsTable.blockId, blocksTable.id));

  const filtered = rows.filter(
    (r) =>
      (!statusFilter || r.payout.status === statusFilter) &&
      (!handleFilter || r.participant.xHandle === handleFilter),
  );

  res.json(
    ListPayoutsResponse.parse(
      filtered.map((r) =>
        toPayoutDto(r.payout, r.block.seq, r.participant.xHandle),
      ),
    ),
  );
});

router.post("/payouts/:id/approve", requireAdmin, async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const row = await loadPayout(id);
  if (!row) {
    res.status(404).json({ error: "Payout not found" });
    return;
  }
  // Only un-disbursed payouts may be approved. Block re-approval of payouts
  // that are already in-flight or paid (broadcasting/broadcast/confirmed/paid),
  // which would otherwise allow a second broadcast and double-pay.
  if (!["held", "pending"].includes(row.payout.status)) {
    res.status(409).json({
      error: `Payout cannot be approved from status "${row.payout.status}"`,
    });
    return;
  }
  const updated = await db
    .update(payoutsTable)
    .set({ status: "approved", approvedBy: "operator", holdReason: null })
    .where(
      and(
        eq(payoutsTable.id, id),
        inArray(payoutsTable.status, ["held", "pending"]),
      ),
    )
    .returning();
  if (updated.length === 0) {
    res.status(409).json({ error: "Payout is no longer approvable" });
    return;
  }
  await recordAudit({
    actor: "operator",
    action: "payout.approved",
    entity: "payout",
    entityId: id,
    detail: { handle: row.participant.xHandle, amountItc: row.payout.amountItc },
  });
  res.json(
    ApprovePayoutResponse.parse(
      toPayoutDto(updated[0], row.block.seq, row.participant.xHandle),
    ),
  );
});

router.post("/payouts/:id/hold", requireAdmin, async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const row = await loadPayout(id);
  if (!row) {
    res.status(404).json({ error: "Payout not found" });
    return;
  }
  // Only un-disbursed payouts may be held. Blocking a hold on payouts that are
  // already in-flight or paid (broadcasting/broadcast/confirmed/paid) prevents a
  // status regression that would let them be re-approved and re-broadcast,
  // which would double-pay.
  if (!["pending", "approved"].includes(row.payout.status)) {
    res.status(409).json({
      error: `Payout cannot be held from status "${row.payout.status}"`,
    });
    return;
  }
  const updated = await db
    .update(payoutsTable)
    .set({ status: "held", holdReason: "manual_hold" })
    .where(
      and(
        eq(payoutsTable.id, id),
        inArray(payoutsTable.status, ["pending", "approved"]),
      ),
    )
    .returning();
  if (updated.length === 0) {
    res.status(409).json({ error: "Payout is no longer holdable" });
    return;
  }
  await recordAudit({
    actor: "operator",
    action: "payout.held",
    entity: "payout",
    entityId: id,
    detail: { handle: row.participant.xHandle, amountItc: row.payout.amountItc },
  });
  res.json(
    HoldPayoutResponse.parse(
      toPayoutDto(updated[0], row.block.seq, row.participant.xHandle),
    ),
  );
});

router.post("/payouts/broadcast", requireAdmin, async (req, res) => {
  const body = BroadcastPayoutsBody.parse(req.body);
  const block = await getBlockBySeq(body.blockSeq);
  if (!block) {
    res.status(400).json({ error: "Block not found" });
    return;
  }

  const result = await broadcastApprovedPayouts(block, "operator", req.log);
  if (!result) {
    res
      .status(400)
      .json({ error: "No approved, wallet-bound payouts to broadcast" });
    return;
  }

  res.json(BroadcastPayoutsResponse.parse(result));
});

export default router;
