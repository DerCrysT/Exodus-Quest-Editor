/**
 * Exodus Quest Editor – Trader-Editoren für XCP_Trader_V2:
 *   Trader (ein Eintrag der Traders_list.json), Handelskategorien (trader_category_list/*.json),
 *   Tauschkategorien (barter_category_list/*.json).
 */
window.EQE = window.EQE || {};

(function (EQE) {
  "use strict";
  const { h, clear, field, section, strList, listEditor } = EQE;

  const MODES = ["trader", "barter", "trader_barter"];
  const MODE_HELP = {
    trader: "Kauf und Verkauf (Handelskategorien).",
    barter: "Nur Tausch (Tauschkategorien).",
    trader_barter: "Handel und Tausch – der Spieler wählt beim Ansprechen.",
  };
  const POS_RE = /^-?\d+(\.\d+)?$/;

  // ============================================================== Trader
  const T = { data: null };
  let tPreview = () => {};

  function defaultTrader() {
    return {
      trader_id: "",
      classname: "XCP_Trader_Flach",
      trader_name: "",
      trader_mode: "trader",
      currency_id: "ruble",
      addition_price_buy: 0,
      addition_price_sell: 0,
      dialogue: "",
      equipment_items: [],
      pos: { x: 0, y: 0, z: 0 },
      ori: { x: 0, y: 0, z: 0 },
      category_list_trader: [],
      category_list_barter: [],
      faction_trader: 0,
      faction_name: "",
      banking: true,
      faction_banking: false,
    };
  }

  function traderFromJson(j) {
    const d = defaultTrader();
    ["trader_id", "classname", "trader_name", "trader_mode", "currency_id", "dialogue", "faction_name"].forEach((k) => {
      if (typeof j[k] === "string") d[k] = j[k];
    });
    ["addition_price_buy", "addition_price_sell", "faction_trader"].forEach((k) => {
      if (typeof j[k] === "number") d[k] = j[k];
    });
    d.equipment_items = (j.equipment_items || []).slice();
    d.category_list_trader = (j.category_list_trader || []).slice();
    d.category_list_barter = (j.category_list_barter || []).slice();
    if (Array.isArray(j.position)) d.pos = { x: j.position[0] || 0, y: j.position[1] || 0, z: j.position[2] || 0 };
    if (Array.isArray(j.orientation)) d.ori = { x: j.orientation[0] || 0, y: j.orientation[1] || 0, z: j.orientation[2] || 0 };
    d.banking = j.banking === undefined ? true : !!j.banking;
    d.faction_banking = !!j.faction_banking;
    return d;
  }

  function traderToJson(d) {
    const n = (v) => (typeof v === "number" && isFinite(v) ? v : 0);
    return {
      trader_id: d.trader_id || "",
      classname: d.classname || "",
      trader_name: d.trader_name || "",
      trader_mode: d.trader_mode || "trader",
      currency_id: d.currency_id || "",
      addition_price_buy: n(d.addition_price_buy),
      addition_price_sell: n(d.addition_price_sell),
      dialogue: d.dialogue || "",
      equipment_items: d.equipment_items.slice(),
      position: [n(d.pos.x), n(d.pos.y), n(d.pos.z)],
      orientation: [n(d.ori.x), n(d.ori.y), n(d.ori.z)],
      category_list_trader: d.category_list_trader.slice(),
      category_list_barter: d.category_list_barter.slice(),
      faction_trader: n(d.faction_trader),
      faction_name: d.faction_name || "",
      banking: d.banking ? 1 : 0,
      faction_banking: d.faction_banking ? 1 : 0,
    };
  }

  function currencyOptions() {
    const out = [];
    EQE.Project.byKind("tsettings").forEach((it) => (it.json.currency_list || []).forEach((c) => c && c.currency_id && out.push({ value: c.currency_id, label: c.currency_id + (c.currency_symbol ? " (" + c.currency_symbol + ")" : "") })));
    return out.length ? out : ["ruble"];
  }

  function npcsNear(d) {
    const out = [];
    EQE.Project.byKind("npc").forEach((n) => {
      const p = String(n.json.Position || "").trim().split(/\s+/).map(Number);
      if (p.length < 3 || p.some(isNaN)) return;
      const dist = Math.hypot(p[0] - d.pos.x, p[2] - d.pos.z);
      out.push({ npc: n, dist });
    });
    return out.sort((a, b) => a.dist - b.dist).slice(0, 4);
  }

  function buildTraderForm(d, ctx) {
    T.data = d;
    tPreview = ctx.changed;
    const form = ctx.form;
    const preview = tPreview;

    const modeHint = h("div", { class: "help", text: MODE_HELP[d.trader_mode] || "" });
    form.appendChild(
      section("Grunddaten", "Trader-ID, Name, Modus, Währung", [
        h("div", { class: "grid2" }, [
          field({ label: "trader_id", key: "trader_id", obj: d, type: "text", required: true, help: "Eindeutig, wird intern verwendet.", onChange: preview }),
          field({ label: "trader_name", key: "trader_name", obj: d, type: "text", required: true, help: "Anzeigename im Handelsfenster.", onChange: preview }),
        ]),
        h("div", { class: "grid2" }, [
          field({ label: "classname", key: "classname", obj: d, type: "text", required: true, help: "Klasse der Trader-Figur (z. B. XCP_Trader_Flach oder ein SurvivorM_…).", onChange: preview }),
          field({
            label: "trader_mode",
            key: "trader_mode",
            obj: d,
            type: "select",
            options: MODES,
            onChange: () => {
              modeHint.textContent = MODE_HELP[d.trader_mode] || "";
              preview();
            },
          }),
        ]),
        modeHint,
        h("div", { class: "grid3" }, [
          field({ label: "currency_id", key: "currency_id", obj: d, type: "text", datalist: currencyOptions, help: "Währung aus trader_main_setting.json.", onChange: preview }),
          field({ label: "addition_price_buy", key: "addition_price_buy", obj: d, type: "number", help: "Preisaufschlag beim Kauf (Zahl).", onChange: preview }),
          field({ label: "addition_price_sell", key: "addition_price_sell", obj: d, type: "number", help: "Preisaufschlag beim Verkauf.", onChange: preview }),
        ]),
        field({ label: "dialogue", key: "dialogue", obj: d, type: "text", help: "Optional: Dialog-Text des Trader-Mods. Leer = Handelsfenster öffnet direkt.", onChange: preview }),
      ])
    );

    // Position
    const near = h("div", { class: "help" });
    function updateNear() {
      const list = npcsNear(d);
      near.textContent = list.length
        ? "Nächste NPCs: " + list.map((x) => (x.npc.json.Name || EQE.Project.idOf(x.npc)) + " (" + x.dist.toFixed(1) + " m)").join(", ") + " – für @trade im Dialog sollte der Trader höchstens 8 m neben dem Dialog-NPC stehen."
        : "Keine NPCs mit Position im Projekt.";
    }
    updateNear();
    const npcSel = h("select", {}, [h("option", { value: "", text: "NPC wählen…" })].concat(EQE.Project.byKind("npc").map((n) => h("option", { value: n.uid, text: EQE.Project.labelOf(n) + (n.json.Name ? " – " + n.json.Name : "") }))));
    const posRow = h("div", { class: "grid3" });
    function drawPos() {
      clear(posRow);
      ["x", "y", "z"].forEach((k) =>
        posRow.appendChild(
          field({ label: "position " + k.toUpperCase(), key: k, obj: d.pos, type: "number", onChange: () => { updateNear(); preview(); } })
        )
      );
    }
    drawPos();
    form.appendChild(
      section("Position & Ausrichtung", "Wo der Trader steht", [
        posRow,
        h("div", { class: "assign-add" }, [
          npcSel,
          h("button", {
            class: "btn small",
            type: "button",
            text: "2 m neben diesen NPC setzen",
            onclick: () => {
              const it = EQE.Project.get(npcSel.value);
              if (!it) return;
              const p = String(it.json.Position || "").trim().split(/\s+/).map(Number);
              if (p.length < 3 || p.some(isNaN)) return EQE.toast("Der NPC hat keine gültige Position.", true);
              d.pos.x = p[0] + 2;
              d.pos.y = p[1];
              d.pos.z = p[2];
              drawPos();
              updateNear();
              preview();
            },
          }),
        ]),
        near,
        h("div", { class: "grid3" }, [
          field({ label: "orientation X (Yaw)", key: "x", obj: d.ori, type: "number", help: "Blickrichtung in Grad: 0 = Norden, 90 = Osten, 180 = Süden, 270 = Westen.", onChange: preview }),
          field({ label: "orientation Y", key: "y", obj: d.ori, type: "number", onChange: preview }),
          field({ label: "orientation Z", key: "z", obj: d.ori, type: "number", onChange: preview }),
        ]),
      ])
    );

    form.appendChild(
      section("Kategorien", "Welche Waren-/Tauschlisten der Trader anbietet", [
        h("div", { class: "field" }, [
          h("label", { text: "category_list_trader (Handel)" }),
          strList({ items: d.category_list_trader, placeholder: "Kategorie-ID + Enter", datalist: () => EQE.Project.options("tcat"), onChange: preview }),
          h("div", { class: "help", text: "Dateiname der Kategorie ohne .json (trader_category_list/<id>.json)." }),
        ]),
        h("div", { class: "field" }, [
          h("label", { text: "category_list_barter (Tausch)" }),
          strList({ items: d.category_list_barter, placeholder: "Kategorie-ID + Enter", datalist: () => EQE.Project.options("bcat"), onChange: preview }),
        ]),
      ])
    );

    form.appendChild(
      section(
        "Ausrüstung",
        "Kleidung/Items, die der Trader trägt",
        [h("div", { class: "field" }, [strList({ items: d.equipment_items, placeholder: "Klasse + Enter", onChange: preview })])],
        { collapsed: d.equipment_items.length === 0 }
      )
    );

    form.appendChild(
      section(
        "Bank & Fraktion",
        "",
        [
          h("div", { class: "grid2" }, [
            field({ label: "banking", key: "banking", obj: d, type: "bool", help: "Spielerbank an diesem Trader.", onChange: preview }),
            field({ label: "faction_banking", key: "faction_banking", obj: d, type: "bool", help: "Fraktionsbank an diesem Trader.", onChange: preview }),
          ]),
          h("div", { class: "grid2" }, [
            field({ label: "faction_trader", key: "faction_trader", obj: d, type: "number", help: "0 = für alle; sonst Fraktions-Trader.", onChange: preview }),
            field({ label: "faction_name", key: "faction_name", obj: d, type: "text", onChange: preview }),
          ]),
        ],
        { collapsed: true }
      )
    );
  }

  function validateTrader(d) {
    const issues = [];
    const err = (m) => issues.push({ level: "error", msg: m });
    const warn = (m) => issues.push({ level: "warn", msg: m });
    if (!d.trader_id) err("trader_id fehlt.");
    if (!d.trader_name) err("trader_name fehlt.");
    if (!d.classname) err("classname fehlt.");
    if (MODES.indexOf(d.trader_mode) < 0) err("trader_mode muss trader, barter oder trader_barter sein.");
    if (!d.currency_id) err("currency_id fehlt.");
    const needT = d.trader_mode === "trader" || d.trader_mode === "trader_barter";
    const needB = d.trader_mode === "barter" || d.trader_mode === "trader_barter";
    if (needT && !d.category_list_trader.length) warn("Modus '" + d.trader_mode + "' braucht Handelskategorien (category_list_trader) – sonst ist das Fenster leer.");
    if (needB && !d.category_list_barter.length) warn("Modus '" + d.trader_mode + "' braucht Tauschkategorien (category_list_barter).");
    if (d.pos.x === 0 && d.pos.y === 0 && d.pos.z === 0) warn("Position ist 0 0 0 – der Trader würde im Nichts stehen.");
    const dup = EQE.Project.byKind("trader").filter((t) => t.json.trader_id === d.trader_id).length;
    if (d.trader_id && dup > 1) err("trader_id '" + d.trader_id + "' kommt mehrfach im Projekt vor.");
    d.category_list_trader.concat(d.category_list_barter).forEach((c) => {
      if (/[\\/]/.test(c) || /\.json$/i.test(c)) err("Kategorie '" + c + "': nur den Dateinamen ohne Pfad und ohne .json angeben.");
    });
    return issues;
  }

  function initTrader(root) {
    return EQE.createEditor({
      kind: "trader",
      root,
      title: "Trader",
      defaultJson: () => {
        const d = defaultTrader();
        d.trader_id = EQE.Project.uniqueId("trader", "trader_new");
        d.trader_name = "Neuer Trader";
        return traderToJson(d);
      },
      fromJson: traderFromJson,
      toJson: traderToJson,
      buildForm: buildTraderForm,
      validate: validateTrader,
      status: (d) => (d.trader_id || "(ohne Id)") + " · " + d.trader_mode + " · " + d.category_list_trader.length + " Handels- / " + d.category_list_barter.length + " Tauschkat.",
    });
  }

  // ============================================================== Handelskategorie
  const C = { data: null };
  let cPreview = () => {};

  function defaultProduct(cls) {
    return { classname: cls || "", variable_items: [], buy_price: 0, sell_price: 0, quantity_buy: -1, quantity_sell: -1, count_product: -1, hidden_item: 0, daily_buy_limit: -1 };
  }

  function catFromJson(j, item) {
    return {
      _id: (item && item.fileId) || "",
      name_category: typeof j.name_category === "string" ? j.name_category : "",
      products: (j.products || []).map((p) => Object.assign(defaultProduct(), p, { variable_items: (p.variable_items || []).slice() })),
    };
  }
  function catToJson(d) {
    return {
      name_category: d.name_category || "",
      products: d.products.map((p) => ({
        classname: p.classname || "",
        variable_items: (p.variable_items || []).slice(),
        buy_price: Number(p.buy_price) || 0,
        sell_price: Number(p.sell_price) || 0,
        quantity_buy: p.quantity_buy === undefined ? -1 : Number(p.quantity_buy),
        quantity_sell: p.quantity_sell === undefined ? -1 : Number(p.quantity_sell),
        count_product: p.count_product === undefined ? -1 : Number(p.count_product),
        hidden_item: p.hidden_item ? 1 : 0,
        daily_buy_limit: p.daily_buy_limit === undefined ? -1 : Number(p.daily_buy_limit),
      })),
    };
  }

  const COLS = [
    { key: "classname", label: "Klasse", type: "text", w: 260, tip: "Classname des Items." },
    { key: "buy_price", label: "Kauf", type: "number", w: 80, tip: "Preis, den der Spieler beim Kauf zahlt." },
    { key: "sell_price", label: "Verkauf", type: "number", w: 80, tip: "Preis, den der Spieler beim Verkauf an den Trader bekommt." },
    { key: "quantity_buy", label: "Menge Kauf", type: "number", w: 80, tip: "Menge je gekauftem Item (z. B. Munition). -1 = Standard." },
    { key: "quantity_sell", label: "Menge Verk.", type: "number", w: 80, tip: "Mindestmenge/Menge beim Verkauf. -1 = Standard." },
    { key: "count_product", label: "Lager", type: "number", w: 70, tip: "Vorrat des Traders. -1 = unbegrenzt." },
    { key: "daily_buy_limit", label: "Tageslimit", type: "number", w: 70, tip: "Max. Käufe pro Spieler und Tag. -1 = kein Limit." },
    { key: "hidden_item", label: "Versteckt", type: "bool", w: 62, tip: "1 = im Angebot ausgeblendet." },
    { key: "variable_items", label: "Varianten", type: "csv", w: 170, tip: "Alternative Klassen (Komma-getrennt)." },
  ];

  function productsEditor(d) {
    const wrap = h("div", { class: "prod-editor" });
    let filter = "";
    const tbody = h("tbody");
    const count = h("span", { class: "help" });

    function rowFor(p, i) {
      const tr = h("tr");
      COLS.forEach((c) => {
        let input;
        if (c.type === "bool") {
          input = h("input", { type: "checkbox", checked: !!p.hidden_item, onchange: (e) => { p.hidden_item = e.target.checked ? 1 : 0; cPreview(); } });
        } else if (c.type === "csv") {
          input = h("input", { type: "text", oninput: (e) => { p.variable_items = EQE.splitCsv(e.target.value); cPreview(); } });
          input.value = (p.variable_items || []).join(", ");
        } else if (c.type === "number") {
          input = h("input", { type: "number", step: "any", oninput: (e) => { p[c.key] = e.target.value === "" ? 0 : Number(e.target.value); cPreview(); } });
          input.value = p[c.key];
        } else {
          input = h("input", { type: "text", oninput: (e) => { p[c.key] = e.target.value; cPreview(); } });
          input.value = p[c.key] || "";
        }
        tr.appendChild(h("td", {}, [input]));
      });
      tr.appendChild(h("td", {}, [h("button", { class: "btn icon small danger", type: "button", text: "✕", onclick: () => { d.products.splice(i, 1); renderRows(); cPreview(); } })]));
      return tr;
    }
    function renderRows() {
      clear(tbody);
      let shown = 0;
      d.products.forEach((p, i) => {
        if (filter && (p.classname || "").toLowerCase().indexOf(filter) < 0) return;
        tbody.appendChild(rowFor(p, i));
        shown++;
      });
      count.textContent = shown + " von " + d.products.length + " Produkt(en)";
    }

    const search = h("input", { type: "text", placeholder: "Filtern nach Klasse…", oninput: (e) => { filter = e.target.value.trim().toLowerCase(); renderRows(); } });
    const addBtn = h("button", { class: "btn small", type: "button", text: "+ Produkt", onclick: () => { d.products.push(defaultProduct()); filter = ""; search.value = ""; renderRows(); cPreview(); } });
    const bulkBtn = h("button", {
      class: "btn small",
      type: "button",
      text: "Klassen einfügen…",
      onclick: () => {
        const ta = h("textarea", { placeholder: "Eine Klasse pro Zeile (oder Komma-getrennt). Preise werden mit 0 angelegt." });
        const price = h("input", { type: "number", placeholder: "Kaufpreis für alle (optional)" });
        const go = h("button", {
          class: "btn primary",
          type: "button",
          text: "Hinzufügen",
          onclick: () => {
            const have = new Set(d.products.map((p) => p.classname));
            let added = 0;
            ta.value.split(/[\s,;]+/).forEach((c) => {
              if (!c || have.has(c)) return;
              const p = defaultProduct(c);
              if (price.value !== "") {
                p.buy_price = Number(price.value) || 0;
                p.sell_price = Math.round(p.buy_price * 0.5);
              }
              d.products.push(p);
              have.add(c);
              added++;
            });
            EQE.closeModal();
            renderRows();
            cPreview();
            EQE.toast(added + " Produkt(e) hinzugefügt.");
          },
        });
        EQE.openModal("Klassen einfügen", h("div", {}, [ta, h("div", { style: "margin-top:8px;display:flex;gap:8px;align-items:center" }, [price, go])]));
      },
    });
    const pct = h("input", { type: "number", value: "50", style: "width:70px" });
    const pctBtn = h("button", {
      class: "btn small",
      type: "button",
      text: "Verkauf = % vom Kauf (sichtbare)",
      title: "Setzt den Verkaufspreis aller sichtbaren Zeilen auf diesen Prozentsatz des Kaufpreises",
      onclick: () => {
        const f = Number(pct.value);
        if (!isFinite(f)) return;
        d.products.forEach((p) => {
          if (filter && (p.classname || "").toLowerCase().indexOf(filter) < 0) return;
          p.sell_price = Math.round((p.buy_price * f) / 100);
        });
        renderRows();
        cPreview();
      },
    });
    const mul = h("input", { type: "number", value: "1.2", step: "0.05", style: "width:70px" });
    const mulBtn = h("button", {
      class: "btn small",
      type: "button",
      text: "Preise × Faktor (sichtbare)",
      onclick: () => {
        const f = Number(mul.value);
        if (!isFinite(f) || f <= 0) return;
        d.products.forEach((p) => {
          if (filter && (p.classname || "").toLowerCase().indexOf(filter) < 0) return;
          p.buy_price = Math.round(p.buy_price * f);
          p.sell_price = Math.round(p.sell_price * f);
        });
        renderRows();
        cPreview();
      },
    });
    const head = h("tr", {}, COLS.map((c) => h("th", { title: c.tip, style: "min-width:" + c.w + "px", text: c.label })).concat([h("th")]));
    wrap.appendChild(h("div", { class: "toolbar" }, [search, addBtn, bulkBtn, h("span", { class: "spacer" }), pct, pctBtn, mul, mulBtn]));
    wrap.appendChild(count);
    wrap.appendChild(h("div", { class: "table-scroll" }, [h("table", { class: "ptable prod-table" }, [h("thead", {}, [head]), tbody])]));
    renderRows();
    return wrap;
  }

  function buildCatForm(d, ctx) {
    C.data = d;
    cPreview = ctx.changed;
    const preview = cPreview;
    ctx.form.appendChild(
      section("Kategorie", "", [
        h("div", { class: "grid2" }, [
          field({ label: "Kategorie-ID (Dateiname)", key: "_id", obj: d, type: "text", required: true, help: "So wird die Kategorie im Trader eingetragen (category_list_trader). Beim Umbenennen ziehen die Trader mit.", onChange: preview }),
          field({ label: "name_category", key: "name_category", obj: d, type: "text", help: "Anzeigename im Handelsfenster (auch Stringtable-Schlüssel).", onChange: preview }),
        ]),
        h("div", { class: "help", text: "Verwendet von: " + (EQE.Project.byKind("trader").filter((t) => (t.json.category_list_trader || []).indexOf(d._id) > -1).map((t) => EQE.Project.labelOf(t)).join(", ") || "keinem Trader") }),
      ])
    );
    ctx.form.appendChild(section("Produkte", "Preise, Mengen und Vorrat je Item", [productsEditor(d)]));
  }

  function validateCat(d) {
    const issues = [];
    const err = (m) => issues.push({ level: "error", msg: m });
    const warn = (m) => issues.push({ level: "warn", msg: m });
    if (!d._id) err("Kategorie-ID (Dateiname) fehlt.");
    if (/[\\/\s]/.test(d._id || "")) err("Kategorie-ID darf keine Leerzeichen oder Pfadzeichen enthalten.");
    if (!d.name_category) warn("name_category ist leer.");
    if (!d.products.length) warn("Keine Produkte.");
    const seen = new Set();
    d.products.forEach((p, i) => {
      if (!p.classname) err("Produkt #" + (i + 1) + ": classname fehlt.");
      else if (seen.has(p.classname)) warn("Klasse '" + p.classname + "' kommt mehrfach vor.");
      seen.add(p.classname);
      if (p.buy_price < 0 || p.sell_price < 0) err("Produkt '" + p.classname + "': Preise dürfen nicht negativ sein.");
      if (p.buy_price === 0 && p.sell_price === 0 && p.classname) warn("Produkt '" + p.classname + "': Kauf- und Verkaufspreis sind 0 – es erscheint nicht im Angebot.");
      if (p.buy_price > 0 && p.sell_price > p.buy_price) warn("Produkt '" + p.classname + "': Verkaufspreis ist höher als der Kaufpreis (Spieler könnte Gewinn durch Kaufen+Verkaufen machen).");
    });
    return issues;
  }

  function initTcat(root) {
    return EQE.createEditor({
      kind: "tcat",
      root,
      title: "Handelskategorie",
      idKey: "_id",
      metaId: true,
      defaultFileId: () => EQE.Project.uniqueId("tcat", "kategorie_neu"),
      defaultJson: () => ({ name_category: "Neue Kategorie", products: [] }),
      fromJson: catFromJson,
      toJson: catToJson,
      buildForm: buildCatForm,
      validate: validateCat,
      status: (d) => (d._id || "(ohne Id)") + " · " + d.products.length + " Produkt(e)",
    });
  }

  // ============================================================== Tauschkategorie
  const B = { data: null };
  let bPreview = () => {};

  function defaultStack(cls) {
    return { classname: cls || "", alt: [], count_items: 1, quantity_items: -1 };
  }
  function bFromJson(j, item) {
    const stacks = (arr, altKey) => (arr || []).map((s) => ({ classname: s.classname || "", alt: (s[altKey] || []).slice(), count_items: s.count_items === undefined ? 1 : s.count_items, quantity_items: s.quantity_items === undefined ? -1 : s.quantity_items }));
    return {
      _id: (item && item.fileId) || "",
      name_category: typeof j.name_category === "string" ? j.name_category : "",
      products: (j.products || []).map((r) => ({ received: stacks(r.received_classname, "alter_received"), required: stacks(r.required_classname, "alter_required") })),
    };
  }
  function bToJson(d) {
    const out = (arr, altKey) =>
      arr.map((s) => {
        const o = { classname: s.classname || "" };
        o[altKey] = s.alt.slice();
        o.count_items = Number(s.count_items) || 1;
        o.quantity_items = s.quantity_items === undefined ? -1 : Number(s.quantity_items);
        return o;
      });
    return {
      name_category: d.name_category || "",
      products: d.products.map((r) => ({ received_classname: out(r.received, "alter_received"), required_classname: out(r.required, "alter_required") })),
    };
  }

  function stackList(items, label, help) {
    return h("div", { class: "field" }, [
      h("label", { text: label }),
      listEditor({
        items,
        makeItem: () => defaultStack(),
        title: (s) => (s.count_items || 1) + "× " + (s.classname || "(Klasse)"),
        addLabel: "+ Item",
        emptyLabel: help,
        renderCard: (s, i, api) => [
          h("div", { class: "grid3" }, [
            field({ label: "classname", key: "classname", obj: s, type: "text", required: true, onChange: () => { api.refreshTitle(); bPreview(); } }),
            field({ label: "count_items", key: "count_items", obj: s, type: "number", onChange: () => { api.refreshTitle(); bPreview(); } }),
            field({ label: "quantity_items", key: "quantity_items", obj: s, type: "number", help: "-1 = Standard.", onChange: bPreview }),
          ]),
          h("div", { class: "field" }, [h("label", { text: "Alternativ-Klassen (zählen gleichwertig)" }), strList({ items: s.alt, placeholder: "Klasse + Enter", onChange: bPreview })]),
        ],
        onChange: bPreview,
      }),
    ]);
  }

  function buildBarterForm(d, ctx) {
    B.data = d;
    bPreview = ctx.changed;
    const preview = bPreview;
    ctx.form.appendChild(
      section("Kategorie", "", [
        h("div", { class: "grid2" }, [
          field({ label: "Kategorie-ID (Dateiname)", key: "_id", obj: d, type: "text", required: true, help: "So wird die Kategorie im Trader eingetragen (category_list_barter).", onChange: preview }),
          field({ label: "name_category", key: "name_category", obj: d, type: "text", onChange: preview }),
        ]),
      ])
    );
    ctx.form.appendChild(
      section("Tauschrezepte", "Der Spieler gibt die geforderten Items ab und erhält die Belohnung", [
        listEditor({
          items: d.products,
          makeItem: () => ({ received: [defaultStack()], required: [defaultStack()] }),
          title: (r, i) => "#" + (i + 1) + "  " + r.required.map((s) => (s.count_items || 1) + "× " + (s.classname || "?")).join(" + ") + "  →  " + r.received.map((s) => (s.count_items || 1) + "× " + (s.classname || "?")).join(" + "),
          addLabel: "+ Rezept hinzufügen",
          emptyLabel: "Noch keine Rezepte.",
          renderCard: (r) => [stackList(r.required, "Gefordert (required_classname)", "Nichts gefordert."), stackList(r.received, "Erhalten (received_classname)", "Nichts erhalten.")],
          onChange: preview,
        }),
      ])
    );
  }

  function validateBarter(d) {
    const issues = [];
    const err = (m) => issues.push({ level: "error", msg: m });
    const warn = (m) => issues.push({ level: "warn", msg: m });
    if (!d._id) err("Kategorie-ID (Dateiname) fehlt.");
    if (/[\\/\s]/.test(d._id || "")) err("Kategorie-ID darf keine Leerzeichen oder Pfadzeichen enthalten.");
    if (!d.products.length) warn("Keine Rezepte.");
    d.products.forEach((r, i) => {
      if (!r.required.length) err("Rezept #" + (i + 1) + ": nichts gefordert.");
      if (!r.received.length) err("Rezept #" + (i + 1) + ": nichts als Belohnung.");
      r.required.concat(r.received).forEach((s) => {
        if (!s.classname) err("Rezept #" + (i + 1) + ": ein Item ohne classname.");
        if ((Number(s.count_items) || 0) < 1) warn("Rezept #" + (i + 1) + ": count_items von '" + s.classname + "' ist kleiner als 1.");
      });
    });
    return issues;
  }

  function initBcat(root) {
    return EQE.createEditor({
      kind: "bcat",
      root,
      title: "Tauschkategorie",
      idKey: "_id",
      metaId: true,
      defaultFileId: () => EQE.Project.uniqueId("bcat", "tausch_neu"),
      defaultJson: () => ({ name_category: "Neuer Tausch", products: [] }),
      fromJson: bFromJson,
      toJson: bToJson,
      buildForm: buildBarterForm,
      validate: validateBarter,
      status: (d) => (d._id || "(ohne Id)") + " · " + d.products.length + " Rezept(e)",
    });
  }

  EQE.Trader = { initTrader, initTcat, initBcat };
})(window.EQE);
