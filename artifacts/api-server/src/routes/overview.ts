import { Router, type IRouter } from "express";
import {
  db,
  blocksTable,
  repliesTable,
  participantsTable,
  payoutsTable,
} from "@workspace/db";
import { GetOverviewResponse, GetTreasuryResponse } from "@workspace/api-zod";
import { treasuryConfig } from "../services/config";

const router: IRouter = Router();

const CONFIRMED = new Set(["broadcast", "confirmed", "paid"]);

router.get("/overview", async (_req, res) => {
  const blocks = await db.select().from(blocksTable);
  const replies = await db
    .select({ status: repliesTable.status, flagged: repliesTable.flagged })
    .from(repliesTable);
  const participants = await db
    .select({ id: participantsTable.id })
    .from(participantsTable);
  const payouts = await db
    .select({ status: payoutsTable.status, amountItc: payoutsTable.amountItc })
    .from(payoutsTable);

  const data = GetOverviewResponse.parse({
    totalBlocks: blocks.length,
    openBlocks: blocks.filter((b) => b.status === "open").length,
    settledBlocks: blocks.filter((b) => b.status === "settled").length,
    totalParticipants: participants.length,
    totalReplies: replies.length,
    validReplies: replies.filter((r) => r.status === "valid").length,
    rejectedReplies: replies.filter((r) => r.status === "rejected").length,
    flaggedReplies: replies.filter((r) => r.flagged).length,
    totalRewardItc: blocks.reduce((s, b) => s + b.rewardItc, 0),
    totalPaidItc: payouts
      .filter((p) => CONFIRMED.has(p.status))
      .reduce((s, p) => s + p.amountItc, 0),
    pendingReview: payouts.filter((p) => p.status === "held").length,
  });
  res.json(data);
});

router.get("/treasury", async (_req, res) => {
  const cfg = treasuryConfig();
  const payouts = await db
    .select({
      status: payoutsTable.status,
      amountItc: payoutsTable.amountItc,
      paidAt: payoutsTable.paidAt,
    })
    .from(payoutsTable);

  const sumWhere = (pred: (s: string) => boolean) =>
    payouts.filter((p) => pred(p.status)).reduce((s, p) => s + p.amountItc, 0);

  const today = new Date().toISOString().slice(0, 10);
  const dailySpentItc = payouts
    .filter((p) => CONFIRMED.has(p.status) && (p.paidAt ?? "").slice(0, 10) === today)
    .reduce((s, p) => s + p.amountItc, 0);

  const data = GetTreasuryResponse.parse({
    hotWalletBalanceItc: cfg.hotWalletBalanceItc,
    dailyCapItc: cfg.dailyCapItc,
    dailySpentItc,
    autoApproveUnderItc: cfg.autoApproveUnderItc,
    perAccountCapItc: cfg.perAccountCapItc,
    pendingItc: sumWhere((s) => s === "pending"),
    approvedItc: sumWhere((s) => s === "approved"),
    confirmedItc: sumWhere((s) => CONFIRMED.has(s)),
    heldItc: sumWhere((s) => s === "held"),
  });
  res.json(data);
});

export default router;
