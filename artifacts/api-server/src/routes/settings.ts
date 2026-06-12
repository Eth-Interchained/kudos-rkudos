import { Router, type IRouter } from "express";
import { requireAdmin } from "../middleware/adminAuth";
import { GetSettingsResponse, UpdateSettingsBody } from "@workspace/api-zod";
import {
  getAutoPostEnabled,
  setAutoPostEnabled,
  getMiningStartHeight,
  setMiningStartHeight,
  getRewardsEnabled,
  setRewardsEnabled,
  getBlastEnabled,
  setBlastEnabled,
  getReplySyncEnabled,
  setReplySyncEnabled,
} from "../services/settings";
import { emissionConfig } from "../services/config";
import { computeBlockReward } from "../services/rewardModel";
import { netrowsMode } from "../services/integrations/netrows";
import { xPostMode } from "../services/integrations/xPost";
import { aiasMode } from "../services/integrations/aias";
import { recordAudit } from "../services/audit";

const router: IRouter = Router();

async function buildSettings() {
  const autoPostEnabled = await getAutoPostEnabled();
  const miningStartHeight = await getMiningStartHeight();
  const rewardsEnabled = await getRewardsEnabled();
  const blastEnabled = await getBlastEnabled();
  const replySyncEnabled = await getReplySyncEnabled();
  const reward = await computeBlockReward();
  return {
    autoPostEnabled,
    miningStartHeight,
    rewardsEnabled,
    blastEnabled,
    replySyncEnabled,
    dataSource: netrowsMode(), // "netrows" | "simulated"
    postingMode: xPostMode(), // "api" | "simulated"
    contentMode: aiasMode(), // "aiassist" | "simulated"
    blockIntervalMinutes: Math.round(emissionConfig().blockIntervalMs / 60_000),
    blockRewardItc: reward.rewardItc,
    governanceBlocks: reward.governanceBlocks,
    governanceSharePct: reward.governanceSharePct,
    governanceRewardSumItc: reward.governanceRewardSumItc,
    rewardSourceLive: reward.sourceLive,
  };
}

router.get("/settings", async (_req, res) => {
  res.json(GetSettingsResponse.parse(await buildSettings()));
});

router.put("/settings", requireAdmin, async (req, res) => {
  const body = UpdateSettingsBody.parse(req.body);
  if (typeof body.autoPostEnabled === "boolean") {
    await setAutoPostEnabled(body.autoPostEnabled);
    await recordAudit({
      actor: "admin",
      action: "settings.auto_post",
      entity: "settings",
      detail: { autoPostEnabled: body.autoPostEnabled },
    });
  }
  if (typeof body.miningStartHeight === "number") {
    await setMiningStartHeight(body.miningStartHeight);
    await recordAudit({
      actor: "admin",
      action: "settings.mining_start_height",
      entity: "settings",
      detail: { miningStartHeight: body.miningStartHeight },
    });
  }
  if (typeof body.rewardsEnabled === "boolean") {
    await setRewardsEnabled(body.rewardsEnabled);
    await recordAudit({
      actor: "admin",
      action: "settings.rewards_enabled",
      entity: "settings",
      detail: { rewardsEnabled: body.rewardsEnabled },
    });
  }
  if (typeof body.blastEnabled === "boolean") {
    await setBlastEnabled(body.blastEnabled);
    await recordAudit({
      actor: "admin",
      action: "settings.blast_enabled",
      entity: "settings",
      detail: { blastEnabled: body.blastEnabled },
    });
  }
  if (typeof body.replySyncEnabled === "boolean") {
    await setReplySyncEnabled(body.replySyncEnabled);
    await recordAudit({
      actor: "admin",
      action: "settings.reply_sync_enabled",
      entity: "settings",
      detail: { replySyncEnabled: body.replySyncEnabled },
    });
  }
  res.json(GetSettingsResponse.parse(await buildSettings()));
});

export default router;
