import { useState, useEffect, useRef } from "react";

/**
 * Countdown hook that returns a live HH:MM:SS string until a target ISO date.
 * Returns null if the target is in the past or not provided.
 * Updates every second while mounted.
 */
export function useCountdown(targetIso: string | null | undefined) {
  const [remaining, setRemaining] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!targetIso) {
      setRemaining(null);
      return;
    }

    const target = new Date(targetIso).getTime();
    if (Number.isNaN(target)) {
      setRemaining(null);
      return;
    }

    function tick() {
      const diff = target - Date.now();
      if (diff <= 0) {
        setRemaining(null);
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }
      const hours = Math.floor(diff / 3_600_000);
      const minutes = Math.floor((diff % 3_600_000) / 60_000);
      const seconds = Math.floor((diff % 60_000) / 1_000);
      if (hours > 0) {
        setRemaining(
          `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`,
        );
      } else if (minutes > 0) {
        setRemaining(
          `${minutes}m ${String(seconds).padStart(2, "0")}s`,
        );
      } else {
        setRemaining(`${seconds}s`);
      }
    }

    tick(); // run immediately
    intervalRef.current = setInterval(tick, 1_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [targetIso]);

  return remaining;
}
