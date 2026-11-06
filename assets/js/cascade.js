/*
 * cascade.js — Demo A. The same crowd faces the same article twice: once with manual checking only,
 * once with automated fact-checking on offer as well. Agent by agent, with the crowd's belief and, below, the
 * outcome over thousands of repeated draws.
 */
(function () {
  'use strict';
  const { h, s, $, clear, sym, pct, f2, slider, segmented, Tip, onResize, onceVisible, cssVar, onTheme, clamp, signed } = UI;

  const N = 60;            // agents shown
  const POP_N = 4000;      // repeated draws for the population view
  const ARROW = { L: '7,1.5 13,11.5 1,11.5', D: '7,12.5 13,2.5 1,2.5' };

  /* ------------------------------------------------------------------ agent strip (also used by the hero teaser) */
  function agentTipSpec(step, v, kindLabel) {
    const act = step.action === 'L' ? 'likes' : 'dislikes';
    const rows = [
      { label: 'Leans toward the message (b)', value: step.b.toFixed(2) },
      { label: 'Crowd’s belief: fake', value: pct(step.rho) },
      { label: 'Her own belief: fake', value: pct(step.pi) },
    ];
    if (step.kind === 'C') {
      const nm = step.method === 'M' ? 'Checked manually' : 'Checked with automated fact-checking';
      const right = (step.verdict === 'F') === (v === 1);
      rows.push({ label: nm, value: '“' + (step.verdict === 'F' ? 'fake' : 'true') + '” ' + (right ? '✓' : '✕'), color: step.method === 'M' ? cssVar('--blue') : cssVar('--orange') });
    } else {
      rows.push({ label: 'No check: followed the crowd', value: '' });
    }
    return { title: 'Agent ' + step.t + ' ' + act + ' it', rows, note: step.correct ? 'Her action matches the article’s veracity.' : 'Her action is wrong for this article.' };
  }

  function AgentStrip(container, n, getSpec) {
    const cells = [];
    for (let t = 0; t < n; t++) {
      const poly = s('polygon', { points: ARROW.L });
      const chk = h('i', { class: 'chk' });
      const el = h('button', { type: 'button', class: 'agent', tabindex: '-1', 'aria-hidden': 'true' }, s('svg', { viewBox: '0 0 14 14', 'aria-hidden': 'true' }, poly), chk);
      const show = (ev) => {
        const spec = getSpec && getSpec(t);
        if (!spec) return;
        const r = el.getBoundingClientRect();
        Tip.show(ev.clientX || r.right, ev.clientY || r.bottom, spec);
      };
      el.addEventListener('pointerenter', show);
      el.addEventListener('pointermove', show);
      el.addEventListener('pointerleave', Tip.hide);
      el.addEventListener('focus', show);
      el.addEventListener('blur', Tip.hide);
      container.appendChild(el);
      cells.push({ el, poly, chk });
    }
    return {
      cells,
      /** steps: simulateAgents result for one world; shown: number of agents revealed */
      update(steps, shown, herd, animateLast) {
        cells.forEach((c, t) => {
          const st = steps[t];
          const done = t < shown;
          let cls = 'agent';
          if (done) {
            cls += ' done ' + (st.correct ? 'ok' : 'bad');
            if (animateLast && t === shown - 1) cls += ' latest';
            if (herd && t + 1 === herd.start && shown >= herd.start) cls += ' herd';
          }
          c.el.className = cls;
          c.el.tabIndex = done ? 0 : -1;
          c.el.setAttribute('aria-hidden', done ? 'false' : 'true');
          if (done) {
            c.poly.setAttribute('points', ARROW[st.action]);
            c.chk.className = 'chk ' + (st.kind === 'C' ? (st.method === 'M' ? 'm' : 'a') : '');
            c.chk.style.display = st.kind === 'C' ? '' : 'none';
            c.el.setAttribute('aria-label', 'Agent ' + st.t + (st.action === 'L' ? ' likes' : ' dislikes') + (st.correct ? ', correct' : ', wrong') + (st.kind === 'C' ? ', after checking' : ', followed the crowd'));
          } else c.chk.style.display = 'none';
        });
      },
    };
  }

  /* ------------------------------------------------------------------ state */
  const state = { r: 0.5, p: 0.6, K: 0.3, e1: 0.3, e2: 0.1, truth: 0, seed: 7, shown: 0, playing: false, speed: 1 };
  let chains = [], sims = [], pop = null, timer = null;
  const worlds = [];   // DOM handles per world
  const ctl = {};      // controls

  const WORLDS = [
    { id: 'manual', title: 'Manual checking only', colors: ['--blue'], mk: () => [ECC.manual(state.K)] },
    { id: 'both', title: 'Manual + automated fact-checking', colors: ['--blue', '--orange'], mk: () => [ECC.manual(state.K), ECC.auto(state.e1, state.e2)] },
  ];
  const truthWord = () => (state.truth === 0 ? 'truthful' : 'fake');

  function recompute() {
    const art = { r: state.r, p: state.p, q: 0.5, prior: ECC.priors.arcsine };
    chains = WORLDS.map((w) => ECC.makeChain(ECC.buildPolicy(w.mk()), art));
    sims = ECC.simulateAgents(chains, state.truth, state.seed, N);
    // population view: same random draws for both worlds
    const res = [0, 1].map((v) => ECC.runMany(chains, v, POP_N, 20261106 + v, ECC.T_MAX));
    pop = { T: [0, 1].map((k) => ECC.correctOf(res[0][k], 0) / POP_N), F: [0, 1].map((k) => ECC.correctOf(res[1][k], 1) / POP_N) };
    pop.avg = [0, 1].map((k) => state.r * pop.T[k] + (1 - state.r) * pop.F[k]);
    renderAll();
  }

  /* ------------------------------------------------------------------ rendering */
  function badgeFor(i) {
    const sim = sims[i];
    if (sim.herd && state.shown >= sim.herd.detected) {
      const ok = (sim.herd.action === 'L') === (state.truth === 0);
      return { cls: ok ? 'good' : 'bad', text: (ok ? '✓ ' : '✕ ') + (sim.herd.action === 'L' ? 'Like' : 'Dislike') + ' cascade — ' + (ok ? 'correct' : 'wrong') };
    }
    if (state.shown >= N) return { cls: '', text: 'No cascade yet' };
    return { cls: '', text: state.shown ? 'Learning…' : 'Press play' };
  }

  function drawWho(i) {
    const w = worlds[i], sim = sims[i], pol = chains[i].policy;
    const idx = Math.min(state.shown, N - 1);
    const masses = sim.steps[idx].masses;
    clear(w.whoBar);
    const parts = [];
    pol.basins.forEach((b, k) => {
      let cls, label;
      if (b.kind === 'D') { cls = 'd'; label = 'dislike unchecked'; }
      else if (b.kind === 'L') { cls = 'l'; label = 'like unchecked'; }
      else { const m = pol.methods[b.choice]; cls = m.id === 'M' ? 'm' : 'a'; label = m.id === 'M' ? 'check manually' : 'automated check'; }
      parts.push({ cls, label, mass: masses[k] });
    });
    parts.forEach((p) => {
      if (p.mass < 0.0005) return;
      const icon = p.cls === 'd' ? '▼ ' : p.cls === 'l' ? '▲ ' : '';
      const txt = p.mass > 0.2 ? icon + pct(p.mass) : p.mass > 0.09 ? pct(p.mass) : '';
      const el = h('div', { class: p.cls, style: { flexBasis: (p.mass * 100).toFixed(2) + '%', flexGrow: 0, flexShrink: 0 }, title: pct(p.mass, 1) + ' ' + p.label }, txt);
      w.whoBar.appendChild(el);
    });
    const checking = parts.filter((p) => p.cls === 'm' || p.cls === 'a').reduce((a, p) => a + p.mass, 0);
    w.whoLabel.textContent = state.shown >= N ? 'After agent ' + N + ', the next agent would:' : 'Agent ' + (idx + 1) + ' is about to arrive, and will:';
    w.whoNote.textContent = checking < 0.001 ? 'Nobody checks: a cascade.' : pct(checking) + ' will check';
    w.whoBar.setAttribute('aria-label', parts.map((p) => pct(p.mass) + ' ' + p.label).join(', '));
  }

  function drawBelief(i) {
    const w = worlds[i], sim = sims[i];
    const svg = w.svg, W = Math.max(280, w.beliefBox.clientWidth), H = 188;
    const m = { l: 44, r: 12, t: 8, b: 26 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
    const x = (t) => m.l + (t / N) * pw;
    const ZMAX = 3;
    const y = (z) => m.t + ((ZMAX - clamp(z, -ZMAX, ZMAX)) / (2 * ZMAX)) * ph;
    clear(svg);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const zD = UI.zOfEll(sim.ellD), zL = UI.zOfEll(sim.ellL);
    // cascade zones
    const kids = [];
    if (zD < ZMAX) kids.push(s('rect', { x: m.l, y: m.t, width: pw, height: y(zD) - m.t, fill: 'var(--zone)' }));
    if (zL > -ZMAX) kids.push(s('rect', { x: m.l, y: y(zL), width: pw, height: m.t + ph - y(zL), fill: 'var(--zone)' }));
    // grid + y ticks
    UI.LOGIT_TICKS.forEach(([z, lab]) => {
      kids.push(s('line', { class: 'grid-line', x1: m.l, x2: m.l + pw, y1: y(z), y2: y(z) }));
      kids.push(s('text', { class: 'tick-label', x: m.l - 8, y: y(z) + 4, 'text-anchor': 'end' }, lab));
    });
    for (let t = 0; t <= N; t += 10) kids.push(s('text', { class: 'tick-label', x: x(t), y: H - 8, 'text-anchor': 'middle' }, String(t)));
    kids.push(s('line', { class: 'axis-line', x1: m.l, x2: m.l + pw, y1: m.t + ph, y2: m.t + ph }));
    // zone borders and labels
    if (zD < ZMAX) {
      kids.push(s('line', { x1: m.l, x2: m.l + pw, y1: y(zD), y2: y(zD), stroke: 'var(--ink-2)', 'stroke-width': 1, opacity: 0.55 }));
      if (y(zD) - m.t > 16) kids.push(s('text', { x: m.l + 6, y: m.t + 13, style: 'font-size:11.5px' }, '▼ Dislike cascade zone'));
    }
    if (zL > -ZMAX) {
      kids.push(s('line', { x1: m.l, x2: m.l + pw, y1: y(zL), y2: y(zL), stroke: 'var(--ink-2)', 'stroke-width': 1, opacity: 0.55 }));
      if (m.t + ph - y(zL) > 16) kids.push(s('text', { x: m.l + 6, y: m.t + ph - 6, style: 'font-size:11.5px' }, '▲ Like cascade zone'));
    }
    // trajectory
    const color = cssVar(WORLDS[i].colors[WORLDS[i].colors.length - 1]);
    const pts = [[0, 0]];
    for (let t = 1; t <= state.shown; t++) pts.push([t, UI.zOfEll(sim.steps[t - 1].ellAfter)]);
    if (pts.length > 1) kids.push(s('polyline', { points: pts.map((p) => x(p[0]).toFixed(1) + ',' + y(p[1]).toFixed(1)).join(' '), fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    const last = pts[pts.length - 1];
    kids.push(s('circle', { cx: x(last[0]), cy: y(last[1]), r: 5, fill: color, stroke: cssVar('--surface'), 'stroke-width': 2 }));
    // hover layer
    const cross = s('line', { y1: m.t, y2: m.t + ph, stroke: 'var(--ink-2)', 'stroke-width': 1, opacity: 0, 'pointer-events': 'none' });
    const hit = s('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'transparent' });
    hit.addEventListener('pointermove', (ev) => {
      const r = svg.getBoundingClientRect(), px = ((ev.clientX - r.left) / r.width) * W;
      const t = clamp(Math.round(((px - m.l) / pw) * N), 0, state.shown);
      cross.setAttribute('x1', x(t)); cross.setAttribute('x2', x(t)); cross.setAttribute('opacity', 0.5);
      const z = t === 0 ? 0 : UI.zOfEll(sim.steps[t - 1].ellAfter);
      const rho = 1 / (1 + Math.pow(10, -z));
      const rows = [{ label: 'Crowd believes it is fake', value: pct(rho, rho > 0.99 || rho < 0.01 ? 1 : 0), color, line: true }];
      if (t > 0) rows.push({ label: 'Last agent', value: sim.steps[t - 1].action === 'L' ? 'liked' : 'disliked' });
      Tip.show(ev.clientX, ev.clientY, { title: t === 0 ? 'Before any agent' : 'After agent ' + t, rows });
    });
    hit.addEventListener('pointerleave', () => { cross.setAttribute('opacity', 0); Tip.hide(); });
    kids.push(cross, hit);
    kids.forEach((k) => svg.appendChild(k));
  }

  function renderWorld(i, animate) {
    const w = worlds[i], sim = sims[i];
    w.strip.update(sim.steps, state.shown, sim.herd, animate);
    const b = badgeFor(i);
    w.badge.className = 'badge ' + b.cls;
    w.badge.textContent = b.text;
    drawWho(i);
    drawBelief(i);
  }

  function renderPop() {
    const cols = [['T', 'Truthful articles', 0], ['F', 'Fake articles', 1], ['avg', 'Average at reliability ' + f2(state.r), null]];
    const root = $('#pop-root');
    clear(root);
    cols.forEach(([key, title, v]) => {
      const col = pop[key], d = (col[1] - col[0]) * 100;
      const cur = v !== null && v === state.truth;
      const bars = [['Manual only', col[0], '--blue'], ['Manual + automated', col[1], '--orange']].map(([nm, val, c]) => h('div', { class: 'pbar' },
        h('span', null, nm),
        h('span', { class: 'track' }, h('span', { class: 'fill', style: { width: (val * 100).toFixed(1) + '%', background: 'var(' + c + ')', display: 'block' } })),
        h('span', { class: 'val' }, pct(val, 1))));
      const flat = Math.abs(d) < 1;
      const dl = h('div', { class: 'delta ' + (flat ? 'flat' : d > 0 ? 'good' : 'bad') },
        flat ? '≈ no change' : (d > 0 ? '▲ +' : '▼ −') + Math.abs(d).toFixed(1) + ' points',
        h('span', { class: 'muted', style: { fontWeight: 400 } }, flat ? '' : d > 0 ? 'with automated fact-checking' : 'with automated fact-checking'));
      root.appendChild(h('div', { class: 'pop-col' + (cur ? ' current' : '') }, h('h4', null, title + (cur ? ' (shown above)' : '')), bars, dl));
    });
  }

  function renderNote() {
    const reg = ECC.regime(state.K, state.e1, state.e2);
    const alpha = 1 - (state.e1 + state.e2) / 2;
    const txt = {
      i: 'Manual checking is cheap enough that nobody prefers automated fact-checking, so the two crowds below behave identically.',
      ii: 'Both methods get used, by agents with different beliefs: some check manually, others take the free automated check.',
      iii: 'Manual checking is costly enough that every agent who checks prefers free automated fact-checking.',
    }[reg];
    ctl.note.innerHTML = '';
    ctl.note.appendChild(h('span', null, h('b', null, 'Regime (' + reg + '). '), txt, ' The balanced accuracy of automated fact-checking is ', h('b', null, pct(alpha)), '.'));
  }

  function renderAll() {
    WORLDS.forEach((_, i) => renderWorld(i, false));
    renderPop();
    renderNote();
    ctl.verdict.textContent = 'This article is ' + truthWord() + '.';
    updateButtons();
  }

  /* ------------------------------------------------------------------ playback */
  function updateButtons() {
    ctl.play.textContent = state.playing ? 'Pause' : state.shown >= N ? 'Replay' : state.shown > 0 ? 'Resume' : 'Play';
    ctl.play.setAttribute('aria-pressed', String(state.playing));
  }
  function schedule() {
    clearTimeout(timer);
    if (!state.playing) return;
    timer = setTimeout(() => {
      if (state.shown < N) { state.shown++; WORLDS.forEach((_, i) => renderWorld(i, true)); }
      if (state.shown >= N) { state.playing = false; updateButtons(); return; }
      schedule();
    }, 260 / state.speed);
  }
  function play() {
    if (state.playing) { state.playing = false; clearTimeout(timer); updateButtons(); return; }
    if (state.shown >= N) { state.shown = 0; WORLDS.forEach((_, i) => renderWorld(i, false)); }
    state.playing = true; updateButtons(); schedule();
  }
  const stopPlay = () => { state.playing = false; clearTimeout(timer); };
  function reset() { stopPlay(); state.shown = 0; WORLDS.forEach((_, i) => renderWorld(i, false)); updateButtons(); }
  function step() { stopPlay(); if (state.shown < N) state.shown++; WORLDS.forEach((_, i) => renderWorld(i, true)); updateButtons(); }
  function skip() { stopPlay(); state.shown = N; WORLDS.forEach((_, i) => renderWorld(i, false)); updateButtons(); }

  function newDraw(autoplay = true) {
    stopPlay();
    state.seed = (Math.random() * 2 ** 31) | 0;
    state.shown = 0;
    recompute();
    if (autoplay) play();
  }

  /** Search for a crowd where manual checking lands on the correct cascade and automated fact-checking does not. */
  function findBackfire(budget = 4000) {
    const art = { r: state.r, p: state.p, q: 0.5, prior: ECC.priors.arcsine };
    const cs = WORLDS.map((w) => ECC.makeChain(ECC.buildPolicy(w.mk()), art));
    const want = state.truth === 0 ? 'L' : 'D';
    const base = (Math.random() * 1e6) | 0;
    for (let k = 1; k <= budget; k++) {
      const seed = base + k * 7919;
      const sm = ECC.simulateAgents(cs, state.truth, seed, N);
      const a = sm[0].herd, b = sm[1].herd;
      if (a && b && a.action === want && b.action !== want && a.start <= 12 && b.start <= 24) return seed;
    }
    return null;
  }
  function showBackfire() {
    stopPlay();
    const seed = findBackfire();
    if (seed == null) {
      ctl.msg.textContent = 'No backfire found in thousands of draws: with these settings automated fact-checking does not hurt this kind of article. Try reliability ≈ 0.5.';
      return;
    }
    ctl.msg.textContent = '';
    state.seed = seed; state.shown = 0; recompute(); play();
  }

  /* ------------------------------------------------------------------ presets and controls */
  const PRESETS = [
    { id: 'backfire', label: 'The tool backfires', set: { r: 0.5, p: 0.6, K: 0.3, e1: 0.3, e2: 0.1, truth: 0 }, find: true },
    { id: 'rescue', label: 'The tool rescues a truthful article', set: { r: 0.2, p: 0.6, K: 0.3, e1: 0.3, e2: 0.1, truth: 0 } },
    { id: 'both', label: 'Both methods get used', set: { r: 0.5, p: 0.6, K: 0.3, e1: 0.45, e2: 0.15, truth: 1 }, find: true },
    { id: 'cheap', label: 'Manual is cheap, automated unused', set: { r: 0.5, p: 0.6, K: 0.1, e1: 0.3, e2: 0.1, truth: 0 } },
  ];
  function applySet(set) {
    Object.assign(state, set);
    ctl.r.set(state.r); ctl.p.set(state.p); ctl.K.set(state.K); ctl.e1.set(state.e1); ctl.e2.set(state.e2);
    ctl.truth.set(state.truth === 0 ? 'T' : 'F');
  }
  function applyPreset(pr) {
    ctl.msg.textContent = '';
    ctl.chips.forEach((c, i) => c.setAttribute('aria-pressed', String(PRESETS[i] === pr)));
    applySet(pr.set);
    if (pr.find) showBackfire(); else { stopPlay(); state.shown = 0; recompute(); play(); }
  }
  const unpreset = () => ctl.chips.forEach((c) => c.setAttribute('aria-pressed', 'false'));

  function build() {
    const root = $('#sim-root');
    const redo = () => { unpreset(); stopPlay(); state.shown = 0; ctl.msg.textContent = ''; recompute(); };
    ctl.r = slider({ label: ['Reliability ', sym('r')], min: 0.05, max: 0.95, step: 0.01, value: state.r, format: f2, hint: 'Chance the article is truthful', onInput: (v) => { state.r = v; redo(); } });
    ctl.p = slider({ label: ['Informativeness ', sym('p')], min: 0.55, max: 0.95, step: 0.01, value: state.p, format: f2, hint: 'How well a truthful message tracks reality', onInput: (v) => { state.p = v; redo(); } });
    ctl.truth = segmented({ ariaLabel: 'Is the article truthful or fake', options: [{ value: 'T', label: 'Truthful' }, { value: 'F', label: 'Fake' }], value: 'T', onChange: (v) => { state.truth = v === 'T' ? 0 : 1; redo(); } });
    ctl.K = slider({ label: ['Cost ', sym('K', 'H')], min: 0.05, max: 0.45, step: 0.01, value: state.K, format: f2, hint: 'Cost of a perfect check (payoff is 0 or 1)', onInput: (v) => { state.K = v; redo(); } });
    ctl.e1 = slider({ label: ['False-alarm rate ', sym('e', '1')], min: 0.06, max: 0.55, step: 0.01, value: state.e1, format: f2, hint: 'Automated check calls a truthful article fake', onInput: (v) => { state.e1 = v; if (state.e2 >= v) { state.e2 = Math.max(0.02, v - 0.01); ctl.e2.set(state.e2); } redo(); } });
    ctl.e2 = slider({ label: ['Miss rate ', sym('e', '2')], min: 0.02, max: 0.40, step: 0.01, value: state.e2, format: f2, hint: 'Automated check passes a fake article as true', onInput: (v) => { state.e2 = v; if (state.e1 <= v) { state.e1 = Math.min(0.55, v + 0.01); ctl.e1.set(state.e1); } redo(); } });
    ctl.verdict = h('span', { class: 'readout' });
    ctl.note = h('p', { class: 'readout', style: { margin: '0' } });
    ctl.msg = h('p', { class: 'note', role: 'status', style: { margin: '8px 0 0' } });
    ctl.chips = PRESETS.map((pr) => h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', onclick: () => applyPreset(pr) }, pr.label));
    ctl.play = h('button', { type: 'button', class: 'btn primary sm', onclick: play }, 'Play');
    ctl.speed = segmented({ ariaLabel: 'Playback speed', options: [{ value: 1, label: '1×' }, { value: 3, label: '3×' }, { value: 8, label: '8×' }], value: 1, onChange: (v) => { state.speed = v; } });

    root.appendChild(h('div', { class: 'card pad' },
      h('div', { class: 'controls' },
        h('div', { class: 'ctl-group' }, h('p', { class: 'ctl-title' }, 'The article'), ctl.r.el, ctl.p.el,
          h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } }, ctl.truth.el, ctl.verdict)),
        h('div', { class: 'ctl-group' }, h('p', { class: 'ctl-title' }, 'Manual fact-checking (costly, never wrong)'), ctl.K.el),
        h('div', { class: 'ctl-group' }, h('p', { class: 'ctl-title' }, 'Automated fact-checking (free, error-prone)'), ctl.e1.el, ctl.e2.el)),
      h('div', { class: 'divider' }),
      h('div', { class: 'toolbar' }, h('span', { class: 'note', style: { fontWeight: 600 } }, 'Try:'), h('div', { class: 'chips' }, ctl.chips)),
      h('div', { style: { marginTop: '12px' } }, ctl.note),
      ctl.msg));

    root.appendChild(h('div', { class: 'toolbar', style: { margin: '18px 0 12px' } },
      ctl.play,
      h('button', { type: 'button', class: 'btn sm', onclick: step }, 'Next agent'),
      h('button', { type: 'button', class: 'btn sm', onclick: skip }, 'Skip to end'),
      h('button', { type: 'button', class: 'btn sm', onclick: reset }, 'Reset'),
      h('button', { type: 'button', class: 'btn sm', onclick: () => newDraw(true) }, 'New random crowd'),
      h('button', { type: 'button', class: 'btn sm', onclick: showBackfire }, 'Find me a backfire'),
      h('span', { class: 'spacer' }), ctl.speed.el));

    const worldsEl = h('div', { class: 'worlds' });
    WORLDS.forEach((def, i) => {
      const badge = h('span', { class: 'badge' }, '');
      const stripEl = h('div', { class: 'strip', role: 'list', 'aria-label': def.title + ': the 60 agents in order of arrival' });
      const whoLabel = h('span'), whoNote = h('span', { style: { fontWeight: 600, color: 'var(--ink)' } });
      const whoBar = h('div', { class: 'who-bar', role: 'img' });
      const svg = s('svg', { role: 'img', 'aria-label': 'Crowd belief that the article is fake, by agent' });
      const beliefBox = h('div', { class: 'belief chart' }, svg);
      const keys = def.colors.map((c) => h('span', { class: 'key-sw', style: { background: 'var(' + c + ')' } }));
      const card = h('div', { class: 'card world' },
        h('div', { class: 'world-head' }, h('div', { class: 'world-title' }, h('span', { class: 'pair' }, keys), def.title), badge),
        stripEl,
        h('div', { class: 'who' }, h('div', { class: 'who-label' }, whoLabel, whoNote), whoBar),
        h('p', { class: 'chart-sub', style: { margin: '14px 0 0' } }, 'Crowd’s belief that the article is fake'),
        beliefBox);
      worldsEl.appendChild(card);
      const strip = AgentStrip(stripEl, N, (t) => (t < state.shown ? agentTipSpec(sims[i].steps[t], state.truth) : null));
      worlds.push({ strip, badge, whoBar, whoLabel, whoNote, svg, beliefBox });
      onResize(beliefBox, () => { if (sims[i]) drawBelief(i); });
    });
    root.appendChild(worldsEl);
    root.appendChild(h('div', { class: 'legend', style: { margin: '14px 2px 0' } },
      h('span', { class: 'k' }, h('span', { class: 'key-sw bg-good' }), 'correct action ▲ like / ▼ dislike'),
      h('span', { class: 'k' }, h('span', { class: 'key-sw bg-critical' }), 'wrong action'),
      h('span', { class: 'k' }, h('span', { class: 'key-dot bg-blue' }), 'checked manually'),
      h('span', { class: 'k' }, h('span', { class: 'key-dot bg-orange' }), 'checked with automated fact-checking'),
      h('span', { class: 'k' }, h('span', { style: { width: '12px', height: '12px', borderRadius: '3px', outline: '2px solid var(--ink)', outlineOffset: '1px', display: 'inline-block' } }), 'first agent of the cascade')));

    root.appendChild(h('div', { class: 'card pad', style: { marginTop: '16px' } },
      h('h3', { style: { fontSize: '19px', marginBottom: '4px' } }, 'Not just one crowd: ', POP_N.toLocaleString('en-US'), ' repeats'),
      h('p', { class: 'note', style: { margin: '0 0 14px' } }, 'Probability that the crowd ends in a correct cascade, estimated from simulated crowds with the settings above. Both rows face the same random draws.'),
      h('div', { class: 'pop', id: 'pop-root' })));
  }

  /* ------------------------------------------------------------------ public API (used by other sections) */
  window.Sim = {
    load(params) {
      unpreset();
      const set = { r: params.r, p: params.p, K: params.K, e1: params.e1, e2: params.e2, truth: params.truth == null ? state.truth : params.truth };
      applySet(set);
      stopPlay(); state.shown = 0; ctl.msg.textContent = '';
      recompute();
      document.getElementById('simulate').scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(play, 600);
    },
    AgentStrip, agentTipSpec,
  };

  function init() {
    if (!$('#sim-root')) return;
    build();
    // start with a real backfire, paused, then play once it scrolls into view
    applySet(PRESETS[0].set);
    ctl.chips[0].setAttribute('aria-pressed', 'true');
    const seed = findBackfire(2500);
    if (seed != null) state.seed = seed;
    recompute();
    onceVisible($('#sim-root'), () => { if (state.shown === 0 && !state.playing) play(); }, 0.2);
    onTheme(() => { renderAll(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
