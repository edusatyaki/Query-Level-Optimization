-- =====================================================================
-- SEGMENT 4 · Common Table Expressions (slides 26–31)
-- psql -d shopeasy -f 04_ctes.sql
-- =====================================================================
\pset pager off
\timing on
SET max_parallel_workers_per_gather = 0;

\echo
\echo '── Slide 2 & 27 · The dashboard query today ──────────────────────'
\echo '   The dashboard has a 10-second timeout. Watch it die.'
\echo
SET statement_timeout = '10s';

SELECT name, spent FROM (
  SELECT c.name,
         (SELECT SUM(total_amount) FROM orders o
           WHERE o.customer_id = c.customer_id
             AND o.order_date >= date_trunc('month', now())) AS spent
  FROM customers c
  WHERE (SELECT SUM(total_amount) FROM orders o
          WHERE o.customer_id = c.customer_id
            AND o.order_date >= date_trunc('month', now())) > 0
) t
ORDER BY spent DESC
LIMIT 20;

RESET statement_timeout;

\echo
\echo '   Why? Same SUM written twice → two SubPlans, each a Seq Scan of'
\echo '   2M orders, run for every one of 200k customers:'
\timing off
EXPLAIN
SELECT name, spent FROM (
  SELECT c.name,
         (SELECT SUM(total_amount) FROM orders o
           WHERE o.customer_id = c.customer_id
             AND o.order_date >= date_trunc('month', now())) AS spent
  FROM customers c
  WHERE (SELECT SUM(total_amount) FROM orders o
          WHERE o.customer_id = c.customer_id
            AND o.order_date >= date_trunc('month', now())) > 0
) t
ORDER BY spent DESC
LIMIT 20;
\echo '   Point at: SubPlan 1 and SubPlan 2 — the same work, twice, per row.'

\echo
\echo '── Slide 28 · The same query, named and readable ─────────────────'
\echo
\timing on
WITH customer_totals AS (
  SELECT customer_id,
         SUM(total_amount) AS spent,
         COUNT(*)          AS num_orders
  FROM orders
  WHERE order_date >= date_trunc('month', CURRENT_DATE)
  GROUP BY customer_id
)
SELECT c.name, ct.spent, ct.num_orders
FROM customer_totals ct
JOIN customers c ON c.customer_id = ct.customer_id
ORDER BY ct.spent DESC
LIMIT 20;
\timing off

\echo 'And its plan:'
EXPLAIN ANALYZE
WITH customer_totals AS (
  SELECT customer_id,
         SUM(total_amount) AS spent,
         COUNT(*)          AS num_orders
  FROM orders
  WHERE order_date >= date_trunc('month', CURRENT_DATE)
  GROUP BY customer_id
)
SELECT c.name, ct.spent, ct.num_orders
FROM customer_totals ct
JOIN customers c ON c.customer_id = ct.customer_id
ORDER BY ct.spent DESC
LIMIT 20;
\echo '   Timed out → a few hundred ms. One aggregate, one pass, no index yet.'
\echo '   Note there is no "CTE Scan" node: referenced once, so it was inlined.'
\echo '   Still a Seq Scan on orders though — segment 5 removes that.'

\echo
\echo '── Slide 29 · Inlined vs MATERIALIZED, when referenced TWICE ─────'
\echo '   "Top spenders, and how they compare to the average spender"'
\echo
\echo 'NOT MATERIALIZED → the aggregate is copied in and runs twice'
EXPLAIN ANALYZE
WITH customer_totals AS NOT MATERIALIZED (
  SELECT customer_id, SUM(total_amount) AS spent
  FROM orders
  WHERE order_date >= date_trunc('month', CURRENT_DATE)
  GROUP BY customer_id
)
SELECT customer_id, spent
FROM customer_totals
WHERE spent > 3 * (SELECT avg(spent) FROM customer_totals);

\echo 'MATERIALIZED (the default when referenced 2+ times) → computed once'
EXPLAIN ANALYZE
WITH customer_totals AS MATERIALIZED (
  SELECT customer_id, SUM(total_amount) AS spent
  FROM orders
  WHERE order_date >= date_trunc('month', CURRENT_DATE)
  GROUP BY customer_id
)
SELECT customer_id, spent
FROM customer_totals
WHERE spent > 3 * (SELECT avg(spent) FROM customer_totals);
\echo '   Point at: two Seq Scans on orders vs one, plus "CTE Scan" twice.'

\echo
\echo '── Slide 30 · The materialization trap ──────────────────────────'
\echo
\echo '✕ MATERIALIZED — builds all 2M rows, then filters'
EXPLAIN ANALYZE
WITH all_orders AS MATERIALIZED (SELECT * FROM orders)
SELECT * FROM all_orders WHERE order_id = 42;

\echo '✓ inlined (default) — the filter pushes in, primary key does the rest'
EXPLAIN ANALYZE
WITH all_orders AS (SELECT * FROM orders)
SELECT * FROM all_orders WHERE order_id = 42;
\echo '   Before PostgreSQL 12 EVERY CTE behaved like the first one.'
\echo
