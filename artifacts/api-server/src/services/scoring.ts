import { createHash } from "node:crypto";

/**
 * Scoring engine for the INVERTED social-hashpower model:
 *   social_hashpower = quality_score x trust_weight x uniqueness x reach_factor
 * Trust/identity dominates, semantic quality is second, follower reach is the
 * smallest, gated lever.
 */

export interface AiScores {
  relevance: number;
  originality: number;
  correctness: number;
  specificity: number;
  isSpam: boolean;
  isGenericFiller: boolean;
  rationale: string;
}

export interface TrustInputs {
  behaviorScore: number;
  pohTier: number;
  verified: boolean;
  accountAgeDays: number;
  banned: boolean;
}

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

const GENERIC_PHRASES = [
  "gm",
  "wen",
  "lfg",
  "to the moon",
  "great post",
  "nice post",
  "love this",
  "so true",
  "this is huge",
  "amazing",
  "first",
  "based",
  "wagmi",
  "ngmi",
  "follow back",
  "check dm",
  "check my profile",
];

const SPAM_PATTERNS = [
  /(.)\1{6,}/i, // long char repeats: aaaaaaa
  /https?:\/\/\S+\s+https?:\/\/\S+/i, // multiple links
  /\b(airdrop|free crypto|giveaway|claim now|dm me|t\.me\/)\b/i,
];

export function contentHash(text: string): string {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256").update(normalized).digest("hex");
}

/** Tokenize into a sorted unique signature for cheap near-duplicate detection. */
export function tokenSignature(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
  return Array.from(new Set(tokens)).sort();
}

/** Jaccard similarity over two token signatures. */
export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setB = new Set(b);
  let intersection = 0;
  for (const t of a) if (setB.has(t)) intersection += 1;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * trust_weight in [0,1]. Identity/behaviour dominate; this is the largest lever
 * in the hashpower product and the primary Sybil defense.
 */
export function computeTrustWeight(t: TrustInputs): number {
  if (t.banned) return 0;
  const ageFactor = clamp(t.accountAgeDays / 365, 0, 1);
  const pohFactor = clamp(t.pohTier, 0, 3) * 0.1; // up to +0.30
  const weight =
    0.15 +
    clamp(t.behaviorScore, 0, 1) * 0.35 +
    ageFactor * 0.2 +
    (t.verified ? 0.15 : 0) +
    pohFactor;
  return clamp(weight, 0, 1);
}

/**
 * reach_factor: follower reach is the smallest, trust-gated lever.
 *   base = 1.0 + min(log10(max(followers,1))/12, 0.30)
 *   reach = 1.0 + (base - 1.0) * trust_weight
 * A high-follower but low-trust account gets almost no reach bonus.
 */
export function computeReachFactor(
  followers: number,
  trustWeight: number,
): number {
  const base = 1.0 + Math.min(Math.log10(Math.max(followers, 1)) / 12, 0.3);
  return 1.0 + (base - 1.0) * trustWeight;
}

/** quality_score 0..100 = weighted mean of sub-scores, zeroed if spam. */
export function computeQualityScore(ai: AiScores): number {
  if (ai.isSpam) return 0;
  const q =
    ai.relevance * 0.3 +
    ai.correctness * 0.25 +
    ai.specificity * 0.2 +
    ai.originality * 0.25;
  return Math.round(clamp(q, 0, 100) * 100) / 100;
}

export function computeSocialHashpower(params: {
  qualityScore: number;
  trustWeight: number;
  uniqueness: number;
  reachFactor: number;
}): number {
  const hp =
    params.qualityScore *
    params.trustWeight *
    params.uniqueness *
    params.reachFactor;
  return Math.round(hp * 1000) / 1000;
}

export interface ValidityInputs {
  qualityScore: number;
  trustWeight: number;
  flagged: boolean;
  qualityFloor: number;
  trustFloor: number;
}

export function determineValidity(v: ValidityInputs): {
  valid: boolean;
  reason: string | null;
} {
  if (v.flagged) return { valid: false, reason: "flagged_for_abuse" };
  if (v.qualityScore < v.qualityFloor)
    return {
      valid: false,
      reason: `quality_below_floor (${v.qualityScore} < ${v.qualityFloor})`,
    };
  if (v.trustWeight < v.trustFloor)
    return {
      valid: false,
      reason: `trust_below_floor (${v.trustWeight.toFixed(3)} < ${v.trustFloor})`,
    };
  return { valid: true, reason: null };
}

/**
 * Deterministic heuristic fallback used when no AiAS / Anthropic key is set.
 * Produces the same AiScores shape the real model would.
 */
export function simulateAiScores(
  replyText: string,
  block: { topic: string; requiredKeywords: string[]; bonusKeywords: string[] },
): AiScores {
  const text = replyText.trim();
  const lower = text.toLowerCase();
  const tokens = tokenSignature(text);
  const wordCount = lower.split(/\s+/).filter(Boolean).length;

  const isSpam = SPAM_PATTERNS.some((re) => re.test(text)) || wordCount < 2;
  const genericHits = GENERIC_PHRASES.filter((p) => lower.includes(p)).length;
  const isGenericFiller =
    (wordCount <= 4 && genericHits > 0) || (genericHits >= 2 && wordCount < 12);

  const topicTokens = tokenSignature(
    `${block.topic} ${block.requiredKeywords.join(" ")} ${block.bonusKeywords.join(" ")}`,
  );
  const overlap = jaccard(tokens, topicTokens);
  const requiredHits = block.requiredKeywords.filter((k) =>
    lower.includes(k.toLowerCase()),
  ).length;
  const requiredRatio =
    block.requiredKeywords.length === 0
      ? 1
      : requiredHits / block.requiredKeywords.length;

  const relevance = clamp(40 + overlap * 220 + requiredRatio * 35, 0, 100);
  const hasNumbers = /\d/.test(text);
  const hasLink = /https?:\/\/\S+/.test(text);
  const uniqueRatio = tokens.length / Math.max(wordCount, 1);
  const specificity = clamp(
    20 +
      Math.min(wordCount, 60) * 1.0 +
      (hasNumbers ? 12 : 0) +
      (hasLink ? 8 : 0) +
      uniqueRatio * 20,
    0,
    100,
  );
  const originality = clamp(
    35 + uniqueRatio * 45 + Math.min(tokens.length, 30) - genericHits * 25,
    0,
    100,
  );
  const correctness = clamp(
    isGenericFiller ? 35 : 55 + Math.min(wordCount, 40) * 0.7,
    0,
    100,
  );

  const rationale = isSpam
    ? "Detected spam/promotional pattern or near-empty content; quality zeroed."
    : isGenericFiller
      ? "Generic low-effort filler with little topical substance."
      : `Heuristic score: topic overlap ${(overlap * 100).toFixed(0)}%, ${requiredHits}/${block.requiredKeywords.length} required keywords, ${wordCount} words.`;

  return {
    relevance: Math.round(relevance),
    originality: Math.round(originality),
    correctness: Math.round(correctness),
    specificity: Math.round(specificity),
    isSpam,
    isGenericFiller,
    rationale,
  };
}
