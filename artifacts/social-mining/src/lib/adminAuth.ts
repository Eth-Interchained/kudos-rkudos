import { setAuthTokenGetter } from "@workspace/api-client-react";

const STORAGE_KEY = "sm_admin_token";

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    /* ignore storage failures (private mode, etc.) */
  }
}

export function clearAdminToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Validate a candidate admin token against the API. The server compares a
 * SHA-256 of the token to ADMIN_TOKEN_SHA256 and returns 200 when it matches.
 */
export async function validateAdminToken(token: string): Promise<boolean> {
  try {
    const res = await fetch("/api/admin/session", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

let registered = false;

/**
 * Wire the stored admin token into the generated API client so every request
 * carries `Authorization: Bearer <token>` automatically.
 */
export function registerAdminAuth(): void {
  if (registered) return;
  registered = true;
  setAuthTokenGetter(() => getAdminToken());
}
