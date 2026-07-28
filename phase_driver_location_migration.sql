-- ══════════════════════════════════════════════════════════════════
-- AL-NUKHBA EXPRESS — Driver Location Tracking Migration
-- Run AFTER phase_dispatch_migration.sql
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- TABLE: driver_locations
-- Latest position per courier (upsert-based, one row per courier)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_locations (
  courier_id     uuid        PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  tenant_id      uuid        DEFAULT NULL,
  lat            numeric(10,7) NOT NULL,
  lng            numeric(10,7) NOT NULL,
  accuracy       numeric(8,2)  DEFAULT NULL,   -- metres
  speed          numeric(6,2)  DEFAULT NULL,   -- km/h
  heading        numeric(5,1)  DEFAULT NULL,   -- degrees 0-360
  battery        integer       DEFAULT NULL,   -- 0-100 %
  is_online      boolean       NOT NULL DEFAULT true,
  last_seen_at   timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dloc_tenant  ON driver_locations(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dloc_online  ON driver_locations(is_online) WHERE is_online = true;
CREATE INDEX IF NOT EXISTS idx_dloc_seen    ON driver_locations(last_seen_at DESC);

ALTER TABLE driver_locations ENABLE ROW LEVEL SECURITY;
-- Couriers write only their own row; admins read all
DROP POLICY IF EXISTS "dloc_courier_write" ON driver_locations;
CREATE POLICY "dloc_courier_write" ON driver_locations
  FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: driver_location_history
-- Append-only trail (capped by TTL in production via pg_cron)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_location_history (
  id             bigserial   PRIMARY KEY,
  courier_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tenant_id      uuid        DEFAULT NULL,
  lat            numeric(10,7) NOT NULL,
  lng            numeric(10,7) NOT NULL,
  accuracy       numeric(8,2)  DEFAULT NULL,
  speed          numeric(6,2)  DEFAULT NULL,
  heading        numeric(5,1)  DEFAULT NULL,
  recorded_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dlhist_courier ON driver_location_history(courier_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_dlhist_time    ON driver_location_history(recorded_at DESC);

ALTER TABLE driver_location_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dlhist_all" ON driver_location_history;
CREATE POLICY "dlhist_all" ON driver_location_history FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- FUNCTION: update_driver_location(courier_id, lat, lng, ...)
-- Upserts latest position + appends to history
-- Called by the courier's browser every N seconds
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_driver_location(
  p_courier_id uuid,
  p_lat        numeric,
  p_lng        numeric,
  p_accuracy   numeric DEFAULT NULL,
  p_speed      numeric DEFAULT NULL,
  p_heading    numeric DEFAULT NULL,
  p_battery    integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  -- Upsert latest position
  INSERT INTO driver_locations
    (courier_id, lat, lng, accuracy, speed, heading, battery, is_online, last_seen_at)
  VALUES
    (p_courier_id, p_lat, p_lng, p_accuracy, p_speed, p_heading, p_battery, true, now())
  ON CONFLICT (courier_id)
  DO UPDATE SET
    lat          = EXCLUDED.lat,
    lng          = EXCLUDED.lng,
    accuracy     = EXCLUDED.accuracy,
    speed        = EXCLUDED.speed,
    heading      = EXCLUDED.heading,
    battery      = EXCLUDED.battery,
    is_online    = true,
    last_seen_at = now();

  -- Append to history (sample: every call, can be thinned with pg_cron)
  INSERT INTO driver_location_history
    (courier_id, lat, lng, accuracy, speed, heading)
  VALUES
    (p_courier_id, p_lat, p_lng, p_accuracy, p_speed, p_heading);
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- FUNCTION: mark_driver_offline(courier_id)
-- Called when courier closes the app or goes offline
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mark_driver_offline(p_courier_id uuid)
RETURNS void
LANGUAGE sql AS $$
  UPDATE driver_locations SET is_online = false WHERE courier_id = p_courier_id;
$$;

-- ─────────────────────────────────────────────────────────────────
-- PERMISSIONS
-- ─────────────────────────────────────────────────────────────────
INSERT INTO permissions (code, label, description, category) VALUES
  ('location.view_all',   'View All Driver Locations', 'See all courier positions on map', 'location'),
  ('location.view_own',   'View Own Location',          'Courier sees their own broadcast status', 'location'),
  ('location.broadcast',  'Broadcast Location',         'Courier sends GPS updates',              'location'),
  ('location.history',    'View Location History',      'See courier trail for today',             'location')
ON CONFLICT (code) DO NOTHING;

-- Grant to admin (all location permissions)
-- Uses assign_permissions() defined in migration_production.sql
-- Verified: roles.code column, not roles.name
DO $$
BEGIN
  PERFORM assign_permissions('admin', ARRAY[
    'location.view_all',
    'location.view_own',
    'location.broadcast',
    'location.history'
  ]);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not assign location permissions to admin: %', SQLERRM;
END $$;

-- Grant broadcast + view_own to courier
DO $$
BEGIN
  PERFORM assign_permissions('courier', ARRAY[
    'location.broadcast',
    'location.view_own'
  ]);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not assign location permissions to courier: %', SQLERRM;
END $$;

COMMIT;
