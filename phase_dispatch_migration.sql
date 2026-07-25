-- ══════════════════════════════════════════════════════════════════
-- AL-NUKHBA EXPRESS — Auto-Dispatch Engine Migration (v4 — final)
-- ══════════════════════════════════════════════════════════════════
--
-- VERIFIED AGAINST PRODUCTION SCHEMA BEFORE WRITING:
--
--   roles           → columns: id, tenant_id, code, label, ...
--                     lookup:  WHERE code = ? AND tenant_id IS NULL
--   permissions     → columns: id, code, label, description, category
--                     insert:  (code, label, description, category)
--   role_permissions→ columns: role_id, permission_id, granted_at, granted_by
--                     PK:      (role_id, permission_id)
--   shipments.id    → uuid PRIMARY KEY  ← used for FK in dispatch_log
--   shipment_code   → functional unique index only, not a constraint
--                     → dispatch_log stores shipment_id (uuid FK) +
--                       shipment_code (text, no FK, for display)
--   set_updated_at()→ defined in migration_production.sql, safe to
--                     CREATE OR REPLACE
--   assign_permissions() → already defined, uses roles.code
--   status values   → created,received,warehouse,hub,out_for_delivery,
--                     delivered,returned,cancelled
--   service_type    → nullable, added by phase1_migration
--   order_type      → nullable, added by phase1_migration
--
-- IDEMPOTENCY: every statement is safe to run more than once.
-- NO DROP TABLE, NO TRUNCATE — existing data is never touched.
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1. Helper trigger function
--    set_updated_at() already exists in production, but we
--    CREATE OR REPLACE so this migration works on a clean DB too.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 2. dispatch_rules
--    Stores configurable rules evaluated in priority order.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dispatch_rules (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid        DEFAULT NULL,
  name                    text        NOT NULL,
  priority                integer     NOT NULL DEFAULT 10,
  is_active               boolean     NOT NULL DEFAULT true,

  -- Matching conditions — NULL means "match any"
  match_governorates      text[]      DEFAULT NULL,
  match_service_types     text[]      DEFAULT NULL,
  match_order_types       text[]      DEFAULT NULL,

  -- Assignment strategy:
  -- 'specific_courier' | 'zone_pool' | 'least_loaded' | 'best_performer'
  strategy                text        NOT NULL DEFAULT 'least_loaded'
                            CHECK (strategy IN (
                              'specific_courier','zone_pool',
                              'least_loaded','best_performer')),

  target_courier_id       uuid        DEFAULT NULL
                            REFERENCES profiles(id) ON DELETE SET NULL,
  zone_tag                text        DEFAULT NULL,
  max_per_courier_per_day integer     NOT NULL DEFAULT 100
                            CHECK (max_per_courier_per_day > 0),

  created_by              uuid        DEFAULT NULL
                            REFERENCES profiles(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drules_active_priority
  ON dispatch_rules(priority)
  WHERE is_active = true;

DROP TRIGGER IF EXISTS trg_dispatch_rules_updated ON dispatch_rules;
CREATE TRIGGER trg_dispatch_rules_updated
  BEFORE UPDATE ON dispatch_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE dispatch_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "drules_all" ON dispatch_rules;
CREATE POLICY "drules_all" ON dispatch_rules
  FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 3. courier_configs
--    Per-courier operational settings consumed by dispatch engine.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courier_configs (
  courier_id                uuid        PRIMARY KEY
                              REFERENCES profiles(id) ON DELETE CASCADE,
  tenant_id                 uuid        DEFAULT NULL,
  max_daily_shipments       integer     NOT NULL DEFAULT 50
                              CHECK (max_daily_shipments > 0),
  zone_tags                 text[]      NOT NULL DEFAULT '{}',
  service_capabilities      text[]      NOT NULL DEFAULT ARRAY['standard'],
  is_available_for_dispatch boolean     NOT NULL DEFAULT true,
  notes                     text        DEFAULT NULL,
  updated_by                uuid        DEFAULT NULL
                              REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cconfig_zone_tags
  ON courier_configs USING gin(zone_tags);

CREATE INDEX IF NOT EXISTS idx_cconfig_service_caps
  ON courier_configs USING gin(service_capabilities);

CREATE INDEX IF NOT EXISTS idx_cconfig_available
  ON courier_configs(is_available_for_dispatch)
  WHERE is_available_for_dispatch = true;

ALTER TABLE courier_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cconfig_all" ON courier_configs;
CREATE POLICY "cconfig_all" ON courier_configs
  FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 4. dispatch_log
--    Append-only record of every auto-dispatch decision.
--
--    FK uses shipments.id (uuid PRIMARY KEY) — NOT shipment_code,
--    which only has a functional unique index and cannot be an FK
--    target. shipment_code is stored as plain text for display.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dispatch_log (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        DEFAULT NULL,

  -- FK to shipments.id (the actual PK)
  shipment_id           uuid        NOT NULL
                          REFERENCES shipments(id) ON DELETE CASCADE,
  -- Denormalized code for display — not a FK
  shipment_code         text        NOT NULL DEFAULT '',

  rule_id               uuid        DEFAULT NULL
                          REFERENCES dispatch_rules(id) ON DELETE SET NULL,
  rule_name             text        NOT NULL DEFAULT '',
  assigned_courier_id   uuid        DEFAULT NULL
                          REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_courier_name text        NOT NULL DEFAULT '',
  strategy_used         text        NOT NULL DEFAULT '',
  was_manual_override   boolean     NOT NULL DEFAULT false,
  dispatched_by         uuid        DEFAULT NULL
                          REFERENCES profiles(id) ON DELETE SET NULL,
  dispatched_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dlog_shipment_id
  ON dispatch_log(shipment_id);
CREATE INDEX IF NOT EXISTS idx_dlog_courier_id
  ON dispatch_log(assigned_courier_id);
CREATE INDEX IF NOT EXISTS idx_dlog_dispatched_at
  ON dispatch_log(dispatched_at DESC);

ALTER TABLE dispatch_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dlog_all" ON dispatch_log;
CREATE POLICY "dlog_all" ON dispatch_log
  FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 5. get_courier_load_today(courier_id uuid) → integer
--    Active shipment count for one courier today.
--    Status values from production schema:
--      terminal = delivered, returned, cancelled
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_courier_load_today(p_courier_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT COUNT(*)::integer
  FROM shipments
  WHERE courier_id  = p_courier_id
    AND is_deleted  = false
    AND status NOT IN ('delivered','returned','cancelled')
    AND created_at >= CURRENT_DATE;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 6. auto_assign_shipment(shipment_code text) → jsonb
--    Core dispatch engine. Evaluates rules in ascending priority
--    order. Assigns courier, updates shipments, writes dispatch_log.
--    Returns: { success bool, shipment_code, courier_id?,
--               courier_name?, rule_name?, strategy?, reason? }
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auto_assign_shipment(p_shipment_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_ship_id      uuid;
  v_courier_id   uuid   := NULL;
  v_courier_name text   := '';
  v_strategy     text   := '';
  v_rule_name    text   := '';
  v_rule_id      uuid   := NULL;
  v_gov          text;
  v_svc          text;
  v_ord          text;
  v_cur_courier  uuid;

  -- Rule cursor fields
  v_rule_id_cur          uuid;
  v_rule_name_cur        text;
  v_rule_strategy        text;
  v_rule_target_cid      uuid;
  v_rule_zone_tag        text;
  v_rule_max_per_day     integer;
  v_rule_match_govs      text[];
  v_rule_match_svcs      text[];
  v_rule_match_ords      text[];
BEGIN
  -- Load shipment — use id as primary key, read code-matched row
  SELECT s.id, s.governorate, s.service_type, s.order_type, s.courier_id
    INTO v_ship_id, v_gov, v_svc, v_ord, v_cur_courier
  FROM shipments s
  WHERE upper(s.shipment_code) = upper(p_shipment_code)
    AND s.is_deleted = false
  LIMIT 1;

  IF v_ship_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason',  'shipment_not_found',
      'shipment_code', p_shipment_code);
  END IF;

  IF v_cur_courier IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success',    false,
      'reason',     'already_assigned',
      'courier_id', v_cur_courier,
      'shipment_code', p_shipment_code);
  END IF;

  -- Evaluate active rules in priority order
  FOR v_rule_id_cur,
      v_rule_name_cur,
      v_rule_strategy,
      v_rule_target_cid,
      v_rule_zone_tag,
      v_rule_max_per_day,
      v_rule_match_govs,
      v_rule_match_svcs,
      v_rule_match_ords
  IN
    SELECT id, name, strategy,
           target_courier_id, zone_tag, max_per_courier_per_day,
           match_governorates, match_service_types, match_order_types
    FROM dispatch_rules
    WHERE is_active = true
    ORDER BY priority ASC, created_at ASC
  LOOP
    -- Governorate match (NULL = any)
    IF v_rule_match_govs IS NOT NULL
       AND NOT (coalesce(v_gov,'') = ANY(v_rule_match_govs))
    THEN CONTINUE; END IF;

    -- Service type match (NULL = any; column may be NULL on old rows)
    IF v_rule_match_svcs IS NOT NULL
       AND NOT (coalesce(v_svc,'') = ANY(v_rule_match_svcs))
    THEN CONTINUE; END IF;

    -- Order type match (NULL = any; column may be NULL on old rows)
    IF v_rule_match_ords IS NOT NULL
       AND NOT (coalesce(v_ord,'') = ANY(v_rule_match_ords))
    THEN CONTINUE; END IF;

    -- Rule matched — attempt assignment by strategy
    v_courier_id   := NULL;
    v_courier_name := '';
    v_rule_id      := v_rule_id_cur;
    v_rule_name    := v_rule_name_cur;
    v_strategy     := v_rule_strategy;

    IF v_rule_strategy = 'specific_courier'
       AND v_rule_target_cid IS NOT NULL
       AND get_courier_load_today(v_rule_target_cid) < v_rule_max_per_day
    THEN
      SELECT p.id, p.full_name
        INTO v_courier_id, v_courier_name
      FROM profiles p
      JOIN courier_configs cc ON cc.courier_id = p.id
      WHERE p.id         = v_rule_target_cid
        AND p.is_active  = true
        AND p.is_deleted = false
        AND cc.is_available_for_dispatch = true;

    ELSIF v_rule_strategy = 'zone_pool'
          AND v_rule_zone_tag IS NOT NULL
    THEN
      SELECT p.id, p.full_name
        INTO v_courier_id, v_courier_name
      FROM profiles p
      JOIN courier_configs cc ON cc.courier_id = p.id
      WHERE p.primary_role = 'courier'
        AND p.is_active    = true
        AND p.is_deleted   = false
        AND cc.is_available_for_dispatch = true
        AND v_rule_zone_tag = ANY(cc.zone_tags)
        AND (v_rule_match_svcs IS NULL
             OR cc.service_capabilities && v_rule_match_svcs)
        AND get_courier_load_today(p.id) < v_rule_max_per_day
      ORDER BY get_courier_load_today(p.id) ASC
      LIMIT 1;

    ELSIF v_rule_strategy = 'least_loaded' THEN
      SELECT p.id, p.full_name
        INTO v_courier_id, v_courier_name
      FROM profiles p
      JOIN courier_configs cc ON cc.courier_id = p.id
      WHERE p.primary_role = 'courier'
        AND p.is_active    = true
        AND p.is_deleted   = false
        AND cc.is_available_for_dispatch = true
        AND (v_rule_match_svcs IS NULL
             OR cc.service_capabilities && v_rule_match_svcs)
        AND get_courier_load_today(p.id) < v_rule_max_per_day
      ORDER BY get_courier_load_today(p.id) ASC
      LIMIT 1;

    ELSIF v_rule_strategy = 'best_performer' THEN
      SELECT p.id, p.full_name
        INTO v_courier_id, v_courier_name
      FROM profiles p
      JOIN courier_configs cc ON cc.courier_id = p.id
      WHERE p.primary_role = 'courier'
        AND p.is_active    = true
        AND p.is_deleted   = false
        AND cc.is_available_for_dispatch = true
        AND (v_rule_match_svcs IS NULL
             OR cc.service_capabilities && v_rule_match_svcs)
        AND get_courier_load_today(p.id) < v_rule_max_per_day
      ORDER BY (
          SELECT COUNT(*) FILTER (WHERE s2.status = 'delivered')::float
                 / NULLIF(COUNT(*), 0)
          FROM shipments s2
          WHERE s2.courier_id = p.id
            AND s2.created_at >= now() - interval '30 days'
            AND s2.is_deleted = false
        ) DESC NULLS LAST,
        get_courier_load_today(p.id) ASC
      LIMIT 1;
    END IF;

    IF v_courier_id IS NOT NULL THEN EXIT; END IF;
  END LOOP;

  IF v_courier_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason',  'no_rule_matched',
      'shipment_code', p_shipment_code);
  END IF;

  -- Assign
  UPDATE shipments
  SET courier_id   = v_courier_id,
      courier_name = v_courier_name,
      updated_at   = now()
  WHERE id = v_ship_id;

  -- Log
  INSERT INTO dispatch_log
    (shipment_id, shipment_code, rule_id, rule_name,
     assigned_courier_id, assigned_courier_name, strategy_used)
  VALUES
    (v_ship_id, p_shipment_code, v_rule_id, v_rule_name,
     v_courier_id, v_courier_name, v_strategy);

  RETURN jsonb_build_object(
    'success',       true,
    'shipment_code', p_shipment_code,
    'courier_id',    v_courier_id,
    'courier_name',  v_courier_name,
    'rule_name',     v_rule_name,
    'strategy',      v_strategy);
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 7. auto_assign_batch(codes text[]) → jsonb
--    Batch wrapper. Each code is independent — a failure on one
--    does not affect the others.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auto_assign_batch(p_codes text[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_code     text;
  v_result   jsonb;
  v_assigned integer := 0;
  v_skipped  integer := 0;
  v_failed   integer := 0;
  v_results  jsonb   := '[]'::jsonb;
BEGIN
  IF p_codes IS NULL OR array_length(p_codes, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'total', 0, 'assigned', 0, 'skipped', 0,
      'failed', 0, 'results', '[]'::jsonb);
  END IF;

  FOREACH v_code IN ARRAY p_codes LOOP
    BEGIN
      v_result := auto_assign_shipment(v_code);
    EXCEPTION WHEN OTHERS THEN
      v_result := jsonb_build_object(
        'success',       false,
        'reason',        'exception',
        'detail',        SQLERRM,
        'shipment_code', v_code);
    END;

    v_results := v_results || jsonb_build_array(v_result);

    IF (v_result->>'success')::boolean = true THEN
      v_assigned := v_assigned + 1;
    ELSIF (v_result->>'reason') = ANY(
            ARRAY['already_assigned','shipment_not_found'])
    THEN
      v_skipped := v_skipped + 1;
    ELSE
      v_failed  := v_failed  + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'total',    array_length(p_codes, 1),
    'assigned', v_assigned,
    'skipped',  v_skipped,
    'failed',   v_failed,
    'results',  v_results);
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 8. Permissions
--    Table columns verified: id, code, label, description, category
--    ON CONFLICT (code) DO NOTHING → safe to rerun.
-- ─────────────────────────────────────────────────────────────────
INSERT INTO permissions (code, label, description, category) VALUES
  ('dispatch.view_rules',
   'View Dispatch Rules',
   'See auto-dispatch rule configurations',
   'dispatch'),
  ('dispatch.manage_rules',
   'Manage Dispatch Rules',
   'Create, edit, and delete dispatch rules',
   'dispatch'),
  ('dispatch.run',
   'Run Auto-Dispatch',
   'Trigger auto-dispatch for shipments',
   'dispatch'),
  ('dispatch.view_log',
   'View Dispatch Log',
   'See dispatch decision history',
   'dispatch'),
  ('dispatch.manage_configs',
   'Manage Courier Configs',
   'Set courier capacity, zones, and service capabilities',
   'dispatch')
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────
-- 9. Role permission grants
--    Verified: roles.code column (NOT roles.name)
--    Lookup: WHERE code = ? AND tenant_id IS NULL
--    Uses assign_permissions() defined in migration_production.sql.
--    That function uses RAISE EXCEPTION on missing role, so we
--    wrap each call in a DO block to skip gracefully if the role
--    doesn't exist (e.g. on a minimal test DB).
-- ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM assign_permissions('admin', ARRAY[
    'dispatch.view_rules',
    'dispatch.manage_rules',
    'dispatch.run',
    'dispatch.view_log',
    'dispatch.manage_configs'
  ]);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not assign dispatch permissions to admin: %', SQLERRM;
END $$;

DO $$
BEGIN
  PERFORM assign_permissions('operations_manager', ARRAY[
    'dispatch.view_rules',
    'dispatch.run',
    'dispatch.view_log'
  ]);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not assign dispatch permissions to operations_manager: %', SQLERRM;
END $$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────
-- POST-RUN VERIFICATION
-- Paste into a new SQL editor tab after running this migration:
--
-- SELECT table_name
-- FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN (
--     'dispatch_rules', 'courier_configs', 'dispatch_log');
--
-- SELECT routine_name
-- FROM information_schema.routines
-- WHERE routine_schema = 'public'
--   AND routine_name IN (
--     'set_updated_at', 'get_courier_load_today',
--     'auto_assign_shipment', 'auto_assign_batch');
--
-- SELECT code FROM permissions
-- WHERE code LIKE 'dispatch.%'
-- ORDER BY code;
-- ─────────────────────────────────────────────────────────────────
