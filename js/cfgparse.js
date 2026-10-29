/**
 * Exodus Quest Editor – config.cpp einlesen (Parser, Klassen-Register, Vererbung, Kategorisierung).
 * Liest die Textform von DayZ-Configs (keine binarisierten config.bin). Das Register führt alle geladenen config.cpp zusammen,
 * löst Vererbung auf ("geerbter" Wert einer Eigenschaft) und sortiert Klassen vor (Kleidung nach Slot, Essen, Waffen, …).
 */
window.EQE = window.EQE || {};

(function (EQE) {
  "use strict";

  // ---------------------------------------------------------------- Parser
  function newNode(name, base) {
    return { name: name, base: base || "", forward: false, props: [], children: [] };
  }

  /** Teilt den Inhalt einer Array-Angabe an Kommas auf oberster Ebene (Strings und verschachtelte {} bleiben ganz). */
  function splitItems(inner) {
    const items = [];
    let depth = 0;
    let inStr = false;
    let cur = "";
    for (let i = 0; i < inner.length; i++) {
      const c = inner[i];
      if (inStr) {
        cur += c;
        if (c === '"') {
          if (inner[i + 1] === '"') {
            cur += '"';
            i++;
          } else inStr = false;
        }
        continue;
      }
      if (c === '"') {
        inStr = true;
        cur += c;
      } else if (c === "{") {
        depth++;
        cur += c;
      } else if (c === "}") {
        depth--;
        cur += c;
      } else if (c === "," && depth === 0) {
        items.push(cur.trim());
        cur = "";
      } else cur += c;
    }
    if (cur.trim() !== "" || items.length) items.push(cur.trim());
    return items.filter((x, idx) => !(x === "" && idx === items.length - 1));
  }

  function parse(text) {
    const n = text.length;
    let i = 0;

    function skipWs() {
      for (;;) {
        while (i < n && text.charCodeAt(i) <= 32) i++;
        if (i >= n) return;
        const c = text[i];
        if (c === "/" && text[i + 1] === "/") {
          while (i < n && text[i] !== "\n") i++;
        } else if (c === "/" && text[i + 1] === "*") {
          const end = text.indexOf("*/", i + 2);
          i = end < 0 ? n : end + 2;
        } else if (c === "#") {
          // Präprozessor-Zeile (mit \-Fortsetzung)
          while (i < n && text[i] !== "\n") {
            if (text[i] === "\\" && text[i + 1] === "\n") i++;
            i++;
          }
        } else return;
      }
    }

    function readIdent() {
      const start = i;
      while (i < n) {
        const code = text.charCodeAt(i);
        const ok = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95 || code === 36 || code === 46 || code === 45;
        if (!ok) break;
        i++;
      }
      return text.slice(start, i);
    }

    /** Liest bis zum nächsten ";" außerhalb von Strings/Klammern. */
    function readScalarRaw() {
      const start = i;
      let inStr = false;
      let depth = 0;
      while (i < n) {
        const c = text[i];
        if (inStr) {
          if (c === '"') {
            if (text[i + 1] === '"') i++;
            else inStr = false;
          }
        } else if (c === '"') inStr = true;
        else if (c === "{") depth++;
        else if (c === "}") depth--;
        else if (c === ";" && depth <= 0) break;
        i++;
      }
      const raw = text.slice(start, i).trim();
      if (text[i] === ";") i++;
      return raw;
    }

    function readBraced() {
      // text[i] === "{"
      const start = i + 1;
      let depth = 0;
      let inStr = false;
      while (i < n) {
        const c = text[i];
        if (inStr) {
          if (c === '"') {
            if (text[i + 1] === '"') i++;
            else inStr = false;
          }
        } else if (c === '"') inStr = true;
        else if (c === "{") depth++;
        else if (c === "}") {
          depth--;
          if (depth === 0) break;
        }
        i++;
      }
      const inner = text.slice(start, i);
      if (text[i] === "}") i++;
      return inner;
    }

    function parseBody(node) {
      for (;;) {
        skipWs();
        if (i >= n) return;
        const c = text[i];
        if (c === "}") {
          i++;
          return;
        }
        if (c === ";") {
          i++;
          continue;
        }
        const id = readIdent();
        if (!id) {
          i++;
          continue;
        }
        if (id === "class") {
          skipWs();
          const name = readIdent();
          skipWs();
          let base = "";
          if (text[i] === ":") {
            i++;
            skipWs();
            base = readIdent();
            skipWs();
          }
          if (text[i] === "{") {
            i++;
            const child = newNode(name, base);
            parseBody(child);
            skipWs();
            if (text[i] === ";") i++;
            node.children.push(child);
          } else {
            if (text[i] === ";") i++;
            const fwd = newNode(name, base);
            fwd.forward = true;
            node.children.push(fwd);
          }
        } else if (id === "delete") {
          skipWs();
          readIdent();
          skipWs();
          if (text[i] === ";") i++;
        } else if (id === "enum") {
          skipWs();
          while (i < n && text[i] !== "{" && text[i] !== ";") i++;
          if (text[i] === "{") readBraced();
          skipWs();
          if (text[i] === ";") i++;
        } else {
          skipWs();
          let array = false;
          if (text[i] === "[") {
            i++;
            skipWs();
            if (text[i] === "]") i++;
            array = true;
            skipWs();
          }
          let op = "=";
          if (text[i] === "+" && text[i + 1] === "=") {
            op = "+=";
            i += 2;
          } else if (text[i] === "-" && text[i + 1] === "=") {
            op = "-=";
            i += 2;
          } else if (text[i] === "=") i++;
          else {
            // unbekannte Konstruktion: bis zum Semikolon überspringen
            readScalarRaw();
            continue;
          }
          skipWs();
          if (text[i] === "{") {
            const inner = readBraced();
            skipWs();
            if (text[i] === ";") i++;
            node.props.push({ name: id, array: true, items: splitItems(inner), op: op });
          } else {
            const raw = readScalarRaw();
            node.props.push({ name: id, array: array, raw: raw, items: array ? [raw] : null, op: op });
          }
        }
      }
    }

    const root = newNode("", "");
    parseBody(root);
    return root;
  }

  // ---------------------------------------------------------------- Zusammengeführte Knoten
  function newMerged(base) {
    return { base: base || "", props: new Map(), children: new Map() };
  }

  function mergeInto(target, node) {
    if (node.base) target.base = node.base;
    node.props.forEach((p) => {
      if (p.array && p.op === "+=") {
        const old = target.props.get(p.name);
        const items = old && old.array ? old.items.slice() : [];
        target.props.set(p.name, { array: true, items: items.concat(p.items) });
      } else if (p.array) target.props.set(p.name, { array: true, items: p.items.slice() });
      else target.props.set(p.name, { array: false, raw: p.raw });
    });
    node.children.forEach((c) => {
      if (c.forward && !target.children.has(c.name)) return;
      let t = target.children.get(c.name);
      if (!t) {
        t = newMerged(c.base);
        target.children.set(c.name, t);
      }
      if (!c.forward) mergeInto(t, c);
    });
  }

  // ---------------------------------------------------------------- Register
  const sources = []; // {path, root, patches:[], overrides:bool}
  let sections = new Map(); // Abschnitt -> Map(Klassenname -> Entry)
  let cacheEff = new Map();
  let cacheCls = new Map();
  const listeners = [];

  function clear() {
    sources.length = 0;
    rebuild();
  }

  function isOverridePath(path) {
    return /(^|\/)Exodus_Overrides(\/|$)/i.test(String(path || ""));
  }

  /** Text einlesen und als Quelle vormerken (rebuild() danach nicht vergessen). Rückgabe: {overrides, root} */
  function ingestText(text, path) {
    const root = parse(String(text).replace(/^﻿/, ""));
    const idx = sources.findIndex((s) => s.path === path);
    const patches = [];
    root.children.forEach((c) => {
      if (c.name === "CfgPatches") c.children.forEach((p) => !p.forward && patches.push(p.name));
    });
    const src = { path: path, root: root, patches: patches, overrides: isOverridePath(path), text: text };
    if (idx > -1) sources[idx] = src;
    else sources.push(src);
    return src;
  }

  function rebuild() {
    sections = new Map();
    cacheEff = new Map();
    cacheCls = new Map();
    sources.forEach((src) => {
      if (src.overrides) return; // eigene Overrides sind keine Quelle
      src.root.children.forEach((sec) => {
        if (sec.name === "CfgPatches" || sec.forward) return;
        let map = sections.get(sec.name);
        if (!map) {
          map = new Map();
          sections.set(sec.name, map);
        }
        sec.children.forEach((cls) => {
          if (cls.forward) return;
          let e = map.get(cls.name);
          if (!e) {
            e = { section: sec.name, name: cls.name, base: "", own: newMerged(""), files: [] };
            map.set(cls.name, e);
          }
          if (cls.base) e.base = cls.base;
          mergeInto(e.own, cls);
          if (e.files.indexOf(src.path) < 0) e.files.push(src.path);
        });
      });
    });
    listeners.forEach((f) => f());
  }

  function getEntry(section, name) {
    const m = sections.get(section);
    return m ? m.get(name) || null : null;
  }

  /** Klasse samt Basisklassen (nur im selben Abschnitt); unaufgelöste Basis steht in .missing. */
  function chain(entry) {
    const out = [entry];
    let missing = "";
    const seen = new Set([entry.name]);
    let cur = entry;
    while (cur.base) {
      if (seen.has(cur.base)) break;
      seen.add(cur.base);
      const b = getEntry(entry.section, cur.base);
      if (!b) {
        missing = cur.base;
        break;
      }
      out.push(b);
      cur = b;
    }
    out.missing = missing;
    return out;
  }

  function chainNames(entry) {
    const c = chain(entry);
    const names = c.map((e) => e.name);
    if (c.missing) names.push(c.missing);
    return names;
  }

  function flattenInto(map, node, prefix, from) {
    node.props.forEach((p, name) => {
      const key = prefix + name;
      map.set(key, { array: p.array, raw: p.raw, items: p.items, from: from });
    });
    node.children.forEach((child, cname) => flattenInto(map, child, prefix + cname + "/", from));
  }

  /** Wirksame Eigenschaften (Pfad "A/B/prop" -> {array, raw|items, from}) inkl. Vererbung; abgeleitete Klassen überschreiben. */
  function effective(entry) {
    const key = entry.section + "/" + entry.name;
    let eff = cacheEff.get(key);
    if (eff) return eff;
    eff = new Map();
    const c = chain(entry);
    for (let k = c.length - 1; k >= 0; k--) flattenInto(eff, c[k].own, "", c[k].name);
    eff.missingBase = c.missing;
    cacheEff.set(key, eff);
    return eff;
  }

  // ---------------------------------------------------------------- Werte lesen
  function unquote(s) {
    s = String(s).trim();
    if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') return s.slice(1, -1).replace(/""/g, '"');
    return s;
  }
  function quote(s) {
    return '"' + String(s).replace(/"/g, '""') + '"';
  }
  function num(s) {
    const n = Number(String(s).trim());
    return Number.isFinite(n) ? n : NaN;
  }
  function effScalar(entry, path) {
    const p = effective(entry).get(path);
    return p && !p.array ? p.raw : undefined;
  }
  function effArray(entry, path) {
    const p = effective(entry).get(path);
    return p && p.array ? p.items : undefined;
  }
  function effStrings(entry, path) {
    const a = effArray(entry, path);
    return a ? a.map(unquote) : [];
  }

  // ---------------------------------------------------------------- Kategorisierung
  const CLOTHING_SLOTS = {
    Headgear: "Kopfbedeckung",
    Mask: "Gesichtsmaske",
    Eyewear: "Brille",
    Gloves: "Handschuhe",
    Armband: "Armbinde",
    Body: "Oberkörper",
    Vest: "Weste",
    Back: "Rucksack",
    Hips: "Gürtel / Hüfte",
    Legs: "Hose",
    Feet: "Schuhe",
    Shoulder: "Schulter (Waffe)",
    Melee: "Rücken (Nahkampf)",
  };
  const WEAPON_SLOT_RE = /^(weapon|suppressor|optics|pistol|bayonet|buttstock|handguard|lightsource|magazine|cartridge|ammo|muzzle|rail|grip|bipod|stock)/i;

  function cat(group, sub) {
    return { group: group, sub: sub || "" };
  }

  function classify(entry) {
    const key = entry.section + "/" + entry.name;
    let c = cacheCls.get(key);
    if (c) return c;
    c = classifyUncached(entry);
    cacheCls.set(key, c);
    return c;
  }

  function topBase(names) {
    return names.length > 1 ? names[names.length - 1] : names[0] || "";
  }

  function classifyUncached(entry) {
    const eff = effective(entry);
    const names = chainNames(entry);
    const has = (re) => names.some((n) => re.test(n));
    const sec = entry.section;
    if (sec === "CfgVehicles") {
      const slots = effStrings(entry, "inventorySlot");
      if (slots.length) {
        const clothing = slots.find((s) => CLOTHING_SLOTS[s]);
        if (clothing) return cat("Kleidung", clothing + " – " + CLOTHING_SLOTS[clothing]);
        if (slots.some((s) => WEAPON_SLOT_RE.test(s))) return cat("Waffenzubehör", slots[0]);
        return cat("Anbauteile (Slot-Items)", slots[0]);
      }
      const nutrition = Array.from(eff.keys()).some((k) => k.indexOf("Nutrition/") === 0);
      if (nutrition || has(/^Edible_Base$/)) {
        return eff.has("liquidContainerType") ? cat("Essen & Trinken", "Getränke / Flüssigkeiten") : cat("Essen & Trinken", "Essen");
      }
      if (has(/Clothing|Backpack|Vest/i)) return cat("Kleidung", "Ohne Slot");
      if (eff.has("itemsCargoSize")) return cat("Behälter & Lagerung", topBase(names));
      if (has(/^(Inventory_Base|ItemBase|Container_Base)$/)) return cat("Sonstige Items", topBase(names));
      return cat("Sonstige Klassen", topBase(names));
    }
    if (sec === "CfgWeapons") {
      if (eff.has("magazines") || has(/Weapon|Rifle_Base|Pistol_Base|Launcher_Base|Archery_Base|Shotgun/i)) {
        if (has(/Pistol/i)) return cat("Waffen", "Pistolen");
        if (has(/Launcher/i)) return cat("Waffen", "Werfer");
        if (has(/Archery|Bow|Crossbow/i)) return cat("Waffen", "Bögen / Armbrüste");
        if (has(/Shotgun/i)) return cat("Waffen", "Schrotflinten");
        if (has(/Rifle/i)) return cat("Waffen", "Gewehre");
        return cat("Waffen", "Sonstige");
      }
      return cat("Sonstige Waffen-Klassen", topBase(names));
    }
    if (sec === "CfgMagazines") {
      const ammo = unquote(effScalar(entry, "ammo") || "");
      if (has(/Ammunition_Base|AmmoBox/i)) return cat("Munition (Schachteln)", ammo || "–");
      if (has(/Magazine_Base/i) || eff.has("count")) return cat("Magazine", ammo || "–");
      return cat("Sonstige Magazine", topBase(names));
    }
    if (sec === "CfgAmmo") return cat("Projektile (CfgAmmo)", topBase(names));
    return cat(sec, topBase(names));
  }

  function isBaseClass(entry) {
    const s = effScalar(entry, "scope");
    return s !== undefined && num(s) === 0;
  }

  EQE.Cfg = {
    parse: parse,
    ingestText: ingestText,
    rebuild: rebuild,
    clear: clear,
    sources: () => sources,
    sections: () => sections,
    getEntry: getEntry,
    chain: chain,
    chainNames: chainNames,
    effective: effective,
    effScalar: effScalar,
    effArray: effArray,
    effStrings: effStrings,
    classify: classify,
    isBaseClass: isBaseClass,
    isOverridePath: isOverridePath,
    mergeInto: mergeInto,
    newMerged: newMerged,
    unquote: unquote,
    quote: quote,
    num: num,
    splitItems: splitItems,
    CLOTHING_SLOTS: CLOTHING_SLOTS,
    onChange: (f) => listeners.push(f),
  };
})(window.EQE);
