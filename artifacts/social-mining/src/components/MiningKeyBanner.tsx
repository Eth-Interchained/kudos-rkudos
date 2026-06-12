import { useState } from "react";
import { useMinerIdentity } from "@/hooks/useMinerIdentity";

const RARITY_STYLES: Record<string, string> = {
  common:    "border-muted-foreground/40 text-muted-foreground bg-muted/30",
  rare:      "border-blue-400 text-blue-400 bg-blue-400/10",
  epic:      "border-purple-400 text-purple-400 bg-purple-400/10",
  legendary: "border-yellow-400 text-yellow-400 bg-yellow-400/10",
};

interface MiningKeyBannerProps {
  /** If true, shown as a compact top chip instead of the full first-visit card */
  compact?: boolean;
}

export default function MiningKeyBanner({ compact }: MiningKeyBannerProps) {
  const { identity, loading, setXHandle, saveSeed, clearIdentity, restoreKey } = useMinerIdentity();
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [handle, setHandle] = useState("");
  const [showRestore, setShowRestore] = useState(false);
  const [restoreInput, setRestoreInput] = useState("");
  const [restoreHandle, setRestoreHandle] = useState("");

  if (loading || !identity) return null;

  // Returning user compact chip
  if (!identity.isNew || compact || dismissed) {
    if (!identity.xHandle) return null;
    return (
      <div className="flex items-center gap-2 font-mono text-xs border-2 border-foreground bg-card px-3 py-1.5 brutal-shadow">
        <span className="text-primary font-bold">⛏</span>
        <span className="font-bold">@{identity.xHandle}</span>
        <span className="text-muted-foreground">· Mining Key Active</span>
      </div>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(identity.miningKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSave = () => {
    if (handle.trim()) setXHandle(handle.trim());
    saveSeed();
    setDismissed(true);
  };

  const handleRestore = () => {
    if (!restoreInput.trim()) return;
    restoreKey(restoreInput.trim(), restoreHandle.trim() || undefined);
    setShowRestore(false);
    setDismissed(true);
  };

  // ── Restore flow ────────────────────────────────────────────────────────────
  if (showRestore) {
    return (
      <div className="border-4 border-foreground bg-card brutal-shadow p-6 space-y-5 animate-in fade-in slide-in-from-top-4 duration-500">
        <div>
          <div className="font-mono text-xs font-bold uppercase text-muted-foreground mb-1">
            Restore Existing Mining Key
          </div>
          <h2 className="text-2xl font-black uppercase">Welcome Back, Miner</h2>
        </div>

        <p className="font-mono text-sm text-muted-foreground">
          Paste the mining key from your previous session below.
          It looks like <span className="font-bold text-foreground">orbit-flame-miner-1234</span>.
        </p>

        <div className="space-y-3">
          <input
            type="text"
            value={restoreInput}
            onChange={(e) => setRestoreInput(e.target.value)}
            placeholder="e.g. orbit-flame-miner-1234"
            className="w-full border-4 border-foreground bg-background font-mono text-lg px-4 py-3 focus:outline-none focus:border-primary tracking-wider"
            autoFocus
          />
          <input
            type="text"
            value={restoreHandle}
            onChange={(e) => setRestoreHandle(e.target.value.replace(/^@/, ""))}
            placeholder="X handle (optional)"
            className="w-full border-2 border-foreground bg-background font-mono px-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={handleRestore}
            disabled={!restoreInput.trim()}
            className="border-4 border-foreground bg-primary text-primary-foreground px-6 py-2 font-mono font-bold uppercase brutal-shadow hover:-translate-y-0.5 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Restore Key →
          </button>
          <button
            onClick={() => setShowRestore(false)}
            className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors py-2 px-3"
          >
            ← Back to new key
          </button>
        </div>

        <p className="font-mono text-[10px] text-muted-foreground/60">
          Your Mining Key is not a wallet seed and does not hold funds.
          It identifies your miner profile across browsers.
        </p>
      </div>
    );
  }

  // ── New miner flow (original) ───────────────────────────────────────────────
  return (
    <div className="border-4 border-foreground bg-card brutal-shadow p-6 space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-xs font-bold uppercase text-muted-foreground mb-1">
            Your Mining Key — Save This
          </div>
          <h2 className="text-2xl font-black uppercase">New Miner Detected</h2>
        </div>
        <div className="bg-foreground text-background px-3 py-1 font-mono text-xs font-bold uppercase border-2 border-foreground">
          ⛏ First Visit
        </div>
      </div>

      <div className="space-y-2">
        <p className="font-mono text-sm text-muted-foreground">
          This is your unique mining key. Save it — use it to pick up your mining history on any device. No email, no login.
        </p>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-muted border-4 border-foreground font-mono text-xl font-black tracking-wider p-4 select-all">
            {identity.miningKey}
          </div>
          <button
            onClick={handleCopy}
            className="shrink-0 border-4 border-foreground bg-secondary text-secondary-foreground px-4 py-4 font-mono font-bold text-sm brutal-shadow hover:-translate-y-0.5 transition-transform"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="font-mono text-sm font-bold uppercase text-muted-foreground">
          Your X Handle (optional — helps us pull your profile)
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value.replace(/^@/, ""))}
            placeholder="satoshi"
            className="flex-1 border-2 border-foreground bg-background font-mono px-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
          <button
            onClick={handleSave}
            className="border-4 border-foreground bg-primary text-primary-foreground px-6 py-2 font-mono font-bold uppercase brutal-shadow hover:-translate-y-0.5 transition-transform"
          >
            Start Mining →
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <button
          onClick={() => setDismissed(true)}
          className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip for now
        </button>
        <span className="text-muted-foreground/30">·</span>
        <button
          onClick={() => setShowRestore(true)}
          className="text-xs font-mono text-primary hover:text-primary/80 transition-colors font-bold"
        >
          I have a Mining Key →
        </button>
      </div>

      <p className="font-mono text-[10px] text-muted-foreground/60">
        Your Mining Key is not a wallet seed and does not hold funds.
        It identifies your miner profile across browsers.
      </p>
    </div>
  );
}
