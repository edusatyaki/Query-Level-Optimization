# Query-Level Optimization — live-code deck

The code-driven companion to the [animated deck](../) in this repository. It has the same sketchnote design, the same keyboard controls, the
same chapter openers and checkpoints, and every step is its own page. The
difference: **every slide is a query you run, followed by the plan PostgreSQL
actually printed.** No plan in this deck is typed by hand.

## Run it

```bash
python3 live/serve.py 8113      # from the repository root
```

Then open <http://localhost:8113>, or use the published copy:
**<https://edusatyaki.github.io/Query-Level-Optimization/live/>**

| Key | Action |
|-----|--------|
| `→` / `Space` / click | next step: the query, then *run it* (the plan streams in), then the fix |
| `←` | previous step |
| `↓` / `↑` | next / previous slide |
| `S` · `O` · `T` · `F` | speaker notes · run of show · theme · full screen |
| `+` / `−` / `0` | type size |

## Infographics on every page

The story is ShopEasy on Black Friday: a storefront with the sale banner and the
three products from the data, the sale's numbers as stat tiles, and Aarav, Diya
and Rohan as hand-drawn customers, both on the setup slide and in the dashboard
that times out. Every other page carries a picture too, without adding a step:

- **Trick and index slides:** while the ✕ query is on screen, the empty half holds
  a concept drawing (sargable index lookup, disk spill, per-row loop vs hash join,
  OR vs UNION, top-N, B-tree, hash buckets, GIN, GiST, BRIN, covering index).
- **Before → after:** shown as log-scale speed bars, not text.
- **Sizes and shares:** as bars (table sizes, BRIN vs B-tree, partial vs full index,
  status distribution).
- **Chapter cards and checkpoints:** each carries an illustration.

## How a scenario slide builds

1. ✕ the query as people write it, behind a `shopeasy=# EXPLAIN ANALYZE` prompt
2. its real plan, the culprit outlined in flame (`Seq Scan`, `Rows Removed by Filter`, `SubPlan`, `external merge Disk` …), plus the execution time
3. ✓ the rewrite (or the `CREATE INDEX`), with the change highlighted
4. its real plan, the win outlined in green
5. the plan tell, plus `before → after · N× less time`

| Ch | Chapter | What runs |
|----|---------|-----------|
| 1 | The dashboard that died | `00_setup.sql`, table sizes, the real dashboard query **timing out** |
| 2 | Meet the planner | Query A vs B, `width=35` → `14` |
| 3 | Reading the execution plan | EXPLAIN / ANALYZE / BUFFERS, node anatomy, ANALYZE in a rollback, disk sort, four scan types, the before picture |
| 4 | The free wins | the six tricks, each ✕ → ✓ |
| 5 | Common Table Expressions | timeout → CTE, NOT MATERIALIZED vs MATERIALIZED, the trap |
| 6 | Indexing | B-tree, Hash, GIN, GiST, BRIN, composite, partial, expression, covering, selectivity, write cost, victory lap |
| 7 | The scoreboard | every before/after on one log-scale chart, where the code corrected the slides, homework + answer |

## Re-recording the plans

```bash
python3 build/capture.py     # runs all scenarios against shopeasy → plans.js (~1 min)
python3 build/assemble.py    # shell + build/deck.css + build/deck.js → index.html
```

`build/capture.py` holds every scenario: its SQL, the setup and teardown
around it (temporary indexes are created and dropped per scenario), and
whether to warm the cache first. `index.html` is generated, so edit
`build/deck.js` (slides), `build/deck.css` (styles), or `build/shell-*.html`
(the design and presenter engine shared with the animated deck).

---

# The SQL scripts — the same lecture in psql

The runnable companion to the 50-slide **Query-Level Optimization in
PostgreSQL** deck (and to the [animated deck](https://github.com/edusatyaki/Query-Level-Optimization)).
Every claim on a slide becomes a query you run in front of the class, with the
`EXPLAIN` output on screen. Each change is a hypothesis, and the plan either
confirms it or doesn't.

## Setup (once, before class — about 1 minute)

```bash
createdb shopeasy
```

```bash
psql -d shopeasy -f 00_setup.sql
```

This builds the four ShopEasy tables from slide 4, plus three small side tables
for the index-type tour. It loads them with seeded random data, so every run
gives the same numbers. Only primary keys and `UNIQUE(email)` exist at first;
that's the "before" world the dashboard is timing out in.

| table | scale 1 | deck says |
|---|---|---|
| customers | 200,000 | 2,000,000 |
| orders | 2,000,000 | 20,000,000 |
| order_items | 6,000,000 | 80,000,000 |
| products | 50,000 | 50,000 |

Scale 1 is 1/10 of the deck's sizes, so the absolute times are about 1/10 too
(e.g. the slide-16 Seq Scan takes ~100 ms here, not 2,140 ms). The plans and
the before/after ratios are the same. Use `-v scale=4` for scarier numbers;
the load takes ~4 min.

## Running the lecture

One file per segment. Run a file whole, or paste its blocks one at a time
into `psql` while you talk. Each block prints a `── Slide N ──` banner and
a "Point at:" line saying what to circle in the plan.

| file | segment | slides | what the room sees |
|---|---|---|---|
| `01_intro.sql` | 1 · Intro, 6 min | 7–10 | `EXPLAIN` of Query A vs B — same rows, `width=35` → `14` |
| `02_reading_plans.sql` | 2 · Reading plans, 15 min | 11–17 | EXPLAIN vs ANALYZE vs BUFFERS; ANALYZE on an UPDATE inside a rollback; a sort spilling to **Disk** vs **quicksort Memory**; all four scan types in a row; the "before" picture |
| `03_free_wins.sql` | 3 · Six free wins, 15 min | 18–25 | one ✕/✓ pair per trick (below) |
| `04_ctes.sql` | 4 · CTEs, 10 min | 26–31 | the real dashboard query **times out** (10 s), the CTE rewrite answers in ~200 ms; NOT MATERIALIZED runs the aggregate twice; the materialization trap (187 ms vs 0.02 ms) |
| `05_indexes.sql` | 5 · Indexes, 17 min | 32–47 | B-tree, Hash, GIN, GiST, BRIN before/after; leftmost prefix; partial / expression / covering; selectivity; write cost; the victory lap |
| `06_homework.sql` | homework | 49 | the slow order_items report, with a worked answer in `06_homework_solution.sql` |
| `99_reset.sql` | — | — | drops every index the lecture made, so you can run it again |

Rehearse everything end to end (~2 min): `./run_all.sh`

### Measured on this machine (scale 1, PG 15)

| demo | before | after |
|---|---|---|
| Trick 2 · `LOWER(email)` → bare column | 45 ms Seq Scan | 0.5 ms Index Scan |
| Trick 2 · `order_date::text LIKE` → range | 149 ms | 2 ms Index Only Scan |
| Trick 3 · correlated subquery → `EXISTS` | ~55 ms × 200k loops ≈ 3 h | 240 ms Hash Semi Join |
| Trick 4 · OR across tables → `UNION` | 357 ms | 0.7 ms |
| Trick 6 · stale stats → `ANALYZE` | 144 ms, sort spills to disk | 79 ms, HashAggregate |
| Dashboard · nested SUMs → CTE | timeout (10 s) | 205 ms |
| Dashboard · CTE → + covering index | 236 ms | 13.6 ms |
| Aarav's drill-down · composite + INCLUDE | 56 ms | 0.02 ms |
| GiST nearest 5 stores | 1.8 ms Sort | 0.03 ms Index Scan Order By |
| BRIN vs B-tree size on 3M events | 64 MB | 24 kB |
| 200k inserts · 0 vs 5 indexes | 34 ms | 938 ms |

## Where the code corrects the deck

The live plans disagree with a few slides. Better to know before class than to
discover it in front of the room:

1. **Slide 21 (JOIN version):** `SELECT DISTINCT c.name … JOIN orders` merges
   two different customers who happen to share a name. Use
   `DISTINCT c.customer_id, c.name`, or better, `EXISTS`.
2. **Slide 22 (OR → IN):** for an OR on *one* column, PostgreSQL already uses
   the index (BitmapOr). IN is cleaner, not dramatically faster. The OR that
   really blocks indexes is one **across tables/columns**, which the script
   fixes with `UNION`.
3. **Slide 29:** "a CTE is inlined by default" only holds when it is referenced
   **once**. Referenced twice, PG 12+ materializes it by default. `04_ctes.sql`
   shows both.
4. **Slide 46:** the before/after pair doesn't match. The "before" is
   `WHERE total_amount > 5000`, but the index `(customer_id, order_date)
   INCLUDE (total_amount)` can't serve that filter. The script splits the
   victory lap into three honest wins: the drill-down (that index), the
   dashboard (`(order_date) INCLUDE (customer_id, total_amount)`), and the
   slide-16 query (`(total_amount)`).
5. **Slide 40:** PostgreSQL 18 added B-tree *skip scan*, so "leftmost
   column skipped → index unusable" is no longer absolute. It still holds
   when the leading column has many distinct values, like `customer_id`.
6. **Covering index:** an Index Only Scan needs a fresh visibility map, so
   the script runs `VACUUM` after creating it. Watch `Heap Fetches:`.

## Notes

- Every file sets `max_parallel_workers_per_gather = 0`, so plans have no
  Gather / Parallel nodes and read cleanly on a projector. Comment it out to
  show production-style plans.
- Segments 2–4 create any index they need and drop it again, so segment 5
  always starts from the un-indexed world. Segment 5 calls `99_reset.sql`
  itself and can be re-run any time.
- Set psql to show timing (`\timing on`) and turn the pager off (`\pset pager off`).
  Each file already does both where they matter.
