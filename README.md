# AmpliFi

![AmpliFi](public/branding/amplifi-banner.png)

AmpliFi is a creator growth protocol for Solana that turns organic social engagement into rewards.

Creators launch a token, start campaigns, and fund reward pools. Holders (raiders) connect X, participate, and claim payouts. The app includes admin tooling for launch operations and a vanity mint worker for fast AMP-suffix launches.

![Next.js](https://img.shields.io/badge/Next.js-14.2-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)
![Node](https://img.shields.io/badge/Node-%3E%3D%2020.18-3c873a)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.x-06b6d4)
![Solana](https://img.shields.io/badge/Solana-mainnet--beta-14f195)

## Table of contents

- [Product](#product)
- [Key routes](#key-routes)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repo structure](#repo-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Background workers](#background-workers)
- [Admin tools](#admin-tools)
- [Deployment](#deployment)
- [Cron jobs](#cron-jobs)
- [Troubleshooting](#troubleshooting)
- [Security and custody](#security-and-custody)
- [Operations](#operations)

## Product

- **Token launch (Pump.fun)**
  - Guided launch flow with optional AMP vanity suffix.
  - Uses server-side signing (Privy) plus Solana RPC submission.
- **Campaigns**
  - Configure tracking handles/hashtags and epoch-based reward settlement.
  - Rewards can be viewed in dashboards and leaderboards.
- **Raider (holder) dashboard**
  - Connect wallet + verify X account.
  - View claimable rewards and claim via on-chain transactions.
- **Creator dashboard**
  - View launches/projects.
  - Claim creator-side rewards supported by the current integration.
- **Admin operations**
  - Vanity mint pool status + top-up triggers.
  - Clear launch history for an admin wallet (for test iteration).

Note: Bags UI is currently hidden/disabled.

## Key routes

- **Landing**: `/`
- **Launch**: `/launch`
- **Creator dashboard**: `/creator`
- **Raider dashboard**: `/holder`
- **Campaigns**: `/campaigns`
- **Leaderboards**: `/leaderboard`
- **Admin**: `/admin`

## Architecture

High level flow:

```mermaid
flowchart LR
  U[Wallet + X user] -->|Next.js UI| WEB[app/*]
  WEB --> API[Next.js API routes]
  API --> DB[(Postgres / Supabase)]
  API --> RPC[Solana RPC]
  API --> PRIVY[Privy server wallets]
  API --> PUMPPORTAL[PumpPortal: build tx]
  API --> XAPI[X API v2]
```

Data storage:

- Campaign state and engagement accounting live in Postgres via Supabase migrations in `supabase/migrations/`.
- Launch operations and vanity mint pool also use Postgres.

## Tech stack

- **Web**: Next.js 14 (App Router), React 18, TypeScript
- **Styling**: TailwindCSS
- **Solana**: `@solana/web3.js`, Solana Wallet Adapter
- **Server wallet signing**: Privy server wallets
- **Database**: Postgres (Supabase recommended)
- **Media**: Remotion (optional scripts)

## Repo structure

- `app/`
  - Next.js App Router pages and API routes
- `app/lib/`
  - Core protocol and integration logic
- `supabase/migrations/`
  - Postgres schema for campaigns, epochs, engagement, and payouts
- `workers/`
  - Background workers (vanity mint pool)
- `public/`
  - Static assets (branding, token images)

## Getting started

### Prerequisites

- Node.js `>= 20.18.0`
- Postgres database (Supabase recommended)
- A reliable Solana RPC (use separate server vs browser keys in production)

### Install

```bash
npm install
```

### Common scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run vanity-worker
```

### Configure environment

Create `.env.local` at the repo root:

Windows (PowerShell):

```bash
copy .env.example .env.local
```

macOS/Linux:

```bash
cp .env.example .env.local
```

Then fill in values (see [Environment variables](#environment-variables)).

### Database migrations

Migrations live in `supabase/migrations/`.

Apply them using one of these approaches:

- **Supabase Dashboard**
  - Open SQL Editor and run the migrations in order.
- **psql (direct connection)**
  - Run each file in order:

```bash
psql "$DATABASE_URL" -f supabase/migrations/0011_amplifi_init.sql
psql "$DATABASE_URL" -f supabase/migrations/0012_twitter_oauth.sql
psql "$DATABASE_URL" -f supabase/migrations/0013_amplifi_profiles_payouts.sql
psql "$DATABASE_URL" -f supabase/migrations/0014_twitter_rate_limits.sql
psql "$DATABASE_URL" -f supabase/migrations/0015_manual_lockup.sql
```

### Run the app

```bash
npm run dev
```

Open http://localhost:3000

## Environment variables

The canonical list is in `.env.example`. This section summarizes the important groups.

Tip: the app supports comma separated RPC lists for fallback.

### Browser (NEXT_PUBLIC_*)

- `NEXT_PUBLIC_SOLANA_CLUSTER` (recommended: `mainnet-beta`)
- `NEXT_PUBLIC_SOLANA_RPC_URLS` (recommended) or `NEXT_PUBLIC_SOLANA_RPC_URL` (optional)
  - Use a browser safe RPC key with allowed origins set for your domains.

### Server (Next.js API routes)

#### Required for most environments

- `DATABASE_URL`
- `SOLANA_RPC_URLS` (recommended) or `SOLANA_RPC_URL`
- `ADMIN_WALLET_PUBKEYS`

#### Strongly recommended in production

- `APP_ORIGIN` (admin endpoints enforce Origin checking in production)
- `ESCROW_DB_SECRET` (required in production, encrypts escrow and vanity secrets at rest)

### Required for Pump.fun launch signing

- `PRIVY_APP_ID`
- `PRIVY_APP_SECRET`
- `PRIVY_AUTHORIZATION_PRIVATE_KEY` (or `PRIVY_AUTHORIZATION_PRIVATE_KEYS` comma separated)

### Supabase Storage (uploads)

- `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PROJECT_ASSETS_BUCKET` (optional, defaults to `project-assets`)
- `SUPABASE_AVATAR_BUCKET` (optional, defaults to `avatars`)

### Cron + automated operations

- `CRON_SECRET` (required to call cron endpoints)
- `ESCROW_FEE_PAYER_SECRET_KEY` (recommended)
  - Used to sponsor transaction fees for fee claims and sweeps.
- Optional tuning
  - `CRON_PUMPFUN_MAX_RUN_MS`
  - `CRON_PUMPFUN_SWEEP_LIMIT`
  - `CRON_PUMPFUN_CONFIRM_TIMEOUT_MS`
  - `CTS_CREATOR_FEE_SWEEP_KEEP_LAMPORTS`

### Recommended for production observability and stability

- `AUDIT_WEBHOOK_URL` (optional alerting)
- `PG_POOL_MAX`, `PG_POOL_CONNECTION_TIMEOUT_MS`, `PG_POOL_IDLE_TIMEOUT_MS` (if tuning connections)

### X integration

- `TWITTER_CLIENT_ID`
- `TWITTER_CLIENT_SECRET`
- `TWITTER_CALLBACK_URL`
- `TWITTER_BEARER_TOKEN` (optional)

### Vanity mint pool

- `VANITY_WORKER_SUFFIX` (must be `AMP`)
- `VANITY_WORKER_MIN_AVAILABLE` (default: 10)
- `VANITY_WORKER_TARGET_AVAILABLE` (default: 50)
- `VANITY_WORKER_IDLE_SLEEP_MS` (default: 30000)

## Background workers

### Vanity mint worker

This worker keeps a pool of AMP-suffix mint keypairs topped up in Postgres so launches do not block on vanity generation.

```bash
npm run vanity-worker
```

## Admin tools

Admin UI: `/admin`

- **Admin login**
  - Connect wallet
  - Sign once to create an admin session cookie
- **Vanity mint pool**
  - View pool size and trigger top-ups
- **Clear launch history**
  - Archives the current wallet's managed launch records for test iteration

## Deployment

Recommended: deploy on Vercel.

- Set all required env vars in the Vercel project settings.

Netlify is also supported via `netlify.toml`.

- Build: `npm run build`
- Start: `npm run start`

You can also deploy to Vercel or any Node hosting that supports Next.js.

## Cron jobs

### Pump.fun creator fee sweep

Endpoint:

- `GET /api/cron/pumpfun-fee-sweep`
- `POST /api/cron/pumpfun-fee-sweep`

Auth:

- Header `x-cron-secret: $CRON_SECRET`, or
- Header `authorization: Bearer $CRON_SECRET`

Vercel schedule is configured in `vercel.json`.

You can run this endpoint on any scheduler (for example cronjobs.org) as long as it includes the correct `CRON_SECRET` header.

## Troubleshooting

### Campaign escrow shows zero balance but has funds (WSOL)

**Important**: Campaign escrow wallets may hold funds as WSOL (Wrapped SOL) instead of native SOL. This can happen when:
- PumpPortal trades return WSOL
- Other DeFi integrations wrap SOL automatically

If the dashboard shows zero escrow balance but Solscan shows WSOL tokens in the escrow wallet, the funds are there - they are just wrapped. The creator dashboard now includes WSOL balance when calculating escrow totals. To verify:
1. Check the escrow wallet on Solscan under the "Tokens" tab
2. Look for WSOL (mint: `So11111111111111111111111111111111111111112`)

### Launch fails

Common causes:

- Privy misconfiguration (missing auth key)
- RPC instability or rate limiting
- PumpPortal request failures
- Vanity pool is low (AMP mints depleted)

### Admin endpoints return 403

- Check `APP_ORIGIN` in production.
- Ensure requests originate from the correct site origin.

### Database errors

- Verify `DATABASE_URL`.
- Ensure migrations are applied.

## Security and custody

- Client wallets sign user actions (wallet adapter).
- Privy server wallets are used for specific server-side signing flows.
- Secrets must never be committed. Use `.env.local` and your hosting provider's secret store.

## Operations

See `RUNBOOK.md` for operational guidance (secrets, monitoring, incident response).
