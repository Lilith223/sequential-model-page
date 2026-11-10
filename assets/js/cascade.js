/*
 * cascade.js — the first interactive. ONE fact-checking method (cost K, false-alarm rate e1, miss rate e2) and a
 * crowd of agents who arrive one at a time and see only what the earlier agents did.
 *   left : the posterior decision rule (rule.js): what an agent with a given belief does
 *   right: the simulation: the agents in order of arrival, who is left to check, and the crowd's belief,
 *          which ends in a cascade once nobody checks any more.
 * One set of sliders drives both. (The version with two crowds, with and without a second method, is in archive/cascade.js.)
 */
(function () {
  'use strict';
  const { h, s, $, clear, sym, pct, f2, slider, segmented, Tip, onResize, onceVisible, cssVar, onTheme, clamp } = UI;

  const N = 15;            // agents shown: a cascade usually forms within a handful of them
  const ARROW = { L: '7,1.5 13,11.5 1,11.5', D: '7,12.5 13,2.5 1,2.5' };

  /* ------------------------------------------------------------------ agent strip (also used by the hero teaser) */
  const NAMES = { M: 'Checked manually', A: 'Checked with automated fact-checking' };
  function agentTipSpec(step, v, names, colors, crowdTruthful) {
    names = names || NAMES;
    colors = colors || { M: cssVar('--blue'), A: cssVar('--orange') };
    const act = step.action === 'L' ? 'likes' : 'dislikes';
    const rows = [
      { label: 'Leans toward the message (b)', value: step.b.toFixed(2) },
      crowdTruthful ? { label: 'Crowd’s belief: truthful', value: pct(1 - step.rho) } : { label: 'Crowd’s belief: fake', value: pct(step.rho) },
      { label: crowdTruthful ? 'Her own belief π (that it is fake)' : 'Her own belief: fake', value: pct(step.pi) },
    ];
    if (step.kind === 'C') {
      const right = (step.verdict === 'F') === (v === 1);
      rows.push({ label: names[step.method] || 'Checked it', value: '“' + (step.verdict === 'F' ? 'fake' : 'true') + '” ' + (right ? '✓' : '✕'), color: colors[step.method] });
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
      el.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') Tip.hide(); });      // touch: the tip stays after the finger lifts; a tap elsewhere hides it (ui.js)
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
            cls += ' done ' + (st.correct ? 'ok' : 'bad') + (st.action === 'L' ? ' like' : ' dis');      // cell colour = action, bar colour = right or wrong
            if (animateLast && t === shown - 1) cls += ' latest';
            if (herd && t + 1 === herd.detected && shown >= herd.detected) cls += ' herd';      // first agent to arrive with the public belief inside a cascade set
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
  const state = { r: 0.5, p: 0.9, K: 0.1, e1: 0.1, e2: 0.1, truth: 0, seed: 131, shown: 0, playing: false, speed: 1 };      // seed 131: a few checks, then a correct cascade
  const SPEEDS = [1, 3, 8];
  let chain = null, sim = null, timer = null, autoTimer = null, rule = null, dockEl = null;
  const w = {};        // DOM handles of the simulation
  const ctl = {};      // controls
  const method = () => ({ id: 'M', name: 'Fact-checking', K: state.K, e1: state.e1, e2: state.e2 });
  const truthWord = () => (state.truth === 0 ? 'truthful' : 'fake');
  const beliefH = () => (UI.isPhone() ? 120 : 188);

  function recompute() {
    const art = { r: state.r, p: state.p, q: 0.5, prior: ECC.priors.arcsine };
    chain = ECC.makeChain(ECC.buildPolicy([method()]), art);
    sim = ECC.simulateAgents([chain], state.truth, state.seed, N)[0];
    rule.draw();
    renderAll();
    requestPop();
  }

  /* ------------------------------------------------------------------ rendering */
  const canCheck = () => chain.policy.basins.some((b) => b.kind === 'C');
  function badgeNow() {
    if (sim.herd && state.shown >= sim.herd.detected) {
      const ok = (sim.herd.action === 'L') === (state.truth === 0);
      const fromStart = sim.herd.detected === 1;      // the public belief starts inside a cascade set
      return { cls: ok ? 'good' : 'bad', text: (ok ? '✓ ' : '✕ ') + (sim.herd.action === 'L' ? 'Like' : 'Dislike') + (fromStart ? ' from the start' : ' cascade') + ' — ' + (ok ? 'correct' : 'wrong') };
    }
    // nobody checks: actions say nothing about the article, so the public belief never moves and nothing is learned
    if (!canCheck()) return { cls: '', text: state.shown ? 'Nobody checks: nothing is learned' : 'Press play' };
    if (state.shown >= N) return { cls: '', text: 'No cascade yet' };
    return { cls: '', text: state.shown ? 'Learning…' : 'Press play' };
  }

  function drawWho() {
    const pol = chain.policy;
    const idx = Math.min(state.shown, N - 1);
    const atEnd = state.shown >= N;
    // who the next agent will be: before agent idx+1 arrives, or, once all N have acted, after the last one
    const masses = atEnd ? chain.masses(sim.steps[N - 1].ellAfter) : sim.steps[idx].masses;
    const inCascade = !!sim.herd && sim.herd.detected <= idx + 1;      // the public belief is inside a cascade set by the time she arrives
    clear(w.whoBar);
    const parts = [];
    pol.basins.forEach((b, k) => {
      let cls, label;
      if (b.kind === 'D') { cls = 'd'; label = 'dislike unchecked'; }
      else if (b.kind === 'L') { cls = 'l'; label = 'like unchecked'; }
      else { cls = 'm'; label = 'check'; }
      parts.push({ cls, label, mass: masses[k] });
    });
    parts.forEach((p) => {
      if (p.mass < 0.0005) return;
      const icon = p.cls === 'd' ? '▼ ' : p.cls === 'l' ? '▲ ' : '';
      const txt = p.mass > 0.2 ? icon + pct(p.mass) : p.mass > 0.09 ? pct(p.mass) : '';
      w.whoBar.appendChild(h('div', { class: p.cls, style: { flexBasis: (p.mass * 100).toFixed(2) + '%', flexGrow: 0, flexShrink: 0 }, title: pct(p.mass, 1) + ' ' + p.label }, txt));
    });
    const checking = parts.filter((p) => p.cls === 'm').reduce((a, p) => a + p.mass, 0);
    w.whoLabel.textContent = state.shown >= N ? 'After agent ' + N + ', the next would:' : 'Agent ' + (idx + 1) + ' is about to arrive and will:';
    w.whoNote.textContent = !canCheck() ? 'Checking is never worth it here' : inCascade ? 'Nobody checks: a cascade.' : checking >= 0.001 ? pct(checking) + ' will check' : 'Under 0.1% will check';
    w.whoBar.setAttribute('aria-label', parts.map((p) => pct(p.mass) + ' ' + p.label).join(', '));
  }

  function drawBelief() {
    const svg = w.svg, W = Math.max(240, w.beliefBox.clientWidth), H = beliefH();
    const m = { l: 44, r: 12, t: 8, b: 26 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
    const x = (t) => m.l + (t / N) * pw;
    const ZMAX = 3;
    const y = (z) => m.t + ((ZMAX - clamp(z, -ZMAX, ZMAX)) / (2 * ZMAX)) * ph;
    clear(svg);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    // The axis is the crowd's belief that the article is TRUTHFUL, as log10 odds = log10 of the public likelihood ratio,
    // so a Like cascade is at the top and a Dislike cascade at the bottom: above zLt everybody likes, below zDt everybody dislikes.
    const zt = (ell) => Math.log10(ell);
    const zDt = zt(sim.ellD), zLt = zt(sim.ellL);
    // cascade zones
    const kids = [];
    if (zLt < ZMAX) kids.push(s('rect', { x: m.l, y: m.t, width: pw, height: y(zLt) - m.t, fill: 'var(--like-wash)' }));
    if (zDt > -ZMAX) kids.push(s('rect', { x: m.l, y: y(zDt), width: pw, height: m.t + ph - y(zDt), fill: 'var(--dislike-wash)' }));
    // grid + y ticks
    UI.LOGIT_TICKS.forEach(([z, lab]) => {
      kids.push(s('line', { class: 'grid-line', x1: m.l, x2: m.l + pw, y1: y(z), y2: y(z) }));
      kids.push(s('text', { class: 'tick-label', x: m.l - 8, y: y(z) + 4, 'text-anchor': 'end' }, lab));
    });
    for (let t = 0; t <= N; t += 5) kids.push(s('text', { class: 'tick-label', x: x(t), y: H - 8, 'text-anchor': 'middle' }, String(t)));
    kids.push(s('line', { class: 'axis-line', x1: m.l, x2: m.l + pw, y1: m.t + ph, y2: m.t + ph }));
    // zone borders and labels
    if (zLt < ZMAX) {
      kids.push(s('line', { x1: m.l, x2: m.l + pw, y1: y(zLt), y2: y(zLt), stroke: 'var(--like)', 'stroke-width': 1, opacity: 0.7 }));
      if (y(zLt) - m.t > 16) kids.push(s('text', { x: m.l + 6, y: m.t + 13, style: 'font-size:11.5px;font-weight:600;fill:var(--like)' }, '▲ Like cascade zone'));
    }
    if (zDt > -ZMAX) {
      kids.push(s('line', { x1: m.l, x2: m.l + pw, y1: y(zDt), y2: y(zDt), stroke: 'var(--dislike)', 'stroke-width': 1, opacity: 0.7 }));
      if (m.t + ph - y(zDt) > 16) kids.push(s('text', { x: m.l + 6, y: m.t + ph - 6, style: 'font-size:11.5px;font-weight:600;fill:var(--dislike)' }, '▼ Dislike cascade zone'));
    }
    // trajectory
    const color = cssVar('--ink');
    const pts = [[0, 0]];
    for (let t = 1; t <= state.shown; t++) pts.push([t, zt(sim.steps[t - 1].ellAfter)]);
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
      const z = t === 0 ? 0 : zt(sim.steps[t - 1].ellAfter);
      const rho = 1 / (1 + Math.pow(10, -z));        // belief that the article is truthful
      const rows = [{ label: 'Crowd believes it is truthful', value: pct(rho, rho > 0.99 || rho < 0.01 ? 1 : 0), color, line: true }];
      if (t > 0) rows.push({ label: 'Last agent', value: sim.steps[t - 1].action === 'L' ? 'liked' : 'disliked' });
      Tip.show(ev.clientX, ev.clientY, { title: t === 0 ? 'Before any agent' : 'After agent ' + t, rows });
    });
    hit.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') { cross.setAttribute('opacity', 0); Tip.hide(); } });
    kids.push(cross, hit);
    kids.forEach((k) => svg.appendChild(k));
  }

  function renderWorld(animate) {
    w.strip.update(sim.steps, state.shown, sim.herd, animate);
    const b = badgeNow();
    [w.badge, w.badge2].forEach((el) => { el.className = 'badge ' + b.cls; el.textContent = b.text; });
    drawWho();
    drawBelief();
  }

  function renderNote() {
    const alpha = 1 - (state.e1 + state.e2) / 2;
    ctl.note.textContent = 'The fact-checker costs ' + f2(state.K) + ' and is right ' + pct(alpha) + ' of the time, on average over truthful and fake articles.';
  }

  function renderAll() {
    renderWorld(false);
    renderNote();
    ctl.verdict.textContent = 'This article is ' + truthWord() + '.';
    updateButtons();
  }

  /* ------------------------------------------------------------------ cascade probabilities (many crowds, in a worker) */
  const POP_N = 3000;
  let popWorker = null, popJob = 0, popTimer = null, popKey = '', pop = null;
  function requestPop() {
    const key = [state.K, state.e1, state.e2, state.r, state.p].join(',');       // the veracity does not matter: both are estimated
    if (key === popKey && pop && !pop.error) return;
    popKey = key;
    clearTimeout(popTimer);
    popTimer = setTimeout(() => {
      try {
        if (!popWorker) { popWorker = new Worker('assets/js/worker.js'); popWorker.onmessage = onPop; popWorker.onerror = () => { pop = { error: true }; renderPop(); }; }
      } catch (e) { pop = { error: true }; renderPop(); return; }
      popJob++;
      pop = Object.assign({}, pop, { busy: true }); renderPop();
      popWorker.postMessage({ type: 'cascade', id: popJob, K: state.K, e1: state.e1, e2: state.e2, r: state.r, p: state.p, n: POP_N, within: N });
    }, 150);
  }
  function onPop(ev) {
    const m = ev.data;
    if (m.type !== 'cascade' || m.id !== popJob) return;
    pop = { n: m.n, r: m.r, cnt: m.cnt, early: m.early, busy: !m.last };
    renderPop();
  }
  function renderPop() {
    if (!w.pop) return;
    clear(w.pop); clear(w.popNote);
    w.pop.classList.toggle('busy', !!(pop && pop.busy));
    if (!pop || !pop.cnt) { w.pop.appendChild(h('p', { class: 'note', style: { margin: 0 } }, pop && pop.error ? 'Needs the page to be served over http(s), as on GitHub Pages.' : 'Estimating…')); return; }
    const n = pop.n, rr = pop.r;
    // a Like cascade is right for a truthful article, a Dislike cascade for a fake one
    const T = { right: pop.cnt[0][0] / n, wrong: pop.cnt[0][1] / n, none: pop.cnt[0][2] / n, early: pop.early[0] / n };
    const F = { right: pop.cnt[1][1] / n, wrong: pop.cnt[1][0] / n, none: pop.cnt[1][2] / n, early: pop.early[1] / n };
    const A = {}; Object.keys(T).forEach((k) => { A[k] = rr * T[k] + (1 - rr) * F[k]; });
    const share = (x) => pct(x, x > 0 && x < 0.01 ? 1 : 0);
    [['If the article is truthful', T, 0], ['If the article is fake', F, 1], ['Average at reliability ' + f2(rr), A, null]].forEach(([title, col, v]) => {
      const rows = [['Correct cascade', col.right, '--good'], ['Wrong cascade', col.wrong, '--critical'], ['No cascade', col.none, '--axis']].map(([name, val, colour]) => h('div', { class: 'pbar wide' },
        h('span', null, name),
        h('span', { class: 'track' }, h('span', { class: 'fill', style: { width: (val * 100).toFixed(1) + '%', background: 'var(' + colour + ')', display: 'block' } })),
        h('span', { class: 'val' }, share(val))));
      w.pop.appendChild(h('div', { class: 'pop-col' + (v !== null && v === state.truth ? ' current' : '') }, h('h4', null, title), rows,
        h('p', { class: 'note', style: { margin: '8px 0 0' } }, 'Herded by agent ' + N + ': ' + share(col.early))));
    });
    // when nobody checks, nothing is learned: the public belief cannot move, so a cascade can only exist from the very start
    if (!canCheck()) {
      const g = new Float64Array(2); chain.G(1, g);
      const all = g[1] < ECC.EPS ? 'likes' : g[1] > 1 - ECC.EPS ? 'dislikes' : null;
      w.popNote.textContent = 'Nobody checks at these settings, so actions say nothing about the article and the crowd learns nothing. ' + (all
        ? 'Here the article is so ' + (all === 'likes' ? 'reliable' : 'unreliable') + ' that every agent ' + all + ' it from the first, a cascade without any learning.'
        : 'The public belief never moves, so no cascade can form.');
    }
  }

  /* ------------------------------------------------------------------ playback */
  function updateButtons() {
    ctl.play.textContent = state.playing ? 'Pause' : state.shown >= N ? 'Replay' : state.shown > 0 ? 'Resume' : 'Play';
    ctl.play.setAttribute('aria-pressed', String(state.playing));
    ctl.speed.textContent = state.speed + '×';
  }
  function schedule() {
    clearTimeout(timer);
    if (!state.playing) return;
    timer = setTimeout(() => {
      if (state.shown < N) { state.shown++; renderWorld(true); }
      if (state.shown >= N) { state.playing = false; updateButtons(); return; }
      schedule();
    }, 260 / state.speed);
  }
  function play() {
    clearTimeout(autoTimer);
    if (state.playing) { state.playing = false; clearTimeout(timer); updateButtons(); return; }
    if (state.shown >= N) { state.shown = 0; renderWorld(false); }
    state.playing = true; updateButtons(); schedule();
  }
  const stopPlay = () => { clearTimeout(autoTimer); state.playing = false; clearTimeout(timer); };
  function reset() { stopPlay(); state.shown = 0; renderWorld(false); updateButtons(); }
  function step() { stopPlay(); if (state.shown < N) state.shown++; renderWorld(true); updateButtons(); }
  function newDraw() {
    stopPlay();
    state.seed = (Math.random() * 2 ** 31) | 0;
    state.shown = 0;
    recompute();
    play();
  }

  /* ------------------------------------------------------------------ presets and controls */
  // two independent rows of presets, each leaving the other alone: a fact-checker (K, e1, e2) and an article (r, p, truth)
  const FACT_PRESETS = [
    { label: 'Cheap and fairly accurate', set: { K: 0.1, e1: 0.1, e2: 0.1 } },
    { label: 'Costly but never wrong', set: { K: 0.3, e1: 0, e2: 0 } },
    { label: 'Free but error-prone', set: { K: 0, e1: 0.3, e2: 0.1 } },
    { label: 'Too costly to use', set: { K: 0.45, e1: 0.2, e2: 0.2 } },
  ];
  const ARTICLE_PRESETS = [
    { label: 'Toss-up, truthful', set: { r: 0.5, p: 0.9, truth: 0 } },
    { label: 'Reliable, truthful', set: { r: 0.8, p: 0.9, truth: 0 } },
    { label: 'Reliable, but fake', set: { r: 0.8, p: 0.9, truth: 1 } },
    { label: 'Less reliable, truthful', set: { r: 0.3, p: 0.9, truth: 0 } },
    { label: 'Less reliable, fake', set: { r: 0.3, p: 0.9, truth: 1 } },
  ];
  function applySet(set) {
    Object.assign(state, set);
    ctl.r.set(state.r); ctl.p.set(state.p); ctl.K.set(state.K); ctl.e1.set(state.e1); ctl.e2.set(state.e2);
    ctl.truth.set(state.truth === 0 ? 'T' : 'F');
  }
  function applyPreset(pr, chips, list) {
    chips.forEach((c, i) => c.setAttribute('aria-pressed', String(list[i] === pr)));
    applySet(pr.set);
    stopPlay(); state.shown = 0; recompute(); play();
  }
  const unpress = (chips) => chips.forEach((c) => c.setAttribute('aria-pressed', 'false'));

  function build() {
    const root = $('#sim-root');
    // a slider change restarts the same crowd on the new settings and plays it again once the slider rests
    const restart = () => { stopPlay(); state.shown = 0; recompute(); autoTimer = setTimeout(() => { if (!state.playing) play(); }, 700); };
    const redoFact = UI.rafThrottle(() => { unpress(ctl.chipsF); restart(); });
    const redoArt = UI.rafThrottle(() => { unpress(ctl.chipsA); restart(); });
    ctl.r = slider({ label: ['Reliability ', sym('r')], min: 0.05, max: 0.95, step: 0.01, value: state.r, format: f2, hint: 'Chance the article is truthful', onInput: (v) => { state.r = v; redoArt(); } });
    ctl.p = slider({ label: ['Informativeness ', sym('p')], min: 0.55, max: 0.95, step: 0.01, value: state.p, format: f2, hint: 'How well a truthful message tracks reality', onInput: (v) => { state.p = v; redoArt(); } });
    ctl.truth = segmented({ ariaLabel: 'Is the article truthful or fake', options: [{ value: 'T', label: 'Truthful' }, { value: 'F', label: 'Fake' }], value: 'T', onChange: (v) => { state.truth = v === 'T' ? 0 : 1; redoArt(); } });
    ctl.K = slider({ label: ['Cost ', sym('K')], min: 0, max: 0.45, step: 0.01, value: state.K, format: f2, hint: 'Price of a check (a correct action pays 1, a wrong one 0)', onInput: (v) => { state.K = v; redoFact(); } });
    ctl.e1 = slider({ label: ['False-alarm rate ', sym('e', '1')], min: 0, max: 0.4, step: 0.01, value: state.e1, format: f2, hint: 'It calls a truthful article fake', onInput: (v) => { state.e1 = v; redoFact(); } });
    ctl.e2 = slider({ label: ['Miss rate ', sym('e', '2')], min: 0, max: 0.4, step: 0.01, value: state.e2, format: f2, hint: 'It passes a fake article as true', onInput: (v) => { state.e2 = v; redoFact(); } });
    ctl.verdict = h('span', { class: 'readout' });
    ctl.note = h('p', { class: 'readout', style: { margin: '10px 0 0' } });
    const chipsOf = (list, group) => list.map((pr) => h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', onclick: () => applyPreset(pr, group(), list) }, pr.label));
    ctl.chipsF = chipsOf(FACT_PRESETS, () => ctl.chipsF);
    ctl.chipsA = chipsOf(ARTICLE_PRESETS, () => ctl.chipsA);
    const presetRow = (chips) => h('div', { class: 'g-presets' }, h('span', { class: 'note', style: { fontWeight: 600 } }, 'Try:'), h('div', { class: 'chips' }, chips));
    ctl.play = h('button', { type: 'button', class: 'btn primary sm', onclick: play }, 'Play');
    ctl.speed = h('button', { type: 'button', class: 'btn sm', 'aria-label': 'Playback speed', onclick: () => { state.speed = SPEEDS[(SPEEDS.indexOf(state.speed) + 1) % SPEEDS.length]; updateButtons(); } }, '1×');

    // left: the decision rule for this fact-checker
    rule = Rule.create(() => ({ K: state.K, e1: state.e1, e2: state.e2 }), {
      single: true, kicker: 'Decision rule', title: 'What does an agent do?',
      sub: 'Expected payoff of each option, by the agent’s belief that the article is fake',
    });

    // right: the crowd, agent by agent
    const stripEl = h('div', { class: 'strip', role: 'list', 'aria-label': 'The ' + N + ' agents in order of arrival' });
    w.badge = h('span', { class: 'badge' }, ''); w.badge2 = h('span', { class: 'badge' }, '');
    w.whoLabel = h('span'); w.whoNote = h('span', { style: { fontWeight: 600, color: 'var(--ink)' } });
    w.whoBar = h('div', { class: 'who-bar', role: 'img' });
    w.pop = h('div', { class: 'pop', 'aria-live': 'polite' }); w.popNote = h('p', { class: 'note', style: { margin: '12px 0 0' } });
    w.svg = s('svg', { role: 'img', 'aria-label': 'Crowd belief that the article is truthful, by agent' });
    w.beliefBox = h('div', { class: 'belief chart' }, w.svg);
    w.strip = AgentStrip(stripEl, N, (t) => (sim && t < state.shown ? agentTipSpec(sim.steps[t], state.truth, { M: 'Checked it' }, { M: cssVar('--ink') }, true) : null));
    onResize(w.beliefBox, () => { if (sim) drawBelief(); });
    const simPane = h('div', { class: 'pane pane-sim' },
      h('p', { class: 'pane-kicker' }, 'Sequential choices'),
      h('p', { class: 'chart-title' }, 'What happens when a crowd follows?'),
      h('p', { class: 'chart-sub' }, 'Agents arrive one by one and see only what the others did'),
      h('div', { class: 'pane-ctl sim-player' },
        h('button', { type: 'button', class: 'btn sm', onclick: newDraw }, 'New', h('span', { class: 'hide-phone' }, ' crowd')),
        ctl.play,
        h('button', { type: 'button', class: 'btn sm', onclick: step }, 'Next'),
        h('button', { type: 'button', class: 'btn sm', onclick: reset }, 'Reset'),
        ctl.speed),
      h('div', { class: 'sim-status' }, w.badge),
      stripEl,
      h('div', { class: 'who' }, h('div', { class: 'who-label' }, w.whoLabel, w.whoNote), w.whoBar),
      h('div', { class: 'chart-sub sim-belief-cap' }, h('span', null, 'Crowd’s belief', h('span', { class: 'hide-phone' }, ' that the article is truthful')), w.badge2),
      w.beliefBox);

    // on phones the two figures are tabs in one docked panel, with the controls scrolling underneath it
    const tabs = segmented({
      ariaLabel: 'Choose the figure', value: 'sim',      // phones show the simulation first; the decision rule is the second tab (the tabs are hidden on wider screens, where the rule is on the left)
      options: [{ value: 'sim', label: 'Simulation' }, { value: 'rule', label: 'Decision rule' }],
      onChange: (v) => { dockEl.setAttribute('data-pane', v); if (v === 'rule') rule.draw(); else if (sim) drawBelief(); },
    });
    dockEl = h('div', { class: 'dock', 'data-pane': 'sim' },
      h('div', { class: 'dock-tabs phone-only' }, tabs.el),
      h('div', { class: 'two-col' }, rule.el, simPane));

    root.appendChild(h('div', { class: 'card pad dock-card' },
      h('div', { class: 'ex-controls' },
        h('div', { class: 'g-sliders two' },
          h('div', { class: 'ctl-group' }, h('p', { class: 'ctl-title' }, 'The fact-checker'), ctl.K.el, ctl.e1.el, ctl.e2.el, ctl.note, presetRow(ctl.chipsF)),
          h('div', { class: 'ctl-group' }, h('p', { class: 'ctl-title' }, 'The article'), ctl.r.el, ctl.p.el,
            h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } }, ctl.truth.el, ctl.verdict), presetRow(ctl.chipsA)))),
      h('div', { class: 'divider d-top' }),
      dockEl,
      h('div', { class: 'two-col dock-notes' },
        rule.textEl,
        h('div', { class: 'legend', style: { margin: '14px 2px 0' } },
          h('span', { class: 'k' }, h('span', { class: 'key-sw bg-like' }), '▲ like'),
          h('span', { class: 'k' }, h('span', { class: 'key-sw bg-dislike' }), '▼ dislike'),
          h('span', { class: 'k' }, h('span', { class: 'key-bar bg-good' }), 'right action'),
          h('span', { class: 'k' }, h('span', { class: 'key-bar bg-critical' }), 'wrong action'),
          h('span', { class: 'k' }, h('span', { class: 'key-dot bg-ink' }), 'checked before acting'),
          h('span', { class: 'k' }, h('span', { style: { width: '12px', height: '12px', borderRadius: '3px', outline: '2px solid var(--ink)', outlineOffset: '1px', display: 'inline-block' } }), 'first agent in a cascade'))),
      h('div', { class: 'divider' }),
      h('div', { class: 'cascade-stats' },
        h('h3', { style: { fontSize: '19px', marginBottom: '4px' } }, 'How often does a crowd end in a cascade?'),
        h('p', { class: 'note', style: { margin: '0 0 14px' } }, 'Estimated from ' + POP_N.toLocaleString('en-US') + ' simulated crowds for each kind of article, with the settings above, followed for up to ' + ECC.T_MAX + ' agents. A cascade is right when everybody likes a truthful article or dislikes a fake one.'),
        w.pop, w.popNote)));
  }

  /* ------------------------------------------------------------------ public API (used by the hero teaser) */
  window.Sim = { AgentStrip, agentTipSpec };

  function init() {
    if (!$('#sim-root')) return;
    build();
    applySet(FACT_PRESETS[0].set); applySet(ARTICLE_PRESETS[0].set);
    ctl.chipsF[0].setAttribute('aria-pressed', 'true'); ctl.chipsA[0].setAttribute('aria-pressed', 'true');
    recompute();
    // start when the crowd itself comes into view (on a phone it can be a tab, or screens below the sliders)
    onceVisible($('#sim-root .pane-sim'), () => { if (state.shown === 0 && !state.playing) play(); }, 0.15);
    onTheme(() => { renderAll(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
