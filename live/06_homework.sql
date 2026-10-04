-- =====================================================================
-- HOMEWORK (slide 49) · A slow order_items report
-- psql -d shopeasy -f 06_homework.sql
--
-- "Revenue by category for last month." Bring back:
--   1. EXPLAIN ANALYZE before   2. the index(es) you chose
--   3. EXPLAIN ANALYZE after    4. why the columns are in that order
-- A worked answer is in 06_homework_solution.sql — don't peek.
-- =====================================================================
\pset pager off
SET max_parallel_workers_per_gather = 0;

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
