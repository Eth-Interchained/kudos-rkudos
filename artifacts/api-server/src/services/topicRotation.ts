import { db, topicsTable, appSettingsTable, type Topic } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

/**
 * DB-backed topic pool for auto-mined blocks.
 *
 * On first boot the hardcoded seed pool is written into the `topics` table.
 * After that, admins manage topics via the console CRUD — the hardcoded array
 * is never re-seeded once the table is populated.
 *
 * Rotation is still index-based (persisted in app_settings) but now reads from
 * the DB-backed pool of active topics sorted by `sort_order`.
 */

export interface TopicEntry {
  title: string;
  topic: string;
  requiredKeywords: string[];
  bonusKeywords: string[];
}

/**
 * 24 evergreen Interchained / ITC / social-mining seed topics.
 * Only used once — to populate the `topics` table on a fresh database.
 */
const SEED_TOPICS: TopicEntry[] = [
  {
    title: "Why verifiable beats trusted in crypto custody",
    topic: "on-chain transparency and verifiable custody",
    requiredKeywords: ["transparency", "verifiable"],
    bonusKeywords: ["merkle", "audit", "custody"],
  },
  {
    title: "One human, one voice: sybil resistance that works",
    topic: "proof of humanity and sybil resistance in rewards",
    requiredKeywords: ["proof-of-humanity", "sybil"],
    bonusKeywords: ["identity", "trust", "uniqueness"],
  },
  {
    title: "Inverted hashpower: quality over reach",
    topic: "inverted social hashpower weighting trust above reach",
    requiredKeywords: ["quality", "trust"],
    bonusKeywords: ["reach", "uniqueness"],
  },
  {
    title: "Mining with words: rewarding original signal",
    topic: "rewarding original high-signal contributions over spam",
    requiredKeywords: ["original", "signal"],
    bonusKeywords: ["spam", "filler", "substance"],
  },
  {
    title: "ITC: a governance-linked emission model",
    topic: "how ITC block rewards are pegged to live governance coinbase",
    requiredKeywords: ["governance", "ITC"],
    bonusKeywords: ["emission", "coinbase", "treasury"],
  },
  {
    title: "Proof-of-contribution: beyond proof-of-work",
    topic: "social proof-of-contribution as an alternative consensus signal",
    requiredKeywords: ["contribution", "consensus"],
    bonusKeywords: ["hashpower", "signal", "participation"],
  },
  {
    title: "Decentralized reputation without a central authority",
    topic: "building reputation systems that don't rely on a single entity",
    requiredKeywords: ["reputation", "decentralized"],
    bonusKeywords: ["trust", "identity", "score"],
  },
  {
    title: "What does real on-chain settlement look like?",
    topic: "atomic on-chain settlement via PSBT batch payouts",
    requiredKeywords: ["settlement", "on-chain"],
    bonusKeywords: ["PSBT", "atomic", "payout"],
  },
  {
    title: "The double-spend problem — in social rewards",
    topic: "preventing double-spend and duplicate reward claims in social mining",
    requiredKeywords: ["duplicate", "reward"],
    bonusKeywords: ["idempotent", "double-spend", "prevention"],
  },
  {
    title: "Why follower counts are broken as a trust metric",
    topic: "why follower counts fail as a trust or quality signal",
    requiredKeywords: ["follower", "trust"],
    bonusKeywords: ["reach", "bot", "quality"],
  },
  {
    title: "Layer-1 vs layer-2: where social value lives",
    topic: "the relationship between layer-1 security and layer-2 social value",
    requiredKeywords: ["layer-1", "security"],
    bonusKeywords: ["layer-2", "value", "social"],
  },
  {
    title: "Open infrastructure: who should run the nodes?",
    topic: "community-run nodes and decentralized infrastructure ownership",
    requiredKeywords: ["infrastructure", "nodes"],
    bonusKeywords: ["community", "decentralized", "validator"],
  },
  {
    title: "Real posts, real people: no fabricated engagement",
    topic: "why authentic engagement beats manufactured social proof",
    requiredKeywords: ["authentic", "real"],
    bonusKeywords: ["engagement", "fabricated", "genuine"],
  },
  {
    title: "Satoshi-style: block cadence meets social mining",
    topic: "applying Bitcoin-style fixed-cadence blocks to social reward mining",
    requiredKeywords: ["block", "cadence"],
    bonusKeywords: ["mining", "Satoshi", "interval"],
  },
  {
    title: "Merkle proofs: making payouts provable",
    topic: "using Merkle trees to create provable, auditable payout records",
    requiredKeywords: ["merkle", "provable"],
    bonusKeywords: ["proof", "audit", "payout"],
  },
  {
    title: "Spam vs signal: how AI grades your reply",
    topic: "AI-assisted scoring of reply quality: relevance, originality, specificity",
    requiredKeywords: ["AI", "scoring"],
    bonusKeywords: ["relevance", "originality", "spam"],
  },
  {
    title: "Why small token rewards beat big promises",
    topic: "sustainable micro-reward models pegged to real chain economics",
    requiredKeywords: ["reward", "sustainable"],
    bonusKeywords: ["micro", "token", "economics"],
  },
  {
    title: "Building in public: transparent roadmaps win",
    topic: "why public, verifiable progress builds more trust than announcements",
    requiredKeywords: ["transparent", "public"],
    bonusKeywords: ["roadmap", "trust", "verifiable"],
  },
  {
    title: "Interchained governance: who decides the rules?",
    topic: "how ITC governance decisions are made and enforced on-chain",
    requiredKeywords: ["governance", "rules"],
    bonusKeywords: ["vote", "on-chain", "ITC"],
  },
  {
    title: "Social capital as collateral: a new frontier",
    topic: "using verified social reputation as a form of economic collateral",
    requiredKeywords: ["reputation", "social"],
    bonusKeywords: ["collateral", "capital", "verified"],
  },
  {
    title: "The attention economy is broken — here's the fix",
    topic: "replacing attention-maximization with quality-maximization in social platforms",
    requiredKeywords: ["attention", "quality"],
    bonusKeywords: ["economy", "platform", "incentive"],
  },
  {
    title: "Zero fabrication: why real data only matters",
    topic: "the design principle of never fabricating data or engagement in Kudos",
    requiredKeywords: ["real", "data"],
    bonusKeywords: ["fabricated", "integrity", "verifiable"],
  },
  {
    title: "Crypto mining in 2026: beyond the ASIC farm",
    topic: "how social and contribution-based mining extends crypto's mining model",
    requiredKeywords: ["mining", "crypto"],
    bonusKeywords: ["ASIC", "contribution", "hashrate"],
  },
  {
    title: "What makes a great on-chain community?",
    topic: "the ingredients of a thriving, trustworthy on-chain community",
    requiredKeywords: ["community", "on-chain"],
    bonusKeywords: ["trust", "participation", "governance"],
  },
  // ── Project-specific topics (from Interchained ecosystem sites) ──
  {
    title: "DarkGravityWave3-Nova: difficulty that adapts every block",
    topic: "how Interchained's DGW3-Nova DAA re-targets difficulty every block vs Bitcoin's 2016-block epoch",
    requiredKeywords: ["difficulty", "DAA"],
    bonusKeywords: ["DarkGravityWave", "SHA-256", "retarget", "hashrate"],
  },
  {
    title: "AiAssist Secure: builder-owned AI infrastructure",
    topic: "AiAssist Secure is the private AI orchestration layer paired with Interchained's digital asset layer",
    requiredKeywords: ["AI", "infrastructure"],
    bonusKeywords: ["AiAssist", "private", "orchestration", "builder"],
  },
  {
    title: "Elara Wallet: sovereignty carved in gold",
    topic: "Elara is a premium open-source non-custodial BTC + ITC mobile wallet built under GPL-3.0",
    requiredKeywords: ["wallet", "non-custodial"],
    bonusKeywords: ["Elara", "sovereignty", "open-source", "mobile"],
  },
  {
    title: "ITSL: the use layer of Interchained",
    topic: "ITSL is the token, snapshot, and settlement layer for builders, pools, and communities on ITC",
    requiredKeywords: ["ITSL", "token"],
    bonusKeywords: ["settlement", "snapshot", "builder", "pool"],
  },
  {
    title: "Pool reward snapshots: turning blocks into distributions",
    topic: "how mining pools capture participation snapshots and distribute ITC rewards per block won",
    requiredKeywords: ["pool", "snapshot"],
    bonusKeywords: ["reward", "distribution", "miner", "participation"],
  },
  {
    title: "ITSL token operations: createtoken, transfer, mint, burn",
    topic: "the live ITSL SDK and CLI for issuing, transferring, and tracking tokens on the ITC chain",
    requiredKeywords: ["createtoken", "ITSL"],
    bonusKeywords: ["transfer", "mint", "burn", "SDK", "CLI"],
  },
  {
    title: "Build a blockchain in your browser",
    topic: "Interchained Labs runs a real proof-of-work blockchain with genuine SHA-256 entirely in the browser",
    requiredKeywords: ["browser", "blockchain"],
    bonusKeywords: ["SHA-256", "proof-of-work", "playground", "education"],
  },
  {
    title: "Interchained × Bitcoin difficulty — side by side",
    topic: "comparing Bitcoin's 2016-block DAA with Interchained's per-block DarkGravityWave3-Nova retargeting",
    requiredKeywords: ["Bitcoin", "difficulty"],
    bonusKeywords: ["DGW3", "comparison", "retarget", "hashrate"],
  },
  {
    title: "Extroverted Hashpower: mining with signal, not silence",
    topic: "the Extroverted Hashpower model weights quality, trust, and originality over raw follower reach",
    requiredKeywords: ["hashpower", "quality"],
    bonusKeywords: ["extroverted", "trust", "originality", "social"],
  },
  {
    title: "From pool to payout: the on-chain settlement pipeline",
    topic: "how Kudos settles social mining rewards via merkle proofs and PSBT batch payouts on the ITC chain",
    requiredKeywords: ["payout", "settlement"],
    bonusKeywords: ["merkle", "PSBT", "batch", "on-chain"],
  },
  {
    title: "One chain, three layers: the Interchained stack",
    topic: "Interchained's architecture spans L1 (SHA-256 PoW), L2 (ITSL tokens & snapshots), and L3 (apps & pools)",
    requiredKeywords: ["layer", "architecture"],
    bonusKeywords: ["L1", "L2", "ITSL", "stack"],
  },
  {
    title: "Why Interchained chose SHA-256 over Yespower",
    topic: "Interchained migrated to SHA-256 for ASIC-backed security; Yespower remains only as an emergency fallback",
    requiredKeywords: ["SHA-256", "security"],
    bonusKeywords: ["Yespower", "ASIC", "migration", "proof-of-work"],
  },
];

// ── app_settings keys ────────────────────────────────────────────────────────
const ROTATION_INDEX_KEY = "topic_rotation_index";
const BLOCK_GEN_SEED_KEY = "block_gen_seed";

async function getRaw(key: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}

async function setRaw(key: string, value: string): Promise<void> {
  await db
    .insert(appSettingsTable)
    .values({ key, value, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: appSettingsTable.key,
      set: { value, updatedAt: new Date().toISOString() },
    });
}

// ── Seed ──────────────────────────────────────────────────────────────────────

let seeded = false;

/**
 * Ensure the topics table has data. Called lazily on first `getNextTopic()`.
 * Inserts the hardcoded seed pool only when the table is completely empty.
 */
async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  const now = new Date().toISOString();
  // Upsert: insert any seed topics not already in the DB (matched by title).
  const existing = await db.select({ title: topicsTable.title }).from(topicsTable);
  const existingTitles = new Set(existing.map(r => r.title));
  let maxSort = existing.length;
  for (const t of SEED_TOPICS) {
    if (existingTitles.has(t.title)) continue;
    await db.insert(topicsTable).values({
      title: t.title,
      topic: t.topic,
      requiredKeywords: t.requiredKeywords,
      bonusKeywords: t.bonusKeywords,
      sortOrder: maxSort++,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  }
  seeded = true;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the next topic from the DB-backed pool and advances the stored index.
 * Only active topics (sorted by sort_order) participate in rotation.
 */
export async function getNextTopic(): Promise<TopicEntry> {
  await ensureSeeded();

  const active = await db
    .select()
    .from(topicsTable)
    .where(eq(topicsTable.active, true))
    .orderBy(asc(topicsTable.sortOrder));

  if (active.length === 0) {
    // Fallback: if somehow all topics are inactive, return a safe default.
    return {
      title: "Interchained social mining",
      topic: "the Interchained social mining ecosystem and how it works",
      requiredKeywords: ["social", "mining"],
      bonusKeywords: ["ITC", "community"],
    };
  }

  const raw = await getRaw(ROTATION_INDEX_KEY);
  const idx = raw ? Math.max(0, parseInt(raw, 10) % active.length) : 0;
  const topic = active[idx];
  await setRaw(ROTATION_INDEX_KEY, String((idx + 1) % active.length));

  return {
    title: topic.title,
    topic: topic.topic,
    requiredKeywords: topic.requiredKeywords ?? [],
    bonusKeywords: topic.bonusKeywords ?? [],
  };
}

/**
 * List all topics (active + inactive), sorted by sort_order.
 */
export async function listTopics(): Promise<Topic[]> {
  await ensureSeeded();
  return db.select().from(topicsTable).orderBy(asc(topicsTable.sortOrder));
}

/**
 * The admin-injectable content seed. When set it is appended verbatim to the
 * AiAS post-generation system prompt so the operator can steer the AI toward
 * a specific angle, campaign, or keyword cluster without touching code.
 */
export async function getBlockGenSeed(): Promise<string | null> {
  return getRaw(BLOCK_GEN_SEED_KEY);
}

export async function setBlockGenSeed(seed: string): Promise<void> {
  await setRaw(BLOCK_GEN_SEED_KEY, seed.trim());
}

export { SEED_TOPICS };
