-- Twitter API Rate Limiting Tables
-- Tracks API usage to stay within Basic tier limits:
-- - 15K posts/month
-- - 50K user requests/month

-- Monthly API usage tracking
CREATE TABLE IF NOT EXISTS public.twitter_api_usage (
  month_key TEXT NOT NULL,           -- YYYY-MM format
  endpoint TEXT NOT NULL,            -- API endpoint category
  request_count INTEGER NOT NULL DEFAULT 0,
  last_updated_unix BIGINT NOT NULL,
  PRIMARY KEY (month_key, endpoint)
);

-- Per-user daily usage tracking (abuse prevention)
CREATE TABLE IF NOT EXISTS public.twitter_user_daily_usage (
  day_key TEXT NOT NULL,             -- YYYY-MM-DD format
  wallet_pubkey TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  last_updated_unix BIGINT NOT NULL,
  PRIMARY KEY (day_key, wallet_pubkey, endpoint)
);

-- Index for cleanup of old records
CREATE INDEX IF NOT EXISTS idx_twitter_api_usage_month ON public.twitter_api_usage(month_key);
CREATE INDEX IF NOT EXISTS idx_twitter_user_daily_usage_day ON public.twitter_user_daily_usage(day_key);

-- Cleanup function for old rate limit records (keep last 3 months)
CREATE OR REPLACE FUNCTION cleanup_old_twitter_usage() RETURNS void AS $$
BEGIN
  DELETE FROM public.twitter_api_usage 
  WHERE month_key < to_char(NOW() - INTERVAL '3 months', 'YYYY-MM');
  
  DELETE FROM public.twitter_user_daily_usage 
  WHERE day_key < to_char(NOW() - INTERVAL '7 days', 'YYYY-MM-DD');
END;
$$ LANGUAGE plpgsql;
