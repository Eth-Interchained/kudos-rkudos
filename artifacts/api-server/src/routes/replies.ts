import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middleware/adminAuth";
import { db, repliesTable, participantsTable } from "@workspace/db";
import {
  ListRepliesResponse,
  ListRepliesResponseItem,
  SubmitReplyBody,
} from "@workspace/api-zod";
import { toReplyDto } from "../services/mappers";
import { getBlockBySeq } from "../services/queries";
import {
  ingestAndScoreReply,
  DuplicateReplyError,
  ScoringUnavailableError,
} from "../services/replyPipeline";

const router: IRouter = Router();

function parseSeq(raw: string | string[]): number | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(s);
  // Block 0 (earliest imported post) is a real, settleable block, so its
  // replies endpoints must accept seq >= 0 like the blocks/settlement routes.
  return Number.isInteger(n) && n >= 0 ? n : null;
}

router.get("/blocks/:seq/replies", async (req, res) => {
  const seq = parseSeq(req.params.seq);
  if (seq === null) {
    res.json(ListRepliesResponse.parse([]));
    return;
  }
  const block = await getBlockBySeq(seq);
  if (!block) {
    res.json(ListRepliesResponse.parse([]));
    return;
  }
  const rows = await db
    .select({ reply: repliesTable, participant: participantsTable })
    .from(repliesTable)
    .innerJoin(
      participantsTable,
      eq(repliesTable.participantId, participantsTable.id),
    )
    .where(eq(repliesTable.blockId, block.id));
  const dtos = rows
    .sort((a, b) => b.reply.socialHashpower - a.reply.socialHashpower)
    .map(({ reply, participant }) => toReplyDto(reply, participant));
  res.json(ListRepliesResponse.parse(dtos));
});

router.post("/blocks/:seq/replies", requireAdmin, async (req, res) => {
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
  if (block.status !== "open") {
    res
      .status(400)
      .json({ error: `Block is "${block.status}"; replies require an open block` });
    return;
  }

  const body = SubmitReplyBody.parse(req.body);
  try {
    // Identity/trust inputs (followers, verified, account age) are sourced only
    // from the trusted X adapter inside the pipeline — never from the client —
    // so callers cannot inflate their own trust_weight or reach_factor.
    const result = await ingestAndScoreReply(
      block,
      {
        handle: body.handle,
        replyText: body.replyText,
      },
      req.log,
    );
    if (!result) {
      res.status(502).json({ error: "Scoring unavailable; reply not ingested" });
      return;
    }
    const { reply, participant } = result;
    res
      .status(201)
      .json(ListRepliesResponseItem.parse(toReplyDto(reply, participant)));
  } catch (err) {
    if (err instanceof DuplicateReplyError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof ScoringUnavailableError) {
      res.status(502).json({ error: err.message });
      return;
    }
    throw err;
  }
});

export default router;
