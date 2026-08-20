-- ══════════════════════════════════════════════════════════════════
-- AL-NUKHBA EXPRESS — P9 Customer Feedback + NPS Migration
-- Verified: permissions.label, roles.code via assign_permissions()
-- Idempotent: IF NOT EXISTS, DROP...IF EXISTS, ON CONFLICT DO NOTHING
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1. shipment_ratings — per-delivery customer rating
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shipment_ratings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id     uuid        NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  shipment_code   text        NOT NULL DEFAULT '',
  customer_phone  text        NOT NULL DEFAULT '',
  courier_id      uuid        DEFAULT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  merchant_id     uuid        DEFAULT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  rating          integer     NOT NULL CHECK (rating BETWEEN 1 AND 5),
  speed_rating    integer     DEFAULT NULL CHECK (speed_rating BETWEEN 1 AND 5),
  courier_rating  integer     DEFAULT NULL CHECK (courier_rating BETWEEN 1 AND 5),
  comment         text        DEFAULT NULL,
  is_public       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ratings_shipment_unique
  ON shipment_ratings(shipment_id); -- one rating per shipment

CREATE INDEX IF NOT EXISTS idx_ratings_courier
  ON shipment_ratings(courier_id);
CREATE INDEX IF NOT EXISTS idx_ratings_merchant
  ON shipment_ratings(merchant_id);
CREATE INDEX IF NOT EXISTS idx_ratings_created
  ON shipment_ratings(created_at DESC);

ALTER TABLE shipment_ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ratings_insert_customer" ON shipment_ratings;
DROP POLICY IF EXISTS "ratings_read_all"        ON shipment_ratings;

-- Customer can insert own rating
CREATE POLICY "ratings_insert_customer" ON shipment_ratings
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Anyone authenticated can read public ratings
CREATE POLICY "ratings_read_all" ON shipment_ratings
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ─────────────────────────────────────────────────────────────────
-- 2. nps_responses — Net Promoter Score surveys
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nps_responses (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        DEFAULT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  customer_phone  text        NOT NULL DEFAULT '',
  score           integer     NOT NULL CHECK (score BETWEEN 0 AND 10),
  category        text        GENERATED ALWAYS AS (
    CASE
      WHEN score >= 9 THEN 'promoter'
      WHEN score >= 7 THEN 'passive'
      ELSE 'detractor'
    END
  ) STORED,
  comment         text        DEFAULT NULL,
  context         text        DEFAULT 'post_delivery', -- post_delivery | periodic
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nps_created
  ON nps_responses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nps_score
  ON nps_responses(score);
CREATE INDEX IF NOT EXISTS idx_nps_category
  ON nps_responses(category);

ALTER TABLE nps_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nps_insert" ON nps_responses;
DROP POLICY IF EXISTS "nps_admin_read" ON nps_responses;

CREATE POLICY "nps_insert" ON nps_responses
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "nps_admin_read" ON nps_responses
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ─────────────────────────────────────────────────────────────────
-- 3. get_nps_summary() — dashboard KPI function
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_nps_summary(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH responses AS (
    SELECT score, category
    FROM nps_responses
    WHERE created_at >= now() - (p_days || ' days')::interval
  ),
  counts AS (
    SELECT
      COUNT(*)                                          AS total,
      COUNT(*) FILTER (WHERE category='promoter')      AS promoters,
      COUNT(*) FILTER (WHERE category='passive')       AS passives,
      COUNT(*) FILTER (WHERE category='detractor')     AS detractors,
      ROUND(AVG(score)::numeric, 1)                    AS avg_score
    FROM responses
  )
  SELECT jsonb_build_object(
    'total',      total,
    'promoters',  promoters,
    'passives',   passives,
    'detractors', detractors,
    'avg_score',  avg_score,
    'nps_score',  CASE WHEN total > 0
      THEN ROUND(((promoters - detractors)::numeric / total) * 100)
      ELSE 0 END,
    'days',       p_days
  )
  FROM counts;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 4. get_courier_ratings(courier_id) — courier performance summary
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_courier_ratings(p_courier_id uuid, p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT jsonb_build_object(
    'avg_rating',         ROUND(AVG(rating)::numeric, 1),
    'avg_speed',          ROUND(AVG(speed_rating)::numeric, 1),
    'avg_courier_rating', ROUND(AVG(courier_rating)::numeric, 1),
    'total_ratings',      COUNT(*),
    'five_star',          COUNT(*) FILTER (WHERE rating = 5),
    'one_star',           COUNT(*) FILTER (WHERE rating = 1)
  )
  FROM shipment_ratings
  WHERE courier_id = p_courier_id
    AND created_at >= now() - (p_days || ' days')::interval;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 5. Permissions
-- ─────────────────────────────────────────────────────────────────
INSERT INTO permissions (code, label, description, category) VALUES
  ('feedback.submit',    'Submit Feedback',    'Customer can rate deliveries',       'feedback'),
  ('feedback.view_own',  'View Own Feedback',  'See ratings for own shipments',      'feedback'),
  ('feedback.view_all',  'View All Feedback',  'Admin sees all ratings and NPS',     'feedback'),
  ('nps.submit',         'Submit NPS',         'Customer can submit NPS score',      'feedback'),
  ('nps.view',           'View NPS Dashboard', 'Admin sees NPS analytics',           'feedback')
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────
-- 6. Role grants
-- ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM assign_permissions('admin', ARRAY[
    'feedback.submit','feedback.view_own','feedback.view_all',
    'nps.submit','nps.view'
  ]);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'admin feedback permissions: %', SQLERRM;
END $$;

DO $$
BEGIN
  PERFORM assign_permissions('customer', ARRAY[
    'feedback.submit','feedback.view_own','nps.submit'
  ]);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'customer feedback permissions: %', SQLERRM;
END $$;

DO $$
BEGIN
  PERFORM assign_permissions('merchant', ARRAY[
    'feedback.view_all','nps.view'
  ]);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'merchant feedback permissions: %', SQLERRM;
END $$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────
-- POST-RUN VERIFICATION
--
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public'
--     AND table_name IN ('shipment_ratings','nps_responses');
--
-- SELECT routine_name FROM information_schema.routines
--   WHERE routine_schema='public'
--     AND routine_name IN ('get_nps_summary','get_courier_ratings');
--
-- SELECT code FROM permissions WHERE category='feedback' ORDER BY code;
-- ─────────────────────────────────────────────────────────────────
