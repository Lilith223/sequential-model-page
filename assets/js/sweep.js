/*
 * sweep.js — Demo D. Welfare averaged over articles (r ~ U(0,1)) as automated fact-checking improves along
 * e1 = ratio * e2, for {M_H}, {M_A} and {M_H, M_A}. The paper's Fig. 5, recomputed live.
 * Regime boundaries tau_use and tau_all are closed form; tau_0 is read off the simulated curves.
 */
(function () {
  'use strict';
  const { h, s, $, clear, sym, pct, f2, f3, slider, Tip, onResize, cssVar, onTheme, clamp } = UI;

  const ALPHAS = []; for (let a = 0.51; a < 0.9951; a += 0.01) ALPHAS.push(+a.toFixed(3));
  const PRECISION = { fast: { label: 'Fast', passes: [10, 20, 40], strata: 50 }, standard: { label: 'Standard', passes: [15, 30, 60, 120], strata: 60 }, high: { label: 'High', passes: [30, 60, 120, 240, 480], strata: 60 } };
  const st = { K: 0.3, p: 0.55, ratio: 3, precision: 'standard' };
  const ctl = {};
  let worker = null, jobId = 0, data = null, runs = 0, done = false, box, svg, tiles = {}, progress, progressTxt, tableEl, tableOpen = false;

  /* ------------------------------------------------------------------ closed-form boundaries */
  function taus() {
    const K = st.K, rho = st.ratio;
    const alphaOf = (e2) => 1 - (e2 * (1 + rho)) / 2;
    const e2use = K / (1 + K * (rho - 1)), e2all = K / (rho - K * (rho - 1));
    return { use: alphaOf(e2use), all: alphaOf(e2all) };
  }
  function tauZero() {
    if (!data) return null;
    const n = ALPHAS.length, d = (a) => data.W[a * 3 + 2] - data.W[a * 3];
    let last = -1;
    for (let a = 0; a < n; a++) if (d(a) < -1e-9) last = a;
    if (last < 0) return { none: true };
    if (last === n - 1) return { beyond: true };
    const d0 = d(last), d1 = d(last + 1);
    return { value: ALPHAS[last] + ((0 - d0) / (d1 - d0)) * (ALPHAS[last + 1] - ALPHAS[last]) };
  }

  /* ------------------------------------------------------------------ chart */
  function draw() {
    if (!box || !box.clientWidth) return;
    const W = Math.max(320, box.clientWidth), H = Math.round(Math.min(440, Math.max(300, W * 0.5)));
    const m = { l: 52, r: 16, t: 48, b: 44 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
    clear(svg); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const blue = cssVar('--blue'), orange = cssVar('--orange'), ink = cssVar('--ink'), surface = cssVar('--surface');
    const tu = taus();
    // y-domain from the data
    let lo = 0.7, hi = 1.0;
    if (data) { let mn = 1; for (let k = 0; k < data.W.length; k++) mn = Math.min(mn, data.W[k] - 2 * data.SD[k]); lo = clamp(Math.floor((mn - 0.01) * 20) / 20, 0, 0.95); }
    const x = (a) => m.l + ((a - 0.5) / 0.5) * pw, y = (v) => m.t + ((hi - clamp(v, lo, hi)) / (hi - lo)) * ph;
    const kids = [];
    // grid, ticks
    const step = hi - lo > 0.35 ? 0.1 : 0.05;
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) {
      kids.push(s('line', { class: 'grid-line', x1: m.l, x2: m.l + pw, y1: y(v), y2: y(v) }));
      kids.push(s('text', { class: 'tick-label', x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, v.toFixed(2)));
    }
    for (let a = 0.5; a <= 1.0001; a += 0.1) kids.push(s('text', { class: 'tick-label', x: x(a), y: m.t + ph + 18, 'text-anchor': 'middle' }, a.toFixed(1)));
    kids.push(s('line', { class: 'axis-line', x1: m.l, x2: m.l + pw, y1: m.t + ph, y2: m.t + ph }));
    kids.push(s('text', { class: 'axis-title', x: m.l + pw / 2, y: H - 6, 'text-anchor': 'middle' }, 'Balanced accuracy α of automated fact-checking = 1 − (e₁ + e₂)/2'));
    kids.push(s('text', { class: 'axis-title', transform: `translate(14 ${m.t + ph / 2}) rotate(-90)`, 'text-anchor': 'middle' }, 'Average welfare W̄'));

    // regime strip across the top
    const strip = [[0.5, tu.use, 'Automated unused', 0.06], [tu.use, tu.all, 'both used', 0.11], [tu.all, 1, 'Automated only', 0.17]];
    strip.forEach(([a0, a1, txt, op]) => {
      kids.push(s('rect', { x: x(a0), y: m.t - 34, width: Math.max(0, x(a1) - x(a0)), height: 22, fill: ink, opacity: op }));
      if (x(a1) - x(a0) > 64) kids.push(s('text', { x: (x(a0) + x(a1)) / 2, y: m.t - 19, 'text-anchor': 'middle', style: 'font-size:12px;fill:var(--ink)' }, txt));
    });
    // vertical markers
    const t0 = tauZero();
    const marks = [[tu.use, 'τuse', tu.use.toFixed(3)], [tu.all, 'τall', tu.all.toFixed(3)]];
    if (t0 && t0.value) marks.push([t0.value, 'τ0 ≈', t0.value.toFixed(2)]);
    marks.forEach(([a, nm, val], k) => {
      kids.push(s('line', { x1: x(a), x2: x(a), y1: m.t - 12, y2: m.t + ph, stroke: ink, 'stroke-width': 1, opacity: 0.55 }));
      kids.push(s('text', { x: x(a), y: m.t + ph - 6 - (k === 2 ? 0 : 0), 'text-anchor': 'middle', style: 'font-size:11.5px;font-weight:600;fill:var(--ink);paint-order:stroke;stroke:var(--surface);stroke-width:3px;stroke-linejoin:round' }, nm + ' ' + val));
    });

    if (data) {
      const band = (k, col) => {
        const up = ALPHAS.map((a, i) => x(a).toFixed(1) + ',' + y(data.W[i * 3 + k] + data.SD[i * 3 + k]).toFixed(1));
        const dn = ALPHAS.map((a, i) => x(a).toFixed(1) + ',' + y(data.W[i * 3 + k] - data.SD[i * 3 + k]).toFixed(1)).reverse();
        kids.push(s('polygon', { points: up.concat(dn).join(' '), fill: col, opacity: 0.14 }));
      };
      const line = (k, col, w, dash) => {
        const pts = ALPHAS.map((a, i) => x(a).toFixed(1) + ',' + y(data.W[i * 3 + k]).toFixed(1)).join(' ');
        kids.push(s('polyline', { points: pts, fill: 'none', stroke: col, 'stroke-width': w, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': dash || null }));
      };
      band(0, blue); band(1, orange); band(2, ink);
      line(0, blue, 2); line(1, orange, 2, '6 4'); line(2, ink, 2.5);
      // end labels
      const n = ALPHAS.length - 1;
      [[0, blue, '{Mₕ}'], [2, ink, '{Mₕ, Mₐ}']].forEach(() => {});
      kids.push(s('circle', { cx: x(ALPHAS[n]), cy: y(data.W[n * 3 + 2]), r: 4.5, fill: ink, stroke: surface, 'stroke-width': 2 }));
    }

    // hover
    const cross = s('line', { y1: m.t, y2: m.t + ph, stroke: ink, 'stroke-width': 1, opacity: 0, 'pointer-events': 'none' });
    const hit = s('rect', { x: m.l, y: m.t - 36, width: pw, height: ph + 36, fill: 'transparent' });
    const showAt = (a, cx, cy) => {
      const i = clamp(Math.round((a - ALPHAS[0]) / 0.01), 0, ALPHAS.length - 1), al = ALPHAS[i];
      cross.setAttribute('x1', x(al)); cross.setAttribute('x2', x(al)); cross.setAttribute('opacity', 0.5);
      const e = ECC.errorsAtAccuracy(al, st.ratio);
      const rows = data ? [
        { label: '{manual}', value: f3(data.W[i * 3]) + ' ± ' + f3(data.SD[i * 3]), color: blue, line: true },
        { label: '{automated}', value: f3(data.W[i * 3 + 1]) + ' ± ' + f3(data.SD[i * 3 + 1]), color: orange, line: true },
        { label: '{manual, automated}', value: f3(data.W[i * 3 + 2]) + ' ± ' + f3(data.SD[i * 3 + 2]), color: ink, line: true },
      ] : [];
      const dd = data ? (data.W[i * 3 + 2] - data.W[i * 3]) * 100 : null;
      Tip.show(cx, cy, { title: 'α = ' + al.toFixed(2) + '  (e₁ = ' + e.e1.toFixed(2) + ', e₂ = ' + e.e2.toFixed(2) + ')', rows, note: dd == null ? '' : 'Adding automated fact-checking: ' + (dd > 0.05 ? '+' : dd < -0.05 ? '−' : '±') + Math.abs(dd).toFixed(1) + ' points vs. manual only' });
    };
    hit.addEventListener('pointermove', (ev) => { const r = svg.getBoundingClientRect(); showAt(0.5 + ((((ev.clientX - r.left) / r.width) * W - m.l) / pw) * 0.5, ev.clientX, ev.clientY); });
    hit.addEventListener('pointerleave', () => { cross.setAttribute('opacity', 0); Tip.hide(); });
    box.onkeydown = (ev) => {
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      ev.preventDefault();
      box._a = clamp((box._a == null ? 0.75 : box._a) + (ev.key === 'ArrowRight' ? 0.01 : -0.01), 0.51, 0.99);
      const r = svg.getBoundingClientRect(); showAt(box._a, r.left + (x(box._a) / W) * r.width, r.top + r.height * 0.4);
    };
    box.onblur = () => { cross.setAttribute('opacity', 0); Tip.hide(); };
    kids.push(cross, hit);
    kids.forEach((k) => svg.appendChild(k));
  }

  /* ------------------------------------------------------------------ tiles and table */
  function updateTiles() {
    const tu = taus(), t0 = tauZero();
    tiles.use.big.textContent = tu.use.toFixed(3); tiles.all.big.textContent = tu.all.toFixed(3);
    if (!data) { tiles.zero.big.textContent = '…'; tiles.dip.big.textContent = '…'; return; }
    if (t0.value) { tiles.zero.big.textContent = '≈ ' + t0.value.toFixed(2); tiles.zero.sub.textContent = 'tool must be this accurate to raise average welfare'; }
    else if (t0.none) { tiles.zero.big.textContent = 'none'; tiles.zero.sub.textContent = 'the tool never lowers average welfare here'; }
    else { tiles.zero.big.textContent = '> 0.99'; tiles.zero.sub.textContent = 'not reached in the range shown'; }
    let dip = 0, at = null;
    ALPHAS.forEach((a, i) => { const d = data.W[i * 3 + 2] - data.W[i * 3]; if (d < dip) { dip = d; at = a; } });
    tiles.dip.big.textContent = at == null ? '±0.0 pts' : '−' + Math.abs(dip * 100).toFixed(1) + ' pts';
    tiles.dip.sub.textContent = at == null ? 'no loss at any accuracy' : 'worst loss from adding the tool, at α = ' + at.toFixed(2);
  }
  function updateTable() {
    if (!tableOpen || !data) return;
    clear(tableEl);
    const head = h('tr', null, h('th', null, 'α'), h('th', { class: 'n' }, 'e₁'), h('th', { class: 'n' }, 'e₂'), h('th', { class: 'n' }, 'W̄ {manual}'), h('th', { class: 'n' }, 'W̄ {automated}'), h('th', { class: 'n' }, 'W̄ {manual, automated}'), h('th', { class: 'n' }, 'Change'));
    const rows = ALPHAS.map((a, i) => {
      const e = ECC.errorsAtAccuracy(a, st.ratio), dd = (data.W[i * 3 + 2] - data.W[i * 3]) * 100;
      return h('tr', null, h('td', null, a.toFixed(2)), h('td', { class: 'n' }, e.e1.toFixed(3)), h('td', { class: 'n' }, e.e2.toFixed(3)),
        h('td', { class: 'n' }, f3(data.W[i * 3])), h('td', { class: 'n' }, f3(data.W[i * 3 + 1])), h('td', { class: 'n' }, f3(data.W[i * 3 + 2])),
        h('td', { class: 'n' }, (dd > 0.05 ? '+' : dd < -0.05 ? '−' : '±') + Math.abs(dd).toFixed(1)));
    });
    tableEl.appendChild(h('div', { style: { maxHeight: '320px', overflow: 'auto' } }, h('table', { class: 'data' }, h('thead', null, head), h('tbody', null, rows))));
  }

  /* ------------------------------------------------------------------ worker */
  function ensureWorker() {
    if (worker) return true;
    try {
      worker = new Worker('assets/js/worker.js');
      worker.onmessage = (ev) => {
        const m = ev.data;
        if (m.type !== 'sweep' || m.id !== jobId) return;
        data = { W: m.W, SD: m.SD }; runs = m.runs; done = m.last;
        box.style.opacity = '1';
        draw(); updateTiles(); updateTable(); updateProgress();
      };
      worker.onerror = () => { progressTxt.textContent = 'The Monte Carlo worker could not start. Serve this page over http(s), e.g. GitHub Pages, rather than from a file.'; };
      return true;
    } catch (e) { progressTxt.textContent = 'This page needs to be served over http(s) for the live simulation.'; return false; }
  }
  function updateProgress() {
    const pr = PRECISION[st.precision], tot = pr.passes.reduce((a, b) => a + b, 0), perCurve = pr.strata * 2 * (runs ? 1 : 0);
    const frac = data ? Math.min(1, runs / (pr.strata * 2 * tot)) : 0;
    progress.firstChild.style.width = (frac * 100) + '%';
    progress.style.opacity = done ? '0' : '1';
    progressTxt.textContent = !data ? 'Simulating…' : done ? 'Monte Carlo: ' + (runs * ALPHAS.length * 3).toLocaleString('en-US') + ' simulated crowds in total. Shaded bands are ±1 standard deviation.' : 'Refining…';
  }
  function request() {
    if (!ensureWorker()) return;
    jobId++; done = false;
    const pr = PRECISION[st.precision];
    if (data) box.style.opacity = '0.6';
    worker.postMessage({ type: 'sweep', id: jobId, KH: st.K, p: st.p, ratio: st.ratio, alphas: ALPHAS, strata: pr.strata, passes: pr.passes, tMax: 1000, prior: 'arcsine' });
    progressTxt.textContent = 'Simulating…';
    draw(); updateTiles();
  }

  /* ------------------------------------------------------------------ build */
  const PRESETS = [
    { label: 'The paper’s setting', K: 0.3, p: 0.55, ratio: 3 },
    { label: 'Informative truthful articles', K: 0.3, p: 0.9, ratio: 3 },
    { label: 'Costlier manual checks', K: 0.4, p: 0.55, ratio: 3 },
    { label: 'Balanced errors', K: 0.3, p: 0.55, ratio: 1.5 },
  ];
  function setAll(v) { Object.assign(st, v); ctl.K.set(st.K); ctl.p.set(st.p); ctl.ratio.set(st.ratio); request(); }

  function build() {
    const root = $('#sweep-root');
    const redo = UI.debounce(request, 60);
    ctl.K = slider({ label: ['Manual cost ', sym('K', 'H')], min: 0.05, max: 0.45, step: 0.01, value: st.K, format: f2, onInput: (v) => { st.K = v; draw(); updateTiles(); redo(); } });
    ctl.p = slider({ label: ['Informativeness ', sym('p')], min: 0.55, max: 0.95, step: 0.01, value: st.p, format: f2, onInput: (v) => { st.p = v; redo(); } });
    ctl.ratio = slider({ label: ['Error asymmetry ', sym('e', '1'), ' / ', sym('e', '2')], min: 1.5, max: 6, step: 0.5, value: st.ratio, format: (v) => v.toFixed(1), onInput: (v) => { st.ratio = v; draw(); updateTiles(); redo(); } });
    const prec = h('select', { class: 'sel', 'aria-label': 'Simulation precision', onchange: (ev) => { st.precision = ev.target.value; request(); } },
      Object.entries(PRECISION).map(([k, v]) => h('option', { value: k, selected: k === st.precision }, 'Precision: ' + v.label)));
    progress = h('div', { class: 'progress' }, h('i'));
    progressTxt = h('p', { class: 'note', style: { margin: '6px 0 0' }, role: 'status' });
    box = h('div', { class: 'chart', tabindex: '0', role: 'img', style: { transition: 'opacity .2s' }, 'aria-label': 'Average welfare against the accuracy of automated fact-checking, for manual checking only, automated fact-checking only, and both. Use the arrow keys to read values; a data table is available below.' }, svg = s('svg'));
    const tile = (k, title, sub) => { tiles[k] = { big: h('div', { class: 'big' }), sub: h('div', { class: 'lbl' }, sub || '') }; return h('div', { class: 'box' }, h('div', { class: 'lbl', style: { fontWeight: 600, color: 'var(--ink)' } }, title), tiles[k].big, tiles[k].sub); };
    const chips = PRESETS.map((pr) => h('button', { type: 'button', class: 'chip', onclick: () => setAll(pr) }, pr.label));
    tableEl = h('div');
    const fold = h('details', { class: 'fold', ontoggle: (ev) => { tableOpen = ev.target.open; updateTable(); } }, h('summary', null, 'Show the numbers as a table'), h('div', { class: 'fold-body' }, tableEl));

    root.appendChild(h('div', { class: 'card pad' },
      h('div', { class: 'controls' },
        h('div', { class: 'ctl-group' }, h('p', { class: 'ctl-title' }, 'Manual checking'), ctl.K.el),
        h('div', { class: 'ctl-group' }, h('p', { class: 'ctl-title' }, 'Articles'), ctl.p.el),
        h('div', { class: 'ctl-group' }, h('p', { class: 'ctl-title' }, 'Automated fact-checking'), ctl.ratio.el)),
      h('div', { class: 'toolbar' }, h('span', { class: 'note', style: { fontWeight: 600 } }, 'Try:'), h('div', { class: 'chips' }, chips), h('span', { class: 'spacer' }), prec),
      h('div', { class: 'divider' }),
      h('div', { class: 'cell-info', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', marginTop: 0 } },
        tile('use', ['τ', h('sub', null, 'use')], 'below this, nobody uses automated fact-checking'), tile('all', ['τ', h('sub', null, 'all')], 'above this, everyone who checks uses it'),
        tile('zero', ['τ', h('sub', null, '0'), ' (simulated)']), tile('dip', 'Largest average loss')),
      h('div', { style: { marginTop: '18px' } }, box),
      h('div', { class: 'legend', style: { marginTop: '8px' } },
        h('span', { class: 'k' }, h('span', { class: 'key-line', style: { borderColor: 'var(--blue)' } }), '{manual only}'),
        h('span', { class: 'k' }, h('span', { class: 'key-line', style: { borderColor: 'var(--orange)', borderTopStyle: 'dashed' } }), '{automated only}'),
        h('span', { class: 'k' }, h('span', { class: 'key-line', style: { borderColor: 'var(--ink)', borderTopWidth: '3px' } }), '{manual and automated available}')),
      progress, progressTxt, fold));
    root.appendChild(h('p', { class: 'takeaway reveal' }, h('b', null, 'The dip. '), 'As the tool improves from “unused” to “used by everyone who checks”, welfare can ', h('em', null, 'fall'), ': more and more agents swap an error-free manual check for a free but fallible one, and their errors mislead the agents after them. The loss is deepest at τ', h('sub', null, 'all'), ', where the last agents switch. Only beyond τ', h('sub', null, '0'), ' does the tool pay off on average.'));
    onResize(box, draw);
    onTheme(draw);
    draw(); updateTiles();
    UI.onceVisible(root, request, 0.05);
    setTimeout(() => { if (!data && !jobId) request(); }, 1500);
  }
  function init() { if ($('#sweep-root')) build(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
