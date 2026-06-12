import { eq } from "drizzle-orm";
import { db, appSettingsTable } from "@workspace/db";

/**
 * Runtime, operator-tunable settings persisted in the app_settings table.
 * Currently: the "fully automate posting" toggle that lets the scheduler post
 * AiAS-authored block content via the X API during offline times.
 */

const AUTO_POST_KEY = "auto_post_enabled";
const MINING_START_HEIGHT_KEY = "mining_start_height";
const REWARDS_ENABLED_KEY = "rewards_enabled";

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

export async function getAutoPostEnabled(): Promise<boolean> {
  const raw = await getRaw(AUTO_POST_KEY);
  // Default off: posting auto-publishes to X only when an operator opts in.
  return raw === "true";
}

export async function setAutoPostEnabled(enabled: boolean): Promise<void> {
  await setRaw(AUTO_POST_KEY, enabled ? "true" : "false");
}

/**
 * The block height (seq) where the reward/halving schedule begins. The chain
 * starts at block 0 — the earliest imported @interchained post — so this
 * defaults to 0. It acts as a floor for auto-mined live blocks.
 */
export async function getMiningStartHeight(): Promise<number> {
  const raw = await getRaw(MINING_START_HEIGHT_KEY);
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function setMiningStartHeight(height: number): Promise<void> {
  const h = Math.max(0, Math.floor(height));
  await setRaw(MINING_START_HEIGHT_KEY, String(h));
}

/**
 * Master switch for the reward engine. When OFF, blocks do not settle and no
 * payouts are distributed — an operator pause for any reason (e.g. a dispute,
 * maintenance, or before launch). The public countdown freezes while paused.
 * Defaults ON.
 */
export async function getRewardsEnabled(): Promise<boolean> {
  const raw = await getRaw(REWARDS_ENABLED_KEY);
  // Default on: only an explicit "false" pauses rewards.
  return raw !== "false";
}

export async function setRewardsEnabled(enabled: boolean): Promise<void> {
  await setRaw(REWARDS_ENABLED_KEY, enabled ? "true" : "false");
}

const BLAST_ENABLED_KEY = "blast_enabled";

/**
 * Master start/stop switch for the weekly email digest blast. Default OFF — the
 * scheduler only sends the digest once an operator opts in. The per-week
 * idempotent lock (blast_runs.period_key) guarantees at-most-once-per-week even
 * while this is on.
 */
export async function getBlastEnabled(): Promise<boolean> {
  const raw = await getRaw(BLAST_ENABLED_KEY);
  return raw === "true";
}

export async function setBlastEnabled(enabled: boolean): Promise<void> {
  await setRaw(BLAST_ENABLED_KEY, enabled ? "true" : "false");
}

const REPLY_SYNC_ENABLED_KEY = "reply_sync_enabled";

/**
 * Start/stop switch for the standalone reply-sync loop that refreshes replies
 * for the recent open blocks (the rolling window) on a fixed cadence. Default
 * OFF — auto-syncing makes paid NetRows calls, so an operator must opt in. This
 * is independent of the mining scheduler (SCHEDULER_ENABLED) and never settles
 * or closes a block; it only ingests live replies.
 */
export async function getReplySyncEnabled(): Promise<boolean> {
  const raw = await getRaw(REPLY_SYNC_ENABLED_KEY);
  return raw === "true";
}

export async function setReplySyncEnabled(enabled: boolean): Promise<void> {
  await setRaw(REPLY_SYNC_ENABLED_KEY, enabled ? "true" : "false");
}
