alter table if exists public.reward_milestone_signals
  add column if not exists vote text not null default 'approve';
