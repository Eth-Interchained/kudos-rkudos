import type { Logger } from "pino";
import { type AiScores } from "../scoring";
import { secret } from "../config";

/**
 * AiAS = AiAssist.net — the AI Assessment Service that grades replies.
 * Real data only: calls AiAssist.net when AIAS_API_KEY is set. There is NO
 * simulated/heuristic fallback. When the key is missing or the call fails,
 * scoreReply returns null; callers treat that as ScoringUnavailable and surface
 * it (the reply is NOT credited) rather than masking it. generateBlockPost
 * throws the raw error.
 *
 * Verified against the live OpenAPI spec (https://aiassist.net/openapi.json):
 *   - POST /v1/chat/completions on host api.aiassist.net (OpenAI-compatible)
 *   - auth: Authorization: Bearer <key>
 *   - ChatCompletionRequest supports: model, messages, temperature,
 *     max_tokens/max_completion_tokens, stream, tools, tool_choice, systemPrompt.
 *     (No response_format field — JSON output is requested via the prompt and
 *     extracted defensively from the message content.)
 *   - Response is the standard chat-completion shape: choices[].message.content.
 */

const DEFAULT_URL = "https://api.aiassist.net/v1/chat/completions";
const DEFAULT_MODEL = "claude-haiku-4-5";
// Claude models on AiAssist.net are served by the Anthropic provider. Without
// this header AiAS routes to its default provider (Groq), which does not host
// the claude-* models and returns a 400 ("model does not exist").
const DEFAULT_PROVIDER = "anthropic";

const CHAT_PATH = "/v1/chat/completions";

/**
 * Resolve the chat-completions endpoint from the optional AIAS_API_URL override.
 *
 * AIAS_API_URL is treated as a BASE url and the OpenAI-compatible chat path is
 * appended when missing. This tolerates every common form:
 *   - unset                                  -> DEFAULT_URL
 *   - https://api.aiassist.net               -> .../v1/chat/completions
 *   - https://api.aiassist.net/              -> .../v1/chat/completions
 *   - https://api.aiassist.net/v1            -> .../v1/chat/completions
 *   - https://api.aiassist.net/v1/chat/completions -> used as-is
 *
 * Previously the override was used verbatim, so setting it to a bare host made
 * the bot POST to "/" and get back "405 Method Not Allowed".
 */
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

export function aiasMode(): "aiassist" | "unconfigured" {
  return secret("AIAS_API_KEY") ? "aiassist" : "unconfigured";
}

interface ScoreContext {
  topic: string;
  requiredKeywords: string[];
  bonusKeywords: string[];
  blockTitle: string;
}

/**
 * Grade a reply with AiAS. Returns null (never a fabricated score) when AiAS is
 * not configured or the call fails — callers surface this as ScoringUnavailable
 * so the reply is left uncredited and the failure is visible, not swallowed.
 */
export async function scoreReply(
  replyText: string,
  ctx: ScoreContext,
  log?: Logger,
): Promise<AiScores | null> {
  const apiKey = secret("AIAS_API_KEY");
  if (!apiKey) {
    log?.warn("AiAS not configured (AIAS_API_KEY missing); skipping scoring");
    return null;
  }

  const url = resolveAiasUrl();
  const model = secret("AIAS_MODEL") ?? DEFAULT_MODEL;
  const prompt = buildPrompt(replyText, ctx);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: aiasHeaders(apiKey),
      body: JSON.stringify({
        model,
        max_tokens: 400,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You are AiAS, a strict, terse assessor of social replies for a crypto mining gameshow. Output ONLY a single JSON object, no prose.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      log?.warn({ status: res.status, body }, "AiAS call failed; skipping");
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson(text);
    if (!parsed) {
      log?.warn({ text }, "AiAS returned unparseable output; skipping");
      return null;
    }
    return normalizeScores(parsed);
  } catch (err) {
    log?.warn({ err }, "AiAS request error; skipping");
    return null;
  }
}

/**
 * Generic AiAS chat helper for the rKudos agentic layer (summaries, Ask AiAS,
 * moderation triage). Returns null (never fabricated text) when AiAS is not
 * configured or the call fails, so callers degrade gracefully.
 */
export async function aiasChat(
  messages: Array<{ role: string; content: string }>,
  opts?: { maxTokens?: number; temperature?: number },
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
        max_tokens: opts?.maxTokens ?? 400,
        temperature: opts?.temperature ?? 0.3,
        messages,
      }),
    });
    if (!res.ok) {
      log?.warn({ status: res.status }, "AiAS chat failed");
      return null;
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = (data.choices?.[0]?.message?.content ?? "").trim();
    return text || null;
  } catch (err) {
    log?.warn({ err }, "AiAS chat error");
    return null;
  }
}

// ---- Block post generation ("AiAS cooks the content") --------------------

export interface BlockPostContext {
  seq: number;
  title: string;
  topic: string;
  requiredKeywords: string[];
  bonusKeywords: string[];
  sponsor?: string | null;
}

const POST_MAX = 280;

/**
 * AiAS authors the X post that announces a mining block. Real data only — asks
 * AiAssist.net for an engaging, on-topic prompt. Throws the raw error when AiAS
 * is not configured or the call fails (no simulated fallback).
 */
export async function generateBlockPost(
  ctx: BlockPostContext,
  log?: Logger,
): Promise<string> {
  const apiKey = secret("AIAS_API_KEY");
  if (!apiKey) {
    throw new Error("AiAS not configured (AIAS_API_KEY missing)");
  }

  const url = resolveAiasUrl();
  const model = secret("AIAS_MODEL") ?? DEFAULT_MODEL;

  const res = await fetch(url, {
    method: "POST",
    headers: aiasHeaders(apiKey),
    body: JSON.stringify({
      model,
      max_tokens: 200,
      temperature: 0.8,
      messages: [
        {
          role: "system",
          content:
            "You are AiAS, the host of a transparency-first crypto mining gameshow that pays $ITC for high-quality original replies. Write a single engaging X (Twitter) post that opens a new 'mining block'. Keep it under 280 characters, pose a clear question/prompt on the topic, invite original replies, and add 1-2 relevant hashtags. No emojis spam, no financial promises, no giveaways. Output ONLY the post text.",
        },
        { role: "user", content: buildPostPrompt(ctx) },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    log?.warn({ status: res.status, body }, "AiAS generateBlockPost failed");
    throw new Error(`AiAS generateBlockPost failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = (data.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("AiAS generateBlockPost returned empty content");
  return clampPost(text);
}

function buildPostPrompt(ctx: BlockPostContext): string {
  return `MINING BLOCK #${ctx.seq}
TITLE: ${ctx.title}
TOPIC: ${ctx.topic}
REQUIRED KEYWORDS: ${ctx.requiredKeywords.join(", ") || "(none)"}
BONUS KEYWORDS: ${ctx.bonusKeywords.join(", ") || "(none)"}
${ctx.sponsor ? `SPONSOR: ${ctx.sponsor}` : ""}

Write the X post that opens this block.`;
}

function clampPost(text: string): string {
  const oneLine = text.replace(/^["']|["']$/g, "").trim();
  if (oneLine.length <= POST_MAX) return oneLine;
  return `${oneLine.slice(0, POST_MAX - 1).trimEnd()}…`;
}

function buildPrompt(replyText: string, ctx: ScoreContext): string {
  return `Assess this reply to a mining block (X post).

BLOCK TITLE: ${ctx.blockTitle}
TOPIC: ${ctx.topic}
REQUIRED KEYWORDS: ${ctx.requiredKeywords.join(", ") || "(none)"}
BONUS KEYWORDS: ${ctx.bonusKeywords.join(", ") || "(none)"}

REPLY:
"""
${replyText}
"""

Return a JSON object with EXACTLY these fields:
{
  "relevance": 0-100,
  "originality": 0-100,
  "correctness": 0-100,
  "specificity": 0-100,
  "isSpam": boolean,
  "isGenericFiller": boolean,
  "rationale": "one short sentence"
}
Score harshly. Generic praise, emoji-only, or off-topic replies should score low. Promotional/airdrop/giveaway content is spam.`;
}

function extractJson(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
}

function normalizeScores(raw: Record<string, unknown>): AiScores {
  return {
    relevance: clamp(raw.relevance as number),
    originality: clamp(raw.originality as number),
    correctness: clamp(raw.correctness as number),
    specificity: clamp(raw.specificity as number),
    isSpam: Boolean(raw.isSpam),
    isGenericFiller: Boolean(raw.isGenericFiller),
    rationale:
      typeof raw.rationale === "string" ? raw.rationale : "Assessed by AiAS.",
  };
}
