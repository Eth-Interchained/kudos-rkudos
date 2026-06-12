import { useState, useEffect, useRef, useCallback } from "react";

export interface HashpitMsg {
  id: string;
  channel: string;
  handle: string;
  body: string;
  kind: "chat" | "system";
  miningKeyHash: string | null;
  createdAt: string;
}

const MAX_MESSAGES = 200;
const RECONNECT_MS = 3_000;
const COOLDOWN_MS = 15_000;

interface UseHashpitResult {
  messages: HashpitMsg[];
  minerCount: number;
  isConnected: boolean;
  cooldownSeconds: number;
  sendMessage: (body: string, miningKeyHash: string, handle: string) => Promise<string | null>;
}

/**
 * SSE-powered hook for the Hashpit / Lobby.
 *
 * @param channel  "block-<seq>" or "lobby"
 * @param enabled  false to disconnect (e.g. when component is hidden)
 */
export function useHashpit(channel: string, enabled: boolean = true): UseHashpitResult {
  const [messages, setMessages] = useState<HashpitMsg[]>([]);
  const [minerCount, setMinerCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── SSE connection lifecycle ─────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !channel) return;

    let cancelled = false;

    function connect() {
      if (cancelled) return;

      const es = new EventSource(`/api/hashpit/${channel}/stream`);
      eventSourceRef.current = es;

      es.addEventListener("init", (e) => {
        try {
          const initMsgs: HashpitMsg[] = JSON.parse((e as MessageEvent).data);
          setMessages(initMsgs.slice(-MAX_MESSAGES));
        } catch { /* ignore bad init */ }
        setIsConnected(true);
      });

      es.addEventListener("msg", (e) => {
        try {
          const msg: HashpitMsg = JSON.parse((e as MessageEvent).data);
          setMessages((prev) => [...prev.slice(-(MAX_MESSAGES - 1)), msg]);
        } catch { /* ignore */ }
      });

      es.addEventListener("count", (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data);
          setMinerCount(data.miners ?? 0);
        } catch { /* ignore */ }
      });

      es.onerror = () => {
        setIsConnected(false);
        es.close();
        eventSourceRef.current = null;
        // Auto-reconnect
        if (!cancelled) {
          reconnectTimer.current = setTimeout(connect, RECONNECT_MS);
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      setIsConnected(false);
    };
  }, [channel, enabled]);

  // ── Cooldown ticker ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const startCooldown = useCallback(() => {
    if (cooldownRef.current) clearInterval(cooldownRef.current);

    let remaining = Math.ceil(COOLDOWN_MS / 1000);
    setCooldownSeconds(remaining);

    cooldownRef.current = setInterval(() => {
      remaining -= 1;
      setCooldownSeconds(remaining);
      if (remaining <= 0) {
        if (cooldownRef.current) clearInterval(cooldownRef.current);
        cooldownRef.current = null;
      }
    }, 1000);
  }, []);

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (body: string, miningKeyHash: string, handle: string): Promise<string | null> => {
      try {
        const res = await fetch(`/api/hashpit/${channel}/msg`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ miningKeyHash, handle, body }),
        });

        if (res.status === 429) {
          startCooldown();
          return "Slow mode — wait before sending again";
        }

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          return (data as { error?: string }).error ?? `Error ${res.status}`;
        }

        // Start local cooldown on success
        startCooldown();
        return null; // success
      } catch {
        return "Network error";
      }
    },
    [channel, startCooldown],
  );

  return { messages, minerCount, isConnected, cooldownSeconds, sendMessage };
}
