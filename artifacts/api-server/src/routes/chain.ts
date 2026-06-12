import { Router, type IRouter } from "express";
import { GetChainStatsResponse } from "@workspace/api-zod";
import { getChainStats } from "../services/integrations/visionChain";

const router: IRouter = Router();

router.get("/chain/stats", async (req, res) => {
  const stats = await getChainStats(req.log);
  res.json(GetChainStatsResponse.parse(stats));
});

export default router;
