import { createHash } from "node:crypto";

export interface MerkleLeafInput {
  handle: string;
  itcAddress: string;
  amountItc: number;
}

export interface MerkleLeaf extends MerkleLeafInput {
  leafHash: string;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function leafHash(leaf: MerkleLeafInput): string {
  return sha256(`${leaf.handle}|${leaf.itcAddress}|${leaf.amountItc.toFixed(8)}`);
}

/**
 * Build a binary merkle tree over the payout leaves. Leaves are sorted by hash
 * for deterministic roots regardless of input order. Odd nodes are duplicated.
 */
export function buildMerkle(inputs: MerkleLeafInput[]): {
  root: string;
  leaves: MerkleLeaf[];
} {
  const leaves: MerkleLeaf[] = inputs.map((l) => ({ ...l, leafHash: leafHash(l) }));
  if (leaves.length === 0) {
    return { root: sha256("empty"), leaves };
  }
  let level = leaves
    .map((l) => l.leafHash)
    .sort((a, b) => a.localeCompare(b));
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left;
      next.push(sha256(left + right));
    }
    level = next;
  }
  return { root: level[0], leaves };
}
