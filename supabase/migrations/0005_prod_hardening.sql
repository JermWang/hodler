create table if not exists public.project_profiles (
  token_mint text primary key,
  name text null,
  symbol text null,
  description text null,
  website_url text null,
  x_url text null,
  telegram_url text null,
  discord_url text null,
  image_url text null,
  metadata_uri text null,
  created_by_wallet text null,
  created_at_unix bigint not null,
  updated_at_unix bigint not null
);

create index if not exists project_profiles_updated_idx on public.project_profiles(updated_at_unix);

revoke all on table
  public.commitments,
  public.reward_milestone_signals,
  public.reward_voter_snapshots,
  public.admin_nonces,
  public.admin_sessions,
  public.reward_release_locks,
  public.token_price_cache,
  public.creator_revenue_escrows,
  public.pumpfun_fee_sources,
  public.pumpfun_sweep_locks,
  public.pumpfun_fee_sweeps,
  public.profiles,
  public.project_profiles,
  public.failure_distributions,
  public.failure_distribution_allocations,
  public.failure_distribution_claims
from anon, authenticated;
