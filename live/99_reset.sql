-- =====================================================================
-- 99_reset.sql — drop every index the lecture creates, so the database
-- is back in the un-indexed "before" world. Keys and the UNIQUE(email)
-- from 00_setup.sql stay. Safe to run any time.
--   psql -d shopeasy -f 99_reset.sql
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pageinspect;   -- for bt_metap() in segment 5

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT i.indexrelid::regclass AS idx
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND NOT i.indisprimary
      AND i.indexrelid::regclass::text <> 'customers_email_key'
  LOOP
    EXECUTE 'DROP INDEX ' || r.idx;
  END LOOP;
END $$;

DROP TABLE IF EXISTS bf_orders;
