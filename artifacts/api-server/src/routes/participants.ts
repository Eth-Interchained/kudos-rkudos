import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import {
  db,
  participantsTable,
  repliesTable,
  payoutsTable,
  blocksTable,
} from "@workspace/db";
import {
  ListParticipantsResponse,
  GetParticipantResponse,
} from "@workspace/api-zod";
import {
  toParticipantDto,
  toReplyDto,
  toPayoutDto,
} from "../services/mappers";

const router: IRouter = Router();

const CONFIRMED = new Set(["broadcast", "confirmed", "paid"]);

router.get("/participants", async (_req, res) => {
  const rows = await db
    .select()
    .from(participantsTable)
    .orderBy(desc(participantsTable.trustScore));
  res.json(ListParticipantsResponse.parse(rows.map(toParticipantDto)));
});

router.get("/participants/:handle", async (req, res) => {
  const raw = req.params.handle;
  const handle = (Array.isArray(raw) ? raw[0] : raw).replace(/^@/, "");
  const found = await db
    .select()
    .from(participantsTable)
    .where(eq(participantsTable.xHandle, handle))
    .limit(1);
  const participant = found[0];
  if (!participant) {
    res.status(404).json({ error: "Participant not found" });
    return;
  }

  const replyRows = await db
    .select({ reply: repliesTable, block: blocksTable })
    .from(repliesTable)
    .innerJoin(blocksTable, eq(repliesTable.blockId, blocksTable.id))
    .where(eq(repliesTable.participantId, participant.id));

  const payoutRows = await db
    .select({ payout: payoutsTable, block: blocksTable })
    .from(payoutsTable)
    .innerJoin(blocksTable, eq(payoutsTable.blockId, blocksTable.id))
    .where(eq(payoutsTable.participantId, participant.id));

  const totalEarnedItc = payoutRows
    .filter((p) => CONFIRMED.has(p.payout.status))
    .reduce((s, p) => s + p.payout.amountItc, 0);

  res.json(
    GetParticipantResponse.parse({
      participant: toParticipantDto(participant),
      replies: replyRows
        .sort((a, b) => b.reply.socialHashpower - a.reply.socialHashpower)
        .map(({ reply }) => toReplyDto(reply, participant)),
      payouts: payoutRows.map(({ payout, block }) =>
        toPayoutDto(payout, block.seq, participant.xHandle),
      ),
      totalEarnedItc,
    }),
  );
});

export default router;
