import { getAdminToken } from "@/lib/adminAuth";

/**
 * rKudos forum API client (plain fetch; pairs with @tanstack/react-query in the
 * pages). Reads are open; miner writes send mining-key identity in the body;
 * admin calls attach the operator bearer token.
 */

const BASE = "/api/forum";

export interface Identity {
  miningKeyHash: string;
  handle: string;
}

export interface ForumCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  minTrustLevel: number;
  miningEligible: boolean;
  active: boolean;
}

export interface ForumThread {
  id: string;
  categoryId: string;
  authorParticipantId: string;
  title: string;
  slug: string;
  blockId: string | null;
  projectId: string | null;
  status: "open" | "locked" | "hidden" | "pinned";
  postCount: number;
  lastPostAt: string | null;
  solvedPostId: string | null;
  createdAt: string;
}

export interface ForumPost {
  id: string;
  threadId: string;
  participantId: string;
  miningKeyHash: string | null;
  replyToPostId: string | null;
  rawMd: string;
  contentHash: string;
  replyId: string | null;
  status: "visible" | "hidden_pending_review" | "hidden" | "deleted";
  editedAt: string | null;
  createdAt: string;
}

export interface ThreadView {
  thread: ForumThread;
  posts: Array<{ post: ForumPost; handle: string }>;
}

export interface CategoryThreads {
  category: ForumCategory;
  threads: ForumThread[];
  nextCursor: string | null;
}

export interface SearchHit {
  postId: string;
  threadId: string;
  snippet: string;
  rank: number;
}

export interface RelatedThread {
  id: string;
  title: string;
  slug: string;
  postCount: number;
  lastPostAt: string | null;
}

export interface ForumNotification {
  id: string;
  participantId: string;
  kind: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, init);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((data && (data.error || data.message)) || `HTTP ${res.status}`);
  return data as T;
}

function jsonInit(method: string, body: unknown, admin = false): RequestInit {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (admin) {
    const tok = getAdminToken();
    if (tok) headers.authorization = `Bearer ${tok}`;
  }
  return { method, headers, body: JSON.stringify(body) };
}

// ── reads ────────────────────────────────────────────────────────────────
export const getCategories = () => j<ForumCategory[]>("/categories");
export const getCategoryThreads = (slug: string, cursor?: string) =>
  j<CategoryThreads>(`/categories/${encodeURIComponent(slug)}/threads${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
export const getThread = (id: string, page = 0) => j<ThreadView>(`/threads/${id}?page=${page}`);
export const search = (q: string) => j<SearchHit[]>(`/search?q=${encodeURIComponent(q)}`);
export const getRelated = (id: string) => j<RelatedThread[]>(`/threads/${id}/related`);
export const getNotifications = (id: Identity) =>
  j<ForumNotification[]>(`/notifications?miningKeyHash=${encodeURIComponent(id.miningKeyHash)}&handle=${encodeURIComponent(id.handle)}`);

// ── miner writes ─────────────────────────────────────────────────────────
export const createThread = (id: Identity, input: { categorySlug: string; title: string; rawMd: string }) =>
  j<{ threadId: string; postId: string; status: string }>("/threads", jsonInit("POST", { ...id, ...input }));
export const createPost = (id: Identity, threadId: string, input: { rawMd: string; replyToPostId?: string | null }) =>
  j<{ postId: string; status: string }>(`/threads/${threadId}/posts`, jsonInit("POST", { ...id, ...input }));
export const editPost = (id: Identity, postId: string, rawMd: string) =>
  j<{ ok: boolean }>(`/posts/${postId}`, jsonInit("PATCH", { ...id, rawMd }));
export const react = (id: Identity, postId: string, kind: string) =>
  j<{ ok: boolean }>(`/posts/${postId}/reactions`, jsonInit("POST", { ...id, kind }));
export const flag = (id: Identity, postId: string, reason: string, note?: string) =>
  j<{ ok: boolean }>(`/posts/${postId}/flags`, jsonInit("POST", { ...id, reason, note }));
export const solve = (id: Identity, threadId: string, postId: string) =>
  j<{ ok: boolean }>(`/threads/${threadId}/solve`, jsonInit("POST", { ...id, postId }));
export const subscribe = (id: Identity, threadId: string, level: "watching" | "tracking" | "muted") =>
  j<{ ok: boolean }>(`/threads/${threadId}/subscription`, jsonInit("PUT", { ...id, level }));
export const markNotificationsRead = (id: Identity) =>
  j<{ ok: boolean }>("/notifications/read", jsonInit("POST", { ...id }));

// ── agentic ─────────────────────────────────────────────────────────────
export const summarize = (threadId: string) =>
  j<{ available: boolean; summary?: string }>(`/threads/${threadId}/summarize`, jsonInit("POST", {}));
export const ask = (threadId: string, question: string) =>
  j<{ available: boolean; answer?: string; sources?: SearchHit[] }>(`/threads/${threadId}/ask`, jsonInit("POST", { question }));

// ── admin / moderation ────────────────────────────────────────────────────
export const adminGetFlags = () => j<Array<{ flag: Record<string, unknown>; post: ForumPost }>>("/flags", { headers: adminHeaders() });
export const adminResolveFlag = (flagId: string, resolution: "upheld" | "rejected") =>
  j<{ ok: boolean }>(`/flags/${flagId}/resolve`, jsonInit("POST", { resolution }, true));
export const adminTriageFlag = (flagId: string) =>
  j<{ available: boolean; suggestion?: string }>(`/flags/${flagId}/triage`, jsonInit("POST", {}, true));
export const adminModerateThread = (threadId: string, status: string) =>
  j<ForumThread>(`/threads/${threadId}`, jsonInit("PATCH", { status }, true));
export const adminUpsertCategory = (input: Partial<ForumCategory> & { slug: string; name: string }) =>
  j<{ ok: boolean }>("/categories", jsonInit("POST", input, true));
export const adminGrantModerator = (participantId: string, on = true) =>
  j<{ ok: boolean }>("/moderators", jsonInit("POST", { participantId, on }, true));

function adminHeaders(): Record<string, string> {
  const tok = getAdminToken();
  return tok ? { authorization: `Bearer ${tok}` } : {};
}

// ── SSE ─────────────────────────────────────────────────────────────────
/** Subscribe to a thread's activity stream. Returns a cleanup function. */
export function subscribeThread(threadId: string, onActivity: () => void): () => void {
  const es = new EventSource(`${BASE}/threads/${threadId}/stream`);
  es.addEventListener("activity", () => onActivity());
  return () => es.close();
}
