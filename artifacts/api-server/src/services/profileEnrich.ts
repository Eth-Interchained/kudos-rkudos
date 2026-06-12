import { eq } from "drizzle-orm";
import { db, participantsTable } from "@workspace/db";
import { fetchUserInfo } from "./integrations/netrows";
import { secret } from "./config";
import type { Logger } from "pino";

/**
 * X profile enrichment + AiAS Kudos bio generation.
 *
 * Called fire-and-forget after a new participant appears in the reply pipeline.
 * Safe to call repeatedly — skips if enriched in the last 24 h.
 */

const ENRICH_TTL_MS = 24 * 60 * 60 * 1_000; // re-enrich after 24 h

const DEFAULT_URL = "https://api.aiassist.net/v1/chat/completions";
const DEFAULT_MODEL = "claude-haiku-4-5";
const DEFAULT_PROVIDER = "anthropic";
const CHAT_PATH = "/v1/chat/completions";

function resolveAiasUrl(): string {
  const raw = secret("AIAS_API_URL");
  if (!raw) return DEFAULT_URL;
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_URL;
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`;
  return `${trimmed}${CHAT_PATH}`;
}

function aiasHeaders(apiKey: string): Record<string, string> {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
    "x-aiassist-provider": secret("AIAS_PROVIDER") ?? DEFAULT_PROVIDER,
  };
}

async function generateKudosBio(
  handle: string,
  displayName: string,
  xBio: string,
  followers: number,
  totalHashpower: number,
  validReplies: number,
  log?: Logger,
): Promise<string | null> {
  const apiKey = secret("AIAS_API_KEY");
  if (!apiKey) return null;

  const url = resolveAiasUrl();
  const model = secret("AIAS_MODEL") ?? DEFAULT_MODEL;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: aiasHeaders(apiKey),
      body: JSON.stringify({
        model,
        max_tokens: 150,
        temperature: 0.85,
        messages: [
          {
            role: "system",
            content:
              "You are the Kudos AI writing a miner bio for the Kudos social-mining platform. Write a punchy 2-sentence bio in third person that captures this miner's identity, expertise, and social mining activity. Make it feel like a crypto trading card bio. Be specific, never generic. No emojis. Output ONLY the bio text.",
          },
          {
            role: "user",
            content: `MINER: @${handle} (${displayName})
X BIO: "${xBio || "No bio set."}"
FOLLOWERS: ${followers.toLocaleString()}
VALID MINING REPLIES: ${validReplies}
TOTAL HASHPOWER: ${totalHashpower.toFixed(0)}

Write their Kudos miner bio.`,
          },
        ],
      }),
    });

    if (!res.ok) {
      log?.warn({ status: res.status }, "profileEnrich: AiAS bio response not ok");
      return null;
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim() ?? null;
    return text || null;
  } catch (err) {
    log?.warn({ err }, "profileEnrich: AiAS bio generation failed");
    return null;
  }
}

export async function enrichParticipant(
  participantId: string,
  handle: string,
  totalHashpower = 0,
  validReplies = 0,
  log?: Logger,
): Promise<void> {
  // Check TTL — skip recent enrichments
  const rows = await db
    .select({ enrichedAt: participantsTable.enrichedAt })
    .from(participantsTable)
    .where(eq(participantsTable.id, participantId))
    .limit(1);

  const enrichedAt = rows[0]?.enrichedAt;
  if (enrichedAt) {
    const age = Date.now() - new Date(enrichedAt).getTime();
    if (age < ENRICH_TTL_MS) {
      log?.debug({ handle }, "profileEnrich: skipping — enriched recently");
      return;
    }
  }

  log?.info({ handle }, "profileEnrich: fetching X profile");

  // Pull X profile via NetRows (free for us — already paying per reply sync)
  const profile = await fetchUserInfo(handle, log);
  if (!profile) {
    log?.warn({ handle }, "profileEnrich: NetRows returned no profile");
    return;
  }

  // Generate Kudos bio via AiAS
  const kudosBio = await generateKudosBio(
    handle,
    profile.name,
    profile.bio || "",
    profile.followers,
    totalHashpower,
    validReplies,
    log,
  );

  await db
    .update(participantsTable)
    .set({
      displayName: profile.name || handle,
      avatarUrl: profile.avatar || null,
      followersCount: profile.followers,
      kudosBio: kudosBio ?? undefined,
      enrichedAt: new Date().toISOString(),
    })
    .where(eq(participantsTable.id, participantId));

  log?.info({ handle, kudosBio: !!kudosBio }, "profileEnrich: done");
}
