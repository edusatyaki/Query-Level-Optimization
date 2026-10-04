-- =====================================================================
-- 00_setup.sql — build the ShopEasy database (slides 3–5)
--
--   createdb shopeasy
--   psql -d shopeasy -f 00_setup.sql                 -- scale 1 (~1 min)
--   psql -d shopeasy -v scale=4 -f 00_setup.sql      -- bigger, slower
--
-- Scale 1 = 200k customers, 2M orders, ~6M order_items, 50k products.
-- The deck says 2M / 20M / 80M. That is about 10 GB; scale 1 keeps the
-- same shape at 1/10 the size, so the Seq Scans are still visibly slow
-- and the Index Scans are still under a millisecond.
--
-- Deliberately created with NO secondary indexes on orders / order_items.
-- That is the "before" world the dashboard is timing out in.
-- =====================================================================

\if :{?scale}
\else
  \set scale 1
\endif

\timing on
SET client_min_messages = warning;
SELECT setseed(0.42);

DROP TABLE IF EXISTS order_items, orders, products, customers,
                     sessions, stores, events, bf_orders CASCADE;

-- ---------------------------------------------------------------------
-- The four tables from slide 4
-- ---------------------------------------------------------------------
CREATE TABLE customers (
  customer_id bigint,
  name        text,
  email       text,
  city        text,
  created_at  date
);

CREATE TABLE products (
  product_id  bigint,
  name        text,
  category    text,
  price       numeric(10,2),
  stock       int,
  tags        text[]               -- used by the GIN demo (slide 37)
);

CREATE TABLE orders (
  order_id     bigint,
  customer_id  bigint,
  order_date   date,
  status       text,
  total_amount numeric(10,2)
);

CREATE TABLE order_items (
  item_id    bigint,
  order_id   bigint,
  product_id bigint,
  quantity   int,
  unit_price numeric(10,2)
);

-- ---------------------------------------------------------------------
-- Generate data
-- ---------------------------------------------------------------------
INSERT INTO customers
SELECT g,
       (ARRAY['Aarav','Diya','Rohan','Isha','Kabir','Meera','Vihaan','Anaya','Arjun','Sara'])[1 + g % 10]
         || ' ' ||
       (ARRAY['Sharma','Menon','Iyer','Gupta','Reddy','Nair','Das','Khan','Patel','Singh'])[1 + (g / 10) % 10],
       'user' || g || '@shop.com',
       (ARRAY['Pune','Kochi','Delhi','Mumbai','Bengaluru','Chennai','Kolkata','Jaipur','Hyderabad','Lucknow'])[1 + floor(random() * 10)::int],
       DATE '2021-01-01' + floor(random() * 1800)::int
FROM generate_series(1, 200000 * :scale) g;

INSERT INTO products
SELECT g,
       'Product ' || g,
       (ARRAY['Electronics','Home','Kitchen','Fashion','Books','Toys','Beauty','Sports'])[1 + g % 8],
       round((99 + random() * 9900)::numeric, 2),
       floor(random() * 1000)::int,
       (SELECT array_agg(t) FROM unnest(ARRAY['sale','new','gift','bestseller','clearance']) t
         WHERE random() < 0.15 + g * 0)        -- "+ g * 0" forces a fresh draw per product
FROM generate_series(1, 50000) g;

-- Orders: last ~3 years up to today, so "this month" always has rows.
-- status is skewed on purpose (95% delivered) for the selectivity demo.
-- total_amount is exponential: only ~0.5% of orders are over ₹5,000.
INSERT INTO orders
SELECT g,
       1 + floor(random() * 200000 * :scale)::bigint,
       CURRENT_DATE - floor(random() * 1095)::int,
       CASE WHEN r < 0.95 THEN 'delivered'
            WHEN r < 0.97 THEN 'shipped'
            WHEN r < 0.99 THEN 'pending'
            ELSE 'cancelled' END,
       round((99 - ln(1 - random()) * 900)::numeric, 2)
FROM (SELECT g, random() AS r FROM generate_series(1, 2000000 * :scale) g) s;

-- 1–5 items per order (avg 3)
INSERT INTO order_items
SELECT row_number() OVER (),
       o.order_id,
       1 + floor(random() * 50000)::bigint,
       1 + floor(random() * 3)::int,
       round((99 + random() * 4900)::numeric, 2)
FROM orders o
CROSS JOIN LATERAL generate_series(1, 1 + (o.order_id % 5)::int) k;

-- ---------------------------------------------------------------------
-- The rows we follow all lecture (slide 5)
-- ---------------------------------------------------------------------
UPDATE customers SET name = 'Aarav Sharma', city = 'Pune',  created_at = '2023-04-12' WHERE customer_id = 1024;
UPDATE customers SET name = 'Diya Menon',   city = 'Kochi', created_at = '2022-11-03' WHERE customer_id = 2087;
UPDATE customers SET name = 'Rohan Iyer',   city = 'Delhi', created_at = '2024-01-27' WHERE customer_id = 3391;
UPDATE customers SET email = 'amit@shop.com' WHERE customer_id = 5000;
UPDATE customers SET email = 'sam@shop.io'   WHERE customer_id = 6000;
UPDATE customers SET name  = 'Amit Verma'    WHERE customer_id = 5000;

UPDATE orders SET customer_id = 1024, order_date = '2025-11-28', status = 'delivered', total_amount = 7499  WHERE order_id = 880231;
UPDATE orders SET customer_id = 2087, order_date = '2025-11-28', status = 'shipped',   total_amount = 12250 WHERE order_id = 880232;
UPDATE orders SET customer_id = 1024, order_date = '2025-11-29', status = 'pending',   total_amount = 3199  WHERE order_id = 880233;

-- give Aarav a few orders this month so his drill-down is never empty
UPDATE orders SET customer_id = 1024, order_date = date_trunc('month', CURRENT_DATE)::date + (order_id % 3)::int
 WHERE order_id IN (100001, 100002, 100003);

UPDATE products SET name = 'Wireless Earbuds Pro', category = 'Electronics', price = 1499, stock = 320 WHERE product_id = 7712;
UPDATE products SET name = 'Cotton Bedsheet Set',  category = 'Home',        price = 4501, stock = 88  WHERE product_id = 4410;
UPDATE products SET name = 'Steel Water Bottle',   category = 'Kitchen',     price = 4083, stock = 540 WHERE product_id = 9930;

-- ---------------------------------------------------------------------
-- Keys only. PostgreSQL does NOT index foreign-key columns for you —
-- orders.customer_id and order_items.order_id start un-indexed.
-- customers.email gets a UNIQUE index (slide 41: "Unique — e.g. email").
-- ---------------------------------------------------------------------
ALTER TABLE customers   ADD PRIMARY KEY (customer_id);
ALTER TABLE products    ADD PRIMARY KEY (product_id);
ALTER TABLE orders      ADD PRIMARY KEY (order_id);
ALTER TABLE order_items ADD PRIMARY KEY (item_id);
ALTER TABLE customers   ADD CONSTRAINT customers_email_key UNIQUE (email);
ALTER TABLE orders      ADD FOREIGN KEY (customer_id) REFERENCES customers;
ALTER TABLE order_items ADD FOREIGN KEY (order_id)    REFERENCES orders;
ALTER TABLE order_items ADD FOREIGN KEY (product_id)  REFERENCES products;

-- ---------------------------------------------------------------------
-- Side tables for the index-type tour (slides 36–39)
-- ---------------------------------------------------------------------
-- HASH demo: session tokens, pure equality lookups
CREATE TABLE sessions AS
SELECT g AS session_id, md5(g::text) AS session_token,
       1 + floor(random() * 200000)::bigint AS customer_id
FROM generate_series(1, 500000) g;

-- GiST demo: store locations around India (x = longitude, y = latitude)
CREATE TABLE stores AS
SELECT g AS store_id, 'Store ' || g AS name,
       point(68 + random() * 29, 8 + random() * 29) AS location
FROM generate_series(1, 20000) g;

-- BRIN demo: append-only click log, physically in time order
CREATE TABLE events AS
SELECT g AS event_id,
       TIMESTAMP '2025-01-01' + g * interval '10 seconds' AS created_at,
       (ARRAY['view','click','cart','buy'])[1 + g % 4] AS kind
FROM generate_series(1, 3000000) g;

-- ---------------------------------------------------------------------
-- Fresh statistics + visibility map (Index Only Scan needs the latter)
-- ---------------------------------------------------------------------
VACUUM ANALYZE;

SELECT relname AS table_name,
       to_char(n_live_tup, 'FM999,999,999') AS rows,
       pg_size_pretty(pg_total_relation_size(relid)) AS size
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;
