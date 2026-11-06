/*
 * welfare.js — Demo C. The change in the probability of a correct cascade when automated fact-checking is added to
 * manual checking, on an (r, p) grid. Cells come from the Monte Carlo worker (progressively refined);
 * lines and signs are the closed-form thresholds and the regions certified by Propositions 2 and 3.
 */
(function () {
  'use strict';
  const { h, s, $, clear, sym, pct, f2, f3, slider, segmented, Tip, onResize, cssVar, onTheme, clamp } = UI;

  const NR = 80, NP = 32, P_MIN = 0.55, P_MAX = 0.95;
  const PASSES = [30, 60, 120, 240, 480];
  const VIEWS = { dW: { key: 'dW', vmax: 0.25, name: 'Average over articles' }, dT: { key: 'dT', vmax: 0.5, name: 'Truthful articles' }, dF: { key: 'dF', vmax: 0.5, name: 'Fake articles' } };

  const st = { K: 0.3, e1: 0.3, e2: 0.1, view: 'dW', prior: 'arcsine', theory: true, sel: { i: 40, j: 4 } };
  const ctl = {};
  let worker = null, jobId = 0, lam = null, runs = 0, done = false, canvas, frame, plot, svg, ctx, progress, progressTxt, info = {}, regimeEl, legendEl, tableEl, colorbar, cbLabels, loadBtn;

  const rOf = (i) => (i + 0.5) / NR;
  const pOf = (j) => P_MIN + ((P_MAX - P_MIN) * (j + 0.5)) / NP;
  const cellOf = (r, p) => ({ i: clamp(Math.floor(r * NR), 0, NR - 1), j: clamp(Math.floor(((p - P_MIN) / (P_MAX - P_MIN)) * NP), 0, NP - 1) });

  function delta(i, j) {
    if (!lam) return null;
    const c = (i * NP + j) * 4, r = rOf(i);
    const lTH = lam[c], lFH = lam[c + 1], lTA = lam[c + 2], lFA = lam[c + 3];
    const dT = lTA - lTH, dF = lFA - lFH;
    return { lTH, lFH, lTA, lFA, dT, dF, dW: r * dT + (1 - r) * dF };
  }

  /* ------------------------------------------------------------------ colours */
  const hex = (c) => { const m = c.replace('#', ''); return [0, 2, 4].map((k) => parseInt(m.slice(k, k + 2), 16)); };
  let pal = null;
  function loadPalette() { pal = { mid: hex(cssVar('--mid')), pos: hex(cssVar('--orange')), neg: hex(cssVar('--blue')) }; }
  function colorOf(d, vmax) {
    const t = clamp(d / vmax, -1, 1), a = Math.pow(Math.abs(t), 0.8) * 0.96, pole = t >= 0 ? pal.pos : pal.neg;
    return pal.mid.map((m, k) => Math.round(m + (pole[k] - m) * a));
  }

  function paintHeat() {
    if (!ctx) return;
    loadPalette();
    const img = ctx.createImageData(NR, NP), vmax = VIEWS[st.view].vmax;
    for (let i = 0; i < NR; i++) for (let j = 0; j < NP; j++) {
      const d = delta(i, j);
      const rgb = d ? colorOf(d[st.view], vmax) : pal.mid;
      const o = ((NP - 1 - j) * NR + i) * 4;
      img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    canvas.style.opacity = lam ? '1' : '0.5';
    // colour bar
    const stops = [];
    for (let k = 0; k <= 10; k++) { const v = (k / 5 - 1) * vmax, c = colorOf(v, vmax); stops.push(`rgb(${c[0]},${c[1]},${c[2]}) ${(k * 10)}%`); }
    colorbar.style.background = `linear-gradient(to right, ${stops.join(',')})`;
    cbLabels[0].textContent = '−' + vmax.toFixed(2) + '  manual only is better';
    cbLabels[1].textContent = 'adding automated fact-checking is better  +' + vmax.toFixed(2);
  }

  /* ------------------------------------------------------------------ theory overlay */
  function lineSet() {
    const MH = ECC.manual(st.K), MA = ECC.auto(st.e1, st.e2), T = ECC.thr, reg = ECC.regime(st.K, st.e1, st.e2);
    if (reg === 'i') return [];
    const L = {
      rDA: { n: ['r', 'D', '(A)'], f: (p) => T.rD(MA, p) }, rLA: { n: ['r', 'L', '(A)'], f: (p) => T.rL(MA, p) },
      rDH: { n: ['r', 'D', '(H)'], f: (p) => T.rD(MH, p) }, rLH: { n: ['r', 'L', '(H)'], f: (p) => T.rL(MH, p) },
      rhDH: { n: ['r̂', 'D', '(H)'], f: (p) => T.rhatD(MH, p) }, rhLH: { n: ['r̂', 'L', '(H)'], f: (p) => T.rhatL(MH, p) },
    };
    if (reg === 'iii') {
      return { dT: [L.rDA, L.rDH, L.rhLH, L.rLA], dF: [L.rDA, L.rhDH, L.rLH, L.rLA], dW: [L.rDA, L.rhLH, L.rhDH, L.rLA] }[st.view];
    }
    const piStar = (st.e1 - st.K) / (st.e1 - st.e2), kappa = (1 - piStar) / piStar;
    const rStar = { n: ['r', '*', ''], f: (p) => (0.5 * kappa) / (0.5 * kappa + (1 - p)) };
    const rTil = { n: ['r̃', '', ''], f: (p) => Math.min(rStar.f(p), T.rhatD(MH, p)) };
    return { dT: [L.rDA, L.rDH, L.rhLH, rStar], dF: [L.rDA, rTil, rStar], dW: [L.rDA, L.rhLH, rTil, rStar] }[st.view];
  }

  function geometry() {
    const fr = frame.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
    return { W: fr.width, H: fr.height, x0: cr.left - fr.left, y0: cr.top - fr.top, w: cr.width, h: cr.height };
  }

  const subText = (x, y, parts, attrs) => {
    const t = s('text', Object.assign({ x, y }, attrs || {}));
    t.appendChild(document.createTextNode(parts[0]));
    if (parts[1]) { const sb = s('tspan', { dy: 3, 'font-size': 9 }); sb.textContent = parts[1]; t.appendChild(sb); }
    if (parts[2]) { const r = s('tspan', { dy: -3 }); r.textContent = parts[2]; t.appendChild(r); }
    return t;
  };

  function drawOverlay() {
    if (!canvas || !canvas.clientWidth) return;
    const g = geometry();
    clear(svg); svg.setAttribute('viewBox', `0 0 ${g.W} ${g.H}`);
    const X = (r) => g.x0 + r * g.w, Y = (p) => g.y0 + ((P_MAX - p) / (P_MAX - P_MIN)) * g.h;
    const ink = cssVar('--ink'), surface = cssVar('--surface');
    const kids = [];
    // axes
    for (let r = 0; r <= 1.0001; r += 0.2) kids.push(s('text', { class: 'tick-label', x: X(r), y: g.y0 + g.h + 17, 'text-anchor': 'middle', style: 'font-size:11.5px;fill:var(--muted)' }, r.toFixed(1)));
    [0.6, 0.7, 0.8, 0.9].forEach((p) => kids.push(s('text', { class: 'tick-label', x: g.x0 - 8, y: Y(p) + 4, 'text-anchor': 'end', style: 'font-size:11.5px;fill:var(--muted)' }, p.toFixed(1))));
    kids.push(s('text', { x: g.x0 + g.w / 2, y: g.y0 + g.h + 36, 'text-anchor': 'middle', style: 'font-size:12.5px;fill:var(--ink-2)' }, 'Article reliability  r'));
    kids.push(s('text', { transform: `translate(14 ${g.y0 + g.h / 2}) rotate(-90)`, 'text-anchor': 'middle', style: 'font-size:12.5px;fill:var(--ink-2)' }, 'Informativeness  p'));

    if (st.theory) {
      // threshold curves with a surface halo
      const lines = lineSet();
      const reg = ECC.regime(st.K, st.e1, st.e2);
      const pbar = ECC.pBar(st.K);
      const placed = [];
      lines.forEach((ln) => {
        const pts = []; for (let k = 0; k <= 60; k++) { const p = P_MIN + ((P_MAX - P_MIN) * k) / 60; pts.push(X(clamp(ln.f(p), 0, 1)).toFixed(1) + ',' + Y(p).toFixed(1)); }
        kids.push(s('polyline', { points: pts.join(' '), fill: 'none', stroke: surface, 'stroke-width': 4.5, 'stroke-linejoin': 'round', opacity: 0.9 }));
        kids.push(s('polyline', { points: pts.join(' '), fill: 'none', stroke: ink, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }));
      });
      // curve labels along the top edge, staggered when close (omitted on phones: the legend names the curves)
      const narrow = g.w < 480;
      (narrow ? [] : lines).map((ln) => ({ ln, x: X(clamp(ln.f(P_MAX), 0, 1)) })).sort((a, b) => a.x - b.x).forEach((o) => {
        let row = 0; while (placed.some((q) => q.row === row && Math.abs(q.x - o.x) < 40)) row++;
        placed.push({ x: o.x, row });
        const ly = g.y0 + 13 + row * 13, lx = clamp(o.x + 5, g.x0 + 2, g.x0 + g.w - 40);
        const t = subText(lx, ly, o.ln.n, { style: 'font-size:11.5px;font-weight:600;fill:var(--ink);paint-order:stroke;stroke:var(--surface);stroke-width:3px;stroke-linejoin:round' });
        kids.push(t);
      });
      // p-bar marker (below it the two negative bands overlap)
      if (reg !== 'i' && pbar > P_MIN && pbar < P_MAX) {
        kids.push(s('line', { x1: g.x0 - 6, x2: g.x0 + 6, y1: Y(pbar), y2: Y(pbar), stroke: ink, 'stroke-width': 3 }));
        if (!narrow) kids.push(s('text', { x: g.x0 + 10, y: Y(pbar) - 4, style: 'font-size:11.5px;font-weight:600;fill:var(--ink);paint-order:stroke;stroke:var(--surface);stroke-width:3px' }, 'p̄ = ' + pbar.toFixed(2)));
      }
      // certified signs
      [0.6, 0.75, 0.9].forEach((p) => {
        const runsAt = []; let cur = null;
        for (let r = 0.0025; r < 1; r += 0.005) {
          const sg = ECC.certified(st.K, st.e1, st.e2, r, p)[st.view];
          if (cur && cur.sg === sg) cur.b = r; else { cur = { sg, a: r, b: r }; runsAt.push(cur); }
        }
        runsAt.forEach((run) => {
          if (!run.sg || run.b - run.a < 0.05) return;
          const txt = run.sg === '-' ? '−' : run.sg, cx = X((run.a + run.b) / 2), cy = Y(p), wd = txt.length > 1 ? 30 : 24;
          kids.push(s('rect', { x: cx - wd / 2, y: cy - 11, width: wd, height: 22, rx: 11, fill: surface, stroke: cssVar('--axis'), opacity: 0.96 }));
          kids.push(s('text', { x: cx, y: cy + 5, 'text-anchor': 'middle', style: 'font-size:15px;font-weight:700;fill:var(--ink)' }, txt));
        });
      });
    }

    // selected and hovered cells
    const cellRect = (i, j, stroke, w) => s('rect', { x: X(i / NR), y: Y(P_MIN + ((P_MAX - P_MIN) * (j + 1)) / NP), width: g.w / NR, height: g.h / NP, fill: 'none', stroke, 'stroke-width': w, 'pointer-events': 'none' });
    if (st.sel) { kids.push(cellRect(st.sel.i, st.sel.j, surface, 4)); kids.push(cellRect(st.sel.i, st.sel.j, ink, 2)); }
    const hov = s('rect', { width: g.w / NR, height: g.h / NP, fill: 'none', stroke: ink, 'stroke-width': 1.5, opacity: 0, 'pointer-events': 'none' });
    const hit = s('rect', { x: g.x0, y: g.y0, width: g.w, height: g.h, fill: 'transparent', style: 'cursor:crosshair' });
    const at = (ev) => { const r = svg.getBoundingClientRect(), px = ((ev.clientX - r.left) / r.width) * g.W, py = ((ev.clientY - r.top) / r.height) * g.H; return cellOf((px - g.x0) / g.w, P_MAX - ((py - g.y0) / g.h) * (P_MAX - P_MIN)); };
    hit.addEventListener('pointermove', (ev) => {
      const c = at(ev); hov.setAttribute('x', X(c.i / NR)); hov.setAttribute('y', Y(P_MIN + ((P_MAX - P_MIN) * (c.j + 1)) / NP)); hov.setAttribute('opacity', 1);
      Tip.show(ev.clientX, ev.clientY, tipSpec(c.i, c.j));
    });
    hit.addEventListener('pointerleave', () => { hov.setAttribute('opacity', 0); Tip.hide(); });
    hit.addEventListener('click', (ev) => { st.sel = at(ev); drawOverlay(); updateInfo(); });
    kids.push(hov, hit);
    kids.forEach((k) => svg.appendChild(k));
  }

  function tipSpec(i, j) {
    const r = rOf(i), p = pOf(j), d = delta(i, j), cs = ECC.certified(st.K, st.e1, st.e2, r, p);
    const sgn = (v) => (v > 0.0005 ? '+' : v < -0.0005 ? '−' : '') + Math.abs(v).toFixed(2);
    const rows = [{ label: 'Average ΔW', value: d ? sgn(d.dW) : '…' }, { label: 'Truthful ΔW', value: d ? sgn(d.dT) : '…' }, { label: 'Fake ΔW', value: d ? sgn(d.dF) : '…' }];
    const note = cs[st.view] ? 'Certified in the paper: ' + (cs[st.view] === '-' ? 'negative' : cs[st.view] === '+' ? 'positive' : cs[st.view] === '0' ? 'exactly zero' : 'non-positive') : 'Click to inspect this article';
    return { title: 'r = ' + r.toFixed(2) + ', p = ' + p.toFixed(2), rows, note };
  }

  /* ------------------------------------------------------------------ info boxes and tables */
  function updateInfo() {
    const { i, j } = st.sel, r = rOf(i), p = pOf(j), d = delta(i, j), cs = ECC.certified(st.K, st.e1, st.e2, r, p);
    const fmt = (v) => (v > 0.0005 ? '+' : v < -0.0005 ? '−' : '±') + Math.abs(v * 100).toFixed(1) + ' pts';
    info.title.textContent = 'Article with r = ' + r.toFixed(2) + ', p = ' + p.toFixed(2);
    const set = (box, big, sub) => { box.big.textContent = big; box.sub.textContent = sub; };
    if (!d) { ['T', 'F', 'W'].forEach((k) => set(info[k], '…', 'computing')); return; }
    set(info.T, fmt(d.dT), 'if truthful: ' + pct(d.lTH, 0) + ' → ' + pct(d.lTA, 0) + ' correct');
    set(info.F, fmt(d.dF), 'if fake: ' + pct(d.lFH, 0) + ' → ' + pct(d.lFA, 0) + ' correct');
    const reg = ECC.regime(st.K, st.e1, st.e2);
    const cert = cs.dW === '-' ? 'Certified negative (Prop. ' + (reg === 'iii' ? '2' : '3') + 'd)' : cs.dW === '0' ? 'Certified zero' : 'Sign not covered by the propositions';
    set(info.W, fmt(d.dW), cert);
    if (loadBtn) loadBtn.disabled = false;
    drawTable();
  }

  function drawTable() {
    const p = pOf(st.sel.j), MH = ECC.manual(st.K), MA = ECC.auto(st.e1, st.e2), T = ECC.thr;
    const row = (name, m, nm) => h('tr', null, h('td', null, name), ...['rD', 'rhatL', 'rhatD', 'rL'].map((k) => h('td', { class: 'n' }, T[k](m, p).toFixed(3))));
    clear(tableEl);
    tableEl.appendChild(h('table', { class: 'data thr-table' },
      h('thead', null, h('tr', null, h('th', null, 'At p = ' + p.toFixed(2)), h('th', { class: 'n' }, sym('r', 'D')), h('th', { class: 'n' }, [h('i', { class: 'sym' }, 'r̂'), h('sub', null, 'L')]), h('th', { class: 'n' }, [h('i', { class: 'sym' }, 'r̂'), h('sub', null, 'D')]), h('th', { class: 'n' }, sym('r', 'L')))),
      h('tbody', null, row('Manual (H)', MH), row('Automated (A)', MA))));
    tableEl.appendChild(h('p', { class: 'note', style: { margin: '10px 0 0' } }, 'p̄ = ' + ECC.pBar(st.K).toFixed(3) + ' for K', h('sub', null, 'H'), ' = ' + st.K.toFixed(2) + '. Below p̄ the two negative bands overlap on (r̂', h('sub', null, 'L'), '(H), r̂', h('sub', null, 'D'), '(H)); above it they do not.'));
  }

  function updateRegime() {
    const reg = ECC.regime(st.K, st.e1, st.e2);
    const txt = { i: 'Nobody uses automated fact-checking, so ΔW = 0 everywhere.', ii: 'Both methods are used (Proposition 3).', iii: 'Every agent who checks prefers automated fact-checking (Proposition 2).' }[reg];
    clear(regimeEl);
    regimeEl.appendChild(h('span', null, h('b', null, 'Regime (' + reg + '). '), txt));
  }

  function updateProgress() {
    const frac = lam ? runs / PASSES.reduce((a, b) => a + b, 0) : 0;
    progress.firstChild.style.width = (frac * 100) + '%';
    progress.style.opacity = done ? '0' : '1';
    progressTxt.textContent = !lam ? 'Simulating…' : done ? 'Monte Carlo: ' + runs.toLocaleString('en-US') + ' runs per cell and veracity; cell noise about ±0.02.' : 'Refining: ' + runs.toLocaleString('en-US') + ' runs per cell so far…';
    canvas.style.opacity = '1';
  }

  /* ------------------------------------------------------------------ worker */
  function ensureWorker() {
    if (worker) return true;
    try {
      worker = new Worker('assets/js/worker.js');
      worker.onmessage = (ev) => {
        const m = ev.data;
        if (m.type !== 'heat' || m.id !== jobId) return;
        lam = m.lam; runs = m.runs; done = m.last;
        paintHeat(); updateProgress(); updateInfo();
      };
      worker.onerror = () => { progressTxt.textContent = 'The Monte Carlo worker could not start. Serve this page over http(s), e.g. GitHub Pages, rather than from a file.'; };
      return true;
    } catch (e) { progressTxt.textContent = 'This page needs to be served over http(s) for the live simulation.'; return false; }
  }
  function request() {
    if (!ensureWorker()) return;
    jobId++; done = false;
    canvas.style.opacity = '0.55'; progressTxt.textContent = 'Simulating…';
    worker.postMessage({ type: 'heat', id: jobId, KH: st.K, e1: st.e1, e2: st.e2, nr: NR, np: NP, pMin: P_MIN, pMax: P_MAX, passes: PASSES, prior: st.prior });
  }

  /* ------------------------------------------------------------------ controls and build */
  const PRESETS = [
    { label: 'Automated preferred (iii)', K: 0.3, e1: 0.3, e2: 0.1 },
    { label: 'Both used (ii)', K: 0.3, e1: 0.45, e2: 0.15 },
    { label: 'Costly manual, accurate automated', K: 0.4, e1: 0.2, e2: 0.05 },
    { label: 'Automated unused (i)', K: 0.1, e1: 0.3, e2: 0.1 },
  ];
  function setParams(v) { Object.assign(st, v); ctl.K.set(st.K); ctl.e1.set(st.e1); ctl.e2.set(st.e2); changed(); }
  function changed() { updateRegime(); drawOverlay(); updateInfo(); lam && paintHeat(); request(); }

  function replayInSim() {
    if (!window.Sim) return;
    const { i, j } = st.sel, d = delta(i, j);
    const truth = d && d.dF < d.dT ? 1 : 0;      // replay the kind of article the tool hurts more
    Sim.load({ r: rOf(i), p: pOf(j), K: st.K, e1: st.e1, e2: st.e2, truth });
  }

  function build() {
    const root = $('#map-root');
    const redo = UI.rafThrottle(changed);
    ctl.K = slider({ label: ['Manual cost ', sym('K', 'H')], min: 0.05, max: 0.45, step: 0.01, value: st.K, format: f2, onInput: (v) => { st.K = v; redo(); } });
    ctl.e1 = slider({ label: ['Automated false-alarm rate ', sym('e', '1')], min: 0.06, max: 0.55, step: 0.01, value: st.e1, format: f2, onInput: (v) => { st.e1 = v; if (st.e2 >= v) { st.e2 = Math.max(0.02, v - 0.01); ctl.e2.set(st.e2); } redo(); } });
    ctl.e2 = slider({ label: ['Automated miss rate ', sym('e', '2')], min: 0.02, max: 0.40, step: 0.01, value: st.e2, format: f2, onInput: (v) => { st.e2 = v; if (st.e1 <= v) { st.e1 = Math.min(0.55, v + 0.01); ctl.e1.set(st.e1); } redo(); } });
    ctl.view = segmented({ ariaLabel: 'What to colour', options: [{ value: 'dW', label: 'Average' }, { value: 'dT', label: 'Truthful' }, { value: 'dF', label: 'Fake' }], value: st.view, onChange: (v) => { st.view = v; drawOverlay(); paintHeat(); } });
    const prior = h('select', { class: 'sel', 'aria-label': 'Distribution of prior beliefs', onchange: (ev) => { st.prior = ev.target.value; request(); } },
      Object.values(ECC.priors).map((p) => h('option', { value: p.id }, p.label)));
    const theory = h('input', { type: 'checkbox', checked: true, id: 'theory-toggle', onchange: (ev) => { st.theory = ev.target.checked; drawOverlay(); } });
    regimeEl = h('p', { class: 'readout', style: { margin: '8px 0 0' } });
    progressTxt = h('p', { class: 'note', style: { margin: '6px 0 0' }, role: 'status' });
    progress = h('div', { class: 'progress' }, h('i'));
    colorbar = h('div', { class: 'colorbar' });
    cbLabels = [h('span'), h('span')];
    legendEl = h('p', { class: 'note', style: { margin: '10px 0 0' } },
      'Curves: ', sym('r', 'D'), ', ', sym('r', 'L'), ' (the crowd cascades at once, whatever the article) and ', h('i', { class: 'sym' }, 'r̂'), h('sub', null, 'D'), ', ', h('i', { class: 'sym' }, 'r̂'), h('sub', null, 'L'), ' (the thresholds for a perfect checker); (H) manual, (A) automated. Pills mark where the paper certifies the sign of the change. Click a cell to inspect it.');
    const chips = PRESETS.map((pr) => h('button', { type: 'button', class: 'chip', onclick: () => setParams({ K: pr.K, e1: pr.e1, e2: pr.e2 }) }, pr.label));

    canvas = h('canvas', { width: NR, height: NP, style: { width: '100%', height: '100%', display: 'block' }, 'aria-hidden': 'true' });
    ctx = canvas.getContext('2d');
    plot = h('div', { class: 'heat-plot' }, canvas);
    svg = s('svg', { role: 'img', 'aria-label': 'Change in the probability of a correct cascade over article reliability and informativeness. Use the arrow keys on the chart to move between cells.' });
    frame = h('div', { class: 'heat-frame', tabindex: '0', onkeydown: onKey }, plot, svg);

    info.title = h('p', { class: 'chart-title', style: { margin: '18px 0 0' }, 'aria-live': 'polite' });
    ['T', 'F', 'W'].forEach((k, n) => { info[k] = { big: h('div', { class: 'big' }), sub: h('div', { class: 'lbl' }) }; });
    const boxes = [['T', 'Truthful article'], ['F', 'Fake article'], ['W', 'Average at this reliability']].map(([k, t]) => h('div', { class: 'box' }, h('div', { class: 'lbl', style: { fontWeight: 600, color: 'var(--ink)' } }, t), info[k].big, info[k].sub));
    // only offered when the simulator section is on the page
    loadBtn = document.getElementById('sim-root') ? h('button', { type: 'button', class: 'btn sm', disabled: true, onclick: replayInSim }, 'Replay this article in the simulator ↑') : null;
    tableEl = h('div', { class: 'scroll-x' });

    root.appendChild(h('div', { class: 'card pad' },
      h('div', { class: 'map-layout' },
        h('aside', null,
          h('p', { class: 'ctl-title' }, 'Fact-checking'),
          ctl.K.el, ctl.e1.el, ctl.e2.el, regimeEl,
          h('div', { class: 'divider', style: { margin: '14px 0' } }),
          h('p', { class: 'ctl-title' }, 'Colour shows'), ctl.view.el,
          h('p', { class: 'ctl-title', style: { marginTop: '16px' } }, 'Prior beliefs'), prior,
          h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '16px', fontSize: '14px', cursor: 'pointer' } }, theory, 'Show thresholds and certified signs'),
          h('p', { class: 'ctl-title', style: { marginTop: '16px' } }, 'Presets'), h('div', { class: 'chips' }, chips)),
        h('div', null,
          h('p', { class: 'chart-title' }, 'Change in the probability of a correct cascade when automated fact-checking is added'),
          h('p', { class: 'chart-sub' }, 'ΔW = W({manual, automated}) − W({manual}), by article'),
          frame, colorbar, h('div', { class: 'colorbar-labels' }, cbLabels), progress, progressTxt, legendEl)),
      h('div', { class: 'divider' }),
      info.title,
      h('div', { class: 'cell-info' }, boxes),
      loadBtn ? h('div', { class: 'toolbar', style: { marginTop: '12px' } }, loadBtn) : null,
      h('details', { class: 'fold' }, h('summary', null, 'Thresholds for these settings'), h('div', { class: 'fold-body' }, tableEl))));
    root.appendChild(h('p', { class: 'takeaway reveal' }, h('b', null, 'Reading the map. '), 'On the left of the central band the tool can rescue truthful articles that everyone would dismiss; on the right it can rescue fake ones. In between, manual checking already reaches the correct cascade for sure, so the tool can only add mistakes. Make manual checking costlier, or truthful articles less informative, and that harmful band grows.'));
    onResize(plot, () => { drawOverlay(); });
    onTheme(() => { paintHeat(); drawOverlay(); });
    updateRegime(); drawOverlay(); updateInfo(); paintHeat();
    UI.onceVisible(root, request, 0.05);
    // also start as soon as the page is idle, so the map is ready when scrolled to
    setTimeout(() => { if (!lam && !jobId) request(); }, 1200);
  }

  function onKey(ev) {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[ev.key];
    if (!d) return;
    ev.preventDefault();
    st.sel = { i: clamp(st.sel.i + d[0], 0, NR - 1), j: clamp(st.sel.j + d[1], 0, NP - 1) };
    drawOverlay(); updateInfo();
  }

  function init() { if ($('#map-root')) build(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
