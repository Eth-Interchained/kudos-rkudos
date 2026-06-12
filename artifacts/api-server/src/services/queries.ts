import { eq } from "drizzle-orm";
import {
  db,
  blocksTable,
  repliesTable,
  participantsTable,
  payoutsTable,
  settlementsTable,
  type Block,
} from "@workspace/db";

export async function getBlockBySeq(seq: number): Promise<Block | undefined> {
  const rows = await db
    .select()
    .from(blocksTable)
    .where(eq(blocksTable.seq, seq))
    .limit(1);
  return rows[0];
}

export async function blockCounts(
  blockId: string,
): Promise<{ replyCount: number; validCount: number }> {
  const rows = await db
    .select({ status: repliesTable.status })
    .from(repliesTable)
    .where(eq(repliesTable.blockId, blockId));
  return {
    replyCount: rows.length,
    validCount: rows.filter((r) => r.status === "valid").length,
  };
}

const floor8 = (n: number) => Math.floor(n * 1e8) / 1e8;

export interface LeaderboardEntry {
  rank: number;
  handle: string;
  followersCount: number;
  verified: boolean;
  socialHashpower: number;
  qualityScore: number;
  trustWeight: number;
  uniqueness: number;
  reachFactor: number;
  estimatedItc: number;
  flagged: boolean;
}

export async function buildLeaderboard(
  block: Block,
): Promise<LeaderboardEntry[]> {
  const rows = await db
    .select({ reply: repliesTable, participant: participantsTable })
    .from(repliesTable)
    .innerJoin(
      participantsTable,
      eq(repliesTable.participantId, participantsTable.id),
    )
    .where(eq(repliesTable.blockId, block.id));

  const valid = rows
    .filter((r) => r.reply.status === "valid")
    .sort((a, b) => b.reply.socialHashpower - a.reply.socialHashpower);
  const totalHp = valid.reduce((s, r) => s + r.reply.socialHashpower, 0);
  const cap = block.perAccountCapItc ?? Infinity;

  return valid.map((r, i) => {
    const share = totalHp > 0 ? r.reply.socialHashpower / totalHp : 0;
    return {
      rank: i + 1,
      handle: r.participant.xHandle,
      followersCount: r.participant.followersCount,
      verified: r.participant.verified,
      socialHashpower: r.reply.socialHashpower,
      qualityScore: r.reply.qualityScore,
      trustWeight: r.reply.trustWeight,
      uniqueness: r.reply.uniqueness,
      reachFactor: r.reply.reachFactor,
      estimatedItc: floor8(Math.min(block.rewardItc * share, cap)),
      flagged: r.reply.flagged,
    };
  });
}

export interface SettlementProof {
  blockSeq: number;
  blockTitle: string;
  totalHashpower: number;
  validMiners: number;
  rewardItc: number;
  merkleRoot: string;
  anchorTxid: string | null;
  computedAt: string | null;
  leaves: Array<{
    handle: string;
    itcAddress: string;
    amountItc: number;
    leafHash: string;
  }>;
}

export async function buildSettlementProof(
  block: Block,
): Promise<SettlementProof | null> {
  const settlementRows = await db
    .select()
    .from(settlementsTable)
    .where(eq(settlementsTable.blockId, block.id))
    .limit(1);
  const settlement = settlementRows[0];
  if (!settlement) return null;

  // Leaves are frozen at settlement time so the published proof always matches
  // the anchored merkle root, even after wallets are bound to payouts later.
  const leaves = settlement.leaves ?? [];

  return {
    blockSeq: block.seq,
    blockTitle: block.title,
    totalHashpower: settlement.totalHashpower,
    validMiners: settlement.validMiners,
    rewardItc: settlement.rewardItc,
    merkleRoot: settlement.merkleRoot,
    anchorTxid: settlement.anchorTxid,
    computedAt: settlement.computedAt,
    leaves,
  };
}
