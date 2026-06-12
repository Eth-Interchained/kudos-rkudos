import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { requireAdmin } from "../middleware/adminAuth";
import { db, auditLogTable } from "@workspace/db";
import { ListAuditLogResponse } from "@workspace/api-zod";
import { toAuditDto } from "../services/mappers";

const router: IRouter = Router();

router.get("/audit", requireAdmin, async (req, res) => {
  const limit =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const rows = await db
    .select()
    .from(auditLogTable)
    .orderBy(desc(auditLogTable.id))
    .limit(Number.isInteger(limit) && limit > 0 ? Math.min(limit, 1000) : 200);
  res.json(ListAuditLogResponse.parse(rows.map(toAuditDto)));
});

export default router;
