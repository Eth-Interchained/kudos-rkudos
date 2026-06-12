import { useEffect, useState, useCallback } from "react";

// Word lists for readable seeds
const ADJECTIVES = [
  "orbit", "flame", "tide", "iron", "neon", "void", "dark", "swift", "cold", "bright",
  "deep", "wild", "sharp", "fast", "bold", "hard", "true", "raw", "free", "pure",
  "storm", "solar", "lunar", "prime", "ultra", "hyper", "alpha", "beta", "delta", "sigma",
];
const NOUNS = [
  "miner", "chain", "block", "hash", "node", "vault", "forge", "core", "wave", "pulse",
  "signal", "proof", "ledger", "shard", "relay", "epoch", "stake", "yield", "flux", "grid",
  "spark", "crystal", "cipher", "vector", "matrix", "nexus", "apex", "zenith", "forge", "titan",
];

function generateSeed(): string {
  const adj1 = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const adj2 = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(1000 + Math.random() * 8999);
  return `${adj1}-${adj2}-${noun}-${num}`;
}

async function hashSeed(seed: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`kudos-v1:${seed}`);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export interface MinerIdentity {
  miningKey: string;        // human-readable seed
  miningKeyHash: string;    // sha-256 prefix, sent to API
  xHandle: string;          // @handle without the @
  walletAddress: string;    // ITC payout address
  email: string;            // optional email for digest
  isNew: boolean;           // first visit this session
  onboardedAt: string;      // ISO timestamp when onboarding completed
}

const STORAGE_KEY = "kudos_miner_v1";

interface StoredIdentity {
  miningKey: string;
  miningKeyHash: string;
  xHandle: string;
  walletAddress?: string;
  email?: string;
  onboardedAt?: string;
}

function persist(identity: MinerIdentity) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      miningKey: identity.miningKey,
      miningKeyHash: identity.miningKeyHash,
      xHandle: identity.xHandle,
      walletAddress: identity.walletAddress,
      email: identity.email,
      onboardedAt: identity.onboardedAt,
    }),
  );
}

export function useMinerIdentity() {
  const [identity, setIdentity] = useState<MinerIdentity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as StoredIdentity;
        setIdentity({
          ...parsed,
          walletAddress: parsed.walletAddress ?? "",
          email: parsed.email ?? "",
          onboardedAt: parsed.onboardedAt ?? "",
          isNew: false,
        });
        setLoading(false);
        return;
      } catch { }
    }
    // First visit — generate seed
    const seed = generateSeed();
    hashSeed(seed).then((hash) => {
      const newIdentity: MinerIdentity = {
        miningKey: seed,
        miningKeyHash: hash,
        xHandle: "",
        walletAddress: "",
        email: "",
        isNew: true,
        onboardedAt: "",
      };
      setIdentity(newIdentity);
      setLoading(false);
    });
  }, []);

  const setXHandle = useCallback(
    (handle: string) => {
      const clean = handle.replace(/^@/, "").trim();
      setIdentity((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, xHandle: clean, isNew: false };
        persist(updated);
        return updated;
      });
    },
    [],
  );

  const setWalletAddress = useCallback(
    (address: string) => {
      setIdentity((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, walletAddress: address.trim() };
        persist(updated);
        return updated;
      });
    },
    [],
  );

  const setEmail = useCallback(
    (email: string) => {
      setIdentity((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, email: email.trim() };
        persist(updated);
        return updated;
      });
    },
    [],
  );

  const completeOnboarding = useCallback(() => {
    setIdentity((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, isNew: false, onboardedAt: new Date().toISOString() };
      persist(updated);
      return updated;
    });
  }, []);

  const saveSeed = useCallback(() => {
    setIdentity((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, isNew: false };
      persist(updated);
      return updated;
    });
  }, []);

  const clearIdentity = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    const seed = generateSeed();
    hashSeed(seed).then((hash) => {
      setIdentity({
        miningKey: seed,
        miningKeyHash: hash,
        xHandle: "",
        walletAddress: "",
        email: "",
        isNew: true,
        onboardedAt: "",
      });
    });
  }, []);

  /**
   * Restore a mining key from a previous session / different browser.
   * Re-hashes the key and saves the identity to localStorage.
   * Optionally accepts the X handle to pre-fill.
   */
  const restoreKey = useCallback(
    (rawKey: string, xHandle?: string) => {
      const key = rawKey.trim();
      if (!key) return;
      hashSeed(key).then((hash) => {
        const restored: MinerIdentity = {
          miningKey: key,
          miningKeyHash: hash,
          xHandle: xHandle?.replace(/^@/, "").trim() ?? "",
          walletAddress: "",
          email: "",
          isNew: false,
          onboardedAt: new Date().toISOString(),
        };
        persist(restored);
        setIdentity(restored);
      });
    },
    [],
  );

  /** Check if the miner has completed full onboarding (handle + wallet) */
  const isOnboarded = identity ? Boolean(identity.xHandle && identity.onboardedAt) : false;

  return {
    identity,
    loading,
    isOnboarded,
    setXHandle,
    setWalletAddress,
    setEmail,
    completeOnboarding,
    saveSeed,
    clearIdentity,
    restoreKey,
  };
}
