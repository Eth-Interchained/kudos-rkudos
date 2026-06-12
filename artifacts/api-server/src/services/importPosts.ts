import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { desc } from "drizzle-orm";
import type { Logger } from "pino";
import { db, blocksTable } from "@workspace/db";
import { computeBlockReward } from "./rewardModel";

/**
 * Imports X posts (saved by scripts/import_x_posts.py) into the blocks table as
 * real reward-earning blocks. These posts already happened on X, so they enter
 * the chain at the lowest heights (earliest post = block 0) and carry the same
 * governance-linked block reward as live auto-mined blocks (a small share of
 * the ITC chain's recent governance reward — see computeBlockReward). They are
 * created as "open" — nothing has settled yet (the chain is not launched), so
 * every imported post is still accepting replies and awaiting settlement: an
 * operator syncs their replies from NetRows, then settles to distribute.
 */

export const REFERENCE_PATH = resolve(process.cwd(), "data/x_posts_reference.json");

interface ReferencePost {
  id: string;
  url?: string;
  text?: string;
  createdAt?: string;
  likes?: number;
  retweets?: number;
}

interface ReferenceFile {
  handle?: string;
  source?: string;
  fetchedAt?: string;
  count?: number;
  posts?: ReferencePost[];
}

export interface ImportResult {
  imported: number;
  skipped: number;
  available: number;
}

function titleFromText(text: string): string {
  const firstLine = (text.split("\n").find((l) => l.trim().length > 0) ?? "").trim();
  if (!firstLine) return "Imported X post";
  return firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine;
}

/** Read the reference file written by the Python importer. Returns null if absent. */
export async function readReferenceFile(): Promise<ReferenceFile | null> {
  try {
    const raw = await readFile(REFERENCE_PATH, "utf8");
    return JSON.parse(raw) as ReferenceFile;
  } catch {
    return null;
  }
}

export async function importReferencePosts(log?: Logger): Promise<ImportResult> {
  const data = await readReferenceFile();
  const posts = Array.isArray(data?.posts) ? data!.posts! : [];
  if (posts.length === 0) {
    return { imported: 0, skipped: 0, available: 0 };
  }

  const handle = data?.handle ?? "interchained";

  const existing = await db
    .select({ xPostId: blocksTable.xPostId })
    .from(blocksTable);
  const existingIds = new Set(
    existing.map((e) => e.xPostId).filter((v): v is string => Boolean(v)),
  );

  const maxRow = await db
    .select({ seq: blocksTable.seq })
    .from(blocksTable)
    .orderBy(desc(blocksTable.seq))
    .limit(1);
  // First imported block is height 0 on a fresh chain; later re-imports append
  // above the current tip.
  let seq = maxRow.length > 0 ? maxRow[0].seq : -1;

  // All imported blocks share the current governance-linked reward (computed
  // once so the import doesn't refetch per post).
  const reward = await computeBlockReward(log);

  let imported = 0;
  let skipped = 0;
  // Oldest-first so block heights increase chronologically.
  for (const p of [...posts].reverse()) {
    if (!p.id || existingIds.has(p.id)) {
      skipped += 1;
      continue;
    }
    seq += 1;
    const text = p.text ?? "";
    const postedAt = p.createdAt ?? null;
    await db.insert(blocksTable).values({
      seq,
      xPostId: p.id,
      xPostUrl: p.url ?? `https://x.com/${handle}/status/${p.id}`,
      postContent: text,
      xPostedAt: postedAt,
      postMode: "imported",
      title: titleFromText(text),
      topic: "",
      rewardItc: reward.rewardItc,
      sponsor: `Imported from X (@${handle})`,
      // Nothing has settled yet (chain not launched): imported posts open for
      // replies and await settlement (sync from NetRows, then settle).
      status: "open",
      opensAt: postedAt,
    });
    existingIds.add(p.id);
    imported += 1;
  }

  log?.info(
    { imported, skipped, handle },
    "Imported X posts as open reward blocks awaiting settlement",
  );
  return { imported, skipped, available: posts.length };
}
