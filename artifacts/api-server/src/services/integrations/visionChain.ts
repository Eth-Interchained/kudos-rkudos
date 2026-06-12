import type { Logger } from "pino";

/**
 * Vision chain adapter — reads live Interchained (ITC) layer-1 stats from the
 * public block explorer API at https://vision.interchained.org/api.
 *
 * Verified endpoints (no auth required):
 *   - GET /api/hashrate      -> { hashrate, label, window_blocks }
 *   - GET /api/difficulty    -> { difficulty, tip_height }
 *   - GET /api/stats/supply  -> { circulating_sats, height, txouts, ... }
 *   - GET /api/blocks        -> { items: [{ height, hash, time, miner_address, ... }] }
 *
 * ITC uses 8 decimals (sats), so circulating ITC = circulating_sats / 1e8.
 * All calls degrade gracefully: if the explorer is unreachable the summary is
 * returned with source = "unavailable" and null/zero fields.
 */

const BASE_URL = "https://vision.interchained.org/api";
const TIMEOUT_MS = 12_000;
const SATS_PER_ITC = 100_000_000;

export interface ChainBlockSummary {
  height: number;
  hash: string;
  time: number;
  minerAddress: string | null;
  explorerUrl: string;
}

export interface ChainStats {
  source: "live" | "unavailable";
  tipHeight: number | null;
  hashrate: number | null;
  hashrateLabel: string | null;
  difficulty: number | null;
  circulatingItc: number | null;
  circulatingSats: number | null;
  windowBlocks: number | null;
  explorerUrl: string;
  recentBlocks: ChainBlockSummary[];
  fetchedAt: string;
}

async function getJson<T>(path: string, log?: Logger): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as T | null;
  } catch (err) {
    log?.warn({ err, path }, "Vision chain request error");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function getChainStats(log?: Logger): Promise<ChainStats> {
  const [hashrate, difficulty, supply, blocks] = await Promise.all([
    getJson<{ hashrate?: number; label?: string; window_blocks?: number }>(
      "/hashrate",
      log,
    ),
    getJson<{ difficulty?: number; tip_height?: number }>("/difficulty", log),
    getJson<{ circulating_sats?: number; height?: number }>(
      "/stats/supply",
      log,
    ),
    getJson<{
      items?: Array<{
        height?: number;
        hash?: string;
        time?: number;
        miner_address?: string | null;
      }>;
    }>("/blocks", log),
  ]);

  const anyLive = Boolean(hashrate || difficulty || supply || blocks);
  const circulatingSats = num(supply?.circulating_sats);
  const recentBlocks: ChainBlockSummary[] = (blocks?.items ?? [])
    .slice(0, 8)
    .filter((b): b is { height: number; hash: string; time: number; miner_address: string | null } =>
      typeof b?.height === "number" && typeof b?.hash === "string",
    )
    .map((b) => ({
      height: b.height,
      hash: b.hash,
      time: typeof b.time === "number" ? b.time : 0,
      minerAddress: b.miner_address ?? null,
      explorerUrl: `https://vision.interchained.org/block/${b.hash}`,
    }));

  return {
    source: anyLive ? "live" : "unavailable",
    tipHeight: num(difficulty?.tip_height) ?? num(supply?.height),
    hashrate: num(hashrate?.hashrate),
    hashrateLabel: typeof hashrate?.label === "string" ? hashrate.label : null,
    difficulty: num(difficulty?.difficulty),
    circulatingItc:
      circulatingSats != null ? circulatingSats / SATS_PER_ITC : null,
    circulatingSats,
    windowBlocks: num(hashrate?.window_blocks),
    explorerUrl: "https://vision.interchained.org",
    recentBlocks,
    fetchedAt: new Date().toISOString(),
  };
}

interface BlockDetail {
  txids?: string[];
  merkleroot?: string;
}

interface TxDetail {
  outputs?: Array<{ value_sats?: number; address?: string | null }>;
}

// The governance reward changes slowly block-to-block, so cache the aggregate
// to avoid re-walking ~20 explorer requests on every settlement / settings read.
const GOV_CACHE_TTL_MS = 5 * 60_000;
let govCache: { key: string; value: number | null; at: number } | null = null;

/**
 * Sum of the governance (treasury) coinbase output across the last `blocks`
 * confirmed ITC blocks, in ITC. We read the realized coinbase outputs (not the
 * pending block template) so "N blocks worth" reflects actual on-chain rewards.
 *
 * For each recent block we fetch its coinbase transaction and sum the outputs
 * paying `governanceAddress`. If some blocks fail to fetch we average over the
 * ones that succeeded and scale to `blocks`, so a transient explorer hiccup
 * yields a consistent estimate rather than an artificially low sum. Returns
 * null only when no governance output could be read at all.
 */
export async function getGovernanceRewardSumItc(
  blocks: number,
  governanceAddress: string,
  log?: Logger,
): Promise<number | null> {
  const key = `${blocks}:${governanceAddress}`;
  const now = Date.now();
  if (govCache && govCache.key === key && now - govCache.at < GOV_CACHE_TTL_MS) {
    return govCache.value;
  }

  const list = await getJson<{ items?: Array<{ hash?: string }> }>(
    "/blocks",
    log,
  );
  const hashes = (list?.items ?? [])
    .map((b) => b?.hash)
    .filter((h): h is string => typeof h === "string")
    .slice(0, blocks);

  if (hashes.length === 0) {
    govCache = { key, value: null, at: now };
    return null;
  }

  let sumSats = 0;
  let counted = 0;
  await Promise.all(
    hashes.map(async (hash) => {
      const block = await getJson<BlockDetail>(`/block/${hash}`, log);
      const coinbaseTxid = block?.txids?.[0] ?? block?.merkleroot;
      if (!coinbaseTxid) return;
      const tx = await getJson<TxDetail>(`/tx/${coinbaseTxid}`, log);
      const govSats = (tx?.outputs ?? [])
        .filter((o) => o?.address === governanceAddress)
        .reduce(
          (s, o) => s + (typeof o.value_sats === "number" ? o.value_sats : 0),
          0,
        );
      if (govSats > 0) {
        sumSats += govSats;
        counted += 1;
      }
    }),
  );

  if (counted === 0) {
    govCache = { key, value: null, at: now };
    return null;
  }

  // Average over the blocks we read, scaled to the requested window.
  const value = ((sumSats / counted) * blocks) / SATS_PER_ITC;
  govCache = { key, value, at: now };
  return value;
}
