/**
 * Exodus Editor – PDA-Editor: Fraktionen (Fraktionsleader.json: Spawn, Mitgliederlimit, Start-Ausrüstung, Avatar-Gruppen)
 * und Loner-Spawn (LonerSpawn.json: Spawn-Position, Standard-Kit und Premium-Kits mit verschachtelter Ausrüstung).
 * Aufbau wie die anderen Editoren: „?“-Erklärungen, Live-Prüfungen, Zurückschreiben der JSON-Dateien.
 */
(function (EQE) {
  "use strict";
  const h = EQE.h;
  const clear = EQE.clear;
  const P = () => EQE.Project;
  const K = () => EQE.MPKit;
  const tipNode = (t) => K().tipNode(t);

  const KINDS = ["pda_factions", "pda_loner"];
  const st = { view: "factions", sel: 0, kit: "std" };

  const fileItem = (kind) => P().byKind(kind).find((i) => !/_old/i.test(i.fileId || "")) || P().byKind(kind)[0] || null;
  const mut = (item) => P().mutate(item.uid, () => {});
  const classes = () => (K().classSuggest ? K().classSuggest("CfgVehicles") : []);
  const steamOk = (s) => /^7656119\d{10}$/.test(String(s));

  // ---------------------------------------------------------------- Eingabeelemente
  function field(label, tip, input, span) {
    return h("div", { class: "field" + (span ? " span2" : "") }, [h("label", {}, [label, tipNode(tip)]), input]);
  }
  function textIn(item, obj, key, after) {
    return h("input", { type: "text", value: obj[key] === undefined ? "" : obj[key], oninput: (e) => ((obj[key] = e.target.value), mut(item), after && after()) });
  }
  function numIn(item, obj, key, isInt, after, style) {
    return h("input", {
      type: "number",
      step: isInt ? "1" : "any",
      value: obj[key],
      style: style || "",
      oninput: (e) => {
        const t = e.target.value.trim();
        if (t === "" || !Number.isFinite(Number(t))) return;
        obj[key] = isInt ? Math.round(Number(t)) : Number(t);
        mut(item);
        after && after();
      },
    });
  }
  /** Chip-Liste für ein String-Array (arr wird direkt verändert). */
  function chips(item, arr, placeholder, suggest, after) {
    const box = h("div", { class: "strlist" });
    const draw = () => {
      clear(box);
      arr.forEach((v, i) => box.appendChild(h("span", { class: "chip" }, [String(v), h("button", { type: "button", text: "×", onclick: () => (arr.splice(i, 1), commit()) })])));
      if (!arr.length) box.appendChild(h("span", { class: "muted small", text: "(leer)" }));
    };
    const commit = () => {
      mut(item);
      draw();
      after && after();
    };
    const id = suggest && suggest.length ? EQE.uid() : null;
    const add = h("input", { type: "text", placeholder: placeholder || "Hinzufügen (Enter)", list: id || undefined });
    add.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const t = add.value.trim();
      if (!t) return;
      arr.push(t);
      add.value = "";
      commit();
    });
    draw();
    return h("div", {}, [box, add, id ? h("datalist", { id: id }, suggest.slice(0, 5000).map((s) => h("option", { value: s }))) : null]);
  }

  // ---------------------------------------------------------------- Fraktionen
  function factionChecks(list) {
    const out = [];
    const num = {};
    const abbr = {};
    list.forEach((f) => {
      (num[f.Nummer] = num[f.Nummer] || []).push(f.Name);
      (abbr[f.Abkuerzung] = abbr[f.Abkuerzung] || []).push(f.Name);
    });
    Object.keys(num).forEach((k) => num[k].length > 1 && out.push(K().warn("Die Nummer " + k + " wird mehrfach verwendet (" + num[k].join(", ") + ") – Nummern müssen eindeutig sein.")));
    Object.keys(abbr).forEach((k) => abbr[k].length > 1 && out.push(K().warn("Die Abkürzung " + k + " wird mehrfach verwendet (" + abbr[k].join(", ") + ").")));
    return out;
  }

  function renderFactions(box) {
    const item = fileItem("pda_factions");
    if (!item) return empty(box, "Fraktionsleader.json");
    const list = item.json.Fraktionen;
    if (st.sel >= list.length) st.sel = Math.max(0, list.length - 1);
    box.appendChild(head("Fraktionen", "Jede Fraktion hat einen Leader, einen Spawn-Punkt, ein Mitgliederlimit und eine Start-Ausrüstung. Links auswählen, rechts bearbeiten.", "Fraktionsleader.json · " + list.length + " Fraktionen"));
    const calcHost = h("div", {});
    const redraw = () => {
      clear(calcHost);
      const out = [K().head("Übersicht")];
      const total = list.reduce((n, f) => n + (Number(f.MemberLimit) || 0), 0);
      out.push(K().row("Plätze gesamt", String(total), "Summe aller Mitgliederlimits"));
      list.forEach((f) => out.push(K().row(f.Abkuerzung + " " + f.Name, (f.MemberLimit || 0) + " Plätze", (steamOk(f.FraktionsLeaderSteamID) ? "Leader gesetzt" : "kein gültiger Leader (SteamID „" + f.FraktionsLeaderSteamID + "“)") + " · " + ((f.SpawnPos || []).every((x) => !x) ? "Spawn 0 0 0 (noch nicht gesetzt)" : "Spawn gesetzt"))));
      factionChecks(list).forEach((w) => out.push(w));
      const c = K().calcBox(out);
      if (c) calcHost.appendChild(c);
    };
    redraw();
    const nav = h("div", { class: "mp-list" });
    list.forEach((f, i) => nav.appendChild(h("button", { class: "mp-navbtn" + (i === st.sel ? " active" : ""), type: "button", text: (f.Abkuerzung || "") + " " + (f.Name || "(neu)"), onclick: () => ((st.sel = i), render()) })));
    const f = list[st.sel];
    const detail = h("div", { class: "mp-detail" }, [calcHost]);
    if (f) {
      if (!Array.isArray(f.SpawnPos)) f.SpawnPos = [0, 0, 0];
      if (!Array.isArray(f.SpawnGear)) f.SpawnGear = [];
      if (!Array.isArray(f.AvatarGroups)) f.AvatarGroups = [];
      const pos = h("div", { class: "grid3" }, ["x", "y (Höhe)", "z"].map((l, i) => h("div", { class: "field" }, [h("div", { class: "help", text: l }), numIn(item, f.SpawnPos, i, false, redraw)])));
      const grid = h("div", { class: "grid2" }, [
        field("Nummer", "Eindeutige Nummer der Fraktion (als Text). Wird intern zur Zuordnung benutzt – nicht doppelt vergeben.", textIn(item, f, "Nummer", redraw)),
        field("Name", "Anzeigename der Fraktion.", textIn(item, f, "Name", () => (redraw(), nav.children[st.sel] && (nav.children[st.sel].textContent = f.Abkuerzung + " " + f.Name)))),
        field("Abkürzung", "Kürzel, das im Chat/PDA vor dem Namen steht, z. B. [FS].", textIn(item, f, "Abkuerzung", redraw)),
        field("Leader Steam-ID", "Steam64-ID des Fraktionsleaders (17 Ziffern, beginnt mit 7656119…). „0“ = kein Leader.", textIn(item, f, "FraktionsLeaderSteamID", redraw)),
        field("Mitgliederlimit", "Wie viele Spieler maximal in diese Fraktion können.", numIn(item, f, "MemberLimit", true, redraw)),
        field("Spawn-Position", "Wo Mitglieder dieser Fraktion beim Spawnen erscheinen: x, y (Höhe), z. 0 0 0 = nicht gesetzt.", pos, true),
        field("Start-Ausrüstung", "Klassennamen der Gegenstände, die ein neues Mitglied bekommt (z. B. BandageDressing).", chips(item, f.SpawnGear, "Item (Enter)", classes(), redraw), true),
        field("Avatar-Gruppen", "Namen der Avatar-/Skin-Gruppen, die diese Fraktion nutzen darf (vermutlich Verweis auf die Avatar-Konfiguration des PDA-Mods).", chips(item, f.AvatarGroups, "Gruppe (Enter)", [], redraw), true),
      ]);
      detail.appendChild(h("div", { class: "section" }, [h("div", { class: "section-head", text: f.Name }), h("div", { class: "section-body" }, [grid, h("div", { class: "toolbar" }, [h("button", { class: "btn small danger", type: "button", text: "Fraktion entfernen", onclick: () => confirm("Fraktion „" + f.Name + "“ entfernen?") && (list.splice(st.sel, 1), mut(item), render()) })])])]));
    }
    const add = h("div", { class: "toolbar" }, [
      h("button", { class: "btn small", type: "button", text: "Fraktion hinzufügen", onclick: () => {
        const n = list.reduce((m, x) => Math.max(m, Number(x.Nummer) || 0), 0) + 1;
        list.push({ Nummer: String(n), Name: "Neue Fraktion", Abkuerzung: "[N]", FraktionsLeaderSteamID: "0", SpawnPos: [0, 0, 0], MemberLimit: 16, SpawnGear: [], AvatarGroups: [] });
        mut(item);
        st.sel = list.length - 1;
        render();
      } }),
    ]);
    box.appendChild(h("div", { class: "mp-split" }, [h("div", { class: "mp-listcol" }, [nav, add]), detail]));
  }

  // ---------------------------------------------------------------- Loner-Spawn
  /** Slot eines Gegenstands aus der Config-Registry (falls geladen). */
  function slotOf(cls) {
    if (!EQE.Cfg) return "";
    const e = EQE.Cfg.getEntry("CfgVehicles", cls);
    if (!e) return "";
    const s = EQE.Cfg.effScalar(e, "inventorySlot") || (EQE.Cfg.effStrings(e, "inventorySlot") || [])[0];
    return s ? EQE.Cfg.unquote(s) : (EQE.Cfg.effStrings(e, "inventorySlot")[0] || "");
  }

  function gearList(item, arr, depth, after) {
    const wrap = h("div", { class: "pda-gear" });
    const sug = classes();
    const draw = () => {
      clear(wrap);
      arr.forEach((g, i) => {
        if (!Array.isArray(g.Attachments)) g.Attachments = [];
        if (!Array.isArray(g.Cargo)) g.Cargo = [];
        const slot = slotOf(g.ClassName);
        const row = h("div", { class: "section", style: "margin:4px 0 4px " + depth * 14 + "px" }, [
          h("div", { class: "section-body" }, [
            h("div", { class: "toolbar" }, [
              h("input", { type: "text", value: g.ClassName, placeholder: "Klassenname", list: "pda-classes", style: "min-width:200px", oninput: (e) => ((g.ClassName = e.target.value), mut(item), after && after()), onchange: () => draw() }),
              h("label", { class: "small" }, ["Menge ", numIn(item, g, "Quantity", false, after, "width:80px"), tipNode("-1 = Standard (volle/übliche Menge). Sonst Anzahl bzw. Füllmenge laut Item.")]),
              slot ? h("span", { class: "muted small", text: "Slot: " + slot }) : null,
              h("button", { class: "btn icon small", type: "button", text: "✕", title: "Entfernen", onclick: () => (arr.splice(i, 1), mut(item), draw(), after && after()) }),
            ]),
            h("div", { class: "field" }, [h("label", {}, ["Anbauteile", tipNode("Klassennamen von Anbauteilen/Zubehör, die am Gegenstand befestigt werden (vermutlich als einfache Klassennamen).")]), chips(item, g.Attachments, "Anbauteil (Enter)", sug, after)]),
            h("div", { class: "field" }, [h("label", {}, ["Inhalt (Cargo)", tipNode("Gegenstände, die in diesem Gegenstand liegen. Gleicher Aufbau wie die Ausrüstung selbst.")]), gearList(item, g.Cargo, depth + 1, after)]),
          ]),
        ]);
        wrap.appendChild(row);
      });
      wrap.appendChild(h("div", { class: "toolbar", style: "margin-left:" + depth * 14 + "px" }, [h("button", { class: "btn small", type: "button", text: depth ? "Inhalt hinzufügen" : "Gegenstand hinzufügen", onclick: () => (arr.push({ ClassName: "", Quantity: -1, Attachments: [], Cargo: [] }), mut(item), draw()) })]));
    };
    draw();
    return wrap;
  }

  function kitCalc(kit) {
    const out = [];
    const slots = {};
    let n = 0;
    const walk = (arr, top) =>
      arr.forEach((g) => {
        n++;
        n += (g.Attachments || []).length;
        if (top) {
          const s = slotOf(g.ClassName);
          if (s) (slots[s] = slots[s] || []).push(g.ClassName);
        }
        walk(g.Cargo || [], false);
      });
    walk(kit.Gear || [], true);
    out.push(K().head("Inhalt"));
    out.push(K().row("Gegenstände", String(n), "inklusive Anbauteilen und Inhalt"));
    const dup = Object.keys(slots).filter((s) => slots[s].length > 1);
    dup.forEach((s) => out.push(K().warn("Mehrere Gegenstände belegen den Slot „" + s + "“ (" + slots[s].join(", ") + ") – nur einer kann angezogen werden.")));
    const unknown = (kit.Gear || []).filter((g) => g.ClassName && EQE.Cfg && EQE.Cfg.classNames("CfgVehicles").length && !EQE.Cfg.getEntry("CfgVehicles", g.ClassName)).map((g) => g.ClassName);
    unknown.forEach((c) => out.push(K().warn("Klasse „" + c + "“ ist in den geladenen Configs nicht vorhanden (Tippfehler oder Mod-Config nicht geladen).")));
    (kit.Gear || []).forEach((g) => !g.ClassName && out.push(K().warn("Ein Gegenstand hat keinen Klassennamen.")));
    if (!Object.keys(slots).length && (kit.Gear || []).length) out.push(K().head("Hinweis: Slots werden nur angezeigt, wenn die Vanilla-/Mod-Configs geladen sind."));
    return out;
  }

  function renderLoner(box) {
    const item = fileItem("pda_loner");
    if (!item) return empty(box, "LonerSpawn.json");
    const j = item.json;
    if (!Array.isArray(j.PremiumKits)) j.PremiumKits = [];
    if (!Array.isArray(j.SpawnPos)) j.SpawnPos = [0, 0, 0];
    box.appendChild(head("Loner-Spawn", "Wo Einzelgänger (ohne Fraktion) spawnen und was sie am Körper tragen: ein Standard-Kit für alle und Premium-Kits für bestimmte Steam-IDs.", "LonerSpawn.json"));
    const pos = h("div", { class: "grid3" }, ["x", "y (Höhe)", "z"].map((l, i) => h("div", { class: "field" }, [h("div", { class: "help", text: l }), numIn(item, j.SpawnPos, i, false)])));
    box.appendChild(h("div", { class: "section" }, [h("div", { class: "section-head", text: "Spawn-Position" }), h("div", { class: "section-body" }, [field("Position (x, y, z)", "Koordinaten, an denen Loner spawnen. y ist die Höhe (Bodenhöhe der Karte an dieser Stelle).", pos, true)])]));
    const kits = [{ key: "std", label: "Standard-Kit", kit: j.StandardKit }].concat(j.PremiumKits.map((k, i) => ({ key: "p" + i, label: "Premium: " + (k.Name || "(neu)"), kit: k, idx: i })));
    if (!kits.some((k) => k.key === st.kit)) st.kit = "std";
    const nav = h("div", { class: "mp-list" });
    kits.forEach((k) => nav.appendChild(h("button", { class: "mp-navbtn" + (k.key === st.kit ? " active" : ""), type: "button", text: k.label, onclick: () => ((st.kit = k.key), render()) })));
    const cur = kits.find((k) => k.key === st.kit);
    const kit = cur.kit;
    if (!Array.isArray(kit.Gear)) kit.Gear = [];
    if (!Array.isArray(kit.SteamIds)) kit.SteamIds = [];
    const calcHost = h("div", {});
    const redraw = () => {
      clear(calcHost);
      const c = K().calcBox(kitCalc(kit).concat(kit.SteamIds.filter((s) => !steamOk(s)).map((s) => K().warn("„" + s + "“ ist keine gültige Steam64-ID (17 Ziffern, beginnt mit 7656119)."))));
      if (c) calcHost.appendChild(c);
    };
    redraw();
    const datalist = h("datalist", { id: "pda-classes" }, classes().slice(0, 5000).map((s) => h("option", { value: s })));
    const detail = h("div", { class: "mp-detail" }, [calcHost, datalist]);
    const top = h("div", { class: "grid2" }, [
      field("Name", "Name des Kits (nur zur Übersicht).", textIn(item, kit, "Name", () => (cur.key === "std" ? null : (nav.children[kits.indexOf(cur)].textContent = "Premium: " + kit.Name)))),
      cur.key === "std" ? null : field("Steam-IDs", "Spieler (Steam64-ID), die dieses Premium-Kit statt des Standard-Kits bekommen.", chips(item, kit.SteamIds, "Steam-ID (Enter)", [], redraw), true),
    ]);
    detail.appendChild(h("div", { class: "section" }, [h("div", { class: "section-head", text: cur.label }), h("div", { class: "section-body" }, [top, h("h4", { text: "Ausrüstung" }), gearList(item, kit.Gear, 0, redraw), cur.key === "std" ? null : h("div", { class: "toolbar" }, [h("button", { class: "btn small danger", type: "button", text: "Kit entfernen", onclick: () => confirm("Kit „" + kit.Name + "“ entfernen?") && (j.PremiumKits.splice(cur.idx, 1), mut(item), (st.kit = "std"), render()) })])])]));
    const add = h("div", { class: "toolbar" }, [h("button", { class: "btn small", type: "button", text: "Premium-Kit hinzufügen", onclick: () => (j.PremiumKits.push({ Name: "Neues Kit", SteamIds: [], Gear: [] }), mut(item), (st.kit = "p" + (j.PremiumKits.length - 1)), render()) })]);
    box.appendChild(h("div", { class: "mp-split" }, [h("div", { class: "mp-listcol" }, [nav, add]), detail]));
  }

  // ---------------------------------------------------------------- Gerüst
  function head(title, blurb, file) {
    return h("div", { class: "mp-sec-head" }, [h("h2", { text: title }), h("div", { class: "muted", text: blurb }), file ? h("div", { class: "mono muted small", text: file }) : null]);
  }
  function empty(box, file) {
    box.appendChild(h("div", { class: "empty-state", text: file + " ist nicht geladen. Lade den Ordner „PDA“ über „Ordner laden…“ oben." }));
  }

  let root = null;
  function render() {
    if (!root) return;
    clear(root);
    root.appendChild(h("div", { class: "toolbar" }, [h("button", { class: "btn primary", type: "button", text: "Ordner laden…", onclick: () => P().pick(true) })]));
    if (!KINDS.some((k) => fileItem(k))) {
      root.appendChild(h("div", { class: "empty-state" }, [h("div", { class: "drop-title", text: "PDA-Editor" }), h("p", { text: "Lade den Ordner „PDA“ (Fraktionsleader.json, LonerSpawn.json) über den Knopf oben oder im Projekt-Tab. Änderungen werden in die JSON-Dateien zurückgeschrieben („Änderungen speichern“ oben rechts)." })]));
      return;
    }
    const layout = h("div", { class: "ov2 mp" });
    const nav = h("div", { class: "mp-nav" });
    nav.appendChild(h("div", { class: "nav-title", text: "PDA" }));
    [["factions", "Fraktionen"], ["loner", "Loner-Spawn"]].forEach(([k, l]) => nav.appendChild(h("button", { class: "mp-navbtn" + (st.view === k ? " active" : ""), type: "button", text: l, onclick: () => ((st.view = k), render()) })));
    layout.appendChild(nav);
    const content = h("div", { class: "mp-content" });
    layout.appendChild(content);
    root.appendChild(layout);
    content.appendChild(h("div", { class: "issue ok mp-note", text: "Für den PDA-Mod liegt keine Doku vor: Die „?“-Erklärungen sind aus den Wertenamen abgeleitet („vermutlich“ = nicht sicher). Klassennamen-Vorschläge und Slots erscheinen, wenn Vanilla-/Mod-Configs geladen sind." }));
    (st.view === "loner" ? renderLoner : renderFactions)(content);
  }

  function init(panel) {
    root = panel;
    P().registerSerializer(KINDS, K().stringify);
    render();
    return { refresh: render };
  }

  EQE.Pda = {
    init: init,
    KINDS: KINDS,
    openItem: (uid) => {
      const it = P().get(uid);
      if (it) st.view = it.kind === "pda_loner" ? "loner" : "factions";
      render();
    },
  };
})(window.EQE);
