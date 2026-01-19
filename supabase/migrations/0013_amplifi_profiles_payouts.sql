-- AmpliFi - Additional tables for profiles, payouts, and platform config

-- 1) Project profiles (token/project metadata for display)
create table if not exists public.project_profiles (
  token_mint text primary key,
  
  -- Basic info
  name text not null,
  symbol text not null,
  description text,
  
  -- Images
  image_url text,
  banner_url text,
  
  -- Links
  website_url text,
  twitter_handle text,
  discord_url text,
  telegram_url text,
  
  -- On-chain data cache
  total_supply bigint,
  decimals integer default 6,
  
  -- Creator info
  creator_pubkey text,
  
  -- Bags.fm integration
  bags_token_id text,
  
  -- Timestamps
  created_at_unix bigint not null,
  updated_at_unix bigint not null
);

create index if not exists project_profiles_creator_idx 
  on public.project_profiles(creator_pubkey);
create index if not exists project_profiles_symbol_idx 
  on public.project_profiles(symbol);

-- 2) Payout transactions (detailed history of all payouts)
create table if not exists public.payout_transactions (
  id text primary key,
  
  -- What this payout is for
  payout_type text not null,                    -- epoch_reward, refund, manual
  epoch_id text references public.epochs(id),
  campaign_id text references public.campaigns(id),
  
  -- Who gets paid
  recipient_pubkey text not null,
  
  -- Amount
  amount_lamports bigint not null,
  
  -- Transaction details
  tx_sig text,
  
  -- Status tracking
  status text not null default 'pending',       -- pending, submitted, confirmed, failed
  error_message text,
  
  -- Retry tracking
  attempt_count integer not null default 0,
  last_attempt_unix bigint,
  
  -- Timestamps
  created_at_unix bigint not null,
  confirmed_at_unix bigint
);

create index if not exists payout_transactions_recipient_idx 
  on public.payout_transactions(recipient_pubkey);
create index if not exists payout_transactions_epoch_idx 
  on public.payout_transactions(epoch_id);
create index if not exists payout_transactions_status_idx 
  on public.payout_transactions(status);
create index if not exists payout_transactions_type_idx 
  on public.payout_transactions(payout_type);

-- 3) Platform wallets (wallets used for payouts)
create table if not exists public.platform_wallets (
  id text primary key,
  
  -- Wallet info
  pubkey text not null unique,
  wallet_type text not null,                    -- privy_server, hot_wallet, multisig
  
  -- Privy integration (if applicable)
  privy_wallet_id text,
  
  -- Purpose
  purpose text not null,                        -- payouts, treasury, fees
  
  -- Balance tracking (cached)
  balance_lamports bigint not null default 0,
  last_balance_check_unix bigint,
  
  -- Status
  is_active boolean not null default true,
  
  -- Timestamps
  created_at_unix bigint not null,
  updated_at_unix bigint not null
);

create index if not exists platform_wallets_pubkey_idx 
  on public.platform_wallets(pubkey);
create index if not exists platform_wallets_purpose_idx 
  on public.platform_wallets(purpose);

-- 4) Holder activity history (aggregated stats for leaderboards)
create table if not exists public.holder_stats (
  wallet_pubkey text primary key,
  
  -- Lifetime stats
  total_campaigns_joined integer not null default 0,
  total_engagements integer not null default 0,
  total_earned_lamports bigint not null default 0,
  total_claimed_lamports bigint not null default 0,
  
  -- Current period stats
  current_epoch_engagements integer not null default 0,
  current_epoch_score double precision not null default 0,
  
  -- Ranking
  lifetime_rank integer,
  
  -- Timestamps
  first_engagement_unix bigint,
  last_engagement_unix bigint,
  updated_at_unix bigint not null
);

create index if not exists holder_stats_earned_idx 
  on public.holder_stats(total_earned_lamports desc);
create index if not exists holder_stats_engagements_idx 
  on public.holder_stats(total_engagements desc);

-- 5) Campaign stats (aggregated for display)
create table if not exists public.campaign_stats (
  campaign_id text primary key references public.campaigns(id),
  
  -- Participation
  total_participants integer not null default 0,
  active_participants integer not null default 0,
  
  -- Engagement
  total_engagements integer not null default 0,
  total_engagement_points double precision not null default 0,
  
  -- Payouts
  total_distributed_lamports bigint not null default 0,
  epochs_settled integer not null default 0,
  
  -- Timestamps
  updated_at_unix bigint not null
);

-- 6) Audit log for important actions
create table if not exists public.amplifi_audit_log (
  id text primary key,
  
  -- What happened
  action text not null,                         -- payout_sent, epoch_settled, claim_processed, etc.
  
  -- Context
  campaign_id text,
  epoch_id text,
  wallet_pubkey text,
  
  -- Details
  details jsonb,
  
  -- Transaction (if applicable)
  tx_sig text,
  amount_lamports bigint,
  
  -- Timestamps
  created_at_unix bigint not null
);

create index if not exists amplifi_audit_log_action_idx 
  on public.amplifi_audit_log(action);
create index if not exists amplifi_audit_log_wallet_idx 
  on public.amplifi_audit_log(wallet_pubkey);
create index if not exists amplifi_audit_log_campaign_idx 
  on public.amplifi_audit_log(campaign_id);
create index if not exists amplifi_audit_log_created_idx 
  on public.amplifi_audit_log(created_at_unix desc);

-- 7) Fee collection records (from Bags.fm)
create table if not exists public.fee_collections (
  id text primary key,
  
  -- Source
  campaign_id text not null references public.campaigns(id),
  token_mint text not null,
  
  -- Amount collected
  amount_lamports bigint not null,
  
  -- Split
  platform_share_lamports bigint not null,      -- 50% to AmpliFi
  reward_pool_share_lamports bigint not null,   -- 50% to raiders
  
  -- Transaction
  tx_sig text,
  
  -- Timestamps
  collected_at_unix bigint not null,
  created_at_unix bigint not null
);

create index if not exists fee_collections_campaign_idx 
  on public.fee_collections(campaign_id);
create index if not exists fee_collections_token_idx 
  on public.fee_collections(token_mint);
create index if not exists fee_collections_collected_idx 
  on public.fee_collections(collected_at_unix desc);
