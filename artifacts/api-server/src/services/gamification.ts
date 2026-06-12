/**
 * Kudos gamification engine.
 *
 * All functions are pure — they compute rank/tier/badges/XP from already-
 * available participant + reply statistics. No new DB columns are required;
 * the data is derived at query time and surfaced through the participant
 * profile API response.
 */

// ── Miner Tiers ─────────────────────────────────────────────────────────────

export interface MinerTier {
  id: string;
  label: string;
  icon: string;        // emoji displayed in UI
  minHashpower: number;
  color: string;       // Tailwind-compatible hex or token
}

export const MINER_TIERS: MinerTier[] = [
  { id: "prospector",    label: "Prospector",    icon: "🪨", minHashpower: 0,       color: "#a78bfa" },
  { id: "miner",         label: "Miner",         icon: "⛏️",  minHashpower: 500,     color: "#60a5fa" },
  { id: "senior",        label: "Senior Miner",  icon: "🔩", minHashpower: 2_500,   color: "#34d399" },
  { id: "veteran",       label: "Block Veteran", icon: "💎", minHashpower: 10_000,  color: "#f59e0b" },
  { id: "hashlord",      label: "Hash Lord",     icon: "⚡", minHashpower: 50_000,  color: "#f97316" },
  { id: "legend",        label: "Legend",        icon: "🏆", minHashpower: 200_000, color: "#ec4899" },
];

/**
 * Returns the tier a miner belongs to based on their total accumulated
 * social hashpower across all valid replies.
 */
export function computeTier(totalHashpower: number): MinerTier {
  let tier = MINER_TIERS[0];
  for (const t of MINER_TIERS) {
    if (totalHashpower >= t.minHashpower) tier = t;
  }
  return tier;
}

/**
 * Progress to the NEXT tier as a 0–100 percentage.
 * Returns 100 when already at max tier.
 */
export function tierProgress(totalHashpower: number): number {
  const current = computeTier(totalHashpower);
  const currentIdx = MINER_TIERS.findIndex((t) => t.id === current.id);
  const next = MINER_TIERS[currentIdx + 1];
  if (!next) return 100;
  const range = next.minHashpower - current.minHashpower;
  const earned = totalHashpower - current.minHashpower;
  return Math.min(100, Math.round((earned / range) * 100));
}

// ── XP / Level ──────────────────────────────────────────────────────────────

/**
 * Mining level 1–50. Each level requires progressively more XP.
 * XP = total accumulated social hashpower (rounded).
 */
export function computeLevel(totalHashpower: number): number {
  // Level n requires n² × 100 XP to unlock. Level 1 = 0 HP.
  let level = 1;
  while (level < 50 && totalHashpower >= Math.pow(level, 2) * 100) level++;
  return level;
}

/** 0–100% progress to the next level. */
export function levelProgress(totalHashpower: number): number {
  const level = computeLevel(totalHashpower);
  const currentXp = Math.pow(level - 1, 2) * 100;
  const nextXp    = Math.pow(level, 2) * 100;
  return Math.min(100, Math.round(((totalHashpower - currentXp) / (nextXp - currentXp)) * 100));
}

// ── Badges ───────────────────────────────────────────────────────────────────

export interface Badge {
  id: string;
  label: string;
  description: string;
  icon: string;
  rarity: "common" | "rare" | "epic" | "legendary";
}

export const ALL_BADGES: Badge[] = [
  {
    id: "first_reply",
    label: "First Block",
    description: "Submitted your first valid mining reply.",
    icon: "🎯",
    rarity: "common",
  },
  {
    id: "top_miner",
    label: "Top Miner",
    description: "Ranked #1 on a settled block.",
    icon: "👑",
    rarity: "epic",
  },
  {
    id: "quality_master",
    label: "Quality Master",
    description: "Scored 90+ quality on a single reply.",
    icon: "✨",
    rarity: "rare",
  },
  {
    id: "veteran",
    label: "Veteran",
    description: "Submitted 10+ valid replies across blocks.",
    icon: "🎖️",
    rarity: "rare",
  },
  {
    id: "genesis",
    label: "Genesis Miner",
    description: "Mined one of the first 10 blocks.",
    icon: "🌍",
    rarity: "legendary",
  },
  {
    id: "consistent",
    label: "Consistent",
    description: "Valid replies in 5 or more different blocks.",
    icon: "🔗",
    rarity: "rare",
  },
  {
    id: "high_trust",
    label: "High Trust",
    description: "Trust weight above 0.85 on a reply.",
    icon: "🛡️",
    rarity: "rare",
  },
  {
    id: "hash_lord",
    label: "Hash Lord",
    description: "Reached Hash Lord tier (50,000+ total hashpower).",
    icon: "⚡",
    rarity: "epic",
  },
  {
    id: "legend",
    label: "Legend",
    description: "Reached Legend tier (200,000+ total hashpower).",
    icon: "🏆",
    rarity: "legendary",
  },
  {
    id: "perfect_score",
    label: "Perfect Score",
    description: "Achieved a quality score of 100.",
    icon: "💯",
    rarity: "legendary",
  },
];

export interface BadgeInput {
  validReplyCount: number;
  totalHashpower: number;
  hasTopRank: boolean;
  maxQualityScore: number;
  blocksMinedCount: number;
  minBlockSeq: number | null;
  maxTrustWeight: number;
}

/** Compute which badges a miner has earned given their aggregate stats. */
export function computeBadges(input: BadgeInput): Badge[] {
  const earned: Badge[] = [];
  const tier = computeTier(input.totalHashpower);

  if (input.validReplyCount >= 1)       earned.push(ALL_BADGES.find(b => b.id === "first_reply")!);
  if (input.hasTopRank)                  earned.push(ALL_BADGES.find(b => b.id === "top_miner")!);
  if (input.maxQualityScore >= 90)       earned.push(ALL_BADGES.find(b => b.id === "quality_master")!);
  if (input.maxQualityScore >= 100)      earned.push(ALL_BADGES.find(b => b.id === "perfect_score")!);
  if (input.validReplyCount >= 10)       earned.push(ALL_BADGES.find(b => b.id === "veteran")!);
  if (input.blocksMinedCount >= 5)       earned.push(ALL_BADGES.find(b => b.id === "consistent")!);
  if (input.minBlockSeq !== null && input.minBlockSeq <= 10) earned.push(ALL_BADGES.find(b => b.id === "genesis")!);
  if (input.maxTrustWeight >= 0.85)      earned.push(ALL_BADGES.find(b => b.id === "high_trust")!);
  if (tier.id === "hashlord" || tier.id === "legend") earned.push(ALL_BADGES.find(b => b.id === "hash_lord")!);
  if (tier.id === "legend")              earned.push(ALL_BADGES.find(b => b.id === "legend")!);

  return earned.filter(Boolean);
}

// ── Hashrate label ───────────────────────────────────────────────────────────

/**
 * Human-readable social hashrate label — analogous to BTC mining pool stats.
 * Units: H/block (total hashpower per block mined on average).
 */
export function formatSocialHashrate(
  totalHashpower: number,
  blocksMined: number,
): string {
  if (blocksMined === 0) return "0 H/block";
  const rate = totalHashpower / blocksMined;
  if (rate >= 1_000) return `${(rate / 1_000).toFixed(1)}k H/block`;
  return `${rate.toFixed(1)} H/block`;
}

// ── Rarity color ─────────────────────────────────────────────────────────────

export const RARITY_COLORS: Record<Badge["rarity"], string> = {
  common:    "border-muted-foreground/40 text-muted-foreground",
  rare:      "border-blue-400 text-blue-400",
  epic:      "border-purple-400 text-purple-400",
  legendary: "border-yellow-400 text-yellow-400",
};
