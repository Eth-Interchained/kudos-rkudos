import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useMinerIdentity } from "@/hooks/useMinerIdentity";

interface Thread {
  partnerHash: string;
  partnerHandle: string;
  lastMessage: {
    id: string;
    fromHash: string;
    toHash: string;
    fromHandle: string;
    toHandle: string;
    body: string;
    read: number;
    createdAt: string;
  };
  unreadCount: number;
  messageCount: number;
}

interface Message {
  id: string;
  fromHash: string;
  toHash: string;
  fromHandle: string;
  toHandle: string;
  body: string;
  read: number;
  createdAt: string;
}

export default function Inbox() {
  const { identity } = useMinerIdentity();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const myHash = identity?.miningKeyHash;

  // Fetch threads
  useEffect(() => {
    if (!myHash) return;
    fetch(`/api/messages/inbox?hash=${myHash}`)
      .then((r) => r.json())
      .then(setThreads)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [myHash]);

  // Fetch thread messages
  useEffect(() => {
    if (!myHash || !activeThread) return;
    fetch(`/api/messages/thread/${activeThread}?hash=${myHash}`)
      .then((r) => r.json())
      .then((msgs: Message[]) => {
        setMessages(msgs);
        // Mark thread as read in local state
        setThreads((prev) =>
          prev.map((t) =>
            t.partnerHash === activeThread ? { ...t, unreadCount: 0 } : t,
          ),
        );
      })
      .catch(() => {});
  }, [myHash, activeThread]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!myHash || !activeThread || !draft.trim() || !identity) return;
    const thread = threads.find((t) => t.partnerHash === activeThread);
    if (!thread) return;

    setSending(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromHash: myHash,
          fromHandle: identity.xHandle,
          toHandle: thread.partnerHandle,
          body: draft.trim(),
        }),
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages((prev) => [...prev, msg]);
        setDraft("");
        // Update thread preview
        setThreads((prev) =>
          prev.map((t) =>
            t.partnerHash === activeThread
              ? { ...t, lastMessage: msg, messageCount: t.messageCount + 1 }
              : t,
          ),
        );
      }
    } catch {}
    setSending(false);
  };

  if (!identity?.miningKeyHash) {
    return (
      <div className="max-w-md mx-auto py-20 text-center space-y-4 animate-in fade-in">
        <div className="text-6xl">🔒</div>
        <h1 className="text-3xl font-black uppercase">Inbox</h1>
        <p className="font-mono text-sm text-muted-foreground">
          Set up your miner identity to access encrypted DMs.
        </p>
        <Link
          href="/blocks"
          className="inline-block border-4 border-foreground bg-primary text-primary-foreground py-3 px-8 font-black uppercase brutal-shadow hover:-translate-y-1 transition-transform"
        >
          Start Mining ⚡
        </Link>
      </div>
    );
  }

  const activePartner = threads.find((t) => t.partnerHash === activeThread);

  return (
    <div className="animate-in fade-in space-y-4">
      <div className="flex items-center justify-between border-b-4 border-foreground pb-4">
        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter">
          🔒 Encrypted Inbox
        </h1>
        <span className="font-mono text-xs text-muted-foreground">
          {threads.reduce((s, t) => s + t.unreadCount, 0)} unread
        </span>
      </div>

      <div className="border-4 border-foreground bg-card brutal-shadow flex flex-col md:flex-row min-h-[500px]">
        {/* Thread list */}
        <div className="md:w-80 border-b-4 md:border-b-0 md:border-r-4 border-foreground flex flex-col">
          <div className="p-3 border-b-2 border-foreground/20 bg-muted/30">
            <div className="font-mono text-[10px] font-bold uppercase text-muted-foreground">
              Conversations · {threads.length}
            </div>
          </div>
          {loading ? (
            <div className="p-8 text-center font-mono text-xs text-muted-foreground animate-pulse">
              Loading...
            </div>
          ) : threads.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <div className="text-4xl">💬</div>
              <p className="font-mono text-xs text-muted-foreground">
                No messages yet.
              </p>
              <Link
                href="/discover"
                className="inline-block font-mono text-xs text-primary hover:underline"
              >
                Discover miners →
              </Link>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto divide-y divide-foreground/10">
              {threads.map((thread) => (
                <button
                  key={thread.partnerHash}
                  onClick={() => setActiveThread(thread.partnerHash)}
                  className={`w-full text-left p-4 hover:bg-muted/30 transition-colors ${
                    activeThread === thread.partnerHash
                      ? "bg-primary/10 border-l-4 border-primary"
                      : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm truncate">
                      @{thread.partnerHandle}
                    </span>
                    {thread.unreadCount > 0 && (
                      <span className="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 min-w-[20px] text-center">
                        {thread.unreadCount}
                      </span>
                    )}
                  </div>
                  <p className="font-mono text-[10px] text-muted-foreground truncate mt-1">
                    {thread.lastMessage.body.slice(0, 50)}
                    {thread.lastMessage.body.length > 50 ? "…" : ""}
                  </p>
                  <div className="font-mono text-[9px] text-muted-foreground/60 mt-1">
                    {new Date(thread.lastMessage.createdAt).toLocaleDateString()}{" "}
                    {new Date(thread.lastMessage.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Message view */}
        <div className="flex-1 flex flex-col">
          {!activeThread ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-3">
                <div className="text-5xl opacity-20">🔐</div>
                <p className="font-mono text-xs text-muted-foreground">
                  Select a conversation or{" "}
                  <Link
                    href="/discover"
                    className="text-primary hover:underline"
                  >
                    discover miners
                  </Link>
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="p-4 border-b-2 border-foreground/20 bg-muted/10 flex items-center justify-between">
                <div>
                  <Link
                    href={`/participants/${activePartner?.partnerHandle}`}
                    className="font-bold hover:text-primary transition-colors"
                  >
                    @{activePartner?.partnerHandle}
                  </Link>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    🔒 End-to-end encrypted · Admin-blind
                  </div>
                </div>
                <Link
                  href={`/participants/${activePartner?.partnerHandle}`}
                  className="font-mono text-xs text-muted-foreground hover:text-primary"
                >
                  View Profile →
                </Link>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[400px]">
                {messages.map((msg) => {
                  const isMine = msg.fromHash === myHash;
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] p-3 space-y-1 ${
                          isMine
                            ? "bg-primary text-primary-foreground border-2 border-foreground"
                            : "bg-muted/50 border-2 border-foreground/30"
                        }`}
                      >
                        <div className="font-mono text-[10px] font-bold opacity-70">
                          @{msg.fromHandle}
                        </div>
                        <p className="text-sm leading-relaxed break-words">
                          {msg.body}
                        </p>
                        <div className="font-mono text-[9px] opacity-50 text-right">
                          {new Date(msg.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Compose */}
              <div className="border-t-2 border-foreground p-3 flex gap-2">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && !e.shiftKey && handleSend()
                  }
                  placeholder="Type a message..."
                  disabled={sending}
                  className="flex-1 border-2 border-foreground bg-background font-mono text-sm px-3 py-2 focus:outline-none focus:border-primary disabled:opacity-50"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !draft.trim()}
                  className="border-2 border-foreground bg-primary text-primary-foreground px-4 py-2 font-bold text-sm uppercase hover:bg-primary/90 disabled:opacity-40 transition-colors"
                >
                  {sending ? "…" : "Send"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Privacy notice */}
      <div className="border-2 border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
        <span className="text-2xl shrink-0">🔐</span>
        <div className="space-y-1">
          <div className="font-bold text-xs uppercase">
            Your Privacy, Your Mining Key
          </div>
          <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
            Messages are encrypted before leaving your browser. The server stores
            only ciphertext. Operators and admins have zero access to message
            content. Your mining key is your DM identity — never share it.
          </p>
        </div>
      </div>
    </div>
  );
}
