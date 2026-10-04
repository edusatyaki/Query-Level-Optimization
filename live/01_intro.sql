-- =====================================================================
-- SEGMENT 1 · Introducing query optimization (slides 7–10)
-- psql -d shopeasy -f 01_intro.sql
-- =====================================================================
\pset pager off
\timing off
-- One CPU core per query, so plans read top-to-bottom without
-- Gather / Parallel nodes. Comment this out to show "real" plans.
SET max_parallel_workers_per_gather = 0;

\echo
\echo '── Slide 9 · The planner does not run your SQL literally ─────────'
\echo '   EXPLAIN shows the plan it CHOSE, plus its estimated cost.'
\echo '   Nothing below actually executes yet.'
\echo
EXPLAIN SELECT * FROM orders WHERE total_amount > 5000;

\echo
\echo '── Slide 10 · Query A vs Query B ────────────────────────────────'
\echo '   Same rows. Look at width= — bytes per row the plan must carry.'
\echo
\echo 'Query A: SELECT *'
EXPLAIN SELECT * FROM orders WHERE total_amount > 5000;
\echo 'Query B: two columns'
EXPLAIN SELECT order_id, total_amount FROM orders WHERE total_amount > 5000;

\echo
\echo '   Point at: same rows= estimate, smaller width=.'
\echo '   Both are still a Seq Scan — narrowing columns alone is not'
\echo '   enough. That is the hook for the rest of the lecture.'
\echo

-- Live poll before moving on:
--   "What does the planner produce, and what does it minimize?"
--   → an execution plan; the estimated cost.
