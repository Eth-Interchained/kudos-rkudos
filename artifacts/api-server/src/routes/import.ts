import { Router, type IRouter } from "express";
import { ImportXPostsResponse } from "@workspace/api-zod";
import { requireAdmin } from "../middleware/adminAuth";
import { importReferencePosts } from "../services/importPosts";
import { recordAudit } from "../services/audit";

const router: IRouter = Router();

/**
 * Import X posts saved by scripts/import_x_posts.py into the blocks table as
 * real reward-earning blocks at the lowest heights (earliest post = block 0),
 * created "closed" and awaiting settlement.
 */
router.post("/admin/import-posts", requireAdmin, async (_req, res) => {
  const result = await importReferencePosts();
  await recordAudit({
    actor: "admin",
    action: "posts.import",
    entity: "blocks",
    detail: result,
  });
  res.json(ImportXPostsResponse.parse(result));
});

export default router;
