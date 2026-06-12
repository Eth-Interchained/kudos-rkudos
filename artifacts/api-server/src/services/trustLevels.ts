/**
 * rKudos trust levels (TL0–TL4).
 *
 * ──────────────────────────────────────────────────────────────────────────
 * INVARIANT: Trust levels are a PERMISSIONS ladder, never a scoring input.
 * computeTrustWeight() in scoring.ts remains the SOLE economic trust lever, so
 * the audited hashpower model (quality × trust × uniqueness × reach) is
 * untouched. Nothing in this module may be imported by scoring.ts,
 * replyPipeline.ts, settlement.ts, merkle.ts, or rewardModel.ts.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * This is a pure module: no DB, no I/O. Callers gather the inputs and persist
 * any effects (e.g. behaviorScore deltas) elsewhere.
 */

export type TrustLevel = 0 | 1 | 2 | 3 | 4;

export interface TrustLevelInputs {
  /** Days since the participant's account was created. */
  accountAgeDays: number;
  /** Count of replies that settled as status "valid". */
  validReplyCount: number;
  /** Distinct threads the participant has read (forum_thread_subscriptions). */
  threadsReadCount: number;
  /** A bound ITC wallet (participant.itcAddress present). */
  walletBound: boolean;
  /** participant.trustScore in [0,1]. */
  trustScore: number;
  /** Any high-severity abuse event in the last 30 days. */
  highSeverityAbuse30d: boolean;
  /** Posts marked as a thread's solution. */
  solutionCount: number;
  /** Share of this participant's flags that were upheld, in [0,1]. */
  flagAccuracy: number;
  /** Operator-granted moderator (TL4). */
  operatorGrant: boolean;
}

/** Permissions/limits unlocked at each trust level. */
export interface TrustLevelPolicy {
  /** Minimum ms between posts (server-enforced slow mode). */
  slowModeMs: number;
  /** Max posts per rolling day; null = uncapped. */
  dailyPostCap: number | null;
  /** May create new threads. */
  canCreateThreads: boolean;
  /** May include links/images in posts. */
  canPostLinks: boolean;
  /** Link posts skip the hidden_pending_review hold. */
  linkPostsSkipReview: boolean;
  /** Window (ms) during which a participant may edit their own post. */
  editWindowMs: number;
  /** May flag posts. */
  canFlag: boolean;
  /** May moderate (hide/lock/pin, resolve flags). */
  canModerate: boolean;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const TL_POLICY: Record<TrustLevel, TrustLevelPolicy> = {
  0: {
    slowModeMs: 90_000,
    dailyPostCap: 3,
    canCreateThreads: false,
    canPostLinks: false,
    linkPostsSkipReview: false,
    editWindowMs: 5 * MIN,
    canFlag: false,
    canModerate: false,
  },
  1: {
    slowModeMs: 30_000,
    dailyPostCap: 30,
    canCreateThreads: true,
    canPostLinks: true,
    linkPostsSkipReview: false,
    editWindowMs: 30 * MIN,
    canFlag: false,
    canModerate: false,
  },
  2: {
    slowModeMs: 10_000,
    dailyPostCap: 60,
    canCreateThreads: true,
    canPostLinks: true,
    linkPostsSkipReview: true,
    editWindowMs: 24 * HOUR,
    canFlag: true,
    canModerate: false,
  },
  3: {
    slowModeMs: 10_000,
    dailyPostCap: null,
    canCreateThreads: true,
    canPostLinks: true,
    linkPostsSkipReview: true,
    editWindowMs: 24 * HOUR,
    canFlag: true,
    canModerate: false,
  },
  4: {
    slowModeMs: 0,
    dailyPostCap: null,
    canCreateThreads: true,
    canPostLinks: true,
    linkPostsSkipReview: true,
    editWindowMs: 7 * DAY,
    canFlag: true,
    canModerate: true,
  },
};

function meetsTL1(i: TrustLevelInputs): boolean {
  return i.accountAgeDays >= 3 && (i.validReplyCount >= 1 || i.threadsReadCount >= 10);
}

function meetsTL2(i: TrustLevelInputs): boolean {
  return (
    meetsTL1(i) &&
    i.accountAgeDays >= 15 &&
    i.validReplyCount >= 3 &&
    i.walletBound &&
    i.trustScore >= 0.4 &&
    !i.highSeverityAbuse30d
  );
}

function meetsTL3(i: TrustLevelInputs): boolean {
  return (
    meetsTL2(i) &&
    i.accountAgeDays >= 60 &&
    i.validReplyCount >= 15 &&
    i.solutionCount >= 2 &&
    i.flagAccuracy >= 0.8
  );
}

/**
 * Resolve the participant's trust level. The ladder is cumulative: a higher
 * level requires every lower level's criteria too. TL4 is operator-granted only
 * and is never derived from metrics.
 */
export function computeTrustLevel(inputs: TrustLevelInputs): TrustLevel {
  if (inputs.operatorGrant) return 4;
  if (meetsTL3(inputs)) return 3;
  if (meetsTL2(inputs)) return 2;
  if (meetsTL1(inputs)) return 1;
  return 0;
}

export function trustLevelPolicy(level: TrustLevel): TrustLevelPolicy {
  return TL_POLICY[level];
}

/**
 * behaviorScore deltas applied when forum activity is adjudicated. These feed
 * the EXISTING 35%-weight behaviorScore lever in computeTrustWeight(), making
 * it earnable on-platform for the first time. Apply via applyBehaviorDelta()
 * and persist to participants.behaviorScore (wired in PR #4).
 */
export const BEHAVIOR_DELTAS = {
  /** An upheld reward_farming or spam flag against the participant. */
  upheldFarmingOrSpamFlag: -0.15,
  /** Any other upheld flag against the participant. */
  upheldOtherFlag: -0.05,
  /** The participant authored a post marked as a thread's solution. */
  authoredSolution: 0.05,
  /** A flag the participant raised was upheld (accurate flagging). */
  accurateFlag: 0.01,
} as const;

export type BehaviorDeltaKind = keyof typeof BEHAVIOR_DELTAS;

/** Clamp a behaviorScore + delta into [0,1]. Pure. */
export function applyBehaviorDelta(current: number, delta: number): number {
  return Math.max(0, Math.min(1, current + delta));
}
