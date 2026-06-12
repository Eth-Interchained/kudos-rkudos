import { eq, and } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  participantsTable,
  repliesTable,
  abuseEventsTable,
  type Block,
  type Participant,
  type Reply,
} from "@workspace/db";
import {
  contentHash,
  tokenSignature,
  jaccard,
  computeTrustWeight,
  computeReachFactor,
  computeQualityScore,
  computeSocialHashpower,
  determineValidity,
} from "./scoring";
import { scoreReply } from "./integrations/aias";
import { lookupUser } from "./integrations/x";
import { scoringConfig } from "./config";
import { recordAudit } from "./audit";
import { mirrorReplyToPost } from "./forumBridge";

export interface ReplyInputOverrides {
  followersCount?: number;
  verified?: boolean;
  accountAgeDays?: number;
}

function ageDays(iso: string | null): number {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

/** Resolve or create a participant for a handle, refreshing X profile data. */
export async function upsertParticipant(
  handle: string,
  overrides: ReplyInputOverrides,
  log?: Logger,
): Promise<Participant> {
  const clean = handle.replace(/^@/, "");
  const existing = await db
    .select()
    .from(participantsTable)
    .where(eq(participantsTable.xHandle, clean))
    .limit(1);

  const profile = await lookupUser(clean, log);
  const followersCount = overrides.followersCount ?? profile.followersCount;
  const verified = overrides.verified ?? profile.verified;
  const accountCreated =
    overrides.accountAgeDays !== undefined
      ? new Date(Date.now() - overrides.accountAgeDays * 86400000).toISOString()
      : profile.accountCreated;

  if (existing[0]) {
    const updated = await db
      .update(participantsTable)
      .set({ followersCount, verified, accountCreated })
      .where(eq(participantsTable.id, existing[0].id))
      .returning();
    return updated[0];
  }

  const inserted = await db
    .insert(participantsTable)
    .values({
      xUserId: profile.xUserId,
      xHandle: clean,
      followersCount,
      verified,
      accountCreated,
      behaviorScore: 0.5,
      pohTier: 0,
    })
    .returning();
  return inserted[0];
}

export class DuplicateReplyError extends Error {
  constructor() {
    super("This account already has a scored reply for this block");
    this.name = "DuplicateReplyError";
  }
}

/**
 * Raised when AiAS scoring is unavailable (missing/invalid key, provider/model
 * mismatch, or the call failed). The reply is NOT persisted — but unlike an
 * already-seen comment id, this is an operational fault, so callers surface it
 * instead of silently counting it as "nothing synced".
 */
export class ScoringUnavailableError extends Error {
  constructor() {
    super(
      "AiAS scoring unavailable (check AIAS_API_KEY / AIAS_PROVIDER / AIAS_MODEL)",
    );
    this.name = "ScoringUnavailableError";
  }
}

export interface PipelineResult {
  reply: Reply;
  participant: Participant;
}

/**
 * Full scoring pipeline for one reply:
 * identity resolve -> dedup -> AiAS score -> uniqueness -> trust/reach ->
 * social_hashpower -> validity -> persist (+ abuse event when flagged).
 */
export async function ingestAndScoreReply(
  block: Block,
  input: {
    handle: string;
    replyText: string;
    xReplyId?: string;
    /** rKudos: present for forum-native submissions; null/absent for X-sourced
     *  replies. Threaded only to the forum mirror — never into scoring inputs. */
    miningKeyHash?: string;
  } & ReplyInputOverrides,
  log?: Logger,
): Promise<PipelineResult | null> {
  const cfg = scoringConfig();

  // Immutable scores: a comment id is scored exactly once, ever. If we've
  // already ingested this X reply, skip silently — never re-score it.
  if (input.xReplyId) {
    const seen = await db
      .select({ id: repliesTable.id })
      .from(repliesTable)
      .where(eq(repliesTable.xReplyId, input.xReplyId))
      .limit(1);
    if (seen[0]) return null;
  }

  const participant = await upsertParticipant(
    input.handle,
    {
      followersCount: input.followersCount,
      verified: input.verified,
      accountAgeDays: input.accountAgeDays,
    },
    log,
  );

  // One scored reply per account per block.
  const prior = await db
    .select()
    .from(repliesTable)
    .where(
      and(
        eq(repliesTable.blockId, block.id),
        eq(repliesTable.participantId, participant.id),
      ),
    )
    .limit(1);
  if (prior[0]) throw new DuplicateReplyError();

  const hash = contentHash(input.replyText);
  const signature = tokenSignature(input.replyText);

  // Uniqueness vs every other reply already in this block.
  const others = await db
    .select({
      id: repliesTable.id,
      participantId: repliesTable.participantId,
      tokenSignature: repliesTable.tokenSignature,
      contentHash: repliesTable.contentHash,
    })
    .from(repliesTable)
    .where(eq(repliesTable.blockId, block.id));

  let maxSim = 0;
  let dupOf: string | null = null;
  for (const o of others) {
    const sim = o.contentHash === hash ? 1 : jaccard(signature, o.tokenSignature ?? []);
    if (sim > maxSim) {
      maxSim = sim;
      dupOf = o.participantId;
    }
  }
  const uniqueness = Math.round((1 - maxSim) * 1000) / 1000;
  const isNearDuplicate = maxSim >= cfg.duplicateSimilarityThreshold;

  const ai = await scoreReply(
    input.replyText,
    {
      topic: block.topic,
      requiredKeywords: block.requiredKeywords ?? [],
      bonusKeywords: block.bonusKeywords ?? [],
      blockTitle: block.title,
    },
    log,
  );
  // AiAS unavailable — never fabricate a score. Surface it (do not silently
  // drop the reply) so an operator sees scoring is down rather than a confusing
  // "Synced 0". The only remaining null return above is an already-seen id.
  if (!ai) throw new ScoringUnavailableError();

  const qualityScore = computeQualityScore(ai);
  const accountAge = ageDays(participant.accountCreated);
  const trustWeight = computeTrustWeight({
    behaviorScore: participant.behaviorScore,
    pohTier: participant.pohTier,
    verified: participant.verified,
    accountAgeDays: accountAge,
    banned: participant.banned,
  });
  const reachFactor = computeReachFactor(participant.followersCount, trustWeight);

  // Persist the latest trust weight as the participant's standing trust score.
  if (participant.trustScore !== trustWeight) {
    await db
      .update(participantsTable)
      .set({ trustScore: trustWeight })
      .where(eq(participantsTable.id, participant.id));
    participant.trustScore = trustWeight;
  }

  const socialHashpower = computeSocialHashpower({
    qualityScore,
    trustWeight,
    uniqueness,
    reachFactor,
  });

  const flagged = isNearDuplicate || ai.isSpam || participant.banned;
  const validity = determineValidity({
    qualityScore,
    trustWeight,
    flagged,
    qualityFloor: block.qualityFloor,
    trustFloor: block.trustFloor,
  });

  const inserted = await db
    .insert(repliesTable)
    .values({
      blockId: block.id,
      participantId: participant.id,
      xReplyId: input.xReplyId ?? null,
      replyText: input.replyText,
      contentHash: hash,
      tokenSignature: signature,
      qualityScore,
      aiScores: ai as unknown as Record<string, number | boolean | string>,
      trustWeight,
      uniqueness,
      reachFactor,
      socialHashpower: validity.valid ? socialHashpower : 0,
      status: validity.valid ? "valid" : "rejected",
      rejectionReason: validity.reason,
      flagged,
    })
    .returning();

  if (flagged) {
    const kind = ai.isSpam
      ? "spam"
      : isNearDuplicate
        ? "near_duplicate"
        : "banned_participant";
    await db.insert(abuseEventsTable).values({
      participantId: participant.id,
      blockId: block.id,
      replyId: inserted[0].id,
      kind,
      severity: ai.isSpam || participant.banned ? "high" : "medium",
      detail: JSON.stringify({
        maxSimilarity: maxSim,
        dupOfParticipant: dupOf,
        isSpam: ai.isSpam,
        rationale: ai.rationale,
      }),
    });
  }

  await recordAudit({
    action: "reply.scored",
    entity: "reply",
    entityId: inserted[0].id,
    detail: {
      blockSeq: block.seq,
      handle: participant.xHandle,
      qualityScore,
      trustWeight,
      uniqueness,
      reachFactor,
      socialHashpower: inserted[0].socialHashpower,
      status: inserted[0].status,
      flagged,
    },
  });

  // rKudos (Direction 1): mirror this scored reply into the block's forum thread.
  // Idempotent (UNIQUE reply_id); null mining key for X-sourced replies => a
  // read-only post. Wrapped so a forum failure can never affect scoring/settlement.
  try {
    await mirrorReplyToPost(block, inserted[0], participant, input.miningKeyHash ?? null);
  } catch (err) {
    log?.warn({ err }, "rKudos: mirrorReplyToPost failed (non-fatal)");
  }

  return { reply: inserted[0], participant };
}
