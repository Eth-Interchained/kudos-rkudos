import type {
  Block,
  Participant,
  Reply,
  Payout,
  AbuseEvent,
  AuditEntry,
  Project,
  ProjectPost,
} from "@workspace/db";
import { buildShareUrl } from "./integrations/xPost";

export function toBlockDto(
  b: Block,
  counts: { replyCount: number; validCount: number },
) {
  return {
    id: b.id,
    seq: b.seq,
    xPostId: b.xPostId,
    xPostUrl: b.xPostUrl,
    postContent: b.postContent,
    xPostedAt: b.xPostedAt,
    postMode: b.postMode,
    // One-click X share (intent) URL for semi-automated manual posting.
    shareUrl: b.postContent ? buildShareUrl(b.postContent) : null,
    title: b.title,
    topic: b.topic,
    rewardItc: b.rewardItc,
    requiredKeywords: b.requiredKeywords ?? [],
    bonusKeywords: b.bonusKeywords ?? [],
    sponsor: b.sponsor,
    status: b.status,
    perAccountCapItc: b.perAccountCapItc,
    opensAt: b.opensAt,
    closesAt: b.closesAt,
    settledAt: b.settledAt,
    replyCount: counts.replyCount,
    validCount: counts.validCount,
    createdAt: b.createdAt,
  };
}

export function toParticipantDto(p: Participant) {
  return {
    id: p.id,
    xUserId: p.xUserId,
    xHandle: p.xHandle,
    accountCreated: p.accountCreated,
    followersCount: p.followersCount,
    verified: p.verified,
    trustScore: p.trustScore,
    behaviorScore: p.behaviorScore,
    pohTier: p.pohTier,
    itcAddress: p.itcAddress,
    addressProvedAt: p.addressProvedAt,
    banned: p.banned,
    banReason: p.banReason,
  };
}

export function toReplyDto(r: Reply, p: Participant) {
  return {
    id: r.id,
    blockId: r.blockId,
    participantId: r.participantId,
    handle: p.xHandle,
    followersCount: p.followersCount,
    verified: p.verified,
    xReplyId: r.xReplyId ?? "",
    replyText: r.replyText,
    qualityScore: r.qualityScore,
    aiScores: r.aiScores ?? null,
    trustWeight: r.trustWeight,
    uniqueness: r.uniqueness,
    reachFactor: r.reachFactor,
    socialHashpower: r.socialHashpower,
    status: r.status,
    rejectionReason: r.rejectionReason,
    flagged: r.flagged,
    createdAt: r.createdAt,
  };
}

export function toPayoutDto(p: Payout, blockSeq: number, handle: string) {
  return {
    id: p.id,
    blockId: p.blockId,
    blockSeq,
    participantId: p.participantId,
    handle,
    itcAddress: p.itcAddress,
    amountItc: p.amountItc,
    idempotencyKey: p.idempotencyKey,
    status: p.status,
    batchTxid: p.batchTxid,
    confirmations: p.confirmations,
    approvedBy: p.approvedBy,
    paidAt: p.paidAt,
    flagged: p.flagged,
  };
}

export function toAbuseEventDto(
  e: AbuseEvent,
  extra: { handle: string | null; blockSeq: number | null },
) {
  return {
    id: e.id,
    participantId: e.participantId,
    handle: extra.handle,
    blockId: e.blockId,
    blockSeq: extra.blockSeq,
    kind: e.kind,
    detail: e.detail,
    createdAt: e.createdAt,
  };
}

export function toProjectDto(p: Project, postCount = 0) {
  return {
    id: p.id,
    name: p.name,
    xHandle: p.xHandle,
    xUserId: p.xUserId,
    description: p.description,
    websiteUrl: p.websiteUrl,
    status: p.status,
    rejectionReason: p.rejectionReason,
    reviewedAt: p.reviewedAt,
    appliedAt: p.appliedAt,
    postCount,
  };
}

export function toProjectPostDto(p: ProjectPost) {
  return {
    id: p.id,
    projectId: p.projectId,
    xPostId: p.xPostId,
    xPostUrl: p.xPostUrl,
    text: p.text,
    syncedAt: p.syncedAt,
  };
}

export function toAuditDto(a: AuditEntry) {
  return {
    id: a.id,
    actor: a.actor,
    action: a.action,
    entity: a.entity,
    entityId: a.entityId,
    detail: a.detail,
    ts: a.ts,
  };
}
