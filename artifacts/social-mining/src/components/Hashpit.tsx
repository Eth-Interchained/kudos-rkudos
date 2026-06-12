import { useState, useRef, useEffect } from "react";
import { useHashpit, type HashpitMsg } from "@/hooks/useHashpit";
import { useMinerIdentity } from "@/hooks/useMinerIdentity";

interface HashpitProps {
  /** "block-<seq>" or "lobby" */
  channel: string;
  /** Display title — e.g. "Block #184 Hashpit" or "The Lobby" */
  title: string;
  /** True when the channel is read-only (closed/settled block) */
  readOnly?: boolean;
}

export default function Hashpit({ channel, title, readOnly = false }: HashpitProps) {
  const { messages, minerCount, isConnected, cooldownSeconds, sendMessage } = useHashpit(channel);
  const { identity } = useMinerIdentity();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const [pinToBottom, setPinToBottom] = useState(true);

  // Auto-scroll when pinned to bottom
  useEffect(() => {
    if (pinToBottom && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages, pinToBottom]);

  // Detect manual scroll
  const handleScroll = () => {
    if (!feedRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = feedRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;
    setPinToBottom(atBottom);
  };

  const handleSend = async () => {
    if (!draft.trim() || !identity || readOnly || sending) return;

    setSending(true);
    setError(null);
    const err = await sendMessage(draft.trim(), identity.miningKeyHash, identity.xHandle || "anon");
    setSending(false);

    if (err) {
      setError(err);
    } else {
      setDraft("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-4 border-foreground bg-card brutal-shadow flex flex-col" style={{ height: "420px" }}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b-4 border-foreground bg-foreground text-background">
        <div className="flex items-center gap-2">
          <span className="text-lg">⛏</span>
          <span className="font-mono font-black text-sm uppercase tracking-wide">{title}</span>
        </div>
        <div className="flex items-center gap-3 font-mono text-xs">
          <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
          <span>{minerCount} {minerCount === 1 ? "miner" : "miners"}</span>
          {readOnly && (
            <span className="bg-background/20 px-2 py-0.5 text-[10px] font-bold uppercase">Archive</span>
          )}
        </div>
      </div>

      {/* ── Message Feed ── */}
      <div
        ref={feedRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-1 font-mono text-xs scroll-smooth"
        style={{ minHeight: 0 }}
      >
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground py-8">
            <div className="text-2xl mb-2">⛏</div>
            <div className="font-bold uppercase">No messages yet</div>
            <div className="text-[10px] mt-1">Be the first miner to speak</div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageRow key={msg.id} msg={msg} />
        ))}
        {!pinToBottom && messages.length > 5 && (
          <button
            onClick={() => {
              setPinToBottom(true);
              feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
            }}
            className="sticky bottom-1 left-1/2 -translate-x-1/2 bg-foreground text-background px-3 py-1 text-[10px] font-bold uppercase brutal-shadow hover:-translate-y-0.5 transition-transform z-10"
          >
            ↓ New messages
          </button>
        )}
      </div>

      {/* ── Input Bar ── */}
      {!readOnly ? (
        <div className="border-t-4 border-foreground px-3 py-2 space-y-1">
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value.slice(0, 280));
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder={
                !identity
                  ? "Mining Key required…"
                  : cooldownSeconds > 0
                    ? `Wait ${cooldownSeconds}s…`
                    : "Type a message…"
              }
              disabled={!identity || cooldownSeconds > 0 || sending}
              className="flex-1 bg-background border-2 border-foreground font-mono text-xs px-2 py-1.5 focus:outline-none focus:border-primary disabled:opacity-40 disabled:cursor-not-allowed"
              maxLength={280}
            />
            <button
              onClick={handleSend}
              disabled={!draft.trim() || !identity || cooldownSeconds > 0 || sending}
              className="bg-foreground text-background px-3 py-1.5 font-mono text-xs font-bold uppercase border-2 border-foreground hover:-translate-y-0.5 transition-transform disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              {sending ? "…" : "Send"}
            </button>
            {cooldownSeconds > 0 && (
              <span className="font-mono text-[10px] text-muted-foreground tabular-nums w-8 text-right shrink-0">
                {cooldownSeconds}s
              </span>
            )}
          </div>
          {error && (
            <div className="font-mono text-[10px] text-destructive font-bold">{error}</div>
          )}
        </div>
      ) : (
        <div className="border-t-4 border-foreground px-3 py-2 font-mono text-[10px] text-muted-foreground text-center">
          Block closed — this Hashpit is a read-only archive.
        </div>
      )}

      {/* ── Disclaimer ── */}
      <div className="border-t border-foreground/20 px-3 py-1 font-mono text-[9px] text-muted-foreground/50 text-center">
        Hashpit is public. Never post mining keys, wallet seeds, or personal info.
      </div>
    </div>
  );
}

// ── Message Row ──────────────────────────────────────────────────────────────

function MessageRow({ msg }: { msg: HashpitMsg }) {
  const time = new Date(msg.createdAt);
  const timeStr = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;

  if (msg.kind === "system") {
    return (
      <div className="flex items-start gap-2 py-0.5 text-muted-foreground italic">
        <span className="text-[10px] tabular-nums shrink-0 mt-px opacity-50">{timeStr}</span>
        <span className="text-[11px]">{msg.body}</span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 py-0.5 group hover:bg-muted/20 -mx-1 px-1 rounded-sm transition-colors">
      <span className="text-[10px] tabular-nums shrink-0 mt-px text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
        {timeStr}
      </span>
      <div className="min-w-0">
        <span className="font-bold text-primary">@{msg.handle}</span>
        <span className="text-foreground/80 ml-1.5 break-words">{msg.body}</span>
      </div>
    </div>
  );
}
