import { useEffect, useRef, useState } from "react";
import { formatItc } from "@/lib/utils";

interface BlockCountdownProps {
  /** ISO timestamp the current open block opened at, or null when none is open. */
  opensAt: string | null;
  /** Block interval in minutes — how long a block stays open before it solves. */
  intervalMin: number;
  /** Sequence number of the open block, shown in the label. */
  seq?: number;
  /** Reward pool of the open block, in ITC. */
  rewardItc?: number;
  /** When true, rewards are paused by the operator — the countdown freezes. */
  paused?: boolean;
  /**
   * Fired once when the live block's solve time passes, so the parent can
   * refetch and flip the UI to the freshly-opened block. Only meaningful when a
   * real block is open (i.e. `opensAt` is set) and rewards aren't paused.
   */
  onSolve?: () => void;
}

function pad(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

/**
 * Neo-brutalist countdown to the moment the current open block "solves"
 * (settles). A block is solved purely on the clock — when its age reaches the
 * block interval — so the target is opensAt + interval; the reward is then
 * split among miners by social hashpower.
 *
 * When there is no live open block (or its solve time has already passed,
 * e.g. the scheduler is paused), the timer rolls on the block interval so the
 * hero always shows the cadence ticking.
 */
export default function BlockCountdown({
  opensAt,
  intervalMin,
  seq,
  rewardItc,
  paused = false,
  onSolve,
}: BlockCountdownProps) {
  const [now, setNow] = useState(() => Date.now());
  // Tracks the `opensAt` we've already fired `onSolve` for, so a block solves
  // exactly once even though the tick re-runs every second.
  const solvedForRef = useRef<string | null>(null);

  useEffect(() => {
    // While paused the clock is frozen, so there is no need to tick.
    if (paused) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [paused]);

  const periodMs = Math.max(1, intervalMin) * 60_000;
  const realTarget = opensAt
    ? new Date(opensAt).getTime() + periodMs
    : null;

  // When the live block's solve time passes, fire `onSolve` once so the parent
  // can refetch and flip the hero to the next block. Without this the timer
  // just rolls over visually while the data behind it goes stale.
  useEffect(() => {
    if (paused || !opensAt || realTarget == null) return;
    if (now >= realTarget && solvedForRef.current !== opensAt) {
      solvedForRef.current = opensAt;
      onSolve?.();
    }
  }, [now, realTarget, opensAt, paused, onSolve]);

  // Use the live block's solve time when it is still in the future; otherwise
  // roll forward to the next interval boundary so the countdown keeps ticking.
  const isLive = realTarget != null && realTarget > now;
  const target = isLive
    ? (realTarget as number)
    : Math.ceil(now / periodMs) * periodMs;

  const remainingMs = Math.max(0, target - now);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const progress = Math.min(100, Math.max(0, (1 - remainingMs / periodMs) * 100));

  return (
    <div className="w-full max-w-2xl border-4 border-foreground bg-card brutal-shadow">
      <div className="flex items-center justify-between gap-2 bg-foreground text-background px-4 py-2 font-mono text-xs md:text-sm font-bold uppercase tracking-wider">
        <span>{paused ? "⏸️ Rewards Paused" : "⛏️ Next Block Solves In"}</span>
        <span className="truncate">
          {paused ? "Paused" : isLive ? `Block #${seq ?? "—"} · LIVE` : "Next Block"}
        </span>
      </div>

      <div className="p-6 md:p-8 flex flex-col items-center gap-5">
        <div className="flex items-stretch gap-2 md:gap-4">
          <TimeTile value={pad(minutes)} label="Min" frozen={paused} />
          <div
            className={`flex items-center text-5xl md:text-8xl font-black text-primary leading-none ${
              paused ? "opacity-40" : "animate-pulse"
            }`}
          >
            :
          </div>
          <TimeTile value={pad(seconds)} label="Sec" frozen={paused} />
        </div>

        <div className="w-full h-4 border-4 border-foreground bg-background overflow-hidden">
          <div
            className={`h-full transition-all duration-1000 ease-linear ${
              paused ? "bg-muted-foreground" : "bg-primary"
            }`}
            style={{ width: `${paused ? 100 : progress}%` }}
          />
        </div>

        <div className="font-mono text-xs md:text-sm font-bold uppercase text-center text-muted-foreground">
          {paused ? (
            <span className="text-foreground">
              Rewards are paused by the operator — mining is frozen
            </span>
          ) : isLive && rewardItc != null ? (
            <>
              <span className="text-foreground">
                {formatItc(rewardItc)} ITC
              </span>{" "}
              pool up for grabs · split by reply hashpower
            </>
          ) : (
            <>A new block is solved every {intervalMin} minutes</>
          )}
        </div>
      </div>
    </div>
  );
}

function TimeTile({
  value,
  label,
  frozen = false,
}: {
  value: string;
  label: string;
  frozen?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`border-4 border-foreground brutal-shadow px-4 md:px-6 py-2 md:py-4 font-mono font-black tabular-nums text-6xl md:text-8xl leading-none min-w-[1.6em] text-center ${
          frozen ? "bg-muted text-muted-foreground" : "bg-foreground text-background"
        }`}
      >
        {value}
      </div>
      <div className="font-mono text-[10px] md:text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
