create table if not exists public.profiles (
  wallet_pubkey text primary key,
  display_name text null,
  bio text null,
  avatar_path text null,
  avatar_url text null,
  created_at_unix bigint not null,
  updated_at_unix bigint not null
);

create index if not exists profiles_updated_idx on public.profiles(updated_at_unix);
