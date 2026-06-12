const num = (key: string, fallback: number): number => {
  const v = process.env[key];
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const str = (key: string, fallback: string): string => {
  const v = process.env[key];
  return v === undefined || v.trim() === "" ? fallback : v.trim();
};

const bool = (key: string): boolean =>
  ["1", "true", "yes"].includes((process.env[key] ?? "").toLowerCase());

/**
 * Read a secret/credential env var defensively. Strips a single pair of
 * surrounding quotes (a common `.env` mistake, e.g. `KEY="abc"`) and trims
 * whitespace. Returns undefined when unset or empty after cleaning, so a blank
 * or quote-only value reads as "not configured" instead of being sent as a
 * broken credential (which used to fail auth and silently drop work).
 */
export const secret = (key: string): string | undefined => {
  const raw = process.env[key];
  if (raw === undefined) return undefined;
  let v = raw.trim();
  if (
    v.length >= 2 &&
    ((v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'")))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v === "" ? undefined : v;
};

export const treasuryConfig = () => ({
  hotWalletBalanceItc: num("HOT_WALLET_BALANCE_ITC", 1_000_000),
  dailyCapItc: num("DAILY_CAP_ITC", 50_000),
  autoApproveUnderItc: num("AUTO_APPROVE_UNDER_ITC", 50),
  perAccountCapItc: num("PER_ACCOUNT_CAP_ITC", 500),
});

/**
 * Governance-linked block reward. Each social-mining block's reward pool is
 * derived from the real Interchained (ITC) layer-1 chain: take the governance
 * (treasury) coinbase output of the last `governanceBlocks` blocks, sum them,
 * and pay `governanceShare` (e.g. 10%) of that sum. This keeps emission small
 * and pegged to the live chain instead of a fixed local subsidy.
 *
 * The governance output is the constant coinbase address the ITC node pays its
 * treasury share to (override with ITC_GOVERNANCE_ADDRESS if the chain rotates
 * it). `fallbackRewardItc` is used only when the explorer is unreachable.
 *
 * `autoBroadcast` opts in to disbursing approved, wallet-bound payouts on-chain
 * automatically after each block settles (mainnet). Off by default so dev /
 * simulated runs never fire an unattended send.
 */
export const rewardModelConfig = () => ({
  governanceBlocks: num("GOV_REWARD_BLOCKS", 10),
  governanceShare: num("GOV_REWARD_SHARE", 0.1),
  governanceAddress: str(
    "ITC_GOVERNANCE_ADDRESS",
    "itc1qg408c5vw9u4s47e5l5v5q0s0u98hprg8w94ffp",
  ),
  fallbackRewardItc: num("BLOCK_REWARD_FALLBACK_ITC", 0.6),
  autoBroadcast: bool("AUTO_BROADCAST_PAYOUTS"),
});

export const scoringConfig = () => ({
  defaultQualityFloor: num("QUALITY_FLOOR", 60),
  defaultTrustFloor: num("TRUST_FLOOR", 0.2),
  duplicateSimilarityThreshold: num("DUP_SIM_THRESHOLD", 0.85),
});

/**
 * Cadence config for the auto-mined block chain. Blocks are "solved" on a fixed
 * interval; the reward itself is governance-linked (see rewardModelConfig /
 * computeBlockReward), not a halving subsidy.
 */
export const emissionConfig = () => ({
  blockIntervalMs: num("BLOCK_INTERVAL_MS", 600_000), // 10 minutes
  syncIntervalMs: num("NETROWS_SYNC_INTERVAL_MS", 120_000), // 2 minutes
  // Cadence for the standalone reply-sync loop that refreshes replies for the
  // recent open blocks (the rolling 20-post window). Independent of block
  // mining/settlement so it never closes a block. Default 10 minutes.
  replySyncIntervalMs: num("REPLY_SYNC_INTERVAL_MS", 600_000), // 10 minutes
  replySyncWindow: num("REPLY_SYNC_WINDOW", 20), // most-recent open posts to sync
  // Off by default: the cadence triggers paid NetRows reply syncing, so an
  // operator must explicitly opt in (SCHEDULER_ENABLED=true) before any
  // autonomous block mining / NetRows calls run.
  schedulerEnabled: process.env.SCHEDULER_ENABLED === "true",
});
