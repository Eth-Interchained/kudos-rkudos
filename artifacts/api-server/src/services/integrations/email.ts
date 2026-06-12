import nodemailer, { type Transporter } from "nodemailer";
import type { Logger } from "pino";

/**
 * Email sender backed by a real SMTP server (e.g. a self-hosted Mail-in-a-Box).
 *
 * There is deliberately NO simulation fallback: if SMTP is not configured or a
 * send fails, we throw the raw error. Operators must wire real credentials
 * before the weekly digest can go out.
 *
 * Config (all required to send):
 *   SMTP_HOST     — mail server hostname (e.g. box.example.com)
 *   SMTP_PORT     — submission port (default 587, STARTTLS)
 *   SMTP_USER     — full mailbox address used to authenticate
 *   SMTP_PASSWORD — mailbox password (preferred). Falls back to the legacy
 *                   SMTP_PASS only if SMTP_PASSWORD is not set.
 *   SMTP_FROM     — From address (defaults to SMTP_USER)
 */

function smtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  // Prefer the new SMTP_PASSWORD key; fall back to the legacy SMTP_PASS.
  const pass = process.env.SMTP_PASSWORD ?? process.env.SMTP_PASS;
  const port = Number.parseInt(process.env.SMTP_PORT ?? "587", 10);
  const from = process.env.SMTP_FROM?.trim() || user;
  return { host, user, pass, port, from };
}

export function emailConfigured(): boolean {
  const { host, user, pass } = smtpConfig();
  return Boolean(host && user && pass);
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  const { host, user, pass, port } = smtpConfig();
  if (!host || !user || !pass) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS (and optionally SMTP_PORT / SMTP_FROM) to send email.",
    );
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
      // Mandate TLS on non-implicit ports (e.g. 587): require a successful
      // STARTTLS upgrade and refuse to send credentials over cleartext.
      requireTLS: port !== 465,
      auth: { user, pass },
    });
  }
  return transporter;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Send one email. Throws the raw SMTP/transport error on any failure.
 */
export async function sendEmail(input: SendEmailInput, log?: Logger): Promise<void> {
  const { from } = smtpConfig();
  const tx = getTransporter();
  const info = await tx.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
  log?.info({ to: input.to, messageId: info.messageId }, "email sent");
}
