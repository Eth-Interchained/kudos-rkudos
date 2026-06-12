# Kudos

**Interchained Social Mining — by Interchained, 2026**

> _"If you don't believe it or don't get it, I don't have the time to try to convince you, sorry."_ — in the spirit of Satoshi: don't trust, verify. Here every block is mined in the open and every payout is provable.

A transparency-first crypto gameshow that pays **ITC** tokens for high-quality,
original X (Twitter) replies — mined Satoshi-style in fixed-cadence blocks.
Instead of rewarding reach and follower counts, it inverts social hashpower:
**Quality × Trust × Uniqueness × Reach**. Real posts, real on-chain settlement,
no fabricated engagement.

---

## What it does

- **Blocks, not feeds.** A new block "solves" on a fixed interval (default every
  10 minutes). Each open block has a topic and a reward pool; the best original
  replies split the pool by their social hashpower.
- **Governance-linked rewards.** A block's pool isn't a made-up subsidy — it's
  pegged to the live Interchained chain: a small share (default 10%) of the
  treasury/governance coinbase summed over the last N confirmed ITC blocks.
- **Provable payouts.** Settlements batch approved, wallet-bound payouts into a
  single funded PSBT on a Bitcoin-like ITC node — atomically claimed so a payout
  can never be double-broadcast.
- **Real data only.** Reply syncing (NetRows), AI post-cooking (AiAS), X posting,
  and the weekly email digest all run against real services or cleanly disable —
  the platform never fabricates trust, verification, or engagement.
- **Operator console.** Create/advance/settle blocks, cook & post content,
  import @interchained history as past blocks, and run the weekly digest.

## Tech stack

- **Monorepo:** pnpm workspaces, Node.js 24, TypeScript 5.9
- **API:** Express 5 (`artifacts/api-server`)
- **Web:** React 19 + Vite + wouter + TanStack Query, neo-brutalist UI
  (`artifacts/social-mining`)
- **DB:** SQLite via better-sqlite3 + Drizzle ORM
  (`artifacts/api-server/.data/social-mining.db`)
- **Contracts:** OpenAPI → generated Zod schemas + typed React Query hooks
- **Settlement:** Bitcoin-like JSON-RPC node (ITC), PSBT batch payouts

## Repository layout

```
lib/
  db/            Drizzle schema (source of truth) + fresh-DB bootstrap
  api-spec/      OpenAPI spec (source of truth) — run codegen after edits
  api-zod/       generated Zod schemas
  api-client-react/  generated typed React Query hooks
artifacts/
  api-server/    Express API, services, integrations, scheduler
  social-mining/ React + Vite web app (public site + operator console)
scripts/         X post importer (stdlib Python) and tooling
```

## Getting started

Requires **Node.js 24+** and **pnpm**.

```bash
# 1. Install
pnpm install

# 2. Configure
cp .env.example .env
#    Fill in at least ADMIN_TOKEN_SHA256 to use the console.
#    Everything else is optional — unset integrations run in safe/disabled mode.

# 3. Run the API server (binds to PORT, e.g. 8080)
pnpm --filter @workspace/api-server run dev

# 4. In another terminal, run the web app
pnpm --filter @workspace/social-mining run dev
```

Useful commands:

```bash
pnpm run typecheck                                   # full typecheck, all packages
pnpm run build                                        # typecheck + build everything
pnpm --filter @workspace/api-spec run codegen         # regenerate API hooks + Zod from OpenAPI
pnpm --filter @workspace/db run push                  # apply DB schema changes (dev)
```

## Configuration

All settings are environment variables — see [`.env.example`](./.env.example)
for the annotated, complete list. Highlights:

| Variable | Purpose |
| --- | --- |
| `ADMIN_TOKEN_SHA256` | SHA-256 hash of the operator console token (fail-closed). |
| `SCHEDULER_ENABLED` | `true` to autonomously mine/settle/open blocks. Needs an always-on host. |
| `BLOCK_INTERVAL_MS` | Block cadence (default 600000 = 10 min). |
| `GOV_REWARD_SHARE` / `GOV_REWARD_BLOCKS` | Governance-linked reward formula inputs. |
| `ITC_RPC_URL` / `ITC_RPC_USER` / `ITC_RPC_PASSWORD` | ITC settlement node RPC (omit for simulation). |
| `AUTO_BROADCAST_PAYOUTS` | Opt in to on-chain disbursement after settle. |
| `NETROWS_API_KEY` | Live X reply data (omit for simulation). |
| `X_API_KEY` / `X_API_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` | Full-auto X posting. |
| `AIAS_*` | AI reply scoring + post-content. Real service only — omit to skip scoring; no simulated fallback. |
| `SMTP_*` | Weekly digest email — real SMTP only, never simulated. |

> **Note on the scheduler:** the on-page block countdown is a display clock. The
> actual solve/settle/open work only runs when `SCHEDULER_ENABLED=true` on an
> always-on host (e.g. a Reserved VM). On autoscale or in dev it stays off, so
> the timer rolls over visually but no block is mined.

## License

Copyright (C) 2026 Interchained.

This program is free software: you can redistribute it and/or modify it under
the terms of the **GNU General Public License v3.0** as published by the Free
Software Foundation. This program is distributed in the hope that it will be
useful, but **WITHOUT ANY WARRANTY**; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
[LICENSE](./LICENSE) file for the full text.
