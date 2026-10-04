/* =====================================================================
   Deck — Query-Level Optimization, live-code edition.
   Every plan on screen comes from PLANS (plans.js), which build/capture.py
   records by running the query against the shopeasy database.
   ===================================================================== */
const card = (k,t,p,cls='',ico='') =>
  `<div class="card ${cls}">${ico?`<span class="ico">${ico}</span>`:''}
     <h4>${k}</h4><h3>${t}</h3><p>${p}</p></div>`;

const quiz = (qs, st, cols=1) => `<div class="quiz-head">${sceneThink()}<p class="lede">Answer out loud before the next press &mdash; then we check it against the plan.</p></div><div class="qa" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">
  ${qs.map((q,i) => st >= 2*i ? `<div class="q pop"><h3><span>Q${i+1}</span>${q[0]}</h3>
     ${st >= 2*i+1 ? `<p class="pop">&rarr; ${q[1]}</p>` : `<p class="wait">…</p>`}</div>` : '').join('')}</div>`;
const quizSteps = (qs, intro) => qs.flatMap((q,i) => [
  {note:(i === 0 && intro ? intro + ' ' : '') + 'Read it out and wait for hands. Do not answer it yourself.'},
  {note:q[2] || ('Answer: ' + q[1].replace(/<[^>]+>/g,''))}]);

/* ---------- reading the captures ---------- */
const P  = id => PLANS[id] || {text:'(not captured — run build/capture.py)', sql:'', mode:'raw', ms:null};
const MS = id => P(id).ms;
function fmt(v){
  if(v == null) return '—';
  if(v >= 1000) return Math.round(v).toLocaleString('en-IN') + ' ms';
  if(v >= 100)  return Math.round(v) + ' ms';
  if(v >= 10)   return v.toFixed(1) + ' ms';
  if(v >= 1)    return v.toFixed(2) + ' ms';
  return v.toFixed(3) + ' ms';
}
function times(a, b){
  const x = a / b;
  return x >= 100 ? Math.round(x).toLocaleString('en-IN') + '&times;' : x >= 10 ? Math.round(x) + '&times;' : x.toFixed(1) + '&times;';
}
const PREFIX = {analyze:'EXPLAIN ANALYZE', explain:'EXPLAIN', buffers:'EXPLAIN (ANALYZE, BUFFERS)', raw:''};

/* Print a captured plan. marks = {bad:[], good:[], key:[]} of strings or
   RegExps; brief drops the cost=a..b part so long nodes fit one line. */
function plan(id, marks = {}, o = {}){
  let t = P(id).text;
  if(o.brief) t = t.replace(/cost=[\d.]+\.\.[\d.]+ /g, '');
  if(o.bare)  t = t.replace(/\s*\((cost|rows|actual)[^)]*\)/g, '');
  if(o.lean)  t = t.replace(/\(rows=\d+ width=\d+\) /g, '').replace(/time=[\d.]+\.\.[\d.]+ /g, '');
  if(o.only)  t = t.split('\n').filter((l, i) => o.only(l, i)).join('\n');
  const spans = [];
  for(const cls of ['bad','good','key']) for(const m of (marks[cls] || [])){
    const re = m instanceof RegExp ? new RegExp(m.source, 'g') : new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    let r; while((r = re.exec(t))){ spans.push([r.index, r.index + r[0].length, cls]); if(!r[0].length) re.lastIndex++; }
  }
  spans.sort((a, b) => a[0] - b[0]);
  let html = '', at = 0;
  for(const [s, e, cls] of spans){
    if(s < at) continue;
    html += esc(t.slice(at, s)) + `<mark class="${cls}">${esc(t.slice(s, e))}</mark>`;
    at = e;
  }
  html += esc(t.slice(at));
  html = html.split('\n').map((l, i) => {
    const cls = /ERROR/.test(l) ? ' err' : /Execution Time/.test(l) ? ' xt' : '';
    return `<span class="pl${cls}" style="animation-delay:${Math.min(i * 45, 900)}ms">${l || ' '}</span>`;
  }).join('');
  return `<pre class="plan out ${o.size || ''}">${html}</pre>`;
}

/* the psql prompt + the query. show = the SQL as set on the slide, with
   [[mark]] / [[!bad]] highlights; defaults to the captured text. */
function run(id, o = {}){
  const c = P(id), pre = o.prefix != null ? o.prefix : PREFIX[c.mode];
  return `<div class="run">
    <div class="prompt">shopeasy=#${pre ? ` <b>${pre}</b>` : ''}${o.go ? '<span class="go">run</span>' : ''}</div>
    ${sql(o.show || c.sql, o.sqlSize || 'sm')}</div>`;
}
const badge = (id, cls, label='Execution time') => MS(id) == null ? '' :
  `<div class="msb ${cls} pop">${label} <b>${fmt(MS(id))}</b></div>`;
const race = (a, b, cls='') => `<div class="race ${cls} pop"><span class="from">${fmt(a)}</span><span class="arr">&rarr;</span>
  <span class="to">${fmt(b)}</span><span class="x">${times(a, b)} less time</span></div>`;

/* =====================================================================
   Infographics — small drawings that explain the idea while the query
   is on screen. None of them adds a step; each rides an existing one.
   ===================================================================== */
const swap = (svg, pairs) => pairs.reduce((s, [a, b]) => s.split(a).join(b), svg);
const loopsScene = st => swap(sceneLoops(st), [['2,000,000', '200,000']]);
const statsScene = st => swap(sceneStats(st), [['rows=100', 'rows≈2,200'], ['2,000,000', '300,000']]);
const trapScene  = st => swap(sceneTrap(st),  [['20,000,000 rows', '2,000,000 rows']]);

/* before vs after as two bars on a log scale */
function speed(a, b){
  const w = v => Math.min(100, Math.max(1.2, (Math.log10(v) + 3) / 7.3 * 100));
  return `<div class="speed pop">
    <div class="sp bad"><span>before</span><i style="--w:${w(a).toFixed(1)}%"></i><b>${fmt(a)}</b></div>
    <div class="sp good"><span>after</span><i style="--w:${w(b).toFixed(1)}%"></i><b>${fmt(b)}</b></div>
    <span class="x">${times(a, b)}<small>less time</small></span></div>`;
}
/* horizontal bars for sizes or counts; v in any unit, scaled linearly or by log */
function hbars(rows, log){
  const max = Math.max(...rows.map(r => r[1]));
  const w = v => log ? Math.max(2, Math.log10(v + 1) / Math.log10(max + 1) * 100) : Math.max(1, v / max * 100);
  return `<div class="hbars pop">${rows.map((r, i) => `<div class="hb ${r[3] || ''}"><span>${r[0]}</span>
    <i style="--w:${w(r[1]).toFixed(1)}%;animation-delay:${i * 150}ms"></i><b>${r[2]}</b></div>`).join('')}</div>`;
}
const chips = (items, on = -1) => `<div class="chips">${items.map((c, i) =>
  (i ? '<span class="chip-arr">&rarr;</span>' : '') +
  `<div class="chip pop d${i + 1} ${i === on ? 'on' : ''}">${ico(c[0])}<span><b>${c[1]}</b><br>${c[2]}</span></div>`).join('')}</div>`;

/* box + label helper for the small scenes */
const bx = (x, y, w, h, t, o = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${o.fill || 'var(--card)'}"
    stroke="var(--ink)" stroke-width="2.4" ${o.cls ? `class="${o.cls}"` : ''}/>
  ${t ? `<text class="t-lbl" x="${x + w / 2}" y="${y + h / 2 + 6}" text-anchor="middle" style="font-size:${o.fs || 17}px;${o.tc ? 'fill:' + o.tc : ''}">${t}</text>` : ''}`;
const arrow = (d, col = 'var(--ink)') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="2.6" stroke-linecap="round" marker-end="url(#ah)"/>`;
const AH = `<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
  <path d="M0,0 L10,5 L0,10 z" fill="var(--ink)"/></marker></defs>`;
const ban = (cx, cy) => `<g class="sv-pop"><circle cx="${cx}" cy="${cy}" r="16" fill="var(--flame-soft)" stroke="var(--flame)" stroke-width="3.2" class="nofx"/>
  <path d="M${cx - 11},${cy - 11} L${cx + 11},${cy + 11}" stroke="var(--flame)" stroke-width="3.2"/></g>`;
const tick = (cx, cy) => `<g class="sv-pop"><circle cx="${cx}" cy="${cy}" r="16" fill="var(--leaf-soft)" stroke="var(--leaf)" stroke-width="3.2" class="nofx"/>
  <path d="M${cx - 8},${cy} l6,6 l10,-12" fill="none" stroke="var(--leaf)" stroke-width="3.4" stroke-linecap="round"/></g>`;

/* sargable: the index is keyed on the bare column */
function sceneSarg(step, o){
  let g = AH + `<text class="t-lbl" x="300" y="22" text-anchor="middle" style="font-size:16px;fill:var(--muted)">${o.idx}</text>`;
  o.keys.forEach((k, i) => g += bx(200, 34 + i * 34, 200, 30, k, {fs:14, fill: i === o.hit ? 'var(--amber)' : 'var(--card)'}));
  g += `<g class="sv-rise">${bx(10, 210, 250, 40, o.bad, {fs:15, fill:'var(--flame-soft)'})}</g>
    <path d="M135,210 C135,180 150,160 166,156" fill="none" stroke="var(--flame)" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="6 6"/>${ban(182, 152)}
    <text class="t-sub" x="135" y="276" text-anchor="middle" style="font-size:14px;fill:var(--flame-ink)">no key looks like this &rarr; Seq Scan</text>`;
  if(step >= 1) g += `<g class="sv-rise">${bx(340, 210, 250, 40, o.good, {fs:15, fill:'var(--leaf-soft)'})}
    ${arrow(`M465,210 C465,180 440,${54 + o.hit * 34} 404,${49 + o.hit * 34}`, 'var(--leaf)')}</g>${tick(500, 180)}
    <text class="t-sub sv-fade" x="465" y="276" text-anchor="middle" style="font-size:14px;fill:var(--leaf)">matches the key &rarr; Index Scan</text>`;
  return SV('0 0 600 290', g);
}

/* a sort that does not fit in work_mem spills to disk */
function sceneSpill(step){
  let g = AH + bx(20, 30, 200, 120, '', {fill:'var(--pencil-soft)'}) +
    `<text class="t-lbl" x="120" y="22" text-anchor="middle" style="font-size:16px">work_mem = 1 MB</text>`;
  for(let i = 0; i < 6; i++) g += `<rect x="34" y="${44 + i * 16}" width="172" height="11" rx="2" fill="var(--flame)" class="nofx sv-fade" ${D(i * 60)}/>`;
  g += arrow('M220,90 C280,90 290,130 330,140', 'var(--flame)') +
    `<g class="sv-rise"><ellipse cx="420" cy="122" rx="80" ry="18" fill="var(--flame-soft)" stroke="var(--ink)" stroke-width="2.4"/>
      <path d="M340,122 V200 C340,212 376,222 420,222 C464,222 500,212 500,200 V122" fill="var(--flame-soft)" stroke="var(--ink)" stroke-width="2.4"/>
      <text class="t-lbl" x="420" y="178" text-anchor="middle" style="font-size:16px">temp files on disk</text></g>
    <text class="t-sub" x="120" y="176" text-anchor="middle" style="font-size:14px;fill:var(--flame-ink)">2M rows don't fit &rarr; external merge</text>`;
  if(step >= 1) g += `<g class="sv-rise">${bx(20, 210, 300, 60, 'work_mem = 256 MB · quicksort in memory', {fs:14, fill:'var(--leaf-soft)'})}</g>${tick(340, 240)}`;
  return SV('0 0 520 280', g);
}

/* OR across tables: join everything then filter, vs two index seeks */
function sceneUnion(step){
  let g = AH + `<g>${bx(10, 20, 150, 46, 'orders · 2M', {fs:15})}${bx(10, 80, 150, 46, 'customers · 200k', {fs:15})}</g>
    ${arrow('M160,43 C200,43 200,70 228,72')}${arrow('M160,103 C200,103 200,80 228,78')}
    ${bx(232, 50, 120, 50, 'Hash Join', {fs:15, fill:'var(--flame-soft)'})}${arrow('M352,75 L392,75', 'var(--flame)')}
    ${bx(396, 50, 120, 50, 'OR filter', {fs:15, fill:'var(--flame-soft)'})}
    <text class="t-sub" x="456" y="124" text-anchor="middle" style="font-size:13px;fill:var(--flame-ink)">2M joined, 17 kept</text>`;
  if(step >= 1) g += `<g class="sv-rise">
    ${bx(10, 160, 150, 40, 'email index', {fs:14, fill:'var(--leaf-soft)'})}${bx(10, 214, 150, 40, 'primary key', {fs:14, fill:'var(--leaf-soft)'})}
    ${arrow('M160,180 L232,190', 'var(--leaf)')}${arrow('M160,234 L232,214', 'var(--leaf)')}
    ${bx(236, 180, 120, 46, 'UNION', {fs:16, fill:'var(--amber)'})}${arrow('M356,203 L396,203', 'var(--leaf)')}
    ${bx(400, 180, 116, 46, '17 rows', {fs:16, fill:'var(--leaf-soft)'})}
    <text class="t-sub" x="160" y="276" text-anchor="middle" style="font-size:13px;fill:var(--leaf)">each branch seeks its own index</text></g>`;
  return SV('0 0 520 285', g);
}

/* show 20, don't sort 2,000,000 */
function sceneFunnel(step){
  let g = AH;
  for(let i = 0; i < 12; i++) g += `<rect x="20" y="${20 + i * 18}" width="150" height="13" rx="2" fill="var(--pencil-soft)" stroke="var(--ink)" stroke-width="1.4" class="nofx"/>`;
  g += `<text class="t-lbl" x="95" y="252" text-anchor="middle" style="font-size:15px">2,000,000 orders</text>
    ${arrow('M175,120 L230,120')}${bx(234, 92, 120, 56, 'Sort', {fs:18, fill: step >= 1 ? 'var(--leaf-soft)' : 'var(--flame-soft)'})}
    <text class="t-sub" x="294" y="168" text-anchor="middle" style="font-size:13px;fill:${step >= 1 ? 'var(--leaf)' : 'var(--flame-ink)'}">${step >= 1 ? 'top-N heapsort · 27 kB' : 'all of it · 57 MB on disk'}</text>
    ${arrow('M354,120 L404,120')}`;
  if(step < 1) g += `<g class="sv-rise">${bx(408, 60, 100, 120, '', {fill:'var(--flame-soft)'})}
      <text class="t-lbl" x="458" y="112" text-anchor="middle" style="font-size:15px">2M rows</text>
      <text class="t-lbl" x="458" y="134" text-anchor="middle" style="font-size:15px">to the app</text></g>
      <text class="t-sub" x="458" y="206" text-anchor="middle" style="font-size:13px">app shows 20</text>`;
  else g += `<g class="sv-pop">${bx(408, 96, 100, 48, '20 rows', {fs:17, fill:'var(--leaf-soft)'})}</g>`;
  return SV('0 0 520 265', g);
}

/* a needless node in the plan tree */
function sceneNode(step){
  let g = AH + `<g class="sv-rise">${bx(150, 20, 220, 54, 'HashAggregate', {fs:18, fill:'var(--flame-soft)'})}</g>
    ${arrow('M260,130 L260,80')}${bx(150, 134, 220, 54, 'Seq Scan on orders', {fs:16})}
    <text class="t-sub" x="260" y="214" text-anchor="middle" style="font-size:13px">order_id is the primary key &mdash; already unique</text>`;
  if(step >= 1) g += `<path d="M140,14 L380,82 M380,14 L140,82" stroke="var(--flame)" stroke-width="5" stroke-linecap="round" class="sv-draw" style="--len:260"/>`;
  return SV('0 0 520 225', g);
}

/* BEGIN … ROLLBACK as a timeline */
function sceneTxn(step){
  let g = AH + `<path d="M20,120 H500" stroke="var(--line)" stroke-width="6" stroke-linecap="round"/>
    ${bx(20, 92, 90, 56, 'BEGIN', {fs:17, fill:'var(--pencil-soft)'})}
    <g class="sv-rise">${bx(170, 80, 170, 80, '', {fill:'var(--flame-soft)'})}
      <text class="t-lbl" x="255" y="114" text-anchor="middle" style="font-size:16px">UPDATE runs</text>
      <text class="t-lbl" x="255" y="140" text-anchor="middle" style="font-size:15px;fill:var(--flame-ink)">1,000 rows changed</text></g>`;
  if(step >= 1) g += `<g class="sv-rise">${bx(400, 92, 110, 56, 'ROLLBACK', {fs:16, fill:'var(--leaf-soft)'})}
      ${arrow('M455,160 C455,220 120,220 70,160', 'var(--leaf)')}
      <text class="t-sub" x="260" y="236" text-anchor="middle" style="font-size:14px;fill:var(--leaf)">back to how it was &mdash; but you got the real plan</text></g>`;
  return SV('0 0 520 250', g);
}

/* covering: the amount travels inside the index entry */
function sceneCover(step){
  let g = AH + `<text class="t-lbl" x="130" y="22" text-anchor="middle" style="font-size:15px">index entry</text>
    ${bx(30, 34, 200, 44, 'customer_id 1024', {fs:15})}
    ${arrow('M230,56 C290,56 300,120 340,128', 'var(--flame)')}
    <g>${bx(344, 100, 160, 110, '', {fill:'var(--pencil-soft)'})}<text class="t-lbl" x="424" y="160" text-anchor="middle" style="font-size:16px">table page</text></g>
    <text class="t-sub" x="424" y="232" text-anchor="middle" style="font-size:13px;fill:var(--flame-ink)">one trip per row for total_amount</text>`;
  if(step >= 1) g += `<g class="sv-rise">${bx(30, 150, 120, 44, 'customer_id 1024', {fs:13})}${bx(150, 150, 110, 44, '₹7,499', {fs:15, fill:'var(--leaf-soft)'})}
      <text class="t-sub" x="145" y="216" text-anchor="middle" style="font-size:13px;fill:var(--leaf)">INCLUDE carries it &mdash; no trip</text></g>${ban(300, 128)}`;
  return SV('0 0 520 245', g);
}

/* three tables, sized, joined */
function sceneJoin3(step){
  let g = AH + bx(20, 40, 170, 70, '', {fill:'var(--flame-soft)'}) +
    `<text class="t-serif" x="105" y="72" text-anchor="middle" style="font-size:20px">order_items</text>
     <text class="t-lbl" x="105" y="98" text-anchor="middle" style="font-size:14px">6,000,000 rows</text>
     ${arrow('M190,75 L252,75')}${bx(256, 40, 130, 70, '', {fill:'var(--pencil-soft)'})}
     <text class="t-serif" x="321" y="72" text-anchor="middle" style="font-size:20px">orders</text>
     <text class="t-lbl" x="321" y="98" text-anchor="middle" style="font-size:14px">2,000,000</text>
     ${arrow('M105,110 L105,160')}${bx(30, 164, 150, 60, '', {fill:'var(--pencil-soft)'})}
     <text class="t-serif" x="105" y="192" text-anchor="middle" style="font-size:19px">products</text>
     <text class="t-lbl" x="105" y="214" text-anchor="middle" style="font-size:14px">50,000</text>
     <text class="t-sub" x="330" y="150" text-anchor="middle" style="font-size:14px">filter: last month only</text>
     <text class="t-sub" x="330" y="172" text-anchor="middle" style="font-size:14px">&asymp; 1 in 36 orders</text>
     <text class="t-sub" x="330" y="210" text-anchor="middle" style="font-size:14px;fill:var(--flame-ink)">order_items.order_id: FK, no index</text>`;
  return SV('0 0 420 240', g);
}

/* how a plan reaches the slide */
function scenePipeline(step){
  const N = [['SQL', 'the query'], ['capture.py', 'runs it'], ['PostgreSQL', 'shopeasy'], ['plans.js', 'real output'], ['slide', 'you see it']];
  let g = AH;
  N.forEach((n, i) => {
    const x = 10 + i * 200, on = (step === 0 && i < 2) || (step === 1 && i >= 1 && i < 4) || step >= 2;
    if(i) g += arrow(`M${x - 40},60 L${x - 4},60`);
    g += `<g class="sv-rise" ${D(i * 90)}>${bx(x, 30, 150, 60, n[0], {fs:19, fill: on ? 'var(--amber)' : 'var(--card)'})}
      <text class="t-sub" x="${x + 75}" y="118" text-anchor="middle" style="font-size:15px">${n[1]}</text></g>`;
  });
  return SV('0 0 1000 130', g);
}

/* a checkpoint: three students thinking */
function sceneThink(){
  let g = '';
  ['aarav','diya','rohan'].forEach((k, i) => {
    const x = 10 + i * 120;
    g += `<g class="sv-rise" ${D(i * 120)}><svg x="${x}" y="70" width="100" height="100" viewBox="0 0 100 100">${face(k)}</svg>
      <circle cx="${x + 70}" cy="34" r="26" fill="var(--card)" stroke="var(--ink)" stroke-width="2.2"/>
      <circle cx="${x + 56}" cy="66" r="5" fill="var(--card)" stroke="var(--ink)" stroke-width="1.8"/>
      <text class="t-big" x="${x + 70}" y="46" text-anchor="middle" style="font-size:32px">?</text></g>`;
  });
  return SV('0 0 370 175', g);
}

/* the dashboard list, with real faces and spend */
function dashFaces(){
  return [['diya','Diya Menon','₹12,250'],['aarav','Aarav Sharma','₹10,698'],['rohan','Rohan Iyer','—']];
}

/* chapter-card art */
const CH_ART = {
  1: st => sceneSale(2),
  2: st => scenePlanner(3),
  3: st => sceneSeqScan(1),
  4: st => sceneRoad(1),
  5: st => sceneCTEFlow(3),
  6: st => sceneBook(1),
  7: st => sceneBars([{label:'original', ms:10000, txt:'timeout'}, {label:'CTE', ms:MS('cte_good'), good:true},
                      {label:'+ index', ms:MS('v2_good'), good:true}], 9, true)
};

/* a raw psql result → array of cell arrays (header dropped) */
const rawRows = id => P(id).text.split('\n').filter(l => l.includes('|') && !/^\s*-/.test(l)).slice(1)
  .map(l => l.split('|').map(c => c.trim()));
const toKB = t => { const m = t.match(/([\d.]+)\s*(kB|MB|GB|bytes)/); if(!m) return 0;
  return +m[1] * ({bytes:1/1024, kB:1, MB:1024, GB:1048576})[m[2]]; };

const TRIM = l => !/Buckets:|Batches:|Hash Cond:|Recheck Cond:|Heap Blocks:|Sort Key:|Group Key:|Memory Usage: \d+kB\s*$/.test(l);

/* ---------- the scenario slide: ✕ query, its plan, ✓ query, its plan, the tell ----------
   steps: 0 ✕ SQL · 1 ✕ plan · 2 ✓ SQL · 3 ✓ plan · 4 the tell                        */
function versus(o){
  const B = o.bad, G = o.good;
  const col = (x, st, from, cls, mark) => { cls = x.cls || cls; mark = x.cls ? (x.cls === 'good' ? '&check;' : '&#10005;') : mark;
    return `<div class="${st > from ? '' : 'pop'}">
      <span class="verdict ${cls}">${mark} ${x.label}</span>
      ${run(x.id, {show:x.show, prefix:x.prefix})}
      ${st >= from + 1 ? plan(x.id, x.marks, {brief:x.brief !== false, lean:o.lean, size:x.size || o.size, only:x.only || (o.trim ? TRIM : null)}) + (o.noBadge ? '' : badge(x.id, cls)) : ''}</div>`; };
  return {
    id:o.id, kick:o.kick, eyebrow:o.eyebrow, title:o.title, tag:o.tag || 'scenario',
    steps:o.notes.map(n => ({note:n})),
    body:(st)=>`${o.why ? `<p class="lede">${o.why}</p>` : ''}
      <div class="pair">${col(B, st, 0, 'bad', '&#10005;')}
        ${st >= 2 ? col(G, st, 2, 'good', '&check;') : (o.art ? `<div class="art ${st ? '' : 'pop'}">${o.art(st)}</div>` : '<div></div>')}</div>
      ${st >= 4 ? `<div class="foot pop">${tell('Plan tell', o.tell)}
        ${!o.noRace && MS(B.id) != null && MS(G.id) != null ? speed(MS(B.id), MS(G.id)) : ''}</div>` : ''}`
  };
}

/* ---------- a log-scale race between timings ---------- */
function sceneBars(rows, step, narrow){
  const lo = -3, hi = 4.2;                                   // 0.001 ms … ~16 s
  const VW = narrow ? 560 : 1000, x0 = narrow ? 200 : 300, W = narrow ? 270 : 640;
  const fs = narrow ? 1.25 : 1;
  const wOf = v => Math.max(4, (Math.log10(v) - lo) / (hi - lo) * W);
  let g = '';
  [0.01, 1, 100, 10000].forEach(v => {
    const x = x0 + wOf(v);
    g += `<path d="M${x},6 V${rows.length * 46 + 6}" stroke="var(--line)" stroke-width="1.5" stroke-dasharray="4 5"/>
      <text class="t-sub" x="${x}" y="${rows.length * 46 + 26}" text-anchor="middle" style="font-size:${13*fs}px">${v >= 1 ? v.toLocaleString('en-IN') : v} ms</text>`;
  });
  rows.forEach((r, i) => {
    if(step < (r.at || 0)) return;
    const y = 12 + i * 46, w = wOf(r.ms);
    g += `<g class="sv-rise" ${D(i * 90)}>
      <text class="t-lbl" x="${x0 - 12}" y="${y + 23}" text-anchor="end" style="font-size:${16*fs}px">${r.label}</text>
      <rect x="${x0}" y="${y}" width="${w}" height="30" fill="${r.good ? 'var(--leaf)' : 'var(--flame)'}" stroke="var(--ink)"
            stroke-width="1.8" class="sv-growx nofx" ${D(120 + i * 90)}/>
      <text class="t-serif" x="${x0 + w + 8}" y="${y + 24}" style="font-size:${20*fs}px;fill:${r.good ? 'var(--leaf)' : 'var(--flame-ink)'}">${r.txt || fmt(r.ms)}</text></g>`;
  });
  return SV(`0 0 ${VW} ${rows.length * 46 + 34}`, g);
}

/* ---------- the dashboard dying, with the real timeout ---------- */
function sceneDied(step){
  let g = `<rect x="20" y="10" width="460" height="230" rx="4" class="box"/>
    <text class="t-serif" x="462" y="50" text-anchor="end" style="font-size:26px">Top Customers This Month</text>
    <path d="M42,66 H458" stroke="var(--line)" stroke-width="2"/>`;
  g += `<g transform="translate(36,20) scale(.85)">${LOGO_PATH}</g><text class="t-sub" x="66" y="40" style="font-size:13px">ShopEasy &middot; Marketing</text>`;
  dashFaces().forEach((f,i) => g += `<g opacity="${step < 1 ? .9 : .4}"><svg x="56" y="${80+i*30}" width="28" height="28" viewBox="0 0 100 100">${face(f[0])}</svg>
    <text class="t-lbl" x="92" y="${100+i*30}" style="font-size:15px">${f[1]}</text>
    <text class="t-mono" x="440" y="${100+i*30}" text-anchor="end" style="font-size:13px">${f[2]}</text></g>`);
  if(step < 1) g += `<circle cx="250" cy="180" r="28" fill="none" stroke="var(--pencil-2)" stroke-width="6"
      stroke-dasharray="120 60" stroke-linecap="round" class="sv-spin nofx"/>
    <text class="t-sub" x="250" y="230" text-anchor="middle" style="font-size:18px">running…</text>`;
  else g += `<g class="sv-pop"><circle cx="250" cy="176" r="28" fill="var(--flame)" stroke="var(--ink)" stroke-width="2.4" class="sv-hot"/>
      <path d="M239,165 L261,187 M261,165 L239,187" stroke="var(--on-flame)" stroke-width="5" stroke-linecap="round"/></g>
    <text class="t-lbl sv-fade" x="250" y="228" text-anchor="middle" style="fill:var(--flame-ink);font-size:20px">canceled after 10,000 ms</text>`;
  if(step >= 2) g += `<g class="sv-rise">
      <text class="t-lbl" x="20" y="290" style="font-size:21px">SubPlan 1 &mdash; Seq Scan of 2M orders</text>
      <text class="t-lbl" x="20" y="322" style="font-size:21px">SubPlan 2 &mdash; the same scan, again</text>
      <text class="t-sub" x="20" y="352" style="font-size:18px">&hellip; for each of 200,000 customers</text>
      <text class="t-big" x="20" y="404" style="fill:var(--flame-ink);font-size:34px">&asymp; 800 billion rows read</text>
      <text class="t-sub" x="20" y="436" style="font-size:17px">planner's own estimate: cost 15,115,762,534</text></g>`;
  return SV('0 0 500 450', g);
}

/* =====================================================================
   The story spine
   ===================================================================== */
const CHAPTERS = [
 {n:1, t:'The dashboard that died',      of:['title','how','setup','died','path']},
 {n:2, t:'Meet the planner',             of:['qab']},
 {n:3, t:'Reading the execution plan',   of:['three','anatomy','rollback','spill','scans','before','quiz2']},
 {n:4, t:'The free wins',                of:['t1','t2','t2d','t3','t4','t4x','t5','t5d','t6','quiz3']},
 {n:5, t:'Common Table Expressions',     of:['cte','twice','trap','quiz4']},
 {n:6, t:'Indexing: give it a shortcut', of:['btree','btlimit','hash','gin','gist','brin','composite','partial','expr','cover',
                                             'selectivity','writecost','victory','quiz5']},
 {n:7, t:'The scoreboard',               of:['scoreboard','corrections','homework','hwfix','workflow','thanks']}
];

const OPENERS = {
 2:{when:'Segment 1 · 6 minutes',
    problem:'We never told the database to scan the whole table.',
    detail:'The planner chose that. From here on we do not guess — we type EXPLAIN in front of the query and read what it decided.',
    next:'First run: two queries that return the same rows.'},
 3:{when:'Segment 2 · 15 minutes',
    problem:'You cannot optimize what you cannot see.',
    detail:'Three commands — EXPLAIN, EXPLAIN ANALYZE, and BUFFERS. Every plan on these slides is the real output from the shopeasy database.',
    next:'Learn to read one node, and every later slide reads itself.'},
 4:{when:'Segment 3 · 15 minutes',
    problem:'Some of the slowness is in how the SQL is written.',
    detail:'Six rewrites, no schema change. Each slide runs the ✕ query, then the ✓ query, and the plan shows exactly what changed.',
    next:'Run the bad one first. Always measure before you fix.'},
 5:{when:'Segment 4 · 10 minutes',
    problem:'The real dashboard query is the one that died.',
    detail:'Two copies of the same SUM, each a correlated subquery. A CTE names the work once — and we will run both.',
    next:'And one CTE that makes things far worse.'},
 6:{when:'Segment 5 · 17 minutes',
    problem:'No rewrite removes that last Seq Scan.',
    detail:'Every index on the next slides is created live, measured, and dropped again — so each one is judged on its own.',
    next:'CREATE INDEX, re-run, read the plan.'},
 7:{when:'Wrap-up',
    problem:'Every number tonight came from a plan you watched print.',
    detail:'Here they are side by side — and the places where running the code corrected the slides.',
    next:'Then the homework, already measured.'}
};

function chapterBody(ch, st){
  const o = OPENERS[ch.n] || {};
  return `<div class="chapter">
    <div class="ch-rail"><span class="ch-num">${String(ch.n).padStart(2,'0')}</span>
      <span class="ch-of">Chapter ${ch.n} of ${CHAPTERS.length}</span></div>
    <div class="ch-body">
      <div class="ch-when">${o.when||''}</div>
      <h2 class="ch-title">${ch.t}</h2>
      ${st>=1?`<p class="ch-problem pop">${o.problem||''}</p>`:''}
      ${st>=2?`<p class="ch-detail pop">${o.detail||''}</p>`:''}
      ${st>=3?`<p class="ch-next pop">${o.next||''}</p>`:''}
    </div>${CH_ART[ch.n] ? `<div class="ch-art">${CH_ART[ch.n](st)}</div>` : ''}</div>`;
}

const Q2 = [
  ['<code>cost=0.00..41676.00</code> on our Seq Scan — what are the two numbers?', 'startup cost .. total cost, in the planner\'s units.'],
  ['Trick 6 showed <code>rows=2201</code> estimated, <code>rows=300000</code> actual. First suspect?', 'stale statistics → <code>ANALYZE</code>.'],
  ['<code>Rows Removed by Filter: 1991491</code> to return 8,509 rows. Good or bad, and the fix?', 'bad — filter earlier, or give it an index.']];
const Q3 = [
  ['<code>WHERE LOWER(email)=…</code> ran a Seq Scan though <code>email</code> has a unique index. Why, and two fixes?',
   'a function on the column. Compare the bare column, or build an expression index on <code>LOWER(email)</code>.'],
  ['The SubPlan showed <code>loops=10</code> at ~55 ms each. For 200,000 customers?', '~3 hours. A correlated subquery runs once per outer row.'],
  ['Which of the six tricks changed the result set?', 'none — that was the rule. Column pruning changes columns shown, never rows.']];
const Q4 = [
  ['The dashboard CTE is referenced once. Inlined or materialized?', 'inlined — no CTE Scan node in its plan.'],
  ['When is <code>MATERIALIZED</code> clearly right?', 'an expensive block referenced more than once — 396 ms → 199 ms on our run.'],
  ['<code>MATERIALIZED</code> made an id lookup take ~200 ms. Why?', 'the filter cannot push into the materialized block; it read all 2M rows.']];
const Q5 = [
  ['<code>(customer_id, order_date)</code> — can <code>WHERE order_date &gt; x</code> <i>seek</i> into it?', 'No — leftmost-prefix rule. At best the planner reads the whole index, as the victory lap showed.'],
  ['Index type for a <code>tags text[]</code> column?', 'GIN.'],
  ['Why <code>CREATE INDEX CONCURRENTLY</code> in production?', 'it does not block writes while it builds.'],
  ['What plan line proves a covering index worked?', '<code>Index Only Scan</code> with <code>Heap Fetches</code> near 0.']];

const DECK = [
/* ================= 1 · the dashboard that died ================= */
{ id:'title', kick:'every plan on these slides is real output', eyebrow:'PostgreSQL · live code', title:'Query-Level Optimization',
  tag:'intro', steps:[
  {note:'Same lecture as the slides, but driven by code. Our company is ShopEasy, and today is Black Friday — up to seventy percent off, orders pouring in. Every query you will see, I ran against a copy of that database. Every plan is what PostgreSQL printed back.'},
  {note:'The numbers behind the banner: ten times a normal day, thirty-two hundred orders a minute. And marketing\'s dashboard just died under it. The promise: make that query fast, without touching the data.'}],
  body:(st)=>`<div class="two">
    <div class="hero">
      <div class="brand-row"><span class="by">live code &middot; case study</span>${brand()}<span class="sticker">Black Friday</span></div>
      <div class="big" style="font-size:2.7rem">Make the <em>slow query</em><br>fast. Watch the plan.</div>
      <div class="sub" style="font-size:.85rem">Same rows out, same result. We change the SQL and the indexes &mdash; and run every change.</div>
      ${st>=1?`<div class="race pop"><span class="from">timeout</span><span class="arr">&rarr;</span><span class="to">${fmt(MS('v2_good'))}</span></div>`:''}
    </div>
    <div class="stage-row">${sceneSale(st>=1?2:0)}</div></div>
    ${st>=1?`<div class="stats pop" style="--n:4">
      <div class="stat warn"><div class="k">Orders today<span class="live"></span></div><div class="v">1,84,320</div><div class="s">10&times; a normal day</div></div>
      <div class="stat warn"><div class="k">Peak</div><div class="v">3,200<span style="font-size:.5em">/min</span></div><div class="s">orders per minute</div></div>
      <div class="stat"><div class="k">Customers online</div><div class="v">58,400</div><div class="s">across 214 cities</div></div>
      <div class="stat good"><div class="k">Sales today</div><div class="v">₹42.6 Cr</div><div class="s">and the dashboard just died</div></div></div>`:''}` },

{ id:'how', kick:'how this deck works', eyebrow:'Before we start', title:'Nothing here is typed by hand',
  tag:'method', steps:[
  {note:'Each slide has a psql prompt and a query. On the next press, the plan streams in — that is the actual output, captured from the shopeasy database.'},
  {note:'build/capture.py runs all of them in order and writes plans.js. Change a query, re-run it, and the slide changes with it. You can do the same at home.'},
  {note:'One honest caveat. The deck you saw says 20 million orders. This database has 2 million — one tenth — so a laptop can build it in a minute. Times are about a tenth; the plans and the ratios are the same.'}],
  body:(st)=>`<div class="strip">${scenePipeline(st)}</div>
    <div class="cards" style="grid-template-columns:repeat(3,minmax(0,1fr))">
      <div class="pop">${card('On every slide','Prompt → query → plan','Press once for the query, again to <b>run it</b>. The plan streams in exactly as psql printed it.','tl',ico('search'))}</div>
      ${st>=1?`<div class="pop">${card('Reproducible','build/capture.py',`Runs ${Object.keys(PLANS).length} queries against <code>shopeasy</code> and writes <code>plans.js</code>. PostgreSQL ${PLAN_META.server.split(' ')[0]}, captured ${PLAN_META.captured}.`,'good',ico('db'))}</div>`:'<div></div>'}
      ${st>=2?`<div class="pop">${card('Honest scale','1/10 of the slides','2M orders, not 20M. Times run ~10&times; smaller; plan shapes and before/after ratios hold.','warn',ico('gauge'))}</div>`:'<div></div>'}
    </div>` },

{ id:'setup', kick:'00_setup.sql', eyebrow:'The data model, built', title:'ShopEasy, at one tenth scale',
  tag:'data', steps:[
  {note:'The four tables from the slides, generated with generate_series and a fixed random seed — so your numbers will match mine. And three customers we will follow: Aarav, Diya, Rohan — with their real Black Friday orders.'},
  {note:'And here is what is on disk. Six million order items, two million orders. Only primary keys exist — and a unique index on email. No index on any foreign key: PostgreSQL never makes those for you.'}],
  body:(st)=>`<div class="two">
      <div class="stack">${sql(`-- 2M orders over the last 3 years, up to today
INSERT INTO orders
SELECT g,
       1 + floor(random() * 200000),       -- customer
       CURRENT_DATE - floor(random() * 1095)::int,
       CASE WHEN r < 0.95 THEN 'delivered' ... END,
       round((99 - ln(1 - random()) * 900)::numeric, 2)
FROM generate_series(1, 2000000) g;

ALTER TABLE orders ADD FOREIGN KEY ([[!customer_id]])
  REFERENCES customers;   -- no index is created for it`,'sm')}
        <p class="art-cap">the three customers we follow all lecture</p>${custCards(1)}</div>
      <div class="stack">${st>=1?run('sizes')+hbars(rawRows('sizes').map(c=>[c[0], +c[1].replace(/,/g,''), c[1]+' rows', /order/.test(c[0])?'bad':''])) +
        hbars(rawRows('sizes').map(c=>[c[0], toKB(c[2]), c[2]])) : `<div class="art">${sceneSale(2)}</div>`}</div>
    </div>` },

{ id:'died', kick:'the real dashboard query', eyebrow:'The problem, reproduced', title:'Run it. Watch it die.',
  tag:'hook', steps:[
  {note:'This is the "Top Customers This Month" query, exactly as the dashboard sends it. The dashboard gives up after ten seconds, so I set statement_timeout to ten seconds.'},
  {note:'Run it. Ten seconds later: canceling statement due to statement timeout. That is the error marketing sees every morning.'},
  {note:'Why? We will prove it in chapter five — but the planner already knows. Two SubPlans, each a full Seq Scan of orders, for every customer. Its own cost estimate is fifteen billion.'}],
  body:(st)=>`<div class="two wl">
      <div class="stack">${run('timeout', {prefix:"SET statement_timeout = '10s';", show:P('timeout').sql.replace("date_trunc('month', now())) AS spent","date_trunc('month', now())) AS [[!spent]]").replace("date_trunc('month', now())) > 0","date_trunc('month', now())) [[!> 0]]")})}
        ${st>=1?plan('timeout',{},{size:'lg'}):''}</div>
      <div class="stage-row">${sceneDied(st)}</div>
    </div>` },

{ id:'path', kick:'how we fix it', eyebrow:'Today\'s path', title:'Four layers, each one measured',
  tag:'roadmap', steps:[
  {note:'Read the plan — EXPLAIN.'},{note:'Fix the query text — six free rewrites.'},
  {note:'Restructure — the CTE that rescues the dashboard.'},{note:'Add the right index.'},
  {note:'And at the end of each layer, the number on the dashboard query. Timeout, then ~200 milliseconds, then ~13.'}],
  body:(st)=>`<div class="stage-row">${scenePath(st)}</div>
    ${st>=4?tell('Live','The same dashboard query is re-run at each stop: <b>timeout</b> &rarr; <b>'+fmt(MS('cte_good'))+'</b> &rarr; <b>'+fmt(MS('v2_good'))+'</b>.','note'):''}` },

/* ================= 2 · the planner ================= */
versus({id:'qab', art:st=>sceneWidth(1,'width=35','width=14'), kick:'example · orders over ₹5,000', eyebrow:'Example', title:'Same rows. Same plan?', tag:'example',
  why:'<b>EXPLAIN</b> prints the plan without running it. Look at <code>width=</code> &mdash; bytes per row the plan carries.',
  bad:{id:'qa', label:'Query A — SELECT *', show:'SELECT [[!*]] FROM orders\nWHERE total_amount > 5000;', brief:false, marks:{bad:[/width=\d+/], key:['Seq Scan on orders']}},
  good:{id:'qb', label:'Query B — two columns', show:'SELECT [[order_id, total_amount]]\nFROM orders\nWHERE total_amount > 5000;', brief:false, marks:{good:[/width=\d+/], key:['Seq Scan on orders']}},
  tell:'same <code>rows=</code> estimate, <code>width</code> 35 &rarr; 14. But both are still a <b>Seq Scan</b> — narrowing columns is not enough on its own.', noRace:true, noBadge:true,
  notes:['Query A: SELECT star, orders over five thousand.','EXPLAIN only — nothing ran. Seq Scan on orders, about seventeen thousand rows estimated, width thirty-five bytes.',
    'Query B: the same filter, two columns.','Same estimate, same Seq Scan — but width fourteen. Every row the plan moves is less than half the size.',
    'Checkpoint: what does the planner produce, and what does it minimize? An execution plan, and its estimated cost. And notice: both plans still read the whole table. That is the hook for everything after.']}),

/* ================= 3 · reading the plan ================= */
{ id:'three', kick:'estimate vs reality', eyebrow:'Define · the three commands', title:'EXPLAIN, ANALYZE, BUFFERS',
  tag:'define', steps:[
  {note:'EXPLAIN: the estimate. Instant, nothing runs. Cost, rows, width.'},
  {note:'EXPLAIN ANALYZE actually runs it. Now there is a second bracket — actual time, actual rows, loops — and the real execution time at the bottom.'},
  {note:'Add BUFFERS and it tells you where the pages came from. Shared hit is cache; read is disk. Run it twice and watch read turn into hit.'}],
  body:(st)=>{
    const B = [['ex_plain','The planner\'s estimate',{key:[/\(cost=[^)]*\)/]}],
               ['ex_analyze','Estimate + reality',{good:[/\(actual[^)]*\)/,/Execution Time: [\d.]+ ms/]}],
               ['ex_buffers','… and cache vs disk',{key:[/Buffers: .*/]}]];
    return `${chips([['search','EXPLAIN','estimate only &mdash; nothing runs'],['bolt','ANALYZE','runs it &mdash; real time &amp; rows'],['db','BUFFERS','cache hit vs disk read']], st)}
      <div class="stack">${B.map((b,i)=> st>=i ? `<div class="pop">${run(b[0])}${plan(b[0], b[2])}</div>` : '').join('')}</div>`; } },

{ id:'anatomy', kick:'how to read a node', eyebrow:'Define · one plan node', title:'Anatomy of our Seq Scan',
  tag:'define', steps:[
  {note:'The node type. Seq Scan — read the entire table, row by row. This is the smell.'},
  {note:'cost, startup dot dot total. Lower is better; the units are arbitrary.'},
  {note:'rows — the planner\'s estimate. Width — average bytes a row.'},
  {note:'actual time — real milliseconds, first row to last row. And the real rows, and loops: how many times this node ran.'},
  {note:'Rows Removed by Filter: nearly two million read and thrown away, to keep eight and a half thousand. Often that line is the whole diagnosis.'}],
  body:(st)=>{
    const M = [[/Seq Scan on orders/],[/cost=[\d.]+\.\.[\d.]+/],[/rows=\d+ width=\d+/],[/actual time=[\d.]+\.\.[\d.]+ rows=\d+ loops=\d+/],[/Rows Removed by Filter: \d+/]];
    const A = ['<code>Seq Scan</code> — read the whole table. The smell.','<code>cost=startup..total</code> — lower is better.',
      '<code>rows</code> estimated &middot; <code>width</code> bytes per row.','<code>actual time</code> first..last ms &middot; real <code>rows</code> &middot; <code>loops</code>.',
      '<code>Rows Removed by Filter</code> — read and thrown away. Often the whole diagnosis.'];
    return `${run('ex_analyze')}${plan('ex_analyze', st===4?{bad:M[4]}:{key:M[st]}, {size:'lg'})}
      <div class="anno">${A.map((a,i)=> st>=i ? `<div class="pop ${i===st?'on':''} ${i===4?'warn':''}">${a}</div>` : '').join('')}</div>`; } },

{ id:'rollback', kick:'caveat', eyebrow:'ANALYZE truly executes', title:'Wrap writes in a transaction',
  tag:'define', steps:[
  {note:'A warning before we go further. ANALYZE executes. This UPDATE sets a thousand orders to cancelled — so it is wrapped in BEGIN.'},
  {note:'The plan proves it ran: Update on orders, a thousand rows through the primary-key index.'},
  {note:'ROLLBACK, and nothing changed. Rule: never EXPLAIN ANALYZE a write outside a transaction you roll back.'}],
  body:(st)=>`<p class="lede"><code>EXPLAIN ANALYZE</code> on an <code>UPDATE</code> really updates.</p>
    <div class="pair"><div class="stack">${run('rollback',{prefix:'BEGIN; EXPLAIN ANALYZE'})}
        ${st>=1?`<div class="pop">${plan('rollback',{bad:[/Update on orders/], key:[/rows=1000 loops=1/]},{brief:true})}</div>`:''}
        ${st>=2?`<div class="pop">${sql('[[ROLLBACK;]]   -- the 1,000 rows really changed; now they are back')}</div>`:''}</div>
      <div class="art">${sceneTxn(st>=2?1:0)}</div></div>
    ${st>=2?tell('Rule','never <code>EXPLAIN ANALYZE</code> a write outside <code>BEGIN … ROLLBACK</code>.','warn'):''}` },

versus({id:'spill', art:st=>sceneSpill(0), kick:'plan smell · Sort Method', eyebrow:'Smell checklist', title:'A sort that spilled to disk',
  why:'Same <code>ORDER BY</code>, two settings of <code>work_mem</code> — the memory a sort may use before it writes to disk.',
  bad:{id:'sort_disk', label:"SET work_mem = '1MB'", marks:{bad:[/external merge\s+Disk: \d+kB/]}},
  good:{id:'sort_mem', label:"SET work_mem = '256MB'", marks:{good:[/quicksort\s+Memory: \d+kB/]}},
  tell:'<code>Sort Method: external merge Disk</code> is the smell; you want <code>quicksort Memory</code>. (Better still: don\'t sort 2M rows — trick 5.)',
  notes:['Sort all two million orders by amount, with one megabyte of sort memory.','Sort Method: external merge, Disk, about ninety megabytes. It spilled.','Same query with 256 megabytes.','quicksort, Memory. Same rows, faster.','The smell to remember: external merge Disk. And the bigger lesson comes in trick five — usually you should not be sorting two million rows at all.']}),

{ id:'scans', kick:'vocabulary · scan types', eyebrow:'Define · four scans', title:'Four scans, slow to fast — produced live',
  tag:'define', steps:[
  {note:'One temporary index on total_amount, and four queries. First: most rows qualify. The planner ignores the index — Seq Scan.'},
  {note:'A medium number of matches: Bitmap Index Scan. Collect row locations from the index, then read those pages in order.'},
  {note:'One row: Index Scan. Jump through the primary key, fetch the row.'},
  {note:'Every column asked for is in the index: Index Only Scan. The table is never touched. Fastest.'}],
  body:(st)=>{
    const S = [['scan_seq','Seq Scan — most rows qualify',/Seq Scan/],['scan_bitmap','Bitmap Index Scan — medium',/Bitmap (Heap|Index) Scan/],
               ['scan_index','Index Scan — a handful',/Index Scan/],['scan_only','Index Only Scan — fastest',/Index Only Scan/]];
    return `${chips([['grid','Seq Scan','read every row'],['layers','Bitmap','collect, then read pages'],['search','Index Scan','jump, then fetch'],['bolt','Index Only','never touch the table']], st)}
      ${sql(`CREATE INDEX tmp_orders_amount ON orders (total_amount) [[INCLUDE (order_id)]];`,'sm')}
      <div class="grid2">${S.map((s,i)=> st>=i ? `<div class="pop"><span class="verdict ${i?'good':'bad'}">${s[1]}</span>${run(s[0])}${plan(s[0],{key:[s[2]]},{brief:true})}</div>` : '').join('')}</div>`; } },

{ id:'before', kick:'apply · our scenario', eyebrow:'Our "before" picture', title:'Every row read. Almost all thrown away.',
  tag:'apply', steps:[
  {note:'Here is the query we will judge everything against. EXPLAIN ANALYZE, orders over five thousand.'},
  {note:'Seq Scan on orders — the scan head sweeps all of them.'},
  {note:'Rows removed by filter: one million nine hundred ninety-one thousand. Kept: eight thousand five hundred.'},
  {note:'Execution time: about ninety milliseconds at our scale — two seconds at the slides\' scale. Every technique today answers one question: does this Seq Scan disappear, and does this time drop?'}],
  body:(st)=>`${run('before')}
    ${st>=1?plan('before',{bad:['Seq Scan on orders',/Rows Removed by Filter: \d+/]},{size:'lg'}):''}
    <div class="stage-row">${sceneSeqScan(st)}</div>
    ${st>=3?tell('The test','Does this <b>Seq Scan</b> disappear, and does <b>'+fmt(MS('before'))+'</b> drop?','note'):''}` },

{ id:'quiz2', kick:'checkpoint · segment 2', eyebrow:'Check yourself', title:'Can you read the disease?',
  tag:'checkpoint', steps:quizSteps(Q2), body:(st)=>quiz(Q2, st) },

/* ================= 4 · the free wins ================= */
versus({id:'t1', art:st=>sceneWidth(1,'width=49','width=19'), kick:'trick 1 · select only the columns you need', eyebrow:'Trick 1 of 6', title:'Stop shipping columns you never show', tag:'trick',
  why:'Fewer, narrower columns = smaller <code>width</code> = less I/O &mdash; and the precondition for an Index Only Scan later.',
  bad:{id:'t1_bad', label:'Wider than needed', show:"SELECT [[!*]] FROM customers\nWHERE city = 'Pune';", brief:false, marks:{bad:[/width=\d+/]}},
  good:{id:'t1_good', label:'Only what you show', show:"SELECT [[customer_id, name]]\nFROM customers\nWHERE city = 'Pune';", brief:false, marks:{good:[/width=\d+/]}},
  tell:'<code>width</code> 49 &rarr; 19. Same rows, under half the bytes.', noRace:true, noBadge:true,
  notes:['SELECT star for the Pune customers.','width forty-nine.','Only the two columns the dashboard shows.','width nineteen.','The plan tell is the width. On its own it is a small win — the big payoff comes when an index can cover the whole SELECT.']}),

versus({id:'t2', art:st=>sceneSarg(st,{idx:'unique index on email (sorted)',keys:['aarav.s@shop.com','amit@shop.com','diya.m@shop.com','rohan.i@shop.com'],hit:1,bad:"LOWER(email) = '…'",good:"email = '…'"}), kick:'trick 2 · keep filters sargable', eyebrow:'Trick 2 of 6', title:'Don\'t wrap an indexed column in a function', tag:'trick',
  why:'<code>email</code> has a unique index. The index is on the <b>raw column</b> &mdash; not on <code>LOWER(email)</code>.',
  bad:{id:'t2_bad', label:'Function kills the index', show:"SELECT * FROM customers\nWHERE [[!LOWER(email)]] = 'amit@shop.com';", marks:{bad:['Seq Scan on customers',/Rows Removed by Filter: \d+/]}},
  good:{id:'t2_good', label:'Keep the column bare', show:"SELECT * FROM customers\nWHERE [[email]] = 'amit@shop.com';", marks:{good:[/Index Scan using \w+/]}},
  tell:'a <b>Seq Scan</b> flips to an <b>Index Scan</b> once the column is left bare. Only equivalent because emails are stored lowercase &mdash; otherwise, the expression index in chapter 6.',
  notes:['LOWER of email equals amit at shop dot com.','Seq Scan on customers. Two hundred thousand rows checked, one kept.','Same row, bare column.','Index Scan using customers_email_key.','Seq Scan to Index Scan. One caveat to say out loud: this is only the same query because emails are stored lower-case. If they are not, the fix is an expression index — chapter six.']}),

versus({id:'t2d', art:st=>sceneSarg(st,{idx:'index on order_date (sorted)',keys:['2025-10-31','2025-11-01 →','… November …','2025-12-01'],hit:1,bad:"order_date::text LIKE …",good:"order_date >= … AND < …"}), kick:'trick 2 · dates', eyebrow:'Trick 2 of 6, continued', title:'Don\'t cast a date to text', tag:'trick',
  why:'With an index on <code>order_date</code> in place, count November\'s orders two ways.',
  bad:{id:'t2d_bad', label:'Cast defeats the range', show:"SELECT count(*) FROM orders\nWHERE [[!order_date::text LIKE '2025-11%']];", marks:{bad:['Seq Scan on orders',/Rows Removed by Filter: \d+/]}},
  good:{id:'t2d_good', label:'Range-friendly dates', show:"SELECT count(*) FROM orders\nWHERE [[order_date >= '2025-11-01']]\n  [[AND order_date <  '2025-12-01']];", marks:{good:[/Index Only Scan using \w+/]}},
  tell:'the cast hides the column from the index &rarr; Seq Scan. A half-open range &rarr; <b>Index Only Scan</b>.',
  notes:['Casting order_date to text so LIKE can match the month.','Seq Scan — the index exists, the cast made it useless.','A half-open range: greater-or-equal the first, less than the next first.','Index Only Scan — it never even touched the table.','Same count, same rows. Always write date filters as ranges.']}),

{ id:'t3', kick:'trick 3 · exists over correlated subqueries', eyebrow:'Trick 3 of 6', title:'Don\'t re-run the inner query per row',
  tag:'trick', steps:[
  {note:'Which customers have ever ordered? The correlated version counts each customer\'s orders. orders.customer_id has no index.'},
  {note:'Look at the estimate, not a run. Top cost: eight billion. The SubPlan is a full scan of orders, once per customer. We cannot run this.'},
  {note:'So run it for just ten customers. loops=10 on the SubPlan, about fifty-five milliseconds each.'},
  {note:'Fifty-five milliseconds times two hundred thousand customers is about three hours.'},
  {note:'Now EXISTS — for all two hundred thousand customers. One Hash Semi Join, one pass over orders.'},
  {note:'Hours to a quarter of a second. A JOIN with DISTINCT works too, but DISTINCT c.name alone would merge two different customers who share a name — keep the key, or just use EXISTS.'}],
  body:(st)=>`<div class="pair">
      <div><span class="verdict bad">&#10005; Correlated subquery</span>
        ${st<2 ? run('t3_cost',{show:P('t3_cost').sql.replace('(SELECT COUNT(*) FROM orders o','([[!SELECT COUNT(*) FROM orders o]]')}) : run('t3_bad',{show:P('t3_bad').sql.replace('c.customer_id <= 10','[[c.customer_id <= 10]]')})}
        ${st===1 ? plan('t3_cost',{bad:[/cost=0\.00\.\.\d+\.\d+/, 'SubPlan 1']}) : ''}
        ${st>=2 ? plan('t3_bad',{bad:['SubPlan 1',/loops=10\)/g]},{brief:true}) : ''}
        ${st>=3 ? `<div class="msb bad pop">for 200,000 customers <b>&asymp; ${(MS('t3_bad')/10*200000/3600000).toFixed(1)} hours</b></div>` : ''}</div>
      ${st<4 ? `<div class="art">${loopsScene(st>=3?1:0)}</div>` : ''}
      ${st>=4 ? `<div class="pop"><span class="verdict good">&check; EXISTS — all 200,000 customers</span>
        ${run('t3_good',{show:P('t3_good').sql.replace('EXISTS','[[EXISTS]]')})}
        ${st>=5 ? plan('t3_good',{good:['Hash Semi Join']}) + badge('t3_good','good') : ''}</div>` : ''}</div>
    ${st>=5 ? `<div class="foot pop">${tell('Plan tell','a SubPlan run once <b>per row</b> &rarr; one <b>Hash Semi Join</b>. For "has any", EXISTS beats JOIN + DISTINCT.')}${speed(MS('t3_bad')/10*200000, MS('t3_good'))}</div>` : ''}` },

versus({id:'t4', art:st=>`<div class="stack" style="width:100%">${chips([['search','OR','two index lookups, merged (BitmapOr)'],['bolt','IN','one lookup: = ANY(list)']])}<p class="art-cap">same index, both ways &mdash; IN just reads cleaner</p></div>`, kick:'trick 4 · OR into IN', eyebrow:'Trick 4 of 6', title:'OR on one column: PostgreSQL copes', tag:'trick',
  why:'With an index on <code>status</code>: the slide says OR blocks the index. Run it and see what really happens.',
  bad:{id:'t4_or', label:'OR', show:"SELECT * FROM orders\nWHERE status = 'pending' [[!OR]] status = 'cancelled';", marks:{key:['BitmapOr']}},
  good:{id:'t4_in', label:'IN', show:"SELECT * FROM orders\nWHERE status [[IN ('pending', 'cancelled')]];", marks:{good:[/= ANY \([^)]*\)/]}},
  tell:'both use the index &mdash; <code>BitmapOr</code> vs one <code>= ANY</code>. IN is cleaner, not dramatically faster. The OR that really hurts is the next slide.', noRace:true, noBadge:true,
  notes:['OR on the same column.','A BitmapOr of two bitmap index scans. The index was used — the slide overstated this.','IN.','One Index Cond: status equals any of the array. Tidier, and easier to generate from code.','Be honest with the room: same-column OR is fine in modern PostgreSQL. Now the case that is not.']}),

versus({id:'t4x', lean:true, trim:true, art:st=>sceneUnion(st), kick:'trick 4 · OR into UNION', eyebrow:'Trick 4 of 6, continued', title:'OR across two tables kills both indexes', tag:'trick',
  why:'Amit\'s orders, <b>or</b> order 880231. Each side has an index — <code>email</code> and the primary key.',
  bad:{id:'t4x_bad', label:'OR across tables', show:P('t4x_bad').sql.replace(' OR ',' [[!OR]] '), marks:{bad:[/Join Filter: .*/, /Rows Removed by Join Filter: \d+/, /Seq Scan on \w+ \w/g]}},
  good:{id:'t4x_good', label:'UNION — each branch its own index', show:P('t4x_good').sql.replace('UNION','[[UNION]]'), size:'sm', marks:{good:[/Index Scan using \w+/g, /Bitmap Index Scan on \w+/]}},
  tell:'the OR can only be checked <b>after</b> joining everything (<code>Join Filter</code>). Split by <code>UNION</code>, each branch seeks its own index.',
  notes:['An OR whose two sides live in different tables.','Hash Join of both whole tables, then a Join Filter throws away two million rows.','Split it: one branch per condition, glued with UNION.','Each branch gets an index — email, then customer_id, and the primary key.','This is the rewrite that matters. UNION, not UNION ALL, because a row could match both branches.']}),

versus({id:'t5', art:st=>sceneFunnel(st), kick:'trick 5 · push LIMIT down', eyebrow:'Trick 5 of 6', title:'Don\'t sort two million to show twenty', tag:'trick',
  why:'The "latest orders" widget shows 20 rows. No index yet.',
  bad:{id:'t5_bad', label:'No LIMIT — app keeps 20', marks:{bad:[/external merge\s+Disk: \d+kB/, /rows=2000000 loops=1\)/]}},
  good:{id:'t5_good', label:'LIMIT 20', show:P('t5_good').sql.replace('LIMIT 20','[[LIMIT 20]]'), marks:{good:[/top-N heapsort\s+Memory: \d+kB/]}},
  tell:'<code>external merge Disk</code> &rarr; <code>top-N heapsort Memory</code>. With an index on <code>order_date</code> (chapter 6) it stops after 20 rows.',
  notes:['No LIMIT: the database sorts and ships all two million; the app keeps twenty.','Sort spills to disk, two million rows out the top.','Tell the database you only want twenty.','top-N heapsort: it keeps just twenty in memory as it scans.','Still a full scan — but no disk sort and no two-million-row transfer. In chapter six, an index turns this into twenty rows read.']}),

versus({id:'t5d', art:st=>sceneNode(st), kick:'trick 5 · drop needless DISTINCT', eyebrow:'Trick 5 of 6, continued', title:'DISTINCT on a primary key does nothing — but costs', tag:'trick',
  why:'<code>order_id</code> is the primary key, so these rows are already unique.',
  bad:{id:'t5d_bad', label:'Needless DISTINCT', show:P('t5d_bad').sql.replace('DISTINCT','[[!DISTINCT]]'), marks:{bad:['HashAggregate', /Group Key: .*/]}},
  good:{id:'t5d_good', label:'Drop it', marks:{good:['Seq Scan on orders']}},
  tell:'a whole <code>HashAggregate</code> node disappears. Small here; on a big result set it is a full extra hash or sort.', noRace:true,
  notes:['DISTINCT on a query that includes the primary key.','A HashAggregate node, grouping on both columns — pure overhead.','Remove DISTINCT.','The node is gone. The time saved is small at this size; the habit matters when the result is millions of rows.','Only drop DISTINCT when a key guarantees uniqueness — that is a correctness question, not a speed one.']}),

versus({id:'t6', trim:true, art:st=>statsScene(st), kick:'trick 6 · keep statistics fresh', eyebrow:'Trick 6 of 6', title:'Black Friday made the stats lie', tag:'trick',
  why:'A copy of orders with autovacuum off, analyzed <b>before</b> 300,000 Black Friday orders were bulk-loaded.',
  bad:{id:'t6_bad', label:'Stale stats', marks:{bad:[/rows=2\d{3} width/g, /external merge\s+Disk: \d+kB/, 'GroupAggregate']}},
  good:{id:'t6_good', label:'ANALYZE bf_orders; — same SQL', marks:{good:[/rows=29\d{4} width/g, 'HashAggregate']}},
  tell:'estimate ~2,200 vs actual 300,000. Budgeting for 2k rows it chose a sort that <b>spilled</b>. After <code>ANALYZE</code>: estimate &asymp; actual, HashAggregate in memory.',
  notes:['Orders per city on Black Friday — against a table whose statistics predate the sale.','Estimated about two thousand rows. Actual three hundred thousand. A plan sized for two thousand: Sort plus GroupAggregate, and the sort spilled to disk.','Change nothing but the statistics. ANALYZE.','The estimate matches, the plan changes to a HashAggregate in memory.','No rewrite at all. Autovacuum usually does this — but after a bulk load, run ANALYZE yourself.']}),

{ id:'quiz3', kick:'checkpoint · segment 3', eyebrow:'Check yourself', title:'Three sins in one query',
  tag:'checkpoint', steps:quizSteps(Q3, 'The dashboard query used SELECT star, a function on a column, and a correlated subquery.'), body:(st)=>quiz(Q3, st) },

/* ================= 5 · CTEs ================= */
{ id:'cte', kick:'need → define', eyebrow:'The dashboard query, fixed', title:'Name the sum once',
  tag:'cte', steps:[
  {note:'The query that died. EXPLAIN only — we know it will not finish.'},
  {note:'Two SubPlans. The same SUM over orders, computed twice per customer — once to filter, once to show.'},
  {note:'The CTE: customer_totals, written once. Aggregate this month\'s orders by customer, then join to names.'},
  {note:'Run it. One Seq Scan, one aggregate, a hash join. About two hundred milliseconds — from a timeout.'},
  {note:'And look for a CTE Scan node: there is none. Referenced once, the CTE was inlined — readability at zero cost. Still a Seq Scan on orders, though. Chapter six.'}],
  body:(st)=>`<div class="pair">
      <div><span class="verdict bad">&#10005; Nested subqueries &mdash; timed out</span>${st<2 ? run('cte_nested',{show:P('cte_nested').sql.replace(/\(SELECT SUM\(total_amount\)/g,'([[!SELECT SUM(total_amount)]]')}) : `<div class="prompt">shopeasy=# <b>EXPLAIN</b> &hellip; the nested query above</div>`}
        ${st>=1?plan('cte_nested',{bad:[/SubPlan \d/g]},{size:'sm',brief:true,lean:true,only:l=>TRIM(l) && !/Filter:/.test(l)}):''}</div>
      ${st>=2?`<div class="pop"><span class="verdict good">&check; One CTE</span>${run('cte_good',{show:P('cte_good').sql.replace('WITH customer_totals AS','[[WITH customer_totals AS]]')})}
        ${st>=3?plan('cte_good',{good:['GroupAggregate'], bad:['Seq Scan on orders']},{size:'sm',brief:true,bare:true,only:TRIM})+badge('cte_good','good'):''}</div>`:'<div></div>'}</div>
    ${st>=3?`<div class="foot pop">${tell('Dashboard','<b>timeout</b> &rarr; <b>'+fmt(MS('cte_good'))+'</b>. '+(st>=4?'No <code>CTE Scan</code> node: referenced once, so it was inlined.':''))}${speed(10000, MS('cte_good'))}</div>`:''}` },

versus({id:'twice', lean:true, trim:true, art:st=>sceneCTEFlow(3), kick:'postgres 12+ · inlined vs materialized', eyebrow:'Referenced twice', title:'Compute it once — when you use it twice', tag:'cte',
  why:'"Top spenders vs the average spender": <code>customer_totals</code> is referenced <b>twice</b>.',
  bad:{id:'cte_notmat', label:'NOT MATERIALIZED — copied in twice', show:P('cte_notmat').sql.replace('NOT MATERIALIZED','[[!NOT MATERIALIZED]]'), size:'sm', marks:{bad:[/Seq Scan on orders( orders_1)?/g]}, only:l=>!/Sort Key|Sort Method|Filter: \(order/.test(l)},
  good:{id:'cte_mat', label:'MATERIALIZED — computed once', show:P('cte_mat').sql.replace('MATERIALIZED','[[MATERIALIZED]]'), size:'sm', marks:{good:[/CTE Scan on customer_totals( customer_totals_1)?/g, 'Seq Scan on orders']}, only:l=>!/Sort Key|Sort Method|Filter: \(order/.test(l)},
  tell:'two <code>Seq Scan on orders</code> vs one, read twice through <code>CTE Scan</code>. Referenced 2+ times, PostgreSQL materializes by default.',
  notes:['Force it inline with NOT MATERIALIZED.','Two Seq Scans on orders — the aggregate was copied in and ran twice.','MATERIALIZED: compute once, store, reuse.','One Seq Scan; the result is read twice through CTE Scan. Half the time.','A correction to the slide: inlining is the default only for a CTE referenced once. Referenced twice, PostgreSQL already materializes it.']}),

versus({id:'trap', art:st=>trapScene(st), kick:'evaluate · when CTEs hurt', eyebrow:'The materialization trap', title:'Materialize 2M rows to find one', tag:'cte',
  why:'One order, by primary key &mdash; through a CTE wrapped around the whole table.',
  bad:{id:'trap_bad', label:'AS MATERIALIZED', show:P('trap_bad').sql.replace('MATERIALIZED','[[!MATERIALIZED]]'), marks:{bad:['CTE Scan on all_orders', /Rows Removed by Filter: \d+/, /rows=2000000/]}},
  good:{id:'trap_good', label:'Inlined (the default)', marks:{good:[/Index Scan using \w+/]}},
  tell:'materialized: build all 2,000,000 rows, then filter. Inlined: the <code>WHERE</code> pushes in and the primary key returns one row. Before PostgreSQL 12, <b>every</b> CTE was the first kind.',
  notes:['A CTE around all of orders, forced MATERIALIZED, then a lookup by id.','The whole table is built into the CTE, then filtered — one row survives out of two million.','The same query, default inlining.','Index Scan on the primary key.','This is why old advice says CTEs are slow: before version 12, every CTE was an optimization fence.']}),

{ id:'quiz4', kick:'checkpoint · segment 4', eyebrow:'Check yourself', title:'Inline, or materialize?',
  tag:'checkpoint', steps:quizSteps(Q4), body:(st)=>quiz(Q4, st) },

/* ================= 6 · indexes ================= */
versus({id:'btree', art:st=>sceneBtree(st+2), kick:'B-tree · equality & range', eyebrow:'5.1 · B-tree', title:'A sorted tree turns a range into a walk', tag:'index',
  why:'November\'s order count &mdash; before, and after <code>CREATE INDEX ON orders (order_date)</code>.',
  bad:{id:'bt_range_bad', label:'No index', marks:{bad:['Seq Scan on orders', /Rows Removed by Filter: \d+/]}},
  good:{id:'bt_range', label:'CREATE INDEX … (order_date)', prefix:'CREATE INDEX idx_orders_date ON orders (order_date); EXPLAIN ANALYZE', marks:{good:[/Index Only Scan using \w+/]}},
  tell:`the range walks the linked leaves: <b>Index Only Scan</b>. The tree is ${(P('bt_depth').text.match(/(\d+) MB/)||['','?'])[1]} MB with just ${(P('bt_depth').text.match(/\|\s+(\d+)\s*$/m)||['','?'])[1]} levels below the root — a few page reads over 2M rows.`,
  notes:['Count November without an index.','Seq Scan, nearly two million rows removed.','Create a plain B-tree on order_date and re-run.','Index Only Scan — descend to November first, walk the linked leaves to the thirtieth.','And the depth: two levels below the root for two million rows. That is why lookups cost a handful of page reads.']}),

versus({id:'btlimit', art:st=>sceneBtree(3), kick:'B-tree · ORDER BY', eyebrow:'5.1 · B-tree', title:'Trick 5, finished by an index', tag:'index',
  why:'The "latest 20 orders" query from trick 5, now that <code>order_date</code> is indexed.',
  bad:{id:'t5_good', label:'LIMIT 20, no index', marks:{bad:['Seq Scan on orders', /top-N heapsort\s+Memory: \d+kB/]}},
  good:{id:'bt_limit', label:'LIMIT 20, with the index', marks:{good:[/Index Scan Backward using \w+/, /rows=20 loops=1\)/]}},
  tell:'the <b>Sort node is gone</b>. The index is already sorted, so it walks it backwards and stops after 20 rows.',
  notes:['Trick five\'s best effort: top-N heapsort, but still scanning all two million.','Seq Scan plus Sort.','Same query, index present.','Index Scan Backward, twenty rows, done.','An index supplies rows already in order — that deletes the Sort node entirely.']}),

versus({id:'hash', art:st=>sceneHash(st+1), kick:'hash · equality only', eyebrow:'5.1 · Hash', title:'One jump to the bucket', tag:'index',
  why:'Look up one session by token &mdash; then try a range on the same hash index.',
  bad:{id:'hash_good', cls:'good', label:'USING HASH — equality', prefix:'CREATE INDEX … USING HASH (session_token); EXPLAIN ANALYZE', marks:{good:[/Index Scan using \w+/]}},
  good:{id:'hash_range', cls:'bad', label:'… a range — hash can\'t help', show:"SELECT * FROM sessions\nWHERE session_token [[!> 'ffff']];", marks:{bad:['Seq Scan on sessions']}},
  tell:`equality: <b>Index Scan</b> in ${fmt(MS('hash_good'))} (vs ${fmt(MS('hash_bad'))} without). A hash stores no order, so <code>&gt;</code>, <code>BETWEEN</code>, <code>ORDER BY</code> fall back to Seq Scan. B-tree does both.`, noRace:true, noBadge:true,
  notes:['A hash index on session tokens. Equality lookup.','Index Scan — one hash, one bucket.','Now a range on the same column.','Seq Scan. A hash index has no order, so it cannot answer ranges.','Which is why B-tree usually wins: it does equality and everything else.']}),

versus({id:'gin', art:st=>sceneGin(st+1), kick:'GIN · inverted index', eyebrow:'5.1 · GIN', title:'Many values per row', tag:'index',
  why:'Products tagged both <code>sale</code> and <code>gift</code> &mdash; <code>tags</code> is a <code>text[]</code>.',
  bad:{id:'gin_bad', label:'No index', marks:{bad:['Seq Scan on products', /Rows Removed by Filter: \d+/]}},
  good:{id:'gin_good', label:'USING GIN (tags)', prefix:'CREATE INDEX … USING GIN (tags); EXPLAIN ANALYZE', marks:{good:[/Bitmap Index Scan on \w+/]}},
  tell:'GIN stores <b>value &rarr; rows</b>: read the posting lists for <code>sale</code> and <code>gift</code>, intersect, done.',
  notes:['Array containment, no index.','Seq Scan, checking every product\'s tag array.','A GIN index on tags.','Bitmap Index Scan on the GIN index — it reads two posting lists and intersects them.','Use GIN for arrays, jsonb, and full-text search.']}),

versus({id:'gist', art:st=>sceneGist(st+1), kick:'GiST · nearest neighbour', eyebrow:'5.1 · GiST', title:'"5 stores nearest me" — Mumbai', tag:'index',
  why:'<code>location &lt;-&gt; point</code> is distance. 20,000 stores.',
  bad:{id:'gist_bad', label:'No index — measure all, sort', marks:{bad:['Seq Scan on stores', /top-N heapsort/]}},
  good:{id:'gist_good', label:'USING GIST (location)', prefix:'CREATE INDEX … USING GIST (location); EXPLAIN ANALYZE', marks:{good:[/Index Scan using \w+/, /Order By: .*/]}},
  tell:'the index walks bounding boxes nearest-first: <code>Order By</code> inside the Index Scan, <b>no Sort node</b>.',
  notes:['Nearest five stores to Mumbai, no index.','Every store\'s distance computed, then a top-N sort.','A GiST index on location.','Index Scan with Order By — it pulls stores out in distance order and stops at five.','GiST: maps, ranges, anything with overlap or nearest-neighbour.']}),

{ id:'brin', kick:'BRIN · block range index', eyebrow:'5.1 · BRIN', title:'Kilobytes for a time-ordered log',
  tag:'index', steps:[
  {note:'Three million events, appended in time order. Build a BRIN and a B-tree on created_at and compare sizes.'},
  {note:'Kilobytes versus tens of megabytes.'},
  {note:'Query one day. Bitmap scan on the BRIN, "Heap Blocks: lossy" — it reads whole block ranges and rechecks.'},
  {note:'Rows Removed by Index Recheck is the price of being tiny. It only works because the table\'s physical order follows the column.'}],
  body:(st)=>`<div class="pair">
      <div>${run('brin_size',{prefix:'CREATE INDEX … USING BRIN (created_at); CREATE INDEX … (created_at);'})}${st>=1?plan('brin_size',{good:[/BRIN\s+\|\s+\S+ kB/], bad:[/B-tree\s+\|\s+\S+ MB/]},{size:'lg'}):''}</div>
      ${st<2?`<div class="art">${sceneBrin(3)}</div>`:''}
      ${st>=2?`<div class="pop">${run('brin_good')}${plan('brin_good',{good:[/Bitmap Index Scan on \w+/, /lossy=\d+/], bad:st>=3?[/Rows Removed by Index Recheck: \d+/]:[]},{brief:true})}${badge('brin_good','good')}</div>`:''}</div>
    ${st>=1?hbars(rawRows('brin_size').map(c=>[c[0]+' index', toKB(c[1]), c[1], c[0]==='BRIN'?'good':'bad']), true):''}
    ${st>=3?tell('Plan tell','BRIN keeps min/max per block range. Lossy (<code>Index Recheck</code>), but tiny &mdash; for append-only, time-ordered tables only.'):''}` },

{ id:'composite', kick:'the leftmost-prefix rule', eyebrow:'5.1 · Composite', title:'(customer_id, order_date)',
  tag:'index', steps:[
  {note:'One composite index: customer first, then date. Filter on customer alone — the leading column.'},
  {note:'Customer and date together — both columns in the Index Cond.'},
  {note:'Date alone — it skips the leftmost column. Seq Scan.'},
  {note:'The index is sorted by customer first; date order only exists inside each customer. So equality columns first, range or sort columns last. And a footnote: PostgreSQL 18 adds skip scan, which helps when the leading column has few distinct values — not two hundred thousand customers.'}],
  body:(st)=>{
    const C = [['comp_1','✓ leading column',/Index Cond: .*/,'good'],['comp_2','✓ both columns',/Index Cond: .*/,'good'],['comp_3','✕ skips the leftmost',/Seq Scan on orders/,'bad']];
    return `${sql('CREATE INDEX idx_orders_cust_date ON orders ([[customer_id]], [[order_date]]);','sm')}
      <div class="strip">${sceneComposite(st)}</div>
      <div class="grid3">${C.map((c,i)=> st>=i ? `<div class="pop"><span class="verdict ${c[3]}">${c[1]}</span>${run(c[0])}${plan(c[0],{[c[3]]:[c[2]]},{brief:true})}</div>` : '').join('')}</div>
      ${st>=3?tell('Rule','equality columns first, range / sort columns last. (PG 18 skip scan softens this only for low-cardinality leading columns.)','note'):''}`; } },

{ id:'partial', kick:'special shapes · partial', eyebrow:'5.1 · Partial', title:'Index only the rows you ever ask for',
  tag:'index', steps:[
  {note:'Two indexes on order_date: one for every row, one only for pending orders.'},
  {note:'Look at the sizes. The partial one is a fraction — two percent of orders are pending.'},
  {note:'The ops query — pending orders from the last week — uses the small one.'}],
  body:(st)=>`<div class="pair">
      <div>${sql(`CREATE INDEX idx_orders_date    ON orders (order_date);
CREATE INDEX idx_orders_pending ON orders (order_date)
  [[WHERE status = 'pending']];`,'sm')}
        <div class="stack100 pop"><span style="width:95%;background:var(--pencil-soft)">delivered 95%</span><span style="width:2%;background:var(--pencil-soft)"></span><span style="width:2%;background:var(--amber)"></span><span style="width:1%;background:var(--pencil-soft)"></span></div>
        <p class="art-cap">the partial index stores only the amber 2% &mdash; pending</p>
        ${st>=1?run('partial_size')+hbars(rawRows('partial_size').map(c=>[c[0], toKB(c[1]), c[1], /pending/.test(c[0])?'good':'bad'])):''}</div>
      ${st>=2?`<div class="pop">${run('partial_good')}${plan('partial_good',{good:[/Bitmap Index Scan on idx_orders_pending/]},{brief:true})}${badge('partial_good','good')}</div>`:'<div></div>'}</div>` },

versus({id:'expr', art:st=>sceneSarg(st,{idx:'index on LOWER(email)',keys:['aarav.s@shop.com','sam@shop.io','diya.m@shop.com','rohan.i@shop.com'],hit:1,bad:"plain index on email",good:"LOWER(email) = '…'"}), kick:'special shapes · expression', eyebrow:'5.4 · The trap most people miss', title:'Index the expression the WHERE uses', tag:'index',
  why:'Back to trick 2: if emails are <b>not</b> stored lowercase, you must keep <code>LOWER(email)</code>. So index that.',
  bad:{id:'expr_bad', label:'Plain unique index on email', show:"SELECT * FROM customers\nWHERE [[!LOWER(email)]] = 'sam@shop.io';", marks:{bad:['Seq Scan on customers', /Rows Removed by Filter: \d+/]}},
  good:{id:'expr_good', label:'CREATE INDEX … (LOWER(email))', prefix:'CREATE INDEX idx_cust_lower_email ON customers (LOWER(email)); EXPLAIN ANALYZE', show:"SELECT * FROM customers\nWHERE [[LOWER(email)]] = 'sam@shop.io';", marks:{good:[/Index Scan using \w+/, /Index Cond: .*/]}},
  tell:'an index matches only the exact expression it was built on. Build it on <code>LOWER(email)</code> and the same query seeks.',
  notes:['LOWER of email, with only the plain email index.','Seq Scan — the plain index is useless to this expression.','Build an index on LOWER(email) itself.','Index Scan, with the Index Cond on lower(email).','Same query text, no rewrite — the index met the query where it is.']}),

versus({id:'cover', art:st=>sceneCover(st), kick:'special shapes · covering', eyebrow:'5.1 · Covering (INCLUDE)', title:'Answer from the index alone', tag:'index',
  why:'Aarav\'s orders and amounts. A plain index on <code>customer_id</code>, then one that <b>INCLUDE</b>s <code>total_amount</code>.',
  bad:{id:'cover_bad', label:'(customer_id)', prefix:'CREATE INDEX … (customer_id); EXPLAIN ANALYZE', marks:{key:[/Bitmap Heap Scan on orders/, /Heap Blocks: exact=\d+/]}},
  good:{id:'cover_good', label:'(customer_id) INCLUDE (total_amount)', prefix:'CREATE INDEX … (customer_id) INCLUDE (total_amount); VACUUM; EXPLAIN ANALYZE', marks:{good:[/Index Only Scan using \w+/, /Heap Fetches: \d+/]}},
  tell:'plain index: find the rows, then visit table pages for <code>total_amount</code>. Covering: <b>Index Only Scan</b>, <code>Heap Fetches</code> near 0. Needs a fresh <code>VACUUM</code> (visibility map).',
  notes:['A plain index on customer_id.','Bitmap Heap Scan — it found the rows in the index, then visited the table for each amount.','Carry total_amount inside the index with INCLUDE, and vacuum so the visibility map is fresh.','Index Only Scan, almost no heap fetches.','Both are fast for one customer. The difference grows with every row the query touches — which is what the victory lap needs.']}),

{ id:'selectivity', kick:'5.2 · when to index', eyebrow:'Selectivity is everything', title:'The index exists. The planner ignores it.',
  tag:'index', steps:[
  {note:'An index on status. First, the distribution: ninety-five percent delivered.'},
  {note:'Delivered: Seq Scan. The index is there, and the planner correctly ignores it — reading almost every row through an index is slower than reading the table.'},
  {note:'Cancelled, one percent: now the index is worth it.'},
  {note:'Not a bug. Low selectivity means a Seq Scan is genuinely cheaper. If one rare value is all you query, that is a partial index.'}],
  body:(st)=>`<div class="pair">
      <div>${run('sel_dist',{prefix:'CREATE INDEX … (status);'})}
        <div class="stack100 pop"><span style="width:95%;background:var(--flame-soft)">delivered 95% &rarr; Seq Scan</span><span style="width:2%;background:var(--pencil-soft)"></span><span style="width:2%;background:var(--pencil-soft)"></span><span style="width:${st>=2?6:1}%;background:var(--leaf-soft)">${st>=2?'1%':''}</span></div>
        ${plan('sel_dist',{bad:[/delivered \|\s+\d+ \| 95\.0/], good:st>=2?[/cancelled \|\s+\d+ \|\s+1\.0/]:[]},{size:'lg'})}</div>
      <div class="stack">${st>=1?`<div class="pop"><span class="verdict bad">95% of rows</span>${run('sel_hi')}${plan('sel_hi',{bad:['Seq Scan on orders']},{brief:true})}</div>`:''}
        ${st>=2?`<div class="pop"><span class="verdict good">1% of rows</span>${run('sel_lo')}${plan('sel_lo',{good:[/Index Scan using \w+/]},{brief:true})}</div>`:''}</div></div>
    ${st>=3?tell('Correct, not a bug','selectivity decides. <code>status</code> (4 values, one at 95%) is a poor index; <code>email</code> (unique) is ideal.','note'):''}` },

{ id:'writecost', kick:'5.2 · evaluate the cost', eyebrow:'Indexes are not free', title:'Every write updates every index',
  tag:'index', steps:[
  {note:'Two empty copies of orders. One with no indexes, one with five.'},
  {note:'Insert two hundred thousand rows into each.'},
  {note:'Every INSERT also had to update five indexes. Index for your reads — and pay for it on every write.'}],
  body:(st)=>`${sql(`CREATE TABLE w0 (LIKE orders);                 -- no indexes
CREATE TABLE w5 (LIKE orders);                 -- five indexes:
CREATE INDEX ON w5 (customer_id);  CREATE INDEX ON w5 (order_date);
CREATE INDEX ON w5 (status);       CREATE INDEX ON w5 (total_amount);
CREATE INDEX ON w5 (customer_id, order_date) INCLUDE (total_amount);`,'sm')}
    ${st<1?`<div class="strip">${sceneWriteCost(1)}</div>`:''}
    ${st>=1?`<div class="pair pop"><div>${run('write_0')}${plan('write_0',{good:[/Execution Time: [\d.]+ ms/]},{brief:true})}</div>
      <div>${run('write_5')}${plan('write_5',{bad:[/Execution Time: [\d.]+ ms/]},{brief:true})}</div></div>`:''}
    ${st>=2?`<div class="stage-row pop">${sceneBars([{label:'0 indexes',ms:MS('write_0'),good:true},{label:'5 indexes',ms:MS('write_5')}],9)}</div>
      ${tell('Rule','index the columns you filter and join on constantly — not every column just in case. '+times(MS('write_5'),MS('write_0'))+' slower writes here.','warn')}`:''}` },

{ id:'victory', kick:'the victory lap', eyebrow:'Kill the Seq Scan', title:'Three wins, three different indexes',
  tag:'payoff', steps:[
  {note:'One: Aarav\'s drill-down — this month, one customer. Equality column first, range second, amount carried along.'},
  {note:'Seq Scan, fifty-six milliseconds, to an Index Only Scan in microseconds.'},
  {note:'Two: the dashboard itself. Its filter is order_date alone. The drill-down index can be read, but not seeked — the planner scans the whole index. Forty-five milliseconds.'},
  {note:'Put order_date first, include customer_id and total_amount: Index Only Scan of just this month. Thirteen milliseconds — from a timeout.'},
  {note:'Three: the slide-sixteen "before" query, orders over five thousand, with an index on total_amount.'},
  {note:'Same data. Same result. And a correction for the slide: one index did not do all of this. Each query got the index its WHERE clause asked for.'}],
  body:(st)=>{
    const rows = [
      {label:'drill-down · before', ms:MS('v1_bad'), at:0},{label:'drill-down · after', ms:MS('v1_good'), good:true, at:1},
      {label:'dashboard · no index', ms:MS('cte_good'), at:2},{label:'· (cust, date) index', ms:MS('v2_bad'), at:2},
      {label:'dashboard · (date) idx', ms:MS('v2_good'), good:true, at:3},
      {label:'> ₹5,000 · before', ms:MS('before'), at:4},{label:'> ₹5,000 · after', ms:MS('v3_good'), good:true, at:4}];
    const idx = st<2 ? `CREATE INDEX CONCURRENTLY idx_orders_cust_date_amt
  ON orders ([[customer_id, order_date]]) [[INCLUDE (total_amount)]];`
      : st<4 ? `CREATE INDEX CONCURRENTLY idx_orders_date_cust_amt
  ON orders ([[order_date]]) [[INCLUDE (customer_id, total_amount)]];`
      : `CREATE INDEX CONCURRENTLY idx_orders_amount ON orders ([[total_amount]]);`;
    const pid = st<2 ? (st<1?'v1_bad':'v1_good') : st<4 ? (st<3?'v2_bad':'v2_good') : 'v3_good';
    const mk = {v1_bad:{bad:['Seq Scan on orders']}, v1_good:{good:[/Index Only Scan using \w+/]},
                v2_bad:{key:[/Index Only Scan using \w+/, /rows=7\d{3} loops/]}, v2_good:{good:[/Index Only Scan using \w+/]}, v3_good:{good:[/Bitmap Index Scan on \w+/]}};
    const who = st<2 ? `<div class="cust pop" style="max-width:24rem"><div class="av">${avatar('aarav')}</div><div><div class="nm">Aarav's drill-down</div><div class="mt">customer 1024 &middot; this month's orders</div></div></div>`
      : st<4 ? `<div class="cust pop" style="max-width:24rem"><div class="av">${avatar('diya')}</div><div><div class="nm">The whole dashboard</div><div class="mt">all customers &middot; this month &middot; top 20</div></div></div>`
      : `<p class="art-cap">the slide-16 "before" query: orders over ₹5,000</p>`;
    return `<div class="two">
      <div class="stack">${who}${sql(idx,'sm')}${plan(pid, mk[pid], {brief:true, size:'sm', only:l=>!/Buckets|Sort Key|Hash Cond|Group Key|Batches/.test(l)})}</div>
      <div class="stage-row">${sceneBars(rows, st, true)}</div></div>
      ${st>=5?`<p class="quote pop">Same data. Same result. We changed the route, not the destination.</p>`:''}`; } },

{ id:'quiz5', kick:'checkpoint · segment 5', eyebrow:'Check yourself', title:'Rapid fire',
  tag:'checkpoint', steps:quizSteps(Q5), body:(st)=>quiz(Q5, st, 2) },

/* ================= 7 · scoreboard ================= */
{ id:'scoreboard', kick:'every number from a plan you watched', eyebrow:'The scoreboard', title:'Before → after, measured',
  tag:'recap', steps:[
  {note:'The free rewrites first — no index needed for any of these.'},
  {note:'Then the indexes.'},
  {note:'Log scale: each grid line is a hundred times faster than the last. The green bars are what you take home.'}],
  body:(st)=>{
    const R = [
      ['LOWER(email) → bare', 't2_bad','t2_good',0], ['date cast → range', 't2d_bad','t2d_good',0],
      ['OR across tables → UNION','t4x_bad','t4x_good',0], ['stale stats → ANALYZE','t6_bad','t6_good',0],
      ['materialized → inlined','trap_bad','trap_good',0],
      ['dashboard · CTE → index','cte_good','v2_good',1], ['drill-down → covering','v1_bad','v1_good',1],
      ['GiST nearest 5','gist_bad','gist_good',1], ['expression index','expr_bad','expr_good',1]];
    const rows = [{label:'dashboard · original', ms:10000, txt:'timeout', at:0}];
    R.forEach(r => { rows.push({label:r[0], ms:MS(r[1]), at:r[3]}); rows.push({label:'', ms:MS(r[2]), good:true, at:r[3], txt:fmt(MS(r[2]))+' · '+times(MS(r[1]),MS(r[2]))}); });
    return `<div class="stage-row">${sceneBars(rows, st)}</div>`; } },

{ id:'corrections', kick:'where running it changed the story', eyebrow:'The code corrects the slides', title:'Five things the plans disagreed with',
  tag:'recap', steps:[
  {note:'Trick 3: JOIN with DISTINCT c.name merges different customers who share a name. Keep the key, or use EXISTS.'},
  {note:'Trick 4: same-column OR already uses the index. The OR that hurts spans tables — UNION fixes that.'},
  {note:'CTEs: inlined by default only when referenced once.'},
  {note:'Victory lap: the slide\'s index could not serve the slide\'s "before" query. Each query needs the index its WHERE asks for.'},
  {note:'And the leftmost-prefix rule: the planner cannot seek a composite index without its leading column, but it can read the whole index when that is cheaper than the table. PostgreSQL 18 skip scan softens it further.'}],
  body:(st)=>{
    const K = [['Trick 3','DISTINCT c.name is a bug','Two customers named "Arjun Das" become one row. <code>DISTINCT c.customer_id, c.name</code>, or <code>EXISTS</code>.','warn'],
      ['Trick 4','Same-column OR is fine','<code>BitmapOr</code> uses the index. The OR across <b>tables</b> is the one to rewrite with UNION.','tl'],
      ['CTEs','"Inlined by default" — if used once','Referenced twice, PG 12+ materializes it. We measured both.','tl'],
      ['Victory lap','One index ≠ every query','<code>(customer_id, order_date)</code> cannot serve <code>total_amount &gt; 5000</code>. Three queries, three indexes.','warn'],
      ['Composite','Can\'t seek, can still read','Without the leading column the planner may scan the whole index — 45 ms vs 13 ms with the right order.','pp']];
    const IC = ['users','split','layers','bolt','route'];
    return `<div class="cards" style="grid-template-columns:repeat(3,minmax(0,1fr))">${K.map((k,i)=> st>=i ? `<div class="pop">${card(k[0],k[1],k[2],k[3],ico(IC[i]))}</div>` : '').join('')}</div>`; } },

{ id:'homework', kick:'bring back before & after', eyebrow:'Homework', title:'Revenue by category, last month',
  tag:'homework', steps:[
  {note:'The assignment: this report over order_items, orders and products. Bring the EXPLAIN ANALYZE before and after, the index you chose, and why the columns are in that order.'},
  {note:'Here is the before. Seq Scan on all six million order items — order_items.order_id is a foreign key with no index. Do not show the next slide until they have tried.'}],
  body:(st)=>`<div class="pair">
      <div>${run('hw_bad')}</div>
      ${st<1?`<div class="art">${sceneJoin3(0)}</div>`:''}
      ${st>=1?`<div class="pop">${plan('hw_bad',{bad:[/Seq Scan on order_items oi/, /Seq Scan on orders o/, /external merge\s+Disk: \d+kB/]},{brief:true,size:'sm',only:l=>!/Buckets|Hash Cond|Sort Key|Group Key|Filter: \(\(o\.order/.test(l)})}${badge('hw_bad','bad')}</div>`:''}</div>` },

{ id:'hwfix', kick:'worked answer', eyebrow:'Homework · solution', title:'The index — and the planner\'s cost model',
  tag:'homework', steps:[
  {note:'Two indexes. Orders by date, carrying order_id. Order items by order_id, carrying what the SELECT needs.'},
  {note:'On default settings: orders becomes an Index Only Scan, but order_items stays a Seq Scan. About half the time.'},
  {note:'Is the planner wrong? It assumes random reads cost four times sequential ones — spinning-disk thinking. Tell it the disk is an SSD.'},
  {note:'Nested Loop of two Index Only Scans. That is configuration tuning — the level we skipped today, and the next lecture.'}],
  body:(st)=>{
    const only = l=>!/Buckets|Hash Cond|Sort Key|Group Key|Index Cond|Heap Fetches|Sort Method/.test(l);
    const rows = [{label:'no index', ms:MS('hw_bad'), at:1},{label:'+ two indexes', ms:MS('hw_idx'), good:true, at:1},
                  {label:'+ SSD cost setting', ms:MS('hw_ssd'), good:true, at:3}];
    return `<div class="pair">
      <div class="stack">${sql(`CREATE INDEX ON orders ([[order_date]]) INCLUDE (order_id);
CREATE INDEX ON order_items ([[order_id]])
  INCLUDE (product_id, quantity, unit_price);`,'sm')}
        ${st>=1 && st<3 ? plan('hw_idx',{good:[/Index Only Scan using \w+/], bad:[/Seq Scan on order_items oi/]},{brief:true,size:'sm',only}) : ''}
        ${st>=3 ? `<div class="prompt">shopeasy=# <b>SET random_page_cost = 1.1;</b></div>` + plan('hw_ssd',{good:['Nested Loop', /Index Only Scan using \w+/g]},{brief:true,size:'sm',only}) : ''}</div>
      <div class="stack">${st>=1?`<div class="stage-row">${sceneBars(rows, st, true)}</div>`:''}
        ${st>=2?tell('Why it held back','<code>random_page_cost = 4</code> assumes a spinning disk, so 54k index probes look dear. On an SSD, say so.','note'):''}</div></div>`; } },

{ id:'workflow', kick:'your reusable framework', eyebrow:'Wrap-up', title:'The optimization workflow',
  tag:'recap', steps:[
  {note:'Measure — EXPLAIN ANALYZE.'},{note:'Read — the Seq Scan, Rows Removed, the estimate gap, the disk sort.'},
  {note:'Rewrite — free fixes first.'},{note:'Restructure — CTEs.'},{note:'Index — last and deliberate.'},
  {note:'Re-measure. Never trust a fix you did not re-plan — tonight, every slide did exactly that.'}],
  body:(st)=>{
    const W = [['Measure','<code>EXPLAIN ANALYZE</code>; the slowest node & the headline time.'],
               ['Read','Seq Scan, Rows Removed, estimate vs actual, Disk sort.'],
               ['Rewrite','sargable filters, EXISTS, UNION, LIMIT, ANALYZE.'],
               ['Restructure','CTEs: name it once; inline vs materialize on purpose.'],
               ['Index','type, column order, INCLUDE, selectivity, write cost.'],
               ['Re-measure','confirm the win — never trust a fix you didn\'t re-plan.']];
    const IC = ['gauge','search','bolt','layers','build','gauge'];
    return `<div class="rows" style="--cols:2rem 9rem 1fr">${W.map((w,i)=> st>=i ? `<div class="row pop ${i===st?'hot':''}"><span style="width:1.4rem;height:1.4rem;display:grid">${ico(IC[i])}</span><b>${i+1} · ${w[0]}</b><span>${w[1]}</span></div>` : '').join('')}</div>`; } },

{ id:'thanks', kick:'over to you', eyebrow:'Thanks', title:'Run it yourself',
  tag:'close', steps:[
  {note:'Everything you saw is in the repository: the SQL files, one per segment, and the capture script that produced every plan.'},
  {note:'You did not make the database faster. You stopped making it do unnecessary work — and then you gave it a shortcut.'}],
  body:(st)=>`<div class="two">
      ${sql(`createdb shopeasy
psql -d shopeasy -f 00_setup.sql      -- ~1 min
psql -d shopeasy -f 03_free_wins.sql  -- any segment
python3 build/capture.py              -- re-record every plan`,'lg')}
      <div class="stack"><div class="brand-row">${brand('case study')}<span class="sticker">Black Friday</span></div>${custCards(1)}
        ${st>=1?`<p class="quote pop">"You didn't make the database faster. You stopped making it do unnecessary work &mdash; and then you gave it a shortcut."</p>`:''}</div>
    </div>` }
];
