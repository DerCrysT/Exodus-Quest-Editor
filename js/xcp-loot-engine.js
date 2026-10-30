/**
 * Exodus Editor – XCP-Loot-Simulationsengine (läuft im Hauptthread und im Web Worker).
 * VORLÄUFIGES Modell: Die echte Auswahllogik des Server-Skripts ist nicht bestätigt. Alle Regeln sind über opts einstellbar.
 *   Chance      = direkte Prozentwahrscheinlichkeit (0.01 = 0,01 %)
 *   MengeMax    = wie oft EIN Eintrag pro Stash höchstens gezogen werden darf
 *   LootAnzahl  = Zahl der gezogenen Items je Stash (gleichverteilt zwischen MIN und MAX)
 *   mode "passes":   Einträge werden in zufälliger Reihenfolge durchgewürfelt (Treffer, wenn Zufall(0–100) < Chance); mehrere Durchgänge, bis die Anzahl erreicht ist
 *   mode "weighted": jedes Item wird proportional zur Chance aus den noch verfügbaren Einträgen gezogen
 */
(function (g) {
  "use strict";
  const VERSION = "xcp-sim-v1";

  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const DEFAULTS = { mode: "passes", maxPasses: 200 };
  const num = (v, d) => (typeof v === "number" && isFinite(v) ? v : d);
  const randInt = (rnd, lo, hi) => (hi <= lo ? lo : lo + Math.floor(rnd() * (hi - lo + 1)));

  /** Pool vorbereiten (Zahlen säubern, Kapazität bestimmen). */
  function prepare(pool) {
    const entries = (pool.Lootpool || []).map((e, i) => ({
      i: i,
      name: String(e.Name),
      chance: Math.max(0, num(e.Chance, 0)),
      max: Math.max(1, Math.round(num(e.MengeMax, 1))),
      qmin: num(e.QuantityMin, 0),
      qmax: num(e.QuantityMax, num(e.QuantityMin, 0)),
      lmin: num(e.QualityMin, 0),
      lmax: num(e.QualityMax, num(e.QualityMin, 0)),
    }));
    return {
      entries: entries,
      min: Math.max(0, Math.round(num(pool.LootAnzahl_MIN, 0))),
      max: Math.max(0, Math.round(num(pool.LootAnzahl_MAX, 0))),
      capacity: entries.reduce((n, e) => n + (e.chance > 0 ? e.max : 0), 0),
    };
  }

  /** Ein Stash: Liste von {i (Eintrag), name, qty, quality}. */
  function stash(P, rnd, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    let need = randInt(rnd, P.min, Math.max(P.min, P.max));
    need = Math.min(need, P.capacity);
    const out = [];
    if (need <= 0 || !P.entries.length) return out;
    const used = new Int32Array(P.entries.length);
    const add = (e) => {
      used[e.i]++;
      out.push({ i: e.i, name: e.name, qty: randInt(rnd, Math.round(e.qmin), Math.round(e.qmax)), quality: randInt(rnd, Math.round(e.lmin), Math.round(e.lmax)) });
    };
    if (o.mode === "weighted") {
      for (let k = 0; k < need; k++) {
        let total = 0;
        for (const e of P.entries) if (used[e.i] < e.max) total += e.chance;
        if (total <= 0) break;
        let r = rnd() * total;
        let pick = null;
        for (const e of P.entries) {
          if (used[e.i] >= e.max) continue;
          r -= e.chance;
          pick = e;
          if (r < 0) break;
        }
        if (pick) add(pick);
      }
      return out;
    }
    const idx = P.entries.map((e) => e.i);
    for (let pass = 0; pass < o.maxPasses && out.length < need; pass++) {
      for (let a = idx.length - 1; a > 0; a--) {
        const b = Math.floor(rnd() * (a + 1));
        const t = idx[a];
        idx[a] = idx[b];
        idx[b] = t;
      }
      for (const ix of idx) {
        const e = P.entries[ix];
        if (used[ix] >= e.max) continue;
        if (rnd() * 100 < e.chance) {
          add(e);
          if (out.length >= need) break;
        }
      }
    }
    return out;
  }

  /** Konkreter Durchlauf: n Stashes mit festem Seed. */
  function run(pool, n, seed, opts) {
    const P = prepare(pool);
    const rnd = mulberry32(seed);
    const list = [];
    for (let s = 0; s < n; s++) list.push(stash(P, rnd, opts));
    return list;
  }

  const quant = (sorted, q) => {
    if (!sorted.length) return 0;
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  };

  /** Statistik: runs Wiederholungen von je n Stashes (async, mit Fortschritt/Abbruch). */
  async function statistics(pool, n, runs, seed, opts, onProgress, cancelled) {
    const P = prepare(pool);
    const names = [];
    const nameIx = new Map();
    P.entries.forEach((e) => {
      if (!nameIx.has(e.name)) {
        nameIx.set(e.name, names.length);
        names.push(e.name);
      }
    });
    const K = names.length;
    const counts = names.map(() => new Float64Array(runs)); // Gesamtanzahl je Durchlauf
    const stashHits = new Float64Array(K); // Stashes mit mindestens einem Vorkommen (summiert)
    const qtySum = new Float64Array(K);
    const itemsPerRun = new Float64Array(runs);
    let last = Date.now();
    for (let r = 0; r < runs; r++) {
      const rnd = mulberry32((seed + Math.imul(r + 1, 7919)) >>> 0);
      for (let s = 0; s < n; s++) {
        const st = stash(P, rnd, opts);
        itemsPerRun[r] += st.length;
        const seen = new Uint8Array(K);
        for (const it of st) {
          const k = nameIx.get(it.name);
          counts[k][r]++;
          qtySum[k] += it.qty;
          if (!seen[k]) {
            seen[k] = 1;
            stashHits[k]++;
          }
        }
      }
      if (Date.now() - last > 30) {
        last = Date.now();
        if (onProgress) onProgress((r + 1) / runs);
        await new Promise((res) => setTimeout(res, 0));
        if (cancelled && cancelled()) return null;
      }
    }
    const rows = names.map((name, k) => {
      const a = Array.from(counts[k]);
      const sorted = a.slice().sort((x, y) => x - y);
      const mean = a.reduce((x, y) => x + y, 0) / runs;
      const sd = Math.sqrt(a.reduce((x, y) => x + (y - mean) * (y - mean), 0) / Math.max(1, runs - 1));
      const total = a.reduce((x, y) => x + y, 0);
      return {
        name: name,
        mean: mean,
        median: quant(sorted, 0.5),
        sd: sd,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        p10: quant(sorted, 0.1),
        p90: quant(sorted, 0.9),
        p025: quant(sorted, 0.025),
        p975: quant(sorted, 0.975),
        atLeastOneRun: a.filter((x) => x > 0).length / runs,
        stashProb: stashHits[k] / (runs * n),
        avgQty: total ? qtySum[k] / total : 0,
        perStash: mean / n,
      };
    });
    const ipr = Array.from(itemsPerRun).sort((x, y) => x - y);
    return { version: VERSION, stashes: n, runs: runs, seed: seed, rows: rows, itemsMean: ipr.reduce((x, y) => x + y, 0) / runs, itemsP10: quant(ipr, 0.1), itemsP90: quant(ipr, 0.9), capacity: P.capacity };
  }

  g.XCPSim = { VERSION: VERSION, mulberry32: mulberry32, prepare: prepare, stash: stash, run: run, statistics: statistics };
})(typeof self !== "undefined" ? self : window);
