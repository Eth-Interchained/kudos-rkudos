import { createHash, randomBytes } from "node:crypto";
import type { Logger } from "pino";

/**
 * ITC node adapter (Bitcoin-like JSON-RPC) — the settlement layer.
 * The production node lives at https://shared-x.interchained.org.
 * Real mode: talks to the node via ITC_RPC_URL (defaults to the shared node)
 *   with optional Basic auth (ITC_RPC_USER / ITC_RPC_PASSWORD). Enabled when
 *   ITC_RPC_URL is set or ITC_RPC_ENABLED is truthy.
 * Simulation mode (default here): deterministic, side-effect-free fakes so the
 *   whole settlement + payout flow is exercisable without a live node.
 */

// The shared node's JSON-RPC is reverse-proxied by nginx on the default HTTP
// port; the raw RPC port is firewalled to whitelisted hosts. Override with
// ITC_RPC_URL on a VPS that can reach the node directly (e.g. an https proxy).
const DEFAULT_ITC_NODE = "http://shared-x.interchained.org";

function baseRpcUrl(): string {
  return (process.env.ITC_RPC_URL ?? DEFAULT_ITC_NODE).replace(/\/+$/, "");
}

export function itcMode(): "rpc" | "simulated" {
  const enabled =
    Boolean(process.env.ITC_RPC_URL) ||
    ["1", "true", "yes"].includes(
      (process.env.ITC_RPC_ENABLED ?? "").toLowerCase(),
    );
  return enabled ? "rpc" : "simulated";
}

/**
 * Name of the wallet that holds payout funds and signs anchoring transactions.
 * Bitcoin-like nodes scope wallet RPCs to `/wallet/<name>`; on a multi-wallet
 * node an unscoped wallet RPC fails. Set ITC_RPC_WALLET to pin one explicitly;
 * otherwise we probe `listwallets` and auto-pick when exactly one is loaded.
 */
let resolvedWallet: string | null | undefined;

export async function listWallets(log?: Logger): Promise<string[]> {
  try {
    return await rpc<string[]>({ method: "listwallets" });
  } catch (err) {
    log?.error({ err }, "listwallets RPC failed");
    return [];
  }
}

async function resolveWalletName(log?: Logger): Promise<string> {
  const pinned = (process.env.ITC_RPC_WALLET ?? "").trim();
  if (pinned) return pinned;
  if (resolvedWallet !== undefined && resolvedWallet !== null) {
    return resolvedWallet;
  }
  const wallets = await listWallets(log);
  if (wallets.length === 1) {
    resolvedWallet = wallets[0];
    return resolvedWallet;
  }
  if (wallets.length === 0) {
    throw new Error(
      "ITC node has no loaded wallet; set ITC_RPC_WALLET or load a wallet on the node.",
    );
  }
  throw new Error(
    `ITC node has multiple loaded wallets (${wallets.join(", ")}); set ITC_RPC_WALLET to choose one.`,
  );
}

// Interchained is a Bitcoin-like chain, so wallets are base58check (legacy) or
// bech32 addresses — never Ethereum-style 0x hex. The bech32 human-readable
// prefix defaults to "itc" and is overridable for a custom network.
const BECH32_HRP = (process.env.ITC_BECH32_HRP ?? "itc").toLowerCase();
// bech32 data charset excludes 1, b, i and o.
const BECH32_RE = new RegExp(`^${BECH32_HRP}1[02-9ac-hj-np-z]{6,87}$`);
// base58 alphabet excludes 0, O, I and l.
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{25,62}$/;

/**
 * Structural check that an address looks like a valid ITC (Bitcoin-like)
 * wallet — base58check or bech32 — and explicitly not an Ethereum 0x address.
 * This is the cheap gate; the node's `validateaddress` RPC is authoritative
 * when the real settlement node is enabled (see validateAddress).
 */
export function isValidItcAddressFormat(address: string): boolean {
  const a = (address ?? "").trim();
  if (!a) return false;
  if (/^0x/i.test(a)) return false; // Ethereum-style, not ITC
  if (BECH32_RE.test(a.toLowerCase())) return true;
  if (BASE58_RE.test(a)) return true;
  return false;
}

interface RpcOptions {
  method: string;
  params?: unknown[];
  /** Route to `/wallet/<name>` for wallet-scoped RPCs (send, sign, gettransaction). */
  wallet?: boolean;
  log?: Logger;
}

let warnedPlaintextAuth = false;

async function rpc<T>({ method, params = [], wallet, log }: RpcOptions): Promise<T> {
  let url = baseRpcUrl();
  if (wallet) {
    const name = await resolveWalletName(log);
    url = `${url}/wallet/${encodeURIComponent(name)}`;
  }
  const user = process.env.ITC_RPC_USER ?? "";
  const password = process.env.ITC_RPC_PASSWORD ?? "";
  if (!warnedPlaintextAuth && (user || password) && url.startsWith("http://")) {
    warnedPlaintextAuth = true;
    log?.warn(
      "ITC RPC uses Basic auth over plain HTTP; credentials are unencrypted in transit. Use an HTTPS/TLS proxy (set ITC_RPC_URL) on untrusted networks.",
    );
  }
  const auth = Buffer.from(`${user}:${password}`).toString("base64");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      jsonrpc: "1.0",
      id: "social-mining",
      method,
      params,
    }),
  });
  if (!res.ok) {
    throw new Error(`ITC RPC ${method} failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { result: T; error: unknown };
  if (json.error) throw new Error(`ITC RPC ${method} error: ${JSON.stringify(json.error)}`);
  return json.result;
}

function fakeTxid(seed: string): string {
  return createHash("sha256")
    .update(seed + randomBytes(8).toString("hex"))
    .digest("hex");
}

/** Verify a signed message proves control of an address. */
export async function verifyMessage(
  address: string,
  signature: string,
  message: string,
  log?: Logger,
): Promise<boolean> {
  if (itcMode() === "rpc") {
    try {
      return await rpc<boolean>({
        method: "verifymessage",
        params: [address, signature, message],
      });
    } catch (err) {
      log?.error({ err }, "verifymessage RPC failed");
      return false;
    }
  }
  // Simulation: accept a plausible-looking signature (base64-ish, >= 64 chars).
  const looksSigned = /^[A-Za-z0-9+/=]{32,}$/.test(signature.trim());
  log?.info({ address, looksSigned, mode: "simulated" }, "verifyMessage (simulated)");
  return looksSigned;
}

/**
 * Authoritative address validation: structural format check first, then the
 * ITC node's `validateaddress` RPC when the real settlement node is enabled.
 */
export async function validateAddress(
  address: string,
  log?: Logger,
): Promise<boolean> {
  if (!isValidItcAddressFormat(address)) return false;
  if (itcMode() === "rpc") {
    try {
      const info = await rpc<{ isvalid?: boolean }>({
        method: "validateaddress",
        params: [address.trim()],
      });
      return Boolean(info?.isvalid);
    } catch (err) {
      log?.error({ err }, "validateaddress RPC failed");
      return false;
    }
  }
  return true;
}

export interface SendManyRecipient {
  address: string;
  amountItc: number;
}

/**
 * Thrown when a payout broadcast fails at or after `sendrawtransaction`, i.e.
 * the raw transaction may have already reached the node/network before the
 * client saw an error. The outcome is UNCERTAIN: callers must NOT retry or
 * release the payouts (that risks a double-pay) and should instead reconcile
 * by tx lookup or operator action. Failures strictly before the broadcast call
 * (funding/signing/finalizing) throw a plain Error and are safe to retry.
 */
export class BroadcastAmbiguousError extends Error {
  readonly broadcastMaybeOccurred = true;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "BroadcastAmbiguousError";
  }
}

/**
 * Disburse a batch of payouts in a single transaction via a funded PSBT.
 *
 * Uses the PSBT flow rather than `sendmany`/`sendtoaddress`: the wallet builds
 * and funds the transaction (auto-selecting inputs + change), signs it, the
 * PSBT is finalized to raw hex, and the hex is broadcast. This decouples
 * construction/signing from the broadcast call and gives an explicit, fully
 * inspectable transaction before it hits the network.
 *
 * Steps (Bitcoin-like JSON-RPC):
 *   walletcreatefundedpsbt -> walletprocesspsbt (sign) ->
 *   finalizepsbt (extract hex) -> sendrawtransaction
 */
export async function sendBatchPsbt(
  recipients: SendManyRecipient[],
  comment: string,
  log?: Logger,
): Promise<string> {
  if (itcMode() === "rpc") {
    // Collapse duplicate addresses so each appears once with a summed amount.
    const amounts: Record<string, number> = {};
    for (const r of recipients) {
      amounts[r.address] = (amounts[r.address] ?? 0) + r.amountItc;
    }
    // walletcreatefundedpsbt expects outputs as an array of {address: amount}.
    const outputs = Object.entries(amounts).map(([address, amountItc]) => ({
      [address]: amountItc,
    }));

    const created = await rpc<{ psbt: string }>({
      method: "walletcreatefundedpsbt",
      params: [[], outputs, 0, {}],
      wallet: true,
      log,
    });
    const processed = await rpc<{ psbt: string; complete: boolean }>({
      method: "walletprocesspsbt",
      params: [created.psbt, true],
      wallet: true,
      log,
    });
    if (!processed.complete) {
      throw new Error(
        "PSBT is not fully signed (walletprocesspsbt returned complete=false); the payout wallet is missing keys to sign all inputs.",
      );
    }
    const finalized = await rpc<{ hex?: string; complete: boolean }>({
      method: "finalizepsbt",
      params: [processed.psbt, true],
      wallet: true,
      log,
    });
    if (!finalized.complete || !finalized.hex) {
      throw new Error("PSBT could not be finalized into a broadcastable transaction.");
    }
    let txid: string;
    try {
      txid = await rpc<string>({
        method: "sendrawtransaction",
        params: [finalized.hex],
      });
    } catch (err) {
      // The signed raw tx may have reached the node before this error surfaced
      // (e.g. a transport failure after the node accepted it). Outcome is
      // uncertain — signal the caller so it does NOT release for retry.
      throw new BroadcastAmbiguousError(
        "sendrawtransaction failed; the transaction may already have been broadcast and requires reconciliation before any retry.",
        { cause: err },
      );
    }
    log?.info(
      { recipients: recipients.length, txid, comment, mode: "rpc" },
      "sendBatchPsbt broadcast",
    );
    return txid;
  }
  const txid = fakeTxid(comment + recipients.map((r) => r.address).join(","));
  log?.info({ recipients: recipients.length, txid, mode: "simulated" }, "sendBatchPsbt (simulated)");
  return txid;
}

/** Anchor a merkle root on-chain via an OP_RETURN output. */
export async function anchorMerkleRoot(
  merkleRoot: string,
  log?: Logger,
): Promise<{ txid: string; mode: "rpc" | "simulated" }> {
  if (itcMode() === "rpc") {
    // 0x4a4d = "JM" tag + root, embedded via an OP_RETURN data output.
    const data = `4a4d${merkleRoot}`;
    const raw = await rpc<string>({
      method: "createrawtransaction",
      params: [[], [{ data }]],
    });
    const funded = await rpc<{ hex: string }>({
      method: "fundrawtransaction",
      params: [raw],
      wallet: true,
      log,
    });
    const signed = await rpc<{ hex: string }>({
      method: "signrawtransactionwithwallet",
      params: [funded.hex],
      wallet: true,
      log,
    });
    const txid = await rpc<string>({
      method: "sendrawtransaction",
      params: [signed.hex],
    });
    return { txid, mode: "rpc" };
  }
  const txid = fakeTxid("anchor:" + merkleRoot);
  log?.info({ merkleRoot, txid, mode: "simulated" }, "anchorMerkleRoot (simulated)");
  return { txid, mode: "simulated" };
}

/** Number of confirmations for a txid (used to advance payout status). */
export async function getConfirmations(txid: string, log?: Logger): Promise<number> {
  if (itcMode() === "rpc") {
    try {
      const tx = await rpc<{ confirmations?: number }>({
        method: "gettransaction",
        params: [txid],
        wallet: true,
        log,
      });
      return tx.confirmations ?? 0;
    } catch (err) {
      log?.error({ err }, "gettransaction RPC failed");
      return 0;
    }
  }
  // Simulation: a deterministic-but-progressing confirmation count.
  const seed = parseInt(txid.slice(0, 4), 16);
  return 1 + (seed % 6);
}
