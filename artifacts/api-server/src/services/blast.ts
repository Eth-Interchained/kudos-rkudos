import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  blocksTable,
  subscribersTable,
  blastRunsTable,
  type BlastRun,
} from "@workspace/db";
import { sendEmail, emailConfigured } from "./integrations/email";
import { getBlastEnabled } from "./settings";

/**
 * ISO-8601 week key, e.g. "2026-W23". This is the idempotent lock used by
 * blast_runs.period_key: at most one blast per ISO week.
 */
export function currentPeriodKey(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Thursday in current week decides the year.
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week =
    1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function publicBaseUrl(): string {
  const explicit = process.env.PUBLIC_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const dev = process.env.REPLIT_DEV_DOMAIN?.trim();
  if (dev) return `https://${dev}`;
  return "http://localhost:8080";
}

export interface Digest {
  html: string;
  text: string;
  postCount: number;
}

interface DigestPost {
  seq: number;
  title: string;
  content: string;
  url: string;
}

/**
 * Snapshot of the posts that anchored mining blocks in the last 7 days, each
 * linking back to X. Falls back to the 10 most recent linked posts if nothing
 * landed in the window, so the digest is never empty.
 */
export async function buildDigest(log?: Logger): Promise<Digest> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  let rows = await db
    .select()
    .from(blocksTable)
    .where(and(isNotNull(blocksTable.xPostUrl), gte(blocksTable.createdAt, weekAgo)))
    .orderBy(desc(blocksTable.seq));

  if (rows.length === 0) {
    rows = await db
      .select()
      .from(blocksTable)
      .where(isNotNull(blocksTable.xPostUrl))
      .orderBy(desc(blocksTable.seq))
      .limit(10);
  }

  const posts: DigestPost[] = rows
    .filter((b) => b.xPostUrl)
    .map((b) => ({
      seq: b.seq,
      title: b.title,
      content: b.postContent ?? "",
      url: b.xPostUrl as string,
    }));

  log?.info({ postCount: posts.length }, "digest built");

  const itemsHtml = posts
    .map(
      (p) => `
      <tr><td style="padding:12px 0;border-bottom:1px solid #eee;">
        <div style="font-weight:700;font-size:15px;">Block #${p.seq} — ${escapeHtml(p.title)}</div>
        ${p.content ? `<div style="color:#444;font-size:14px;margin:6px 0;">${escapeHtml(truncate(p.content, 240))}</div>` : ""}
        <a href="${p.url}" style="color:#1d4ed8;font-size:14px;">View on X →</a>
      </td></tr>`,
    )
    .join("");

  const itemsText = posts
    .map((p) => `• Block #${p.seq} — ${p.title}\n  ${truncate(p.content, 240)}\n  ${p.url}`)
    .join("\n\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;">
      <h1 style="font-size:22px;text-transform:uppercase;">Interchained Social Mining — Weekly Snapshot</h1>
      <p style="color:#444;">The recent posts powering the chain this week:</p>
      <table style="width:100%;border-collapse:collapse;">${itemsHtml || "<tr><td>No posts this week.</td></tr>"}</table>
    </div>`;

  const text = `Interchained Social Mining — Weekly Snapshot\n\nThe recent posts powering the chain this week:\n\n${itemsText || "No posts this week."}`;

  return { html, text, postCount: posts.length };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export interface BlastResult {
  status: "sent" | "skipped" | "failed";
  reason?: string;
  periodKey?: string;
  recipientCount?: number;
  postCount?: number;
  run?: BlastRun;
}

/**
 * Run the weekly digest blast. Idempotent per ISO week via the blast_runs
 * unique period_key lock, so calling this repeatedly (scheduler or manual) only
 * sends once per week. Throws raw errors (no simulation) when SMTP is
 * unconfigured or every send fails.
 *
 * @param force when true, bypass the blastEnabled master switch (used by the
 *   admin "run now" action). The per-week lock still applies.
 */
export async function runWeeklyBlast(
  opts: { force?: boolean; log?: Logger } = {},
): Promise<BlastResult> {
  const { force = false, log } = opts;

  if (!force && !(await getBlastEnabled())) {
    return { status: "skipped", reason: "disabled" };
  }
  if (!emailConfigured()) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS to enable the weekly blast.",
    );
  }

  const periodKey = currentPeriodKey();

  // The lock: insert wins exactly once per ISO week; a conflict means this week
  // already ran (or is running). A *failed* prior run is retryable — we clear it
  // and re-acquire — so a transient SMTP error doesn't strand the week. Only a
  // "sent" (success) or "running" (in-flight) run holds the lock.
  let inserted = await db
    .insert(blastRunsTable)
    .values({ periodKey, status: "running" })
    .onConflictDoNothing({ target: blastRunsTable.periodKey })
    .returning();

  if (inserted.length === 0) {
    const existing = await db
      .select()
      .from(blastRunsTable)
      .where(eq(blastRunsTable.periodKey, periodKey))
      .limit(1);
    if (existing[0]?.status !== "failed") {
      return { status: "skipped", reason: "already-ran", periodKey, run: existing[0] };
    }
    // Retry: drop the failed row and re-acquire the lock for this week.
    await db.delete(blastRunsTable).where(eq(blastRunsTable.id, existing[0].id));
    inserted = await db
      .insert(blastRunsTable)
      .values({ periodKey, status: "running" })
      .onConflictDoNothing({ target: blastRunsTable.periodKey })
      .returning();
    if (inserted.length === 0) {
      const current = await db
        .select()
        .from(blastRunsTable)
        .where(eq(blastRunsTable.periodKey, periodKey))
        .limit(1);
      return { status: "skipped", reason: "already-ran", periodKey, run: current[0] };
    }
  }

  const run = inserted[0];

  // Tracks whether at least one email actually left the building. Once true, the
  // run MUST NOT be downgraded to the retryable "failed" state — otherwise a
  // retry would resend to recipients who already received this week's digest.
  let anySent = false;

  try {
    const digest = await buildDigest(log);
    const subs = await db
      .select()
      .from(subscribersTable)
      .where(eq(subscribersTable.status, "active"));

    let sent = 0;
    const errors: string[] = [];
    for (const sub of subs) {
      const unsubUrl = `${publicBaseUrl()}/api/subscribers/unsubscribe?token=${sub.unsubToken}`;
      const footerHtml = `<p style="color:#999;font-size:12px;margin-top:24px;">You're receiving this because you subscribed. <a href="${unsubUrl}">Unsubscribe</a>.</p>`;
      const footerText = `\n\n— You're receiving this because you subscribed. Unsubscribe: ${unsubUrl}`;
      try {
        await sendEmail(
          {
            to: sub.email,
            subject: `Interchained Social Mining — Weekly Snapshot (${periodKey})`,
            html: digest.html + footerHtml,
            text: digest.text + footerText,
          },
          log,
        );
        sent += 1;
        anySent = true;
      } catch (err) {
        errors.push(`${sub.email}: ${(err as Error).message}`);
        log?.error({ err, to: sub.email }, "blast send failed for recipient");
      }
    }

    const failedAll = subs.length > 0 && sent === 0;
    const now = new Date().toISOString();
    await db
      .update(blastRunsTable)
      .set({
        status: failedAll ? "failed" : "sent",
        recipientCount: sent,
        postCount: digest.postCount,
        error: errors.length ? errors.join("; ").slice(0, 800) : null,
        completedAt: now,
      })
      .where(eq(blastRunsTable.id, run.id));

    if (failedAll) {
      throw new Error(errors[0] ?? "All sends failed");
    }

    return { status: "sent", periodKey, recipientCount: sent, postCount: digest.postCount };
  } catch (err) {
    // If any email already went out, the week is done — record it as "sent"
    // (terminal, non-retryable) so post-send bookkeeping failures can never
    // trigger a retry that resends to recipients who already got the digest.
    // Only when nothing was sent is the run left "failed" (retryable).
    await db
      .update(blastRunsTable)
      .set({
        status: anySent ? "sent" : "failed",
        error: (err as Error).message.slice(0, 800),
        completedAt: new Date().toISOString(),
      })
      .where(eq(blastRunsTable.id, run.id));
    throw err;
  }
}

let blastTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the weekly-blast checker. Runs hourly and is independent of the mining
 * scheduler (SCHEDULER_ENABLED) — it acts only when the blastEnabled switch is
 * on, and the per-week lock keeps it to one send per ISO week.
 */
export function startBlastScheduler(log?: Logger): void {
  if (blastTimer) return;
  const tick = () => {
    runWeeklyBlast({ log }).catch((err) =>
      log?.error({ err }, "weekly blast tick failed"),
    );
  };
  blastTimer = setInterval(tick, 60 * 60 * 1000);
  log?.info("Blast scheduler started (hourly check, gated by blastEnabled)");
}
