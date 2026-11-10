/*
 * worker.js — Monte Carlo jobs off the main thread. Results arrive progressively (more runs per pass),
 * and a newer job cancels an older one, so dragging a slider stays smooth.
 *   heat : lambda^T and lambda^F on an (r, p) grid, for {M_H} and {M_H, M_A}   (Demo 3)
 *   sweep: welfare averaged over r ~ U(0,1) along a path of accuracies of the automated method       (Demo 4)
 *   cascade: where one fact-checker's crowds end (Like, Dislike, none), for a truthful and for a fake article
 */
importScripts('model.js' + self.location.search);      // the worker's own ?v= carries over, so it never pairs with an older cached model.js

let currentJob = 0;
const tick = () => new Promise((res) => setTimeout(res, 0));

self.onmessage = (ev) => {
  const msg = ev.data;
  currentJob = msg.id;
  if (msg.type === 'heat') runHeat(msg);
  else if (msg.type === 'sweep') runSweep(msg);
  else if (msg.type === 'cascade') runCascade(msg);
};

async function runHeat(m) {
  const { id, KH, e1, e2, nr, np, pMin, pMax, passes } = m;
  const prior = ECC.priors[m.prior] || ECC.priors.arcsine;
  const MH = ECC.manual(KH), MA = ECC.auto(e1, e2);
  const polH = ECC.buildPolicy([MH]), polHA = ECC.buildPolicy([MH, MA]);
  const cells = nr * np;
  const cnt = new Int32Array(cells * 4);                     // correct counts: T/H, F/H, T/HA, F/HA
  const chains = new Array(cells);
  for (let i = 0; i < nr; i++) for (let j = 0; j < np; j++) {
    const art = { r: (i + 0.5) / nr, p: pMin + ((pMax - pMin) * (j + 0.5)) / np, q: 0.5, prior };
    chains[i * np + j] = [ECC.makeChain(polH, art), ECC.makeChain(polHA, art)];
  }
  let total = 0;
  for (let pass = 0; pass < passes.length; pass++) {
    const n = passes[pass];
    for (let c = 0; c < cells; c++) {
      const seed = ECC.hash32(c * 7919 + pass * 104729 + 17);
      const rT = ECC.runMany(chains[c], 0, n, seed, ECC.T_MAX), rF = ECC.runMany(chains[c], 1, n, seed + 1, ECC.T_MAX);
      cnt[c * 4] += ECC.correctOf(rT[0], 0); cnt[c * 4 + 1] += ECC.correctOf(rF[0], 1);
      cnt[c * 4 + 2] += ECC.correctOf(rT[1], 0); cnt[c * 4 + 3] += ECC.correctOf(rF[1], 1);
      if ((c & 255) === 255) { await tick(); if (currentJob !== id) return; }
    }
    total += n;
    const lam = new Float32Array(cells * 4);
    for (let k = 0; k < lam.length; k++) lam[k] = cnt[k] / total;
    self.postMessage({ type: 'heat', id, pass, last: pass === passes.length - 1, runs: total, lam }, [lam.buffer]);
    await tick(); if (currentJob !== id) return;
  }
}

async function runSweep(m) {
  const { id, KH, p, ratio, alphas, strata, passes, tMax } = m;
  const prior = ECC.priors[m.prior] || ECC.priors.arcsine;
  const MH = ECC.manual(KH);
  const na = alphas.length, S = strata;
  const rs = Array.from({ length: S }, (_, i) => (i + 0.5) / S);
  // chains[a][s] = [ {MH}, {MA}, {MH,MA} ]
  const chains = alphas.map((al) => {
    const { e1, e2 } = ECC.errorsAtAccuracy(al, ratio);
    const MA = ECC.auto(e1, e2);
    const pols = [ECC.buildPolicy([MH]), ECC.buildPolicy([MA]), ECC.buildPolicy([MH, MA])];
    return rs.map((r) => pols.map((pol) => ECC.makeChain(pol, { r, p, q: 0.5, prior })));
  });
  // {M_H} does not depend on alpha: share the estimate across alphas
  const cT = new Int32Array(na * 3 * S), cF = new Int32Array(na * 3 * S);
  let total = 0;
  for (let pass = 0; pass < passes.length; pass++) {
    const n = passes[pass];
    for (let a = 0; a < na; a++) {
      for (let s = 0; s < S; s++) {
        const seed = ECC.hash32(s * 7919 + pass * 104729 + 11);        // same draws at every alpha: smooth curves
        const rT = ECC.runMany(chains[a][s], 0, n, seed, tMax), rF = ECC.runMany(chains[a][s], 1, n, seed + 1, tMax);
        for (let k = 0; k < 3; k++) { cT[(a * 3 + k) * S + s] += ECC.correctOf(rT[k], 0); cF[(a * 3 + k) * S + s] += ECC.correctOf(rF[k], 1); }
      }
      if ((a & 7) === 7) { await tick(); if (currentJob !== id) return; }
    }
    total += n;
    const W = new Float32Array(na * 3), SD = new Float32Array(na * 3);
    for (let a = 0; a < na; a++) for (let k = 0; k < 3; k++) {
      let sum = 0, vr = 0;
      for (let s = 0; s < S; s++) {
        const lt = cT[(a * 3 + k) * S + s] / total, lf = cF[(a * 3 + k) * S + s] / total, r = rs[s];
        sum += r * lt + (1 - r) * lf;
        vr += (r * r * lt * (1 - lt) + (1 - r) * (1 - r) * lf * (1 - lf)) / total;
      }
      W[a * 3 + k] = sum / S; SD[a * 3 + k] = Math.sqrt(vr) / S;
    }
    self.postMessage({ type: 'sweep', id, pass, last: pass === passes.length - 1, runs: total * S * 2, W, SD }, [W.buffer, SD.buffer]);
    await tick(); if (currentJob !== id) return;
  }
}

/** Crowds of one fact-checker {K, e1, e2} on an article (r, p): counts [like, dislike, none] for a truthful (0) and a fake (1)
 *  article, and how many crowds had herded within `within` agents. Posted in batches, so a slider drag stays smooth. */
async function runCascade(m) {
  const { id, K, e1, e2, r, p, n, within } = m;
  const prior = ECC.priors[m.prior] || ECC.priors.arcsine;
  const chain = ECC.makeChain(ECC.buildPolicy([{ id: 'M', name: 'Fact-checking', K, e1, e2 }]), { r, p, q: 0.5, prior });
  const cnt = [[0, 0, 0], [0, 0, 0]], early = [0, 0];
  const batches = 5, per = Math.ceil(n / batches);
  for (let b = 0; b < batches; b++) {
    for (let v = 0; v < 2; v++) {
      for (let i = 0; i < per; i++) {
        const seed = ECC.hash32((20261106 + b * 1000003 + Math.imul(i + 1, 0x9e3779b1)) | 0) ^ (v ? 0x5bd1e995 : 0);
        // strict: a cascade starts when the public belief is inside a cascade set, as in the simulation above
        let res = ECC.runChain(chain, v, seed, within, undefined, true);          // the same path, looked at after `within` agents
        if (res !== -1) early[v]++;
        else res = ECC.runChain(chain, v, seed, ECC.T_MAX, undefined, true);
        cnt[v][res === 1 ? 0 : res === 0 ? 1 : 2]++;
      }
      await tick(); if (currentJob !== id) return;
    }
    self.postMessage({ type: 'cascade', id, last: b === batches - 1, n: (b + 1) * per, r, cnt, early });
  }
}
