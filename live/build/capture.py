#!/usr/bin/env python3
"""Run every scenario in the deck against the live ShopEasy database and save
the real EXPLAIN output to plans.js, which index.html reads.

    python3 build/capture.py            # needs: createdb shopeasy + 00_setup.sql

The deck never shows a hand-typed plan: change a query here, re-run this, and
the slide shows what PostgreSQL actually printed.
"""
import json, os, re, subprocess, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.environ.get("PGDATABASE", "shopeasy")

DASHBOARD_CTE = """WITH customer_totals AS (
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
LIMIT 20;"""

DASHBOARD_NESTED = """SELECT name, spent FROM (
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
LIMIT 20;"""

TWICE_CTE = """WITH customer_totals AS {m}(
  SELECT customer_id, SUM(total_amount) AS spent
  FROM orders
  WHERE order_date >= date_trunc('month', CURRENT_DATE)
  GROUP BY customer_id
)
SELECT customer_id, spent
FROM customer_totals
WHERE spent > 3 * (SELECT avg(spent) FROM customer_totals);"""

HOMEWORK = """SELECT p.category,
       SUM(oi.quantity * oi.unit_price) AS revenue,
       COUNT(DISTINCT o.order_id)        AS orders
FROM order_items oi
JOIN orders   o ON o.order_id   = oi.order_id
JOIN products p ON p.product_id = oi.product_id
WHERE o.order_date >= date_trunc('month', CURRENT_DATE) - interval '1 month'
  AND o.order_date <  date_trunc('month', CURRENT_DATE)
GROUP BY p.category
ORDER BY revenue DESC;"""

BF_SETUP = [
    "DROP TABLE IF EXISTS bf_orders",
    "CREATE TABLE bf_orders WITH (autovacuum_enabled = false) AS SELECT * FROM orders WHERE order_date < '2025-11-01'",
    "CREATE INDEX ON bf_orders (order_date)",
    "ANALYZE bf_orders",
    "INSERT INTO bf_orders SELECT 3000000 + g, 1 + floor(random() * 200000)::bigint, DATE '2025-11-28', 'pending', "
    "round((99 + random() * 3000)::numeric, 2) FROM generate_series(1, 300000) g",
]
BF_QUERY = """SELECT c.city, count(*)
FROM bf_orders o JOIN customers c ON c.customer_id = o.customer_id
WHERE o.order_date = '2025-11-28'
GROUP BY c.city;"""

# ---------------------------------------------------------------------------
# Each capture: id, the SQL shown on the slide, how to run it.
#   mode  : 'analyze' (EXPLAIN ANALYZE), 'explain', 'buffers', 'raw' (run as-is)
#   setup / teardown : run around it, same session
#   warm  : run once first so the timing is a warm-cache number
# Order matters: some steps build state the next one needs.
# ---------------------------------------------------------------------------
C = []
def cap(id, sql, mode="analyze", setup=(), teardown=(), warm=True, settings=()):
    C.append(dict(id=id, sql=sql.strip(), mode=mode, setup=list(setup),
                  teardown=list(teardown), warm=warm, settings=list(settings)))

# ---- chapter 1 · the dashboard that died
cap("sizes", """SELECT relname AS table_name,
       to_char(n_live_tup, 'FM999,999,999') AS rows,
       pg_size_pretty(pg_total_relation_size(relid)) AS size
FROM pg_stat_user_tables
WHERE relname IN ('customers','orders','order_items','products')
ORDER BY n_live_tup DESC;""", mode="raw", warm=False)
cap("timeout", DASHBOARD_NESTED, mode="raw", warm=False, settings=["SET statement_timeout = '10s'"])

# ---- chapter 2 · the planner
cap("qa", "SELECT * FROM orders WHERE total_amount > 5000;", mode="explain")
cap("qb", "SELECT order_id, total_amount FROM orders WHERE total_amount > 5000;", mode="explain")

# ---- chapter 3 · reading the plan
cap("ex_plain",   "SELECT * FROM orders WHERE total_amount > 5000;", mode="explain")
cap("ex_analyze", "SELECT * FROM orders WHERE total_amount > 5000;")
cap("ex_buffers", "SELECT * FROM orders WHERE total_amount > 5000;", mode="buffers", warm=False)
cap("rollback", "UPDATE orders SET status = 'cancelled' WHERE order_id <= 1000;",
    setup=["BEGIN"], teardown=["ROLLBACK"], warm=False)
cap("sort_disk", "SELECT * FROM orders ORDER BY total_amount DESC;", settings=["SET work_mem = '1MB'"])
cap("sort_mem",  "SELECT * FROM orders ORDER BY total_amount DESC;", settings=["SET work_mem = '256MB'"])
SCAN_SETUP = ["CREATE INDEX tmp_orders_amount ON orders (total_amount) INCLUDE (order_id)", "VACUUM ANALYZE orders"]
cap("scan_seq",    "SELECT order_id FROM orders WHERE total_amount > 100;", mode="explain", setup=SCAN_SETUP)
cap("scan_bitmap", "SELECT * FROM orders WHERE total_amount > 3000;", mode="explain")
cap("scan_index",  "SELECT * FROM orders WHERE order_id = 880231;", mode="explain")
cap("scan_only",   "SELECT order_id, total_amount FROM orders WHERE total_amount = 7499;", mode="explain",
    teardown=["DROP INDEX tmp_orders_amount", "ANALYZE orders"])
cap("before", "SELECT * FROM orders WHERE total_amount > 5000;")

# ---- chapter 4 · the free wins
cap("t1_bad",  "SELECT * FROM customers WHERE city = 'Pune';", mode="explain")
cap("t1_good", "SELECT customer_id, name FROM customers WHERE city = 'Pune';", mode="explain")
cap("t2_bad",  "SELECT * FROM customers WHERE LOWER(email) = 'amit@shop.com';")
cap("t2_good", "SELECT * FROM customers WHERE email = 'amit@shop.com';")
cap("t2d_bad", "SELECT count(*) FROM orders\nWHERE order_date::text LIKE '2025-11%';",
    setup=["CREATE INDEX tmp_orders_date ON orders (order_date)", "VACUUM ANALYZE orders"])
cap("t2d_good", "SELECT count(*) FROM orders\nWHERE order_date >= '2025-11-01'\n  AND order_date <  '2025-12-01';",
    teardown=["DROP INDEX tmp_orders_date"])
cap("t3_cost", """SELECT name FROM customers c
WHERE (SELECT COUNT(*) FROM orders o
       WHERE o.customer_id = c.customer_id) > 0;""", mode="explain")
cap("t3_bad", """SELECT name FROM customers c
WHERE c.customer_id <= 10
  AND (SELECT COUNT(*) FROM orders o
       WHERE o.customer_id = c.customer_id) > 0;""", warm=False)
cap("t3_good", """SELECT c.name FROM customers c
WHERE EXISTS (SELECT 1 FROM orders o
              WHERE o.customer_id = c.customer_id);""")
cap("t3_join", """SELECT DISTINCT c.customer_id, c.name
FROM customers c
JOIN orders o ON o.customer_id = c.customer_id;""")
cap("t4_or",  "SELECT * FROM orders\nWHERE status = 'pending' OR status = 'cancelled';", mode="explain",
    setup=["CREATE INDEX tmp_orders_status ON orders (status)", "ANALYZE orders"])
cap("t4_in",  "SELECT * FROM orders\nWHERE status IN ('pending', 'cancelled');", mode="explain",
    teardown=["DROP INDEX tmp_orders_status"])
cap("t4x_bad", """SELECT o.order_id, o.total_amount
FROM orders o JOIN customers c ON c.customer_id = o.customer_id
WHERE c.email = 'amit@shop.com' OR o.order_id = 880231;""",
    setup=["CREATE INDEX tmp_orders_cust ON orders (customer_id)", "ANALYZE orders"])
cap("t4x_good", """SELECT o.order_id, o.total_amount
FROM orders o JOIN customers c ON c.customer_id = o.customer_id
WHERE c.email = 'amit@shop.com'
UNION
SELECT o.order_id, o.total_amount
FROM orders o
WHERE o.order_id = 880231;""", teardown=["DROP INDEX tmp_orders_cust"])
cap("t5_bad",  "SELECT order_id, order_date, total_amount\nFROM orders ORDER BY order_date DESC;",
    settings=["SET work_mem = '4MB'"])
cap("t5_good", "SELECT order_id, order_date, total_amount\nFROM orders ORDER BY order_date DESC\nLIMIT 20;",
    settings=["SET work_mem = '4MB'"])
cap("t5d_bad",  "SELECT DISTINCT order_id, total_amount\nFROM orders WHERE total_amount > 5000;")
cap("t5d_good", "SELECT order_id, total_amount\nFROM orders WHERE total_amount > 5000;")
cap("t6_bad",  BF_QUERY, setup=BF_SETUP, warm=False)
cap("t6_good", BF_QUERY, setup=["ANALYZE bf_orders"], teardown=["DROP TABLE bf_orders"])

# ---- chapter 5 · CTEs
cap("cte_nested", DASHBOARD_NESTED, mode="explain")
cap("cte_good", DASHBOARD_CTE)
cap("cte_notmat", TWICE_CTE.format(m="NOT MATERIALIZED "))
cap("cte_mat",    TWICE_CTE.format(m="MATERIALIZED "))
cap("trap_bad",  "WITH all_orders AS MATERIALIZED (SELECT * FROM orders)\nSELECT * FROM all_orders WHERE order_id = 42;")
cap("trap_good", "WITH all_orders AS (SELECT * FROM orders)\nSELECT * FROM all_orders WHERE order_id = 42;")

# ---- chapter 6 · indexes
cap("bt_range_bad", "SELECT count(*) FROM orders\nWHERE order_date BETWEEN '2025-11-01' AND '2025-11-30';")
cap("bt_range", "SELECT count(*) FROM orders\nWHERE order_date BETWEEN '2025-11-01' AND '2025-11-30';",
    setup=["CREATE INDEX idx_orders_date ON orders (order_date)", "VACUUM ANALYZE orders"])
cap("bt_limit", "SELECT order_id, order_date, total_amount\nFROM orders ORDER BY order_date DESC LIMIT 20;")
cap("bt_depth", """SELECT pg_size_pretty(pg_relation_size('idx_orders_date')) AS index_size,
       (SELECT level FROM bt_metap('idx_orders_date')) AS levels_below_root;""",
    mode="raw", warm=False, teardown=["DROP INDEX idx_orders_date"])
cap("hash_bad", "SELECT * FROM sessions\nWHERE session_token = md5('4242');")
cap("hash_good", "SELECT * FROM sessions\nWHERE session_token = md5('4242');",
    setup=["CREATE INDEX idx_sessions_token ON sessions USING HASH (session_token)", "ANALYZE sessions"])
cap("hash_range", "SELECT * FROM sessions\nWHERE session_token > 'ffff';", mode="explain",
    teardown=["DROP INDEX idx_sessions_token"])
cap("gin_bad", "SELECT count(*) FROM products\nWHERE tags @> '{sale,gift}';")
cap("gin_good", "SELECT count(*) FROM products\nWHERE tags @> '{sale,gift}';",
    setup=["CREATE INDEX idx_products_tags ON products USING GIN (tags)", "ANALYZE products"],
    teardown=["DROP INDEX idx_products_tags"])
cap("gist_bad", "SELECT store_id, name FROM stores\nORDER BY location <-> point(72.8, 19.0)\nLIMIT 5;")
cap("gist_good", "SELECT store_id, name FROM stores\nORDER BY location <-> point(72.8, 19.0)\nLIMIT 5;",
    setup=["CREATE INDEX idx_stores_loc ON stores USING GIST (location)", "ANALYZE stores"],
    teardown=["DROP INDEX idx_stores_loc"])
cap("brin_size", """SELECT 'BRIN'  AS kind, pg_size_pretty(pg_relation_size('idx_events_brin'))  AS size
UNION ALL
SELECT 'B-tree', pg_size_pretty(pg_relation_size('idx_events_btree'));""", mode="raw", warm=False,
    setup=["CREATE INDEX idx_events_brin ON events USING BRIN (created_at)",
           "CREATE INDEX idx_events_btree ON events (created_at)"],
    teardown=["DROP INDEX idx_events_btree", "ANALYZE events"])
cap("brin_good", "SELECT count(*) FROM events\nWHERE created_at >= '2025-06-01'\n  AND created_at <  '2025-06-02';",
    teardown=["DROP INDEX idx_events_brin"])
CD = ["CREATE INDEX idx_orders_cust_date ON orders (customer_id, order_date)", "ANALYZE orders"]
cap("comp_1", "SELECT * FROM orders\nWHERE customer_id = 1024;", mode="explain", setup=CD)
cap("comp_2", "SELECT * FROM orders\nWHERE customer_id = 1024\n  AND order_date > '2025-11-01';", mode="explain")
cap("comp_3", "SELECT * FROM orders\nWHERE order_date > '2025-11-01';", mode="explain",
    teardown=["DROP INDEX idx_orders_cust_date"])
cap("partial_size", """SELECT indexrelname AS index,
       pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE indexrelname IN ('idx_orders_pending', 'idx_orders_date');""", mode="raw", warm=False,
    setup=["CREATE INDEX idx_orders_pending ON orders (order_date) WHERE status = 'pending'",
           "CREATE INDEX idx_orders_date ON orders (order_date)", "ANALYZE orders"])
cap("partial_good", "SELECT * FROM orders\nWHERE status = 'pending'\n  AND order_date >= CURRENT_DATE - 7;",
    teardown=["DROP INDEX idx_orders_date", "DROP INDEX idx_orders_pending"])
cap("expr_bad", "SELECT * FROM customers\nWHERE LOWER(email) = 'sam@shop.io';")
cap("expr_good", "SELECT * FROM customers\nWHERE LOWER(email) = 'sam@shop.io';",
    setup=["CREATE INDEX idx_cust_lower_email ON customers (LOWER(email))", "ANALYZE customers"],
    teardown=["DROP INDEX idx_cust_lower_email"])
cap("cover_bad", "SELECT customer_id, total_amount\nFROM orders WHERE customer_id = 1024;",
    setup=["CREATE INDEX idx_orders_cust ON orders (customer_id)", "ANALYZE orders"],
    teardown=["DROP INDEX idx_orders_cust"])
cap("cover_good", "SELECT customer_id, total_amount\nFROM orders WHERE customer_id = 1024;",
    setup=["CREATE INDEX idx_orders_cust_incl ON orders (customer_id) INCLUDE (total_amount)", "VACUUM ANALYZE orders"],
    teardown=["DROP INDEX idx_orders_cust_incl"])
cap("sel_dist", """SELECT status, count(*),
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
FROM orders GROUP BY status ORDER BY 2 DESC;""", mode="raw", warm=False,
    setup=["CREATE INDEX idx_orders_status ON orders (status)", "ANALYZE orders"])
cap("sel_hi", "SELECT * FROM orders WHERE status = 'delivered';", mode="explain")
cap("sel_lo", "SELECT * FROM orders WHERE status = 'cancelled';", mode="explain",
    teardown=["DROP INDEX idx_orders_status"])
WSETUP = ["CREATE TABLE w0 (LIKE orders)", "CREATE TABLE w5 (LIKE orders)",
          "CREATE INDEX ON w5 (customer_id)", "CREATE INDEX ON w5 (order_date)", "CREATE INDEX ON w5 (status)",
          "CREATE INDEX ON w5 (total_amount)", "CREATE INDEX ON w5 (customer_id, order_date) INCLUDE (total_amount)"]
cap("write_0", "INSERT INTO w0\nSELECT * FROM orders WHERE order_id <= 200000;", setup=WSETUP, warm=False)
cap("write_5", "INSERT INTO w5\nSELECT * FROM orders WHERE order_id <= 200000;", warm=False,
    teardown=["DROP TABLE w0", "DROP TABLE w5"])
DRILL = "SELECT order_date, total_amount FROM orders\nWHERE customer_id = 1024\n  AND order_date >= date_trunc('month', CURRENT_DATE);"
cap("v1_bad", DRILL)
cap("v1_good", DRILL, setup=["CREATE INDEX idx_orders_cust_date_amt ON orders (customer_id, order_date) INCLUDE (total_amount)",
                            "VACUUM ANALYZE orders"])
cap("v2_bad", DASHBOARD_CTE)
cap("v2_good", DASHBOARD_CTE, setup=["CREATE INDEX idx_orders_date_cust_amt ON orders (order_date) INCLUDE (customer_id, total_amount)",
                                    "VACUUM ANALYZE orders"])
cap("v3_good", "SELECT * FROM orders WHERE total_amount > 5000;",
    setup=["CREATE INDEX idx_orders_amount ON orders (total_amount)", "ANALYZE orders"])

# ---- chapter 7 · homework (from a clean slate)
cap("hw_bad", HOMEWORK, setup=["RESET_INDEXES"])
cap("hw_idx", HOMEWORK, setup=["CREATE INDEX idx_orders_date_id ON orders (order_date) INCLUDE (order_id)",
                               "CREATE INDEX idx_items_order_incl ON order_items (order_id) INCLUDE (product_id, quantity, unit_price)",
                               "VACUUM ANALYZE orders", "VACUUM ANALYZE order_items"])
cap("hw_ssd", HOMEWORK, settings=["SET random_page_cost = 1.1"], teardown=["RESET_INDEXES"])

# ---------------------------------------------------------------------------
PREFIX = {"analyze": "EXPLAIN ANALYZE ", "explain": "EXPLAIN ", "buffers": "EXPLAIN (ANALYZE, BUFFERS) ", "raw": ""}

def psql(script):
    r = subprocess.run(["psql", "-X", "-d", DB, "-v", "ON_ERROR_STOP=0", "-P", "pager=off"],
                       input=script, capture_output=True, text=True)
    return r.stdout, r.stderr

def expand(stmts):
    out = []
    for s in stmts:
        out.append(r"\i " + os.path.join(ROOT, "99_reset.sql") if s == "RESET_INDEXES" else s + ";")
    return out

def run(c):
    q = PREFIX[c["mode"]] + c["sql"]
    body = ["SET client_min_messages = warning;", "SET max_parallel_workers_per_gather = 0;"]
    body += [s + ";" for s in c["settings"]] + expand(c["setup"])
    mode_fmt = [r"\pset footer off"] if c["mode"] != "raw" else []
    if c["warm"]:
        body += [r"\o /dev/null", q, r"\o"]
    body += mode_fmt + [r"\echo @@BEGIN", q, r"\echo @@END"] + expand(c["teardown"])
    out, err = psql("\n".join(body) + "\n")
    m = re.search(r"@@BEGIN\n(.*?)@@END", out, re.S)
    text = (m.group(1) if m else "").rstrip("\n")
    errs = [l for l in err.splitlines() if "ERROR" in l]
    if errs:
        text = (text + "\n" if text else "") + "\n".join(re.sub(r"^psql:<stdin>:\d+: ", "", e) for e in errs)
    lines = text.splitlines()
    if c["mode"] != "raw":                      # keep the plan, drop the header rule
        lines = [l for l in lines if not re.match(r"^\s*QUERY PLAN\s*$", l) and not re.match(r"^-+$", l)
                 and "Planning Time" not in l]
    text = "\n".join(lines)
    ms = re.search(r"Execution Time: ([\d.]+) ms", text)
    return dict(sql=c["sql"], mode=c["mode"], text=text, ms=float(ms.group(1)) if ms else None)

def main():
    print("resetting indexes …", file=sys.stderr)
    psql(r"\i " + os.path.join(ROOT, "99_reset.sql") + "\nVACUUM ANALYZE;\n")
    ver = psql("SHOW server_version;")[0].split("\n")[2].strip()
    plans = {}
    for c in C:
        r = run(c)
        plans[c["id"]] = r
        print(f"  {c['id']:<14} {('%.3f ms' % r['ms']) if r['ms'] is not None else r['text'].splitlines()[0][:60] if r['text'] else '(empty)'}",
              file=sys.stderr)
    meta = dict(server=ver, captured=datetime.date.today().isoformat())
    with open(os.path.join(ROOT, "plans.js"), "w") as f:
        f.write("/* generated by build/capture.py — real EXPLAIN output from the shopeasy database. Do not edit. */\n")
        f.write("const PLAN_META = " + json.dumps(meta) + ";\n")
        f.write("const PLANS = " + json.dumps(plans, indent=1, ensure_ascii=False) + ";\n")
    print(f"wrote plans.js · {len(plans)} captures · PostgreSQL {ver}", file=sys.stderr)

if __name__ == "__main__":
    main()
