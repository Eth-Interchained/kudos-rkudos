import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useWalletBind } from "@workspace/api-client-react";
import type { MinerIdentity } from "@/hooks/useMinerIdentity";

// ── Types ────────────────────────────────────────────────────────────────────
type Step = "welcome" | "handle" | "wallet" | "key" | "ready";

const STEP_INDEX: Record<Step, number> = {
  welcome: 0,
  handle: 1,
  wallet: 2,
  key: 3,
  ready: 4,
};

interface OnboardingModalProps {
  open: boolean;
  identity: MinerIdentity;
  onSetHandle: (handle: string) => void;
  onSetWallet: (address: string) => void;
  onSetEmail: (email: string) => void;
  onComplete: () => void;
}

// ── Progress Dots ────────────────────────────────────────────────────────────
function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 transition-all duration-500 ${
            i <= current
              ? "w-8 bg-primary"
              : "w-3 bg-foreground/20"
          }`}
        />
      ))}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export function OnboardingModal({
  open,
  identity,
  onSetHandle,
  onSetWallet,
  onSetEmail,
  onComplete,
}: OnboardingModalProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [handleInput, setHandleInput] = useState("");
  const [walletInput, setWalletInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [copied, setCopied] = useState(false);

  const walletBind = useWalletBind();

  const handleNext = () => {
    const order: Step[] = ["welcome", "handle", "wallet", "key", "ready"];
    const idx = order.indexOf(step);
    if (idx < order.length - 1) setStep(order[idx + 1]);
  };

  const handleBack = () => {
    const order: Step[] = ["welcome", "handle", "wallet", "key", "ready"];
    const idx = order.indexOf(step);
    if (idx > 0) setStep(order[idx - 1]);
  };

  const handleSetHandle = () => {
    const clean = handleInput.replace(/^@/, "").trim();
    if (!clean) return;
    onSetHandle(clean);
    handleNext();
  };

  const handleSetWallet = () => {
    const handle = handleInput.replace(/^@/, "").trim() || identity.xHandle;
    const wallet = walletInput.trim();
    const em = emailInput.trim();

    if (wallet) onSetWallet(wallet);
    if (em) onSetEmail(em);

    // Always call the API to ensure participant profile is created/enriched,
    // even if no wallet is entered (upsertParticipant still runs server-side).
    if (wallet) {
      walletBind.mutate({
        data: {
          handle,
          itcAddress: wallet,
          email: em || undefined,
        },
      });
    }

    handleNext();
  };

  const handleCopyKey = async () => {
    await navigator.clipboard.writeText(identity.miningKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFinish = () => {
    onComplete();
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="border-4 border-foreground bg-card p-0 overflow-hidden max-w-md [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* ── Header gradient ── */}
        <div className="bg-gradient-to-br from-primary via-primary/90 to-secondary p-8 text-primary-foreground relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-2 left-4 font-mono text-[10px] leading-none whitespace-pre opacity-40">
{`⛏ ⛏ ⛏ ⛏ ⛏ ⛏ ⛏ ⛏
 ⛏ ⛏ ⛏ ⛏ ⛏ ⛏ ⛏
⛏ ⛏ ⛏ ⛏ ⛏ ⛏ ⛏ ⛏`}
            </div>
          </div>
          <DialogHeader className="relative z-10">
            <DialogTitle className="text-3xl font-black uppercase tracking-tighter text-primary-foreground">
              {step === "welcome" && "Welcome, Miner"}
              {step === "handle" && "Link Your X"}
              {step === "wallet" && "Bind Wallet"}
              {step === "key" && "Your Mining Key"}
              {step === "ready" && "You're In ⚡"}
            </DialogTitle>
            <DialogDescription className="text-primary-foreground/80 font-mono text-sm mt-2">
              {step === "welcome" && "Set up your miner identity to earn ITC from social mining."}
              {step === "handle" && "We need your X handle to verify your posts."}
              {step === "wallet" && "Save your payout address to claim mining rewards."}
              {step === "key" && "This key links your mined replies across sessions."}
              {step === "ready" && "Your miner identity is locked in. Start mining!"}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* ── Progress ── */}
        <div className="px-8 pt-5">
          <ProgressDots current={STEP_INDEX[step]} total={5} />
        </div>

        {/* ── Step Content ── */}
        <div className="px-8 pb-8 pt-4 space-y-6">
          {/* Welcome */}
          {step === "welcome" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: "🔗", label: "Link X", desc: "Verify your posts" },
                  { icon: "💰", label: "Bind Wallet", desc: "Claim ITC rewards" },
                  { icon: "⛏️", label: "Mine", desc: "Score signal points" },
                ].map(({ icon, label, desc }) => (
                  <div key={label} className="border-2 border-foreground p-3 text-center space-y-1">
                    <div className="text-2xl">{icon}</div>
                    <div className="font-bold text-xs uppercase">{label}</div>
                    <div className="font-mono text-[9px] text-muted-foreground">{desc}</div>
                  </div>
                ))}
              </div>
              <p className="font-mono text-xs text-muted-foreground text-center leading-relaxed">
                Takes 30 seconds. Your mining key stays in this browser — <br />
                no sign-ups, no passwords, no custodial wallets.
              </p>
              <button
                onClick={handleNext}
                className="w-full border-4 border-foreground bg-primary text-primary-foreground py-4 font-black text-xl uppercase brutal-shadow hover:-translate-y-1 active:translate-y-0 transition-transform"
              >
                Let's Go ⚡
              </button>
            </div>
          )}

          {/* Handle */}
          {step === "handle" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-2">
                <label className="font-bold text-xs uppercase block">Your X Handle</label>
                <div className="flex items-center border-4 border-foreground bg-background">
                  <span className="px-3 py-3 bg-muted font-mono text-lg text-muted-foreground border-r-2 border-foreground">@</span>
                  <input
                    type="text"
                    value={handleInput}
                    onChange={(e) => setHandleInput(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                    placeholder="yourhandle"
                    className="flex-1 px-4 py-3 font-mono text-lg bg-transparent focus:outline-none"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleInput.trim() && handleSetHandle()}
                  />
                </div>
                <p className="font-mono text-[10px] text-muted-foreground">
                  We use this to verify that mined posts belong to you.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleBack}
                  className="flex-1 border-4 border-foreground bg-card py-3 font-bold uppercase text-sm hover:bg-muted transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={handleSetHandle}
                  disabled={!handleInput.trim()}
                  className="flex-[2] border-4 border-foreground bg-primary text-primary-foreground py-3 font-black uppercase text-sm brutal-shadow hover:-translate-y-1 active:translate-y-0 transition-transform disabled:opacity-40 disabled:translate-y-0"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Wallet */}
          {step === "wallet" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-2">
                <label className="font-bold text-xs uppercase block">ITC Payout Address</label>
                <input
                  type="text"
                  value={walletInput}
                  onChange={(e) => setWalletInput(e.target.value)}
                  placeholder="itc1… or base58 address"
                  className="w-full border-4 border-foreground bg-background px-4 py-3 font-mono text-sm focus:outline-none focus:border-primary transition-colors"
                  autoFocus
                />
                <p className="font-mono text-[10px] text-muted-foreground">
                  Mined ITC gets paid to this address when blocks settle.
                </p>
              </div>
              <div className="space-y-2">
                <label className="font-bold text-xs uppercase block">
                  Email <span className="font-mono text-muted-foreground normal-case">(optional)</span>
                </label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full border-4 border-foreground bg-background px-4 py-3 font-mono text-sm focus:outline-none focus:border-primary transition-colors"
                />
                <p className="font-mono text-[10px] text-muted-foreground">
                  📬 Get the weekly mining snapshot — your scores, earnings, and leaderboard rank.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleBack}
                  className="flex-1 border-4 border-foreground bg-card py-3 font-bold uppercase text-sm hover:bg-muted transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={handleSetWallet}
                  disabled={!walletInput.trim()}
                  className="flex-[2] border-4 border-foreground bg-primary text-primary-foreground py-3 font-black uppercase text-sm brutal-shadow hover:-translate-y-1 active:translate-y-0 transition-transform disabled:opacity-40 disabled:translate-y-0"
                >
                  Save &amp; Continue
                </button>
              </div>
            </div>
          )}

          {/* Mining Key */}
          {step === "key" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-3">
                <div className="border-4 border-primary bg-primary/5 p-4 space-y-2">
                  <div className="font-mono text-[10px] uppercase font-bold text-primary">Your Mining Key</div>
                  <div
                    className="font-mono text-xl font-black tracking-widest select-all bg-background border-2 border-foreground p-3 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={handleCopyKey}
                    title="Click to copy"
                  >
                    {identity.miningKey}
                  </div>
                  <button
                    onClick={handleCopyKey}
                    className="w-full border-2 border-primary bg-primary/10 py-1.5 font-mono text-xs font-bold text-primary hover:bg-primary/20 transition-colors"
                  >
                    {copied ? "✓ Copied!" : "📋 Copy to Clipboard"}
                  </button>
                </div>
                <div className="border-2 border-foreground/30 bg-muted/30 p-3 space-y-1">
                  <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
                    <strong>⚠ Save this key.</strong> It links your mined replies to your identity.
                    If you clear browser data, you'll need this key to restore your miner profile.
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
                    This is <strong>not</strong> a wallet seed and does not hold funds.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleBack}
                  className="flex-1 border-4 border-foreground bg-card py-3 font-bold uppercase text-sm hover:bg-muted transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={handleNext}
                  className="flex-[2] border-4 border-foreground bg-primary text-primary-foreground py-3 font-black uppercase text-sm brutal-shadow hover:-translate-y-1 active:translate-y-0 transition-transform"
                >
                  I Saved It →
                </button>
              </div>
            </div>
          )}

          {/* Ready */}
          {step === "ready" && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="text-center space-y-3">
                <div className="text-6xl animate-bounce">⛏️</div>
                <p className="font-mono text-sm text-muted-foreground">
                  You're set up as <strong className="text-foreground">@{identity.xHandle}</strong>
                </p>
              </div>
              <div className="border-2 border-foreground bg-muted/20 p-3 space-y-1.5">
                <div className="flex justify-between font-mono text-xs">
                  <span className="text-muted-foreground">Handle</span>
                  <span className="font-bold">@{identity.xHandle}</span>
                </div>
                <div className="flex justify-between font-mono text-xs">
                  <span className="text-muted-foreground">Wallet</span>
                  <span className="font-bold">{identity.walletAddress ? `${identity.walletAddress.slice(0, 12)}…` : "Not set"}</span>
                </div>
                <div className="flex justify-between font-mono text-xs">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-bold">{identity.email || "Not set"}</span>
                </div>
                <div className="flex justify-between font-mono text-xs">
                  <span className="text-muted-foreground">Mining Key</span>
                  <span className="font-bold">{identity.miningKey.split("-").slice(0, 2).join("-")}…</span>
                </div>
              </div>
              <button
                onClick={handleFinish}
                className="w-full border-4 border-foreground bg-primary text-primary-foreground py-4 font-black text-xl uppercase brutal-shadow hover:-translate-y-1 active:translate-y-0 transition-transform"
              >
                Start Mining ⚡
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
