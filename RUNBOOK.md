# HODLR Operations Runbook

## Production deployment checklist

- Configure environment variables (see `.env.example`).
- Ensure `DATABASE_URL` is set (required in production).
- Ensure `HODLR_MOCK_MODE` is unset/false (forbidden in production).
- Ensure `ESCROW_DB_SECRET` is set (required in production to encrypt escrow secrets at rest).
- Ensure `CRON_SECRET` is set (required to call cron endpoints).
- Ensure Solana RPC is set:
  - Server: `SOLANA_RPC_URLS` (or `SOLANA_RPC_URL`)
  - Browser: `NEXT_PUBLIC_SOLANA_RPC_URLS` (or `NEXT_PUBLIC_SOLANA_RPC_URL`)
- Ensure Privy is configured (required for escrow signing):
  - `PRIVY_APP_ID`
  - `PRIVY_APP_SECRET`
  - `PRIVY_AUTHORIZATION_PRIVATE_KEY` (or `PRIVY_AUTHORIZATION_PRIVATE_KEYS`)

## HODLR runtime flags

- Enable HODLR:
  - `HODLR_ENABLED=true`
  - `NEXT_PUBLIC_HODLR_ENABLED=true`
- Pipeline mode:
  - `HODLR_SHADOW_MODE=true`
  - `NEXT_PUBLIC_HODLR_SHADOW_MODE=true`

## HODLR configuration

- Token mint:
  - `HODLR_TOKEN_MINT` (required)
- Distribution pool per epoch:
  - `HODLR_DISTRIBUTION_POOL_LAMPORTS` (required for distribution step)
- Claims:
  - `HODLR_CLAIMS_SEND_ENABLED=false` until you are ready for real payouts.
  - After validation, set `HODLR_CLAIMS_SEND_ENABLED=true`.

## Cron endpoints

All cron endpoints require one of:

- Header `x-cron-secret: $CRON_SECRET`, or
- Header `authorization: Bearer $CRON_SECRET`

HODLR cron endpoints:

- `POST /api/cron/hodlr-snapshot`
- `POST /api/cron/hodlr-rank`
- `POST /api/cron/hodlr-distribution-dry-run`
- `POST /api/cron/hodlr-advance`
- `POST /api/cron/hodlr-claim-open?epochId=...`
- `POST /api/cron/hodlr-claim-close?epochId=...`

## Funding

- Claims are paid from the HODLR escrow wallet created via Privy.
- If claims return `Reward pool is currently being replenished`, the escrow wallet is underfunded.

Recommended flow:

- Run snapshot, ranking, and distribution to produce `hodlr_distributions`.
- Ensure the escrow wallet has enough SOL for:
  - Sum of claimable distribution amounts.
  - Plus `HODLR_ESCROW_RESERVE_LAMPORTS` reserve.

## Monitoring

- Use `GET /api/health` for DB + RPC connectivity.

## Incident response

### 1) Database outage / connection failures

Actions:

- Confirm `DATABASE_URL` validity.
- If using a pooler, ensure the pooler URL/port are correct.
- Consider temporarily increasing `PG_POOL_CONNECTION_TIMEOUT_MS`.

### 2) Solana RPC outage / degraded RPC

Actions:

- Switch `SOLANA_RPC_URLS` to a backup provider.
- Verify the new RPC supports `getLatestBlockhash`, `getProgramAccounts`, and balance reads.

### 3) Underfunded HODLR escrow

Actions:

- Fund the escrow wallet address.
- Re-run claim after confirming balance.
