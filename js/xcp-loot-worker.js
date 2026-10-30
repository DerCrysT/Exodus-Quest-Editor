/* Web Worker für die XCP-Loot-Statistiksimulation. */
importScripts("xcp-loot-engine.js");
let cancel = false;
self.onmessage = async (e) => {
  const m = e.data || {};
  if (m.cmd === "cancel") {
    cancel = true;
    return;
  }
  if (m.cmd === "stats") {
    cancel = false;
    try {
      const res = await self.XCPSim.statistics(m.pool, m.n, m.runs, m.seed, m.opts, (p) => self.postMessage({ type: "progress", id: m.id, p: p }), () => cancel);
      self.postMessage({ type: res ? "done" : "cancelled", id: m.id, result: res });
    } catch (err) {
      self.postMessage({ type: "error", id: m.id, message: String(err && err.message ? err.message : err) });
    }
  }
};
