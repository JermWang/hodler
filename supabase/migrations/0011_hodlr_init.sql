-- HODLR - Supabase/Postgres schema
-- Creator growth protocol that pays token holders for organic marketing activity
--
-- This migration adds HODLR-specific tables while preserving compatible
-- structures from Commit to Ship for wallet verification, sessions, etc.

-- 1) Campaigns (replaces commitments for HODLR context)
-- A project creates a campaign to incentivize holder engagement
create table if not exists public.campaigns (
  id text primary key,
  
  -- Project info
  project_pubkey text not null,              -- Creator/project wallet
  token_mint text not null,                  -- SPL token mint address
  
  -- Campaign configuration
  name text not null,
  description text,
  
  -- Fee configuration (in lamports)
  total_fee_lamports bigint not null default 0,
  platform_fee_lamports bigint not null default 0,    -- 50% to HODLR
  reward_pool_lamports bigint not null default 0,     -- 50% to holders
  
  -- Campaign timing
  start_at_unix bigint not null,
  end_at_unix bigint not null,
  epoch_duration_seconds bigint not null default 86400,  -- Default: daily epochs
  
  -- Participation requirements
  min_token_balance bigint not null default 0,        -- Minimum tokens to participate
  
  -- Engagement weighting (basis points, 10000 = 1x)
  weight_like_bps integer not null default 1000,      -- 0.1x
  weight_retweet_bps integer not null default 3000,   -- 0.3x
  weight_reply_bps integer not null default 5000,     -- 0.5x
  weight_quote_bps integer not null default 6000,     -- 0.6x
  
  -- Tracking keywords/handles
  tracking_handles text[],                            -- @handles to track
  tracking_hashtags text[],                           -- #hashtags to track
  tracking_urls text[],                               -- URLs to track
  
  -- Status
  status text not null default 'active',              -- active, paused, ended, cancelled
  created_at_unix bigint not null,
  updated_at_unix bigint not null
);

create index if not exists campaigns_project_idx on public.campaigns(project_pubkey);
create index if not exists campaigns_token_idx on public.campaigns(token_mint);
create index if not exists campaigns_status_idx on public.campaigns(status);
create index if not exists campaigns_end_idx on public.campaigns(end_at_unix);

-- 2) Epochs (settlement periods within a campaign)
create table if not exists public.epochs (
  id text primary key,
  campaign_id text not null references public.campaigns(id),
  
  epoch_number integer not null,
  start_at_unix bigint not null,
  end_at_unix bigint not null,
  
  -- Pool for this epoch
  reward_pool_lamports bigint not null default 0,
  distributed_lamports bigint not null default 0,
  
  -- Aggregated stats
  total_engagement_points double precision not null default 0,
  participant_count integer not null default 0,
  
  -- Status
  status text not null default 'active',              -- active, settling, settled
  settled_at_unix bigint,
  
  created_at_unix bigint not null
);

create unique index if not exists epochs_campaign_number_idx 
  on public.epochs(campaign_id, epoch_number);
create index if not exists epochs_status_idx on public.epochs(status);
create index if not exists epochs_end_idx on public.epochs(end_at_unix);

-- 3) Holder registrations (wallet + Twitter link)
create table if not exists public.holder_registrations (
  id text primary key,
  wallet_pubkey text not null,
  
  -- Twitter/X verification
  twitter_user_id text not null,
  twitter_username text not null,
  twitter_display_name text,
  twitter_profile_image_url text,
  
  -- OAuth tokens (encrypted in production)
  twitter_access_token text,
  twitter_refresh_token text,
  twitter_token_expires_at_unix bigint,
  
  -- Verification
  verified_at_unix bigint not null,
  verification_signature text not null,           -- Wallet signature proving ownership
  
  -- Status
  status text not null default 'active',          -- active, suspended, banned
  created_at_unix bigint not null,
  updated_at_unix bigint not null,
  
  -- Constraints: 1 wallet = 1 Twitter account
  unique(wallet_pubkey),
  unique(twitter_user_id)
);

create index if not exists holder_registrations_wallet_idx 
  on public.holder_registrations(wallet_pubkey);
create index if not exists holder_registrations_twitter_idx 
  on public.holder_registrations(twitter_user_id);

-- 4) Campaign participants (holder opt-ins)
create table if not exists public.campaign_participants (
  campaign_id text not null references public.campaigns(id),
  wallet_pubkey text not null,
  registration_id text not null references public.holder_registrations(id),
  
  -- Snapshot at opt-in
  token_balance_snapshot bigint not null,
  
  -- Participation timing
  opted_in_at_unix bigint not null,
  opted_out_at_unix bigint,
  
  -- Status
  status text not null default 'active',          -- active, opted_out, suspended
  
  primary key (campaign_id, wallet_pubkey)
);

create index if not exists campaign_participants_campaign_idx 
  on public.campaign_participants(campaign_id);
create index if not exists campaign_participants_wallet_idx 
  on public.campaign_participants(wallet_pubkey);

-- 5) Engagement events (tracked social activity)
create table if not exists public.engagement_events (
  id text primary key,
  campaign_id text not null references public.campaigns(id),
  epoch_id text not null references public.epochs(id),
  wallet_pubkey text not null,
  registration_id text not null references public.holder_registrations(id),
  
  -- Twitter data
  tweet_id text not null,
  tweet_type text not null,                       -- original, retweet, reply, quote
  tweet_text text,
  tweet_created_at_unix bigint not null,
  
  -- What was referenced
  referenced_handle text,
  referenced_hashtag text,
  referenced_url text,
  
  -- Parent tweet (for replies/quotes)
  parent_tweet_id text,
  
  -- Scoring
  base_points double precision not null,
  balance_weight double precision not null default 1.0,
  time_consistency_bonus double precision not null default 1.0,
  anti_spam_dampener double precision not null default 1.0,
  final_score double precision not null,
  
  -- Anti-spam flags
  is_duplicate boolean not null default false,
  is_spam boolean not null default false,
  spam_reason text,
  
  -- Timestamps
  indexed_at_unix bigint not null,
  created_at_unix bigint not null,
  
  -- Prevent duplicate tracking
  unique(campaign_id, tweet_id)
);

create index if not exists engagement_events_campaign_idx 
  on public.engagement_events(campaign_id);
create index if not exists engagement_events_epoch_idx 
  on public.engagement_events(epoch_id);
create index if not exists engagement_events_wallet_idx 
  on public.engagement_events(wallet_pubkey);
create index if not exists engagement_events_tweet_idx 
  on public.engagement_events(tweet_id);

-- 6) Epoch scores (aggregated per-holder per-epoch)
create table if not exists public.epoch_scores (
  epoch_id text not null references public.epochs(id),
  wallet_pubkey text not null,
  
  -- Aggregated engagement
  total_engagement_points double precision not null default 0,
  engagement_count integer not null default 0,
  
  -- Token balance at epoch end (for reward calculation)
  token_balance_snapshot bigint not null default 0,
  balance_weight double precision not null default 1.0,
  
  -- Final weighted score
  final_score double precision not null default 0,
  
  -- Reward allocation
  reward_share_bps integer not null default 0,    -- Share of pool in basis points
  reward_lamports bigint not null default 0,
  
  -- Timestamps
  calculated_at_unix bigint,
  
  primary key (epoch_id, wallet_pubkey)
);

create index if not exists epoch_scores_epoch_idx on public.epoch_scores(epoch_id);
create index if not exists epoch_scores_wallet_idx on public.epoch_scores(wallet_pubkey);

-- 7) Reward claims
create table if not exists public.reward_claims (
  id text primary key,
  epoch_id text not null references public.epochs(id),
  wallet_pubkey text not null,
  
  -- Claim details
  amount_lamports bigint not null,
  
  -- Transaction
  tx_sig text,
  claimed_at_unix bigint not null,
  
  -- Status
  status text not null default 'pending',         -- pending, completed, failed
  
  unique(epoch_id, wallet_pubkey)
);

create index if not exists reward_claims_epoch_idx on public.reward_claims(epoch_id);
create index if not exists reward_claims_wallet_idx on public.reward_claims(wallet_pubkey);

-- 8) Twitter API rate limit tracking
create table if not exists public.twitter_rate_limits (
  endpoint text primary key,
  remaining integer not null,
  reset_at_unix bigint not null,
  updated_at_unix bigint not null
);

-- 9) Engagement indexing jobs (for async processing)
create table if not exists public.engagement_index_jobs (
  id text primary key,
  campaign_id text not null references public.campaigns(id),
  
  -- Job details
  job_type text not null,                         -- full_scan, incremental, user_scan
  twitter_user_id text,                           -- For user-specific scans
  
  -- Progress
  status text not null default 'pending',         -- pending, running, completed, failed
  last_tweet_id text,                             -- Pagination cursor
  tweets_processed integer not null default 0,
  
  -- Timing
  started_at_unix bigint,
  completed_at_unix bigint,
  error_message text,
  
  created_at_unix bigint not null
);

create index if not exists engagement_index_jobs_campaign_idx 
  on public.engagement_index_jobs(campaign_id);
create index if not exists engagement_index_jobs_status_idx 
  on public.engagement_index_jobs(status);

-- 10) Platform treasury tracking
create table if not exists public.platform_treasury (
  id text primary key default 'main',
  total_collected_lamports bigint not null default 0,
  last_updated_unix bigint not null
);

-- Insert default treasury record
insert into public.platform_treasury (id, total_collected_lamports, last_updated_unix)
values ('main', 0, extract(epoch from now())::bigint)
on conflict (id) do nothing;
