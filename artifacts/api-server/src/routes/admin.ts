import { Router, type IRouter } from "express";
import { requireAdmin } from "../middleware/adminAuth";

const router: IRouter = Router();

/**
 * Lightweight token validation endpoint used by the console login screen.
 * Returns 200 only when a valid admin token is supplied; otherwise the
 * `requireAdmin` middleware responds with 401/503.
 */
router.get("/admin/session", requireAdmin, (_req, res) => {
  res.json({ ok: true });
});

export default router;
