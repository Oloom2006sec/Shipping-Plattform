-- ══════════════════════════════════════════════════════════════════
-- AL-NUKHBA EXPRESS — SLA Monitoring & Alerts Migration
-- Verified column names: permissions.label, roles.code
-- Uses assign_permissions() for role grants
-- All statements idempotent (IF NOT EXISTS, DROP...IF EXISTS, etc.)
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1. Helper (self-contained)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ─────────────────────────────────────────────────────────────────
-- 2. sla_configs
-- One row = one SLA target. Applied globally (merchant_id NULL)
-- or per-merchant (merchant_id set). Per-merchant takes priority.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sla_configs (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        DEFAULT NULL,
  merchant_id           uuid        DEFAULT NULL
                          REFERENCES profiles(id) ON DELETE CASCADE,
  service_type          text        DEFAULT NULL,  -- NULL = all service types
  -- Hours from creation to delivery before breach
  target_delivery_hours integer     NOT NULL DEFAULT 48
                          CHECK (target_delivery_hours > 0),
  -- Hours from creation to first attempt before breach
  target_first_attempt_hours integer DEFAULT NULL,
  -- Warn N hours before the target (for proactive alerts)
  warn_before_hours     integer     NOT NULL DEFAULT 4
                          CHECK (warn_before_hours >= 0),
  is_active             boolean     NOT NULL DEFAULT true,
  label                 text        NOT NULL DEFAULT 'SLA الافتراضي',
  created_by            uuid        DEFAULT NULL
                          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sla_merchant
  ON sla_configs(merchant_id) WHERE merchant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sla_active
  ON sla_configs(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_sla_service
  ON sla_configs(service_type) WHERE service_type IS NOT NULL;

DROP TRIGGER IF EXISTS trg_sla_configs_updated ON sla_configs;
CREATE TRIGGER trg_sla_configs_updated
  BEFORE UPDATE ON sla_configs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE sla_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sla_configs_all" ON sla_configs;
CREATE POLICY "sla_configs_all" ON sla_configs
  FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 3. sla_breaches
-- Append-only. One row per shipment per breach event.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sla_breaches (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        DEFAULT NULL,
  shipment_id       uuid        NOT NULL
                      REFERENCES shipments(id) ON DELETE CASCADE,
  shipment_code     text        NOT NULL DEFAULT '',
  merchant_id       uuid        DEFAULT NULL
                      REFERENCES profiles(id) ON DELETE SET NULL,
  merchant_name     text        NOT NULL DEFAULT '',
  sla_config_id     uuid        DEFAULT NULL
                      REFERENCES sla_configs(id) ON DELETE SET NULL,
  breach_type       text        NOT NULL DEFAULT 'delivery'
                      CHECK (breach_type IN ('delivery','first_attempt','warning')),
  target_hours      integer     NOT NULL,
  actual_hours      numeric(8,2) NOT NULL,
  status            text        NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','acknowledged','resolved')),
  acknowledged_by   uuid        DEFAULT NULL
                      REFERENCES profiles(id) ON DELETE SET NULL,
  acknowledged_at   timestamptz DEFAULT NULL,
  resolved_at       timestamptz DEFAULT NULL,
  alert_sent        boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sla_breaches_shipment
  ON sla_breaches(shipment_id);
CREATE INDEX IF NOT EXISTS idx_sla_breaches_status
  ON sla_breaches(status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_sla_breaches_merchant
  ON sla_breaches(merchant_id);
CREATE INDEX IF NOT EXISTS idx_sla_breaches_created
  ON sla_breaches(created_at DESC);

ALTER TABLE sla_breaches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sla_breaches_all" ON sla_breaches;
CREATE POLICY "sla_breaches_all" ON sla_breaches
  FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 4. check_sla_breaches()
-- Scans active shipments against SLA configs.
-- Returns rows for newly detected breaches (does not INSERT —
-- the application layer does that to avoid duplicates).
-- Safe to call repeatedly (idempotent read).
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_sla_breaches()
RETURNS TABLE (
  shipment_id       uuid,
  shipment_code     text,
  merchant_id       uuid,
  merchant_name     text,
  sla_config_id     uuid,
  breach_type       text,
  target_hours      integer,
  actual_hours      numeric,
  courier_id        uuid,
  courier_name      text,
  governorate       text,
  service_type      text,
  created_at        timestamptz
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH applicable_sla AS (
    -- For each shipment pick the most specific SLA config:
    -- merchant-specific > global (NULL merchant_id)
    SELECT DISTINCT ON (s.id)
      s.id            AS shipment_id,
      sc.id           AS sla_config_id,
      sc.target_delivery_hours,
      sc.warn_before_hours
    FROM shipments s
    JOIN sla_configs sc ON
      sc.is_active = true
      AND (sc.merchant_id IS NULL OR sc.merchant_id = s.merchant_id)
      AND (sc.service_type IS NULL  OR sc.service_type = s.service_type)
    WHERE s.is_deleted = false
      AND s.status NOT IN ('delivered','returned','cancelled')
      AND s.created_at > now() - interval '30 days'
    ORDER BY s.id,
      -- merchant-specific config takes priority
      (sc.merchant_id IS NOT NULL) DESC,
      sc.created_at DESC
  )
  SELECT
    s.id,
    s.shipment_code,
    s.merchant_id,
    s.merchant_name,
    a.sla_config_id,
    CASE
      WHEN extract(epoch FROM (now() - s.created_at))/3600
             >= a.target_delivery_hours
      THEN 'delivery'
      WHEN extract(epoch FROM (now() - s.created_at))/3600
             >= (a.target_delivery_hours - a.warn_before_hours)
      THEN 'warning'
      ELSE NULL
    END                                                           AS breach_type,
    a.target_delivery_hours                                       AS target_hours,
    round(
      extract(epoch FROM (now() - s.created_at))::numeric / 3600,
      2
    )                                                             AS actual_hours,
    s.courier_id,
    s.courier_name,
    s.governorate,
    s.service_type,
    s.created_at
  FROM shipments s
  JOIN applicable_sla a ON a.shipment_id = s.id
  WHERE
    -- Only return rows where a breach or warning is occurring
    extract(epoch FROM (now() - s.created_at))/3600
      >= (a.target_delivery_hours - a.warn_before_hours)
    -- Exclude shipments already having an open breach of this type
    AND NOT EXISTS (
      SELECT 1 FROM sla_breaches b
      WHERE b.shipment_id = s.id
        AND b.breach_type = CASE
          WHEN extract(epoch FROM (now() - s.created_at))/3600
                 >= a.target_delivery_hours
          THEN 'delivery'
          ELSE 'warning'
        END
        AND b.status IN ('open','acknowledged')
    )
  ORDER BY actual_hours DESC;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 5. get_sla_summary()
-- Returns counts for the admin dashboard KPI cards.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_sla_summary()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT jsonb_build_object(
    'open_breaches',       COUNT(*) FILTER (WHERE status='open' AND breach_type='delivery'),
    'open_warnings',       COUNT(*) FILTER (WHERE status='open' AND breach_type='warning'),
    'acknowledged',        COUNT(*) FILTER (WHERE status='acknowledged'),
    'resolved_today',      COUNT(*) FILTER (WHERE status='resolved'
                             AND resolved_at >= CURRENT_DATE),
    'total_open',          COUNT(*) FILTER (WHERE status='open')
  )
  FROM sla_breaches;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 6. Permissions
-- Verified: permissions.label (not name), ON CONFLICT (code)
-- ─────────────────────────────────────────────────────────────────
INSERT INTO permissions (code, label, description, category) VALUES
  ('sla.view',         'View SLA Dashboard',  'See SLA breaches and summary',         'sla'),
  ('sla.manage',       'Manage SLA Configs',  'Create and edit SLA configurations',   'sla'),
  ('sla.acknowledge',  'Acknowledge Breaches','Mark SLA breaches as acknowledged',    'sla'),
  ('sla.resolve',      'Resolve Breaches',    'Mark SLA breaches as resolved',        'sla')
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────
-- 7. Role grants
-- Verified: roles.code (not name), uses assign_permissions()
-- ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM assign_permissions('admin', ARRAY[
    'sla.view', 'sla.manage', 'sla.acknowledge', 'sla.resolve'
  ]);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not assign SLA permissions to admin: %', SQLERRM;
END $$;

DO $$
BEGIN
  PERFORM assign_permissions('operations_manager', ARRAY[
    'sla.view', 'sla.acknowledge', 'sla.resolve'
  ]);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not assign SLA permissions to operations_manager: %', SQLERRM;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 8. Default global SLA config (48h delivery, warn 4h before)
-- Only inserts if no config exists yet.
-- ─────────────────────────────────────────────────────────────────
INSERT INTO sla_configs
  (label, target_delivery_hours, warn_before_hours, is_active)
SELECT
  'SLA الافتراضي — 48 ساعة', 48, 4, true
WHERE NOT EXISTS (SELECT 1 FROM sla_configs WHERE merchant_id IS NULL);

COMMIT;

-- ─────────────────────────────────────────────────────────────────
-- POST-RUN VERIFICATION
--
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public'
--     AND table_name IN ('sla_configs','sla_breaches');
--
-- SELECT routine_name FROM information_schema.routines
--   WHERE routine_schema='public'
--     AND routine_name IN (
--       'check_sla_breaches','get_sla_summary','set_updated_at');
--
-- SELECT code FROM permissions WHERE code LIKE 'sla.%' ORDER BY code;
--
-- SELECT * FROM sla_configs;
-- ─────────────────────────────────────────────────────────────────
