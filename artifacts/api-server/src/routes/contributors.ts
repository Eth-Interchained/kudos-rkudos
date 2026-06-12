import { Router, type IRouter } from "express";
import {
  RegisterContributorBody,
  RegisterContributorResponse,
} from "@workspace/api-zod";
import { upsertParticipant } from "../services/replyPipeline";
import { toParticipantDto } from "../services/mappers";
import { recordAudit } from "../services/audit";

const router: IRouter = Router();

/**
 * Self-registration: resolve an X handle to a participant (creating it if new)
 * so the contributor can then bind a payout address via the wallet flow.
 */
router.post("/contributors/register", async (req, res) => {
  const body = RegisterContributorBody.parse(req.body);
  const handle = body.handle.replace(/^@/, "").trim();
  if (!handle) {
    res.status(400).json({ error: "Handle is required" });
    return;
  }
  try {
    const participant = await upsertParticipant(handle, {}, req.log);
    await recordAudit({
      actor: handle,
      action: "contributor.registered",
      entity: "participant",
      entityId: participant.id,
      detail: { handle },
    });
    res.json(RegisterContributorResponse.parse(toParticipantDto(participant)));
  } catch (err) {
    req.log?.warn({ err, handle }, "contributor register failed");
    res
      .status(400)
      .json({ error: "Could not resolve that X handle. Check the spelling." });
  }
});

export default router;
