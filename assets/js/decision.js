/*
 * decision.js — Demo B. (1) The individual decision problem: expected payoff of not checking, of a manual
 * check and of an automated check as a function of the agent's belief, and what she therefore does.
 * (2) The share of agents who like, check or dislike as the crowd's belief changes: cascade zones are
 * where the checkers vanish.
 */
(function () {
  'use strict';
  const { h, s, $, clear, sym, pct, f2, f3, slider, Tip, onResize, cssVar, onTheme, clamp } = UI;

  const st = { K: 0.3, e1: 0.45, e2: 0.15, r: 0.5, p: 0.6, cursor: null };
  const ctl = {};
  let box1, svg1, box2, svg2, legendEl, textEl;

  const label = (b, pol) => (b.kind === 'D' ? 'Dislike' : b.kind === 'L' ? 'Like' : pol.methods[b.choice].id === 'M' ? 'Check manually' : 'Check with automated fact-checking');
  const colorOf = (b, pol) => (b.kind === 'C' ? (pol.methods[b.choice].id === 'M' ? '--blue' : '--orange') : null);

  function models() {
    const MH = ECC.manual(st.K), MA = ECC.auto(st.e1, st.e2);
    return { MH, MA, pol: ECC.buildPolicy([MH, MA]) };
  }

  /* ------------------------------------------------------------------ chart 1: payoffs */
  function draw1() {
    const W = Math.max(300, box1.clientWidth), H = 360;
    const m = { l: 46, r: 14, t: 14, b: 78 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
    const { MH, MA, pol } = models();
    const x = (v) => m.l + v * pw;
    const Y0 = 0.4, Y1 = 1.0;
    const y = (v) => m.t + ((Y1 - clamp(v, Y0, Y1)) / (Y1 - Y0)) * ph;
    clear(svg1); svg1.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const blue = cssVar('--blue'), orange = cssVar('--orange'), ink = cssVar('--ink'), ink2 = cssVar('--ink-2'), surface = cssVar('--surface');
    const kids = [];
    [0.4, 0.6, 0.8, 1.0].forEach((v) => {
      kids.push(s('line', { class: 'grid-line', x1: m.l, x2: m.l + pw, y1: y(v), y2: y(v) }));
      kids.push(s('text', { class: 'tick-label', x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, v.toFixed(1)));
    });
    kids.push(s('text', { class: 'axis-title', x: 0, y: 0, transform: `translate(12 ${m.t + ph / 2}) rotate(-90)`, 'text-anchor': 'middle' }, 'Expected payoff'));

    // sample points, including every kink exactly
    const xs = [];
    for (let i = 0; i <= 200; i++) xs.push(i / 200);
    [MH, MA].forEach((mm) => { const lo = mm.e1 / (1 + mm.e1 - mm.e2), hi = (1 - mm.e1) / (1 - mm.e1 + mm.e2); if (lo > 0) xs.push(lo); if (hi < 1) xs.push(hi); });
    pol.basins.forEach((b) => { xs.push(b.piLo, b.piHi); });
    xs.push(0.5);
    const grid = Array.from(new Set(xs)).sort((a, b) => a - b);
    const fV = (p) => ECC.V(p), fH = (p) => ECC.Vhat(p, MH) - MH.K, fA = (p) => ECC.Vhat(p, MA) - MA.K;
    const line = (f, lo, hi) => grid.filter((p) => p >= lo - 1e-12 && p <= hi + 1e-12).map((p) => x(p).toFixed(1) + ',' + y(f(p)).toFixed(1)).join(' ');
    // thin lines for every option
    kids.push(s('polyline', { points: line(fV, 0, 1), fill: 'none', stroke: ink2, 'stroke-width': 1.5, opacity: 0.6 }));
    kids.push(s('polyline', { points: line(fH, 0, 1), fill: 'none', stroke: blue, 'stroke-width': 1.5, opacity: 0.6 }));
    kids.push(s('polyline', { points: line(fA, 0, 1), fill: 'none', stroke: orange, 'stroke-width': 1.5, opacity: 0.6 }));
    // the upper envelope: what she actually gets
    const segs = pol.basins.slice().reverse();      // ascending posterior
    segs.forEach((b) => {
      const f = b.kind === 'C' ? (pol.methods[b.choice].id === 'M' ? fH : fA) : fV;
      const col = b.kind === 'C' ? (pol.methods[b.choice].id === 'M' ? blue : orange) : ink;
      kids.push(s('polyline', { points: line(f, b.piLo, b.piHi), fill: 'none', stroke: col, 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    });
    const cuts = segs.slice(0, -1).map((b) => b.piHi);
    cuts.forEach((c) => {
      const b = segs.find((q) => Math.abs(q.piHi - c) < 1e-12), f = b.kind === 'C' ? (pol.methods[b.choice].id === 'M' ? fH : fA) : fV;
      kids.push(s('circle', { cx: x(c), cy: y(f(c)), r: 5, fill: ink, stroke: surface, 'stroke-width': 2 }));
    });

    // choice strip under the axis
    const sy = m.t + ph + 12, sh = 26;
    segs.forEach((b) => {
      const c = colorOf(b, pol), x0 = x(b.piLo), x1 = x(b.piHi);
      const fill = c ? cssVar(c === '--blue' ? '--blue-wash' : '--orange-wash') : cssVar('--zone');
      kids.push(s('rect', { x: x0 + 1, y: sy, width: Math.max(0, x1 - x0 - 2), height: sh, rx: 5, fill: c ? cssVar(c) : cssVar('--axis'), opacity: c ? 0.28 : 0.35 }));
      if (x1 - x0 > 44) kids.push(s('text', { x: (x0 + x1) / 2, y: sy + 17, 'text-anchor': 'middle', style: 'fill:var(--ink);font-weight:600;font-size:12px' }, b.kind === 'D' ? 'Dislike' : b.kind === 'L' ? 'Like' : pol.methods[b.choice].id === 'M' ? 'Manual' : 'Automated'));
    });
    kids.push(s('line', { class: 'axis-line', x1: m.l, x2: m.l + pw, y1: m.t + ph, y2: m.t + ph }));
    const ticks = [0, 0.25, 0.5, 0.75, 1];
    const labelled = [];
    cuts.forEach((c) => labelled.push(c));
    ticks.forEach((tk) => { if (!labelled.some((c) => Math.abs(x(c) - x(tk)) < 26)) labelled.push(tk); });
    labelled.forEach((v) => {
      const isCut = cuts.includes(v);
      kids.push(s('line', { x1: x(v), x2: x(v), y1: m.t + ph, y2: sy + sh + 3, stroke: isCut ? ink2 : cssVar('--axis'), 'stroke-width': 1 }));
      kids.push(s('text', { class: isCut ? 'tick-label strong' : 'tick-label', x: x(v), y: sy + sh + 17, 'text-anchor': 'middle', style: isCut ? 'fill:var(--ink)' : '' }, v.toFixed(2)));
    });
    kids.push(s('text', { class: 'axis-title', x: m.l + pw / 2, y: H - 6, 'text-anchor': 'middle' }, 'Agent’s belief that the article is fake (posterior π)'));

    // direct labels
    kids.push(s('text', { x: x(0.5) + 6, y: y(fV(0.5)) + 16, 'text-anchor': 'start', style: 'font-size:12px' }, 'no check'));
    // hover layer
    const cross = s('line', { y1: m.t, y2: m.t + ph, stroke: ink2, 'stroke-width': 1, opacity: 0, 'pointer-events': 'none' });
    const hit = s('rect', { x: m.l, y: m.t, width: pw, height: ph + sh + 20, fill: 'transparent' });
    const showAt = (p, cx, cy) => {
      p = clamp(p, 0, 1); st.cursor = p;
      cross.setAttribute('x1', x(p)); cross.setAttribute('x2', x(p)); cross.setAttribute('opacity', 0.55);
      const best = pol.basins.find((b) => p <= b.piHi + 1e-12 && p >= b.piLo - 1e-12) || segs[0];
      Tip.show(cx, cy, {
        title: 'Belief π = ' + p.toFixed(2),
        rows: [
          { label: 'No check', value: f3(fV(p)), color: ink2, line: true },
          { label: 'Manual check (net of cost)', value: f3(fH(p)), color: blue, line: true },
          { label: 'Automated check', value: f3(fA(p)), color: orange, line: true },
        ],
        note: 'Best: ' + label(segs.find((b) => p >= b.piLo - 1e-12 && p <= b.piHi + 1e-12) || best, pol).toLowerCase(),
      });
    };
    hit.addEventListener('pointermove', (ev) => { const r = svg1.getBoundingClientRect(); showAt((((ev.clientX - r.left) / r.width) * W - m.l) / pw, ev.clientX, ev.clientY); });
    hit.addEventListener('pointerleave', () => { cross.setAttribute('opacity', 0); Tip.hide(); });
    box1.onkeydown = (ev) => {
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      ev.preventDefault();
      const p = clamp((st.cursor == null ? 0.5 : st.cursor) + (ev.key === 'ArrowRight' ? 0.01 : -0.01), 0, 1);
      const r = svg1.getBoundingClientRect();
      showAt(p, r.left + (x(p) / W) * r.width, r.top + r.height * 0.3);
    };
    box1.onblur = () => { cross.setAttribute('opacity', 0); Tip.hide(); };
    kids.push(cross, hit);
    kids.forEach((k) => svg1.appendChild(k));
  }

  /* ------------------------------------------------------------------ chart 2: shares by crowd belief */
  function draw2() {
    const W = Math.max(300, box2.clientWidth), H = 360;
    const m = { l: 46, r: 14, t: 14, b: 78 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
    const { pol } = models();
    const chain = ECC.makeChain(pol, { r: st.r, p: st.p, q: 0.5, prior: ECC.priors.arcsine });
    const ZMAX = 3;
    const x = (z) => m.l + ((z + ZMAX) / (2 * ZMAX)) * pw;
    const y = (v) => m.t + (1 - v) * ph;
    clear(svg2); svg2.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const kids = [];
    [0, 0.25, 0.5, 0.75, 1].forEach((v) => {
      kids.push(s('line', { class: 'grid-line', x1: m.l, x2: m.l + pw, y1: y(v), y2: y(v) }));
      kids.push(s('text', { class: 'tick-label', x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, pct(v)));
    });
    kids.push(s('text', { class: 'axis-title', transform: `translate(12 ${m.t + ph / 2}) rotate(-90)`, 'text-anchor': 'middle' }, 'Share of agents'));

    // stacked bands, bottom to top: Like, checks (by increasing posterior), Dislike
    const M = 160, zs = [];
    for (let i = 0; i <= M; i++) zs.push(-ZMAX + (2 * ZMAX * i) / M);
    const rows = zs.map((z) => chain.masses(Math.pow(10, -z)));      // in b-order: D, ..., L
    const nb = pol.basins.length, order = [];
    for (let k = nb - 1; k >= 0; k--) order.push(k);                  // L first (bottom)
    const cum = rows.map(() => 0);
    const bandFill = (b) => (b.kind === 'D' ? [cssVar('--ink-2'), 0.42] : b.kind === 'L' ? [cssVar('--axis'), 0.55] : [cssVar(pol.methods[b.choice].id === 'M' ? '--blue' : '--orange'), 0.9]);
    order.forEach((k) => {
      const b = pol.basins[k], lower = cum.slice(), upper = rows.map((r, i) => (cum[i] += r[k]));
      if (!rows.some((r) => r[k] > 1e-4)) return;
      const top = zs.map((z, i) => x(z).toFixed(1) + ',' + y(upper[i]).toFixed(1));
      const bot = zs.map((z, i) => x(z).toFixed(1) + ',' + y(lower[i]).toFixed(1)).reverse();
      const [fill, op] = bandFill(b);
      kids.push(s('polygon', { points: top.concat(bot).join(' '), fill, opacity: op, stroke: cssVar('--surface'), 'stroke-width': 2, 'stroke-linejoin': 'round' }));
    });
    // axes and ticks (crowd belief on a logit scale)
    kids.push(s('line', { class: 'axis-line', x1: m.l, x2: m.l + pw, y1: m.t + ph, y2: m.t + ph }));
    UI.LOGIT_TICKS.forEach(([z, lab]) => {
      kids.push(s('line', { x1: x(z), x2: x(z), y1: m.t + ph, y2: m.t + ph + 4, stroke: cssVar('--axis') }));
      kids.push(s('text', { class: 'tick-label', x: x(z), y: m.t + ph + 18, 'text-anchor': 'middle' }, lab));
    });
    kids.push(s('text', { class: 'axis-title', x: m.l + pw / 2, y: H - 30, 'text-anchor': 'middle' }, 'Crowd’s belief that the article is fake'));
    // cascade-zone markers
    const zD = UI.zOfEll(chain.ellD), zL = UI.zOfEll(chain.ellL);
    const zoneNote = (z, side) => {
      if (z < -ZMAX || z > ZMAX) return;
      kids.push(s('line', { x1: x(z), x2: x(z), y1: m.t, y2: m.t + ph, stroke: cssVar('--ink'), 'stroke-width': 1, opacity: 0.7 }));
      const txt = side === 'L' ? '◂ Like cascade' : 'Dislike cascade ▸';
      kids.push(s('text', { x: x(z) + (side === 'L' ? -6 : 6), y: H - 8, 'text-anchor': side === 'L' ? 'end' : 'start', style: 'font-size:12px;font-weight:600;fill:var(--ink)' }, txt));
    };
    zoneNote(zL, 'L'); zoneNote(zD, 'D');

    // hover
    const cross = s('line', { y1: m.t, y2: m.t + ph, stroke: cssVar('--ink'), 'stroke-width': 1, opacity: 0, 'pointer-events': 'none' });
    const hit = s('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'transparent' });
    hit.addEventListener('pointermove', (ev) => {
      const r = svg2.getBoundingClientRect(), px = ((ev.clientX - r.left) / r.width) * W;
      const z = clamp(((px - m.l) / pw) * 2 * ZMAX - ZMAX, -ZMAX, ZMAX);
      cross.setAttribute('x1', x(z)); cross.setAttribute('x2', x(z)); cross.setAttribute('opacity', 0.55);
      const ms = chain.masses(Math.pow(10, -z)), trs = [];
      order.forEach((k) => {
        const b = pol.basins[k]; if (ms[k] < 0.0005) return;
        trs.push({ label: label(b, pol), value: pct(ms[k], 1), color: b.kind === 'C' ? cssVar(pol.methods[b.choice].id === 'M' ? '--blue' : '--orange') : cssVar('--axis') });
      });
      const rho = 1 / (1 + Math.pow(10, -z));
      Tip.show(ev.clientX, ev.clientY, { title: 'Crowd believes it is fake: ' + pct(rho, rho > 0.99 || rho < 0.01 ? 1 : 0), rows: trs.reverse() });
    });
    hit.addEventListener('pointerleave', () => { cross.setAttribute('opacity', 0); Tip.hide(); });
    kids.push(cross, hit);
    kids.forEach((k) => svg2.appendChild(k));
  }

  /* ------------------------------------------------------------------ text */
  function drawText() {
    const { pol } = models();
    const reg = ECC.regime(st.K, st.e1, st.e2);
    const segs = pol.basins.slice().reverse();
    const parts = segs.map((b) => {
      const lo = b.piLo.toFixed(2), hi = b.piHi.toFixed(2);
      return h('li', null, h('b', null, label(b, pol)), b.kind === 'L' ? ' if π < ' + hi : b.kind === 'D' ? ' if π > ' + lo : ' if ' + lo + ' < π < ' + hi);
    });
    clear(textEl);
    const why = {
      i: 'Manual checking is cheap enough that automated fact-checking is never the best option: it would help only agents who are already fairly sure.',
      ii: 'Both are used. Agents who lean towards liking pay for a manual check; agents who lean towards disliking take the free automated check, which is accurate enough for them.',
      iii: 'Manual checking is so costly that every agent who checks prefers free automated fact-checking.',
    }[reg];
    textEl.appendChild(h('p', { style: { margin: '0 0 8px' } }, h('b', null, 'Regime (' + reg + '). '), why));
    textEl.appendChild(h('ul', { style: { margin: '0', paddingLeft: '20px' } }, parts));
  }

  function drawAll() { draw1(); draw2(); drawText(); drawLegend(); }
  function drawLegend() {
    const { pol } = models();
    clear(legendEl);
    const items = [['ink', 'No check', 'line']];
    legendEl.appendChild(h('span', { class: 'k' }, h('span', { class: 'key-line', style: { borderColor: 'var(--ink-2)' } }), 'no check'));
    legendEl.appendChild(h('span', { class: 'k' }, h('span', { class: 'key-line', style: { borderColor: 'var(--blue)' } }), 'manual check, net of cost'));
    legendEl.appendChild(h('span', { class: 'k' }, h('span', { class: 'key-line', style: { borderColor: 'var(--orange)' } }), 'automated check'));
    legendEl.appendChild(h('span', { class: 'k' }, h('span', { class: 'key-line', style: { borderColor: 'var(--ink)', borderTopWidth: '4px' } }), 'what she chooses'));
  }

  /* ------------------------------------------------------------------ build */
  const PRESETS = [
    { label: 'Automated never used', K: 0.1, e1: 0.3, e2: 0.1 },
    { label: 'Both used', K: 0.3, e1: 0.45, e2: 0.15 },
    { label: 'Automated preferred', K: 0.3, e1: 0.3, e2: 0.1 },
  ];
  function setAll(v) {
    Object.assign(st, v);
    ['K', 'e1', 'e2', 'r', 'p'].forEach((k) => ctl[k].set(st[k]));
    drawAll();
  }

  function build() {
    const root = $('#decision-root');
    const redo = UI.rafThrottle(drawAll);
    ctl.K = slider({ label: ['Manual cost ', sym('K', 'H')], min: 0.05, max: 0.45, step: 0.01, value: st.K, format: f2, onInput: (v) => { st.K = v; redo(); } });
    ctl.e1 = slider({ label: ['Automated false-alarm rate ', sym('e', '1')], min: 0.06, max: 0.55, step: 0.01, value: st.e1, format: f2, onInput: (v) => { st.e1 = v; if (st.e2 >= v) { st.e2 = Math.max(0.02, v - 0.01); ctl.e2.set(st.e2); } redo(); } });
    ctl.e2 = slider({ label: ['Automated miss rate ', sym('e', '2')], min: 0.02, max: 0.40, step: 0.01, value: st.e2, format: f2, onInput: (v) => { st.e2 = v; if (st.e1 <= v) { st.e1 = Math.min(0.55, v + 0.01); ctl.e1.set(st.e1); } redo(); } });
    ctl.r = slider({ label: ['Article reliability ', sym('r')], min: 0.05, max: 0.95, step: 0.01, value: st.r, format: f2, onInput: (v) => { st.r = v; redo(); } });
    ctl.p = slider({ label: ['Informativeness ', sym('p')], min: 0.55, max: 0.95, step: 0.01, value: st.p, format: f2, onInput: (v) => { st.p = v; redo(); } });
    const chips = PRESETS.map((pr) => h('button', { type: 'button', class: 'chip', onclick: () => setAll({ K: pr.K, e1: pr.e1, e2: pr.e2 }) }, pr.label));
    box1 = h('div', { class: 'chart', tabindex: '0', role: 'img', 'aria-label': 'Expected payoff of not checking, checking manually and checking with automated fact-checking as a function of the agent’s belief. Use the left and right arrow keys to read values.' }, svg1 = s('svg'));
    box2 = h('div', { class: 'chart', role: 'img', 'aria-label': 'Share of agents who like, check or dislike as a function of the crowd’s belief' }, svg2 = s('svg'));
    legendEl = h('div', { class: 'legend', style: { marginTop: '6px' } });
    textEl = h('div', { class: 'readout', style: { marginTop: '12px' } });

    root.appendChild(h('div', { class: 'card pad' },
      h('div', { class: 'controls', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' } },
        h('div', { class: 'ctl-group' }, h('p', { class: 'ctl-title' }, 'Fact-checking'), ctl.K.el, ctl.e1.el, ctl.e2.el),
        h('div', { class: 'ctl-group' }, h('p', { class: 'ctl-title' }, 'Article (right chart only)'), ctl.r.el, ctl.p.el,
          h('p', { class: 'note', style: { margin: 0 } }, 'Prior beliefs follow a polarised Beta(½, ½) distribution.'))),
      h('div', { class: 'toolbar', style: { marginTop: '4px' } }, h('span', { class: 'note', style: { fontWeight: 600 } }, 'Try:'), h('div', { class: 'chips' }, chips)),
      h('div', { class: 'divider' }),
      h('div', { class: 'two-col' },
        h('div', null,
          h('p', { class: 'chart-title' }, '1 · What does an agent do?'),
          h('p', { class: 'chart-sub' }, 'Expected payoff of each option, by the agent’s belief that the article is fake'),
          box1, legendEl, textEl),
        h('div', null,
          h('p', { class: 'chart-title' }, '2 · Who is left to check as the crowd gets convinced?'),
          h('p', { class: 'chart-sub' }, 'Share of arriving agents who like, check or dislike, by the crowd’s belief'),
          box2,
          h('div', { class: 'legend', style: { marginTop: '6px' } },
            h('span', { class: 'k' }, h('span', { class: 'key-sw bg-blue' }), 'check manually'),
            h('span', { class: 'k' }, h('span', { class: 'key-sw bg-orange' }), 'check with automated fact-checking'),
            h('span', { class: 'k' }, h('span', { class: 'key-sw', style: { background: 'var(--ink-2)', opacity: 0.45 } }), 'dislike unchecked'),
            h('span', { class: 'k' }, h('span', { class: 'key-sw', style: { background: 'var(--axis)', opacity: 0.6 } }), 'like unchecked')),
          h('p', { class: 'note', style: { margin: '12px 0 0' } }, 'Where the coloured bands vanish, every agent follows the crowd and no new information enters: the cascade zones.'))),
    ));
    root.appendChild(h('p', { class: 'takeaway reveal' }, h('b', null, 'Why it matters. '), 'A free but noisy tool pays off for agents who are already fairly sure (belief near 0 or 1), so more of them check. That widens the band of beliefs in which the crowd keeps learning, and also hands the tool’s errors to the crowd.'));
    onResize(box1, draw1); onResize(box2, draw2);
    onTheme(drawAll);
    drawAll();
  }
  function init() { if ($('#decision-root')) build(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
