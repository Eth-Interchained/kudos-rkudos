import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface PendingReply {
  id: string;
  blockId: string;
  handle: string;
  xReplyId: string | null;
  replyText: string;
  aiReplyText: string;
  qualityScore: number;
  socialHashpower: number;
  createdAt: string;
}

export default function XPostQueue() {
  const [replies, setReplies] = useState<PendingReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<Record<string, "posting" | "skipping" | "done" | "error">>({});
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 5;

  const token = localStorage.getItem("sm_admin_token") ?? "";

  const load = () => {
    setLoading(true);
    fetch("/api/admin/pending-x-replies", {
      headers: { "x-admin-token": token },
    })
      .then(r => r.ok ? r.json() : [])
      .then(setReplies)
      .catch(() => setReplies([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePost = (reply: PendingReply) => {
    setActing(p => ({ ...p, [reply.id]: "posting" }));
    const text = edits[reply.id] ?? reply.aiReplyText ?? "";
    const intentUrl = reply.xReplyId
      ? `https://x.com/intent/tweet?in_reply_to=${reply.xReplyId}&text=${encodeURIComponent(text)}`
      : `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(intentUrl, "_blank", "noopener,noreferrer");

    fetch(`/api/replies/${reply.id}/skip-x-reply`, {
      method: "PATCH",
      headers: { "x-admin-token": token },
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setActing(p => ({ ...p, [reply.id]: "done" }));
        setReplies(prev => prev.filter(r => r.id !== reply.id));
      })
      .catch(() => setActing(p => ({ ...p, [reply.id]: "error" })));
  };

  const handleSkip = (reply: PendingReply) => {
    setActing(p => ({ ...p, [reply.id]: "skipping" }));
    fetch(`/api/replies/${reply.id}/skip-x-reply`, {
      method: "PATCH",
      headers: { "x-admin-token": token },
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setActing(p => ({ ...p, [reply.id]: "done" }));
        setReplies(prev => prev.filter(r => r.id !== reply.id));
      })
      .catch(() => setActing(p => ({ ...p, [reply.id]: "error" })));
  };

  const handleSkipAll = () => {
    for (const r of replies) {
      handleSkip(r);
    }
  };

  const paged = replies.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(replies.length / PAGE_SIZE);

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex items-center justify-between border-b-4 border-foreground pb-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter">⚡ X Post Queue</h1>
          <p className="font-mono text-xs text-muted-foreground mt-1">
            AI-generated replies across all blocks. Edit, then open on X to post from your browser.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs bg-primary text-primary-foreground px-3 py-1.5 font-bold">
            {replies.length} pending
          </span>
          <Button
            onClick={load}
            variant="outline"
            className="rounded-none border-2 border-foreground h-8 text-xs"
          >
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-36 border-4 border-foreground bg-muted animate-pulse brutal-shadow" />
          ))}
        </div>
      ) : replies.length === 0 ? (
        <div className="border-4 border-foreground bg-card brutal-shadow p-12 text-center space-y-3">
          <div className="text-5xl">✨</div>
          <h2 className="text-xl font-black uppercase">Queue Clear</h2>
          <p className="font-mono text-xs text-muted-foreground">
            No pending AI replies to post. New ones appear after miners submit replies and AI generates responses.
          </p>
        </div>
      ) : (
        <>
          {/* Bulk actions */}
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, replies.length)} of {replies.length}
            </span>
            <Button
              onClick={handleSkipAll}
              variant="outline"
              className="rounded-none border-2 border-foreground h-7 text-[10px] px-3 uppercase"
            >
              Skip All ({replies.length})
            </Button>
          </div>

          {/* Reply cards */}
          <div className="space-y-4">
            {paged.map(reply => {
              const editedText = edits[reply.id] ?? reply.aiReplyText ?? "";
              const status = acting[reply.id];

              return (
                <div
                  key={reply.id}
                  className="border-4 border-foreground bg-card brutal-shadow p-5 space-y-3"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 border-2 border-foreground bg-primary/10 flex items-center justify-center text-lg font-black">
                        {reply.handle[0]?.toUpperCase()}
                      </div>
                      <div>
                        <span className="font-bold">@{reply.handle}</span>
                        <div className="flex gap-2 mt-0.5">
                          <span className="font-mono text-[10px] text-muted-foreground border border-foreground/20 px-1.5 py-0.5">
                            Q: {reply.qualityScore.toFixed(0)}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground border border-foreground/20 px-1.5 py-0.5">
                            HP: {reply.socialHashpower.toFixed(0)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {new Date(reply.createdAt).toLocaleString()}
                    </span>
                  </div>

                  {/* Original reply */}
                  <div className="font-mono text-[11px] text-muted-foreground border-l-4 border-foreground/20 pl-3 py-2 bg-muted/20">
                    <span className="font-bold text-foreground/60 uppercase text-[9px] block mb-1">Original Reply</span>
                    "{reply.replyText?.slice(0, 200)}{(reply.replyText?.length ?? 0) > 200 ? "…" : ""}"
                  </div>

                  {/* Editable AI reply */}
                  <div>
                    <span className="font-mono font-bold text-[9px] uppercase text-primary block mb-1">AI-Generated Post</span>
                    <Textarea
                      value={editedText}
                      onChange={e => setEdits(prev => ({ ...prev, [reply.id]: e.target.value }))}
                      className="border-2 border-foreground rounded-none shadow-none font-mono text-xs resize-none h-24"
                    />
                    <span className="font-mono text-[9px] text-muted-foreground mt-1 block">
                      {editedText.length} chars · Edit before posting
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    <Button
                      onClick={() => handlePost(reply)}
                      disabled={status === "posting" || status === "skipping"}
                      className="flex-[2] rounded-none border-2 border-foreground brutal-shadow bg-primary text-primary-foreground h-10 font-bold uppercase"
                    >
                      {status === "posting" ? "Opening…" : "Open on X →"}
                    </Button>
                    <Button
                      onClick={() => handleSkip(reply)}
                      disabled={status === "posting" || status === "skipping"}
                      variant="outline"
                      className="flex-1 rounded-none border-2 border-foreground h-10 uppercase font-bold"
                    >
                      {status === "skipping" ? "…" : "Skip"}
                    </Button>
                  </div>

                  {status === "error" && (
                    <p className="font-mono text-xs text-destructive">Failed — check admin token.</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between font-mono text-xs pt-2">
              <Button
                variant="outline"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-none border-2 border-foreground h-8 text-xs px-4"
              >
                ← Prev
              </Button>
              <span className="text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="rounded-none border-2 border-foreground h-8 text-xs px-4"
              >
                Next →
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
