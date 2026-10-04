-- =====================================================================
-- SEGMENT 2 · Reading the execution plan (slides 11–17)
-- psql -d shopeasy -f 02_reading_plans.sql
-- =====================================================================
\pset pager off
\timing off
SET max_parallel_workers_per_gather = 0;

\echo
\echo '── Slide 12 · Three commands: estimate vs reality ────────────────'
\echo
\echo '1) EXPLAIN — estimate only, instant, nothing runs'
EXPLAIN SELECT * FROM orders WHERE total_amount > 5000;

\echo '2) EXPLAIN ANALYZE — really runs it: actual time + actual rows'
EXPLAIN ANALYZE SELECT * FROM orders WHERE total_amount > 5000;

\echo '3) EXPLAIN (ANALYZE, BUFFERS) — shared hit = cache, read = disk'
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders WHERE total_amount > 5000;

\echo
\echo '── Slide 12 · Caveat: ANALYZE truly executes ─────────────────────'
\echo '   Wrap writes in a transaction and roll back.'
\echo
BEGIN;
EXPLAIN ANALYZE UPDATE orders SET status = 'cancelled' WHERE order_id <= 1000;
ROLLBACK;
\echo '   The UPDATE really ran — and the rollback undid it:'
SELECT status, count(*) FROM orders WHERE order_id <= 1000 GROUP BY status;

\echo
\echo '── Slide 13 · Anatomy of one node ───────────────────────────────'
\echo '   Read this one line by line on screen:'
\echo '   Seq Scan · cost=startup..total · rows (est) · width'
\echo '   actual time=first..last ms · rows (real) · loops'
\echo '   Rows Removed by Filter — often the whole diagnosis.'
\echo
EXPLAIN ANALYZE SELECT * FROM orders WHERE total_amount > 5000;

\echo
\echo '── Slide 14 · Plan smells, each one produced on purpose ─────────'
\echo
\echo 'Smell: Sort spilled to disk ("external merge  Disk")'
SET work_mem = '1MB';
EXPLAIN ANALYZE SELECT * FROM orders ORDER BY total_amount DESC;
\echo 'Same sort with enough memory → "quicksort  Memory"'
SET work_mem = '256MB';
EXPLAIN ANALYZE SELECT * FROM orders ORDER BY total_amount DESC;
RESET work_mem;

\echo
\echo '── Slide 15 · Scan types — four in a row, slow → fast ───────────'
\echo '   (a temporary index, dropped at the end of this block)'
\echo
CREATE INDEX tmp_orders_amount ON orders (total_amount) INCLUDE (order_id);
VACUUM ANALYZE orders;

\echo 'Seq Scan — most rows qualify'
EXPLAIN SELECT order_id FROM orders WHERE total_amount > 100;
\echo 'Bitmap Index Scan — a medium number of matches'
EXPLAIN SELECT * FROM orders WHERE total_amount > 3000;
\echo 'Index Scan — one row, straight through the primary key'
EXPLAIN SELECT * FROM orders WHERE order_id = 880231;
\echo 'Index Only Scan — every column asked for lives in the index'
EXPLAIN SELECT order_id, total_amount FROM orders WHERE total_amount = 7499;

DROP INDEX tmp_orders_amount;

\echo
\echo '── Slide 16 · Our "before" picture — hold this number ───────────'
\echo
EXPLAIN ANALYZE SELECT * FROM orders WHERE total_amount > 5000;
\echo '   Every technique today is judged by one question:'
\echo '   does this Seq Scan disappear, and does this time drop?'
\echo
