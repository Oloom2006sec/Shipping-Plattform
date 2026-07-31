-- ══════════════════════════════════════════════════════════════════
-- AL-NUKHBA EXPRESS — Merchant Webhooks + API Keys Migration
-- Verified: permissions.label, roles.code via assign_permissions()
-- Idempotent: IF NOT EXISTS, DROP...IF EXISTS, ON CONFLICT DO NOTHING
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1. Helper (self-contained)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 2. api_keys
-- Merchant REST API authentication tokens.
-- The key value is stored hashed (sha256) — never store plain text.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        DEFAULT NULL,
  merchant_id   uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label         text        NOT NULL DEFAULT 'API Key',
  key_hash      text        NOT NULL,          -- sha256(plain_key)
  key_prefix    text        NOT NULL,          -- first 8 chars for display
  scopes        text[]      NOT NULL DEFAULT ARRAY['shipments.read'],
  is_active     boolean     NOT NULL DEFAULT true,
  last_used_at  timestamptz DEFAULT NULL,
  expires_at    timestamptz DEFAULT NULL,      -- NULL = never
  created_by    uuid        DEFAULT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apikeys_merchant
  ON api_keys(merchant_id);
CREATE INDEX IF NOT EXISTS idx_apikeys_hash
  ON api_keys(key_hash) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_apikeys_active
  ON api_keys(is_active) WHERE is_active = true;

DROP TRIGGER IF EXISTS trg_apikeys_updated ON api_keys;
CREATE TRIGGER trg_apikeys_updated
  BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "apikeys_all" ON api_keys;
CREATE POLICY "apikeys_all" ON api_keys
  FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 3. webhooks
-- Per-merchant endpoint registrations.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhooks (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        DEFAULT NULL,
  merchant_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label           text        NOT NULL DEFAULT 'My Webhook',
  endpoint_url    text        NOT NULL,
  secret          text        NOT NULL DEFAULT '',   -- HMAC signing secret
  events          text[]      NOT NULL DEFAULT ARRAY['shipment.status_changed'],
  is_active       boolean     NOT NULL DEFAULT true,
  failure_count   integer     NOT NULL DEFAULT 0,    -- consecutive failures
  last_success_at timestamptz DEFAULT NULL,
  last_failure_at timestamptz DEFAULT NULL,
  created_by      uuid        DEFAULT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_merchant
  ON webhooks(merchant_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_active
  ON webhooks(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_webhooks_events
  ON webhooks USING gin(events);

DROP TRIGGER IF EXISTS trg_webhooks_updated ON webhooks;
CREATE TRIGGER trg_webhooks_updated
  BEFORE UPDATE ON webhooks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "webhooks_all" ON webhooks;
CREATE POLICY "webhooks_all" ON webhooks
  FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 4. webhook_deliveries
-- Append-only delivery attempt log per webhook.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              bigserial   PRIMARY KEY,
  tenant_id       uuid        DEFAULT NULL,
  webhook_id      uuid        NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  shipment_id     uuid        DEFAULT NULL REFERENCES shipments(id) ON DELETE SET NULL,
  shipment_code   text        NOT NULL DEFAULT '',
  event_type      text        NOT NULL,
  payload         jsonb       NOT NULL DEFAULT '{}',
  http_status     integer     DEFAULT NULL,
  response_body   text        DEFAULT NULL,
  duration_ms     integer     DEFAULT NULL,
  success         boolean     NOT NULL DEFAULT false,
  error_message   text        DEFAULT NULL,
  attempted_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wdeliveries_webhook
  ON webhook_deliveries(webhook_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_wdeliveries_shipment
  ON webhook_deliveries(shipment_id);
CREATE INDEX IF NOT EXISTS idx_wdeliveries_success
  ON webhook_deliveries(success);
CREATE INDEX IF NOT EXISTS idx_wdeliveries_time
  ON webhook_deliveries(attempted_at DESC);

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wdeliveries_all" ON webhook_deliveries;
CREATE POLICY "wdeliveries_all" ON webhook_deliveries
  FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 5. Permissions
-- Verified: label column, ON CONFLICT (code) DO NOTHING
-- ─────────────────────────────────────────────────────────────────
INSERT INTO permissions (code, label, description, category) VALUES
  ('webhooks.view',    'View Webhooks',    'See merchant webhook configurations',     'api'),
  ('webhooks.manage',  'Manage Webhooks',  'Create, edit, delete webhooks',           'api'),
  ('webhooks.logs',    'View Webhook Logs','See webhook delivery history',            'api'),
  ('api_keys.view',    'View API Keys',    'See merchant API key list',               'api'),
  ('api_keys.manage',  'Manage API Keys',  'Create and revoke API keys',             'api')
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────
-- 6. Role grants
-- Verified: roles.code via assign_permissions()
-- ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM assign_permissions('admin', ARRAY[
    'webhooks.view','webhooks.manage','webhooks.logs',
    'api_keys.view','api_keys.manage'
  ]);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'admin webhook permissions: %', SQLERRM;
END $$;

DO $$
BEGIN
  PERFORM assign_permissions('merchant', ARRAY[
    'webhooks.view','webhooks.manage','webhooks.logs',
    'api_keys.view','api_keys.manage'
  ]);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'merchant webhook permissions: %', SQLERRM;
END $$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────
-- POST-RUN VERIFICATION
--
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public'
--     AND table_name IN ('api_keys','webhooks','webhook_deliveries');
--
-- SELECT code FROM permissions
--   WHERE code LIKE 'webhooks.%' OR code LIKE 'api_keys.%'
--   ORDER BY code;
-- ─────────────────────────────────────────────────────────────────
