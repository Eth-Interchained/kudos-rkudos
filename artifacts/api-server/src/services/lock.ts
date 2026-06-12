/**
 * In-process async mutex keyed by an arbitrary string.
 *
 * The API server runs as a single Node process against a single-writer SQLite
 * file, so an in-memory per-key lock is sufficient to serialize side-effecting
 * work (e.g. posting a block to X) and prevent overlapping scheduler ticks,
 * retries, or concurrent requests from racing each other.
 */
const chains = new Map<string, Promise<unknown>>();

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  // Run fn only after any previously-queued work for this key settles.
  const run = prev.then(fn, fn);
  // Tail swallows errors so one failure does not break the chain or leak an
  // unhandled rejection; the original result/error still propagates via `run`.
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  chains.set(key, tail);
  void tail.then(() => {
    if (chains.get(key) === tail) chains.delete(key);
  });
  return run;
}
