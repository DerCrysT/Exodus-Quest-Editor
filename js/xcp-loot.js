/**
 * Exodus Editor – XCP-Loot-System: Lootpool-Konfigurator, Item-Datenbank, Loot-Simulator, Vergleich/Analyse.
 * Eigene Dateitypen: xcp_loot (Pool-JSON: Klasse + Lootpool[]) und xcp_items (Item-Datenbank, ItemLibrary.json).
 * Getrennt vom Quest-Stash-Editor (stash.js). Positionsdateien (*_Positions.c) werden nur zugeordnet/gezählt, nie verändert.
 */
(function (EQE) {
  "use strict";
  const h = EQE.h;
  const clear = EQE.clear;
  const P = () => EQE.Project;
  const K = () => EQE.MPKit;
  const LOOT = "xcp_loot";
  const LIB = "xcp_items";
  const COLS = [
    ["Name", "Name", "text", 260],
    ["Chance", "Chance (%)", "num", 110],
    ["MengeMax", "MengeMax", "int", 90],
    ["QuantityMin", "QuantityMin", "int", 100],
    ["QuantityMax", "QuantityMax", "int", 100],
    ["QualityMin", "QualityMin", "int", 100],
    ["QualityMax", "QualityMax", "int", 100],
  ];
  const tip = (t) => K().tipNode(t);
  const fmt = (n, d) => K().fmt(n, d);
  const lc = (s) => String(s).toLowerCase();

  const st = {
    pool: "",
    sel: new Set(),
    sort: { key: "", dir: 1 },
    filter: "",
    cmp: "",
    hidden: {},
    libCols: {},
    undo: [],
    redo: [],
    clip: [],
    last: -1,
    sim: { pool: "", n: 1000, runs: 100, seed: 12345, mode: "passes", result: null, run: null, progress: 0, group: "", filter: "", sort: "mean", dir: -1, stash: 1, find: "" },
    cmpv: { a: "", b: "", seed: 12345, n: 1000, runs: 60, res: null, group: "", busy: false },
    lib: { filter: "", sel: "", tabFilter: "" },
  };
  const mut = (item, fn) => P().mutate(item.uid, fn);
  const roots = {};

  // ================================================================ Daten
  const pools = () => P().byKind(LOOT).slice().sort((a, b) => (a.fileId || "").localeCompare(b.fileId || ""));
  const poolOf = (uid) => pools().find((p) => p.uid === uid) || null;
  const libItem = () => P().byKind(LIB)[0] || null;
  function curPool() {
    let p = poolOf(st.pool);
    if (!p) {
      p = pools()[0] || null;
      st.pool = p ? p.uid : "";
    }
    return p;
  }

  // Positionsdateien
  const POS_KEY = "eqe:xcp:pos:v1";
  const positions = {}; // lc(Dateiname ohne .c) -> {path, count, text}
  (function loadPos() {
    try {
      const o = JSON.parse(localStorage.getItem(POS_KEY) || "{}");
      Object.keys(o).forEach((k) => (positions[k] = { path: o[k].path, count: o[k].count, text: null }));
    } catch (e) {
      /* egal */
    }
  })();
  function ingestPositions(path, text) {
    const base = path.split("/").pop().replace(/\.c$/i, "");
    const count = (text.match(/SpawnObject\s*\(/g) || []).length;
    positions[lc(base)] = { path: path, count: count, text: text };
    try {
      const o = {};
      Object.keys(positions).forEach((k) => (o[k] = { path: positions[k].path, count: positions[k].count }));
      localStorage.setItem(POS_KEY, JSON.stringify(o));
    } catch (e) {
      /* egal */
    }
  }
  const posOf = (item) => positions[lc(item.json.PositionsFile || "")] || null;

  // Item-Datenbank: Name -> {tabId: {feld: wert}}
  function libMap() {
    const it = libItem();
    const m = new Map();
    if (it && Array.isArray(it.json.items)) it.json.items.forEach((x) => m.set(x.Name, x));
    return m;
  }
  function libFields() {
    const it = libItem();
    const out = [];
    if (it && Array.isArray(it.json.tabs)) it.json.tabs.forEach((t) => (t.fields || []).forEach((f) => out.push({ tab: t, field: f, key: t.id + "." + f.key, label: t.name + " · " + f.label })));
    return out;
  }
  function libValue(map, name, key) {
    const x = map.get(name);
    if (!x) return "";
    const [t, f] = key.split(".");
    const v = x[t] && x[t][f];
    return v === undefined || v === null ? "" : Array.isArray(v) ? v.join(", ") : String(v);
  }

  let sugCache = { sig: "", list: [] };
  function suggestions() {
    const it = libItem();
    const sig = (it ? it.json.items.length : 0) + ":" + pools().map((p) => p.json.Lootpool.length).join(",") + ":" + (EQE.Cfg ? EQE.Cfg.sources().length : 0);
    if (sig === sugCache.sig) return sugCache.list;
    const set = new Set();
    if (it) it.json.items.forEach((x) => set.add(x.Name));
    pools().forEach((p) => p.json.Lootpool.forEach((e) => set.add(e.Name)));
    if (EQE.Cfg) {
      EQE.Cfg.classNames("CfgVehicles").slice(0, 8000).forEach((n) => set.add(n));
      EQE.Cfg.classNames("CfgMagazines").slice(0, 2000).forEach((n) => set.add(n));
    }
    sugCache = { sig: sig, list: Array.from(set).sort() };
    return sugCache.list;
  }

  // ================================================================ Validierung
  const GEN_NUM = ["SpawnAnzahl_MIN", "SpawnAnzahl_MAX", "DespawnTime", "DespawnPlayerRadius", "NeedItemsDamage", "LootAnzahl_MIN", "LootAnzahl_MAX"];
  function validate(item) {
    const j = item.json;
    const out = [];
    const err = (m) => out.push({ level: "error", msg: m });
    const warn = (m) => out.push({ level: "warn", msg: m });
    ["Klasse", "PositionsFile"].forEach((k) => (typeof j[k] !== "string" || !j[k]) && err("Pflichtfeld „" + k + "“ fehlt oder ist leer."));
    GEN_NUM.forEach((k) => {
      if (j[k] === undefined) err("Pflichtfeld „" + k + "“ fehlt.");
      else if (typeof j[k] !== "number" || !isFinite(j[k])) err("„" + k + "“ ist keine Zahl.");
      else if (j[k] < 0) err("„" + k + "“ ist negativ.");
    });
    if (j.SpawnAnzahl_MIN > j.SpawnAnzahl_MAX) err("SpawnAnzahl_MIN ist größer als SpawnAnzahl_MAX.");
    if (j.LootAnzahl_MIN > j.LootAnzahl_MAX) err("LootAnzahl_MIN ist größer als LootAnzahl_MAX.");
    if (!Array.isArray(j.NeedItems) || j.NeedItems.some((x) => typeof x !== "string")) err("NeedItems muss eine Liste von Classnames (Text) sein.");
    if (typeof j.NeedItemsDamage === "number" && j.NeedItemsDamage > 100) err("NeedItemsDamage ist größer als 100 %.");
    const seen = {};
    let cap = 0;
    (j.Lootpool || []).forEach((e, i) => {
      const w = "Eintrag " + (i + 1) + " (" + e.Name + "): ";
      if (typeof e.Name !== "string" || !e.Name) err("Eintrag " + (i + 1) + " hat keinen Namen.");
      ["Chance", "MengeMax", "QuantityMin", "QuantityMax", "QualityMin", "QualityMax"].forEach((k) => typeof e[k] !== "number" && err(w + "„" + k + "“ ist keine Zahl."));
      if (e.Chance < 0 || e.Chance > 100) err(w + "Chance außerhalb 0–100 %.");
      if (e.QuantityMin > e.QuantityMax) err(w + "QuantityMin > QuantityMax.");
      if (e.QualityMin > e.QualityMax) err(w + "QualityMin > QualityMax.");
      if (e.MengeMax < 1) err(w + "MengeMax muss mindestens 1 sein.");
      (seen[e.Name] = seen[e.Name] || []).push(i + 1);
      if (e.Chance > 0) cap += Math.max(1, e.MengeMax || 1);
    });
    const dups = Object.keys(seen).filter((k) => seen[k].length > 1);
    if (dups.length) warn(dups.length + " Classname(s) kommen mehrfach vor (erlaubt), z. B. " + dups.slice(0, 3).join(", ") + ".");
    if (j.LootAnzahl_MAX > cap) warn("LootAnzahl_MAX (" + j.LootAnzahl_MAX + ") ist nicht erreichbar: die Einträge erlauben höchstens " + cap + " Items.");
    const exp = (j.Lootpool || []).reduce((n, e) => n + (e.Chance || 0), 0) / 100;
    if (exp < 0.05) warn("Die Summe aller Chancen ist sehr klein (" + fmt(exp, 3) + " Treffer pro Durchgang) – Loot kann praktisch nicht gewürfelt werden.");
    const map = libMap();
    if (map.size) {
      const unknown = Object.keys(seen).filter((n) => !map.has(n));
      if (unknown.length) warn(unknown.length + " Classname(s) fehlen in der Item-Datenbank (z. B. " + unknown.slice(0, 3).join(", ") + ").");
    }
    const pos = posOf(item);
    if (!pos) warn("Positionsdatei „" + j.PositionsFile + ".c“ ist nicht geladen/zugeordnet.");
    else if (pos.count < j.SpawnAnzahl_MAX) warn("Die Positionsdatei enthält nur " + pos.count + " Spawnpositionen, SpawnAnzahl_MAX ist " + j.SpawnAnzahl_MAX + ".");
    return out;
  }
  function crossCheck(push) {
    pools().forEach((it) => validate(it).forEach((v) => push(v.level, it, v.msg)));
  }

  // ================================================================ gemeinsame UI-Helfer
  function head(title, blurb) {
    return h("div", { class: "mp-sec-head" }, [h("h2", { text: title }), h("div", { class: "muted", text: blurb })]);
  }
  function nodata(box, what) {
    box.appendChild(h("div", { class: "empty-state" }, [h("div", { class: "drop-title", text: what }), h("p", { text: "Lade den Ordner „Lootpool“ (XCP_Loot_System mit den Pool-JSONs und *_Positions.c) über „Dateien & Export“ oder pulle ihn aus dem Repository." })]));
  }
  function field(label, tipText, input, span) {
    return h("div", { class: "field" + (span ? " span2" : "") }, [h("label", {}, [label, tipText ? tip(tipText) : null]), input]);
  }
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    const a = h("a", { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  const csvCell = (v) => '"' + String(v === undefined || v === null ? "" : v).replace(/"/g, '""') + '"';
  const shown = (v) => (typeof v === "number" ? String(+v.toPrecision(7)) : v === undefined ? "" : v);

  /** Einfaches virtuelles Scrollen: rowCount Zeilen à rowH px; renderRow(i) liefert ein Element. */
  function virtual(height, rowH, rowCount, renderRow) {
    const sp = h("div", { style: "height:" + rowCount * rowH + "px;position:relative" });
    const box = h("div", { class: "xcp-vbox", style: "height:" + height + "px;overflow:auto;position:relative" }, [sp]);
    const paint = () => {
      const top = box.scrollTop;
      const from = Math.max(0, Math.floor(top / rowH) - 5);
      const to = Math.min(rowCount, Math.ceil((top + height) / rowH) + 5);
      clear(sp);
      for (let i = from; i < to; i++) {
        const r = renderRow(i);
        r.style.position = "absolute";
        r.style.top = i * rowH + "px";
        r.style.height = rowH + "px";
        sp.appendChild(r);
      }
    };
    box.addEventListener("scroll", paint);
    paint();
    box.__paint = paint;
    return box;
  }

  // ================================================================ Lootpool-Konfigurator
  const snapKey = (p) => (p ? p.fileId : "");
  const SNAP = "eqe:xcp:snap:v1";
  function snaps() {
    try {
      return JSON.parse(localStorage.getItem(SNAP) || "{}");
    } catch (e) {
      return {};
    }
  }
  function saveSnap(p) {
    const s = snaps();
    s[snapKey(p)] = { t: Date.now(), json: JSON.parse(JSON.stringify(p.json)) };
    try {
      localStorage.setItem(SNAP, JSON.stringify(s));
      EQE.toast("Stand von „" + p.fileId + "“ als Vergleichsbasis gemerkt.");
    } catch (e) {
      EQE.toast("Speicher voll – Stand konnte nicht gemerkt werden.", true);
    }
  }

  function pushUndo(p) {
    st.undo.push(JSON.stringify({ uid: p.uid, loot: p.json.Lootpool }));
    if (st.undo.length > 40) st.undo.shift();
    st.redo.length = 0;
  }
  function undoRedo(p, from, to) {
    if (!from.length) return;
    to.push(JSON.stringify({ uid: p.uid, loot: p.json.Lootpool }));
    const s = JSON.parse(from.pop());
    mut(p, (j) => (j.Lootpool = s.loot));
    st.sel.clear();
    renderEditor();
  }

  function filteredIndexes(p) {
    const arr = p.json.Lootpool;
    const map = libMap();
    let idx = arr.map((_, i) => i);
    const f = lc(st.filter.trim());
    if (f) {
      const terms = f.split(/\s+/);
      idx = idx.filter((i) => {
        const hay = lc(arr[i].Name + " " + Object.keys(st.libCols).filter((k) => st.libCols[k]).map((k) => libValue(map, arr[i].Name, k)).join(" "));
        return terms.every((t) => hay.indexOf(t) > -1);
      });
    }
    const c = /^\s*(chance|menge|qmin|qmax)?\s*(<=|>=|<|>|=)\s*([\d.]+)\s*$/i.exec(st.cmp);
    if (c) {
      const key = { chance: "Chance", menge: "MengeMax", qmin: "QuantityMin", qmax: "QuantityMax" }[(c[1] || "chance").toLowerCase()];
      const v = Number(c[3]);
      idx = idx.filter((i) => {
        const x = arr[i][key];
        return c[2] === "<" ? x < v : c[2] === ">" ? x > v : c[2] === "<=" ? x <= v : c[2] === ">=" ? x >= v : x === v;
      });
    }
    if (st.sort.key) {
      const k = st.sort.key;
      const lib = k.indexOf(".") > -1;
      idx.sort((a, b) => {
        const x = lib ? libValue(map, arr[a].Name, k) : arr[a][k];
        const y = lib ? libValue(map, arr[b].Name, k) : arr[b][k];
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * st.sort.dir;
      });
    }
    return idx;
  }

  function renderEditor() {
    const box = roots.loot;
    if (!box) return;
    const keepScroll = box.__scroll || 0;
    clear(box);
    const list = pools();
    box.appendChild(head("Lootpools (XCP)", "Allgemeine Einstellungen und Item-Tabelle der XCP-Lootpool-Dateien. Server-JSON bleibt unverändert im Format; Positionsdateien werden nur zugeordnet."));
    if (!list.length) return nodata(box, "Keine XCP-Lootpools geladen");
    const p = curPool();
    const j = p.json;
    const redrawAll = () => renderEditor();

    // --- Listenspalte
    const nav = h("div", { class: "mp-list" });
    list.forEach((x) => nav.appendChild(h("button", { class: "mp-navbtn" + (x.uid === p.uid ? " active" : ""), type: "button", text: x.fileId + (x.dirty || x.isNew ? " •" : ""), onclick: () => ((st.pool = x.uid), st.sel.clear(), (st.undo.length = 0), renderEditor()) })));
    const poolBtns = h("div", { class: "toolbar" }, [
      h("button", { class: "btn small", type: "button", text: "Neu", title: "Neuen leeren Lootpool anlegen", onclick: () => newPool(false) }),
      h("button", { class: "btn small", type: "button", text: "Duplizieren", onclick: () => newPool(true) }),
      h("button", { class: "btn small danger", type: "button", text: "Löschen", onclick: () => confirm("Lootpool „" + p.fileId + "“ aus dem Projekt entfernen?") && (P().remove(p.uid), (st.pool = ""), renderEditor()) }),
    ]);

    // --- Allgemeine Einstellungen
    const num = (k, lab, tp, isInt) => {
      const inp = h("input", { type: "number", step: isInt ? "1" : "any", value: shown(j[k]) });
      inp.addEventListener("input", () => {
        const t = inp.value.trim();
        if (t === "" || !isFinite(Number(t))) return;
        mut(p, (x) => (x[k] = isInt ? Math.round(Number(t)) : Number(t)));
        valHost && showVal();
      });
      return field(lab, tp, inp);
    };
    const txt = (k, lab, tp) => field(lab, tp, h("input", { type: "text", value: j[k] === undefined ? "" : j[k], oninput: (e) => (mut(p, (x) => (x[k] = e.target.value)), valHost && showVal()) }));
    const pos = posOf(p);
    const needBox = h("div", {});
    const needDraw = () => {
      clear(needBox);
      const wrap = h("div", { class: "strlist" });
      (j.NeedItems || []).forEach((n, i) => wrap.appendChild(h("span", { class: "chip" }, [n, h("button", { type: "button", text: "×", onclick: () => (mut(p, (x) => x.NeedItems.splice(i, 1)), needDraw()) })])));
      if (!(j.NeedItems || []).length) wrap.appendChild(h("span", { class: "muted small", text: "(keine – jeder darf den Stash öffnen)" }));
      const add = h("input", { type: "text", placeholder: "Item hinzufügen (Enter)", list: "xcp-names" });
      add.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" || !add.value.trim()) return;
        e.preventDefault();
        mut(p, (x) => (Array.isArray(x.NeedItems) ? x.NeedItems : (x.NeedItems = [])).push(add.value.trim()));
        add.value = "";
        needDraw();
      });
      needBox.appendChild(wrap);
      needBox.appendChild(add);
    };
    needDraw();
    const gen = h("div", { class: "grid2" }, [
      txt("Klasse", "Klasse", "Classname des Stash-Objekts."),
      txt("PositionsFile", "PositionsFile", "Name der Positionsdatei ohne .c (liegt im selben Ordner wie die JSON)."),
      num("SpawnAnzahl_MIN", "SpawnAnzahl_MIN", "Mindestanzahl gleichzeitig gespawnter Stashes dieser Klasse.", true),
      num("SpawnAnzahl_MAX", "SpawnAnzahl_MAX", "Höchstanzahl gespawnter Stashes.", true),
      num("DespawnTime", "DespawnTime (s)", "Zeit in Sekunden bis zum Despawn. 5400 = 1,5 Stunden.", true),
      num("DespawnPlayerRadius", "DespawnPlayerRadius (m)", "Solange ein Spieler näher ist, despawnt der Stash nicht."),
      num("NeedItemsDamage", "NeedItemsDamage (%)", "Beschädigung der benötigten Items pro Verwendung in Prozent."),
      num("LootAnzahl_MIN", "LootAnzahl_MIN", "Mindestanzahl Items/Stacks im Stash.", true),
      num("LootAnzahl_MAX", "LootAnzahl_MAX", "Höchstanzahl Items/Stacks im Stash.", true),
      field("NeedItems", "Classnames von Items, die zum Öffnen benötigt werden (z. B. Dietrich).", needBox, true),
    ]);
    const valHost = h("div", {});
    const showVal = () => {
      clear(valHost);
      const v = validate(p);
      const lines = [];
      v.forEach((x) => lines.push(x.level === "error" ? { k: "warn", t: "Fehler: " + x.msg } : { k: "warn", t: "Hinweis: " + x.msg }));
      if (!v.length) lines.push({ k: "ok", t: "Keine Fehler oder Warnungen." });
      lines.slice(0, 40).forEach((l) => valHost.appendChild(h("div", { class: "issue " + (l.k === "ok" ? "ok" : "warn"), text: l.t })));
      if (lines.length > 40) valHost.appendChild(h("div", { class: "muted small", text: "… +" + (lines.length - 40) + " weitere" }));
    };
    showVal();
    const posInfo = h("div", { class: "muted small", text: pos ? "Positionsdatei: " + pos.path.split("/").pop() + " · " + pos.count + " Spawnpositionen" + (pos.count < j.SpawnAnzahl_MAX ? " (weniger als SpawnAnzahl_MAX!)" : "") : "Positionsdatei „" + j.PositionsFile + ".c“ nicht geladen." });

    // --- Tabelle
    const idx = filteredIndexes(p);
    const libCols = libFields().filter((f) => st.libCols[f.key]);
    const cols = COLS.filter((c) => !st.hidden[c[0]]);
    const widths = cols.map((c) => c[3]).concat(libCols.map(() => 140));
    const gridCols = "34px " + widths.map((w) => w + "px").join(" ") + " 60px";
    const rowW = 34 + widths.reduce((a, b) => a + b, 0) + 60 + (widths.length + 2) * 6;
    const map = libMap();
    const headRow = h("div", { class: "xcp-row xcp-head", style: "grid-template-columns:" + gridCols }, [
      h("input", { type: "checkbox", title: "Alle gefilterten markieren", onchange: (e) => (e.target.checked ? idx.forEach((i) => st.sel.add(i)) : st.sel.clear(), renderEditor()) }),
    ].concat(
      cols.map((c) => h("button", { class: "xcp-th", type: "button", title: "Sortieren", text: c[1] + (st.sort.key === c[0] ? (st.sort.dir > 0 ? " ▲" : " ▼") : ""), onclick: () => (st.sort = { key: c[0], dir: st.sort.key === c[0] ? -st.sort.dir : 1 }, renderEditor()) })),
      libCols.map((f) => h("button", { class: "xcp-th", type: "button", title: f.label, text: f.label + (st.sort.key === f.key ? (st.sort.dir > 0 ? " ▲" : " ▼") : ""), onclick: () => (st.sort = { key: f.key, dir: st.sort.key === f.key ? -st.sort.dir : 1 }, renderEditor()) })),
      [h("span", { text: "" })]
    ));
    let editing = false;
    const row = (vi) => {
      const i = idx[vi];
      const e = j.Lootpool[i];
      const cells = [
        h("input", { type: "checkbox", checked: st.sel.has(i), onclick: (ev) => {
          if (ev.shiftKey && st.last > -1) {
            const a = idx.indexOf(st.last);
            const b = vi;
            for (let k = Math.min(a, b); k <= Math.max(a, b); k++) st.sel.add(idx[k]);
          } else if (ev.target.checked) st.sel.add(i);
          else st.sel.delete(i);
          st.last = i;
          selInfo();
          tableBox.__paint();
        } }),
      ];
      cols.forEach((c) => {
        const inp = h("input", { type: c[2] === "text" ? "text" : "number", step: c[2] === "int" ? "1" : "any", value: shown(e[c[0]]), list: c[0] === "Name" ? "xcp-names" : undefined, class: "xcp-cell" });
        inp.addEventListener("focus", () => {
          if (!editing) {
            pushUndo(p);
            editing = true;
          }
        });
        inp.addEventListener("blur", () => (editing = false));
        inp.addEventListener("input", () => {
          if (c[2] === "text") mut(p, () => (e.Name = inp.value));
          else {
            const t = inp.value.trim();
            if (t === "" || !isFinite(Number(t))) return;
            mut(p, () => (e[c[0]] = c[2] === "int" ? Math.round(Number(t)) : Number(t)));
          }
          showVal();
        });
        cells.push(inp);
      });
      libCols.forEach((f) => cells.push(h("span", { class: "xcp-lib small muted", title: libValue(map, e.Name, f.key), text: libValue(map, e.Name, f.key) })));
      cells.push(h("button", { class: "btn icon small", type: "button", title: "Duplizieren", text: "⧉", onclick: () => (pushUndo(p), mut(p, (x) => x.Lootpool.splice(i + 1, 0, JSON.parse(JSON.stringify(e)))), st.sel.clear(), renderEditor()) }));
      return h("div", { class: "xcp-row" + (st.sel.has(i) ? " sel" : ""), style: "grid-template-columns:" + gridCols }, cells);
    };
    const tableBox = virtual(430, 30, idx.length, row);
    const selInfoEl = h("span", { class: "muted small" });
    const selInfo = () => (selInfoEl.textContent = st.sel.size + " markiert · " + idx.length + " von " + j.Lootpool.length + " sichtbar");
    selInfo();

    const fIn = h("input", { type: "search", placeholder: "Filter (Name/Felder) …", value: st.filter, style: "max-width:220px", oninput: (e) => ((st.filter = e.target.value), refilter()) });
    const cIn = h("input", { type: "text", placeholder: "z. B. chance<1 oder menge>1", value: st.cmp, style: "max-width:190px", title: "Zahlenfilter: chance|menge|qmin|qmax  <  >  <=  >=  =  Wert", oninput: (e) => ((st.cmp = e.target.value), refilter()) });
    let rt = null;
    const refilter = () => {
      clearTimeout(rt);
      rt = setTimeout(renderEditor, 250);
    };
    const colMenu = h("details", { class: "xcp-colmenu" }, [h("summary", { class: "btn small", text: "Spalten" }), h("div", { class: "xcp-colpop" }, COLS.map((c) => h("label", { class: "checkrow small" }, [h("input", { type: "checkbox", checked: !st.hidden[c[0]], disabled: c[0] === "Name", onchange: (e) => ((st.hidden[c[0]] = !e.target.checked), renderEditor()) }), c[1]])).concat(libFields().map((f) => h("label", { class: "checkrow small" }, [h("input", { type: "checkbox", checked: !!st.libCols[f.key], onchange: (e) => ((st.libCols[f.key] = e.target.checked), renderEditor()) }), f.label]))))]);

    const targets = () => (st.sel.size ? Array.from(st.sel) : idx);
    const mass = h("div", { class: "toolbar" }, []);
    const mField = h("select", {}, COLS.slice(1).map((c) => h("option", { value: c[0], text: c[1] })));
    const mOp = h("select", {}, [["set", "setzen auf"], ["add", "+ addieren"], ["mul", "× multiplizieren"], ["pct", "± Prozent ändern"]].map(([v, t]) => h("option", { value: v, text: t })));
    const mVal = h("input", { type: "number", step: "any", value: 0, style: "width:90px" });
    mass.appendChild(h("span", { class: "muted small", text: "Massenbearbeitung:" }));
    [mField, mOp, mVal].forEach((x) => mass.appendChild(x));
    mass.appendChild(
      h("button", { class: "btn small", type: "button", text: "Anwenden", title: "Wirkt auf die Markierten – ohne Markierung auf alle gefilterten Einträge", onclick: () => {
        const v = Number(mVal.value);
        if (!isFinite(v)) return;
        const t = targets();
        pushUndo(p);
        mut(p, () =>
          t.forEach((i) => {
            const e = j.Lootpool[i];
            const k = mField.value;
            const old = e[k];
            let nv = mOp.value === "set" ? v : mOp.value === "add" ? old + v : mOp.value === "mul" ? old * v : old * (1 + v / 100);
            if (k !== "Chance") nv = Math.round(nv);
            e[k] = +nv.toPrecision(12);
          })
        );
        EQE.toast(t.length + " Einträge geändert.");
        renderEditor();
      } })
    );

    const bar = h("div", { class: "toolbar" }, [
      fIn,
      cIn,
      colMenu,
      selInfoEl,
      h("span", { class: "spacer" }),
      h("button", { class: "btn small", type: "button", text: "↶", title: "Rückgängig", disabled: !st.undo.length, onclick: () => undoRedo(p, st.undo, st.redo) }),
      h("button", { class: "btn small", type: "button", text: "↷", title: "Wiederholen", disabled: !st.redo.length, onclick: () => undoRedo(p, st.redo, st.undo) }),
      h("button", { class: "btn small", type: "button", text: "+ Item", onclick: () => (pushUndo(p), mut(p, (x) => x.Lootpool.push({ Name: "", Chance: 1, MengeMax: 1, QuantityMin: 100, QuantityMax: 100, QualityMin: 20, QualityMax: 80 })), renderEditor(), tableBox.scrollTo && 0) }),
      h("button", { class: "btn small", type: "button", text: "Kopieren", title: "Markierte Einträge kopieren", onclick: () => ((st.clip = Array.from(st.sel).sort((a, b) => a - b).map((i) => JSON.parse(JSON.stringify(j.Lootpool[i])))), navigator.clipboard && navigator.clipboard.writeText(JSON.stringify(st.clip)).catch(() => {}), EQE.toast(st.clip.length + " Einträge kopiert.")) }),
      h("button", { class: "btn small", type: "button", text: "Einfügen", title: "Kopierte Einträge hier anhängen (auch aus anderen Pools)", onclick: () => st.clip.length && (pushUndo(p), mut(p, (x) => st.clip.forEach((e) => x.Lootpool.push(JSON.parse(JSON.stringify(e))))), renderEditor()) }),
      h("button", { class: "btn small danger", type: "button", text: "Markierte löschen", onclick: () => st.sel.size && confirm(st.sel.size + " Einträge löschen?") && (pushUndo(p), mut(p, (x) => (x.Lootpool = x.Lootpool.filter((_, i) => !st.sel.has(i)))), st.sel.clear(), renderEditor()) }),
    ]);

    // Übernehmen aus anderem Pool
    const srcSel = h("select", {}, list.filter((x) => x.uid !== p.uid).map((x) => h("option", { value: x.uid, text: x.fileId })));
    const copyBar = h("div", { class: "toolbar" }, [
      h("span", { class: "muted small", text: "Aus anderem Pool übernehmen:" }),
      srcSel,
      h("button", { class: "btn small", type: "button", text: "Alle Items", onclick: () => { const s = poolOf(srcSel.value); if (s && confirm("Alle Items aus „" + s.fileId + "“ ERSETZEN die Items von „" + p.fileId + "“?")) { pushUndo(p); mut(p, (x) => (x.Lootpool = JSON.parse(JSON.stringify(s.json.Lootpool)))); renderEditor(); } } }),
      h("button", { class: "btn small", type: "button", text: "Allgemeine Einstellungen", onclick: () => { const s = poolOf(srcSel.value); if (s) { mut(p, (x) => GEN_NUM.forEach((k) => (x[k] = s.json[k])) || (x.NeedItems = JSON.parse(JSON.stringify(s.json.NeedItems || [])))); renderEditor(); } } }),
      h("span", { class: "spacer" }),
      h("button", { class: "btn small", type: "button", text: "Stand merken (Vergleichsbasis)", onclick: () => saveSnap(p) }),
      h("button", { class: "btn small", type: "button", text: "Server-ZIP", title: "Alle Pool-JSONs + Positionsdateien in Serverstruktur", onclick: () => exportZip(false) }),
      h("button", { class: "btn small", type: "button", text: "Projekt-ZIP", title: "Wie Server-ZIP plus Item-Datenbank und Projekt-Metadaten", onclick: () => exportZip(true) }),
    ]);

    const dl = h("datalist", { id: "xcp-names" }, suggestions().slice(0, 12000).map((n) => h("option", { value: n })));
    const body = h("div", { class: "mp-split" }, [
      h("div", { class: "mp-listcol" }, [nav, poolBtns]),
      h("div", { class: "mp-detail" }, [
        h("div", { class: "section" }, [h("div", { class: "section-head", text: p.fileId }), h("div", { class: "section-body" }, [gen, posInfo, valHost, copyBar])]),
        h("div", { class: "section" }, [h("div", { class: "section-head", text: "Lootpool (" + j.Lootpool.length + " Einträge)" }), h("div", { class: "section-body" }, [bar, mass, h("div", { class: "xcp-scroll", style: "--w:" + rowW + "px" }, [headRow, tableBox]), h("div", { class: "help", text: "Mehrfach vorkommende Classnames sind erlaubt. Chance 0.01 = 0,01 %. Unveränderte Zahlen behalten beim Speichern ihre volle Genauigkeit." })])]),
      ]),
    ]);
    box.appendChild(body);
    box.appendChild(dl);
    box.__scroll = keepScroll;
  }

  function newPool(copy) {
    const src = curPool();
    const base = copy && src ? src.fileId + "_Kopie" : "Exodus_Neuer_Lootpool";
    const id = P().uniqueIdFor ? P().uniqueIdFor(LOOT, base) : base + "_" + Math.floor(Math.random() * 1000);
    const json = copy && src ? JSON.parse(JSON.stringify(src.json)) : { Klasse: id, PositionsFile: id + "_Positions", SpawnAnzahl_MIN: 1, SpawnAnzahl_MAX: 1, DespawnTime: 5400, DespawnPlayerRadius: 20.0, NeedItems: [], NeedItemsDamage: 0.0, LootAnzahl_MIN: 1, LootAnzahl_MAX: 3, Lootpool: [] };
    if (copy) {
      json.Klasse = id;
      json.PositionsFile = id + "_Positions";
    }
    const sample = src && src.path ? src.path.split("/") : null;
    const dir = sample ? sample.slice(0, Math.max(0, sample.length - 2)).join("/") : "XCP_Loot_System";
    const r = P().add(LOOT, json, { path: (dir ? dir + "/" : "") + id + "/" + id + ".json", fileId: id, rawText: null });
    r.item.dirty = true;
    st.pool = r.item.uid;
    renderEditor();
  }

  // ================================================================ Export (Server / Projekt)
  function exportZip(withProject) {
    const files = [];
    pools().forEach((it) => {
      const rel = (it.path || "").split("/").slice(-3).join("/").replace(/^(?!XCP_Loot_System)/, "XCP_Loot_System/");
      const dir = "XCP_Loot_System/" + it.fileId + "/";
      files.push({ name: dir + it.fileId + ".json", text: P().exportTextOf ? P().exportTextOf(it) : K().stringify(it) });
      const pos = posOf(it);
      if (pos && pos.text) files.push({ name: dir + (it.json.PositionsFile || it.fileId + "_Positions") + ".c", text: pos.text });
      void rel;
    });
    if (!files.length) return EQE.toast("Keine Lootpools zum Exportieren.", true);
    if (withProject) {
      const lib = libItem();
      if (lib) files.push({ name: "XCP_Project/ItemLibrary.json", text: K().stringify(lib) });
      files.push({ name: "XCP_Project/project-meta.json", text: JSON.stringify({ schema: 1, exported: new Date().toISOString(), simVersion: EQE.XCPSim ? EQE.XCPSim.VERSION : "", snapshots: snaps(), views: { hidden: st.hidden, libCols: st.libCols } }, null, 2) });
    }
    const blob = P().buildZip(files);
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: withProject ? "XCP_Loot_Projekt.zip" : "XCP_Loot_Server.zip" });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    EQE.toast(files.length + " Dateien exportiert" + (withProject ? " (Projekt-Version)." : " (Server-Version)."));
  }

  // ================================================================ Item-Datenbank
  function ensureLib() {
    let it = libItem();
    if (it) return it;
    const first = pools()[0];
    const dir = first && first.path ? first.path.split("/").slice(0, -4).join("/") : "";
    const json = { xcpItemLibrary: 1, schema: 1, tabs: [{ id: "t1", name: "Allgemein", hidden: false, fields: [{ key: "anzeigename", label: "Anzeigename", type: "text" }, { key: "kategorie", label: "Kategorie", type: "dropdown", options: ["Medizin", "Nahrung", "Munition", "Waffen", "Kleidung", "Elektronik", "Sonstiges"] }, { key: "seltenheit", label: "Seltenheit", type: "dropdown", options: ["Häufig", "Selten", "Sehr selten"] }] }], items: [] };
    const r = P().add(LIB, json, { path: (dir ? dir + "/" : "") + "Item Libary/ItemLibrary.json", fileId: "ItemLibrary", rawText: null });
    r.item.dirty = true;
    return r.item;
  }
  function collectNames() {
    const it = ensureLib();
    const have = new Set(it.json.items.map((x) => x.Name));
    let n = 0;
    mut(it, (j) =>
      pools().forEach((p) =>
        p.json.Lootpool.forEach((e) => {
          if (e.Name && !have.has(e.Name)) {
            have.add(e.Name);
            j.items.push({ Name: e.Name });
            n++;
          }
        })
      )
    );
    EQE.toast(n + " neue Classnames in die Item-Datenbank übernommen.");
    renderLib();
  }

  function usage(name) {
    const out = [];
    pools().forEach((p) => {
      const rows = p.json.Lootpool.map((e, i) => [e, i]).filter(([e]) => e.Name === name);
      if (rows.length) out.push({ pool: p, rows: rows });
    });
    return out;
  }

  function renderLib() {
    const box = roots.items;
    if (!box) return;
    clear(box);
    box.appendChild(head("Item-Datenbank", "Zentrale Liste aller Classnames mit eigenen Tabs und Feldern (Kategorie, Seltenheit …). Gespeichert als eigene JSON „Item Libary/ItemLibrary.json“ – getrennt von den Server-Dateien."));
    const it = libItem();
    const tb = h("div", { class: "toolbar" }, [
      h("button", { class: "btn primary", type: "button", text: it ? "Classnames aus Lootpools übernehmen" : "Item-Datenbank anlegen", onclick: collectNames }),
    ]);
    box.appendChild(tb);
    if (!it) return box.appendChild(h("div", { class: "muted", text: "Noch keine Item-Datenbank. „Anlegen“ erzeugt sie aus den Classnames der geladenen Lootpools." }));
    const j = it.json;
    const tabsBar = h("div", { class: "toolbar" }, [h("span", { class: "muted small", text: "Tabs:" })]);
    j.tabs.forEach((t) => {
      tabsBar.appendChild(h("label", { class: "checkrow small", title: "Tab ein-/ausblenden (Daten bleiben erhalten)" }, [h("input", { type: "checkbox", checked: !t.hidden, onchange: (e) => (mut(it, () => (t.hidden = !e.target.checked)), renderLib()) }), t.name]));
      tabsBar.appendChild(h("button", { class: "btn small", type: "button", title: "Umbenennen", text: "✎", onclick: () => { const n = prompt("Neuer Name für den Tab:", t.name); if (n) (mut(it, () => (t.name = n)), renderLib()); } }));
      tabsBar.appendChild(h("button", { class: "btn small", type: "button", title: "Feld hinzufügen", text: "+Feld", onclick: () => addField(it, t) }));
      tabsBar.appendChild(h("button", { class: "btn small", type: "button", title: "Duplizieren", text: "⧉", onclick: () => { mut(it, () => j.tabs.push(Object.assign(JSON.parse(JSON.stringify(t)), { id: "t" + Date.now(), name: t.name + " (Kopie)" }))); renderLib(); } }));
      tabsBar.appendChild(h("button", { class: "btn small danger", type: "button", title: "Tab löschen", text: "✕", onclick: () => confirm("Tab „" + t.name + "“ samt Daten löschen? (Ausblenden löscht nichts.)") && (mut(it, () => (j.tabs = j.tabs.filter((x) => x !== t))), renderLib()) }));
    });
    tabsBar.appendChild(h("button", { class: "btn small", type: "button", text: "+ Tab", onclick: () => { const n = prompt("Name des neuen Tabs:"); if (n) (mut(it, () => j.tabs.push({ id: "t" + Date.now(), name: n, hidden: false, fields: [] })), renderLib()); } }));
    box.appendChild(tabsBar);

    const fields = libFields().filter((f) => !f.tab.hidden);
    const map = libMap();
    const fIn = h("input", { type: "search", placeholder: "Suchen (Name und alle sichtbaren Felder) …", value: st.lib.filter, style: "max-width:300px", oninput: (e) => ((st.lib.filter = e.target.value), clearTimeout(box.__t), (box.__t = setTimeout(renderLib, 250))) });
    const q = lc(st.lib.filter.trim());
    let rows = j.items.map((x, i) => i);
    if (q) rows = rows.filter((i) => lc(j.items[i].Name + " " + fields.map((f) => libValue(map, j.items[i].Name, f.key)).join(" ")).indexOf(q) > -1);
    const csv = h("div", { class: "toolbar" }, [
      fIn,
      h("span", { class: "muted small", text: rows.length + " von " + j.items.length + " Items" }),
      h("span", { class: "spacer" }),
      h("button", { class: "btn small", type: "button", text: "+ Classname", onclick: () => { const n = prompt("Classname:"); if (n && !map.has(n)) (mut(it, () => j.items.push({ Name: n })), renderLib()); } }),
      h("button", { class: "btn small", type: "button", text: "CSV exportieren", onclick: () => download("ItemLibrary.csv", [["Name"].concat(libFields().map((f) => f.key)).map(csvCell).join(";")].concat(j.items.map((x) => [x.Name].concat(libFields().map((f) => libValue(map, x.Name, f.key))).map(csvCell).join(";"))).join("\n"), "text/csv") }),
      h("button", { class: "btn small", type: "button", text: "CSV importieren", onclick: () => importCsv(it) }),
    ]);
    box.appendChild(csv);
    const gridCols = "260px " + fields.map(() => "170px").join(" ") + " 70px 40px";
    const rowW = 260 + fields.length * 170 + 110 + (fields.length + 3) * 6;
    const headRow = h("div", { class: "xcp-row xcp-head", style: "grid-template-columns:" + gridCols }, [h("span", { text: "Name" })].concat(fields.map((f) => h("span", { title: f.label, text: f.label })), [h("span", { text: "Verwendung" }), h("span", {})]));
    const rowFn = (vi) => {
      const x = j.items[rows[vi]];
      const cells = [h("input", { type: "text", class: "xcp-cell", value: x.Name, oninput: (e) => mut(it, () => (x.Name = e.target.value)) })];
      fields.forEach((f) => {
        const cur = x[f.tab.id] && x[f.tab.id][f.field.key];
        const set = (v) => mut(it, () => ((x[f.tab.id] = x[f.tab.id] || {})[f.field.key] = v));
        const type = f.field.type;
        let c;
        if (type === "bool") c = h("input", { type: "checkbox", checked: !!cur, onchange: (e) => set(e.target.checked) });
        else if (type === "dropdown") c = h("select", { class: "xcp-cell", onchange: (e) => set(e.target.value) }, [h("option", { value: "", text: "" })].concat((f.field.options || []).map((o) => h("option", { value: o, text: o, selected: o === cur }))));
        else if (type === "number" || type === "percent") c = h("input", { type: "number", step: "any", class: "xcp-cell", value: cur === undefined ? "" : cur, oninput: (e) => e.target.value !== "" && set(Number(e.target.value)) });
        else if (type === "multi") c = h("input", { type: "text", class: "xcp-cell", title: "Mehrfachauswahl: Werte mit Komma trennen", value: Array.isArray(cur) ? cur.join(", ") : "", oninput: (e) => set(e.target.value.split(",").map((s) => s.trim()).filter(Boolean)) });
        else c = h("input", { type: "text", class: "xcp-cell", value: cur || "", oninput: (e) => set(e.target.value) });
        cells.push(c);
      });
      const us = usage(x.Name);
      cells.push(h("button", { class: "btn small", type: "button", text: us.reduce((n, u) => n + u.rows.length, 0) + "×", title: "Verwendung anzeigen", onclick: () => showUsage(x.Name) }));
      cells.push(h("button", { class: "btn icon small", type: "button", text: "✕", onclick: () => confirm("„" + x.Name + "“ aus der Datenbank entfernen?") && (mut(it, () => j.items.splice(j.items.indexOf(x), 1)), renderLib()) }));
      return h("div", { class: "xcp-row", style: "grid-template-columns:" + gridCols }, cells);
    };
    box.appendChild(h("div", { class: "xcp-scroll", style: "--w:" + rowW + "px" }, [headRow, virtual(480, 30, rows.length, rowFn)]));
    box.appendChild(h("div", { id: "xcp-usage" }));
  }
  function addField(it, t) {
    const label = prompt("Name des neuen Feldes:");
    if (!label) return;
    const type = (prompt("Typ: text, number, percent, bool, dropdown, multi, note", "text") || "text").trim();
    const f = { key: label.toLowerCase().replace(/[^a-z0-9]+/g, "_") + "_" + (t.fields.length + 1), label: label, type: type };
    if (type === "dropdown" || type === "multi") f.options = (prompt("Auswahlwerte, mit Komma getrennt:", "") || "").split(",").map((s) => s.trim()).filter(Boolean);
    mut(it, () => t.fields.push(f));
    renderLib();
  }
  function showUsage(name) {
    const host = document.getElementById("xcp-usage");
    if (!host) return;
    clear(host);
    const us = usage(name);
    host.appendChild(h("h4", { text: "Verwendung von " + name }));
    if (!us.length) return host.appendChild(h("div", { class: "muted", text: "In keinem geladenen Lootpool eingetragen." }));
    const tb = h("tbody");
    us.forEach((u) => u.rows.forEach(([e, i]) => tb.appendChild(h("tr", {}, [h("td", { text: u.pool.fileId }), h("td", { text: "#" + (i + 1) }), h("td", { text: String(shown(e.Chance)) + " %" }), h("td", { text: "MengeMax " + e.MengeMax }), h("td", { text: "Menge " + e.QuantityMin + "–" + e.QuantityMax }), h("td", { text: "Qualität " + e.QualityMin + "–" + e.QualityMax })]))));
    host.appendChild(h("table", { class: "ptable" }, [tb]));
  }
  function importCsv(it) {
    const inp = h("input", { type: "file", accept: ".csv", style: "display:none" });
    document.body.appendChild(inp);
    inp.addEventListener("change", async () => {
      const f = inp.files[0];
      inp.remove();
      if (!f) return;
      const lines = (await f.text()).split(/\r?\n/).filter(Boolean);
      const split = (l) => l.split(";").map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"'));
      const heads = split(lines[0]);
      const fields = libFields();
      const j = it.json;
      let n = 0;
      mut(it, () =>
        lines.slice(1).forEach((l) => {
          const c = split(l);
          if (!c[0]) return;
          let x = j.items.find((y) => y.Name === c[0]);
          if (!x) j.items.push((x = { Name: c[0] }));
          heads.forEach((hk, ci) => {
            const fd = fields.find((q) => q.field.key === hk);
            if (fd && c[ci] !== undefined && c[ci] !== "") (x[fd.tab.id] = x[fd.tab.id] || {})[hk] = fd.field.type === "number" || fd.field.type === "percent" ? Number(c[ci]) : fd.field.type === "bool" ? /^(1|true|ja)$/i.test(c[ci]) : fd.field.type === "multi" ? c[ci].split(",").map((s) => s.trim()) : c[ci];
          });
          n++;
        })
      );
      EQE.toast(n + " Zeilen aus der CSV übernommen.");
      renderLib();
    });
    inp.click();
  }

  // ================================================================ Simulator
  let worker = null;
  function runStats(pool, n, runs, seed, opts, onProgress) {
    return new Promise((resolve, reject) => {
      const id = Date.now() + Math.random();
      const fallback = () => EQE.XCPSim.statistics(pool, n, runs, seed, opts, onProgress, () => st.sim.cancel).then(resolve, reject);
      try {
        if (!worker) worker = new Worker("js/xcp-loot-worker.js");
        worker.onmessage = (e) => {
          const m = e.data;
          if (m.id !== id) return;
          if (m.type === "progress") onProgress && onProgress(m.p);
          else if (m.type === "done") resolve(m.result);
          else if (m.type === "cancelled") resolve(null);
          else reject(new Error(m.message));
        };
        worker.onerror = () => {
          worker = null;
          fallback();
        };
        worker.postMessage({ cmd: "stats", id: id, pool: { Lootpool: pool.Lootpool, LootAnzahl_MIN: pool.LootAnzahl_MIN, LootAnzahl_MAX: pool.LootAnzahl_MAX }, n: n, runs: runs, seed: seed, opts: opts });
      } catch (e) {
        fallback();
      }
    });
  }
  const cancelRun = () => {
    st.sim.cancel = true;
    if (worker) worker.postMessage({ cmd: "cancel" });
  };

  function table(heads, rows, opts) {
    const tb = h("tbody");
    rows.forEach((r) => tb.appendChild(h("tr", {}, r.map((c) => h("td", { text: c === undefined ? "" : String(c) })))));
    return h("div", { class: "table-scroll", style: "max-height:" + ((opts && opts.max) || 420) + "px" }, [h("table", { class: "ptable prod-table" }, [h("thead", {}, [h("tr", {}, heads.map((t) => (typeof t === "string" ? h("th", { text: t }) : h("th", { class: "xcp-sortable", text: t.text, onclick: t.onclick }))))]), tb])]);
  }
  function bars(items, label) {
    const max = Math.max.apply(null, items.map((x) => x[1]).concat([1e-9]));
    return h("div", { class: "xcp-bars" }, [h("div", { class: "muted small", text: label })].concat(items.map(([n, v]) => h("div", { class: "xcp-bar" }, [h("span", { class: "xcp-bl", title: n, text: n }), h("span", { class: "xcp-bv", style: "width:" + Math.max(1, (v / max) * 100) + "%" }), h("span", { class: "small muted", text: fmt(v, 2) })]))));
  }
  function groupSums(rows, getName, getVal, key, map) {
    const g = {};
    rows.forEach((r) => {
      const k = libValue(map, getName(r), key) || "(ohne Zuordnung)";
      g[k] = (g[k] || 0) + getVal(r);
    });
    return Object.keys(g).map((k) => [k, g[k]]).sort((a, b) => b[1] - a[1]);
  }

  function renderSim() {
    const box = roots.sim;
    if (!box) return;
    clear(box);
    box.appendChild(head("Loot-Simulator", "Simuliert Stash-Inhalte aus einem Lootpool. VORLÄUFIGES Modell – die echte Server-Auswahllogik ist nicht bestätigt; alle Regeln sind unten einstellbar."));
    const list = pools();
    if (!list.length) return nodata(box, "Keine Lootpools zum Simulieren");
    const S = st.sim;
    if (!poolOf(S.pool)) S.pool = list[0].uid;
    const p = poolOf(S.pool);
    const sel = h("select", { onchange: (e) => ((S.pool = e.target.value), (S.result = null), (S.run = null), renderSim()) }, list.map((x) => h("option", { value: x.uid, text: x.fileId, selected: x.uid === S.pool })));
    const inN = (k, lab, tp, min) => field(lab, tp, h("input", { type: "number", min: String(min || 1), step: "1", value: S[k], oninput: (e) => (S[k] = Math.max(min || 1, Math.round(Number(e.target.value) || 1))) }));
    const mode = h("select", { onchange: (e) => (S.mode = e.target.value) }, [["passes", "Durchgänge (jeder Eintrag würfelt seine Chance)"], ["weighted", "Gewichtet (Ziehen proportional zur Chance)"]].map(([v, t]) => h("option", { value: v, text: t, selected: S.mode === v })));
    const grid = h("div", { class: "grid2" }, [
      field("Lootpool", "Welcher Pool simuliert wird.", sel),
      field("Modell", "Provisorisches Ziehverfahren (austauschbar). Chance = Prozent; MengeMax = wie oft ein Eintrag je Stash gezogen werden darf; Anzahl je Stash zwischen LootAnzahl_MIN/MAX.", mode),
      inN("n", "Anzahl Stashes", "Wie viele Stashes je Durchlauf geöffnet werden."),
      inN("runs", "Durchläufe (Statistik)", "Wie oft der komplette Durchlauf für die Statistik wiederholt wird (mehr = genauere Intervalle, dauert länger).", 5),
      field("Seed", "Gleicher Seed + gleiche Konfiguration + gleiche Modellversion = gleiche Ergebnisse.", h("div", { class: "toolbar" }, [h("input", { type: "number", value: S.seed, style: "max-width:140px", oninput: (e) => (S.seed = Math.round(Number(e.target.value) || 0)) }), h("button", { class: "btn small", type: "button", text: "Zufälliger Seed", onclick: () => (S.seed = Math.floor(Math.random() * 1e9), renderSim()) })])),
    ]);
    box.appendChild(h("div", { class: "section" }, [h("div", { class: "section-body" }, [grid, h("div", { class: "muted small", text: "Modellversion: " + EQE.XCPSim.VERSION })])]));
    const progress = h("progress", { max: "1", value: S.progress, style: "width:200px;display:none" });
    const actions = h("div", { class: "toolbar" }, [
      h("button", { class: "btn primary", type: "button", text: "A: Statistische Prognose", onclick: async (ev) => {
        S.cancel = false;
        progress.style.display = "";
        try {
          const res = await runStats(p.json, S.n, S.runs, S.seed, { mode: S.mode }, (v) => (progress.value = v));
          progress.style.display = "none";
          if (!res) return EQE.toast("Simulation abgebrochen.", true);
          S.result = res;
          S.view = "stats";
          renderSim();
        } catch (e) {
          EQE.toast("Simulation fehlgeschlagen: " + e.message, true);
        }
      } }),
      h("button", { class: "btn primary", type: "button", text: "B: Konkreter Durchlauf", onclick: () => {
        const t = Date.now();
        S.run = { version: EQE.XCPSim.VERSION, seed: S.seed, mode: S.mode, pool: p.fileId, stashes: EQE.XCPSim.run(p.json, S.n, S.seed, { mode: S.mode }), ms: Date.now() - t };
        S.view = "run";
        S.stash = 1;
        renderSim();
      } }),
      h("button", { class: "btn", type: "button", text: "Abbrechen", onclick: cancelRun }),
      progress,
    ]);
    box.appendChild(actions);
    if (S.result && S.view !== "run") renderStats(box, S.result, p);
    if (S.run && S.view === "run") renderRun(box, S.run, p);
  }

  function renderStats(box, res, p) {
    const S = st.sim;
    const map = libMap();
    const fields = libFields().filter((f) => !f.tab.hidden);
    const q = lc(S.filter.trim());
    let rows = res.rows.filter((r) => !q || lc(r.name + " " + fields.map((f) => libValue(map, r.name, f.key)).join(" ")).indexOf(q) > -1);
    rows = rows.slice().sort((a, b) => {
      const k = S.sort;
      const x = k.indexOf(".") > -1 ? libValue(map, a.name, k) : a[k];
      const y = k.indexOf(".") > -1 ? libValue(map, b.name, k) : b[k];
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * S.dir;
    });
    const sort = (k) => () => ((S.dir = S.sort === k ? -S.dir : -1), (S.sort = k), renderSim());
    const heads = [{ text: "Item", onclick: sort("name") }].concat(fields.map((f) => ({ text: f.label, onclick: sort(f.key) })), [
      ["Ø gesamt", "mean"], ["Median", "median"], ["Std.abw.", "sd"], ["Min", "min"], ["Max", "max"], ["80 % von", "p10"], ["80 % bis", "p90"], ["95 % von", "p025"], ["95 % bis", "p975"], ["P(≥1) je Durchlauf", "atLeastOneRun"], ["P(≥1) je Stash", "stashProb"], ["Ø Menge/Stash", "perStash"], ["Ø Quantity", "avgQty"],
    ].map(([t, k]) => ({ text: t, onclick: sort(k) })));
    const trows = rows.slice(0, 600).map((r) => [r.name].concat(fields.map((f) => libValue(map, r.name, f.key)), [fmt(r.mean, 2), fmt(r.median, 1), fmt(r.sd, 2), r.min, r.max, fmt(r.p10, 1), fmt(r.p90, 1), fmt(r.p025, 1), fmt(r.p975, 1), fmt(r.atLeastOneRun * 100, 1) + " %", fmt(r.stashProb * 100, 2) + " %", fmt(r.perStash, 3), fmt(r.avgQty, 1)]));
    const info = K().calcBox([
      K().head("Prognose: " + res.stashes + " Stashes × " + res.runs + " Durchläufe (Seed " + res.seed + ", Modell " + res.version + ")"),
      K().row("Items je Durchlauf", fmt(res.itemsMean, 1), "80-%-Bereich " + fmt(res.itemsP10, 0) + " – " + fmt(res.itemsP90, 0) + " · Pool-Kapazität " + res.capacity),
      K().row("Intervalle", "Prognoseintervalle", "empirische Quantile über alle Durchläufe: Bereich, in dem das Ergebnis EINES kompletten Durchlaufs liegt (kein Konfidenzintervall des Mittelwerts)"),
    ]);
    box.appendChild(info);
    const gsel = h("select", { onchange: (e) => ((S.group = e.target.value), renderSim()) }, [h("option", { value: "", text: "Verteilung nach Feld …" })].concat(libFields().map((f) => h("option", { value: f.key, text: f.label, selected: S.group === f.key }))));
    box.appendChild(h("div", { class: "toolbar" }, [
      h("input", { type: "search", placeholder: "Filter (Item und alle Felder) …", value: S.filter, style: "max-width:260px", oninput: (e) => ((S.filter = e.target.value), clearTimeout(box.__t), (box.__t = setTimeout(renderSim, 250))) }),
      gsel,
      h("span", { class: "muted small", text: rows.length + " Items" }),
      h("span", { class: "spacer" }),
      h("button", { class: "btn small", type: "button", text: "CSV", onclick: () => download("Loot_Prognose.csv", [heads.map((x) => csvCell(x.text)).join(";")].concat(rows.map((r) => [r.name].concat(fields.map((f) => libValue(map, r.name, f.key)), [r.mean, r.median, r.sd, r.min, r.max, r.p10, r.p90, r.p025, r.p975, r.atLeastOneRun, r.stashProb, r.perStash, r.avgQty]).map(csvCell).join(";"))).join("\n"), "text/csv") }),
      h("button", { class: "btn small", type: "button", text: "JSON", onclick: () => download("Loot_Prognose.json", JSON.stringify(res, null, 2), "application/json") }),
    ]));
    box.appendChild(table(heads, trows));
    const top = rows.slice().sort((a, b) => b.mean - a.mean).slice(0, 15).map((r) => [r.name, r.mean]);
    box.appendChild(bars(top, "Häufigste Items (Ø Anzahl je Durchlauf)"));
    if (S.group) box.appendChild(bars(groupSums(res.rows, (r) => r.name, (r) => r.mean, S.group, map).slice(0, 20), "Verteilung nach „" + (libFields().find((f) => f.key === S.group) || {}).label + "“ (Ø Anzahl)"));
    const one = h("select", {}, rows.slice(0, 600).map((r) => h("option", { value: r.name, text: r.name })));
    const dist = h("div", {});
    one.addEventListener("change", async () => {
      clear(dist);
      const stashes = EQE.XCPSim.run(p.json, S.n, S.seed, { mode: S.mode });
      const per = stashes.map((s) => s.filter((x) => x.name === one.value).length);
      const hist = {};
      per.forEach((c) => (hist[c] = (hist[c] || 0) + 1));
      dist.appendChild(bars(Object.keys(hist).map((k) => ["×" + k + " im Stash", hist[k]]), "Verteilung von „" + one.value + "“ pro Stash (ein Durchlauf, Seed " + S.seed + ")"));
    });
    box.appendChild(h("div", { class: "toolbar" }, [h("span", { class: "muted small", text: "Einzelnes Item:" }), one]));
    box.appendChild(dist);
  }

  function renderRun(box, run, p) {
    const S = st.sim;
    const map = libMap();
    const fields = libFields().filter((f) => !f.tab.hidden);
    const total = {};
    let items = 0;
    run.stashes.forEach((s) =>
      s.forEach((x) => {
        total[x.name] = (total[x.name] || 0) + 1;
        items++;
      })
    );
    const names = Object.keys(total);
    box.appendChild(K().calcBox([
      K().head("Durchlauf: " + run.stashes.length + " Stashes (Seed " + run.seed + ", " + run.version + ", " + run.ms + " ms)"),
      K().row("Items gesamt", String(items), "Ø " + fmt(items / Math.max(1, run.stashes.length), 2) + " je Stash"),
      K().row("Verschiedene Items", String(names.length), ""),
    ]));
    const gsel = h("select", { onchange: (e) => ((S.group = e.target.value), renderSim()) }, [h("option", { value: "", text: "Verteilung nach Feld …" })].concat(libFields().map((f) => h("option", { value: f.key, text: f.label, selected: S.group === f.key }))));
    const rowsAll = names.map((n) => ({ name: n, n: total[n] })).sort((a, b) => b.n - a.n);
    box.appendChild(h("div", { class: "toolbar" }, [gsel, h("span", { class: "spacer" }), h("button", { class: "btn small", type: "button", text: "Durchlauf als JSON", onclick: () => download("Loot_Durchlauf_" + run.seed + ".json", JSON.stringify({ version: run.version, seed: run.seed, mode: run.mode, pool: run.pool, stashes: run.stashes.map((s) => s.map((x) => ({ Name: x.name, Quantity: x.qty, Quality: x.quality }))) }), "application/json") })]));
    box.appendChild(table(["Item"].concat(fields.map((f) => f.label), ["Anzahl gesamt", "Ø je Stash"]), rowsAll.slice(0, 400).map((r) => [r.name].concat(fields.map((f) => libValue(map, r.name, f.key)), [r.n, fmt(r.n / run.stashes.length, 3)]))));
    if (S.group) box.appendChild(bars(groupSums(rowsAll, (r) => r.name, (r) => r.n, S.group, map).slice(0, 20), "Verteilung nach „" + (libFields().find((f) => f.key === S.group) || {}).label + "“"));
    // einzelne Stashes
    const find = h("input", { type: "text", placeholder: "Stashes mit Item/Feldwert suchen (Text oder /regex/)", value: S.find, style: "max-width:320px", oninput: (e) => (S.find = e.target.value) });
    const res = h("div", {});
    const doFind = () => {
      clear(res);
      let re;
      const t = S.find.trim();
      try {
        re = /^\/.*\/$/.test(t) ? new RegExp(t.slice(1, -1), "i") : new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      } catch (e) {
        return res.appendChild(h("div", { class: "issue warn", text: "Ungültiger regulärer Ausdruck." }));
      }
      const hits = [];
      run.stashes.forEach((s, i) => s.some((x) => re.test(x.name + " " + fields.map((f) => libValue(map, x.name, f.key)).join(" "))) && hits.push(i + 1));
      res.appendChild(h("div", { class: "small muted", text: hits.length + " Stashes gefunden:" }));
      res.appendChild(h("div", { class: "strlist" }, hits.slice(0, 200).map((n) => h("button", { class: "chip", type: "button", text: "Stash " + n, onclick: () => ((S.stash = n), renderSim()) }))));
    };
    box.appendChild(h("div", { class: "toolbar" }, [find, h("button", { class: "btn small", type: "button", text: "Suchen", onclick: doFind })]));
    box.appendChild(res);
    const sIn = h("input", { type: "number", min: "1", max: String(run.stashes.length), value: S.stash, style: "width:90px", onchange: (e) => ((S.stash = Math.min(run.stashes.length, Math.max(1, Math.round(Number(e.target.value) || 1)))), renderSim()) });
    box.appendChild(h("div", { class: "toolbar" }, [h("span", { text: "Stash öffnen:" }), sIn, h("span", { class: "muted small", text: "von " + run.stashes.length })]));
    const s = run.stashes[S.stash - 1] || [];
    box.appendChild(table(["#", "Classname"].concat(fields.map((f) => f.label), ["Quantity", "Quality"]), s.map((x, i) => [i + 1, x.name].concat(fields.map((f) => libValue(map, x.name, f.key)), [x.qty, x.quality])), { max: 300 }));
  }

  // ================================================================ Vergleich & Analyse
  function entryKey(list) {
    const seen = {};
    return list.map((e) => {
      seen[e.Name] = (seen[e.Name] || 0) + 1;
      return e.Name + "#" + seen[e.Name];
    });
  }
  function diffPools(a, b) {
    const out = [];
    GEN_NUM.concat(["Klasse", "PositionsFile"]).forEach((k) => a[k] !== b[k] && out.push(["Allgemein", k, a[k], b[k]]));
    if (JSON.stringify(a.NeedItems) !== JSON.stringify(b.NeedItems)) out.push(["Allgemein", "NeedItems", (a.NeedItems || []).join(", "), (b.NeedItems || []).join(", ")]);
    const ka = entryKey(a.Lootpool);
    const kb = entryKey(b.Lootpool);
    const mb = new Map(kb.map((k, i) => [k, b.Lootpool[i]]));
    const ma = new Map(ka.map((k, i) => [k, a.Lootpool[i]]));
    ka.forEach((k, i) => {
      const ea = a.Lootpool[i];
      const eb = mb.get(k);
      if (!eb) return out.push(["Entfernt", ea.Name, "", ""]);
      ["Chance", "MengeMax", "QuantityMin", "QuantityMax", "QualityMin", "QualityMax"].forEach((f) => ea[f] !== eb[f] && out.push(["Geändert", ea.Name + " · " + f, ea[f], eb[f]]));
    });
    kb.forEach((k, i) => !ma.has(k) && out.push(["Hinzugefügt", b.Lootpool[i].Name, "", ""]));
    return out;
  }

  function renderCmp() {
    const box = roots.cmp;
    if (!box) return;
    clear(box);
    box.appendChild(head("Loot-Analyse & Vergleich", "Vergleicht zwei Lootpools oder einen gemerkten Stand mit dem aktuellen Pool: Konfigurationsunterschiede und statistische Auswirkung (gleicher Seed)."));
    const list = pools();
    if (!list.length) return nodata(box, "Keine Lootpools zum Vergleichen");
    const C = st.cmpv;
    if (!poolOf(C.a)) C.a = list[0].uid;
    const snapsAll = snaps();
    const optsB = list.map((x) => ["p:" + x.uid, "Pool: " + x.fileId]).concat(Object.keys(snapsAll).map((k) => ["s:" + k, "Gemerkter Stand: " + k + " (" + new Date(snapsAll[k].t).toLocaleString() + ")"]));
    if (!C.b || !optsB.some((o) => o[0] === C.b)) C.b = (optsB[1] || optsB[0])[0];
    const selA = h("select", { onchange: (e) => ((C.a = e.target.value), (C.res = null), renderCmp()) }, list.map((x) => h("option", { value: x.uid, text: x.fileId, selected: x.uid === C.a })));
    const selB = h("select", { onchange: (e) => ((C.b = e.target.value), (C.res = null), renderCmp()) }, optsB.map(([v, t]) => h("option", { value: v, text: t, selected: v === C.b })));
    box.appendChild(h("div", { class: "section" }, [h("div", { class: "section-body" }, [h("div", { class: "grid2" }, [
      field("A (aktuell / neu)", "Die Version, die als „Nachher“ gilt.", selA),
      field("B (Vorher / Referenz)", "Anderer Pool oder zuvor im Konfigurator gemerkter Stand.", selB),
      field("Stashes", "Anzahl Stashes je Simulationsdurchlauf.", h("input", { type: "number", value: C.n, oninput: (e) => (C.n = Math.max(1, Math.round(Number(e.target.value) || 1))) })),
      field("Durchläufe", "Wiederholungen für die Mittelwerte.", h("input", { type: "number", value: C.runs, oninput: (e) => (C.runs = Math.max(5, Math.round(Number(e.target.value) || 5))) })),
      field("Seed", "Beide Seiten werden mit demselben Seed simuliert.", h("input", { type: "number", value: C.seed, oninput: (e) => (C.seed = Math.round(Number(e.target.value) || 0)) })),
    ])])]));
    const a = poolOf(C.a);
    const bJson = C.b.startsWith("p:") ? (poolOf(C.b.slice(2)) || {}).json : (snapsAll[C.b.slice(2)] || {}).json;
    if (!a || !bJson) return;
    const diff = diffPools(bJson, a.json);
    box.appendChild(h("div", { class: "section" }, [h("div", { class: "section-head", text: "Konfigurationsunterschiede (B → A): " + diff.length }), h("div", { class: "section-body" }, [diff.length ? table(["Art", "Eintrag/Feld", "B (vorher)", "A (nachher)"], diff.slice(0, 500).map((r) => r.map((c) => (typeof c === "number" ? String(shown(c)) : c))), { max: 300 }) : h("div", { class: "muted", text: "Keine Unterschiede." })])]));
    const progress = h("progress", { max: "1", value: 0, style: "width:200px;display:none" });
    box.appendChild(h("div", { class: "toolbar" }, [
      h("button", { class: "btn primary", type: "button", text: "Statistisch vergleichen", onclick: async () => {
        C.res = null;
        progress.style.display = "";
        st.sim.cancel = false;
        try {
          const ra = await runStats(a.json, C.n, C.runs, C.seed, { mode: st.sim.mode }, (v) => (progress.value = v / 2));
          const rb = ra && (await runStats(bJson, C.n, C.runs, C.seed, { mode: st.sim.mode }, (v) => (progress.value = 0.5 + v / 2)));
          progress.style.display = "none";
          if (!ra || !rb) return EQE.toast("Abgebrochen.", true);
          C.res = { a: ra, b: rb };
          renderCmp();
        } catch (e) {
          EQE.toast("Fehler: " + e.message, true);
        }
      } }),
      h("button", { class: "btn", type: "button", text: "Abbrechen", onclick: cancelRun }),
      progress,
    ]));
    if (!C.res) return;
    const mb = new Map(C.res.b.rows.map((r) => [r.name, r]));
    const names = Array.from(new Set(C.res.a.rows.map((r) => r.name).concat(C.res.b.rows.map((r) => r.name))));
    const ma = new Map(C.res.a.rows.map((r) => [r.name, r]));
    const libm = libMap();
    const rows = names.map((n) => {
      const x = (mb.get(n) || { mean: 0 }).mean;
      const y = (ma.get(n) || { mean: 0 }).mean;
      return { n: n, b: x, a: y, d: x ? ((y - x) / x) * 100 : y ? Infinity : 0 };
    }).sort((p, q) => Math.abs(q.a - q.b) - Math.abs(p.a - p.b));
    box.appendChild(h("div", { class: "section" }, [h("div", { class: "section-head", text: "Statistischer Vergleich (Ø Anzahl je Durchlauf, " + C.n + " Stashes)" }), h("div", { class: "section-body" }, [
      table(["Item", "Vorher Ø (B)", "Nachher Ø (A)", "Veränderung"], rows.slice(0, 400).map((r) => [r.n, fmt(r.b, 2), fmt(r.a, 2), r.d === Infinity ? "neu" : (r.d >= 0 ? "+" : "") + fmt(r.d, 1) + " %"])),
    ])]));
    const gsel = h("select", { onchange: (e) => ((C.group = e.target.value), renderCmp()) }, [h("option", { value: "", text: "Economy-Analyse nach Feld …" })].concat(libFields().map((f) => h("option", { value: f.key, text: f.label, selected: C.group === f.key }))));
    box.appendChild(h("div", { class: "toolbar" }, [gsel]));
    if (C.group) {
      const g = {};
      rows.forEach((r) => {
        const k = libValue(libm, r.n, C.group) || "(ohne Zuordnung)";
        g[k] = g[k] || { a: 0, b: 0 };
        g[k].a += r.a;
        g[k].b += r.b;
      });
      box.appendChild(table(["Gruppe", "Vorher Σ", "Nachher Σ", "Veränderung"], Object.keys(g).sort((x, y) => g[y].b + g[y].a - g[x].b - g[x].a).map((k) => [k, fmt(g[k].b, 1), fmt(g[k].a, 1), g[k].b ? (g[k].a >= g[k].b ? "+" : "") + fmt(((g[k].a - g[k].b) / g[k].b) * 100, 1) + " %" : "neu"])));
    }
  }

  // ================================================================ Gerüst
  function init(map) {
    roots.loot = map.loot;
    roots.items = map.items;
    roots.sim = map.sim;
    roots.cmp = map.cmp;
    P().registerSerializer([LOOT, LIB], K().stringify);
    renderEditor();
    renderLib();
    renderSim();
    renderCmp();
    return { refresh: { xcploot: renderEditor, xcpitems: renderLib, xcpsim: renderSim, xcpcmp: renderCmp } };
  }

  EQE.XcpLoot = { select: (uid) => { st.pool = uid; renderEditor(); }, init: init, ingestPositions: ingestPositions, crossCheck: crossCheck, KIND: LOOT, LIB: LIB, validate: validate };
  EQE.XCPSim = window.XCPSim;
})(window.EQE);
