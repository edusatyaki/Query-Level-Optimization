-- =====================================================================
-- HOMEWORK — worked answer
-- psql -d shopeasy -f 06_homework_solution.sql
--
-- Reading the "before" plan:
--   * Seq Scan on order_items, all ~6M rows → the biggest cost.
--     order_items.order_id is a foreign key, and PostgreSQL never
--     indexes foreign keys for you (slide 42: "a very common miss").
--   * Only ~1/36 of orders fall in last month, so we want to start
--     from orders (filter by date) and jump into order_items per order.
--
-- Index 1 — orders: range column first, carry the join key along
--   (order_date) INCLUDE (order_id) → Index Only Scan of one month.
-- Index 2 — order_items: the join key first (equality per order),
--   with the columns the SELECT needs carried along so the lookup
--   never touches the 500 MB table → Index Only Scan.
-- =====================================================================
\pset pager off
SET max_parallel_workers_per_gather = 0;

CREATE INDEX IF NOT EXISTS idx_orders_date_id
  ON orders (order_date) INCLUDE (order_id);
CREATE INDEX IF NOT EXISTS idx_items_order_incl
  ON order_items (order_id) INCLUDE (product_id, quantity, unit_price);
VACUUM ANALYZE orders;
VACUUM ANALYZE order_items;

EXPLAIN ANALYZE
SELECT p.category,
       SUM(oi.quantity * oi.unit_price) AS revenue,
       COUNT(DISTINCT o.order_id)        AS orders
FROM order_items oi
JOIN orders   o ON o.order_id   = oi.order_id
JOIN products p ON p.product_id = oi.product_id
WHERE o.order_date >= date_trunc('month', CURRENT_DATE) - interval '1 month'
  AND o.order_date <  date_trunc('month', CURRENT_DATE)
GROUP BY p.category
ORDER BY revenue DESC;

SELECT indexrelname AS index, pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE indexrelname IN ('idx_orders_date_id', 'idx_items_order_incl');
\echo '   The write-cost question: idx_items_order_incl is big. Is it worth'
\echo '   it? Only if this report runs often. A plain (order_id) index is'
\echo '   smaller and gets most of the win — a fair answer either way,'
\echo '   as long as it is justified.'

-- ---------------------------------------------------------------------
-- What you will actually see, and why it is the best part of the answer
-- ---------------------------------------------------------------------
-- On default settings the orders side flips to an Index Only Scan, but
-- order_items often STAYS a Seq Scan + Hash Join (~870 → ~450 ms).
-- That is slide 42's "or the planner correctly ignored it": ~160k of
-- 6M item rows match, and with random_page_cost = 4 (a spinning-disk
-- assumption) 54k separate index probes look more expensive than one
-- sequential read.
--
-- On an SSD that assumption is wrong. Tell the planner, for this
-- session only — this is the "configuration tuning" level that the
-- next lecture covers (slide 49):
\echo
\echo '── Same query, planner told the disk is an SSD ──'
SET random_page_cost = 1.1;
EXPLAIN ANALYZE
SELECT p.category,
       SUM(oi.quantity * oi.unit_price) AS revenue,
       COUNT(DISTINCT o.order_id)        AS orders
FROM order_items oi
JOIN orders   o ON o.order_id   = oi.order_id
JOIN products p ON p.product_id = oi.product_id
WHERE o.order_date >= date_trunc('month', CURRENT_DATE) - interval '1 month'
  AND o.order_date <  date_trunc('month', CURRENT_DATE)
GROUP BY p.category
ORDER BY revenue DESC;
RESET random_page_cost;
\echo '   Now: Nested Loop of two Index Only Scans, loops=~54k.'
\echo '   Run this file TWICE: the first run reads the fresh 284 MB index'
\echo '   from disk (~500 ms); warm, it is ~180 ms — ~5x the original.'
\echo '   Cold vs warm cache is itself a lesson: check BUFFERS read= vs hit=.'
