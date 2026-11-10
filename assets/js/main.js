/*
 * main.js — page chrome: light theme, scroll reveal, section highlighting, maths, BibTeX copy,
 * and the live teaser in the hero (a real simulation, re-drawn on demand).
 */
(function () {
  'use strict';
  const { h, $, $$, clear, pct, Tip, cssVar, onTheme } = UI;

  /* ---------------------------------------------------------------- theme */
  function initThemeToggle() {
    UI.initTheme();      // light only: there is no toggle any more
  }

  /* ---------------------------------------------------------------- reveal on scroll + nav highlight */
  function initReveal() {
    const els = $$('.reveal');
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
    els.forEach((e) => io.observe(e));
    setTimeout(() => els.forEach((e) => e.classList.add('in')), 4000);   // never leave content hidden
  }
  function initSpy() {
    const links = $$('.nav a');
    const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        links.forEach((a) => a.removeAttribute('aria-current'));
        const a = map.get(en.target.id);
        if (a) { a.setAttribute('aria-current', 'true'); centreInNav(a); }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    map.forEach((_, id) => { const sec = document.getElementById(id); if (sec) io.observe(sec); });
  }
  /**
   * Keep the highlighted link visible inside the (horizontally scrolling) nav on narrow screens.
   * Deliberately NOT scrollIntoView: on an element inside the sticky top bar, Safari and Firefox
   * scroll the whole page towards the bar's unstuck position, which made the page jump back up.
   */
  function centreInNav(a) {
    const nav = a.parentElement;
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    const left = a.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft - (nav.clientWidth - a.offsetWidth) / 2;
    nav.scrollTo({ left, behavior: 'auto' });
  }

  /* ---------------------------------------------------------------- in-page links: smooth, offset for the sticky bar */
  function initAnchors() {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.addEventListener('click', (ev) => {
      const a = ev.target.closest && ev.target.closest('a[href^="#"]');
      if (!a || ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
      const id = a.getAttribute('href').slice(1);
      const target = !id || id === 'top' ? null : document.getElementById(id);
      if (id && id !== 'top' && !target) return;
      ev.preventDefault();
      const top = target ? target.getBoundingClientRect().top + window.scrollY - 60 : 0;
      window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
      try { history.replaceState(null, '', id ? '#' + id : location.pathname); } catch (e) { /* ignore */ }
    });
  }

  /* ---------------------------------------------------------------- maths and bibtex */
  function renderMath() {
    if (typeof window.renderMathInElement !== 'function') return false;
    window.renderMathInElement(document.body, {
      delimiters: [{ left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }],
      throwOnError: false,
    });
    return true;
  }
  function initBib() {
    const btn = $('#copy-bib');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const text = $('#bibtex').innerText;
      try { await navigator.clipboard.writeText(text); }
      catch (e) {
        const r = document.createRange(); r.selectNodeContents($('#bibtex'));
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        try { document.execCommand('copy'); } catch (e2) { /* ignore */ }
      }
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
    });
  }

  /* ---------------------------------------------------------------- hero teaser */
  function initTeaser() {
    const body = $('#teaser-body');
    if (!body || !window.Sim) return;
    const N = 40;
    const P = { r: 0.5, p: 0.6, K: 0.3, e1: 0.3, e2: 0.1 };
    const MH = ECC.manual(P.K), MA = ECC.auto(P.e1, P.e2);
    const chains = [[MH], [MH, MA]].map((ms) => ECC.makeChain(ECC.buildPolicy(ms), { r: P.r, p: P.p, q: 0.5, prior: ECC.priors.arcsine }));
    const rows = [
      { title: 'Manual checking only', keys: ['--blue'] },
      { title: 'Manual + automated fact-checking', keys: ['--blue', '--orange'] },
    ].map((def) => {
      const badge = h('span', { class: 'badge' }, '');
      const strip = h('div', { class: 'strip', style: { minHeight: '60px' }, role: 'list' });
      body.appendChild(h('div', { style: { marginBottom: '14px' } },
        h('div', { class: 'world-head', style: { marginBottom: '8px' } },
          h('div', { class: 'world-title', style: { fontSize: '14.5px' } }, h('span', { class: 'pair' }, def.keys.map((c) => h('span', { class: 'key-sw', style: { background: 'var(' + c + ')' } }))), def.title), badge),
        strip));
      return { badge, strip };
    });
    let sims = null, truth = 0, shown = 0, timer = null;
    rows.forEach((row, i) => { row.api = Sim.AgentStrip(row.strip, N, (t) => (sims && t < shown ? Sim.agentTipSpec(sims[i].steps[t], truth) : null)); });

    function draw(animate) {
      rows.forEach((row, i) => {
        const sim = sims[i];
        row.api.update(sim.steps, shown, sim.herd, animate);
        if (sim.herd && shown >= sim.herd.detected) {
          const ok = (sim.herd.action === 'L') === (truth === 0);
          row.badge.className = 'badge ' + (ok ? 'good' : 'bad');
          row.badge.textContent = (ok ? '✓ ' : '✕ ') + (sim.herd.action === 'L' ? 'Like' : 'Dislike') + ' cascade, ' + (ok ? 'correct' : 'wrong');
        } else { row.badge.className = 'badge'; row.badge.textContent = shown ? 'Learning…' : ''; }
      });
    }
    function draw1() { draw(true); }
    function newCrowd() {
      clearInterval(timer);
      truth = Math.random() < 0.5 ? 0 : 1;
      const want = truth === 0 ? 'L' : 'D';
      const base = (Math.random() * 1e6) | 0;
      let found = null;
      for (let k = 1; k <= 3000 && !found; k++) {
        const sm = ECC.simulateAgents(chains, truth, base + k * 7919, N);
        const a = sm[0].herd, b = sm[1].herd;
        if (a && b && a.action === want && b.action !== want && a.start <= 10 && b.start <= 20) found = sm;
      }
      if (!found) found = ECC.simulateAgents(chains, truth, base, N);
      sims = found; shown = 0; draw(false);
      $('#teaser-sub').textContent = 'The same ' + N + ' agents see the same ' + (truth === 0 ? 'truthful' : 'fake') + ' article (reliability 0.5). Green = correct action, red = wrong.';
      timer = setInterval(() => { shown++; draw1(); if (shown >= N) clearInterval(timer); }, 85);
    }
    $('#teaser-again').addEventListener('click', newCrowd);
    onTheme(() => { if (sims) draw(false); });
    UI.onceVisible($('#teaser'), newCrowd, 0.2);
  }

  /* ---------------------------------------------------------------- boot */
  function boot() {
    // each step on its own: one that fails must not stop the others (a crash before initReveal left the titles invisible)
    [initThemeToggle, initReveal, initSpy, initAnchors, initBib, initTeaser, () => { if (!renderMath()) window.addEventListener('load', renderMath); }]
      .forEach((step) => { try { step(); } catch (e) { console.error(e); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
