import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { requireAdmin } from "../middleware/adminAuth";
import {
  db,
  blocksTable,
  repliesTable,
  participantsTable,
} from "@workspace/db";
import {
  ListBlocksResponse,
  ListBlocksResponseItem,
  CreateBlockBody,
  GetBlockResponse,
  AdvanceBlockBody,
  AdvanceBlockResponse,
  GetLeaderboardResponse,
  SyncBlockResponse,
  AttachBlockPostBody,
  AttachBlockPostResponse,
  GenerateBlockPostResponse,
} from "@workspace/api-zod";
import { toBlockDto, toReplyDto } from "../services/mappers";
import {
  getBlockBySeq,
  blockCounts,
  buildLeaderboard,
  buildSettlementProof,
} from "../services/queries";
import { recordAudit } from "../services/audit";
import { scoringConfig } from "../services/config";
import { openBlockNow } from "../services/scheduler";
import { syncBlockReplies } from "../services/netrowsSync";
import { generateBlockPost } from "../services/integrations/aias";
import { extractTweetId, extractUsername } from "../services/integrations/netrows";

const router: IRouter = Router();

function parseSeq(raw: string | string[]): number | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

router.get("/blocks", async (req, res) => {
  const statusFilter =
    typeof req.query.status === "string" ? req.query.status : undefined;
  const rows = await db.select().from(blocksTable).orderBy(desc(blocksTable.seq));
  const filtered = statusFilter
    ? rows.filter((b) => b.status === statusFilter)
    : rows;
  const dtos = await Promise.all(
    filtered.map(async (b) => toBlockDto(b, await blockCounts(b.id))),
  );
  res.json(ListBlocksResponse.parse(dtos));
});

router.post("/blocks", requireAdmin, async (req, res) => {
  const body = CreateBlockBody.parse(req.body);
  const maxRow = await db
    .select({ seq: blocksTable.seq })
    .from(blocksTable)
    .orderBy(desc(blocksTable.seq))
    .limit(1);
  const nextSeq = (maxRow[0]?.seq ?? 0) + 1;
  const cfg = scoringConfig();

  const inserted = await db
    .insert(blocksTable)
    .values({
      seq: nextSeq,
      title: body.title,
      topic: body.topic,
      rewardItc: body.rewardItc,
      requiredKeywords: body.requiredKeywords ?? [],
      bonusKeywords: body.bonusKeywords ?? [],
      sponsor: body.sponsor ?? null,
      perAccountCapItc: body.perAccountCapItc ?? null,
      qualityFloor: cfg.defaultQualityFloor,
      trustFloor: cfg.defaultTrustFloor,
      status: "draft",
    })
    .returning();

  await recordAudit({
    action: "block.created",
    entity: "block",
    entityId: inserted[0].id,
    detail: { seq: nextSeq, title: body.title },
  });

  res
    .status(201)
    .json(
      ListBlocksResponseItem.parse(
        toBlockDto(inserted[0], { replyCount: 0, validCount: 0 }),
      ),
    );
});

router.get("/blocks/:seq", async (req, res) => {
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

  const replyRows = await db
    .select({ reply: repliesTable, participant: participantsTable })
    .from(repliesTable)
    .innerJoin(
      participantsTable,
      eq(repliesTable.participantId, participantsTable.id),
    )
    .where(eq(repliesTable.blockId, block.id));

  const replies = replyRows
    .sort((a, b) => b.reply.socialHashpower - a.reply.socialHashpower)
    .map(({ reply, participant }) => toReplyDto(reply, participant));
  const leaderboard = await buildLeaderboard(block);
  const settlement = await buildSettlementProof(block);
  const counts = await blockCounts(block.id);

  res.json(
    GetBlockResponse.parse({
      block: toBlockDto(block, counts),
      replies,
      leaderboard,
      settlement,
    }),
  );
});

const TRANSITIONS: Record<string, { from: string[]; to: string }> = {
  schedule: { from: ["draft"], to: "scheduled" },
  post: { from: ["draft", "scheduled"], to: "open" },
  close: { from: ["open"], to: "closed" },
};

router.post("/blocks/:seq/lifecycle", requireAdmin, async (req, res) => {
  const seq = parseSeq(req.params.seq);
  if (seq === null) {
    res.status(400).json({ error: "Invalid block sequence" });
    return;
  }
  const body = AdvanceBlockBody.parse(req.body);
  const block = await getBlockBySeq(seq);
  if (!block) {
    res.status(400).json({ error: "Block not found" });
    return;
  }
  const transition = TRANSITIONS[body.action];
  if (!transition) {
    res.status(400).json({ error: `Unknown action: ${body.action}` });
    return;
  }
  if (!transition.from.includes(block.status)) {
    res.status(400).json({
      error: `Cannot ${body.action} a block in status "${block.status}"`,
    });
    return;
  }

  // Posting a block cooks AiAS content + (auto-)publishes to X via openBlockNow.
  if (body.action === "post") {
    const opened = await openBlockNow(block, req.log);
    const counts = await blockCounts(block.id);
    res.json(AdvanceBlockResponse.parse(toBlockDto(opened, counts)));
    return;
  }

  const patch: Record<string, unknown> = { status: transition.to };
  const now = new Date().toISOString();
  if (transition.to === "closed") patch.closesAt = now;

  const updated = await db
    .update(blocksTable)
    .set(patch)
    .where(eq(blocksTable.id, block.id))
    .returning();

  await recordAudit({
    action: `block.${body.action}`,
    entity: "block",
    entityId: block.id,
    detail: { seq: block.seq, from: block.status, to: transition.to },
  });

  const counts = await blockCounts(block.id);
  res.json(AdvanceBlockResponse.parse(toBlockDto(updated[0], counts)));
});

// Manually trigger a NetRows reply sync for a block.
router.post("/blocks/:seq/sync-netrows", requireAdmin, async (req, res) => {
  const seq = parseSeq(req.params.seq);
  if (seq === null) {
    res.status(400).json({ error: "Invalid block sequence" });
    return;
  }
  const block = await getBlockBySeq(seq);
  if (!block) {
    res.status(404).json({ error: "Block not found" });
    return;
  }
  const result = await syncBlockReplies(block, "admin", req.log);
  res.json(SyncBlockResponse.parse(result));
});

// (Re)generate the AiAS-authored post content for a block.
router.post("/blocks/:seq/generate-post", requireAdmin, async (req, res) => {
  const seq = parseSeq(req.params.seq);
  if (seq === null) {
    res.status(400).json({ error: "Invalid block sequence" });
    return;
  }
  const block = await getBlockBySeq(seq);
  if (!block) {
    res.status(404).json({ error: "Block not found" });
    return;
  }
  const content = await generateBlockPost(
    {
      seq: block.seq,
      title: block.title,
      topic: block.topic,
      requiredKeywords: block.requiredKeywords ?? [],
      bonusKeywords: block.bonusKeywords ?? [],
      sponsor: block.sponsor,
    },
    req.log,
  );
  const updated = await db
    .update(blocksTable)
    .set({ postContent: content })
    .where(eq(blocksTable.id, block.id))
    .returning();
  await recordAudit({
    action: "block.generate_post",
    entity: "block",
    entityId: block.id,
    detail: { seq: block.seq },
  });
  const counts = await blockCounts(block.id);
  res.json(GenerateBlockPostResponse.parse(toBlockDto(updated[0], counts)));
});

// Attach the URL of a post an admin published manually (semi-automated mode).
router.post("/blocks/:seq/attach-post", requireAdmin, async (req, res) => {
  const seq = parseSeq(req.params.seq);
  if (seq === null) {
    res.status(400).json({ error: "Invalid block sequence" });
    return;
  }
  const body = AttachBlockPostBody.parse(req.body);
  const block = await getBlockBySeq(seq);
  if (!block) {
    res.status(404).json({ error: "Block not found" });
    return;
  }
  const tweetId = extractTweetId(body.xPostUrl);
  const username = extractUsername(body.xPostUrl);
  if (!tweetId || !username) {
    res.status(400).json({
      error:
        "Could not parse a tweet id and author handle from that URL. Use the https://x.com/<handle>/status/<id> form.",
    });
    return;
  }
  const updated = await db
    .update(blocksTable)
    .set({
      xPostId: tweetId,
      xPostUrl: body.xPostUrl,
      xPostedAt: new Date().toISOString(),
      postMode: "manual",
    })
    .where(eq(blocksTable.id, block.id))
    .returning();
  await recordAudit({
    action: "block.attach_post",
    entity: "block",
    entityId: block.id,
    detail: { seq: block.seq, xPostUrl: body.xPostUrl },
  });
  const counts = await blockCounts(block.id);
  res.json(AttachBlockPostResponse.parse(toBlockDto(updated[0], counts)));
});

router.get("/blocks/:seq/leaderboard", async (req, res) => {
  const seq = parseSeq(req.params.seq);
  if (seq === null) {
    res.json(GetLeaderboardResponse.parse([]));
    return;
  }
  const block = await getBlockBySeq(seq);
  if (!block) {
    res.json(GetLeaderboardResponse.parse([]));
    return;
  }
  res.json(GetLeaderboardResponse.parse(await buildLeaderboard(block)));
});

export default router;
