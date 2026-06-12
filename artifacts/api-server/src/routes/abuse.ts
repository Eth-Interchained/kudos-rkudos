import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { requireAdmin } from "../middleware/adminAuth";
import {
  db,
  abuseEventsTable,
  participantsTable,
  blocksTable,
} from "@workspace/db";
import { ListAbuseEventsResponse } from "@workspace/api-zod";
import { toAbuseEventDto } from "../services/mappers";

const router: IRouter = Router();

router.get("/abuse", requireAdmin, async (_req, res) => {
  const rows = await db
    .select({
      event: abuseEventsTable,
      handle: participantsTable.xHandle,
      blockSeq: blocksTable.seq,
    })
    .from(abuseEventsTable)
    .leftJoin(
      participantsTable,
      eq(abuseEventsTable.participantId, participantsTable.id),
    )
    .leftJoin(blocksTable, eq(abuseEventsTable.blockId, blocksTable.id))
    .orderBy(desc(abuseEventsTable.createdAt));

  res.json(
    ListAbuseEventsResponse.parse(
      rows.map((r) =>
        toAbuseEventDto(r.event, {
          handle: r.handle ?? null,
          blockSeq: r.blockSeq ?? null,
        }),
      ),
    ),
  );
});

export default router;
