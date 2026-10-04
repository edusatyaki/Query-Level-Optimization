-- =====================================================================
-- SEGMENT 3 · Query-level tricks — the free wins (slides 18–25)
-- psql -d shopeasy -f 03_free_wins.sql
--
-- Each trick is a ✕ / ✓ pair. Run the ✕, point at the plan tell,
-- run the ✓, point at what changed. Any helper index a trick needs
-- is created and dropped inside that trick, so segment 5 still starts
-- from the un-indexed "before" world.
-- =====================================================================
\pset pager off
\timing off
SET max_parallel_workers_per_gather = 0;

-- =====================================================================
\echo
\echo '══ Trick 1 · Select only the columns you need (slide 19) ═══════'
\echo '   Plan tell: width= drops.'
\echo
\echo '✕ SELECT *'
EXPLAIN SELECT * FROM customers WHERE city = 'Pune';
\echo '✓ only what the dashboard shows'
EXPLAIN SELECT customer_id, name FROM customers WHERE city = 'Pune';

-- =====================================================================
\echo
\echo '══ Trick 2 · Keep filters sargable (slide 20) ══════════════════'
\echo '   customers.email already has a UNIQUE index.'
\echo
\echo '✕ function on the column — the index is on email, not LOWER(email)'
EXPLAIN ANALYZE SELECT * FROM customers WHERE LOWER(email) = 'amit@shop.com';
\echo '✓ bare column — same row, through the index'
EXPLAIN ANALYZE SELECT * FROM customers WHERE email = 'amit@shop.com';
\echo '   (Only equivalent because emails are stored lowercase. If they'
\echo '    are not, the fix is the expression index in segment 5.)'
\echo

CREATE INDEX tmp_orders_date ON orders (order_date);
ANALYZE orders;
\echo '✕ cast defeats the range — index on order_date exists but is ignored'
EXPLAIN ANALYZE SELECT count(*) FROM orders WHERE order_date::text LIKE '2025-11%';
\echo '✓ range-friendly dates'
EXPLAIN ANALYZE SELECT count(*) FROM orders
WHERE order_date >= '2025-11-01' AND order_date < '2025-12-01';
DROP INDEX tmp_orders_date;

-- =====================================================================
\echo
\echo '══ Trick 3 · JOIN / EXISTS over correlated subqueries (slide 21) ═'
\echo '   Question: which customers have ever ordered?'
\echo '   orders.customer_id has NO index (Postgres never indexes FKs for you).'
\echo
\echo '✕ correlated subquery — estimated cost for all 200k customers:'
EXPLAIN
SELECT name FROM customers c
WHERE (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.customer_id) > 0;
\echo '   Look at the top cost. The SubPlan is a full Seq Scan of orders'
\echo '   — run once PER customer. Too slow to run, so run it for just 10:'
\echo
EXPLAIN ANALYZE
SELECT name FROM customers c
WHERE c.customer_id <= 10
  AND (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.customer_id) > 0;
\echo '   Point at loops=10 on the SubPlan and its per-loop time.'
\echo '   ~55 ms per loop × 200,000 customers ≈ 3 hours.'
\echo
\echo '✓ EXISTS — ALL 200k customers, one pass over orders'
EXPLAIN ANALYZE
SELECT c.name FROM customers c
WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.customer_id);
\echo '   Plan tell: per-row SubPlan → one Hash Semi Join.'
\echo
\echo '✓ JOIN — also one Hash Join, but needs DISTINCT to undo the fan-out'
EXPLAIN ANALYZE
SELECT DISTINCT c.customer_id, c.name
FROM customers c JOIN orders o ON o.customer_id = c.customer_id;
\echo '   Note: DISTINCT c.name alone (as on the slide) would merge two'
\echo '   different customers who share a name — keep the key in it.'
\echo '   EXISTS needs no DISTINCT, which is why it is best for "has any".'

-- =====================================================================
\echo
\echo '══ Trick 4 · Rewrite OR into IN / UNION (slide 22) ═════════════'
\echo
CREATE INDEX tmp_orders_status ON orders (status);
ANALYZE orders;
\echo 'OR on ONE column vs IN — Postgres already copes with both:'
EXPLAIN SELECT * FROM orders WHERE status = 'pending' OR status = 'cancelled';
EXPLAIN SELECT * FROM orders WHERE status IN ('pending', 'cancelled');
\echo '   IN is one Index Cond (= ANY), and it is cleaner to read and'
\echo '   generate from code. The OR that really hurts is the next one.'
DROP INDEX tmp_orders_status;
\echo

CREATE INDEX tmp_orders_cust ON orders (customer_id);
ANALYZE orders;
\echo '✕ OR across two tables — neither index can be used'
EXPLAIN ANALYZE
SELECT o.order_id, o.total_amount
FROM orders o JOIN customers c ON c.customer_id = o.customer_id
WHERE c.email = 'amit@shop.com' OR o.order_id = 880231;
\echo '✓ UNION — each branch gets its own index'
EXPLAIN ANALYZE
SELECT o.order_id, o.total_amount
FROM orders o JOIN customers c ON c.customer_id = o.customer_id
WHERE c.email = 'amit@shop.com'
UNION
SELECT o.order_id, o.total_amount
FROM orders o
WHERE o.order_id = 880231;
DROP INDEX tmp_orders_cust;

-- =====================================================================
\echo
\echo '══ Trick 5 · Push LIMIT down; drop needless DISTINCT / ORDER BY ══'
\echo '   (slide 23) "Latest orders" widget — it shows 20 rows.'
\echo
\echo '✕ no LIMIT: sort all 2M rows, ship them all, app keeps 20'
SET work_mem = '4MB';
EXPLAIN ANALYZE SELECT order_id, order_date, total_amount
FROM orders ORDER BY order_date DESC;
\echo '✓ LIMIT 20: top-N heapsort — keeps 20 in memory, no disk'
EXPLAIN ANALYZE SELECT order_id, order_date, total_amount
FROM orders ORDER BY order_date DESC LIMIT 20;
\echo '   Plan tell: "external merge Disk" → "top-N heapsort Memory".'
\echo '   With an index on order_date (segment 5) it stops after 20 rows.'
RESET work_mem;
\echo
\echo '✕ needless DISTINCT — order_id is the primary key, rows are unique already'
EXPLAIN ANALYZE SELECT DISTINCT order_id, total_amount
FROM orders WHERE total_amount > 5000;
\echo '✓ drop it — the HashAggregate node disappears'
EXPLAIN ANALYZE SELECT order_id, total_amount
FROM orders WHERE total_amount > 5000;

-- =====================================================================
\echo
\echo '══ Trick 6 · Keep statistics fresh (slide 24) ══════════════════'
\echo '   Simulate Black Friday: a bulk load the planner has not seen.'
\echo
DROP TABLE IF EXISTS bf_orders;
CREATE TABLE bf_orders WITH (autovacuum_enabled = false) AS
SELECT * FROM orders WHERE order_date < '2025-11-01';
CREATE INDEX ON bf_orders (order_date);
ANALYZE bf_orders;                                   -- stats taken BEFORE the sale

INSERT INTO bf_orders                                -- 300k Black Friday orders
SELECT 3000000 + g, 1 + floor(random() * 200000)::bigint,
       DATE '2025-11-28', 'pending', round((99 + random() * 3000)::numeric, 2)
FROM generate_series(1, 300000) g;

\echo '✕ stale stats — planner thinks Black Friday had almost no orders'
EXPLAIN ANALYZE
SELECT c.city, count(*)
FROM bf_orders o JOIN customers c ON c.customer_id = o.customer_id
WHERE o.order_date = '2025-11-28'
GROUP BY c.city;
\echo '   Point at: bf_orders estimate ~2k rows, actual 300,000 (≈150x off).'
\echo '   Budgeting for 2k rows, it chose Sort + GroupAggregate — and the'
\echo '   sort spilled: "external merge Disk". Bad estimate → bad plan.'
\echo

ANALYZE bf_orders;

\echo '✓ after ANALYZE — same SQL, no rewrite, different plan'
EXPLAIN ANALYZE
SELECT c.city, count(*)
FROM bf_orders o JOIN customers c ON c.customer_id = o.customer_id
WHERE o.order_date = '2025-11-28'
GROUP BY c.city;
\echo '   Plan tell: estimate ≈ actual, the disk Sort is gone, HashAggregate'
\echo '   in memory instead — and it is faster. We changed nothing but stats.'
DROP TABLE bf_orders;
\echo
