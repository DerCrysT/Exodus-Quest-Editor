/**
 * Exodus Editor – Gasmasken-Editor (Mod Exodus_GM): liest die Exodus_GM-PBO bzw. den Quellordner, bearbeitet Masken und
 * Filter (Werte, neue Klassen), die Slot-Locks und die Filter-Erkennung und schreibt den kompletten Mod-Ordner
 * (config.cpp + Scripts), den du anschließend selbst als PBO packst.
 */
(function (EQE) {
  "use strict";
  const h = EQE.h;
  const clear = EQE.clear;
  const P = () => EQE.Project;
  const Cfg = () => EQE.Cfg;
  const K = () => EQE.MPKit;

  const STORE_KEY = "eqe:gasmask:v1";
  const MOD = "Exodus_GM";
  const SYS_PATH = "Scripts/4_World/Exodus_GasMask_System.c";
  const ACT_PATH = "Scripts/4_World/UP_Override_Actions.c";
  const KNOWN_SLOTS = ["Back", "Vest", "Headgear", "Hips", "Body", "Legs", "Feet", "Gloves", "Mask", "Eyewear", "Armband", "Shoulder", "Melee"];

  // ---------------------------------------------------------------- Zustand
  const gm = {
    loaded: false,
    configText: "",
    script: { variants: [], regs: {}, filterSlots: [], actions: "" },
    baseline: "",
    existingPath: "",
    source: "",
  };
  let tree = null; // geparster Klassenbaum von configText
  const pendingScripts = {}; // lose Skripte aus einem Quellordner
  let saveTimer = null;

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        gm.configText = writeConfig();
        localStorage.setItem(STORE_KEY, JSON.stringify(gm));
      } catch (e) {
        /* egal */
      }
    }, 400);
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (s && s.configText) {
        Object.assign(gm, s);
        tree = Cfg().parse(gm.configText);
      }
    } catch (e) {
      /* egal */
    }
  }

  // ---------------------------------------------------------------- Config: Baum lesen/schreiben
  function lc(s) {
    return String(s).toLowerCase();
  }
  function child(node, name) {
    return node.children.find((c) => lc(c.name) === lc(name)) || null;
  }
  function prop(node, name) {
    return node.props.find((p) => lc(p.name) === lc(name)) || null;
  }
  function unq(s) {
    return Cfg().unquote(s);
  }
  function setProp(node, name, value) {
    const p = prop(node, name);
    if (value === null) {
      if (p) node.props.splice(node.props.indexOf(p), 1);
      return;
    }
    if (Array.isArray(value)) {
      if (p) {
        p.array = true;
        p.items = value;
        p.raw = undefined;
      } else node.props.push({ name: name, array: true, items: value, op: "=" });
    } else if (p) {
      p.array = false;
      p.raw = String(value);
      p.items = null;
    } else node.props.push({ name: name, array: false, raw: String(value), items: null, op: "=" });
  }

  function writeNode(node, pad, out) {
    if (node.forward) {
      out.push(pad + "class " + node.name + (node.base ? ": " + node.base : "") + ";");
      return;
    }
    out.push(pad + "class " + node.name + (node.base ? ": " + node.base : ""));
    out.push(pad + "{");
    node.props.forEach((p) => {
      if (p.array) {
        const items = p.items.map((i) => String(i).replace(/\s*\n\s*/g, " "));
        const one = items.join(", ");
        const op = p.op && p.op !== "=" ? " " + p.op + " " : " = ";
        if (one.length <= 100) out.push(pad + "\t" + p.name + "[]" + op + "{" + one + "};");
        else {
          out.push(pad + "\t" + p.name + "[]" + op + "{");
          items.forEach((it, i) => out.push(pad + "\t\t" + it + (i < items.length - 1 ? "," : "")));
          out.push(pad + "\t};");
        }
      } else out.push(pad + "\t" + p.name + " = " + p.raw + ";");
    });
    node.children.forEach((c) => writeNode(c, pad + "\t", out));
    out.push(pad + "};");
  }

  function writeConfig() {
    if (!tree) return gm.configText;
    const out = [];
    tree.children.forEach((c) => writeNode(c, "", out));
    return out.join("\n") + "\n";
  }

  // ---------------------------------------------------------------- Klassen der Mod
  function vehicles() {
    return tree ? child(tree, "CfgVehicles") : null;
  }
  function slotsNode() {
    return tree ? child(tree, "CfgSlots") : null;
  }
  function items() {
    const v = vehicles();
    return v ? v.children.filter((c) => !c.forward && /^Exodus_/.test(c.name)) : [];
  }
  function isFilter(node) {
    if (/Filter|_balon|Balon/i.test(node.name)) return true;
    const inv = prop(node, "inventorySlot");
    return !!(inv && inv.array && inv.items.some((x) => /filter|balon/i.test(unq(x))));
  }
  function tierOf(node) {
    const m = /^Exodus_T(\d)_/.exec(node.name);
    return m ? Number(m[1]) : 0;
  }
  function getItem(name) {
    return items().find((c) => c.name === name) || null;
  }

  // ---------------------------------------------------------------- Skript lesen/erzeugen
  function parseScript(text, actions) {
    const out = { variants: [], regs: {}, filterSlots: [], actions: actions || "" };
    const vrx = /class\s+(Exodus_SlotLock_\w+)\s+extends\s+Exodus_GasMaskBase\s*\{([\s\S]*?)\n\}/g;
    let m;
    while ((m = vrx.exec(text))) {
      const apply = /void\s+ApplySlotLocks[\s\S]*$/.exec(m[2]);
      const slots = [];
      const srx = /GetSlotIdFromString\("(\w+)"\)/g;
      let s;
      while ((s = srx.exec(apply ? apply[0] : m[2]))) if (slots.indexOf(s[1]) < 0) slots.push(s[1]);
      out.variants.push({ name: m[1], slots: slots });
    }
    const rrx = /^class\s+(\w+)\s*:\s*(Exodus_SlotLock_\w+)\s*\{\s*\}\s*;/gm;
    while ((m = rrx.exec(text))) out.regs[m[1]] = m[2];
    const fm = /slot_name\s*==\s*"GasMaskFilter"\)\s*\{([\s\S]*?)\n\s*\}\s*\n\s*return super/.exec(text);
    const frx = /super\.FindAttachmentBySlotName\("([^"]+)"\)/g;
    const body = fm ? fm[1] : "";
    while ((m = frx.exec(body))) out.filterSlots.push(m[1]);
    return out;
  }

  function variantLabel(v) {
    const names = { Back: "Back", Headgear: "Headgear", Vest: "Vest", Hips: "Hips", Body: "Body", Legs: "Legs", Feet: "Feet", Gloves: "Gloves", Mask: "Mask", Eyewear: "Eyewear", Armband: "Armband", Shoulder: "Shoulder", Melee: "Melee" };
    return v.slots.map((s) => names[s] || s).join(" + ") + " lock";
  }

  function generateScript() {
    const L = [];
    const bar = "// ─────────────────────────────────────────────────────────────";
    L.push(bar, "//  SECTION 1 – Base class", bar, "");
    L.push("class Exodus_GasMaskBase extends MaskBase", "{");
    L.push("    // ── Actions ──────────────────────────────────────────────────");
    L.push("    override void SetActions()", "    {", "        super.SetActions();", "        AddAction(ActionWringClothes);", "    }", "");
    L.push("    // ── Voice ─────────────────────────────────────────────────────");
    L.push("    override bool IsObstructingVoice() { return false; }", "    override int  GetVoiceEffect()     { return 0; }", "");
    L.push("    // ── Radiation-mod recognition ─────────────────────────────────");
    L.push("    override bool IsGasMask() { return true; }", "    override EntityAI FindAttachmentBySlotName(string slot_name)", "    {", '        if (slot_name == "GasMaskFilter")', "        {", "            EntityAI f;", "");
    gm.script.filterSlots.forEach((s) => {
      L.push('            f = super.FindAttachmentBySlotName("' + s + '");', "            if (f != NULL) return f;", "");
    });
    L.push("        }", "", "        return super.FindAttachmentBySlotName(slot_name);", "    }", "");
    L.push("    // ── Slot-lock: attach ─────────────────────────────────────────");
    L.push("    override void OnWasAttached(EntityAI parent, int slot_id)", "    {", "        super.OnWasAttached(parent, slot_id);", "", "        PlayerBase owner = PlayerBase.Cast(parent);", "        if (owner)", "        {", "            ApplySlotLocks(owner, true);", "            GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(DelayedLock, 100, false, owner);", "        }", "    }", "");
    L.push("    // ── Slot-lock: detach ─────────────────────────────────────────");
    L.push("    override void OnWasDetached(EntityAI parent, int slot_id)", "    {", "        super.OnWasDetached(parent, slot_id);", "", "        PlayerBase owner = PlayerBase.Cast(parent);", "        if (owner)", "        {", "            ApplySlotLocks(owner, false);", "        }", "    }", "");
    L.push("    // ── Deferred re-lock ──────────────────────────────────────────");
    L.push("    void DelayedLock(PlayerBase owner)", "    {", "        ApplySlotLocks(owner, true);", "    }", "");
    L.push("    // ── Slot-lock template method ──────────────────────────────────", "    // Intentionally empty in base; each variant overrides this.", "    void ApplySlotLocks(PlayerBase owner, bool locked) {}", "}", "", "");
    gm.script.variants.forEach((v, i) => {
      L.push(bar, "//  SECTION " + (i + 2) + " – Variant " + String.fromCharCode(65 + i) + ": " + variantLabel(v), bar, "");
      L.push("class " + v.name + " extends Exodus_GasMaskBase", "{", "    override bool CanPutAsAttachment(EntityAI parent)", "    {", "        if (!super.CanPutAsAttachment(parent))", "            return false;", "");
      v.slots.forEach((s) => L.push('        if (parent.FindAttachmentBySlotName("' + s + '") != NULL) return false;'));
      L.push("        return true;", "    }", "", "    override void ApplySlotLocks(PlayerBase owner, bool locked)", "    {");
      v.slots.forEach((s) => L.push("        owner.GetInventory().SetSlotLock(", '            InventorySlots.GetSlotIdFromString("' + s + '"), locked);'));
      L.push("    }", "}", "", "");
    });
    L.push(bar, "//  Item registrations (masks)", "//", "//  To add a new item: append classname in the correct block.", "//  To exclude slot-locking: do not register it here (or inherit directly from Exodus_GasMaskBase).", bar, "");
    gm.script.variants.forEach((v) => {
      const names = Object.keys(gm.script.regs).filter((n) => gm.script.regs[n] === v.name);
      L.push("// ── " + variantLabel(v) + " " + "─".repeat(Math.max(3, 58 - variantLabel(v).length)));
      names.forEach((n) => L.push("class " + n + " ".repeat(Math.max(1, 46 - n.length)) + ": " + v.name + "{};"));
      L.push("");
    });
    return L.join("\n").replace(/\n+$/, "\n");
  }

  function outputs() {
    return [
      { path: "config.cpp", text: writeConfig() },
      { path: SYS_PATH, text: generateScript() },
      { path: ACT_PATH, text: gm.script.actions || "" },
    ].filter((f) => f.text);
  }
  function snapshot() {
    return outputs().map((f) => f.path + "\u0000" + f.text).join("\u0001");
  }
  function isChanged() {
    return gm.loaded && snapshot() !== gm.baseline;
  }

  // ---------------------------------------------------------------- Einlesen
  function adopt(config, scriptText, actions, path, existingPath) {
    gm.configText = config;
    tree = Cfg().parse(config);
    gm.script = parseScript(scriptText || "", actions);
    gm.source = path;
    gm.existingPath = existingPath || "";
    gm.loaded = true;
    gm.baseline = snapshot();
    persist();
    render();
  }

  function ingestSources(src) {
    if (isChanged()) {
      EQE.toast("Exodus_GM ist schon geladen und hat ungespeicherte Änderungen – das Einlesen von " + src.path + " wurde übersprungen.", true);
      return;
    }
    const sysKey = Object.keys(src.scripts).find((k) => /Exodus_GasMask_System\.c$/i.test(k));
    const actKey = Object.keys(src.scripts).find((k) => /UP_Override_Actions\.c$/i.test(k));
    adopt(src.config, sysKey ? src.scripts[sysKey] : "", actKey ? src.scripts[actKey] : "", src.path, "");
    EQE.toast("Exodus_GM gelesen: " + items().length + " Klassen, " + Object.keys(gm.script.regs).length + " Slot-Locks.");
  }

  function ingestLooseScript(name, text) {
    pendingScripts[name] = text;
  }

  function afterIngest() {
    if (!EQE.Cfg) return;
    const src = Cfg().sources().find((s) => /(^|\/)Exodus_GM\/(.*\/)?config\.cpp$/i.test(s.path) && !/\.pbo\//i.test(s.path) && s.text);
    if (!src) return;
    const keys = Object.keys(pendingScripts);
    const sysKey = keys.find((k) => /Exodus_GasMask_System\.c$/i.test(k));
    if (!sysKey) return;
    if (isChanged() && gm.existingPath === src.path) return;
    const actKey = keys.find((k) => /UP_Override_Actions\.c$/i.test(k));
    adopt(src.text, pendingScripts[sysKey], actKey ? pendingScripts[actKey] : "", src.path, src.path);
    EQE.toast("Exodus_GM-Quellordner gelesen: " + src.path);
  }

  // ---------------------------------------------------------------- Radiation-Daten (optional geladen)
  function radJson(kind) {
    const it = P().byKind(kind).find((i) => !/_old/i.test(i.fileId || "")) || P().byKind(kind)[0];
    return it ? it.json : null;
  }
  function chainOf(node) {
    const names = [node.name];
    let b = node.base;
    let guard = 0;
    while (b && guard++ < 12) {
      names.push(b);
      const local = getItem(b);
      if (local) {
        b = local.base;
        continue;
      }
      const e = Cfg().getEntry("CfgVehicles", b);
      b = e ? e.base : "";
    }
    return names;
  }
  function protectionOf(node, list, nameKey, valKey) {
    if (!list) return null;
    const names = chainOf(node);
    for (const n of names) {
      const hit = list.find((x) => lc(x[nameKey]) === lc(n));
      if (hit) return { value: hit[valKey], via: n };
    }
    return null;
  }

  // ---------------------------------------------------------------- Feldsteuerung
  const FIELDS = [
    { k: "displayName", label: "Anzeigename", t: "text", tip: "Name des Items im Inventar." },
    { k: "descriptionShort", label: "Beschreibung", t: "textarea", tip: "Text im Inventar-Tooltip." },
    { k: "weight", label: "Gewicht (g)", t: "int", tip: "Gewicht in Gramm." },
    { k: "itemSize", label: "Inventargröße", t: "pair", labels: ["Breite", "Höhe"], tip: "Felder im Inventar (Breite × Höhe) – Größe/Clipping hängt auch davon ab, was mitgetragen wird." },
    { k: "noEyewear", label: "Keine Brille tragbar", t: "bool", only: "mask", tip: "1 = zusammen mit dieser Maske kann keine Brille getragen werden (verhindert Clipping der Brille im Maskenmodell); 0 = erlaubt." },
    { k: "attachments", label: "Anbau-Slots (Filter)", t: "list", only: "mask", suggest: "slots", tip: "Slots der Maske, in die Filter gesteckt werden (z. B. GasMaskFilter). Leer = die Maske hat den Filter integriert (siehe Füllmenge)." },
    { k: "inventorySlot", label: "Passt in Slot", t: "list", only: "filter", suggest: "slots", tip: "Slot(s), in die dieser Filter passt – muss zu den Anbau-Slots der Maske passen (und zur Filter-Erkennung im Skript)." },
    { k: "varQuantityInit", label: "Füllmenge zu Beginn", t: "int", tip: "Startfüllung des Filters (bei Masken mit integriertem Filter: der Maske)." },
    { k: "varQuantityMax", label: "Füllmenge maximal (Kapazität)", t: "int", tip: "Kapazität. In der Strahlungszone verbraucht der Filter pro Takt die „qtyConsumedByFiltersInRad“ aus der Radiation-Config – größere Kapazität = längere Laufzeit." },
    { k: "varQuantityMin", label: "Füllmenge minimal", t: "int", tip: "Untergrenze der Füllung, meist 0." },
    { k: "stackedUnit", label: "Einheit", t: "text", tip: "Anzeigeeinheit der Füllmenge (z. B. ml)." },
    { k: "quantityBar", label: "Füllanzeige", t: "bool", tip: "1 = Balken mit der Füllung im Inventar." },
    { k: "varQuantityDestroyOnMin", label: "Bei 0 zerstören", t: "bool", tip: "1 = das Item verschwindet, wenn die Füllung 0 erreicht; 0 = es bleibt (leer)." },
    { k: "repairableWithKits", label: "Reparierbar mit Kits", t: "list", tip: "Typ-Nummern der Reparatur-Kits (Zahlen)." },
    { k: "repairCosts", label: "Reparaturkosten", t: "list", tip: "Kosten je Kit-Typ, gleiche Reihenfolge wie bei den Kits." },
    { k: "DamageSystem/GlobalHealth/Health/hitpoints", label: "Lebenspunkte (Haltbarkeit)", t: "int", nested: true, tip: "Haltbarkeit des Items. Beschädigte Teile schützen laut Radiation-Config nur noch teilweise (Worn/Damaged/Badly Damaged)." },
  ];

  function getNested(node, path) {
    const segs = path.split("/");
    const key = segs.pop();
    let n = node;
    for (const s of segs) {
      n = child(n, s);
      if (!n) return null;
    }
    return prop(n, key);
  }
  function setNested(node, path, value) {
    const segs = path.split("/");
    const key = segs.pop();
    let n = node;
    for (const s of segs) {
      let c = child(n, s);
      if (!c) {
        c = { name: s, base: "", forward: false, props: [], children: [] };
        n.children.push(c);
      }
      n = c;
    }
    setProp(n, key, value);
  }
  function readProp(node, f) {
    return f.nested ? getNested(node, f.k) : prop(node, f.k);
  }
  function writeProp(node, f, value) {
    if (f.nested) setNested(node, f.k, value);
    else setProp(node, f.k, value);
  }

  function slotNames() {
    const set = new Set(["GasMaskFilter"]);
    const s = slotsNode();
    if (s) s.children.forEach((c) => !c.forward && set.add(unq((prop(c, "name") || {}).raw || c.name.replace(/^Slot_/, ""))));
    items().forEach((n) => ["attachments", "inventorySlot"].forEach((k) => ((prop(n, k) || { items: [] }).items || []).forEach((x) => set.add(unq(x)))));
    gm.script.filterSlots.forEach((x) => set.add(x));
    return Array.from(set).filter(Boolean).sort();
  }

  function tip(text) {
    return K().tipNode(text);
  }

  function fieldControl(node, f, after) {
    const p = readProp(node, f);
    const set = (v) => {
      writeProp(node, f, v);
      changed();
      if (after) after();
    };
    const ph = h("span", { class: "pill", text: "nicht gesetzt" });
    let control;
    if (f.t === "text") {
      control = h("input", { type: "text", value: p ? unq(p.raw) : "", oninput: (e) => set(e.target.value === "" ? null : Cfg().quote(e.target.value)) });
    } else if (f.t === "textarea") {
      control = h("textarea", { rows: "4", oninput: (e) => set(e.target.value === "" ? null : Cfg().quote(e.target.value)) });
      control.value = p ? unq(p.raw) : "";
    } else if (f.t === "int") {
      control = h("input", { type: "number", step: "1", value: p ? unq(p.raw) : "", placeholder: "–", oninput: (e) => set(e.target.value.trim() === "" ? null : e.target.value.trim()) });
    } else if (f.t === "bool") {
      control = h("label", { class: "checkrow" }, [h("input", { type: "checkbox", checked: p && Number(unq(p.raw)) === 1, onchange: (e) => set(e.target.checked ? "1" : "0") }), "Ja"]);
    } else if (f.t === "pair") {
      const cur = p && p.array ? p.items : [];
      const ins = [0, 1].map((i) => h("input", { type: "number", step: "1", value: cur[i] === undefined ? "" : cur[i] }));
      const upd = () => {
        if (ins.every((x) => x.value.trim() === "")) return set(null);
        set(ins.map((x) => x.value.trim() || "0"));
      };
      ins.forEach((x) => x.addEventListener("input", upd));
      control = h("div", { class: "grid2" }, ins.map((x, i) => h("div", { class: "field" }, [h("div", { class: "help", text: f.labels[i] }), x])));
    } else if (f.t === "list") {
      const arr = (p && p.array ? p.items : []).slice();
      const isStr = f.k === "attachments" || f.k === "inventorySlot";
      const chips = h("div", { class: "strlist" });
      const draw = () => {
        clear(chips);
        arr.forEach((v, i) => chips.appendChild(h("span", { class: "chip" }, [unq(v), h("button", { type: "button", text: "×", onclick: () => (arr.splice(i, 1), set(arr.slice()), draw()) })])));
        if (!arr.length) chips.appendChild(h("span", { class: "muted small", text: "(leer)" }));
      };
      const id = EQE.uid();
      const add = h("input", { type: isStr ? "text" : "number", step: "any", placeholder: "Hinzufügen (Enter)", list: isStr ? id : undefined });
      add.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const t = add.value.trim();
        if (!t) return;
        arr.push(isStr ? Cfg().quote(t) : t);
        add.value = "";
        set(arr.slice());
        draw();
      });
      draw();
      control = h("div", { class: "list" }, [chips, h("div", { class: "chip-add" }, [add, isStr ? h("datalist", { id: id }, slotNames().map((s) => h("option", { value: s }))) : null])]);
    }
    return { control: control, set: !!p, ph: ph };
  }

  function changed() {
    persist();
    if (P() && P().notify) P().notify();
  }

  // ---------------------------------------------------------------- UI
  let root = null;
  let content = null;
  const st = { view: "items", sel: "", filter: "", kind: "", tier: "", cfgTab: "config" };

  function lockOf(name) {
    return gm.script.regs[name] || "";
  }

  function itemInfoRows(node) {
    const rows = [];
    const filter = isFilter(node);
    const cloth = radJson("rad_cloth");
    const filt = radJson("rad_filter");
    const gen = radJson("rad_general");
    const zones = radJson("rad_zones");
    const prot = filter ? protectionOf(node, filt && filt.FilterAll, "filterName", "mSvProtection") : protectionOf(node, cloth && cloth.RadClothAll, "clothName", "protection");
    if (filt || cloth) {
      if (prot) rows.push(["Strahlenschutz (Radiation-Mod)", K().fmt(prot.value, 0) + " mSv", "aus " + (filter ? "FilterProtection.json" : "RadClothProtection.json") + (prot.via !== node.name ? " über die Basisklasse „" + prot.via + "“" : "")]);
      else rows.push(["Strahlenschutz (Radiation-Mod)", "NICHT eingetragen", (filter ? "Dieser Filter fehlt in FilterProtection.json" : "Diese Maske (und ihre Basisklassen) fehlt in RadClothProtection.json") + " – ohne Eintrag schützt sie nicht."]);
    } else rows.push(["Strahlenschutz (Radiation-Mod)", "Radiation-Dateien nicht geladen", "Lade den Radiation-Ordner, um Schutzwerte zu sehen."]);
    if (prot && zones && Number.isFinite(prot.value)) {
      const list = zones.m_RadiationTrigger || [];
      const full = list.filter((z) => z.intensityMax <= prot.value).length;
      rows.push(["Schutz vor Strahlungszonen", full + " von " + list.length + " Zonen komplett", "Annahme: Schutz ≥ Zonen-Intensität (max) = keine Aufnahme"]);
    }
    const qmax = Number((prop(node, "varQuantityMax") || {}).raw);
    if (gen && Number.isFinite(qmax) && qmax > 0 && (filter || !((prop(node, "attachments") || { items: [] }).items || []).length)) {
      const q = Number(gen.qtyConsumedByFiltersInRad);
      const tick = Number(gen.radiationTriggerTickTime) || 1;
      if (q > 0) rows.push(["Laufzeit in Strahlungszone", K().fmtTime(qmax / (q / tick)), "Annahme: Verbrauch " + K().fmt(q, 3) + " je Takt à " + K().fmt(tick) + " s von " + K().fmt(qmax, 0) + " Füllung"]);
    }
    if (!filter) {
      const att = (prop(node, "attachments") || { items: [] }).items || [];
      const lock = lockOf(node.name);
      rows.push(["Filter", att.length ? "extern (" + att.map(unq).join(", ") + ")" : "integriert", att.length ? "Laufzeit hängt vom eingesteckten Filter ab" : "Füllmenge der Maske zählt"]);
      rows.push(["Slot-Lock", lock ? lock : "keiner", lock ? "sperrt: " + ((gm.script.variants.find((v) => v.name === lock) || { slots: [] }).slots.join(", ")) : "die Maske sperrt keine Slots"]);
    }
    return rows;
  }

  function renderItems(box) {
    const all = items();
    const filterTxt = st.filter.toLowerCase();
    const shown = all.filter((n) => {
      if (filterTxt && lc(n.name).indexOf(filterTxt) < 0) return false;
      if (st.kind === "filter" && !isFilter(n)) return false;
      if (st.kind === "mask" && isFilter(n)) return false;
      if (st.tier !== "" && String(tierOf(n)) !== st.tier) return false;
      return true;
    });
    const host = h("div", { class: "ov2 mp-zone" });
    const left = h("div", { class: "ov2-left" });
    const right = h("div", { class: "ov2-right" });
    host.appendChild(left);
    host.appendChild(right);
    box.appendChild(host);

    const search = h("input", { type: "text", placeholder: "Suchen …", value: st.filter, oninput: (e) => ((st.filter = e.target.value), renderContent()) });
    const kindSel = h("select", { onchange: (e) => ((st.kind = e.target.value), renderContent()) }, [["", "Alle"], ["mask", "Masken"], ["filter", "Filter"]].map(([v, l]) => h("option", { value: v, text: l, selected: st.kind === v })));
    const tierSel = h("select", { onchange: (e) => ((st.tier = e.target.value), renderContent()) }, [["", "Alle Stufen"], ["1", "T1"], ["2", "T2"], ["3", "T3"], ["4", "T4"], ["0", "ohne Stufe"]].map(([v, l]) => h("option", { value: v, text: l, selected: st.tier === v })));
    left.appendChild(
      h("div", { class: "section" }, [
        h("div", { class: "section-body" }, [
          search,
          h("div", { class: "grid2" }, [h("div", { class: "field" }, [h("label", { text: "Art" }), kindSel]), h("div", { class: "field" }, [h("label", { text: "Stufe" }), tierSel])]),
          h("div", { class: "toolbar" }, [
            h("button", { class: "btn small primary", type: "button", text: "Neue Klasse …", onclick: () => newItemDialog() }),
            h("button", { class: "btn small", type: "button", text: "Duplizieren", disabled: !getItem(st.sel), onclick: () => newItemDialog(st.sel) }),
            h("button", { class: "btn small danger", type: "button", text: "Löschen", disabled: !getItem(st.sel), onclick: () => deleteItem(st.sel) }),
          ]),
          h("div", { class: "muted small", text: shown.length + " von " + all.length + " Klassen" }),
        ]),
      ])
    );
    const list = h("div", { class: "ov2-list" });
    shown.forEach((n) => {
      const flt = isFilter(n);
      const lock = lockOf(n.name);
      list.appendChild(
        h("div", { class: "ov2-row" + (n.name === st.sel ? " current" : ""), onclick: () => ((st.sel = n.name), renderContent()) }, [
          h("div", { class: "ov2-name" }, [
            h("div", { class: "mono", text: n.name }),
            h("div", { class: "muted small", text: (flt ? "Filter" : "Maske" + (tierOf(n) ? " T" + tierOf(n) : "")) + " · erbt von " + (n.base || "–") + (lock ? " · " + lock.replace(/^Exodus_SlotLock_/, "Lock ") : "") }),
          ]),
        ])
      );
    });
    if (!shown.length) list.appendChild(h("div", { class: "list-empty", text: "Keine Klassen." }));
    left.appendChild(list);

    const node = getItem(st.sel) || shown[0] || null;
    if (!node) {
      right.appendChild(h("div", { class: "empty-state", text: "Wähle links eine Maske oder einen Filter." }));
      return;
    }
    st.sel = node.name;
    renderDetail(right, node);
  }

  function renderDetail(box, node) {
    const flt = isFilter(node);
    const infoHost = h("div", {});
    const drawInfo = () => {
      clear(infoHost);
      const lines = [K().head("Einordnung (" + (flt ? "Filter" : "Maske") + ")")].concat(itemInfoRows(node).map(([l, v, n]) => (v === "NICHT eingetragen" ? K().warn(l + ": " + v + " – " + n) : K().row(l, v, n))));
      const c = K().calcBox(lines);
      if (c) infoHost.appendChild(c);
    };
    drawInfo();
    box.appendChild(infoHost);

    // Basis / Name
    const baseId = EQE.uid();
    const nameRow = h("div", { class: "section" }, [
      h("div", { class: "section-body" }, [
        h("div", { class: "grid2" }, [
          h("div", { class: "field" }, [h("label", {}, ["Klassenname", tip("Der Name der Klasse im Spiel (Exodus_T… für Masken). Beim Umbenennen werden Slot-Lock-Zuordnung und Radiation-Einträge NICHT automatisch angepasst.")]), h("input", { type: "text", value: node.name, onchange: (e) => renameItem(node, e.target.value.trim()) })]),
          h("div", { class: "field" }, [
            h("label", {}, ["Basisklasse", tip("Die Original-Klasse aus dem anderen Mod (Modell, Texturen, Slots). Die Exodus-Klasse erbt davon und überschreibt nur die hier gesetzten Werte.")]),
            h("input", { type: "text", value: node.base, list: baseId, onchange: (e) => setBase(node, e.target.value.trim()) }),
            h("datalist", { id: baseId }, baseSuggestions().map((s) => h("option", { value: s }))),
          ]),
        ]),
      ]),
    ]);
    box.appendChild(nameRow);

    // Felder
    const grid = h("div", { class: "grid2" });
    FIELDS.forEach((f) => {
      if (f.only === "mask" && flt) return;
      if (f.only === "filter" && !flt) return;
      const r = fieldControl(node, f, drawInfo);
      grid.appendChild(
        h("div", { class: "field" + (f.t === "list" || f.t === "textarea" ? " span2" : "") }, [h("label", {}, [f.label, tip(f.tip), r.set ? null : r.ph]), r.control])
      );
    });
    // Slot-Lock (nur Masken)
    if (!flt) {
      const sel = h(
        "select",
        {
          onchange: (e) => {
            if (e.target.value) gm.script.regs[node.name] = e.target.value;
            else delete gm.script.regs[node.name];
            changed();
            drawInfo();
          },
        },
        [h("option", { value: "", text: "keiner – kein Slot wird gesperrt", selected: !lockOf(node.name) })].concat(gm.script.variants.map((v) => h("option", { value: v.name, text: variantLabel(v) + " (" + v.name + ")", selected: lockOf(node.name) === v.name })))
      );
      grid.appendChild(h("div", { class: "field span2" }, [h("label", {}, ["Slot-Lock", tip("Sperrt Inventar-Slots am Spieler, solange die Maske getragen wird (z. B. Rucksack-Slot, damit Gasbox-Modelle nicht in Rucksäcke clippen). Die Varianten legst du unter „Slot-Locks“ an.")]), sel]));
    }
    box.appendChild(h("div", { class: "section" }, [h("div", { class: "section-body" }, [grid])]));

    // Weitere Eigenschaften (roh)
    const known = new Set(FIELDS.filter((f) => !f.nested).map((f) => lc(f.k)));
    const rest = node.props.filter((p) => !known.has(lc(p.name)));
    const body = h("tbody");
    rest.forEach((p) => {
      const txt = p.array ? "{" + p.items.join(", ").replace(/\s+/g, " ") + "}" : p.raw;
      body.appendChild(
        h("tr", {}, [
          h("td", { class: "mono small", text: p.name + (p.array ? "[]" : "") }),
          h("td", {}, [
            h("input", {
              type: "text",
              value: txt.length > 160 ? txt.slice(0, 157) + "…" : txt,
              title: txt,
              disabled: txt.length > 160,
              onchange: (e) => {
                const t = e.target.value.trim();
                if (p.array) setProp(node, p.name, Cfg().splitItems(t.replace(/^\{/, "").replace(/\}$/, "")));
                else setProp(node, p.name, t);
                changed();
              },
            }),
          ]),
          h("td", {}, [h("button", { class: "btn icon small", type: "button", title: "Eigenschaft entfernen", text: "✕", onclick: () => (setProp(node, p.name, null), changed(), renderContent()) })]),
        ])
      );
    });
    const children = node.children.map((c) => c.name);
    const newName = h("input", { type: "text", placeholder: "Name, z. B. heatIsolation" });
    const newVal = h("input", { type: "text", placeholder: "Wert, z. B. 0.5 oder {1,2} oder \"Text\"" });
    box.appendChild(
      EQE.section("Weitere Eigenschaften", "Alles, was nicht oben steht (Modell, Texturen …) – Texturen und Modelle besser nicht ändern", [
        h("div", { class: "table-scroll" }, [h("table", { class: "ptable prod-table" }, [h("tbody", {}, [body])])]),
        children.length ? h("div", { class: "help", text: "Verschachtelte Klassen (nur Lesen): " + children.join(", ") }) : null,
        h("div", { class: "grid2" }, [h("div", { class: "field" }, [h("label", { text: "Neue Eigenschaft" }), newName]), h("div", { class: "field" }, [h("label", { text: "Wert" }), newVal])]),
        h("button", {
          class: "btn small",
          type: "button",
          text: "Hinzufügen",
          onclick: () => {
            const n = newName.value.trim();
            const v = newVal.value.trim();
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n) || v === "") return EQE.toast("Name und Wert eingeben.", true);
            if (/^\{.*\}$/.test(v)) setProp(node, n, Cfg().splitItems(v.replace(/^\{/, "").replace(/\}$/, "")));
            else setProp(node, n, v);
            changed();
            renderContent();
          },
        }),
      ], { collapsed: true })
    );
  }

  function baseSuggestions() {
    const set = new Set();
    const v = vehicles();
    if (v) v.children.forEach((c) => c.forward && set.add(c.name));
    if (EQE.Cfg) Cfg().classNames("CfgVehicles").filter((n) => /gas|mask|filter|balon|bag|box/i.test(n)).forEach((n) => set.add(n));
    return Array.from(set).sort().slice(0, 3000);
  }

  function ensureForward(name) {
    const v = vehicles();
    if (!v || !name) return;
    if (v.children.some((c) => lc(c.name) === lc(name))) return;
    const firstExodus = v.children.findIndex((c) => !c.forward);
    const fwd = { name: name, base: "", forward: true, props: [], children: [] };
    v.children.splice(firstExodus < 0 ? v.children.length : firstExodus, 0, fwd);
  }

  function setBase(node, base) {
    node.base = base;
    ensureForward(base);
    changed();
    renderContent();
  }

  function renameItem(node, name) {
    if (!name || name === node.name) return;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || getItem(name)) return EQE.toast("Ungültiger oder schon vorhandener Name.", true);
    const old = node.name;
    node.name = name;
    if (gm.script.regs[old]) {
      gm.script.regs[name] = gm.script.regs[old];
      delete gm.script.regs[old];
    }
    st.sel = name;
    changed();
    renderContent();
  }

  function deleteItem(name) {
    const node = getItem(name);
    if (!node || !window.confirm("„" + name + "“ wirklich löschen? (Der Slot-Lock-Eintrag wird ebenfalls entfernt.)")) return;
    const v = vehicles();
    v.children.splice(v.children.indexOf(node), 1);
    delete gm.script.regs[name];
    st.sel = "";
    changed();
    renderContent();
  }

  function newItemDialog(fromName) {
    const tpl = fromName ? getItem(fromName) : null;
    const baseIn = h("input", { type: "text", value: tpl ? tpl.base : "", list: "gm-base-new", placeholder: "Original-Klasse, z. B. up_seva_gasbox_green" });
    const kindSel = h("select", {}, [["mask", "Maske"], ["filter", "Filter"]].map(([v, l]) => h("option", { value: v, text: l, selected: tpl ? (isFilter(tpl) ? v === "filter" : v === "mask") : v === "mask" })));
    const tierSel = h("select", {}, ["1", "2", "3", "4"].map((t) => h("option", { value: t, text: "T" + t, selected: tpl ? String(tierOf(tpl)) === t : t === "2" })));
    const nameIn = h("input", { type: "text", placeholder: "wird aus Stufe + Basisklasse vorgeschlagen" });
    const tplSel = h("select", {}, [h("option", { value: "", text: "(leere Vorlage)" })].concat(items().map((n) => h("option", { value: n.name, text: n.name, selected: tpl && tpl.name === n.name }))));
    const suggest = () => {
      const b = baseIn.value.trim();
      if (!b) return;
      nameIn.value = kindSel.value === "filter" ? "Exodus_Filter_" + b : "Exodus_T" + tierSel.value + "_" + b;
    };
    [baseIn, kindSel, tierSel].forEach((x) => x.addEventListener("input", suggest));
    if (tpl) suggest();
    const body = h("div", { class: "grid2" }, [
      h("div", { class: "field" }, [h("label", { text: "Art" }), kindSel]),
      h("div", { class: "field" }, [h("label", { text: "Stufe (nur Masken)" }), tierSel]),
      h("div", { class: "field span2" }, [h("label", {}, ["Basisklasse (Original)", tip("Die Klasse aus dem Original-Mod, von der die neue Exodus-Klasse erbt – sie liefert Modell und Texturen. Sie muss in deiner Mod-Konfiguration geladen sein.")]), baseIn, h("datalist", { id: "gm-base-new" }, baseSuggestions().map((s) => h("option", { value: s })))]),
      h("div", { class: "field span2" }, [h("label", { text: "Klassenname" }), nameIn]),
      h("div", { class: "field span2" }, [h("label", {}, ["Werte kopieren von", tip("Kopiert Anzeigename, Gewicht, Größe, Füllmenge usw. von einer vorhandenen Klasse als Ausgangspunkt (Modell/Textur-Angaben werden nicht mit kopiert).")]), tplSel]),
      h("div", { class: "span2" }, [
        h("button", {
          class: "btn primary",
          type: "button",
          text: "Anlegen",
          onclick: () => {
            const name = nameIn.value.trim();
            const base = baseIn.value.trim();
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || getItem(name)) return EQE.toast("Name ungültig oder schon vorhanden.", true);
            if (!base) return EQE.toast("Bitte eine Basisklasse angeben.", true);
            const node = { name: name, base: base, forward: false, props: [], children: [] };
            const src = tplSel.value ? getItem(tplSel.value) : null;
            if (src) {
              src.props.forEach((p) => {
                if (/^(model|hiddenSelections|inventorySlot)/i.test(p.name) && isFilter(src) !== (kindSel.value === "filter")) return;
                if (/^(model|hiddenSelections)/i.test(p.name)) return;
                node.props.push(JSON.parse(JSON.stringify(p)));
              });
              const ds = child(src, "DamageSystem");
              if (ds && !/^hiddenSelections/i.test("")) node.children.push(JSON.parse(JSON.stringify(ds)));
            } else {
              setProp(node, "displayName", Cfg().quote(name));
              setProp(node, "weight", "500");
              setProp(node, "itemSize", ["3", "3"]);
            }
            ensureForward(base);
            vehicles().children.push(node);
            if (kindSel.value === "mask" && src && gm.script.regs[src.name]) gm.script.regs[name] = gm.script.regs[src.name];
            st.sel = name;
            changed();
            EQE.closeModal();
            renderContent();
          },
        }),
      ]),
    ]);
    EQE.openModal(fromName ? "Klasse duplizieren" : "Neue Maske / neuer Filter", body);
  }

  // ---------------------------------------------------------------- Slot-Locks & Filter-Erkennung
  function renderLocks(box) {
    box.appendChild(h("div", { class: "mp-sec-head" }, [h("h2", { text: "Slot-Locks & Filter-Erkennung" }), h("div", { class: "muted", text: "Das Skript sperrt Slots am Spieler, solange eine Maske getragen wird (damit Gasbox-/Rucksack-Modelle nicht ineinander clippen oder Spielvorteile entstehen), und sorgt dafür, dass der Radiation-Mod Gasmasken und ihre Filter erkennt." })]));
    const vHost = h("div", {});
    const drawVariants = () => {
      clear(vHost);
      gm.script.variants.forEach((v) => {
        const users = Object.keys(gm.script.regs).filter((n) => gm.script.regs[n] === v.name);
        const checks = KNOWN_SLOTS.concat(v.slots.filter((s) => KNOWN_SLOTS.indexOf(s) < 0)).map((s) =>
          h("label", { class: "checkrow" }, [
            h("input", {
              type: "checkbox",
              checked: v.slots.indexOf(s) > -1,
              onchange: (e) => {
                if (e.target.checked) v.slots.push(s);
                else v.slots.splice(v.slots.indexOf(s), 1);
                changed();
                drawVariants();
              },
            }),
            s,
          ])
        );
        vHost.appendChild(
          h("div", { class: "section" }, [
            h("div", { class: "section-body" }, [
              h("div", { class: "toolbar" }, [h("span", { class: "mono", text: v.name }), h("span", { class: "pill", text: variantLabel(v) }), h("span", { class: "muted small", text: users.length + " Masken" }), h("span", { class: "spacer" }), h("button", { class: "btn small danger", type: "button", text: "Löschen", disabled: users.length > 0, title: users.length ? "Wird noch von Masken benutzt" : "", onclick: () => (gm.script.variants.splice(gm.script.variants.indexOf(v), 1), changed(), drawVariants()) })]),
              h("div", { class: "grid4" }, checks),
              v.slots.length === 0 ? K().calcBox([K().warn("Diese Variante sperrt keinen Slot.")]) : null,
            ]),
          ])
        );
      });
    };
    drawVariants();
    const nameIn = h("input", { type: "text", placeholder: "Exodus_SlotLock_Name", value: "Exodus_SlotLock_" });
    box.appendChild(
      h("div", { class: "section" }, [
        h("div", { class: "section-body" }, [
          h("div", { class: "check-head", text: "Lock-Varianten" }),
          h("div", { class: "help", text: "Die Häkchen bestimmen, welche Slots (a) gesperrt werden, solange die Maske getragen wird, und (b) frei sein müssen, damit man die Maske überhaupt anlegen kann." }),
        ]),
      ])
    );
    box.appendChild(vHost);
    box.appendChild(
      h("div", { class: "section" }, [
        h("div", { class: "section-body" }, [
          h("div", { class: "toolbar" }, [nameIn, h("button", { class: "btn small primary", type: "button", text: "Neue Variante", onclick: () => {
            const n = nameIn.value.trim();
            if (!/^Exodus_SlotLock_\w+$/.test(n) || gm.script.variants.some((x) => x.name === n)) return EQE.toast("Name muss mit Exodus_SlotLock_ beginnen und neu sein.", true);
            gm.script.variants.push({ name: n, slots: [] });
            changed();
            drawVariants();
          } })]),
        ]),
      ])
    );

    // Filter-Erkennung
    const arr = gm.script.filterSlots;
    const chips = h("div", { class: "strlist" });
    const draw = () => {
      clear(chips);
      arr.forEach((s, i) =>
        chips.appendChild(h("span", { class: "chip" }, [(i + 1) + ". " + s, h("button", { type: "button", title: "Nach oben", text: "↑", onclick: () => (i > 0 && (arr.splice(i - 1, 0, arr.splice(i, 1)[0]), changed(), draw())) }), h("button", { type: "button", text: "×", onclick: () => (arr.splice(i, 1), changed(), draw()) })]))
      );
      if (!arr.length) chips.appendChild(h("span", { class: "muted small", text: "(keine)" }));
    };
    draw();
    const id = EQE.uid();
    const add = h("input", { type: "text", list: id, placeholder: "Slot-Name + Enter" });
    add.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const t = add.value.trim();
      if (t && arr.indexOf(t) < 0) arr.push(t);
      add.value = "";
      changed();
      draw();
    });
    const used = new Set();
    items().forEach((n) => ["attachments", "inventorySlot"].forEach((k) => ((prop(n, k) || { items: [] }).items || []).forEach((x) => used.add(unq(x)))));
    const missing = Array.from(used).filter((s) => s !== "GasMaskFilter" && arr.indexOf(s) < 0 && /filter|balon/i.test(s));
    box.appendChild(
      h("div", { class: "section" }, [
        h("div", { class: "section-body" }, [
          h("div", { class: "check-head" }, ["Filter-Erkennung (GasMaskFilter)", tip("Der Radiation-Mod sucht den Filter einer Gasmaske im Slot „GasMaskFilter“. Weil unsere Masken verschiedene eigene Filter-Slots haben, prüft FindAttachmentBySlotName der Reihe nach diese Slots und liefert den ersten gefundenen Filter. Jeder Filter-Slot einer Maske muss hier stehen.")]),
          chips,
          h("div", { class: "chip-add" }, [add, h("datalist", { id: id }, slotNames().map((s) => h("option", { value: s })))]),
          missing.length ? K().calcBox([K().warn("Diese Filter-Slots kommen in Filtern/Masken vor, stehen aber nicht in der Erkennung: " + missing.join(", "))]) : null,
        ]),
      ])
    );
  }

  // ---------------------------------------------------------------- Slots (CfgSlots)
  function renderSlots(box) {
    box.appendChild(h("div", { class: "mp-sec-head" }, [h("h2", { text: "Slots (CfgSlots)" }), h("div", { class: "muted", text: "Eigene Filter-Slots der Mod. Neue Filter-Slots müssen zusätzlich in der Filter-Erkennung (Slot-Locks) stehen." })]));
    const s = slotsNode();
    if (!s) {
      box.appendChild(h("div", { class: "empty-state", text: "Keine CfgSlots in der Config." }));
      return;
    }
    const body = h("tbody");
    s.children.forEach((c) => {
      if (c.forward) return;
      const f = (k) => unq((prop(c, k) || { raw: '""' }).raw);
      body.appendChild(
        h("tr", {}, [
          h("td", { class: "mono small", text: c.name }),
          h("td", {}, [h("input", { type: "text", value: f("name"), onchange: (e) => (setProp(c, "name", Cfg().quote(e.target.value)), setProp(c, "section", [Cfg().quote(e.target.value)]), changed()) })]),
          h("td", {}, [h("input", { type: "text", value: f("displayName"), onchange: (e) => (setProp(c, "displayName", Cfg().quote(e.target.value)), changed()) })]),
          h("td", { class: "mono small muted", text: f("ghostIcon") }),
          h("td", {}, [h("button", { class: "btn icon small", type: "button", text: "✕", onclick: () => (s.children.splice(s.children.indexOf(c), 1), changed(), renderContent()) })]),
        ])
      );
    });
    const nameIn = h("input", { type: "text", placeholder: "Slot-Name, z. B. up_new_filter" });
    box.appendChild(
      h("div", { class: "section" }, [
        h("div", { class: "section-body" }, [
          h("div", { class: "table-scroll" }, [h("table", { class: "ptable prod-table" }, [h("thead", {}, [h("tr", {}, ["Klasse", "Slot-Name", "Anzeigename", "Icon", ""].map((t) => h("th", { text: t })))]), body])]),
          h("div", { class: "toolbar" }, [nameIn, h("button", { class: "btn small primary", type: "button", text: "Slot anlegen", onclick: () => {
            const n = nameIn.value.trim();
            if (!/^[A-Za-z_]\w*$/.test(n) || s.children.some((c) => lc(c.name) === lc("Slot_" + n))) return EQE.toast("Ungültiger oder vorhandener Name.", true);
            ensureSlotBase(s);
            const node = { name: "Slot_" + n, base: "Slot_GasMaskFilter", forward: false, props: [], children: [] };
            setProp(node, "name", Cfg().quote(n));
            setProp(node, "displayName", Cfg().quote(n));
            setProp(node, "descriptionShort", Cfg().quote(n));
            setProp(node, "section", [Cfg().quote(n)]);
            setProp(node, "ghostIcon", Cfg().quote("set:clothes_zam_imageset image:clothes_zam"));
            s.children.push(node);
            changed();
            renderContent();
          } })]),
          h("div", { class: "help", text: "Neue Slots erben von Slot_GasMaskFilter. Danach in der Maske unter „Anbau-Slots“ und im Filter unter „Passt in Slot“ eintragen und in der Filter-Erkennung ergänzen." }),
        ]),
      ])
    );
  }
  function ensureSlotBase(s) {
    if (!s.children.some((c) => lc(c.name) === "slot_gasmaskfilter")) s.children.unshift({ name: "Slot_GasMaskFilter", base: "", forward: true, props: [], children: [] });
  }

  // ---------------------------------------------------------------- Vorschau / Ausgabe
  function renderPreview(box) {
    box.appendChild(h("div", { class: "mp-sec-head" }, [h("h2", { text: "Vorschau & Ausgabe" }), h("div", { class: "muted", text: "So wird der Mod-Ordner geschrieben. Anschließend den inneren Ordner (mit config.cpp) selbst als PBO packen (Prefix Exodus_GM)." })]));
    const files = outputs();
    const tabs = h("div", { class: "view-tabs" });
    const pre = h("pre", { class: "preview", style: "max-height:70vh" });
    const show = () => {
      const f = files.find((x) => x.path === st.cfgTab) || files[0];
      pre.textContent = f ? f.text : "";
      clear(tabs);
      files.forEach((x) => tabs.appendChild(h("button", { class: "btn small" + (x.path === f.path ? " active" : ""), type: "button", text: x.path, onclick: () => ((st.cfgTab = x.path), show()) })));
    };
    show();
    box.appendChild(
      h("div", { class: "section" }, [
        h("div", { class: "section-body" }, [
          h("div", { class: "toolbar" }, [tabs, h("span", { class: "spacer" }), h("button", { class: "btn small", type: "button", text: "Kopieren", onclick: () => EQE.copyText(pre.textContent) }), h("button", { class: "btn small", type: "button", text: "ZIP herunterladen", onclick: downloadZip })]),
          h("div", { class: "help", text: gm.existingPath ? "Gespeichert wird in: " + dirOfExisting() : "Wird beim Speichern als " + MOD + "/" + MOD + "/ (config.cpp, Scripts/, $PBOPREFIX$.txt) im Projektordner angelegt." }),
          pre,
        ]),
      ])
    );
  }

  function downloadZip() {
    const f = zipFiles(false);
    if (!f.length) return EQE.toast("Nichts zu exportieren.", true);
    const blob = P().buildZip(f);
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: "Exodus_GM.zip" });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function dirOfExisting() {
    return gm.existingPath.replace(/\/config\.cpp$/i, "");
  }
  function zipFiles(onlyChanged) {
    if (!gm.loaded) return [];
    if (onlyChanged && !isChanged()) return [];
    const dir = gm.existingPath ? dirOfExisting().replace(/^.*?\/(Exodus_GM(\/.*)?)$/i, "$1") : MOD + "/" + MOD;
    const out = outputs().map((f) => ({ name: dir + "/" + f.path, text: f.text }));
    if (!gm.existingPath) out.push({ name: dir + "/$PBOPREFIX$.txt", text: MOD + "\n" });
    return out;
  }
  function fileWrites(ctx) {
    if (!gm.loaded || !isChanged()) return [];
    const snap = snapshot();
    const base = gm.existingPath ? dirOfExisting() : (ctx.rootName ? ctx.rootName + "/" : "") + MOD + "/" + MOD;
    const done = () => {
      gm.baseline = snap;
      if (!gm.existingPath) gm.existingPath = base + "/config.cpp";
      persist();
    };
    const w = outputs().map((f, i) => ({ path: base + "/" + f.path, text: f.text, onDone: i === 0 ? done : () => {} }));
    if (!gm.existingPath) w.push({ path: base + "/$PBOPREFIX$.txt", text: MOD + "\n", onDone: () => {} });
    return w;
  }

  // ---------------------------------------------------------------- Aufbau
  function loadPbo() {
    const input = h("input", { type: "file", accept: ".pbo", style: "display:none" });
    document.body.appendChild(input);
    input.addEventListener("change", async () => {
      const f = input.files[0];
      input.remove();
      if (!f) return;
      try {
        const r = await EQE.CfgBin.readPboFiles(f, (name) => /(^|\/)config\.cpp$/i.test(name) || /\.c$/i.test(name));
        const text = new TextDecoder("utf-8");
        const src = { path: f.name, config: "", scripts: {} };
        r.files.forEach((e) => (/\.c$/i.test(e.name) ? (src.scripts[e.name] = text.decode(e.buffer)) : (src.config = text.decode(e.buffer))));
        if (!src.config) return EQE.toast("Keine config.cpp (Text) in der PBO gefunden – binarisierte Configs kann der Gasmasken-Editor nicht schreiben.", true);
        ingestSources(src);
      } catch (e) {
        EQE.toast("PBO nicht lesbar: " + e.message, true);
      }
    });
    input.click();
  }

  function render() {
    if (!root) return;
    clear(root);
    const bar = h("div", { class: "toolbar" }, [
      h("button", { class: "btn primary", type: "button", text: "Exodus_GM.pbo wählen…", onclick: loadPbo }),
      h("button", { class: "btn", type: "button", text: "Ordner laden…", onclick: () => P().pick(true), title: "Projekt-/Addon-Ordner laden: Exodus_GM.pbo oder ein vorhandener Exodus_GM-Quellordner wird automatisch erkannt" }),
      gm.loaded ? h("span", { class: "status", text: "Quelle: " + (gm.existingPath || gm.source) + " · " + items().length + " Klassen" + (isChanged() ? " · geändert" : "") }) : null,
    ]);
    root.appendChild(bar);
    if (!gm.loaded) {
      root.appendChild(
        h("div", { class: "empty-state" }, [
          h("div", { class: "drop-title", text: "Gasmasken-Editor (Exodus_GM)" }),
          h("p", { text: "Wähle die Exodus_GM.pbo (z. B. aus dem Addons-Ordner deines Test-Packs) oder lade einen Ordner, der die PBO oder einen Exodus_GM-Quellordner enthält. Der Editor liest config.cpp und die Skripte, lässt dich Masken und Filter anpassen oder neue anlegen und schreibt den Mod-Ordner Exodus_GM (config.cpp + Skripte), den du danach als PBO packst." }),
        ])
      );
      return;
    }
    const layout = h("div", { class: "ov2 mp" });
    const nav = h("div", { class: "mp-nav" });
    [["items", "Masken & Filter"], ["locks", "Slot-Locks & Filter-Erkennung"], ["slots", "Slots (CfgSlots)"], ["preview", "Vorschau & Ausgabe"]].forEach(([k, l]) =>
      nav.appendChild(h("button", { class: "mp-navbtn" + (st.view === k ? " active" : ""), type: "button", text: l, onclick: () => ((st.view = k), render()) }))
    );
    layout.appendChild(nav);
    content = h("div", { class: "mp-content" });
    layout.appendChild(content);
    root.appendChild(layout);
    renderContent();
  }

  function renderContent() {
    if (!content) return;
    clear(content);
    content.appendChild(h("div", { class: "issue ok mp-note", text: "Der Editor schreibt die komplette config.cpp und die Skripte neu (gleicher Aufbau, eigene Formatierung). Modelle/Texturen der Basisklassen bleiben unberührt. Die Skripte werden aus den Slot-Lock-Einstellungen erzeugt." }));
    if (st.view === "locks") return renderLocks(content);
    if (st.view === "slots") return renderSlots(content);
    if (st.view === "preview") return renderPreview(content);
    renderItems(content);
  }

  function init(panel) {
    root = panel;
    load();
    P().registerExtra({
      changedCount: () => (isChanged() ? 1 : 0),
      zipFiles: zipFiles,
      fileWrites: fileWrites,
      paths: () => (gm.existingPath ? [gm.existingPath] : []),
    });
    render();
    return { refresh: render };
  }

  EQE.GasMask = { init: init, ingestSources: ingestSources, ingestLooseScript: ingestLooseScript, afterIngest: afterIngest, generateScript: generateScript, writeConfig: writeConfig, parseScript: parseScript };
})(window.EQE);
