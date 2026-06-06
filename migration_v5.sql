-- ══════════════════════════════════════════════════════════
-- AL-NUKHBA EXPRESS — v5 Complete Migration
-- Run in Supabase SQL Editor → urktddxiyzwsilddamci
-- ══════════════════════════════════════════════════════════

-- ── 1) shipments — add all missing columns ────────────────
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS customer_phone2 text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS merchant_name   text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS merchant_phone  text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS pod_url         text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS eta             text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS notes           text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS delivery_fee    integer DEFAULT 60;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS created_at      timestamptz DEFAULT now();

-- ── 2) profiles — add suspended flag ─────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended boolean DEFAULT false;

-- ── 3) Drop broken foreign key on courier_id ─────────────
ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_courier_id_fkey;

-- ── 4) audit_logs table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    text,
  username   text,
  role       text,
  action     text NOT NULL,
  target_id  text DEFAULT '',
  details    text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "audit_read"   ON audit_logs FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "audit_insert" ON audit_logs FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_time    ON audit_logs(created_at DESC);

-- ── 5) shipment_timeline ──────────────────────────────────
CREATE TABLE IF NOT EXISTS shipment_timeline (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_code text NOT NULL,
  event         text NOT NULL,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE shipment_timeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "timeline_all" ON shipment_timeline FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_timeline_code ON shipment_timeline(shipment_code);

-- ── 6) notifications ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  text       text NOT NULL,
  role       text NOT NULL DEFAULT 'admin',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "notif_all" ON notifications FOR ALL USING (true) WITH CHECK (true);

-- ── 7) Storage bucket for POD images ─────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('pod-images', 'pod-images', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects' AND policyname='pod_upload'
  ) THEN
    CREATE POLICY "pod_upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id='pod-images');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects' AND policyname='pod_read'
  ) THEN
    CREATE POLICY "pod_read" ON storage.objects FOR SELECT USING (bucket_id='pod-images');
  END IF;
END $$;

-- ── 8) Fix existing users' roles in profiles ─────────────
-- Update oloom2006 to admin
UPDATE profiles SET role='admin', full_name='Mohamed Abdelhafiz'
WHERE email='oloom2006@gmail.com';

-- Ensure default roles are correct
UPDATE profiles SET role='admin'    WHERE email='admin@nukhba.com'    AND role!='admin';
UPDATE profiles SET role='merchant' WHERE email='merchant@nukhba.com' AND role!='merchant';
UPDATE profiles SET role='courier'  WHERE email='courier@nukhba.com'  AND role!='courier';
UPDATE profiles SET role='customer' WHERE email='customer@nukhba.com' AND role!='customer';

-- ── 9) Verify everything ──────────────────────────────────
SELECT
  'profiles'         AS tbl, count(*) AS rows FROM profiles UNION ALL
SELECT 'shipments',          count(*) FROM shipments        UNION ALL
SELECT 'shipment_timeline',  count(*) FROM shipment_timeline UNION ALL
SELECT 'notifications',      count(*) FROM notifications    UNION ALL
SELECT 'audit_logs',         count(*) FROM audit_logs
ORDER BY tbl;
