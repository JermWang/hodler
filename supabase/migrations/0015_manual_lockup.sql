-- Manual Lock-Up Feature
-- Allows existing projects to register and create campaigns with SOL or SPL token rewards

-- Add reward asset configuration to campaigns
alter table public.campaigns
  add column if not exists reward_asset_type text not null default 'sol',
  add column if not exists reward_mint text,
  add column if not exists reward_decimals integer not null default 9,
  add column if not exists is_manual_lockup boolean not null default false,
  add column if not exists escrow_wallet_pubkey text,
  add column if not exists creator_verified_at_unix bigint;

-- Index for manual lockup campaigns
create index if not exists campaigns_manual_lockup_idx on public.campaigns(is_manual_lockup) where is_manual_lockup = true;

-- Add reward asset info to epochs
alter table public.epochs
  add column if not exists reward_asset_type text not null default 'sol',
  add column if not exists reward_mint text,
  add column if not exists reward_decimals integer not null default 9;

-- Add reward asset info to epoch_scores for SPL token rewards
alter table public.epoch_scores
  add column if not exists reward_amount_raw text;

-- Add reward asset info to reward_claims
alter table public.reward_claims
  add column if not exists reward_asset_type text not null default 'sol',
  add column if not exists reward_mint text,
  add column if not exists amount_raw text;

-- Campaign deposits table for tracking top-ups
create table if not exists public.campaign_deposits (
  id text primary key,
  campaign_id text not null references public.campaigns(id),
  
  -- Deposit details
  asset_type text not null,  -- 'sol' or 'spl'
  mint text,                 -- null for SOL, token mint for SPL
  amount_lamports bigint,    -- for SOL deposits
  amount_raw text,           -- for SPL deposits (bigint as string)
  
  -- Transaction
  tx_sig text not null,
  depositor_pubkey text not null,
  
  -- Status
  status text not null default 'confirmed',  -- pending, confirmed, failed
  
  -- Timestamps
  deposited_at_unix bigint not null,
  created_at_unix bigint not null
);

create index if not exists campaign_deposits_campaign_idx on public.campaign_deposits(campaign_id);
create index if not exists campaign_deposits_depositor_idx on public.campaign_deposits(depositor_pubkey);

-- Campaign escrow wallets (Privy-managed, one per SPL reward campaign)
create table if not exists public.campaign_escrow_wallets (
  id text primary key,
  campaign_id text not null references public.campaigns(id),
  
  -- Privy wallet details
  privy_wallet_id text not null,
  wallet_pubkey text not null,
  
  -- Timestamps
  created_at_unix bigint not null
);

create unique index if not exists campaign_escrow_wallets_campaign_idx on public.campaign_escrow_wallets(campaign_id);
create unique index if not exists campaign_escrow_wallets_pubkey_idx on public.campaign_escrow_wallets(wallet_pubkey);
create index if not exists campaign_escrow_wallets_privy_idx on public.campaign_escrow_wallets(privy_wallet_id);

-- Comments for documentation
comment on column public.campaigns.reward_asset_type is 'Type of reward asset: sol or spl';
comment on column public.campaigns.reward_mint is 'SPL token mint address for SPL rewards, null for SOL';
comment on column public.campaigns.is_manual_lockup is 'True if campaign was created via manual lock-up (existing project)';
comment on column public.campaigns.escrow_wallet_pubkey is 'Escrow wallet holding campaign funds (Privy-managed for SPL)';
comment on column public.campaigns.creator_verified_at_unix is 'When creator ownership was verified';
comment on table public.campaign_escrow_wallets is 'Privy-managed escrow wallets for SPL token reward campaigns';
