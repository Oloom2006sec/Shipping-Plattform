-- ══════════════════════════════════════════════════════════════════
-- AL-NUKHBA EXPRESS — Driver Location Auto-Cleanup
-- Marks couriers as offline if last_seen_at is older than 15 minutes
-- Run once to create the function and scheduled job
-- ══════════════════════════════════════════════════════════════════

-- Function to mark stale couriers offline
CREATE OR REPLACE FUNCTION cleanup_stale_driver_locations()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE driver_locations
  SET is_online = false
  WHERE is_online = true
    AND last_seen_at < now() - interval '15 minutes';
$$;

-- Schedule cleanup every 5 minutes using pg_cron (if available)
-- Run in Supabase SQL Editor:
-- SELECT cron.schedule('cleanup-stale-drivers', '*/5 * * * *',
--   'SELECT cleanup_stale_driver_locations()');

-- Manual cleanup — run this now to fix existing stale rows:
SELECT cleanup_stale_driver_locations();

-- Verify: show currently online couriers
SELECT courier_id, last_seen_at, is_online,
  now() - last_seen_at AS stale_for
FROM driver_locations
WHERE is_online = true
ORDER BY last_seen_at DESC;
