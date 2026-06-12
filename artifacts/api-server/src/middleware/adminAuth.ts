import { createHash, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const sha256Hex = (s: string): string =>
  createHash("sha256").update(s, "utf8").digest("hex");

function extractToken(req: Request): string | null {
  const auth = req.header("authorization");
  if (auth && /^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, "").trim() || null;
  }
  const x = req.header("x-admin-token");
  return x ? x.trim() || null : null;
}

/**
 * Gate admin/console actions behind a shared operator token.
 *
 * The server never stores the raw token: `ADMIN_TOKEN_SHA256` holds the
 * hex SHA-256 of the token. A request supplies the raw token via
 * `Authorization: Bearer <token>` (or `X-Admin-Token`); we hash it and
 * compare in constant time. Fails closed when the hash env var is unset.
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const expected = process.env.ADMIN_TOKEN_SHA256?.trim().toLowerCase();
  if (!expected || !/^[0-9a-f]{64}$/.test(expected)) {
    res.status(503).json({
      error:
        "Admin auth is not configured. Set ADMIN_TOKEN_SHA256 to the hex SHA-256 of your admin token.",
    });
    return;
  }

  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Admin token required" });
    return;
  }

  const provided = sha256Hex(token);
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).json({ error: "Invalid admin token" });
    return;
  }

  next();
}
