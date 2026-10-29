/**
 * Exodus Quest Editor – Override-Tool: config.cpp einlesen, Items kategorisieren, Werte ändern und eine DayZ-konforme
 * Override-Config (Exodus_Overrides) erzeugen, die NUR die geänderten Werte enthält.
 */
(function (EQE) {
  "use strict";
  const h = EQE.h;
  const clear = EQE.clear;
  const Cfg = EQE.Cfg;

  const STORE_KEY = "eqe:overrides:v1";
  const MOD_DIR = "Exodus_Overrides";
  const PAGE = 150;

  // ---------------------------------------------------------------- Zustand (Änderungen bleiben im Browser erhalten)
  const state = {
    edits: {}, // "Abschnitt/Klasse" -> {section, name, base, set: {pfad: {array, v}}, inh: {pfad: true}}
    patchName: MOD_DIR,
    extraAddons: ["DZ_Data"],
    disabledAddons: [],
    baseline: "", // Text der Config, wie sie zuletzt gespeichert/geladen wurde
    existingPath: "", // Pfad einer im Projekt gefundenen Exodus_Overrides-config.cpp
  };
  let saveTimer = null;

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(state));
      } catch (e) {
        /* egal */
      }
    }, 300);
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (s && typeof s === "object") {
        state.edits = s.edits || {};
        state.patchName = s.patchName || MOD_DIR;
        state.extraAddons = Array.isArray(s.extraAddons) ? s.extraAddons : ["DZ_Data"];
        state.disabledAddons = Array.isArray(s.disabledAddons) ? s.disabledAddons : [];
        state.baseline = s.baseline || "";
        state.existingPath = s.existingPath || "";
      }
    } catch (e) {
      /* egal */
    }
  }
  load();

  // ---------------------------------------------------------------- Feld-Katalog
  /** type: int | float | text | bool | pair | trio | strlist | numlist | select */
  const SPEC_GROUPS = [
    {
      id: "general",
      title: "Allgemein",
      hint: "Name, Gewicht und Größe im Inventar",
      show: () => true,
    },
    {
      id: "cargo",
      title: "Inventar & Cargo",
      hint: "Platz in Containern/Kleidung und Slots",
      show: (c) => c.section === "CfgVehicles",
    },
    {
      id: "health",
      title: "Haltbarkeit",
      hint: "Lebenspunkte (Hitpoints) und Reparatur",
      show: (c) => c.section === "CfgVehicles" || c.section === "CfgWeapons",
    },
    { id: "armor", title: "Schutz (Rüstung)", hint: "Schadensfaktor gegen Nahkampf, Projektile und Splitter", show: (c) => c.section === "CfgVehicles" || c.section === "CfgWeapons", matrix: true },
    {
      id: "clothing",
      title: "Kleidung & Isolierung",
      hint: "Wärme, Sichtbarkeit, Nässe",
      show: (c) => c.section === "CfgVehicles" && (c.cat.group === "Kleidung" || c.hasAny(["heatIsolation", "visibilityModifier", "absorbency"])),
    },
    {
      id: "quantity",
      title: "Menge & Flüssigkeiten",
      hint: "Stapelgröße, Füllmenge, Verbrauch",
      show: (c) => c.section === "CfgVehicles" && (c.cat.group === "Essen & Trinken" || c.hasPrefix("varQuantity") || c.hasAny(["liquidContainerType", "quantityBar", "stackedUnit"])),
    },
    {
      id: "nutrition",
      title: "Nährwerte",
      hint: "Energie, Wasser, Giftigkeit",
      show: (c) => c.section === "CfgVehicles" && (c.cat.group === "Essen & Trinken" || c.hasPrefix("Nutrition/")),
    },
    { id: "weapon", title: "Waffe", hint: "Magazine, Rückstoß, Streuung, Feuermodi", show: (c) => c.section === "CfgWeapons" },
    { id: "magazine", title: "Magazin / Munition", hint: "Kapazität und Munitionstyp", show: (c) => c.section === "CfgMagazines" },
    { id: "ammo", title: "Projektil", hint: "Schaden, Geschwindigkeit, Streuung", show: (c) => c.section === "CfgAmmo" },
  ];

  const SPECS = [
    // Allgemein
    { id: "displayName", group: "general", label: "Anzeigename", type: "text", path: "displayName", help: "Text oder $STR_-Verweis auf die Stringtable." },
    { id: "descriptionShort", group: "general", label: "Beschreibung", type: "text", path: "descriptionShort" },
    { id: "weight", group: "general", label: "Gewicht (g)", type: "int", path: "weight", help: "Gewicht eines Items in Gramm." },
    { id: "itemSize", group: "general", label: "Inventargröße", type: "pair", path: "itemSize", labels: ["Breite", "Höhe"], help: "Felder im Inventar (Breite × Höhe)." },
    { id: "scope", group: "general", label: "Sichtbarkeit (scope)", type: "select", path: "scope", options: [["0", "0 – nur Basisklasse"], ["1", "1 – versteckt"], ["2", "2 – öffentlich (spawnbar)"]] },
    { id: "rotationFlags", group: "general", label: "Rotationsflags", type: "int", path: "rotationFlags", help: "Bitmaske der erlaubten Drehungen im Inventar (z. B. 17)." },
    { id: "isMeleeWeapon", group: "general", label: "Nahkampfwaffe", type: "bool", path: "isMeleeWeapon" },
    // Cargo
    { id: "itemsCargoSize", group: "cargo", label: "Cargo-Größe", type: "pair", path: "itemsCargoSize", labels: ["Spalten", "Zeilen"], help: "Platz im Inneren (Rucksack, Jacke, Container): Spalten × Zeilen." },
    { id: "attachments", group: "cargo", label: "Attachment-Slots", type: "strlist", path: "attachments", suggest: "slots", help: "Slots, an denen Items befestigt werden können." },
    { id: "inventorySlot", group: "cargo", label: "Passt in Slot", type: "strlist", path: "inventorySlot", suggest: "slots", help: "Slots, in die das Item angezogen/befestigt werden kann." },
    { id: "canBeSplit", group: "cargo", label: "Stapel teilbar", type: "bool", path: "canBeSplit" },
    // Haltbarkeit
    { id: "hitpoints", group: "health", label: "Lebenspunkte (Haltbarkeit)", type: "float", path: "DamageSystem/GlobalHealth/Health/hitpoints", help: "Höher = hält mehr aus, bevor das Item beschädigt/ruiniert ist." },
    { id: "repairableWithKits", group: "health", label: "Reparierbar mit Kit-Typen", type: "numlist", path: "repairableWithKits", help: "Zahlen der passenden Reparatur-Kits (z. B. 5 = Nähkit)." },
    { id: "repairCosts", group: "health", label: "Reparaturkosten", type: "numlist", path: "repairCosts", help: "Verbrauch pro Reparatur, gleiche Reihenfolge wie die Kit-Typen." },
    // Kleidung
    { id: "heatIsolation", group: "clothing", label: "Wärmeisolierung", type: "float", path: "heatIsolation", help: "0 = keine, 1 = maximal." },
    { id: "visibilityModifier", group: "clothing", label: "Sichtbarkeit (Tarnung)", type: "float", path: "visibilityModifier", help: "Kleiner = schwerer zu sehen." },
    { id: "absorbency", group: "clothing", label: "Saugfähigkeit", type: "float", path: "absorbency", help: "0 = nimmt kein Wasser auf, 1 = saugt voll." },
    { id: "varWetMax", group: "clothing", label: "Max. Nässe", type: "float", path: "varWetMax" },
    { id: "noMask", group: "clothing", label: "Keine Maske tragbar", type: "bool", path: "noMask" },
    // Menge
    { id: "varQuantityInit", group: "quantity", label: "Startmenge", type: "float", path: "varQuantityInit" },
    { id: "varQuantityMin", group: "quantity", label: "Minimale Menge", type: "float", path: "varQuantityMin" },
    { id: "varQuantityMax", group: "quantity", label: "Maximale Menge", type: "float", path: "varQuantityMax" },
    { id: "varQuantityDestroyOnMin", group: "quantity", label: "Zerstören bei Minimum", type: "bool", path: "varQuantityDestroyOnMin" },
    { id: "quantityBar", group: "quantity", label: "Mengenbalken anzeigen", type: "bool", path: "quantityBar" },
    { id: "stackedUnit", group: "quantity", label: "Einheit", type: "text", path: "stackedUnit", suggest: ["g", "ml", "pc", "percentage"], help: "z. B. g, ml, pc." },
    { id: "liquidContainerType", group: "quantity", label: "Flüssigkeits-Container-Typ", type: "int", path: "liquidContainerType", help: "Bitmaske der erlaubten Flüssigkeiten." },
    // Nährwerte
    { id: "nutEnergy", group: "nutrition", label: "Energie (Kalorien)", type: "float", path: "Nutrition/energy" },
    { id: "nutWater", group: "nutrition", label: "Wasser", type: "float", path: "Nutrition/water" },
    { id: "nutFull", group: "nutrition", label: "Nährwert gesamt", type: "float", path: "Nutrition/fullnutritionalvalue" },
    { id: "nutIndex", group: "nutrition", label: "Nährwert-Index", type: "float", path: "Nutrition/nutritionalindex" },
    { id: "nutToxicity", group: "nutrition", label: "Giftigkeit", type: "float", path: "Nutrition/toxicity" },
    { id: "nutDigest", group: "nutrition", label: "Verdaulichkeit", type: "float", path: "Nutrition/digestibility" },
    { id: "nutAgents", group: "nutrition", label: "Erreger (Bitmaske)", type: "int", path: "Nutrition/agents" },
    // Waffe
    { id: "magazines", group: "weapon", label: "Magazine", type: "strlist", path: "magazines", suggest: "magazines", help: "Magazin-Klassen, die in die Waffe passen." },
    { id: "chamberSize", group: "weapon", label: "Patronenlager", type: "int", path: "chamberSize" },
    { id: "chamberedRound", group: "weapon", label: "Verwendete Patronen", type: "strlist", path: "chamberedRound", suggest: "magazines" },
    { id: "chamberableFrom", group: "weapon", label: "Einzeln ladbar mit", type: "strlist", path: "chamberableFrom", suggest: "magazines" },
    { id: "reloadAction", group: "weapon", label: "Nachlade-Aktion", type: "text", path: "reloadAction" },
    { id: "recoilModifier", group: "weapon", label: "Rückstoß-Faktor", type: "trio", path: "recoilModifier", labels: ["X", "Y", "Z"], help: "1 = Standard; kleiner = weniger Rückstoß." },
    { id: "swayModifier", group: "weapon", label: "Schwanken-Faktor", type: "trio", path: "swayModifier", labels: ["X", "Y", "Z"], help: "1 = Standard." },
    { id: "dispersion", group: "weapon", label: "Streuung", type: "float", path: "dispersion" },
    { id: "distanceZoomMin", group: "weapon", label: "Zoom min. (m)", type: "int", path: "distanceZoomMin" },
    { id: "distanceZoomMax", group: "weapon", label: "Zoom max. (m)", type: "int", path: "distanceZoomMax" },
    { id: "singleReload", group: "weapon", label: "Einzelfeuer: Nachladezeit", type: "float", path: "Single/reloadTime", needsProp: true },
    { id: "singleDisp", group: "weapon", label: "Einzelfeuer: Streuung", type: "float", path: "Single/dispersion", needsProp: true },
    { id: "burstReload", group: "weapon", label: "Salve: Nachladezeit", type: "float", path: "Burst/reloadTime", needsProp: true },
    { id: "autoReload", group: "weapon", label: "Dauerfeuer: Nachladezeit", type: "float", path: "FullAuto/reloadTime", needsProp: true },
    { id: "autoDisp", group: "weapon", label: "Dauerfeuer: Streuung", type: "float", path: "FullAuto/dispersion", needsProp: true },
    // Magazin
    { id: "count", group: "magazine", label: "Kapazität (Patronen)", type: "int", path: "count" },
    { id: "ammo", group: "magazine", label: "Munitionstyp", type: "text", path: "ammo", suggest: "ammo", help: "Klasse aus CfgAmmo." },
    { id: "tracersEvery", group: "magazine", label: "Leuchtspur alle … Schuss", type: "int", path: "tracersEvery" },
    // Projektil
    { id: "hit", group: "ammo", label: "Treffer (hit)", type: "float", path: "hit" },
    { id: "indirectHit", group: "ammo", label: "Explosion: Schaden", type: "float", path: "indirectHit" },
    { id: "indirectHitRange", group: "ammo", label: "Explosion: Reichweite", type: "float", path: "indirectHitRange" },
    { id: "typicalSpeed", group: "ammo", label: "Typische Geschwindigkeit", type: "float", path: "typicalSpeed" },
    { id: "initSpeed", group: "ammo", label: "Mündungsgeschwindigkeit", type: "float", path: "initSpeed" },
    { id: "airFriction", group: "ammo", label: "Luftwiderstand", type: "float", path: "airFriction" },
    { id: "caliber", group: "ammo", label: "Kaliber", type: "float", path: "caliber" },
    { id: "dmgHealth", group: "ammo", label: "Schaden Gesundheit", type: "float", path: "DamageApplied/Health/damage" },
    { id: "dmgBlood", group: "ammo", label: "Schaden Blut", type: "float", path: "DamageApplied/Blood/damage" },
    { id: "dmgShock", group: "ammo", label: "Schaden Schock", type: "float", path: "DamageApplied/Shock/damage" },
    { id: "dmgInflicted", group: "ammo", label: "Schaden an Items (bulletInflictedDamage)", type: "float", path: "DamageApplied/bulletInflictedDamage" },
  ];

  const ARMOR_ROWS = [
    ["Melee", "Nahkampf"],
    ["Projectile", "Projektile"],
    ["FragGrenade", "Splitter / Granaten"],
  ];
  const ARMOR_COLS = [
    ["Health", "Gesundheit"],
    ["Blood", "Blut"],
    ["Shock", "Schock"],
  ];
  const ARMOR_BASE = "DamageSystem/GlobalArmor/";

  /** Bekannte Slot-Namen für Vorschlagslisten. */
  const KNOWN_SLOTS = Object.keys(Cfg.CLOTHING_SLOTS).concat(["Cartridge", "Magazine", "Belt_Left", "Belt_Right", "BeltExtra", "Pistol", "Knife", "Hands", "Splint_Right", "Splint_Left", "Bandana", "weaponOptics", "weaponMuzzle", "weaponWrap", "weaponFlashlight", "weaponBayonet", "weaponButtstock", "weaponHandguard"]);

  // ---------------------------------------------------------------- Werte lesen/schreiben
  function keyOf(entry) {
    return entry.section + "/" + entry.name;
  }
  function norm(s) {
    const t = String(s).trim();
    const n = Number(t);
    return t !== "" && Number.isFinite(n) ? String(n) : t;
  }
  function sameItems(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (norm(a[i]) !== norm(b[i])) return false;
    return true;
  }
  function getEdit(entry, path) {
    const e = state.edits[keyOf(entry)];
    return e ? e.set[path] : undefined;
  }
  /** Aktueller Skalar (Roh-Text): Änderung vor geerbtem Wert; undefined = nirgends vorhanden. */
  function curScalar(entry, path) {
    const ed = getEdit(entry, path);
    if (ed && !ed.array) return ed.v;
    return Cfg.effScalar(entry, path);
  }
  function curArray(entry, path) {
    const ed = getEdit(entry, path);
    if (ed && ed.array) return ed.v;
    return Cfg.effArray(entry, path);
  }
  function effProp(entry, path) {
    return Cfg.effective(entry).get(path.toLowerCase());
  }

  function ensureEdit(entry) {
    const k = keyOf(entry);
    if (!state.edits[k]) state.edits[k] = { section: entry.section, name: entry.name, base: entry.base || "", set: {}, inh: {} };
    return state.edits[k];
  }
  function pruneEdit(entry) {
    const k = keyOf(entry);
    const e = state.edits[k];
    if (e && Object.keys(e.set).length === 0) delete state.edits[k];
  }

  const changeListeners = [];
  function changed() {
    persist();
    changeListeners.forEach((f) => f());
    if (EQE.Project && EQE.Project.notify) EQE.Project.notify();
  }

  function setScalar(entry, path, raw) {
    const eff = effProp(entry, path);
    const same = eff && !eff.array && norm(eff.raw) === norm(raw);
    if (same || raw === undefined) removeEdit(entry, path, true);
    else {
      const e = ensureEdit(entry);
      e.set[path] = { array: false, v: String(raw) };
      e.base = entry.base || e.base;
    }
    changed();
  }
  function setArray(entry, path, items) {
    const eff = effProp(entry, path);
    if (eff && eff.array && sameItems(eff.items, items)) removeEdit(entry, path, true);
    else {
      const e = ensureEdit(entry);
      e.set[path] = { array: true, v: items.slice() };
      e.base = entry.base || e.base;
    }
    changed();
  }
  function removeEdit(entry, path, silent) {
    const e = state.edits[keyOf(entry)];
    if (!e) return;
    delete e.set[path];
    pruneEdit(entry);
    if (!silent) changed();
  }
  function resetEntry(entry) {
    delete state.edits[keyOf(entry)];
    changed();
  }
  function editCount(key) {
    const e = state.edits[key];
    return e ? Object.keys(e.set).length : 0;
  }

  function fmtNum(n, asInt) {
    if (asInt) return String(Math.round(n));
    return String(parseFloat(n.toFixed(4)));
  }

  // Zahl-Ziele (für Einzelfelder und Massenbearbeitung): Skalar oder Array-Element
  function getNum(entry, t) {
    if (t.idx === undefined) {
      const s = curScalar(entry, t.path);
      return s === undefined ? NaN : Cfg.num(s);
    }
    const a = curArray(entry, t.path);
    return a && a[t.idx] !== undefined ? Cfg.num(a[t.idx]) : NaN;
  }
  function setNum(entry, t, value) {
    const txt = fmtNum(value, t.int);
    if (t.idx === undefined) {
      setScalar(entry, t.path, txt);
      return;
    }
    const base = (curArray(entry, t.path) || []).slice();
    while (base.length <= t.idx) base.push("0");
    base[t.idx] = txt;
    setArray(entry, t.path, base);
  }

  // ---------------------------------------------------------------- Index, Filter
  let index = null; // Abschnitt -> [{entry, cat, text}]
  function buildIndex() {
    index = new Map();
    Cfg.sections().forEach((map, sec) => {
      const arr = [];
      map.forEach((entry) => {
        const cat = Cfg.classify(entry);
        const dn = Cfg.unquote(Cfg.effScalar(entry, "displayName") || "");
        arr.push({ entry: entry, cat: cat, dn: dn, text: (entry.name + " " + dn).toLowerCase(), base: Cfg.isBaseClass(entry) });
      });
      arr.sort((a, b) => a.entry.name.localeCompare(b.entry.name));
      index.set(sec, arr);
    });
  }
  Cfg.onChange(() => {
    index = null;
  });
  function getIndex() {
    if (!index) buildIndex();
    return index;
  }

  const filter = { section: "", group: "", sub: "", source: "", search: "", onlyChanged: false, showBase: false, page: 1 };
  const selection = new Set(); // Massenauswahl
  let currentKey = "";
  let view = "edit"; // edit | summary

  function matches(item, skip) {
    if (!filter.showBase && item.base) return false;
    if (skip !== "group" && filter.group && item.cat.group !== filter.group) return false;
    if (skip !== "sub" && filter.sub && item.cat.sub !== filter.sub) return false;
    if (filter.source && item.entry.files.indexOf(filter.source) < 0) return false;
    if (filter.onlyChanged && !state.edits[keyOf(item.entry)]) return false;
    if (filter.search && item.text.indexOf(filter.search) < 0) return false;
    return true;
  }
  function filtered() {
    const arr = getIndex().get(filter.section) || [];
    return arr.filter((it) => matches(it));
  }

  // ---------------------------------------------------------------- Config erzeugen (nur geänderte Werte)
  function buildTree(set) {
    const root = { props: [], children: new Map() };
    Object.keys(set).forEach((p) => {
      const segs = p.split("/");
      const prop = segs.pop();
      let node = root;
      segs.forEach((s) => {
        let c = node.children.get(s);
        if (!c) {
          c = { props: [], children: new Map() };
          node.children.set(s, c);
        }
        node = c;
      });
      node.props.push({ name: prop, array: set[p].array, v: set[p].v });
    });
    return root;
  }

  function fmtValue(v) {
    return String(v);
  }

  function emitNode(node, refs, pad, out) {
    node.props.forEach((p) => {
      if (p.array) out.push(pad + p.name + "[] = {" + p.v.map(fmtValue).join(", ") + "};");
      else out.push(pad + p.name + " = " + fmtValue(p.v) + ";");
    });
    node.children.forEach((child, seg) => {
      const lseg = seg.toLowerCase();
      const inOwn = !!(refs[0] && refs[0].children.has(lseg));
      const inBase = !inOwn && (child.__inh || refs.slice(1).some((r) => r && r.children.has(lseg)));
      const childRefs = refs.map((r) => (r ? r.children.get(lseg) || null : null));
      out.push(pad + "class " + seg + (inBase ? ": " + seg : ""));
      out.push(pad + "{");
      emitNode(child, childRefs, pad + "\t", out);
      out.push(pad + "};");
    });
  }

  function refsFor(edit) {
    const entry = Cfg.getEntry(edit.section, edit.name);
    if (!entry) return { refs: [null], entry: null };
    const c = Cfg.chain(entry);
    return { refs: c.map((e) => e.own), entry: entry };
  }

  /** Basisklasse mit der Schreibweise der Definition (Config-Namen sind nicht groß-/kleinschreibungsabhängig). */
  function canonBase(section, b) {
    if (!b) return "";
    const e = Cfg.getEntry(section, b);
    return e ? e.name : b;
  }

  function emitClass(edit, pad, out) {
    const r = refsFor(edit);
    const base = canonBase(edit.section, r.entry ? r.entry.base : edit.base);
    out.push(pad + "class " + edit.name + (base ? ": " + base : ""));
    out.push(pad + "{");
    // bei fehlender Quelle: gespeicherte Hinweise (inh) zur Vererbung nutzen
    const tree = buildTree(edit.set);
    if (!r.entry) markInherit(tree, edit);
    emitNode(tree, r.refs, pad + "\t", out);
    out.push(pad + "};");
  }
  function markInherit(tree, edit) {
    // ohne geladene Quelle: Klassen aus dem Import ("class X: X") bleiben erhalten
    const walk = (node, prefix) => {
      node.children.forEach((c, seg) => {
        const p = prefix + seg;
        if (edit.inh && edit.inh[p]) c.__inh = true;
        walk(c, p + "/");
      });
    };
    walk(tree, "");
  }

  function usedPatches() {
    const out = [];
    Object.keys(state.edits).forEach((k) => {
      const e = state.edits[k];
      const entry = Cfg.getEntry(e.section, e.name);
      if (!entry) return;
      Cfg.chain(entry).forEach((c) => {
        c.files.forEach((f) => {
          const src = Cfg.sources().find((s) => s.path === f);
          if (src) src.patches.forEach((p) => out.indexOf(p) < 0 && out.push(p));
        });
      });
    });
    return out;
  }
  function allPatches() {
    const out = [];
    Cfg.sources().forEach((s) => {
      if (!s.overrides) s.patches.forEach((p) => out.indexOf(p) < 0 && out.push(p));
    });
    return out;
  }
  function requiredAddons() {
    const out = [];
    usedPatches().forEach((p) => state.disabledAddons.indexOf(p) < 0 && p !== state.patchName && out.push(p));
    state.extraAddons.forEach((p) => p && p !== state.patchName && out.indexOf(p) < 0 && out.push(p));
    return out;
  }

  function generate(onlyKey) {
    const keys = Object.keys(state.edits)
      .filter((k) => (!onlyKey || k === onlyKey) && Object.keys(state.edits[k].set).length)
      .sort();
    if (!keys.length) return "";
    const out = [];
    out.push("// Exodus Quest Editor – Override-Config. Enthält nur die geänderten Werte; alles andere kommt aus den Original-Configs.");
    if (!onlyKey) {
      out.push("class CfgPatches");
      out.push("{");
      out.push("\tclass " + state.patchName);
      out.push("\t{");
      out.push("\t\tunits[] = {};");
      out.push("\t\tweapons[] = {};");
      out.push("\t\trequiredVersion = 0.1;");
      out.push("\t\trequiredAddons[] = {" + requiredAddons().map((a) => '"' + a + '"').join(", ") + "};");
      out.push("\t};");
      out.push("};");
      out.push("");
    }
    const sections = [];
    keys.forEach((k) => {
      const s = state.edits[k].section;
      if (sections.indexOf(s) < 0) sections.push(s);
    });
    sections.forEach((sec) => {
      const edits = keys.filter((k) => state.edits[k].section === sec).map((k) => state.edits[k]);
      // Basisklassen vor abgeleiteten Klassen ausgeben
      const names = new Set(edits.map((e) => e.name.toLowerCase()));
      const baseOf = (e) => {
        const entry = Cfg.getEntry(sec, e.name);
        return canonBase(sec, entry ? entry.base : e.base);
      };
      const ordered = [];
      const placed = new Set();
      const place = (e, depth) => {
        if (placed.has(e.name.toLowerCase()) || depth > 20) return;
        const b = baseOf(e);
        if (b && names.has(b.toLowerCase())) {
          const be = edits.find((x) => x.name.toLowerCase() === b.toLowerCase());
          if (be) place(be, depth + 1);
        }
        placed.add(e.name.toLowerCase());
        ordered.push(e);
      };
      edits.forEach((e) => place(e, 0));
      // externe Basisklassen vorab deklarieren
      const externals = [];
      ordered.forEach((e) => {
        const b = baseOf(e);
        if (b && !names.has(b.toLowerCase()) && !externals.some((x) => x.toLowerCase() === b.toLowerCase())) externals.push(b);
      });
      out.push("class " + sec);
      out.push("{");
      externals.forEach((b) => out.push("\tclass " + b + ";"));
      ordered.forEach((e) => emitClass(e, "\t", out));
      out.push("};");
      out.push("");
    });
    return out.join("\n").replace(/\n+$/, "\n");
  }

  // ---------------------------------------------------------------- Bestehende Exodus_Overrides-Config übernehmen
  function importExisting(src) {
    state.existingPath = src.path;
    const text = src.text;
    if (text === state.baseline) return;
    const hasLocal = Object.keys(state.edits).length > 0;
    state.baseline = text;
    if (!hasLocal) {
      const edits = {};
      src.root.children.forEach((sec) => {
        if (sec.name === "CfgPatches") {
          sec.children.forEach((p) => {
            if (p.forward) return;
            p.props.forEach((pr) => {
              if (pr.name === "requiredAddons" && pr.array) state.extraAddons = pr.items.map(Cfg.unquote).filter(Boolean);
            });
            state.patchName = p.name || state.patchName;
          });
          return;
        }
        sec.children.forEach((cls) => {
          if (cls.forward) return;
          const edit = { section: sec.name, name: cls.name, base: cls.base, set: {}, inh: {} };
          const walk = (node, prefix) => {
            node.props.forEach((p) => {
              edit.set[prefix + p.name] = p.array ? { array: true, v: p.items.slice() } : { array: false, v: p.raw };
            });
            node.children.forEach((c) => {
              if (c.base && c.base === c.name) edit.inh[prefix + c.name] = true;
              walk(c, prefix + c.name + "/");
            });
          };
          walk(cls, "");
          if (Object.keys(edit.set).length) edits[sec.name + "/" + cls.name] = edit;
        });
      });
      state.edits = edits;
    }
    persist();
  }

  function afterIngest() {
    Cfg.sources().forEach((s) => {
      if (s.overrides && /(^|\/)config\.cpp$/i.test(s.path)) importExisting(s);
    });
    index = null;
    if (!filter.section) pickDefaultSection();
    changed();
    render();
  }
  function pickDefaultSection() {
    const secs = Array.from(Cfg.sections().keys());
    const pref = ["CfgVehicles", "CfgWeapons", "CfgMagazines", "CfgAmmo"];
    filter.section = pref.find((p) => secs.indexOf(p) > -1) || secs[0] || "";
  }

  // ---------------------------------------------------------------- Einbindung ins Projekt (ZIP / Ordner speichern)
  function isChanged() {
    return generate() !== state.baseline;
  }
  function zipFiles(onlyChanged) {
    const text = generate();
    if (!text || (onlyChanged && text === state.baseline)) return [];
    const dir = state.existingPath ? zipDirOfExisting() : MOD_DIR + "/" + MOD_DIR + "/";
    const files = [{ name: dir + "config.cpp", text: text }];
    if (!state.existingPath) files.push({ name: dir + "$PBOPREFIX$.txt", text: MOD_DIR + "\n" });
    return files;
  }
  function zipDirOfExisting() {
    const p = state.existingPath;
    const m = /(^|.*?\/)(Exodus_Overrides(\/.*)?\/)config\.cpp$/i.exec(p);
    return m ? m[2] : MOD_DIR + "/" + MOD_DIR + "/";
  }
  /** Schreib-Aufträge für "In Projektordner speichern": liefert Dateien samt vollem Pfad im Projekt. */
  function fileWrites(ctx) {
    const text = generate();
    if (!text || text === state.baseline) return [];
    const root = ctx.rootName ? ctx.rootName + "/" : "";
    const dirNew = root + MOD_DIR + "/" + MOD_DIR + "/";
    const done = () => {
      state.baseline = text;
      if (!state.existingPath) state.existingPath = dirNew + "config.cpp";
      persist();
      changeListeners.forEach((f) => f());
    };
    if (state.existingPath) return [{ path: state.existingPath, text: text, onDone: done }];
    return [
      { path: dirNew + "config.cpp", text: text, onDone: done },
      { path: dirNew + "$PBOPREFIX$.txt", text: MOD_DIR + "\n", onDone: () => {} },
    ];
  }

  // ---------------------------------------------------------------- UI
  let root = null;
  let refs = {};

  function currentEntry() {
    if (!currentKey) return null;
    const i = currentKey.indexOf("/");
    return Cfg.getEntry(currentKey.slice(0, i), currentKey.slice(i + 1));
  }

  function counts() {
    let classes = 0;
    Cfg.sections().forEach((m) => (classes += m.size));
    return { files: Cfg.sources().filter((s) => !s.overrides).length, classes: classes, edits: Object.keys(state.edits).length };
  }

  function loadFiles(kind) {
    const input = h("input", { type: "file", style: "display:none" });
    if (kind === "folder") input.webkitdirectory = true;
    else {
      input.multiple = true;
      input.accept = ".cpp,.bin,.pbo";
    }
    document.body.appendChild(input);
    input.addEventListener("change", async () => {
      let n = 0;
      for (const f of Array.from(input.files)) {
        const path = f.webkitRelativePath || f.name;
        if (kind === "folder" && !EQE.CfgBin.isConfigSource(path)) continue;
        try {
          n += await EQE.CfgBin.ingestFile(f, path);
        } catch (err) {
          EQE.toast(path + ": " + err.message, true);
        }
      }
      input.remove();
      Cfg.rebuild();
      afterIngest();
      EQE.toast(n ? n + " Config(s) geladen." : "Keine config.cpp/config.bin/PBO mit Config gefunden.", !n);
    });
    input.click();
  }

  function init(panel) {
    root = panel;
    if (!filter.section) pickDefaultSection();
    changeListeners.push(updateLive);
    render();
    return { refresh: render };
  }

  /** Leichte Aktualisierung nach Änderungen (Zähler, Markierungen), ohne das Formular neu aufzubauen. */
  function updateLive() {
    if (!refs.status) return;
    const c = counts();
    refs.status.textContent = c.files + " config.cpp · " + c.classes + " Klassen · " + c.edits + " geänderte Klasse(n)";
    if (refs.saveBtn) refs.saveBtn.disabled = !isChanged();
    refs.list && refs.list.querySelectorAll("[data-key]").forEach((row) => row.classList.toggle("edited", !!state.edits[row.dataset.key]));
    refs.list &&
      refs.list.querySelectorAll("[data-badge]").forEach((b) => {
        const n = editCount(b.dataset.badge);
        b.textContent = n ? n + " ✎" : "";
      });
    if (refs.summaryPre && view === "summary") refs.summaryPre.textContent = generate() || "// (keine Änderungen)";
    if (refs.entryPre) refs.entryPre.textContent = generate(currentKey) || "// (diese Klasse ist unverändert)";
  }

  function render() {
    clear(root);
    refs = {};
    const c = counts();
    refs.status = h("span", { class: "status", text: c.files + " config.cpp · " + c.classes + " Klassen · " + c.edits + " geänderte Klasse(n)" });
    refs.saveBtn = h("button", { class: "btn primary", type: "button", text: "In Projektordner speichern…", disabled: !isChanged(), onclick: () => (EQE.Project.canWriteFolder() ? EQE.Project.saveToFolder() : EQE.Project.downloadZip(true)) });
    const bar = h("div", { class: "toolbar" }, [
      h("button", { class: "btn primary", type: "button", text: "Ordner wählen (config.cpp / .bin / PBO)…", onclick: () => loadFiles("folder") }),
      h("button", { class: "btn", type: "button", text: "Einzelne Dateien (cpp / bin / pbo)…", onclick: () => loadFiles("files") }),
      refs.status,
      h("span", { class: "spacer" }),
      h("div", { class: "view-tabs" }, [
        h("button", { class: "btn" + (view === "edit" ? " active" : ""), type: "button", text: "Bearbeiten", onclick: () => ((view = "edit"), render()) }),
        h("button", { class: "btn" + (view === "summary" ? " active" : ""), type: "button", text: "Änderungen & Config", onclick: () => ((view = "summary"), render()) }),
      ]),
      refs.saveBtn,
    ]);
    root.appendChild(bar);

    if (!c.classes && !c.edits) {
      root.appendChild(
        h("div", { class: "empty-state" }, [
          h("div", { class: "drop-title", text: "Override-Tool" }),
          h("p", { text: "Lade die config.cpp-Dateien aus deinem Projektordner (Ordner wählen oder im Projekt-Tab den ganzen Ordner laden). Danach kannst du alle Klassen nach Slot, Essen, Waffen … sortiert durchgehen und Werte ändern." }),
          h("p", { class: "help", text: "Es werden nur geänderte Werte in die Override-Config (Exodus_Overrides) geschrieben – alles andere liest DayZ weiter aus den Original-Configs. Texturen/RVMATs werden ignoriert." }),
        ])
      );
      return;
    }
    if (view === "summary") {
      root.appendChild(renderSummary());
      return;
    }
    const layout = h("div", { class: "ov2" });
    layout.appendChild(renderLeft());
    refs.editor = h("div", { class: "ov2-right" });
    layout.appendChild(refs.editor);
    root.appendChild(layout);
    renderEditor();
  }

  // ---------------------------------------------------------------- Linke Spalte: Filter, Massenbearbeitung, Liste
  function optionList(map, allLabel, current) {
    const opts = [h("option", { value: "", text: allLabel, selected: current === "" })];
    Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([k, n]) => opts.push(h("option", { value: k, text: k + " (" + n + ")", selected: current === k })));
    return opts;
  }

  function renderLeft() {
    const left = h("div", { class: "ov2-left" });
    const idx = getIndex();
    const secCounts = new Map();
    idx.forEach((arr, sec) => secCounts.set(sec, arr.length));
    if (!idx.has(filter.section)) pickDefaultSection();

    const arr = idx.get(filter.section) || [];
    const groupCounts = new Map();
    const subCounts = new Map();
    arr.forEach((it) => {
      if (matches(it, "group") && !(filter.sub && it.cat.sub !== filter.sub)) groupCounts.set(it.cat.group, (groupCounts.get(it.cat.group) || 0) + 1);
      if (it.cat.group === filter.group && matches(it, "sub")) subCounts.set(it.cat.sub, (subCounts.get(it.cat.sub) || 0) + 1);
    });

    const sourceMap = new Map();
    arr.forEach((it) => it.entry.files.forEach((f) => sourceMap.set(f, (sourceMap.get(f) || 0) + 1)));

    const secSel = h("select", { onchange: (e) => ((filter.section = e.target.value), (filter.group = ""), (filter.sub = ""), (filter.page = 1), selection.clear(), render()) }, optionList(secCounts, "–", filter.section).slice(1));
    const groupSel = h("select", { onchange: (e) => ((filter.group = e.target.value), (filter.sub = ""), (filter.page = 1), render()) }, optionList(groupCounts, "Alle Kategorien", filter.group));
    const subSel = h("select", { disabled: !filter.group, onchange: (e) => ((filter.sub = e.target.value), (filter.page = 1), render()) }, optionList(subCounts, filter.group ? "Alle Unterkategorien" : "(erst Kategorie wählen)", filter.sub));
    const srcSel = h(
      "select",
      { onchange: (e) => ((filter.source = e.target.value), (filter.page = 1), render()) },
      [h("option", { value: "", text: "Alle Dateien", selected: !filter.source })].concat(
        Array.from(sourceMap.entries())
          .sort()
          .map(([f, n]) => h("option", { value: f, text: f.replace(/^.*?\/([^/]+\/[^/]+)$/, "$1") + " (" + n + ")", selected: filter.source === f }))
      )
    );
    const search = h("input", {
      type: "text",
      placeholder: "Suchen (Klasse oder Name) …",
      value: filter.search,
      oninput: (e) => {
        filter.search = e.target.value.toLowerCase();
        filter.page = 1;
        renderList();
      },
    });

    left.appendChild(
      h("div", { class: "section" }, [
        h("div", { class: "section-body ov2-filters" }, [
          h("div", { class: "field" }, [h("label", { text: "Bereich" }), secSel]),
          h("div", { class: "field" }, [h("label", { text: "Kategorie" }), groupSel]),
          h("div", { class: "field" }, [h("label", { text: "Unterkategorie / Slot" }), subSel]),
          h("div", { class: "field" }, [h("label", { text: "Quelle" }), srcSel]),
          h("div", { class: "field" }, [h("label", { text: "Suche" }), search]),
          h("label", { class: "checkrow" }, [h("input", { type: "checkbox", checked: filter.onlyChanged, onchange: (e) => ((filter.onlyChanged = e.target.checked), (filter.page = 1), render()) }), "Nur geänderte"]),
          h("label", { class: "checkrow" }, [h("input", { type: "checkbox", checked: filter.showBase, onchange: (e) => ((filter.showBase = e.target.checked), (filter.page = 1), render()) }), "Basisklassen (scope 0) anzeigen"]),
        ]),
      ])
    );

    refs.bulk = h("div", { class: "ov2-bulk" });
    left.appendChild(refs.bulk);
    refs.listHead = h("div", { class: "ov2-listhead" });
    left.appendChild(refs.listHead);
    refs.list = h("div", { class: "ov2-list" });
    left.appendChild(refs.list);
    renderList();
    return left;
  }

  function displayLabel(it) {
    return it.dn && it.dn.indexOf("$") !== 0 ? it.dn : "";
  }

  function renderList() {
    if (!refs.list) return;
    clear(refs.list);
    clear(refs.listHead);
    const items = filtered();
    const shown = items.slice(0, filter.page * PAGE);
    const allSel = items.length > 0 && items.every((it) => selection.has(keyOf(it.entry)));

    refs.listHead.appendChild(
      h("label", { class: "checkrow", title: "Alle gefilterten Klassen für die Massenbearbeitung markieren" }, [
        h("input", {
          type: "checkbox",
          checked: allSel,
          onchange: (e) => {
            items.forEach((it) => (e.target.checked ? selection.add(keyOf(it.entry)) : selection.delete(keyOf(it.entry))));
            renderList();
          },
        }),
        h("span", { class: "small", text: items.length + " Klassen · " + selection.size + " markiert" }),
      ])
    );

    shown.forEach((it) => {
      const key = keyOf(it.entry);
      const label = displayLabel(it);
      const row = h("div", { class: "ov2-row" + (key === currentKey ? " current" : "") + (state.edits[key] ? " edited" : ""), "data-key": key }, [
        h("input", {
          type: "checkbox",
          checked: selection.has(key),
          title: "Für Massenbearbeitung markieren",
          onclick: (e) => e.stopPropagation(),
          onchange: (e) => {
            if (e.target.checked) selection.add(key);
            else selection.delete(key);
            refs.listHead.querySelector(".small").textContent = items.length + " Klassen · " + selection.size + " markiert";
            renderBulk();
          },
        }),
        h("div", { class: "ov2-name", onclick: () => selectEntry(key) }, [
          h("div", { class: "mono", text: it.entry.name }),
          label ? h("div", { class: "muted small", text: label }) : null,
        ]),
        h("span", { class: "ov2-badge", "data-badge": key, text: editCount(key) ? editCount(key) + " ✎" : "" }),
      ]);
      refs.list.appendChild(row);
    });
    if (!items.length) refs.list.appendChild(h("div", { class: "list-empty", text: "Keine Klassen für diese Filter." }));
    if (items.length > shown.length) {
      refs.list.appendChild(h("button", { class: "btn small", type: "button", text: "Mehr anzeigen (" + (items.length - shown.length) + " weitere)", onclick: () => (filter.page++, renderList()) }));
    }
    renderBulk();
  }

  function selectEntry(key) {
    currentKey = key;
    refs.list.querySelectorAll(".ov2-row").forEach((r) => r.classList.toggle("current", r.dataset.key === key));
    renderEditor();
    refs.editor && refs.editor.scrollIntoView({ block: "nearest" });
  }

  // ---------------------------------------------------------------- Massenbearbeitung
  function numericTargets() {
    const out = [];
    SPECS.forEach((s) => {
      const g = SPEC_GROUPS.find((x) => x.id === s.group);
      const isInt = s.type === "int";
      if (s.type === "int" || s.type === "float") out.push({ id: s.id, label: s.label, group: g.title, path: s.path, int: isInt });
      if (s.type === "pair" || s.type === "trio") (s.labels || []).forEach((l, i) => out.push({ id: s.id + "#" + i, label: s.label + " – " + l, group: g.title, path: s.path, idx: i, int: s.path === "itemSize" || s.path === "itemsCargoSize" }));
    });
    ARMOR_ROWS.forEach(([r, rl]) =>
      ARMOR_COLS.forEach(([c, cl]) => out.push({ id: "armor-" + r + "-" + c, label: "Schaden-Faktor " + rl + " / " + cl, group: "Schutz (Rüstung)", path: ARMOR_BASE + r + "/" + c + "/damage", int: false }))
    );
    return out;
  }

  const bulkState = { target: "weight", op: "set", value: "" };
  function renderBulk() {
    if (!refs.bulk) return;
    clear(refs.bulk);
    if (!selection.size) return;
    const targets = numericTargets();
    const groups = [];
    targets.forEach((t) => groups.indexOf(t.group) < 0 && groups.push(t.group));
    const sel = h(
      "select",
      { onchange: (e) => (bulkState.target = e.target.value) },
      groups.map((g) => h("optgroup", { label: g }, targets.filter((t) => t.group === g).map((t) => h("option", { value: t.id, text: t.label, selected: bulkState.target === t.id }))))
    );
    const op = h(
      "select",
      { onchange: (e) => (bulkState.op = e.target.value) },
      [
        ["set", "setzen auf"],
        ["mul", "multiplizieren mit"],
        ["add", "addieren"],
      ].map(([v, l]) => h("option", { value: v, text: l, selected: bulkState.op === v }))
    );
    const val = h("input", { type: "number", step: "any", placeholder: "Wert", value: bulkState.value, oninput: (e) => (bulkState.value = e.target.value) });
    refs.bulk.appendChild(
      h("div", { class: "section" }, [
        h("div", { class: "section-body" }, [
          h("div", { class: "check-head", text: "Massenbearbeitung – " + selection.size + " Klasse(n) markiert" }),
          h("div", { class: "field" }, [h("label", { text: "Wert" }), sel]),
          h("div", { class: "grid2" }, [h("div", { class: "field" }, [h("label", { text: "Aktion" }), op]), h("div", { class: "field" }, [h("label", { text: "Zahl" }), val])]),
          h("div", { class: "toolbar" }, [
            h("button", { class: "btn primary small", type: "button", text: "Anwenden", onclick: () => applyBulk(targets) }),
            h("button", { class: "btn small", type: "button", text: "Auswahl aufheben", onclick: () => (selection.clear(), renderList()) }),
          ]),
          h("div", { class: "help", text: "Rechnet pro Klasse vom aktuell wirksamen (geerbten) Wert aus; Klassen ohne diesen Wert werden bei „multiplizieren/addieren“ übersprungen." }),
        ]),
      ])
    );
  }

  function applyBulk(targets) {
    const t = targets.find((x) => x.id === bulkState.target);
    const v = Number(bulkState.value);
    if (!t || bulkState.value === "" || !Number.isFinite(v)) {
      EQE.toast("Bitte eine Zahl eingeben.", true);
      return;
    }
    let done = 0;
    let skipped = 0;
    selection.forEach((key) => {
      const i = key.indexOf("/");
      const entry = Cfg.getEntry(key.slice(0, i), key.slice(i + 1));
      if (!entry) return;
      const cur = getNum(entry, t);
      let next;
      if (bulkState.op === "set") next = v;
      else if (!Number.isFinite(cur)) {
        skipped++;
        return;
      } else next = bulkState.op === "mul" ? cur * v : cur + v;
      if (t.int) next = Math.round(next);
      setNum(entry, t, next);
      done++;
    });
    EQE.toast(done + " Klasse(n) geändert" + (skipped ? ", " + skipped + " ohne Ausgangswert übersprungen" : "") + ".", !done);
    renderList();
    renderEditor();
  }

  // ---------------------------------------------------------------- Rechte Spalte: Editor
  function ctxFor(entry) {
    const eff = Cfg.effective(entry);
    const keys = Array.from(eff.keys());
    return {
      entry: entry,
      section: entry.section,
      cat: Cfg.classify(entry),
      hasAny: (list) => list.some((p) => eff.has(p.toLowerCase()) || !!getEdit(entry, p)),
      hasPrefix: (pre) => keys.some((k) => k.indexOf(pre.toLowerCase()) === 0) || Object.keys((state.edits[keyOf(entry)] || { set: {} }).set).some((k) => k.indexOf(pre) === 0),
      eff: eff,
    };
  }

  let editorTab = "props"; // props | all | preview

  function renderEditor() {
    if (!refs.editor) return;
    clear(refs.editor);
    refs.entryPre = null;
    const entry = currentEntry();
    if (!entry) {
      refs.editor.appendChild(h("div", { class: "empty-state", text: "Wähle links eine Klasse aus (anklicken), um ihre Werte zu bearbeiten. Mit den Häkchen markierst du mehrere Klassen für die Massenbearbeitung." }));
      return;
    }
    const cat = Cfg.classify(entry);
    const chain = Cfg.chain(entry);
    const eff = Cfg.effective(entry);
    const key = keyOf(entry);

    const baseLinks = [];
    chain.slice(1).forEach((b, i) => {
      if (i) baseLinks.push(" › ");
      baseLinks.push(h("a", { href: "#", text: b.name, onclick: (e) => (e.preventDefault(), (filter.search = ""), selectEntry(keyOf(b))) }));
    });
    if (chain.missing) baseLinks.push((chain.length > 1 ? " › " : "") + chain.missing + " (nicht geladen)");

    refs.editor.appendChild(
      h("div", { class: "section ov2-head" }, [
        h("div", { class: "section-body" }, [
          h("div", { class: "ov2-title" }, [h("span", { class: "mono", text: entry.name }), h("span", { class: "pill", text: cat.group + (cat.sub ? " · " + cat.sub : "") })]),
          h("div", { class: "small muted" }, ["Erbt von: "].concat(baseLinks.length ? baseLinks : ["–"])),
          h("div", { class: "small muted", text: "Definiert in: " + entry.files.map((f) => f.replace(/^.*\/(.+\/.+)$/, "$1")).join(", ") }),
          chain.missing && eff.size < 4 ? h("div", { class: "issue warn", text: "Die Basisklasse „" + chain.missing + "“ ist nicht geladen (vermutlich Vanilla). Geerbte Werte sind daher unbekannt – lade zusätzlich die passende Vanilla-config.cpp, um sie hier zu sehen." }) : null,
          h("div", { class: "toolbar" }, [
            h("div", { class: "view-tabs" }, [
              h("button", { class: "btn small" + (editorTab === "props" ? " active" : ""), type: "button", text: "Eigenschaften", onclick: () => ((editorTab = "props"), renderEditor()) }),
              h("button", { class: "btn small" + (editorTab === "all" ? " active" : ""), type: "button", text: "Alle Werte", onclick: () => ((editorTab = "all"), renderEditor()) }),
              h("button", { class: "btn small" + (editorTab === "preview" ? " active" : ""), type: "button", text: "Vorschau", onclick: () => ((editorTab = "preview"), renderEditor()) }),
            ]),
            h("span", { class: "spacer" }),
            h("button", { class: "btn small danger", type: "button", text: "Änderungen dieser Klasse zurücksetzen", disabled: !state.edits[key], onclick: () => (resetEntry(entry), renderList(), renderEditor()) }),
          ]),
        ]),
      ])
    );

    if (editorTab === "props") renderProps(entry);
    else if (editorTab === "all") renderAll(entry);
    else {
      refs.entryPre = h("pre", { class: "preview", text: generate(key) || "// (diese Klasse ist unverändert)" });
      refs.editor.appendChild(refs.entryPre);
    }
  }

  // --- Eigenschaften (geführte Felder)
  function suggestions(spec) {
    if (Array.isArray(spec.suggest)) return spec.suggest;
    if (spec.suggest === "slots") return KNOWN_SLOTS;
    if (spec.suggest === "magazines") return Cfg.classNames("CfgMagazines").slice(0, 4000);
    if (spec.suggest === "ammo") return Cfg.classNames("CfgAmmo").slice(0, 4000);
    return null;
  }

  function wrapField(entry, spec, control, hasValue, pathsForReset) {
    const edited = pathsForReset.some((p) => getEdit(entry, p));
    const node = h("div", { class: "field" + (edited ? " ov2-changed" : "") }, [
      h("label", {}, [
        spec.label,
        spec.help ? h("span", { class: "tip", "data-tip": spec.help, tabindex: "0", text: "?" }) : null,
        !hasValue ? h("span", { class: "pill", text: "nicht gesetzt" }) : null,
        h("button", {
          class: "btn icon small ov2-reset",
          type: "button",
          title: "Auf geerbten Wert zurücksetzen",
          text: "↺",
          hidden: !edited,
          onclick: () => {
            pathsForReset.forEach((p) => removeEdit(entry, p, true));
            changed();
            renderList();
            renderEditor();
          },
        }),
      ]),
      control,
    ]);
    return node;
  }

  function markChanged(node, entry, paths) {
    const edited = paths.some((p) => getEdit(entry, p));
    node.classList.toggle("ov2-changed", edited);
    const r = node.querySelector(".ov2-reset");
    if (r) r.hidden = !edited;
  }

  function buildControl(entry, spec) {
    const path = spec.path;
    const refresh = () => markChanged(holder, entry, [path]);
    let control;
    let hasValue = true;
    if (spec.type === "int" || spec.type === "float") {
      const cur = curScalar(entry, path);
      hasValue = cur !== undefined;
      control = h("input", {
        type: "number",
        step: spec.type === "int" ? "1" : "any",
        value: cur === undefined ? "" : Cfg.unquote(cur),
        placeholder: "–",
        oninput: (e) => {
          const t = e.target.value.trim();
          if (t === "") removeEdit(entry, path);
          else setScalar(entry, path, t);
          refresh();
          renderBadge(entry);
        },
      });
    } else if (spec.type === "text") {
      const cur = curScalar(entry, path);
      hasValue = cur !== undefined;
      const sug = suggestions(spec);
      const id = sug ? EQE.uid() : null;
      control = h("div", {}, [
        h("input", {
          type: "text",
          value: cur === undefined ? "" : Cfg.unquote(cur),
          list: id || undefined,
          oninput: (e) => {
            const t = e.target.value;
            if (t === "") removeEdit(entry, path);
            else setScalar(entry, path, Cfg.quote(t));
            refresh();
            renderBadge(entry);
          },
        }),
        sug ? h("datalist", { id: id }, sug.map((s) => h("option", { value: s }))) : null,
      ]);
    } else if (spec.type === "bool") {
      const cur = curScalar(entry, path);
      hasValue = cur !== undefined;
      control = h("label", { class: "checkrow" }, [
        h("input", {
          type: "checkbox",
          checked: cur !== undefined && Cfg.num(cur) === 1,
          onchange: (e) => {
            setScalar(entry, path, e.target.checked ? "1" : "0");
            refresh();
            renderBadge(entry);
          },
        }),
        "Ja",
      ]);
    } else if (spec.type === "select") {
      const cur = curScalar(entry, path);
      hasValue = cur !== undefined;
      control = h(
        "select",
        {
          onchange: (e) => {
            if (e.target.value === "") removeEdit(entry, path);
            else setScalar(entry, path, e.target.value);
            refresh();
            renderBadge(entry);
          },
        },
        [h("option", { value: "", text: "(nicht gesetzt)" })].concat(spec.options.map(([v, l]) => h("option", { value: v, text: l, selected: cur !== undefined && norm(cur) === v })))
      );
    } else if (spec.type === "pair" || spec.type === "trio") {
      const n = spec.type === "pair" ? 2 : 3;
      const cur = curArray(entry, path);
      hasValue = !!cur;
      const inputs = [];
      for (let i = 0; i < n; i++) {
        inputs.push(
          h("div", { class: "field" }, [
            h("div", { class: "help", text: (spec.labels && spec.labels[i]) || String(i + 1) }),
            h("input", {
              type: "number",
              step: spec.path === "itemSize" || spec.path === "itemsCargoSize" ? "1" : "any",
              value: cur && cur[i] !== undefined ? cur[i] : "",
              oninput: (e) => {
                const arr = [];
                for (let k = 0; k < n; k++) arr.push(inputs[k].querySelector("input").value.trim() || "0");
                const have = inputs.some((x) => x.querySelector("input").value.trim() !== "");
                if (!have) removeEdit(entry, path);
                else setArray(entry, path, arr);
                refresh();
                renderBadge(entry);
              },
            }),
          ])
        );
      }
      control = h("div", { class: n === 2 ? "grid2" : "grid3" }, inputs);
    } else if (spec.type === "strlist" || spec.type === "numlist") {
      const cur = (curArray(entry, path) || []).slice();
      hasValue = !!curArray(entry, path);
      const sug = suggestions(spec);
      const id = sug ? EQE.uid() : null;
      const chips = h("div", { class: "strlist" });
      const isStr = spec.type === "strlist";
      const commit = () => {
        setArray(entry, path, cur);
        refresh();
        renderBadge(entry);
        drawChips();
      };
      const drawChips = () => {
        clear(chips);
        cur.forEach((raw, i) => {
          chips.appendChild(
            h("span", { class: "chip" }, [
              isStr ? Cfg.unquote(raw) : raw,
              h("button", {
                type: "button",
                text: "×",
                onclick: () => {
                  cur.splice(i, 1);
                  commit();
                },
              }),
            ])
          );
        });
        if (!cur.length) chips.appendChild(h("span", { class: "muted small", text: "(leer)" }));
      };
      const add = h("input", { type: isStr ? "text" : "number", step: "any", placeholder: isStr ? "Hinzufügen (Enter)" : "Zahl + Enter", list: id || undefined });
      add.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const t = add.value.trim();
        if (t === "") return;
        cur.push(isStr ? Cfg.quote(t) : t);
        add.value = "";
        commit();
      });
      drawChips();
      control = h("div", { class: "list" }, [chips, h("div", { class: "chip-add" }, [add, sug ? h("datalist", { id: id }, sug.map((s) => h("option", { value: s }))) : null])]);
    }
    const holder = wrapField(entry, spec, control, hasValue, [path]);
    return holder;
  }

  function renderBadge(entry) {
    const key = keyOf(entry);
    const b = refs.list && refs.list.querySelector('[data-badge="' + CSS.escape(key) + '"]');
    if (b) b.textContent = editCount(key) ? editCount(key) + " ✎" : "";
    const row = refs.list && refs.list.querySelector('[data-key="' + CSS.escape(key) + '"]');
    if (row) row.classList.toggle("edited", !!state.edits[key]);
  }

  function renderProps(entry) {
    const ctx = ctxFor(entry);
    const blocks = [];
    SPEC_GROUPS.forEach((g) => {
      if (!g.show(ctx)) return;
      const nodes = [];
      if (g.matrix) {
        nodes.push(armorMatrix(entry));
      } else {
        const grid = h("div", { class: "grid2" });
        SPECS.filter((s) => s.group === g.id).forEach((s) => {
          if (s.needsProp && !ctx.eff.has(s.path.toLowerCase()) && !getEdit(entry, s.path)) return;
          const node = buildControl(entry, s);
          if (s.type === "strlist" || s.type === "numlist") node.classList.add("span2");
          grid.appendChild(node);
        });
        if (!grid.children.length) return;
        nodes.push(grid);
      }
      blocks.push(EQE.section(g.title, g.hint, nodes, { collapsed: false }));
    });
    blocks.forEach((b) => refs.editor.appendChild(b));
    refs.editor.appendChild(h("div", { class: "help", text: "Alles, was hier nicht auftaucht, findest du im Tab „Alle Werte“. Werte, die du auf den geerbten Wert zurückstellst, werden nicht in die Override-Config geschrieben." }));
  }

  function armorMatrix(entry) {
    const body = h("tbody");
    const cells = [];
    ARMOR_ROWS.forEach(([r, rl]) => {
      const tr = h("tr", {}, [h("td", { text: rl })]);
      ARMOR_COLS.forEach(([c, cl]) => {
        const path = ARMOR_BASE + r + "/" + c + "/damage";
        const cur = curScalar(entry, path);
        const info = h("div", { class: "help" });
        const upd = () => {
          const v = Cfg.num(input.value);
          info.textContent = Number.isFinite(v) ? "Schutz ≈ " + Math.round((1 - v) * 100) + " %" : "nicht gesetzt";
          input.classList.toggle("ov2-changed-input", !!getEdit(entry, path));
        };
        const input = h("input", {
          type: "number",
          step: "0.05",
          min: "0",
          value: cur === undefined ? "" : cur,
          placeholder: "–",
          title: cl,
          oninput: (e) => {
            const t = e.target.value.trim();
            if (t === "") removeEdit(entry, path);
            else setScalar(entry, path, t);
            upd();
            renderBadge(entry);
          },
        });
        upd();
        tr.appendChild(h("td", {}, [input, info]));
        cells.push(path);
      });
      body.appendChild(tr);
    });
    return h("div", {}, [
      h("div", { class: "help", text: "Schadensfaktor: 1 = kein Schutz, 0,5 = halber Schaden, 0 = kein Schaden. Kleinere Werte schützen besser." }),
      h("div", { class: "table-scroll" }, [
        h("table", { class: "ptable" }, [h("thead", {}, [h("tr", {}, [h("th", { text: "Angriff" })].concat(ARMOR_COLS.map(([, cl]) => h("th", { text: cl }))))]), body]),
      ]),
      h("div", { class: "toolbar" }, [
        h("button", {
          class: "btn small",
          type: "button",
          text: "Alle Schutzwerte zurücksetzen",
          onclick: () => {
            cells.forEach((p) => removeEdit(entry, p, true));
            changed();
            renderList();
            renderEditor();
          },
        }),
      ]),
    ]);
  }

  // --- Alle Werte (jede Eigenschaft der Klasse + eigene hinzufügen)
  function renderAll(entry) {
    const eff = Cfg.effective(entry);
    const key = keyOf(entry);
    const ed = (state.edits[key] || { set: {} }).set;
    const seenPaths = new Set();
    const paths = new Set();
    Array.from(eff.values())
      .map((v) => v.path)
      .concat(Object.keys(ed))
      .forEach((pp) => {
        if (seenPaths.has(pp.toLowerCase())) return;
        seenPaths.add(pp.toLowerCase());
        paths.add(pp);
      });
    let q = "";
    const body = h("tbody");
    const draw = () => {
      clear(body);
      Array.from(paths)
        .sort()
        .filter((p) => !q || p.toLowerCase().indexOf(q) > -1)
        .forEach((p) => {
          const e = eff.get(p.toLowerCase());
          const edit = ed[p] || (state.edits[key] && state.edits[key].set[p]);
          const rawNow = edit ? (edit.array ? "{" + edit.v.join(", ") + "}" : edit.v) : e ? (e.array ? "{" + e.items.join(", ") + "}" : e.raw) : "";
          const effText = e ? (e.array ? "{" + e.items.join(", ") + "}" : e.raw) : "–";
          const input = h("input", {
            type: "text",
            value: rawNow,
            class: edit ? "ov2-changed-input" : "",
            onchange: (ev) => {
              const t = ev.target.value.trim();
              const isArr = (e && e.array) || (edit && edit.array) || /^\{.*\}$/.test(t);
              if (t === "") removeEdit(entry, p);
              else if (isArr) {
                const inner = t.replace(/^\{/, "").replace(/\}$/, "");
                setArray(entry, p, Cfg.splitItems(inner));
              } else setScalar(entry, p, t);
              renderList();
              renderEditor();
            },
          });
          body.appendChild(
            h("tr", {}, [
              h("td", { class: "mono", text: p }),
              h("td", { class: "mono muted", text: effText.length > 60 ? effText.slice(0, 57) + "…" : effText, title: effText }),
              h("td", { class: "muted small", text: e ? e.from : "" }),
              h("td", {}, [input]),
              h("td", {}, [
                edit
                  ? h("button", { class: "btn icon small", type: "button", title: "Zurücksetzen", text: "↺", onclick: () => (removeEdit(entry, p), renderList(), renderEditor()) })
                  : null,
              ]),
            ])
          );
        });
    };
    draw();
    const newPath = h("input", { type: "text", placeholder: "Pfad, z. B. DamageSystem/GlobalHealth/Health/hitpoints", list: "ov2-paths" });
    const newVal = h("input", { type: "text", placeholder: "Wert, z. B. 200 oder {1,2} oder \"Text\"" });
    const known = SPECS.map((s) => s.path).concat(ARMOR_ROWS.flatMap(([r]) => ARMOR_COLS.map(([c]) => ARMOR_BASE + r + "/" + c + "/damage")));
    refs.editor.appendChild(
      h("div", { class: "section" }, [
        h("div", { class: "section-body" }, [
          h("div", { class: "field" }, [h("label", { text: "Wert filtern" }), h("input", { type: "text", placeholder: "Pfad enthält …", oninput: (e) => ((q = e.target.value.toLowerCase()), draw()) })]),
          h("div", { class: "table-scroll" }, [
            h("table", { class: "ptable prod-table" }, [h("thead", {}, [h("tr", {}, ["Eigenschaft", "Geerbter Wert", "von", "Override-Wert", ""].map((t) => h("th", { text: t })))]), body]),
          ]),
          h("div", { class: "check-head", text: "Eigenschaft hinzufügen" }),
          h("div", { class: "grid2" }, [h("div", { class: "field" }, [h("label", { text: "Pfad" }), newPath, h("datalist", { id: "ov2-paths" }, known.map((k) => h("option", { value: k })))]), h("div", { class: "field" }, [h("label", { text: "Wert" }), newVal])]),
          h("div", { class: "help", text: "Verschachtelte Klassen werden mit / geschrieben (z. B. Nutrition/energy). Arrays in geschweiften Klammern. Texte in Anführungszeichen." }),
          h("button", {
            class: "btn small primary",
            type: "button",
            text: "Hinzufügen",
            onclick: () => {
              const p = newPath.value.trim().replace(/^\/+|\/+$/g, "");
              const t = newVal.value.trim();
              if (!p || t === "") return EQE.toast("Pfad und Wert eingeben.", true);
              if (!/^[A-Za-z0-9_$/]+$/.test(p)) return EQE.toast("Der Pfad enthält ungültige Zeichen.", true);
              if (/^\{.*\}$/.test(t)) setArray(entry, p, Cfg.splitItems(t.replace(/^\{/, "").replace(/\}$/, "")));
              else setScalar(entry, p, t);
              renderList();
              renderEditor();
            },
          }),
        ]),
      ])
    );
  }

  // ---------------------------------------------------------------- Ansicht "Änderungen & Config"
  function renderSummary() {
    const wrap = h("div", { class: "ov2-summary" });
    const keys = Object.keys(state.edits).sort();
    const rows = keys.map((k) => {
      const e = state.edits[k];
      return h("tr", {}, [
        h("td", { class: "mono", text: e.section }),
        h("td", { class: "mono" }, [h("a", { href: "#", text: e.name, onclick: (ev) => (ev.preventDefault(), (view = "edit"), (filter.section = e.section), (filter.group = ""), (filter.sub = ""), (filter.search = e.name.toLowerCase()), (currentKey = k), render()) })]),
        h("td", { text: Object.keys(e.set).length + " Wert(e)" }),
        h("td", { class: "muted small", text: Object.keys(e.set).slice(0, 4).join(", ") + (Object.keys(e.set).length > 4 ? " …" : "") }),
        h("td", { class: "actions" }, [h("button", { class: "btn small danger", type: "button", text: "Entfernen", onclick: () => ((delete state.edits[k]), changed(), render()) })]),
      ]);
    });
    wrap.appendChild(
      h("div", { class: "section" }, [
        h("div", { class: "section-body" }, [
          h("div", { class: "check-head", text: keys.length + " geänderte Klasse(n)" }),
          keys.length
            ? h("div", { class: "table-scroll" }, [h("table", { class: "ptable" }, [h("thead", {}, [h("tr", {}, ["Bereich", "Klasse", "Änderungen", "Werte", ""].map((t) => h("th", { text: t })))]), h("tbody", {}, rows)])])
            : h("div", { class: "list-empty", text: "Noch nichts geändert." }),
        ]),
      ])
    );

    // Einstellungen
    const patchIn = h("input", {
      type: "text",
      value: state.patchName,
      oninput: (e) => {
        const v = e.target.value.trim();
        e.target.classList.toggle("invalid", !/^[A-Za-z0-9_]+$/.test(v));
        if (/^[A-Za-z0-9_]+$/.test(v)) {
          state.patchName = v;
          changed();
          refs.summaryPre.textContent = generate() || "// (keine Änderungen)";
        }
      },
    });
    const used = usedPatches();
    const detected = allPatches();
    const patchRows = detected.map((p) =>
      h("label", { class: "checkrow" }, [
        h("input", {
          type: "checkbox",
          checked: state.disabledAddons.indexOf(p) < 0 && used.indexOf(p) > -1,
          disabled: used.indexOf(p) < 0,
          onchange: (e) => {
            const i = state.disabledAddons.indexOf(p);
            if (e.target.checked && i > -1) state.disabledAddons.splice(i, 1);
            if (!e.target.checked && i < 0) state.disabledAddons.push(p);
            changed();
            refs.summaryPre.textContent = generate() || "// (keine Änderungen)";
          },
        }),
        h("span", { class: "mono", text: p }),
        used.indexOf(p) < 0 ? h("span", { class: "muted small", text: " (wird von keiner geänderten Klasse gebraucht)" }) : null,
      ])
    );
    const extra = state.extraAddons;
    const extraChips = h("div", { class: "strlist" });
    const drawExtra = () => {
      clear(extraChips);
      extra.forEach((a, i) =>
        extraChips.appendChild(
          h("span", { class: "chip" }, [
            a,
            h("button", { type: "button", text: "×", onclick: () => (extra.splice(i, 1), changed(), drawExtra(), (refs.summaryPre.textContent = generate() || "// (keine Änderungen)")) }),
          ])
        )
      );
    };
    drawExtra();
    const extraIn = h("input", { type: "text", placeholder: "Weiteres Addon (z. B. DZ_Characters_Tops) + Enter", list: "ov2-dz" });
    extraIn.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const v = extraIn.value.trim();
      if (v && extra.indexOf(v) < 0) extra.push(v);
      extraIn.value = "";
      changed();
      drawExtra();
      refs.summaryPre.textContent = generate() || "// (keine Änderungen)";
    });
    wrap.appendChild(
      EQE.section("Einstellungen der Override-Mod", "CfgPatches / requiredAddons – damit die Override nach den Original-Configs lädt", [
        h("div", { class: "field" }, [h("label", { text: "Patch-Klassenname (CfgPatches)" }), patchIn]),
        h("div", { class: "field" }, [
          h("label", {}, ["Benötigte Addons (automatisch aus den geänderten Klassen)", h("span", { class: "tip", "data-tip": "Die Override muss NACH den Addons laden, aus denen die Klassen stammen. Diese Namen stehen in den CfgPatches der geladenen config.cpp.", tabindex: "0", text: "?" })]),
          h("div", { class: "list" }, patchRows.length ? patchRows : [h("span", { class: "muted small", text: "Keine CfgPatches in den geladenen Configs gefunden." })]),
        ]),
        h("div", { class: "field" }, [
          h("label", { text: "Zusätzliche Addons" }),
          extraChips,
          h("div", { class: "chip-add" }, [extraIn, h("datalist", { id: "ov2-dz" }, ["DZ_Data", "DZ_Scripts", "DZ_Gear_Consumables", "DZ_Gear_Food", "DZ_Characters", "DZ_Weapons_Firearms"].map((x) => h("option", { value: x })))]),
          h("div", { class: "help", text: "Nur Addons eintragen, die es wirklich gibt – ein unbekannter Name verhindert den Start (\"requires addon\")." }),
        ]),
      ])
    );

    // Vorschau + Export
    refs.summaryPre = h("pre", { class: "preview", text: generate() || "// (keine Änderungen)" });
    wrap.appendChild(
      h("div", { class: "section" }, [
        h("div", { class: "section-body" }, [
          h("div", { class: "toolbar" }, [
            h("div", { class: "check-head", text: "config.cpp der Override-Mod" }),
            h("span", { class: "spacer" }),
            h("button", { class: "btn small", type: "button", text: "Kopieren", onclick: () => EQE.copyText(generate()) }),
            h("button", { class: "btn small", type: "button", text: "ZIP herunterladen", onclick: downloadZip }),
          ]),
          h("div", { class: "help", text: state.existingPath ? "Gespeichert wird in: " + state.existingPath : "Wird beim Speichern als " + MOD_DIR + "/" + MOD_DIR + "/config.cpp (mit $PBOPREFIX$.txt) im Projektordner angelegt." }),
          refs.summaryPre,
        ]),
      ])
    );
    return wrap;
  }

  function downloadZip() {
    const files = zipFiles(false);
    if (!files.length) return EQE.toast("Es gibt nichts zu exportieren.", true);
    const blob = EQE.Project.buildZip(files);
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: "Exodus_Overrides.zip" });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  // ---------------------------------------------------------------- Öffentliche Schnittstelle
  EQE.Overrides = {
    init: init,
    afterIngest: afterIngest,
    generate: generate,
    isChanged: isChanged,
    zipFiles: zipFiles,
    fileWrites: fileWrites,
    sourcePaths: () => Cfg.sources().map((s) => s.path),
    onChange: (f) => changeListeners.push(f),
    reset: () => {
      state.edits = {};
      changed();
      render();
    },
  };
  // Der Projekt-Store ruft changedCount/zipFiles/fileWrites der registrierten Erweiterungen auf.
  if (EQE.Project && EQE.Project.registerExtra) {
    EQE.Project.registerExtra({
      changedCount: () => (isChanged() ? 1 : 0),
      zipFiles: zipFiles,
      fileWrites: fileWrites,
      paths: () => Cfg.sources().map((s) => s.path),
    });
  }
})(window.EQE);
