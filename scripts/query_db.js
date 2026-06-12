import Database from "better-sqlite3";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(__dirname, "../artifacts/api-server/.data/social-mining.db");

console.log("Opening database at:", dbPath);
const db = new Database(dbPath, { readonly: true });

try {
  const payouts = db.prepare("SELECT * FROM payouts ORDER BY created_at DESC").all();
  console.log("\n=== PAYOUTS ===");
  if (payouts.length === 0) {
    console.log("No payouts found.");
  } else {
    console.table(payouts.map(p => ({
      id: p.id,
      block_id: p.block_id,
      handle: p.handle,
      itc_address: p.itc_address,
      amount_itc: p.amount_itc,
      status: p.status,
      batch_txid: p.batch_txid,
      paid_at: p.paid_at
    })));
  }

  const audit = db.prepare("SELECT * FROM audit_log ORDER BY ts DESC LIMIT 10").all();
  console.log("\n=== RECENT AUDIT LOGS ===");
  if (audit.length === 0) {
    console.log("No audit logs found.");
  } else {
    console.table(audit.map(a => ({
      actor: a.actor,
      action: a.action,
      entity: a.entity,
      detail: a.detail,
      ts: a.ts
    })));
  }

  const blocks = db.prepare("SELECT * FROM blocks ORDER BY seq DESC").all();
  console.log("\n=== BLOCKS ===");
  if (blocks.length === 0) {
    console.log("No blocks found.");
  } else {
    console.table(blocks.map(b => ({
      seq: b.seq,
      title: b.title,
      status: b.status,
      x_post_id: b.x_post_id,
      reward_itc: b.reward_itc,
      opens_at: b.opens_at,
      settled_at: b.settled_at
    })));
  }
} catch (err) {
  console.error("Error querying database:", err);
} finally {
  db.close();
}
