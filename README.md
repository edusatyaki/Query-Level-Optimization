# Query-Level Optimization in PostgreSQL — animated infographic deck

An infographic, motion-graphics retelling of the **Query-Level Optimization in
PostgreSQL** session (source deck: 50 slides), built to be
presented. Every concept from the source deck is here, but the static slides
are replaced with animated SVG scenes that build themselves one step at a time
as you talk.

## Run it

```bash
python3 query-optimization/serve.py 8112
```

Then open <http://localhost:8112>. Also registered in `.claude/launch.json` as
`query-optimization`. `serve.py` sends `no-store`, so a plain reload always
shows the file on disk.

## Driving it

| Key | Action |
|-----|--------|
| `→` / `Space` / click | next step — advances the animation, then the slide |
| `←` | previous step |
| `↓` / `↑` | skip to next / previous slide |
| `S` | speaker notes drawer |
| `O` | run of show — jump to any slide |
| `T` | light / dark theme |
| `F` *(or the **Present** button)* | full screen |
| `+` / `−` / `0` | type size, for the room you are in |
| `Home` / `End` | first / last slide |

51 slides, 213 steps. Notes are written for speaking aloud, one per step.

## Structure: it is a story

The running scenario is **ShopEasy on Black Friday**: the "Top Customers This
Month" dashboard times out, the manager says *"Make it fast. Don't change the
data."*, and every technique arrives as the next layer peeled off that one
query. The five lecture segments become chapters, each opening with a
full-width chapter card (situation → problem → why it hurts → the turn).

| Ch | Chapter | Source segment |
|----|---------|----------------|
| 1 | The dashboard that died | Hook, scenario, data model, today's path |
| 2 | Meet the planner | Segment 1 · 6 min — three levels, the planner, cost |
| 3 | Reading the execution plan | Segment 2 · 15 min — EXPLAIN, node anatomy, smells, vocabulary |
| 4 | The free wins | Segment 3 · 15 min — six rewrites that cost nothing |
| 5 | Common Table Expressions | Segment 4 · 10 min — naming, inlining, the materialization trap |
| 6 | Indexing: give it a shortcut | Segment 5 · 17 min — five index types, composite, shapes, cost |
| 7 | The reusable framework | Wrap-up, homework, thanks |

Each segment ends on its checkpoint slide: the question appears first, the
answer only on the next step, so the room answers before the deck does.

## What is animated

| Scene | Motion |
|-------|--------|
| The dashboard | A spinner that becomes a 30,000 ms timeout; laptop vs production bars |
| Data model | Four tables drawn to scale by row count — products is a sliver, order_items towers |
| Today's path | Four stops appear along a road; a query packet travels it end to end |
| Faster road | The planner's winding route vs a straight road to the same house |
| The planner | SQL flows into the planner, fans out to candidate plans, the cheapest glows |
| Plan node | Each token of a real `Seq Scan` node lights as its annotation appears |
| Before picture | A scan head sweeps 20M rows; everything greys out except two kept squares |
| Correlated subquery | Six customer rows each fire a query at orders, vs one hash build + probe |
| Statistics | Estimate 100 vs actual 2M, then both bars match after `ANALYZE` |
| CTE | orders → customer_totals → JOIN → top 20, as a flowing pipeline |
| Materialization trap | 20M rows pour into a walled CTE vs one packet through the primary key |
| Book index | 24 pages light up one by one vs a jump from the index to page 348 |
| B-tree | Lookup packet runs root → branch → leaf 70; range walks the linked leaves |
| Hash | Key → `hash()` → bucket 3; the other buckets dim |
| GIN | Row → values flips to value → rows; `@> '{sale}'` reads one posting list |
| GiST | Box A is pruned whole on the map and in the tree; B → B1 finds "you" |
| BRIN | Block ranges resolve skip / skip / scan from their min–max |
| Composite | Index entries light as one block, then a slice, then scatter in red |
| Write cost | One INSERT fans out to the heap and four indexes |
| Victory lap | 2,140 ms bar vs a 3.2 ms sliver — ~670× less time |

Everything respects `prefers-reduced-motion`.

## Design

Same sketchnote system as the Database Optimization deck: cream paper, Caveat
marker headings on an amber highlighter stripe, Patrick Hand body, JetBrains
Mono for SQL and plans, hand-drawn wobbly boxes and an SVG roughness filter.
Colour is semantic — **flame** for the slow path and plan smells, **leaf** for
the fix, **amber** for emphasis, **pencil blue** for machinery. SQL is set on
paper with keywords weighted; the wrong part of a bad query is outlined in
flame, the fix highlighted in amber. Warm dark mode on `T`.

A slide never scrolls: an inner wrapper scales the step down if it would not
fit. Checked by walking all 213 steps with no errors.

## Source

`Presentation.pdf` — *Query-Level Optimization in PostgreSQL*, 50 slides. Structure preserved slide for slide: hook → scenario →
data model → path; the three levels and the planner; EXPLAIN / ANALYZE /
BUFFERS, node anatomy, the smell checklist, scan and join vocabulary, the
"before" plan; six free-win tricks; CTEs (syntax, inlining, the trap); indexing
(the idea, five access methods each opened up, composite, special shapes, when,
cost, syntax, which to pick, the functional-index trap, the victory lap); the
workflow, homework and close.
