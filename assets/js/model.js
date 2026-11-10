/*
 * model.js — the sequential fact-checking model of Liu & Cao, in plain JavaScript.
 *
 * A direct port of the paper's setting and of its Monte Carlo kernel (MC_util.py,
 * MC_util_two_tool.py), generalised so that any set of fact-checking methods can be
 * offered. Runs in the page and inside a Web Worker (no DOM access). Exposes `ECC`.
 *
 * Notation follows the paper:
 *   r        reliability of the article        p   informativeness of a truthful article
 *   q        P[m = R | fake]  (0.5 here)       H   CDF of the agents' prior beliefs b
 *   (K,e1,e2) cost, false-alarm rate P[verdict = fake | truthful], miss rate P[verdict = true | fake]
 *   pi       an agent's posterior that the article is fake
 *   ell      public likelihood ratio  P_T[history] / P_F[history]  (ell_0 = 1)
 * Throughout, the article carries message m = R and the state is theta = R (the paper's convention);
 * with q = 1/2 and symmetric H the case m = L is the mirror image.
 */
(function (root) {
  'use strict';

  const PI = Math.PI;

  /* ------------------------------------------------------------------ prior beliefs */
  const bisectInv = (cdf) => (u) => {
    let lo = 0, hi = 1;
    for (let i = 0; i < 40; i++) { const mid = 0.5 * (lo + hi); if (cdf(mid) < u) lo = mid; else hi = mid; }
    return 0.5 * (lo + hi);
  };
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

  // Symmetric, continuous, strictly increasing on [0,1] (Assumption 2 of the paper).
  const priors = {
    arcsine: {
      id: 'arcsine', label: 'Polarised, Beta(½, ½)',
      cdf: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : (2 / PI) * Math.asin(Math.sqrt(x))),
      inv: (u) => { const s = Math.sin(0.5 * PI * u); return s * s; },
    },
    uniform: {
      id: 'uniform', label: 'Uniform, Beta(1, 1)',
      cdf: (x) => clamp01(x), inv: (u) => u,
    },
    bell: {
      id: 'bell', label: 'Moderate, Beta(2, 2)',
      cdf: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x)),
      inv: null,
    },
  };
  priors.bell.inv = bisectInv(priors.bell.cdf);

  /* ------------------------------------------------------------------ fact-checking methods */
  const manual = (K) => ({ id: 'M', name: 'Manual', K, e1: 0, e2: 0 });
  const auto = (e1, e2) => ({ id: 'A', name: 'Automated fact-checking', K: 0, e1, e2 });

  /** Expected utility without checking, V(pi) = max{pi, 1-pi}. */
  const V = (pi) => (pi > 0.5 ? pi : 1 - pi);
  /** Expected utility of acting on a verdict (eq. 3 of the paper), before the cost K is paid. */
  const Vhat = (pi, m) => {
    const lo = m.e1 / (1 + m.e1 - m.e2), hi = (1 - m.e1) / (1 - m.e1 + m.e2);
    if (pi <= lo) return 1 - pi;
    if (pi <= hi) return pi * (1 - m.e2) + (1 - pi) * (1 - m.e1);
    return pi;
  };
  /** Posterior cutoffs of one method (Proposition 1). Returns null when nobody would use it. */
  const cutoffs = (m) => {
    if (!(m.K < 0.5 * (1 - m.e1 - m.e2))) return null;
    return { lo: (m.e1 + m.K) / (1 + m.e1 - m.e2), hi: (1 - m.e1 - m.K) / (1 - m.e1 + m.e2) };
  };

  /**
   * The decision policy for a set of methods: which action (or which check) an agent with
   * posterior pi takes. The upper envelope of V and of Vhat_m - K_m, all piecewise linear.
   * Returns basins ordered by increasing prior belief b (= decreasing posterior pi):
   *   basins[0] is "Dislike without checking", the last one "Like without checking",
   *   those in between check with methods[choice].
   * Ties go to not checking, then to the earlier method (the paper prefers manual to automated).
   */
  function buildPolicy(methods) {
    const lines = [[-1, 1], [1, 0]]; // slope, intercept of every linear piece
    const cand = [0, 0.5, 1];
    methods.forEach((m) => {
      lines.push([-1, 1 - m.K], [m.e1 - m.e2, 1 - m.e1 - m.K], [1, -m.K]);
      cand.push(m.e1 / (1 + m.e1 - m.e2), (1 - m.e1) / (1 - m.e1 + m.e2));
    });
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        const da = lines[i][0] - lines[j][0];
        if (Math.abs(da) > 1e-12) cand.push((lines[j][1] - lines[i][1]) / da);
      }
    }
    const xs = cand.filter((x) => x >= 0 && x <= 1).sort((a, b) => a - b)
      .filter((x, i, a) => i === 0 || x - a[i - 1] > 1e-12);

    const segs = [];
    for (let i = 0; i + 1 < xs.length; i++) {
      const mid = 0.5 * (xs[i] + xs[i + 1]);
      let best = V(mid), choice = -1;
      methods.forEach((m, k) => {
        const val = Vhat(mid, m) - m.K;
        if (val > best + 1e-12) { best = val; choice = k; }
      });
      const last = segs[segs.length - 1];
      // adjacent pieces with the same choice merge, except "no check" across pi = 1/2: there she switches from like to dislike
      // (only matters when no method is worth its cost, otherwise a check basin lies between the two)
      if (last && last.choice === choice && !(choice === -1 && Math.abs(xs[i] - 0.5) < 1e-9)) last.hi = xs[i + 1];
      else segs.push({ lo: xs[i], hi: xs[i + 1], choice });
    }
    const basins = segs.slice().reverse().map((s) => ({ choice: s.choice, piLo: s.lo, piHi: s.hi }));
    basins[0].kind = 'D';
    basins[basins.length - 1].kind = 'L';
    for (let k = 1; k < basins.length - 1; k++) basins[k].kind = 'C';
    // posterior odds (1-pi)/pi at every border between consecutive basins (increasing in b)
    const ratios = [];
    for (let j = 0; j + 1 < basins.length; j++) { const pi = basins[j].piLo; ratios.push((1 - pi) / pi); }
    const qT = basins.map((b) => (b.kind === 'D' ? 1 : b.kind === 'L' ? 0 : methods[b.choice].e1));
    const qF = basins.map((b) => (b.kind === 'D' ? 1 : b.kind === 'L' ? 0 : 1 - methods[b.choice].e2));
    return { methods, basins, ratios, qT, qF };
  }

  /* ------------------------------------------------------------------ the chain of public beliefs */
  /**
   * The Markov chain of the public likelihood ratio for one article (r, p, q) under a policy.
   * chain.G(ell, out) writes out[0] = G_F(ell), out[1] = G_T(ell): the probability that the next
   * agent dislikes, if the article is fake / truthful (eq. 6 and the G_v of the paper).
   */
  function makeChain(policy, art) {
    const q = art.q == null ? 0.5 : art.q;
    const { r, p } = art;
    const H = (art.prior || priors.arcsine).cdf;
    const c = ((1 - r) * q) / (r * (2 * p - 1));
    const d = (1 - p) / (2 * p - 1);
    const ratios = policy.ratios, qT = policy.qT, qF = policy.qF, nb = ratios.length;

    function cut(j, inv) { return clamp01(ratios[j] * c * inv - d); }

    function G(ell, out) {
      const inv = 1 / ell;
      let prev = 0, gF = 0, gT = 0;
      for (let j = 0; j < nb; j++) {
        const h = H(cut(j, inv));
        const mass = h - prev;
        gF += mass * qF[j]; gT += mass * qT[j];
        prev = h;
      }
      out[0] = gF; out[1] = gT; // the last basin (Like) never dislikes
    }

    /** Prior-belief cutoffs (untruncated) at public likelihood ratio ell, increasing in b. */
    function bCuts(ell) { const inv = 1 / ell, o = []; for (let j = 0; j < nb; j++) o.push(ratios[j] * c * inv - d); return o; }
    /** Mass of each basin at ell, in the order of policy.basins. */
    function masses(ell) {
      const inv = 1 / ell, o = []; let prev = 0;
      for (let j = 0; j < nb; j++) { const h = H(cut(j, inv)); o.push(h - prev); prev = h; }
      o.push(1 - prev);
      return o;
    }
    /** Posterior that the article is fake for an agent with prior b at public ratio ell. */
    function posterior(b, ell) {
      const odds = ((1 - r) * q) / (r * (1 - p + (2 * p - 1) * b)) / ell; // P[F|...] / P[T|...]
      return odds / (1 + odds);
    }
    // public ratios at which every agent likes / dislikes without checking (l_L and l_D of the paper)
    const ellD = (ratios[0] * c) / (1 + d);
    const ellL = (ratios[nb - 1] * c) / d;
    return { G, bCuts, masses, posterior, ellD, ellL, policy, r, p, q, prior: art.prior || priors.arcsine };
  }

  /* ------------------------------------------------------------------ random numbers */
  const hash32 = (x) => {
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
    return (x ^ (x >>> 16)) >>> 0;
  };
  /** mulberry32 stream from an integer seed. */
  function rng(seed) {
    let s = seed | 0;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------------------------------------------ Monte Carlo kernel */
  const T_MAX = 300;   // paper: maximum round
  const EPS = 1e-5;    // paper: cascade once the next agent's less likely action has probability < EPS

  const _g = new Float64Array(2);
  /**
   * Is the public belief inside a cascade set? gF, gT = chance the next agent dislikes if the article is fake / truthful.
   * Inside the Like set (public ratio above ell_L) every agent likes whatever her own belief, so both are ~0;
   * inside the Dislike set (below ell_D) both are ~1. Returns 1 (Like set), 0 (Dislike set) or -1 (neither).
   * This is the cascade of the explanation. The paper's Monte Carlo stops earlier, once the less likely action is
   * improbable given the TRUE state alone (`strict` off in runChain); the outcome is the same, but the crowd may
   * still be learning at that point (a checker could still reveal the article).
   */
  const cascadeOf = (gF, gT, eps) => (gF < eps && gT < eps ? 1 : gF > 1 - eps && gT > 1 - eps ? 0 : -1);
  /**
   * One run of the chain given the article's veracity v (0 = truthful, 1 = fake).
   * Returns 1 for a Like cascade, 0 for a Dislike cascade, -1 if none within tMax.
   * (Identical in law to _simulate in MC_util.py, unless `strict`: see cascadeOf.)
   */
  function runChain(chain, v, seed, tMax, eps, strict) {
    tMax = tMax || T_MAX; eps = eps || EPS;
    const G = chain.G, g = _g;
    const next = rng(seed);
    let ell = 1;
    for (let t = 1; t <= tMax; t++) {
      G(ell, g);
      const gF = g[0], gT = g[1], gv = v === 0 ? gT : gF;
      if (strict) {      // the public belief has entered a cascade set: whatever the article, the next agent's action is (all but) fixed
        const c = cascadeOf(gF, gT, eps);
        if (c >= 0) return c;
      } else {
        if (gv < eps) return 1;
        if (gv > 1 - eps) return 0;
      }
      if (next() < gv) ell *= gT / gF; else ell *= (1 - gT) / (1 - gF);
    }
    return -1;
  }

  /**
   * n runs for each of several chains on the SAME random numbers (common random numbers).
   * Returns, per chain, counts [like, dislike, none].
   */
  function runMany(chains, v, n, seedBase, tMax, eps) {
    const out = chains.map(() => [0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const seed = hash32((seedBase + Math.imul(i + 1, 0x9e3779b1)) | 0) ^ (v ? 0x5bd1e995 : 0);
      for (let k = 0; k < chains.length; k++) {
        const res = runChain(chains[k], v, seed, tMax, eps);
        out[k][res === 1 ? 0 : res === 0 ? 1 : 2]++;
      }
    }
    return out;
  }
  /** Fraction of correct cascades from counts [like, dislike, none] given the veracity. */
  const correctOf = (cnt, v) => (v === 0 ? cnt[0] : cnt[1]);

  /* ------------------------------------------------------------------ agent-level simulation (for the demo) */
  /**
   * Agent-by-agent simulation of one article in several "worlds" (method sets) that share the same
   * agents: agent t has prior b_t and a uniform w_t that decides her verdict, whatever the method.
   * Returns, per world, the list of steps with everything needed to draw and explain them.
   */
  function simulateAgents(chains, v, seed, nAgents, eps) {
    eps = eps || EPS;
    const next = rng(seed);
    const prior = chains[0].prior;
    const agents = [];
    for (let t = 0; t < nAgents; t++) agents.push({ b: prior.inv(next()), w: next() });
    const g = new Float64Array(2);
    return chains.map((chain) => {
      let ell = 1, cascadeAt = -1;
      const policy = chain.policy, methods = policy.methods, steps = [];
      for (let t = 0; t < nAgents; t++) {
        chain.G(ell, g);
        const gF = g[0], gT = g[1];
        const masses = chain.masses(ell);
        const { b, w } = agents[t];
        const cuts = chain.bCuts(ell);
        let k = 0; while (k < cuts.length && b >= cuts[k]) k++;      // basin of this agent
        const basin = policy.basins[k];
        let action, verdict = null, method = null;
        if (basin.kind === 'D') action = 'D';
        else if (basin.kind === 'L') action = 'L';
        else {
          method = methods[basin.choice];
          const saysFake = v === 1 ? w < 1 - method.e2 : w < method.e1;
          verdict = saysFake ? 'F' : 'T';
          action = saysFake ? 'D' : 'L';
        }
        if (cascadeAt < 0 && cascadeOf(gF, gT, eps) >= 0) cascadeAt = t;      // the public belief is inside a cascade set when this agent arrives
        const step = {
          t: t + 1, b, ell, rho: 1 / (1 + ell), pi: chain.posterior(b, ell), masses,
          basin: k, kind: basin.kind, method: method ? method.id : null, verdict, action,
          correct: (action === 'L') === (v === 0), gF, gT,
        };
        if (action === 'D') ell *= gT / gF; else ell *= (1 - gT) / (1 - gF);
        if (!(ell > 0 && ell < Infinity)) ell = ell === 0 ? 1e-300 : 1e300;
        step.ellAfter = ell;           // public likelihood ratio after this agent has acted
        steps.push(step);
      }
      // the herd starts after the last action against the final one
      let herd = null;
      if (cascadeAt >= 0) {
        const final = steps[steps.length - 1].action;
        let start = steps.length - 1;
        while (start > 0 && steps[start - 1].action === final) start--;
        herd = { action: final, start: start + 1, detected: cascadeAt + 1 };
      }
      return { steps, herd, ellD: chain.ellD, ellL: chain.ellL };
    });
  }

  /* ------------------------------------------------------------------ theory: thresholds and regimes */
  const thr = {
    rD: (m, p, q = 0.5) => (q * (m.e2 + m.K)) / (p * (1 - m.e1 - m.K) + q * (m.e2 + m.K)),
    rL: (m, p, q = 0.5) => (q * (1 - m.e2 - m.K)) / ((1 - p) * (m.e1 + m.K) + q * (1 - m.e2 - m.K)),
    rhatD: (m, p, q = 0.5) => (q * (1 - m.e2 - m.K)) / (p * (m.e1 + m.K) + q * (1 - m.e2 - m.K)),
    rhatL: (m, p, q = 0.5) => (q * (m.e2 + m.K)) / ((1 - p) * (1 - m.e1 - m.K) + q * (m.e2 + m.K)),
  };
  /** p-bar: below it the two negative bands of Proposition 2 overlap. */
  const pBar = (KH) => 1 / (1 + Math.pow(KH / (1 - KH), 2));
  /** p_kappa (both methods used): below it the fake-article change is certified only as <= 0 and r~ = r*; above it strictly negative and r~ = rhat_D(H). */
  const pKappa = (KH, e1, e2) => { const piStar = (e1 - KH) / (e1 - e2), kappa = (1 - piStar) / piStar; return 1 / (1 + (KH / (1 - KH)) * kappa); };

  /** Which of the paper's three regimes: (i) automated unused, (ii) both used, (iii) automated preferred. */
  function regime(KH, e1, e2) {
    if (KH <= e2 / (1 - e1 + e2)) return 'i';
    if (KH <= e1 / (1 + e1 - e2)) return 'ii';
    return 'iii';
  }

  /**
   * Signs of the welfare change certified by Propositions 2 and 3 at a point (r, p), q = 1/2.
   * Each of dT, dF, dW is '+', '-', '≤0', '0' or null (not certified).
   */
  function certified(KH, e1, e2, r, p, q = 0.5) {
    const MH = manual(KH), MA = auto(e1, e2), reg = regime(KH, e1, e2);
    const none = { dT: null, dF: null, dW: null, regime: reg };
    if (reg === 'i') return { dT: '0', dF: '0', dW: '0', regime: reg };
    const rDA = thr.rD(MA, p, q), rDH = thr.rD(MH, p, q);
    const rhLH = thr.rhatL(MH, p, q), rhDH = thr.rhatD(MH, p, q);
    const inI = (x, a, b) => x > a && x < b;
    const out = { dT: null, dF: null, dW: null, regime: reg };
    if (reg === 'iii') {
      const rLA = thr.rL(MA, p, q), rLH = thr.rL(MH, p, q);
      if (!inI(r, rDA, rLA)) return { dT: '0', dF: '0', dW: '0', regime: reg };
      if (inI(r, rDA, rDH)) out.dT = '+';
      if (inI(r, rhLH, rLA)) out.dT = '-';
      if (inI(r, rDA, rhDH)) out.dF = '-';
      if (inI(r, rLH, rLA)) out.dF = '+';
      if (p < pBar(KH) && inI(r, rhLH, rhDH)) out.dW = '-';
      return out;
    }
    // regime (ii): both methods used
    const piStar = (e1 - KH) / (e1 - e2), kappa = (1 - piStar) / piStar;
    const rStar = (q * kappa) / (q * kappa + (1 - p));
    const pK = pKappa(KH, e1, e2);
    const rTilde = Math.min(rStar, rhDH);
    if (!inI(r, rDA, rStar)) return { dT: '0', dF: '0', dW: '0', regime: reg };
    if (inI(r, rDA, rDH)) out.dT = '+';
    if (inI(r, rhLH, rStar)) out.dT = '-';
    if (inI(r, rDA, rTilde)) out.dF = p > pK ? '-' : '≤0';
    // strict even where dF is only weak: dT < 0 strictly on (rhat_L(H), r*) and dF <= 0, so dW <= r dT < 0 (Prop. 3d)
    if (p < pBar(KH) && inI(r, rhLH, rTilde)) out.dW = '-';
    return out;
  }

  /** Accuracy relation of the paper's Fig. 5: e1 = ratio * e2 at balanced accuracy alpha = 1 - (e1+e2)/2. */
  function errorsAtAccuracy(alpha, ratio) {
    const e2 = (2 * (1 - alpha)) / (1 + ratio);
    return { e1: ratio * e2, e2 };
  }

  root.ECC = {
    priors, manual, auto, V, Vhat, cutoffs, buildPolicy, makeChain, rng, hash32,
    runChain, runMany, correctOf, simulateAgents, cascadeOf, thr, pBar, pKappa, regime, certified, errorsAtAccuracy,
    T_MAX, EPS,
  };
})(typeof self !== 'undefined' ? self : this);
