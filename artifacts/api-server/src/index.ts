import app from "./app";
import { logger } from "./lib/logger";
import { seedDatabase } from "./services/seed";
import { startScheduler, startReplySync } from "./services/scheduler";
import { startBlastScheduler } from "./services/blast";
import { ensureForumDefaults, backfillForumFromBlocks } from "./services/forumBridge";
import { getMiningStartHeight } from "./services/settings";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  seedDatabase(logger)
    .then(async () => {
      // rKudos boot backfill: seed forum categories + the @interchained system
      // participant, then materialize threads/posts for all historical blocks,
      // their scored replies, and approved projects. Idempotent — converges in
      // one pass and no-ops on every boot after.
      await ensureForumDefaults();
      await backfillForumFromBlocks(await getMiningStartHeight(), logger);
    })
    .catch((bootErr) => {
      logger.error({ err: bootErr }, "Database seed / rKudos backfill failed");
    })
    .finally(() => {
      startScheduler(logger);
      startBlastScheduler(logger);
      startReplySync(logger);
    });
});
