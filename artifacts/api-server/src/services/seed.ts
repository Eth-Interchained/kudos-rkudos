import type { Logger } from "pino";
import { db, blocksTable } from "@workspace/db";
import { importReferencePosts } from "./importPosts";

/** Idempotent seed: imports the real @interchained X posts as reward blocks. */
export async function seedDatabase(log?: Logger): Promise<void> {
  const existing = await db.select({ id: blocksTable.id }).from(blocksTable).limit(1);
  if (existing[0]) return;
  log?.info("Importing real @interchained X posts as reward blocks...");
  await importReferencePosts(log);
}
