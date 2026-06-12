import type { Logger } from "pino";
import { getGovernanceRewardSumItc } from "./integrations/visionChain";
import { rewardModelConfig } from "./config";

const floor8 = (n: number) => Math.floor(n * 1e8) / 1e8;

export interface BlockRewardInfo {
  /** Reward pool minted into a new social-mining block, in ITC. */
  rewardItc: number;
  /** Sum of the ITC governance reward over the sampled window (null = fallback). */
  governanceRewardSumItc: number | null;
  /** How many ITC blocks were summed. */
  governanceBlocks: number;
  /** Share of the governance sum paid out, as a percentage (e.g. 10). */
  governanceSharePct: number;
  /** True when the reward came from the live chain, false when it fell back. */
  sourceLive: boolean;
}

/**
 * Governance-linked block reward: pay `governanceShare` (default 10%) of the
 * governance/treasury coinbase reward summed over the last `governanceBlocks`
 * (default 10) real ITC blocks — i.e. 10% × the 10-block governance sum, read
 * live from the chain so it is immutable and self-verifying. Falls back to a
 * small fixed reward when the explorer is unreachable so block production never
 * stalls.
 */
export async function computeBlockReward(log?: Logger): Promise<BlockRewardInfo> {
  const cfg = rewardModelConfig();
  const sum = await getGovernanceRewardSumItc(
    cfg.governanceBlocks,
    cfg.governanceAddress,
    log,
  );

  if (sum == null || sum <= 0) {
    return {
      rewardItc: floor8(cfg.fallbackRewardItc),
      governanceRewardSumItc: null,
      governanceBlocks: cfg.governanceBlocks,
      governanceSharePct: cfg.governanceShare * 100,
      sourceLive: false,
    };
  }

  // 10% of the governance reward summed over the last N real ITC blocks.
  return {
    rewardItc: Math.max(floor8(sum * cfg.governanceShare), 0),
    governanceRewardSumItc: floor8(sum),
    governanceBlocks: cfg.governanceBlocks,
    governanceSharePct: cfg.governanceShare * 100,
    sourceLive: true,
  };
}
