import { drizzle } from "drizzle-orm/better-sqlite3";
import Database, { type Database as DatabaseInstance } from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";

const dbPath = process.env.SQLITE_PATH ?? resolve(process.cwd(), ".data/social-mining.db");
mkdirSync(dirname(dbPath), { recursive: true });

export const sqlite: DatabaseInstance = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

sqlite.exec(`
CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  x_user_id TEXT NOT NULL UNIQUE,
  x_handle TEXT NOT NULL,
  account_created TEXT,
  followers_count INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  trust_score REAL NOT NULL DEFAULT 0,
  behavior_score REAL NOT NULL DEFAULT 0.5,
  poh_tier INTEGER NOT NULL DEFAULT 0,
  itc_address TEXT,
  address_proved_at TEXT,
  bind_nonce TEXT,
  banned INTEGER NOT NULL DEFAULT 0,
  ban_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL UNIQUE,
  x_post_id TEXT UNIQUE,
  x_post_url TEXT,
  post_content TEXT,
  x_posted_at TEXT,
  post_mode TEXT,
  title TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  reward_itc REAL NOT NULL DEFAULT 0,
  required_keywords TEXT NOT NULL DEFAULT '[]',
  bonus_keywords TEXT NOT NULL DEFAULT '[]',
  sponsor TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  per_account_cap_itc REAL,
  quality_floor INTEGER NOT NULL DEFAULT 60,
  trust_floor REAL NOT NULL DEFAULT 0.2,
  opens_at TEXT,
  closes_at TEXT,
  settled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS replies (
  id TEXT PRIMARY KEY,
  block_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  x_reply_id TEXT UNIQUE,
  reply_text TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL DEFAULT '',
  token_signature TEXT NOT NULL DEFAULT '[]',
  quality_score REAL NOT NULL DEFAULT 0,
  ai_scores TEXT,
  trust_weight REAL NOT NULL DEFAULT 0,
  uniqueness REAL NOT NULL DEFAULT 1,
  reach_factor REAL NOT NULL DEFAULT 1,
  social_hashpower REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ingested',
  rejection_reason TEXT,
  flagged INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (block_id, participant_id)
);

CREATE TABLE IF NOT EXISTS settlements (
  block_id TEXT PRIMARY KEY,
  total_hashpower REAL NOT NULL DEFAULT 0,
  valid_miners INTEGER NOT NULL DEFAULT 0,
  total_replies INTEGER NOT NULL DEFAULT 0,
  reward_itc REAL NOT NULL DEFAULT 0,
  merkle_root TEXT NOT NULL DEFAULT '',
  leaves TEXT NOT NULL DEFAULT '[]',
  anchor_txid TEXT,
  anchor_mode TEXT NOT NULL DEFAULT 'simulated',
  computed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payouts (
  id TEXT PRIMARY KEY,
  block_id TEXT NOT NULL,
  reply_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  itc_address TEXT,
  amount_itc REAL NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  batch_txid TEXT,
  confirmations INTEGER NOT NULL DEFAULT 0,
  approved_by TEXT,
  flagged INTEGER NOT NULL DEFAULT 0,
  hold_reason TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS abuse_events (
  id TEXT PRIMARY KEY,
  participant_id TEXT,
  block_id TEXT,
  reply_id TEXT,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'low',
  detail TEXT,
  resolved TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  detail TEXT,
  ts TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  x_handle TEXT NOT NULL,
  x_user_id TEXT,
  description TEXT NOT NULL DEFAULT '',
  website_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  reviewed_at TEXT,
  applied_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_posts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  x_post_id TEXT NOT NULL,
  x_post_url TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  synced_at TEXT NOT NULL,
  UNIQUE (project_id, x_post_id)
);

CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  unsub_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  unsubscribed_at TEXT
);

CREATE TABLE IF NOT EXISTS blast_runs (
  id TEXT PRIMARY KEY,
  period_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'running',
  recipient_count INTEGER NOT NULL DEFAULT 0,
  post_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);
`);

export const db = drizzle(sqlite, { schema });

export * from "./schema";
