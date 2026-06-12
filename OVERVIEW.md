# Kudos — Full App Scope

**Interchained Social Mining — by Interchained, 2026**

**What it is:** a transparency-first crypto gameshow that pays **ITC** tokens for
high-quality, original **X (Twitter) replies**, mined in Satoshi-style blocks.
Every block is solved in the open and every payout is provable on-chain. The
project is a pnpm monorepo with three parts: a public web app, an operator
console, and an Express API backed by SQLite.

---

## 1. Public website (`artifacts/social-mining`)

| Route | Page | Description |
|---|---|---|
| `/` | **Landing** | Hero ("Inverted Hashpower"), block cadence, live countdown to the next solve, reward model explainer. |
| `/blocks` | **Blocks** | Active mining blocks plus a "Past Posts" archive of imported X history, each showing its ITC reward. |
| `/blocks/:seq` | **Block Detail** | A single block: its X post, scored replies, status, and reward. |
| `/blocks/:seq/settlement` | **Settlement** | The provable settlement record for a block (winners, amounts, Merkle proof). |
| `/participants/:handle` | **Participant** | A contributor's profile, history, and earnings. |
| `/wallet` | **Wallet** | A participant's ITC balance and claim status. |
| `/payouts` | **Payouts** | Public ledger of on-chain payouts. |
| `/projects`, `/projects/:id` | **Projects / Detail** | Sponsored projects/campaigns that fund blocks. |
| `/apply` | **Project Apply** | Form for projects to apply to sponsor. |
| `/register` | **Register** | Participant sign-up. |

## 2. Operator console (admin-only, gated by `ADMIN_TOKEN_SHA256`)

| Route | Page | Description |
|---|---|---|
| `/console` | **Dashboard** | Operations overview. |
| `/console/blocks` | **Manage Blocks** | Auto-post toggle, per-block AiAS/share/sync controls, the import + mining-start panel. |
| `/console/review` | **Review Queue** | Manual approve/reject of scored replies before payout. |
| `/console/projects` | **Project Applications** | Approve/manage sponsor applications. |
| `/console/abuse` | **Abuse Events** | Flagged duplicate / low-trust / abusive activity. |
| `/console/audit` | **Audit Log** | Immutable record of every mutating admin action. |

## 3. API backend (`artifacts/api-server`, Express + SQLite/Drizzle)

**Routes:** `overview`, `blocks`, `replies`, `participants`, `contributors`,
`wallet`, `payouts`, `settlement`, `projects`, `subscribers`, `import`, `chain`,
`settings`, `abuse`, `audit`, `admin`, `health`. Public reads are open; all
mutating routes require the admin token (fail-closed).

**Core services:**

- **scheduler** — the autonomous miner (gated by `SCHEDULER_ENABLED`): every
  `BLOCK_INTERVAL_MS` it settles overdue open blocks, opens the next, cooks an
  AiAS post, then auto-syncs replies. Requires an always-on host.
- **emission / settlement / merkle** — block lifecycle, winner selection, and
  Merkle-proof settlement records.
- **scoring / replyPipeline** — ingest replies, score them
  (Quality × Trust × Uniqueness × Reach), and dedupe.
- **rewardModel** — governance-linked rewards: each reward = `GOV_REWARD_SHARE`
  × the ITC treasury coinbase over the last `GOV_REWARD_BLOCKS` confirmed blocks
  (read live). Keeps payouts small and pegged to the real chain.
- **broadcast / lock** — atomic, single-broadcast payout disbursement via a
  funded PSBT with a strict status state machine (no double-spend).
- **netrowsSync** — pulls live X replies; **importPosts / seed** turn real
  imported @interchained posts into reward-earning blocks (earliest = block 0);
  no fabricated demo data.
- **blast / subscribers** — real-SMTP weekly email digest (no simulation).
- **settings / config / audit / queries / mappers** — runtime `app_settings`,
  tunables, audit trail, and data access.

**Integrations:** `netrows` (X data) · `x` / `xPost` (X posting via intent URLs
or the full X API) · `aias` (AI reply scoring + post generation, real-service
only) · `itc` / `visionChain` (ITC node RPC + chain explorer) · `email` (SMTP).

## 4. Data model (`lib/db/src/schema`)

`blocks`, `replies`, `participants`, `payouts`, `settlements`, `projects`,
`projectPosts`, `subscribers`, `blastRuns`, `abuseEvents`, `auditLog`,
`appSettings`.

## 5. Configuration (`.env.example`)

Grouped into: core runtime, admin auth, scheduler cadence, governance reward
model, treasury/scoring guardrails, ITC settlement node RPC, NetRows, X posting,
AiAS, and SMTP. Everything is optional except the admin token — unset services
run in safe disabled/simulated modes, **except** AiAS and email/blast, which are
real-service-only by design (no mock fallback).
