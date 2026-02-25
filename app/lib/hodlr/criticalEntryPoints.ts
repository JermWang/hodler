export const HODLR_CRITICAL_NO_TOUCH = {
  walletAuth: [
    "app/components/SolanaWalletProvider.tsx",
  ],
  claims: [
    "app/api/holder/hodlr/claim/route.ts",
    "app/api/holder/hodlr/claimable/route.ts",
  ],
  payoutAndCustody: [
    "app/lib/hodlr/escrow.ts",
    "app/lib/privy.ts",
  ],
  adminControls: [
    "app/api/cron/hodlr-snapshot/route.ts",
    "app/api/cron/hodlr-rank/route.ts",
    "app/api/cron/hodlr-distribution-dry-run/route.ts",
    "app/api/cron/hodlr-advance/route.ts",
    "app/api/cron/hodlr-claim-open/route.ts",
    "app/api/cron/hodlr-claim-close/route.ts",
  ],
} as const;
