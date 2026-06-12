import { Router, type IRouter } from "express";
import { eq, and, isNull } from "drizzle-orm";
import { db, participantsTable, payoutsTable } from "@workspace/db";
import { WalletBindBody } from "@workspace/api-zod";
import { toParticipantDto } from "../services/mappers";
import { validateAddress } from "../services/integrations/itc";
import { upsertParticipant } from "../services/replyPipeline";
import { recordAudit } from "../services/audit";
import { subscribeEmail } from "../services/subscribers";

const router: IRouter = Router();

/**
 * Bind a contributor's ITC payout address to their X handle.
 *
 * Deliberately simple: an ITC address belongs to the contributor and we make no
 * claim of ownership over it (no signature/nonce challenge) — we just validate
 * that it is a well-formed Bitcoin-style ITC address and save it so settlement
 * can pay them. The handle is resolved to a participant (created if new) so the
 * address attaches to the same identity their replies are scored under.
 */
router.post("/wallet/bind", async (req, res) => {
  const body = WalletBindBody.parse(req.body);
  const handle = body.handle.replace(/^@+/, "").trim();
  const itcAddress = body.itcAddress.trim();

  if (!handle) {
    res.status(400).json({ error: "Handle is required" });
    return;
  }

  if (!(await validateAddress(itcAddress, req.log))) {
    res.status(400).json({
      error:
        "Invalid ITC address. Provide a Bitcoin-style ITC wallet address (base58 or itc1… bech32), not a 0x/Ethereum address.",
    });
    return;
  }

  const participant = await upsertParticipant(handle, {}, req.log);

  const now = new Date().toISOString();
  const updated = await db
    .update(participantsTable)
    .set({ itcAddress, addressProvedAt: now })
    .where(eq(participantsTable.id, participant.id))
    .returning();

  await db
    .update(payoutsTable)
    .set({ itcAddress })
    .where(
      and(
        eq(payoutsTable.participantId, participant.id),
        isNull(payoutsTable.itcAddress),
      ),
    );

  await recordAudit({
    actor: handle,
    action: "wallet.bound",
    entity: "participant",
    entityId: participant.id,
    detail: { handle, itcAddress },
  });

  // Optional: if the contributor shared an email, opt them into the weekly
  // digest. Never let a bad email break the bind itself.
  if (body.email && body.email.trim()) {
    await subscribeEmail(body.email, handle);
  }

  res.json(toParticipantDto(updated[0]));
});

export default router;
