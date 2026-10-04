-- =====================================================================
-- SEGMENT 5 · Indexing to optimize queries (slides 32–47)
-- psql -d shopeasy -f 05_indexes.sql
--
-- Re-runnable: it drops its own indexes first (see 99_reset.sql).
-- =====================================================================
\pset pager off
\timing off
SET max_parallel_workers_per_gather = 0;
SET client_min_messages = warning;
\i 99_reset.sql

-- The dashboard query from segment 4, reused below as a psql variable.
\set dashboard 'WITH customer_totals AS (SELECT customer_id, SUM(total_amount) AS spent, COUNT(*) AS num_orders FROM orders WHERE order_date >= date_trunc(''month'', CURRENT_DATE) GROUP BY customer_id) SELECT c.name, ct.spent, ct.num_orders FROM customer_totals ct JOIN customers c ON c.customer_id = ct.customer_id ORDER BY ct.spent DESC LIMIT 20'

\echo
\echo '── Slide 33 · Without an index = read all 900 pages ─────────────'
\echo '   Dashboard, before any index:'
EXPLAIN ANALYZE :dashboard;

-- =====================================================================
\echo
\echo '══ 5.1 · Five structures (slides 34–39) ═════════════════════════'
\echo
\echo '── B-tree (slide 35) · equality, range, ORDER BY ──'
CREATE INDEX idx_orders_date ON orders (order_date);
ANALYZE orders;
\echo 'Range:'
EXPLAIN ANALYZE SELECT count(*) FROM orders
WHERE order_date BETWEEN '2025-11-01' AND '2025-11-30';
\echo 'ORDER BY … LIMIT 20 (trick 5 again) — the Sort node is gone,'
\echo 'the index is walked backwards and stops after 20 rows:'
EXPLAIN ANALYZE SELECT order_id, order_date, total_amount
FROM orders ORDER BY order_date DESC LIMIT 20;
\echo 'Tree depth — a few page reads even over 2M rows:'
SELECT pg_size_pretty(pg_relation_size('idx_orders_date')) AS index_size,
       (SELECT level FROM bt_metap('idx_orders_date')) AS tree_levels_below_root;
DROP INDEX idx_orders_date;

\echo
\echo '── Hash (slide 36) · equality only ──'
CREATE INDEX idx_sessions_token ON sessions USING HASH (session_token);
ANALYZE sessions;
EXPLAIN ANALYZE SELECT * FROM sessions WHERE session_token = md5('4242');
\echo 'Range on a hash index — cannot help, back to Seq Scan:'
EXPLAIN SELECT * FROM sessions WHERE session_token > 'ffff';

\echo
\echo '── GIN (slide 37) · many values per row ──'
\echo 'Before:'
EXPLAIN ANALYZE SELECT count(*) FROM products WHERE tags @> '{sale,gift}';
CREATE INDEX idx_products_tags ON products USING GIN (tags);
ANALYZE products;
\echo 'After — Bitmap Index Scan on the posting lists:'
EXPLAIN ANALYZE SELECT count(*) FROM products WHERE tags @> '{sale,gift}';

\echo
\echo '── GiST (slide 38) · "5 stores nearest me" (Mumbai) ──'
\echo 'Before — measure distance to all 20k stores, then sort:'
EXPLAIN ANALYZE SELECT store_id, name FROM stores
ORDER BY location <-> point(72.8, 19.0) LIMIT 5;
CREATE INDEX idx_stores_loc ON stores USING GIST (location);
ANALYZE stores;
\echo 'After — Index Scan with "Order By", no Sort node:'
EXPLAIN ANALYZE SELECT store_id, name FROM stores
ORDER BY location <-> point(72.8, 19.0) LIMIT 5;

\echo
\echo '── BRIN (slide 39) · tiny summary for time-ordered data ──'
CREATE INDEX idx_events_brin  ON events USING BRIN  (created_at);
CREATE INDEX idx_events_btree ON events USING BTREE (created_at);
SELECT 'brin' AS kind, pg_size_pretty(pg_relation_size('idx_events_brin')) AS size
UNION ALL
SELECT 'btree', pg_size_pretty(pg_relation_size('idx_events_btree'));
DROP INDEX idx_events_btree;
ANALYZE events;
EXPLAIN ANALYZE SELECT count(*) FROM events
WHERE created_at >= '2025-06-01' AND created_at < '2025-06-02';
\echo '   Point at "Rows Removed by Index Recheck": BRIN reads whole block'
\echo '   ranges and rechecks — lossy, but the index is kilobytes.'

-- =====================================================================
\echo
\echo '══ Composite · the leftmost-prefix rule (slide 40) ══════════════'
CREATE INDEX idx_orders_cust_date ON orders (customer_id, order_date);
ANALYZE orders;
\echo '✓ WHERE customer_id = 1024'
EXPLAIN SELECT * FROM orders WHERE customer_id = 1024;
\echo '✓ WHERE customer_id = 1024 AND order_date > ...'
EXPLAIN SELECT * FROM orders WHERE customer_id = 1024 AND order_date > '2025-11-01';
\echo '✕ WHERE order_date > ...  (skips the leftmost column)'
EXPLAIN SELECT * FROM orders WHERE order_date > '2025-11-01';
\echo '   (PostgreSQL 18 adds B-tree "skip scan", which can use this index'
\echo '    when the leading column has few distinct values. With 200k'
\echo '    customer_ids it still cannot — the rule holds in practice.)'
DROP INDEX idx_orders_cust_date;

-- =====================================================================
\echo
\echo '══ Four special shapes (slide 41) ═══════════════════════════════'
\echo
\echo '── Partial: only the rows you ever query ──'
CREATE INDEX idx_orders_pending ON orders (order_date) WHERE status = 'pending';
CREATE INDEX idx_orders_date    ON orders (order_date);
SELECT indexrelname, pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes WHERE indexrelname IN ('idx_orders_pending', 'idx_orders_date');
ANALYZE orders;
EXPLAIN ANALYZE SELECT * FROM orders
WHERE status = 'pending' AND order_date >= CURRENT_DATE - 7;
DROP INDEX idx_orders_date;

\echo
\echo '── Expression: fixes the LOWER() trap (slide 45) ──'
\echo 'WITHOUT — plain unique index on email is not usable:'
EXPLAIN ANALYZE SELECT * FROM customers WHERE LOWER(email) = 'sam@shop.io';
CREATE INDEX idx_cust_lower_email ON customers (LOWER(email));
ANALYZE customers;
\echo 'WITH — the index is on the expression the WHERE uses:'
EXPLAIN ANALYZE SELECT * FROM customers WHERE LOWER(email) = 'sam@shop.io';

\echo
\echo '── Covering (INCLUDE): answered from the index alone ──'
CREATE INDEX idx_orders_cust ON orders (customer_id);
ANALYZE orders;
\echo 'Plain index — finds rows, then visits the table for total_amount:'
EXPLAIN ANALYZE SELECT customer_id, total_amount FROM orders WHERE customer_id = 1024;
DROP INDEX idx_orders_cust;
CREATE INDEX idx_orders_cust_incl ON orders (customer_id) INCLUDE (total_amount);
VACUUM ANALYZE orders;   -- Index Only Scan needs an up-to-date visibility map
\echo 'Covering index — Index Only Scan; Heap Fetches near 0 = the table was barely touched:'
EXPLAIN ANALYZE SELECT customer_id, total_amount FROM orders WHERE customer_id = 1024;
DROP INDEX idx_orders_cust_incl;

-- =====================================================================
\echo
\echo '══ 5.2 · Selectivity is everything (slides 42–43) ═══════════════'
CREATE INDEX idx_orders_status ON orders (status);
ANALYZE orders;
SELECT status, count(*), round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
FROM orders GROUP BY status ORDER BY 2 DESC;
\echo 'status = delivered (95% of rows) — index exists, planner ignores it:'
EXPLAIN SELECT * FROM orders WHERE status = 'delivered';
\echo 'status = cancelled (1%) — now the index is worth it:'
EXPLAIN SELECT * FROM orders WHERE status = 'cancelled';
\echo '   Not a bug. Low selectivity → Seq Scan is genuinely cheaper.'
DROP INDEX idx_orders_status;

\echo
\echo '── Indexes are not free (slide 43): time 200k inserts ──'
CREATE TEMP TABLE w0 (LIKE orders);
CREATE TEMP TABLE w5 (LIKE orders);
CREATE INDEX ON w5 (customer_id);
CREATE INDEX ON w5 (order_date);
CREATE INDEX ON w5 (status);
CREATE INDEX ON w5 (total_amount);
CREATE INDEX ON w5 (customer_id, order_date) INCLUDE (total_amount);
\timing on
\echo 'no indexes:'
INSERT INTO w0 SELECT * FROM orders WHERE order_id <= 200000;
\echo 'five indexes:'
INSERT INTO w5 SELECT * FROM orders WHERE order_id <= 200000;
\timing off
DROP TABLE w0, w5;

-- =====================================================================
\echo
\echo '══ The victory lap (slide 46) ═══════════════════════════════════'
\echo
\echo '1) Aarav''s drill-down: this month, one customer'
\echo '   Equality column first, range column second, amount carried along.'
\echo 'BEFORE:'
EXPLAIN ANALYZE SELECT order_date, total_amount FROM orders
WHERE customer_id = 1024 AND order_date >= date_trunc('month', CURRENT_DATE);

CREATE INDEX CONCURRENTLY idx_orders_cust_date_amt
  ON orders (customer_id, order_date) INCLUDE (total_amount);
VACUUM ANALYZE orders;

\echo 'AFTER:'
EXPLAIN ANALYZE SELECT order_date, total_amount FROM orders
WHERE customer_id = 1024 AND order_date >= date_trunc('month', CURRENT_DATE);

\echo
\echo '2) The dashboard itself: this month, ALL customers'
\echo '   The filter here is order_date alone — so by the leftmost-prefix'
\echo '   rule the index above cannot serve it. It needs order_date first:'
CREATE INDEX CONCURRENTLY idx_orders_date_cust_amt
  ON orders (order_date) INCLUDE (customer_id, total_amount);
VACUUM ANALYZE orders;
EXPLAIN ANALYZE :dashboard;

\echo
\echo '3) The slide-16 "before picture": orders over ₹5,000'
CREATE INDEX CONCURRENTLY idx_orders_amount ON orders (total_amount);
ANALYZE orders;
EXPLAIN ANALYZE SELECT * FROM orders WHERE total_amount > 5000;

\echo
\echo '   Same data. Same result. We changed the route, not the destination.'
\echo '   Leave these indexes in place for 06_homework.sql, or run'
\echo '   99_reset.sql to start the lecture over.'
\echo
