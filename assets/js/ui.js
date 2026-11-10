/*
 * ui.js — small DOM helpers shared by the demos: element builders (text always via textContent),
 * theme handling, one global tooltip, slider / segmented controls, number formatting.
 */
(function (root) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  /** h('div', {class:'x', onclick: fn}, 'text', childNode, ...) */
  function build(el, attrs, kids) {
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.setAttribute('class', v);
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    const add = (c) => {
      if (c == null || c === false) return;
      if (Array.isArray(c)) c.forEach(add);
      else el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    };
    add(kids);
    return el;
  }
  const h = (tag, attrs, ...kids) => build(document.createElement(tag), attrs, kids);
  const s = (tag, attrs, ...kids) => build(document.createElementNS(SVG_NS, tag), attrs, kids);
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  /** Math symbol with optional subscript: sym('K', 'H') → <i class="sym">K</i><sub>H</sub> */
  const sym = (name, sub) => [h('i', { class: 'sym' }, name), sub ? h('sub', null, sub) : null];

  /* ---------------------------------------------------------------- number formatting */
  const pct = (x, d = 0) => (100 * x).toFixed(d) + '%';
  const f2 = (x) => x.toFixed(2);
  const f3 = (x) => x.toFixed(3);
  const signed = (x, d = 1) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d);
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------------------------------------------------------------- theme */
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const isDark = () => {
    const t = document.documentElement.getAttribute('data-theme');
    return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  };
  const themeListeners = [];
  const onTheme = (fn) => themeListeners.push(fn);
  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('theme', t); } catch (e) { /* private mode */ }
    themeListeners.forEach((fn) => fn(t));
  }
  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem('theme'); } catch (e) { /* ignore */ }
    if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (!document.documentElement.getAttribute('data-theme')) themeListeners.forEach((fn) => fn());
    });
  }

  /* ---------------------------------------------------------------- tooltip */
  let tipEl = null;
  function tipNode() {
    if (!tipEl) { tipEl = h('div', { class: 'tip', role: 'tooltip' }); document.body.appendChild(tipEl); }
    return tipEl;
  }
  /**
   * Tip.show(clientX, clientY, {title, rows:[{label, value, color, line}]})  — values lead, labels follow.
   */
  const Tip = {
    show(x, y, spec) {
      const el = tipNode();
      clear(el);
      if (spec.title) el.appendChild(h('div', { class: 't' }, spec.title));
      (spec.rows || []).forEach((r) => {
        const key = r.color ? h(r.line ? 'span' : 'span', { class: r.line ? 'ln' : 'key-dot', style: r.line ? { borderColor: r.color } : { background: r.color } }) : null;
        el.appendChild(h('div', { class: 'row' }, h('span', { class: 'lab' }, key, r.label), h('span', { class: 'v' }, r.value == null ? '' : r.value)));
      });
      if (spec.note) el.appendChild(h('div', { class: 'note', style: { marginTop: '4px' } }, spec.note));
      el.classList.add('on');
      const pad = 14, w = el.offsetWidth, hgt = el.offsetHeight;
      let left = x + pad, top = y + pad;
      if (left + w > window.innerWidth - 8) left = x - w - pad;
      if (top + hgt > window.innerHeight - 8) top = y - hgt - pad;
      el.style.left = Math.max(8, left) + 'px';
      el.style.top = Math.max(8, top) + 'px';
    },
    hide() { if (tipEl) tipEl.classList.remove('on'); },
  };

  /**
   * A readout docked under a chart. Phones have no hover, so the floating tooltip is replaced by this line,
   * which keeps showing the last reading after the finger lifts and updates when a slider moves.
   * spec: same as Tip.show; rows may carry a shorter `short` label.
   */
  function readout(el) {
    return {
      show(spec) {
        clear(el);
        el.appendChild(h('div', { class: 'ro-t' }, spec.title + (spec.note ? ' · ' + spec.note : '')));
        const items = h('div', { class: 'ro-r' });
        (spec.rows || []).forEach((r) => items.appendChild(h('span', { class: 'ro-i' },
          r.color ? h('span', { class: r.line ? 'ln' : 'key-dot', style: r.line ? { borderColor: r.color } : { background: r.color } }) : null,
          r.short || r.label, ' ', h('b', null, r.value == null ? '' : r.value))));
        el.appendChild(items);
      },
      empty(msg) { clear(el); el.appendChild(h('div', { class: 'ro-t' }, msg)); },
    };
  }

  /** True on phone-width screens (matches the CSS breakpoint where the figure is docked). */
  const phoneMQ = window.matchMedia('(max-width: 720px)');
  const isPhone = () => phoneMQ.matches;

  /* ---------------------------------------------------------------- controls */
  /**
   * Range slider with a live value. opts: {label (string|nodes), min, max, step, value, format, hint, onInput}
   */
  function slider(opts) {
    const out = h('output', { class: 'sl-val' });
    const input = h('input', { type: 'range', min: opts.min, max: opts.max, step: opts.step, value: opts.value });
    const update = () => {
      out.textContent = opts.format(+input.value);
      input.style.setProperty('--pct', ((input.value - opts.min) / (opts.max - opts.min)) * 100 + '%');
    };
    input.addEventListener('input', () => { update(); if (opts.onInput) opts.onInput(+input.value); });
    const el = h('label', { class: 'sl' },
      h('span', { class: 'sl-top' }, h('span', { class: 'sl-label' }, opts.label), out),
      input, opts.hint ? h('span', { class: 'sl-hint' }, opts.hint) : null);
    update();
    return { el, input, get: () => +input.value, set: (v) => { input.value = v; update(); } };
  }

  /** Segmented control. opts: {options:[{value,label}], value, onChange} */
  function segmented(opts) {
    const btns = opts.options.map((o) => h('button', {
      type: 'button', 'aria-pressed': String(o.value === opts.value),
      onclick: () => { api.set(o.value); if (opts.onChange) opts.onChange(o.value); },
    }, o.label));
    const el = h('div', { class: 'seg', role: 'group', 'aria-label': opts.ariaLabel || null }, btns);
    const api = {
      el, value: opts.value,
      get() { return api.value; },
      set(v) { api.value = v; btns.forEach((b, i) => b.setAttribute('aria-pressed', String(opts.options[i].value === v))); },
    };
    return api;
  }

  /** Re-run fn when an element's width changes (keeps SVG text crisp). */
  function onResize(el, fn) {
    let last = 0;
    const ro = new ResizeObserver(() => { const w = Math.round(el.clientWidth); if (w && w !== last) { last = w; fn(w); } });
    ro.observe(el);
    return ro;
  }

  /** Run fn once when el first becomes sufficiently visible. */
  function onceVisible(el, fn, threshold = 0.35) {
    if (!('IntersectionObserver' in window)) { fn(); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); fn(); }
    }, { threshold });
    io.observe(el);
  }

  /** Coalesce rapid calls into one per animation frame. */
  function rafThrottle(fn) {
    let queued = false;
    return (...args) => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; fn(...args); }); };
  }
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  /* ---------------------------------------------------------------- shared logit scale for the crowd's belief */
  // z = log10 odds that the article is fake = -log10(ell). Shown as percentages on the axis.
  const LOGIT_TICKS = [[-2, '1%'], [-1, '10%'], [0, '50%'], [1, '90%'], [2, '99%']];
  const zOfEll = (ell) => -Math.log10(ell);

  root.UI = {
    h, s, $, $$, clear, sym, pct, f2, f3, signed, clamp, lerp, cssVar, isDark, onTheme, setTheme, initTheme,
    Tip, readout, isPhone, slider, segmented, onResize, onceVisible, rafThrottle, debounce, LOGIT_TICKS, zOfEll, SVG_NS,
  };
})(window);
