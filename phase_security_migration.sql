-- ══════════════════════════════════════════════════════════════════
-- AL-NUKHBA EXPRESS — P7 Security / RLS Hardening Migration
-- Verified: permissions.label, roles.code via assign_permissions()
-- Idempotent: DROP POLICY IF EXISTS before CREATE POLICY
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1. Shipments RLS — role-based access
--    Admin/ops: all rows
--    Merchant: own shipments only (merchant_id = auth.uid())
--    Courier: assigned shipments only (courier_id = auth.uid())
--    Customer: own shipments by phone
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shipments_admin_all"     ON shipments;
DROP POLICY IF EXISTS "shipments_merchant_own"  ON shipments;
DROP POLICY IF EXISTS "shipments_courier_own"   ON shipments;
DROP POLICY IF EXISTS "shipments_customer_own"  ON shipments;

-- Admin / operations_manager: full access
CREATE POLICY "shipments_admin_all" ON shipments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.primary_role IN ('admin','operations_manager')
        AND p.is_active = true
        AND p.is_deleted = false
    )
  );

-- Merchant: own shipments only
CREATE POLICY "shipments_merchant_own" ON shipments
  FOR ALL USING (
    merchant_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.primary_role = 'merchant'
        AND p.is_active = true
    )
  );

-- Courier: assigned shipments only (read + limited update)
CREATE POLICY "shipments_courier_own" ON shipments
  FOR SELECT USING (
    courier_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.primary_role = 'courier'
        AND p.is_active = true
    )
  );

-- Customer: by phone (read only)
CREATE POLICY "shipments_customer_own" ON shipments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.primary_role = 'customer'
        AND p.phone = shipments.customer_phone
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- 2. Profiles RLS
--    Users can read own profile
--    Admin can read/write all profiles
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_admin_all"  ON profiles;
DROP POLICY IF EXISTS "profiles_read_own"   ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

CREATE POLICY "profiles_admin_all" ON profiles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.primary_role = 'admin'
    )
  );

CREATE POLICY "profiles_read_own" ON profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (
    -- Users cannot change their own role
    primary_role = (SELECT primary_role FROM profiles WHERE id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────
-- 3. Driver locations RLS — couriers only
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE driver_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dloc_admin_read"    ON driver_locations;
DROP POLICY IF EXISTS "dloc_courier_write" ON driver_locations;

-- Admin/ops: read all
CREATE POLICY "dloc_admin_read" ON driver_locations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.primary_role IN ('admin','operations_manager')
    )
  );

-- Courier: write own location only
CREATE POLICY "dloc_courier_own" ON driver_locations
  FOR ALL USING (courier_id = auth.uid())
  WITH CHECK (courier_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────
-- 4. Webhooks RLS — merchant owns their webhooks
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webhooks_all"          ON webhooks;
DROP POLICY IF EXISTS "webhooks_merchant_own" ON webhooks;
DROP POLICY IF EXISTS "webhooks_admin_all"    ON webhooks;

CREATE POLICY "webhooks_admin_all" ON webhooks
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id=auth.uid()
      AND p.primary_role='admin')
  );

CREATE POLICY "webhooks_merchant_own" ON webhooks
  FOR ALL USING (merchant_id = auth.uid())
  WITH CHECK (merchant_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────
-- 5. API keys RLS — merchant owns their keys
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "apikeys_all"          ON api_keys;
DROP POLICY IF EXISTS "apikeys_merchant_own" ON api_keys;
DROP POLICY IF EXISTS "apikeys_admin_all"    ON api_keys;

CREATE POLICY "apikeys_admin_all" ON api_keys
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id=auth.uid()
      AND p.primary_role='admin')
  );

CREATE POLICY "apikeys_merchant_own" ON api_keys
  FOR ALL USING (merchant_id = auth.uid())
  WITH CHECK (merchant_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────
-- 6. SLA configs RLS — admin only
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE sla_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sla_configs_all"       ON sla_configs;
DROP POLICY IF EXISTS "sla_configs_admin"     ON sla_configs;
DROP POLICY IF EXISTS "sla_configs_read_all"  ON sla_configs;

-- Admin: full access
CREATE POLICY "sla_configs_admin" ON sla_configs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id=auth.uid()
      AND p.primary_role IN ('admin','operations_manager'))
  );

-- Others: read only (to check their SLA tier)
CREATE POLICY "sla_configs_read_all" ON sla_configs
  FOR SELECT USING (is_active = true);

-- ─────────────────────────────────────────────────────────────────
-- 7. Dispatch rules RLS — admin only
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE dispatch_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drules_all"   ON dispatch_rules;
DROP POLICY IF EXISTS "drules_admin" ON dispatch_rules;

CREATE POLICY "drules_admin" ON dispatch_rules
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id=auth.uid()
      AND p.primary_role IN ('admin','operations_manager'))
  );

-- ─────────────────────────────────────────────────────────────────
-- 8. Audit log RLS — admin read, system write
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_admin_read"  ON audit_logs;
DROP POLICY IF EXISTS "audit_system_write" ON audit_logs;

CREATE POLICY "audit_admin_read" ON audit_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id=auth.uid()
      AND p.primary_role='admin')
  );

-- All authenticated users can insert audit entries (system writes)
CREATE POLICY "audit_system_write" ON audit_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ─────────────────────────────────────────────────────────────────
-- 9. verify_api_key() function
--    Used to authenticate REST API calls by hashing the provided
--    key and comparing to stored hash.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION verify_api_key(p_key_hash text, p_scope text DEFAULT 'shipments.read')
RETURNS TABLE (
  merchant_id   uuid,
  merchant_name text,
  scopes        text[]
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    ak.merchant_id,
    p.full_name AS merchant_name,
    ak.scopes
  FROM api_keys ak
  JOIN profiles p ON p.id = ak.merchant_id
  WHERE ak.key_hash    = p_key_hash
    AND ak.is_active   = true
    AND (ak.expires_at IS NULL OR ak.expires_at > now())
    AND p_scope = ANY(ak.scopes);
$$;

-- ─────────────────────────────────────────────────────────────────
-- 10. Permissions for security features
-- ─────────────────────────────────────────────────────────────────
INSERT INTO permissions (code, label, description, category) VALUES
  ('security.view_audit',   'View Audit Log',     'Access full audit trail',        'security'),
  ('security.manage_rls',   'Manage RLS',         'Admin RLS and access policies',  'security'),
  ('users.delete',          'Delete Users',       'Permanently delete user accounts','users'),
  ('users.edit',            'Edit Users',         'Modify user accounts and roles',  'users'),
  ('shipments.edit',        'Edit Shipments',     'Update shipment status and data', 'shipments'),
  ('pricing.manage',        'Manage Pricing',     'Create and edit pricing rules',   'pricing')
ON CONFLICT (code) DO NOTHING;

-- Grant security permissions to admin
DO $$
BEGIN
  PERFORM assign_permissions('admin', ARRAY[
    'security.view_audit', 'security.manage_rls',
    'users.delete', 'users.edit',
    'shipments.edit', 'pricing.manage'
  ]);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not assign security permissions to admin: %', SQLERRM;
END $$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────
-- POST-RUN VERIFICATION
--
-- SELECT schemaname, tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname='public'
--   AND tablename IN (
--     'shipments','profiles','driver_locations',
--     'webhooks','api_keys','sla_configs',
--     'dispatch_rules','audit_log')
-- ORDER BY tablename;
--
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE schemaname='public'
-- ORDER BY tablename, policyname;
--
-- SELECT code FROM permissions
-- WHERE category IN ('security','users','shipments','pricing')
-- ORDER BY code;
-- ─────────────────────────────────────────────────────────────────
