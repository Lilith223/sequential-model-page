/*
 * rule.js — the individual decision rule: the expected payoff of not checking and of checking (net of its cost),
 * by the agent's belief, and what she therefore does. Two uses:
 *   - the first interactive: ONE fact-checking method with cost K and error rates e1, e2   (opts.single)
 *   - the explorer: a manual method (cost K, never wrong) next to an automated one (free, error rates e1, e2)
 * The caller owns the parameters and calls draw() whenever they change, so the chart always matches the
 * simulation or the welfare map next to it.
 */
(function () {
  'use strict';
  const { h, s, clear, f3, Tip, onResize, cssVar, onTheme, clamp } = UI;

  const chartH = (W) => (UI.isPhone() ? (W < 520 ? 215 : 250) : 360);     // shorter on phones, so the figure and its controls fit on one screen

  /**
   * Rule.create(params, opts) with params() -> { K, e1, e2 }.
   * opts: { single, kicker, title, sub, hint } (all optional).
   * Returns { el, textEl, draw }: the chart pane, the explanatory text (placed by the caller) and a redraw function.
   */
  function create(params, opts) {
    opts = opts || {};
    const single = !!opts.single;
    // wording of the options in the chart, the readout and the text
    const NAME = single
      ? { M: { act: 'Check', strip: 'Check', short: 'Check', line: 'Check (net of cost)' } }
      : { M: { act: 'Check manually', strip: 'Manual', short: 'Manual', line: 'Manual check (net of cost)' }, A: { act: 'Check with automated fact-checking', strip: 'Automated', short: 'Auto', line: 'Automated check' } };
    const methodsNow = () => {
      const { K, e1, e2 } = params();
      return single ? [{ id: 'M', name: 'Fact-checking', K, e1, e2 }] : [ECC.manual(K), ECC.auto(e1, e2)];
    };
    const label = (b, pol) => (b.kind === 'D' ? 'Dislike' : b.kind === 'L' ? 'Like' : NAME[pol.methods[b.choice].id].act);
    // colours as on the poster: Like red, Dislike blue; a check is navy (one method) or blue / vermillion (manual / automated)
    const checkVar = (mm) => (single ? '--ink' : mm.id === 'M' ? '--blue' : '--orange');
    const colorOf = (b, pol) => (b.kind === 'L' ? '--like' : b.kind === 'D' ? '--dislike' : checkVar(pol.methods[b.choice]));

    let cursor = UI.isPhone() ? 0.5 : null;        // phones start with a reading on show, so the interaction is visible
    const svg = s('svg');
    const box = h('div', { class: 'chart', tabindex: '0', role: 'img', 'aria-label': 'Expected payoff of not checking and of checking, as a function of the agent’s belief. Use the left and right arrow keys to read values.' }, svg);
    // docked readout: what a hover tooltip does on a desktop, for fingers (shown on phones only)
    const ro = h('div', { class: 'ro', 'aria-live': 'polite' }), dock = UI.readout(ro);
    const key = (colour, extra) => h('span', { class: 'key-line', style: Object.assign({ borderColor: colour }, extra || {}) });
    const thick = (v) => key('var(' + v + ')', { borderTopWidth: '4px', width: '9px' });
    const legendEl = h('div', { class: 'legend', style: { marginTop: '6px' } },
      h('span', { class: 'k' }, key('var(--ink-2)'), 'no check'),
      single
        ? h('span', { class: 'k' }, key('var(--ink)'), 'check, net of cost')
        : [h('span', { class: 'k' }, key('var(--blue)'), 'manual check, net of cost'), h('span', { class: 'k' }, key('var(--orange)'), 'automated check')],
      h('span', { class: 'k' }, thick('--like'), single ? thick('--ink') : [thick('--blue'), thick('--orange')], thick('--dislike'), 'what she chooses'));
    const textEl = h('div', { class: 'readout', style: { marginTop: '12px' } });
    const el = h('div', { class: 'pane pane-rule' },
      h('p', { class: 'pane-kicker' }, opts.kicker || 'Micro · one agent'),
      h('p', { class: 'chart-title' }, opts.title || 'What does an agent do?'),
      h('p', { class: 'chart-sub' }, opts.sub || 'Expected payoff of each option, by the agent’s belief that the article is fake'),
      h('div', { class: 'pane-ctl' }, h('span', { class: 'note' }, opts.hint || 'Hover or tap the chart for exact payoffs.')),
      box, ro, legendEl);

    function models() {
      const ms = methodsNow();
      return { ms, pol: ECC.buildPolicy(ms) };
    }

    /* ---------------------------------------------------------------- chart: payoffs */
    function drawChart() {
      const W = Math.max(240, box.clientWidth), H = chartH(W);
      const m = { l: 46, r: 14, t: 14, b: 78 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
      const { ms, pol } = models();
      const x = (v) => m.l + v * pw;
      const Y0 = 0.4, Y1 = 1.0;
      const y = (v) => m.t + ((Y1 - clamp(v, Y0, Y1)) / (Y1 - Y0)) * ph;
      clear(svg); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const ink = cssVar('--ink'), ink2 = cssVar('--ink-2'), surface = cssVar('--surface');
      const colOf = (mm) => cssVar(checkVar(mm));
      const kids = [];
      [0.4, 0.6, 0.8, 1.0].forEach((v) => {
        kids.push(s('line', { class: 'grid-line', x1: m.l, x2: m.l + pw, y1: y(v), y2: y(v) }));
        kids.push(s('text', { class: 'tick-label', x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, v.toFixed(1)));
      });
      kids.push(s('text', { class: 'axis-title', x: 0, y: 0, transform: `translate(12 ${m.t + ph / 2}) rotate(-90)`, 'text-anchor': 'middle' }, 'Expected payoff'));

      // sample points, including every kink exactly
      const xs = [];
      for (let i = 0; i <= 200; i++) xs.push(i / 200);
      ms.forEach((mm) => { const lo = mm.e1 / (1 + mm.e1 - mm.e2), hi = (1 - mm.e1) / (1 - mm.e1 + mm.e2); if (lo > 0) xs.push(lo); if (hi < 1) xs.push(hi); });
      pol.basins.forEach((b) => { xs.push(b.piLo, b.piHi); });
      xs.push(0.5);
      const grid = Array.from(new Set(xs)).sort((a, b) => a - b);
      const fV = (p) => ECC.V(p);
      const fM = ms.map((mm) => (p) => ECC.Vhat(p, mm) - mm.K);
      const fOf = (b) => (b.kind === 'C' ? fM[b.choice] : fV);
      const line = (f, lo, hi) => grid.filter((p) => p >= lo - 1e-12 && p <= hi + 1e-12).map((p) => x(p).toFixed(1) + ',' + y(f(p)).toFixed(1)).join(' ');
      // thin lines for every option
      kids.push(s('polyline', { points: line(fV, 0, 1), fill: 'none', stroke: ink2, 'stroke-width': 1.5, opacity: 0.6 }));
      ms.forEach((mm, k) => kids.push(s('polyline', { points: line(fM[k], 0, 1), fill: 'none', stroke: colOf(mm), 'stroke-width': 1.5, opacity: 0.6 })));
      // the upper envelope: what she actually gets
      const segs = pol.basins.slice().reverse();      // ascending posterior
      segs.forEach((b) => {
        const col = cssVar(colorOf(b, pol));
        kids.push(s('polyline', { points: line(fOf(b), b.piLo, b.piHi), fill: 'none', stroke: col, 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      });
      const cuts = segs.slice(0, -1).map((b) => b.piHi);
      cuts.forEach((c) => {
        const b = segs.find((q) => Math.abs(q.piHi - c) < 1e-12);
        kids.push(s('circle', { cx: x(c), cy: y(fOf(b)(c)), r: 5, fill: ink, stroke: surface, 'stroke-width': 2 }));
      });

      // choice strip under the axis
      const sy = m.t + ph + 12, sh = 26;
      segs.forEach((b) => {
        const c = colorOf(b, pol), x0 = x(b.piLo), x1 = x(b.piHi);
        kids.push(s('rect', { x: x0 + 1, y: sy, width: Math.max(0, x1 - x0 - 2), height: sh, rx: 5, fill: cssVar(c), opacity: 0.22 }));
        if (x1 - x0 > 44) kids.push(s('text', { x: (x0 + x1) / 2, y: sy + 17, 'text-anchor': 'middle', style: 'fill:var(--ink);font-weight:600;font-size:12px' }, b.kind === 'D' ? 'Dislike' : b.kind === 'L' ? 'Like' : NAME[pol.methods[b.choice].id].strip));
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
      // Reading at belief p: moves the cross-hair and fills the docked readout (phones); returns the spec for the tooltip.
      const place = (p) => {
        p = clamp(p, 0, 1); cursor = p;
        cross.setAttribute('x1', x(p)); cross.setAttribute('x2', x(p)); cross.setAttribute('opacity', 0.55);
        const best = segs.find((b) => p >= b.piLo - 1e-12 && p <= b.piHi + 1e-12) || segs[0];
        const bestTxt = label(best, pol).toLowerCase();
        const spec = {
          title: 'Belief π = ' + p.toFixed(2),
          rows: [{ label: 'No check', value: f3(fV(p)), color: ink2, line: true }].concat(ms.map((mm, k) => ({ label: NAME[mm.id].line, short: NAME[mm.id].short, value: f3(fM[k](p)), color: colOf(mm), line: true }))),
          note: 'Best: ' + bestTxt,
        };
        spec.dockNote = 'Best: ' + bestTxt.replace('check with automated fact-checking', 'automated check');       // shorter, for the phone readout
        dock.show(spec);
        return spec;
      };
      const beliefAt = (ev) => { const r = svg.getBoundingClientRect(); return (((ev.clientX - r.left) / r.width) * W - m.l) / pw; };
      // mouse: hover tooltip. touch/pen: tap or drag; the reading stays after the finger lifts.
      hit.addEventListener('pointermove', (ev) => { const spec = place(beliefAt(ev)); if (ev.pointerType === 'mouse') Tip.show(ev.clientX, ev.clientY, spec); });
      hit.addEventListener('pointerdown', (ev) => { if (ev.pointerType !== 'mouse') place(beliefAt(ev)); });
      hit.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') { if (!UI.isPhone()) cross.setAttribute('opacity', 0); Tip.hide(); } });
      box.onkeydown = (ev) => {
        if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
        ev.preventDefault();
        const p = clamp((cursor == null ? 0.5 : cursor) + (ev.key === 'ArrowRight' ? 0.01 : -0.01), 0, 1);
        const spec = place(p), r = svg.getBoundingClientRect();
        Tip.show(r.left + (x(p) / W) * r.width, r.top + r.height * 0.3, spec);
      };
      box.onblur = () => { if (!UI.isPhone()) cross.setAttribute('opacity', 0); Tip.hide(); };
      kids.push(cross, hit);
      kids.forEach((k) => svg.appendChild(k));
      // keep the reading when a slider moves (phones): the cross-hair stays and its numbers update
      if (UI.isPhone() && cursor != null) place(cursor); else dock.empty('Touch the chart to read values.');
    }

    /* ---------------------------------------------------------------- text: the rule in words */
    function drawText() {
      const { K, e1, e2 } = params();
      const { pol } = models();
      const segs = pol.basins.slice().reverse();
      const parts = segs.map((b) => {
        const lo = b.piLo.toFixed(2), hi = b.piHi.toFixed(2);
        return h('li', null, h('b', null, label(b, pol)), b.kind === 'L' ? ' if π < ' + hi : b.kind === 'D' ? ' if π > ' + lo : ' if ' + lo + ' < π < ' + hi);
      });
      let head;
      if (single) {
        const used = pol.basins.some((b) => b.kind === 'C');
        head = h('p', { style: { margin: '0 0 8px' } }, used
          ? 'An agent who is already nearly sure gains nothing from checking, so only those in the middle pay for it.'
          : 'Here a check costs more than it can ever be worth, so nobody checks. Every agent acts on her own belief, so her action says nothing about the article and the crowd learns nothing.');
      } else {
        const reg = ECC.regime(K, e1, e2);
        const why = {
          i: 'Manual checking is cheap enough that automated fact-checking is never the best option: it would help only agents who are already fairly sure. Nobody uses it, so ΔW = 0 everywhere.',
          ii: 'Both are used (Proposition 3). Agents who lean towards liking pay for a manual check; agents who lean towards disliking take the free automated check, which is accurate enough for them.',
          iii: 'Manual checking is so costly that every agent who checks prefers free automated fact-checking (Proposition 2).',
        }[reg];
        head = h('p', { style: { margin: '0 0 8px' } }, h('b', null, 'Regime (' + reg + '). '), why);
      }
      clear(textEl);
      textEl.appendChild(head);
      textEl.appendChild(h('ul', { style: { margin: '0', paddingLeft: '20px' } }, parts));
    }

    const draw = () => { drawChart(); drawText(); };
    onResize(box, drawChart);
    onTheme(drawChart);
    return { el, textEl, draw };
  }

  window.Rule = { create };
})();
