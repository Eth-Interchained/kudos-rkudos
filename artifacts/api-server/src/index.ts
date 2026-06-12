import app from "./app";
import { logger } from "./lib/logger";
import { seedDatabase } from "./services/seed";
import { startScheduler, startReplySync } from "./services/scheduler";
import { startBlastScheduler } from "./services/blast";

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
    .catch((seedErr) => {
      logger.error({ err: seedErr }, "Database seed failed");
    })
    .finally(() => {
      startScheduler(logger);
      startBlastScheduler(logger);
      startReplySync(logger);
    });
});
