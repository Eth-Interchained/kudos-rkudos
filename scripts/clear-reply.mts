// Quick script to find and delete the stale reply blocking re-submission
import Database from "better-sqlite3";
import { resolve } from "node:path";

const dbPath = process.env.SQLITE_PATH ?? resolve(process.cwd(), ".data/social-mining.db");
const db = new Database(dbPath);

const tweetId = "2063810008807071806";

console.log(`\nLooking for reply with x_reply_id = ${tweetId}...\n`);

const rows = db.prepare(
  `SELECT id, block_id, status, quality_score, substr(reply_text, 1, 100) as text_preview 
   FROM replies WHERE x_reply_id = ?`
).all(tweetId);

if (rows.length === 0) {
  console.log("No matching reply found — safe to re-submit.");
} else {
  console.log(`Found ${rows.length} matching reply(ies):`);
  console.table(rows);
  
  // Delete them
  const result = db.prepare(`DELETE FROM replies WHERE x_reply_id = ?`).run(tweetId);
  console.log(`\nDeleted ${result.changes} reply(ies). You can now re-submit this tweet.`);
}

db.close();
