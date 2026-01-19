-- Twitter OAuth state storage for PKCE flow
create table if not exists public.twitter_oauth_states (
  state text primary key,
  wallet_pubkey text not null,
  code_verifier text not null,
  signature text not null,
  created_at_unix bigint not null,
  expires_at_unix bigint not null
);

create index if not exists twitter_oauth_states_wallet_idx 
  on public.twitter_oauth_states(wallet_pubkey);
create index if not exists twitter_oauth_states_expires_idx 
  on public.twitter_oauth_states(expires_at_unix);

-- Cleanup job: delete expired states
-- Run periodically: DELETE FROM public.twitter_oauth_states WHERE expires_at_unix < extract(epoch from now())::bigint;
