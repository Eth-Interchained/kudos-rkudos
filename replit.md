# Social Mining Platform

A transparency-first crypto gameshow that pays ITC tokens for high-quality, original X (Twitter) replies, mined in Satoshi-style blocks.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (binds to `PORT`, e.g. 8080 in dev)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- DB schema (source of truth): `lib/db/src/schema/*` (blocks, appSettings, etc.); raw fresh-DB CREATE in `lib/db/src/index.ts`.
- API contract (source of truth): `lib/api-spec/openapi.yaml` → run codegen to regenerate `lib/api-zod` and `lib/api-client-react`.
- API server: `artifacts/api-server/src/{routes,services}`. Integrations under `services/integrations/{netrows,x,aias,xPost}.ts`.
- Block lifecycle/emission: `services/{emission,scheduler,netrowsSync,settings}.ts`; tunables in `services/config.ts` (`emissionConfig`).
- Web app: `artifacts/social-mining/src/pages/{public,console}`. Landing shows cadence + halving; `console/ManageBlocks.tsx` has the auto-post toggle + per-block AiAS/share/sync controls + the import/mining-start panel. Public `Blocks.tsx` shows active mining blocks plus a "Past Posts" archive of imported history.
- X post importer: `scripts/import_x_posts.py` (stdlib only) pulls @interchained posts via NetRows into `artifacts/api-server/data/x_posts_reference.json`; `services/importPosts.ts` turns that reference file into real reward-earning blocks at the lowest heights (earliest post = block 0).

## Architecture decisions

- NetRows is the X data source (`integrations/netrows.ts`); `integrations/x.ts` is repointed onto it. No key → graceful simulation; never fabricates trust/verification from NetRows data.
- Blocks auto-mine Satoshi-style: a scheduler (`services/scheduler.ts`, guarded by `SCHEDULER_ENABLED`, unref'd, overlap-guarded) settles overdue open blocks every `BLOCK_INTERVAL_MS` (10 min), opens/creates the next, cooks an AiAS post, then auto-syncs NetRows replies.
- Per-block reward stays admin-configurable; every other reward path (auto-mined, imported, demo) is governance-linked: `services/rewardModel.ts` `computeBlockReward()` = `GOV_REWARD_SHARE` (default 10%) × the governance/treasury coinbase reward summed over the last `GOV_REWARD_BLOCKS` (default 10) confirmed ITC blocks, read live from the Vision explorer (`integrations/visionChain.ts`, 5-min cached, small fixed fallback if unreachable). Keeps rewards small and pegged to the real chain.
- AiAS (`services/aias.ts`) cooks X post content; posting is semi-auto via X intent/share URLs by default, OR fully automated via X-API (`integrations/xPost.ts`) when the `autoPostEnabled` setting is on. Posting simulates gracefully without credentials.
- Runtime settings live in the `app_settings` table (`services/settings.ts`); the `autoPostEnabled` toggle is the iOS-style switch in the console.
- Imported posts become real reward-earning blocks (`postMode="imported"`, `status="closed"`, `rewardItc=computeBlockReward()`) seeded oldest-first at the lowest heights — the earliest post is block 0. They land "closed" (already happened on X), so they are blocks awaiting settlement: sync their replies from NetRows, then settle to distribute. `seed.ts` seeds ONLY these real imported posts (no fabricated demo blocks). The public `Blocks.tsx` groups them by `postMode==="imported"` (not status) into the "Past Posts" section and shows each block's reward.
- `miningStartHeight` setting (`app_settings`, default 0) is the chain's starting height (block 0); it floors auto-mined live blocks, which the scheduler creates at `max(maxSeq+1, miningStartHeight)`. Admin-set via the console import/mining-start panel.
- Payout disbursement (`services/broadcast.ts`) batches a block's approved, wallet-bound payouts into a single funded PSBT (`integrations/itc.ts` `sendBatchPsbt`: walletcreatefundedpsbt → walletprocesspsbt → finalizepsbt → sendrawtransaction), not `sendmany`. Payouts are atomically claimed (approved→broadcasting) before sending; a strict status FSM on `/approve` and `/hold` forbids regression out of in-flight/paid states so a payout can never be re-broadcast. Auto-broadcast after settle is opt-in (`AUTO_BROADCAST_PAYOUTS`, default off).

## External services & secrets

- `NETROWS_API_KEY` (secret, optional): enables live X data via NetRows. Without it, syncing runs in simulation mode.
- `X_WRITE_TOKEN` (secret, optional): enables fully-automated posting to X via X-API. Without it, full-auto posting simulates and produces a fake status URL.
- `X_ACCOUNT_HANDLE` (env, default `interchained`): the account share/intent URLs and auto-posts are attributed to.
- AiAS content uses the Replit AI integration proxy when available, with a deterministic simulated fallback.

## Product

- Public: landing page with live blocks, a "new block every 10 minutes" cadence banner, and a block subsidy/halving panel; block detail, leaderboard, wallet binding, payouts, settlement proofs. The Blocks page also lists imported @interchained history as a "Past Posts" archive.
- Console (admin): create/advance/settle blocks, simulate/inject replies, cook & (re)generate AiAS X posts, one-click "Share on X" intent links, attach a published post URL, manual "Sync from NetRows", import @interchained history as past blocks, set the mining-start height, and a master "Fully automate posting" toggle.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
