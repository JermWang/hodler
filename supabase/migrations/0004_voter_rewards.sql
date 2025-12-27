create table if not exists public.reward_voter_snapshots (
  commitment_id text not null,
  milestone_id text not null,
  signer_pubkey text not null,
  created_at_unix bigint not null,
  project_mint text not null,
  project_ui_amount double precision not null,
  ship_ui_amount double precision not null default 0,
  ship_multiplier_bps integer not null default 10000,
  primary key (commitment_id, milestone_id, signer_pubkey)
);

create index if not exists reward_voter_snapshots_commitment_idx
  on public.reward_voter_snapshots(commitment_id);

create table if not exists public.failure_distributions (
  id text primary key,
  commitment_id text not null unique,
  created_at_unix bigint not null,
  buyback_lamports bigint not null,
  voter_pot_lamports bigint not null,
  ship_buyback_treasury_pubkey text not null,
  buyback_tx_sig text not null,
  voter_pot_tx_sig text null,
  status text not null
);

create index if not exists failure_distributions_commitment_idx
  on public.failure_distributions(commitment_id);

create table if not exists public.failure_distribution_allocations (
  distribution_id text not null,
  wallet_pubkey text not null,
  amount_lamports bigint not null,
  weight double precision not null,
  primary key (distribution_id, wallet_pubkey)
);

create index if not exists failure_distribution_allocations_distribution_idx
  on public.failure_distribution_allocations(distribution_id);

create table if not exists public.failure_distribution_claims (
  distribution_id text not null,
  wallet_pubkey text not null,
  claimed_at_unix bigint not null,
  amount_lamports bigint not null,
  tx_sig text not null,
  primary key (distribution_id, wallet_pubkey)
);

create index if not exists failure_distribution_claims_distribution_idx
  on public.failure_distribution_claims(distribution_id);
