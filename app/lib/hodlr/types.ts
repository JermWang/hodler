export type HodlrEpochStatus =
  | "draft"
  | "snapshotting"
  | "finalized"
  | "ranking_computed"
  | "distribution_dry_run"
  | "claim_open"
  | "claim_closed"
  | "settled";

export type HodlrEpochRecord = {
  id: string;
  epochNumber: number;
  startAtUnix: number;
  endAtUnix: number;
  status: HodlrEpochStatus;
  createdAtUnix: number;
  updatedAtUnix: number;
  finalizedAtUnix?: number | null;
};

export type HodlrHolderStateRecord = {
  walletPubkey: string;
  firstSeenUnix: number;
  lastBalanceRaw: string;
  updatedAtUnix: number;
};

export type HodlrSnapshotRecord = {
  epochId: string;
  walletPubkey: string;
  balanceRaw: string;
  firstSeenUnix: number;
  snapshotAtUnix: number;
};

export type HodlrRankingRecord = {
  epochId: string;
  walletPubkey: string;
  rank: number;
  holdingDays: number;
  balanceRaw: string;
  weight: number;
  shareBps: number;
  computedAtUnix: number;
};

export type HodlrDistributionRecord = {
  epochId: string;
  walletPubkey: string;
  amountLamports: string;
  createdAtUnix: number;
};
