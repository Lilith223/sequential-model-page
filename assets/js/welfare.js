/*
 * welfare.js — the explorer. One set of fact-checking parameters (K_H, e1, e2) drives two figures side by side:
 *   micro: the individual decision rule (rule.js), what one agent does at each belief;
 *   macro: the change in the probability of a correct cascade when automated fact-checking is added to
 *          manual checking, on an (r, p) grid. Cells come from the Monte Carlo worker (progressively refined);
 *          lines and signs are the closed-form thresholds and the regions certified by Propositions 2 and 3.
 * On phones the two figures are tabs in one docked panel, with the controls scrolling underneath.
 */
(function () {
  'use strict';
  const { h, s, $, clear, sym, hat, pct, f2, f3, slider, segmented, Tip, onResize, cssVar, onTheme, clamp } = UI;

  const NR = 80, NP = 32, P_MIN = 0.55, P_MAX = 0.95;
  const PASSES = [30, 60, 120, 240, 480];
  const VIEWS = { dW: { key: 'dW', vmax: 0.25, name: 'Average over articles' }, dT: { key: 'dT', vmax: 0.5, name: 'Truthful articles' }, dF: { key: 'dF', vmax: 0.5, name: 'Fake articles' } };

  const st = { K: 0.3, e1: 0.3, e2: 0.1, view: 'dW', prior: 'arcsine', theory: true, sel: { i: 40, j: 4 } };
  const ctl = {};
  let worker = null, jobId = 0, lam = null, runs = 0, done = false, canvas, frame, plot, svg, ctx, progress, progressTxt, legendEl, tableEl, colorbar, cbLabels, mini = {}, rule, dockEl;

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
  // the poster's scale: purple for a loss, gold for a gain, seven stops from the strongest loss to the strongest gain
  let pal = null;
  function loadPalette() { pal = ['--hm-n3', '--hm-n2', '--hm-n1', '--hm-0', '--hm-p1', '--hm-p2', '--hm-p3'].map((v) => hex(cssVar(v))); pal.mid = pal[3]; }
  function colorOf(d, vmax) {
    const x = (clamp(d / vmax, -1, 1) + 1) * 3, i = Math.min(5, Math.floor(x)), f = x - i;
    return pal[i].map((a, k) => Math.round(a + (pal[i + 1][k] - a) * f));
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
    const vm = vmax.toFixed(2);
    clear(cbLabels[0]); cbLabels[0].append('−' + vm, h('span', { class: 'cb-long' }, '  manual only is better'), h('span', { class: 'cb-short' }, '  manual better'));
    clear(cbLabels[1]); cbLabels[1].append(h('span', { class: 'cb-long' }, 'adding automated fact-checking is better  '), h('span', { class: 'cb-short' }, 'automated better  '), '+' + vm);
  }

  /* ------------------------------------------------------------------ theory overlay */
  function lineSet() {
    const MH = ECC.manual(st.K), MA = ECC.auto(st.e1, st.e2), T = ECC.thr, reg = ECC.regime(st.K, st.e1, st.e2);
    if (reg === 'i') return [];
    const L = {
      rDA: { n: ['r', 'D', '(A)'], f: (p) => T.rD(MA, p) }, rLA: { n: ['r', 'L', '(A)'], f: (p) => T.rL(MA, p) },
      rDH: { n: ['r', 'D', '(H)'], f: (p) => T.rD(MH, p) }, rLH: { n: ['r', 'L', '(H)'], f: (p) => T.rL(MH, p) },
      rhDH: { n: ['r', 'D', '(H)'], hat: true, f: (p) => T.rhatD(MH, p) }, rhLH: { n: ['r', 'L', '(H)'], hat: true, f: (p) => T.rhatL(MH, p) },
    };
    if (reg === 'iii') {
      return { dT: [L.rDA, L.rDH, L.rhLH, L.rLA], dF: [L.rDA, L.rhDH, L.rLH, L.rLA], dW: [L.rDA, L.rhLH, L.rhDH, L.rLA] }[st.view];
    }
    const piStar = (st.e1 - st.K) / (st.e1 - st.e2), kappa = (1 - piStar) / piStar;
    const rStar = { n: ['r', '*', ''], f: (p) => (0.5 * kappa) / (0.5 * kappa + (1 - p)) };
    const rTil = { n: ['r', '', ''], hat: 'tilde', f: (p) => Math.min(rStar.f(p), T.rhatD(MH, p)) };
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
    Tip.hide();      // the old hit layer is about to go, and with it its pointerleave
    clear(svg); svg.setAttribute('viewBox', `0 0 ${g.W} ${g.H}`);
    const X = (r) => g.x0 + r * g.w, Y = (p) => g.y0 + ((P_MAX - p) / (P_MAX - P_MIN)) * g.h;
    const ink = cssVar('--ink'), surface = cssVar('--surface');
    const kids = [];
    let hatLabels = [];      // curve labels whose first letter carries a hat, drawn as a path once the text is measurable
    // axes
    for (let r = 0; r <= 1.0001; r += 0.2) kids.push(s('text', { class: 'tick-label', x: X(r), y: g.y0 + g.h + 17, 'text-anchor': 'middle', style: 'font-size:11.5px;fill:var(--muted)' }, r.toFixed(1)));
    [0.6, 0.7, 0.8, 0.9].forEach((p) => kids.push(s('text', { class: 'tick-label', x: g.x0 - 8, y: Y(p) + 4, 'text-anchor': 'end', style: 'font-size:11.5px;fill:var(--muted)' }, p.toFixed(1))));
    kids.push(s('text', { x: g.x0 + g.w / 2, y: g.y0 + g.h + 36, 'text-anchor': 'middle', style: 'font-size:12.5px;fill:var(--ink-2)' }, 'Article reliability  r'));
    kids.push(s('text', { transform: `translate(14 ${g.y0 + g.h / 2}) rotate(-90)`, 'text-anchor': 'middle', style: 'font-size:12.5px;fill:var(--ink-2)' }, 'Informativeness  p'));

    if (st.theory) {
      // threshold curves with a surface halo
      const lines = lineSet();
      // as on the poster: thresholds of Like (r_L) in red, of Dislike (r_D) in blue, the rest in navy
      const lineColour = (ln) => (ln.n[1] === 'D' ? cssVar('--dislike') : ln.n[1] === 'L' ? cssVar('--like') : ink);
      const reg = ECC.regime(st.K, st.e1, st.e2);
      const pbar = ECC.pBar(st.K);
      const placed = [];
      hatLabels = [];
      lines.forEach((ln) => {
        const pts = []; for (let k = 0; k <= 60; k++) { const p = P_MIN + ((P_MAX - P_MIN) * k) / 60; pts.push(X(clamp(ln.f(p), 0, 1)).toFixed(1) + ',' + Y(p).toFixed(1)); }
        kids.push(s('polyline', { points: pts.join(' '), fill: 'none', stroke: surface, 'stroke-width': 4.5, 'stroke-linejoin': 'round', opacity: 0.9 }));
        kids.push(s('polyline', { points: pts.join(' '), fill: 'none', stroke: lineColour(ln), 'stroke-width': 1.8, 'stroke-linejoin': 'round' }));
      });
      // curve labels along the top edge, staggered when close (omitted on phones: the legend names the curves)
      const narrow = g.w < 400;
      (narrow ? [] : lines).map((ln) => ({ ln, x: X(clamp(ln.f(P_MAX), 0, 1)) })).sort((a, b) => a.x - b.x).forEach((o) => {
        let row = 0; while (placed.some((q) => q.row === row && Math.abs(q.x - o.x) < 40)) row++;
        placed.push({ x: o.x, row });
        const ly = g.y0 + 13 + row * 13, lx = clamp(o.x + 5, g.x0 + 2, g.x0 + g.w - 40);
        const t = subText(lx, ly, o.ln.n, { style: 'font-size:11.5px;font-weight:600;fill:' + lineColour(o.ln) + ';paint-order:stroke;stroke:var(--surface);stroke-width:3px;stroke-linejoin:round' });
        kids.push(t);
        if (o.ln.hat) hatLabels.push({ t, colour: lineColour(o.ln), tilde: o.ln.hat === 'tilde' });
      });
      // p-bar marker (below it the two negative bands overlap)
      if (reg !== 'i' && pbar > P_MIN && pbar < P_MAX) {
        kids.push(s('line', { x1: g.x0 - 6, x2: g.x0 + 6, y1: Y(pbar), y2: Y(pbar), stroke: ink, 'stroke-width': 3 }));
        if (!narrow) kids.push(s('text', { x: g.x0 + 10, y: Y(pbar) - 4, style: 'font-size:11.5px;font-weight:600;fill:var(--ink);paint-order:stroke;stroke:var(--surface);stroke-width:3px' }, 'p̄ = ' + pbar.toFixed(2)));
      }
      // p-kappa (both methods used; fake and average maps): below it the fake-article change is certified only as <= 0, above it strictly
      if (reg === 'ii' && (st.view === 'dF' || st.view === 'dW')) {
        const pk = ECC.pKappa(st.K, st.e1, st.e2);
        if (pk > P_MIN && pk < P_MAX) {
          // the fake map also gets a dotted line across its certified negative band, from r_D(A) to r~ (r~ = r* = rhat_D(H) at p = p_kappa); the average map only the tick, as in the paper
          if (st.view === 'dF') {
            const MHm = ECC.manual(st.K), MAm = ECC.auto(st.e1, st.e2), piS = (st.e1 - st.K) / (st.e1 - st.e2), kap = (1 - piS) / piS;
            const rTilK = Math.min((0.5 * kap) / (0.5 * kap + (1 - pk)), ECC.thr.rhatD(MHm, pk));
            const bx1 = X(clamp(ECC.thr.rD(MAm, pk), 0, 1)), bx2 = X(clamp(rTilK, 0, 1));
            kids.push(s('line', { x1: bx1, x2: bx2, y1: Y(pk), y2: Y(pk), stroke: surface, 'stroke-width': 3.5, opacity: 0.8 }));
            kids.push(s('line', { x1: bx1, x2: bx2, y1: Y(pk), y2: Y(pk), stroke: ink, 'stroke-width': 1.4, 'stroke-dasharray': '2 4', 'stroke-linecap': 'round' }));
          }
          kids.push(s('line', { x1: g.x0 - 6, x2: g.x0 + 6, y1: Y(pk), y2: Y(pk), stroke: ink, 'stroke-width': 3 }));
          if (!narrow) kids.push(subText(g.x0 + 10, Y(pk) + 14, ['p', 'κ', ' = ' + pk.toFixed(2)], { style: 'font-size:11.5px;font-weight:600;fill:var(--ink);paint-order:stroke;stroke:var(--surface);stroke-width:3px' }));
        }
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
          const sm = g.w < 400;       // smaller pills on phones, so they do not swallow the map
          const txt = run.sg === '-' ? '−' : run.sg, cx = X((run.a + run.b) / 2), cy = Y(p), wd = txt.length > 1 ? (sm ? 25 : 30) : (sm ? 20 : 24), hh = sm ? 18 : 22;
          kids.push(s('rect', { x: cx - wd / 2, y: cy - hh / 2, width: wd, height: hh, rx: hh / 2, fill: surface, stroke: cssVar('--axis'), opacity: 0.96 }));
          kids.push(s('text', { x: cx, y: cy + (sm ? 4.5 : 5), 'text-anchor': 'middle', style: 'font-size:' + (sm ? 13 : 15) + 'px;font-weight:700;fill:var(--ink)' }, txt));
        });
      });
    }

    // The only marker on the map: the cell under the mouse or the finger. It exists only while the pointer is on the map;
    // a click or a tap draws nothing that stays, and nothing is marked by default.
    const gr = g.w < 400 ? 4 : 0;       // phones: a cell is ~3 px wide, so the marker is drawn larger
    const hov = s('rect', { width: g.w / NR + 2 * gr, height: g.h / NP + 2 * gr, rx: gr ? 4 : 0, fill: 'none', stroke: ink, 'stroke-width': gr ? 2 : 1.5, opacity: 0, 'pointer-events': 'none' });
    const mark = (i, j) => { hov.setAttribute('x', X(i / NR) - gr); hov.setAttribute('y', Y(P_MIN + ((P_MAX - P_MIN) * (j + 1)) / NP) - gr); hov.setAttribute('opacity', 1); };
    const leave = () => { hov.setAttribute('opacity', 0); Tip.hide(); };
    ov = { mark, leave };
    const hit = s('rect', { x: g.x0, y: g.y0, width: g.w, height: g.h, fill: 'transparent', style: 'cursor:crosshair' });
    const at = (ev) => { const r = svg.getBoundingClientRect(), px = ((ev.clientX - r.left) / r.width) * g.W, py = ((ev.clientY - r.top) / r.height) * g.H; return cellOf((px - g.x0) / g.w, P_MAX - ((py - g.y0) / g.h) * (P_MAX - P_MIN)); };
    hit.addEventListener('pointerdown', (ev) => { if (ev.pointerType !== 'mouse') { const c = at(ev); select(c); mark(c.i, c.j); } });      // a finger selects (for the readout) and marks the cell it lands on
    hit.addEventListener('pointermove', (ev) => {
      const c = at(ev);
      if (ev.pointerType === 'mouse') {
        mark(c.i, c.j);
        Tip.show(ev.clientX, ev.clientY, tipSpec(c.i, c.j));
      } else if (ev.buttons) { select(c); mark(c.i, c.j); }       // finger or pen: drag along the map to move the selection
    });
    hit.addEventListener('pointerup', (ev) => { if (ev.pointerType !== 'mouse') leave(); });      // finger lifted
    hit.addEventListener('pointercancel', leave);      // the browser took the gesture, e.g. a vertical swipe scrolls the page
    hit.addEventListener('pointerleave', leave);
    hit.addEventListener('click', (ev) => select(at(ev)));      // a tap is a click
    kids.push(hov, hit);
    kids.forEach((k) => svg.appendChild(k));
    // hats over the first letter of the labels: a small chevron centred on the measured letter (a combining U+0302 would land in a fallback font)
    hatLabels.forEach(({ t, colour, tilde }) => {
      try {
        const p0 = t.getStartPositionOfChar(0), w = t.getSubStringLength(0, 1);
        if (!(w > 0)) return;
        const cx = p0.x + w / 2 - 0.3, by = p0.y - 11.6, f = (v) => v.toFixed(1);      // clear of the top of the letter (x-height is about 6.3 px at 11.5 px)
        const d = tilde
          ? 'M' + f(cx - 3) + ' ' + f(by + 3.2) + 'C' + f(cx - 1.9) + ' ' + f(by + 1) + ' ' + f(cx - 0.9) + ' ' + f(by + 1) + ' ' + f(cx) + ' ' + f(by + 2.3) + 'S' + f(cx + 1.9) + ' ' + f(by + 3.6) + ' ' + f(cx + 3) + ' ' + f(by + 1.4)
          : 'M' + f(cx - 2.7) + ' ' + f(by + 2.8) + 'L' + f(cx) + ' ' + f(by) + 'L' + f(cx + 2.7) + ' ' + f(by + 2.8);
        const common = { d, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'pointer-events': 'none' };
        svg.insertBefore(s('path', Object.assign({ stroke: surface, 'stroke-width': 3.6 }, common)), t.nextSibling);
        svg.insertBefore(s('path', Object.assign({ stroke: colour, 'stroke-width': 1.4 }, common)), t.nextSibling && t.nextSibling.nextSibling);
      } catch (e) { /* text not measurable: no hat */ }
    });
  }

  /* The marker is moved, not redrawn: redrawing the overlay mid-drag would replace the element the finger is on. */
  let ov = null;      // {mark(i, j), leave()} of the current overlay
  /* The selected cell feeds the readout and the threshold table; it is not drawn on the map. */
  function select(c) {
    if (st.sel && st.sel.i === c.i && st.sel.j === c.j) return;
    st.sel = c; updateInfo();
  }

  function tipSpec(i, j) {
    const r = rOf(i), p = pOf(j), d = delta(i, j), cs = ECC.certified(st.K, st.e1, st.e2, r, p);
    const sgn = (v) => (v > 0.0005 ? '+' : v < -0.0005 ? '−' : '') + Math.abs(v).toFixed(2);
    const rows = [{ label: 'Average ΔW', value: d ? sgn(d.dW) : '…' }, { label: 'Truthful ΔW', value: d ? sgn(d.dT) : '…' }, { label: 'Fake ΔW', value: d ? sgn(d.dF) : '…' }];
    const note = cs[st.view] ? 'Certified in the paper: ' + (cs[st.view] === '-' ? 'negative' : cs[st.view] === '+' ? 'positive' : cs[st.view] === '0' ? 'exactly zero' : 'non-positive') : '';
    return { title: 'r = ' + r.toFixed(2) + ', p = ' + p.toFixed(2), rows, note };
  }

  /* ------------------------------------------------------------------ info boxes and tables */
  /* compact reading of the selected cell, docked under the map on phones */
  function updateMini() {
    const { i, j } = st.sel, d = delta(i, j);
    const mv = (v) => (v > 0.0005 ? '+' : v < -0.0005 ? '−' : '±') + Math.abs(v * 100).toFixed(1);
    mini.r.textContent = 'r = ' + rOf(i).toFixed(2); mini.p.textContent = 'p = ' + pOf(j).toFixed(2);
    [mini.T, mini.F, mini.W].forEach((b) => { b.v.textContent = d ? mv(d[b.key]) : '…'; b.el.classList.toggle('on', b.key === st.view); b.el.setAttribute('aria-pressed', String(b.key === st.view)); });
  }

  function updateInfo() {
    updateMini();
    drawTable();
  }

  function drawTable() {
    const p = pOf(st.sel.j), MH = ECC.manual(st.K), MA = ECC.auto(st.e1, st.e2), T = ECC.thr;
    const row = (name, m, nm) => h('tr', null, h('td', null, name), ...['rD', 'rhatL', 'rhatD', 'rL'].map((k) => h('td', { class: 'n' }, T[k](m, p).toFixed(3))));
    clear(tableEl);
    tableEl.appendChild(h('table', { class: 'data thr-table' },
      h('thead', null, h('tr', null, h('th', null, 'At p = ' + p.toFixed(2)), h('th', { class: 'n' }, sym('r', 'D')), h('th', { class: 'n' }, hat('r', 'L')), h('th', { class: 'n' }, hat('r', 'D')), h('th', { class: 'n' }, sym('r', 'L')))),
      h('tbody', null, row('Manual (H)', MH), row('Automated (A)', MA))));
    tableEl.appendChild(h('p', { class: 'note', style: { margin: '10px 0 0' } }, 'p̄ = ' + ECC.pBar(st.K).toFixed(3) + ' for K', h('sub', null, 'H'), ' = ' + st.K.toFixed(2) + '. Below p̄ the two negative bands overlap on (', hat('r', 'L'), '(H), ', hat('r', 'D'), '(H)); above it they do not.'));
    if (ECC.regime(st.K, st.e1, st.e2) === 'ii') {
      tableEl.appendChild(h('p', { class: 'note', style: { margin: '6px 0 0' } }, sym('p', 'κ'), ' = ' + ECC.pKappa(st.K, st.e1, st.e2).toFixed(3) + ' (tick on the Fake and Average maps, dotted line on the Fake map). Below it the paper certifies the Fake change only as ≤ 0; above it, strictly negative.'));
    }
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
      worker = new Worker('assets/js/worker.js?v=' + (window.ASSET_V || ''));
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
  function changed() { rule.draw(); drawOverlay(); updateInfo(); lam && paintHeat(); request(); }

  function build() {
    const root = $('#map-root');
    const redo = UI.rafThrottle(changed);
    ctl.K = slider({ label: ['Manual cost ', sym('K', 'H')], min: 0.05, max: 0.45, step: 0.01, value: st.K, format: f2, onInput: (v) => { st.K = v; redo(); } });
    ctl.e1 = slider({ label: ['Automated false-alarm rate ', sym('e', '1')], min: 0.06, max: 0.55, step: 0.01, value: st.e1, format: f2, onInput: (v) => { st.e1 = v; if (st.e2 >= v) { st.e2 = Math.max(0.02, v - 0.01); ctl.e2.set(st.e2); } redo(); } });
    ctl.e2 = slider({ label: ['Automated miss rate ', sym('e', '2')], min: 0.02, max: 0.40, step: 0.01, value: st.e2, format: f2, onInput: (v) => { st.e2 = v; if (st.e1 <= v) { st.e1 = Math.min(0.55, v + 0.01); ctl.e1.set(st.e1); } redo(); } });
    // what the map colours: switch above the map (desktop); on phones the three boxes under the map do the same job
    const setView = (v) => { st.view = v; ctl.view.set(v); drawOverlay(); paintHeat(); updateMini(); };
    ctl.view = segmented({ ariaLabel: 'What to colour', options: [{ value: 'dW', label: 'Average' }, { value: 'dT', label: 'Truthful' }, { value: 'dF', label: 'Fake' }], value: st.view, onChange: setView });
    // micro figure: the individual decision rule, for the same K_H, e1, e2
    rule = Rule.create(() => ({ K: st.K, e1: st.e1, e2: st.e2 }));
    const prior = h('select', { class: 'sel', 'aria-label': 'Distribution of prior beliefs', onchange: (ev) => { st.prior = ev.target.value; request(); } },
      Object.values(ECC.priors).map((p) => h('option', { value: p.id }, p.label)));
    const theory = h('input', { type: 'checkbox', checked: true, id: 'theory-toggle', onchange: (ev) => { st.theory = ev.target.checked; drawOverlay(); } });
    progressTxt = h('p', { class: 'note map-note', style: { margin: '6px 0 0' }, role: 'status' });
    progress = h('div', { class: 'progress' }, h('i'));
    colorbar = h('div', { class: 'colorbar' });
    cbLabels = [h('span'), h('span')];
    legendEl = h('p', { class: 'note map-note', style: { margin: '10px 0 0' } },
      'Curves: ', sym('r', 'D'), ', ', sym('r', 'L'), ' (the crowd cascades at once, whatever the article) and ', hat('r', 'D'), ', ', hat('r', 'L'), ' (the thresholds for a perfect checker); (H) manual, (A) automated. Pills mark where the paper certifies the sign of the change: + or − strictly, ≤0 at most zero, 0 no change. Ticks on the left edge mark p̄ and, when both methods are used, ', sym('p', 'κ'), ' (with a dotted line on the Fake map). Hover over a cell (tap it on a phone) to read its values.');
    const chips = PRESETS.map((pr) => h('button', { type: 'button', class: 'chip', onclick: () => setParams({ K: pr.K, e1: pr.e1, e2: pr.e2 }) }, pr.label));

    canvas = h('canvas', { width: NR, height: NP, style: { width: '100%', height: '100%', display: 'block' }, 'aria-hidden': 'true' });
    ctx = canvas.getContext('2d');
    plot = h('div', { class: 'heat-plot' }, canvas);
    svg = s('svg', { role: 'img', 'aria-label': 'Change in the probability of a correct cascade over article reliability and informativeness. Use the arrow keys on the chart to move between cells.' });
    frame = h('div', { class: 'heat-frame', tabindex: '0', onkeydown: onKey, onblur: () => { if (ov) ov.leave(); } }, plot, svg);
    // scrolling moves the map away from a mouse that stays still, and no pointerleave follows
    window.addEventListener('scroll', () => { if (ov && ov.leave) ov.leave(); }, { passive: true });

    tableEl = h('div', { class: 'scroll-x' });

    // compact reading of the selected cell (phones; on a desktop the hover tooltip gives the same numbers)
    const mbox = (key, name) => { const v = h('b'); return { key, v, el: h('button', { type: 'button', class: 'cm-box', 'aria-pressed': 'false', 'aria-label': 'Colour the map by: ' + name, onclick: () => setView(key) }, h('span', { class: 'l' }, name), v) }; };
    mini.r = h('div'); mini.p = h('div');
    mini.T = mbox('dT', 'Truthful'); mini.F = mbox('dF', 'Fake'); mini.W = mbox('dW', 'Average');
    mini.el = h('div', { class: 'cell-mini', 'aria-live': 'polite' }, h('div', { class: 'pos' }, mini.r, mini.p, h('small', null, 'change, pts')), mini.T.el, mini.F.el, mini.W.el);

    // the two figures. On phones they are tabs in one docked panel: the controls scroll underneath it.
    const tabs = segmented({
      ariaLabel: 'Choose the figure', value: 'map',      // phones show the welfare map first; the decision rule is the second tab (the tabs are hidden on wider screens, where the rule is on the left)
      options: [{ value: 'map', label: 'Welfare map' }, { value: 'rule', label: 'Decision rule' }],
      onChange: (v) => { dockEl.setAttribute('data-pane', v); if (v === 'rule') rule.draw(); else { drawOverlay(); paintHeat(); } },
    });
    const mapPane = h('div', { class: 'pane pane-map' },
      h('p', { class: 'pane-kicker' }, 'Macro · the community'),
      h('p', { class: 'chart-title' }, 'What does that do to welfare?'),
      h('p', { class: 'chart-sub' }, 'ΔW = W({manual, automated}) − W({manual}): the change in the probability of a correct cascade, by article'),
      h('div', { class: 'pane-ctl' }, h('span', { class: 'view-cap' }, 'Colour shows'), ctl.view.el),
      frame, colorbar, h('div', { class: 'colorbar-labels' }, cbLabels), mini.el, progress);
    dockEl = h('div', { class: 'dock', 'data-pane': 'map' },
      h('div', { class: 'dock-tabs phone-only' }, tabs.el),
      h('div', { class: 'two-col' }, rule.el, mapPane));

    root.appendChild(h('div', { class: 'card pad dock-card' },
      h('div', { class: 'ex-controls' },
        h('div', { class: 'g-sliders' }, h('p', { class: 'ctl-title' }, 'Fact-checking'), ctl.K.el, ctl.e1.el, ctl.e2.el),
        h('div', { class: 'ex-row2' },
          h('div', { class: 'g-presets' }, h('span', { class: 'note', style: { fontWeight: 600 } }, 'Try:'), h('div', { class: 'chips' }, chips)),
          h('div', { class: 'g-options' },
            h('label', { class: 'opt check' }, theory, 'Show thresholds and certified signs')))),
      h('div', { class: 'divider d-top' }),
      dockEl,
      h('div', { class: 'two-col dock-notes' }, rule.textEl, h('div', null, progressTxt, legendEl)),
      h('div', { class: 'divider' }),
      h('details', { class: 'fold' }, h('summary', null, 'Thresholds for these settings'), h('div', { class: 'fold-body' }, tableEl)),
      h('div', { class: 'ex-prior' }, h('label', { class: 'opt' }, 'Prior beliefs', prior))));
    root.appendChild(h('p', { class: 'takeaway reveal' }, h('b', null, 'Reading the map. '), 'On the left of the central band the tool can rescue truthful articles that everyone would dismiss; on the right it can rescue fake ones. In between, manual checking already reaches the correct cascade for sure, so the tool can only add mistakes. Make manual checking costlier, or truthful articles less informative, and that harmful band grows.'));
    onResize(plot, () => { drawOverlay(); });
    onTheme(() => { paintHeat(); drawOverlay(); });
    rule.draw(); drawOverlay(); updateInfo(); paintHeat();
    UI.onceVisible(root, request, 0.05);
    // also start as soon as the page is idle, so the map is ready when scrolled to
    setTimeout(() => { if (!lam && !jobId) request(); }, 1200);
  }

  function onKey(ev) {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[ev.key];
    if (!d) return;
    ev.preventDefault();
    select({ i: clamp(st.sel.i + d[0], 0, NR - 1), j: clamp(st.sel.j + d[1], 0, NP - 1) });
    if (ov) ov.mark(st.sel.i, st.sel.j);      // keyboard use: the same marker, until focus leaves the map
  }

  function init() { if ($('#map-root')) build(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
