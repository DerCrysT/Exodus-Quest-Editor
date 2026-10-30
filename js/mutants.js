/**
 * Exodus Quest Editor – Mutanten-Editor (XCP_SFP_Mutanten_HP): je Mutant drei Varianten XCP_T1/T2/T3_<Klasse>
 * mit eigenen Lebenspunkten und Beute (Skinning). Liest die Configs aus der PBO (config.bin) oder dem Quellordner
 * und schreibt geänderte Configs als config.cpp-Quellordner zurück (die PBO wird danach von Hand gepackt).
 */
(function (EQE) {
  "use strict";
  const h = EQE.h;
  const clear = EQE.clear;
  const C = () => EQE.CfgEdit;
  const K = () => EQE.MPKit;
  const P = () => EQE.Project;
  const tipNode = (t) => K().tipNode(t);

  const SRC_RE = /XCP_SFP_Mutanten_HP\/[^/]+\/config\.(bin|cpp)$/i;
  const HP_PATH = "DamageSystem/GlobalHealth/Health";
  const TIERS = ["1", "2", "3"];

  const st = {
    view: { type: "overview" },
    fam: "",
    sel: "", // Schlüssel der gewählten Variante
    tier: "1",
    search: "",
    dmg: 50, // eigener Schaden pro Treffer (nur bei weapon = "custom")
    weapon: "ar",
    f2: 1.4,
    f3: 2,
    d2: 1,
    d3: 1,
    scope: "fam",
  };

  // ---------------------------------------------------------------- Daten
  function families() {
    const out = [];
    C()
      .list(SRC_RE)
      .forEach((m) => {
        const v = C().child(m.root, "CfgVehicles");
        if (!v) return;
        const byKey = {};
        v.children.forEach((c) => {
          const mm = /^XCP_T([123])_(.+)$/.exec(c.name);
          if (!mm || c.forward) return;
          const o = byKey[mm[2]] || (byKey[mm[2]] = { key: mm[2], model: m, tiers: {} });
          o.tiers[mm[1]] = c;
        });
        const vars = Object.keys(byKey).map((k) => byKey[k]);
        if (!vars.length) return;
        const fm = /XCP_SFP_Mutanten_HP\/([^/]+)\//i.exec(m.path);
        const id = fm ? fm[1] : m.path;
        out.push({ id: id, label: id.replace(/^SFP_/, ""), model: m, vars: vars });
      });
    return out;
  }
  const famById = (id) => families().find((f) => f.id === id) || null;

  /** Lebenspunkte einer Stufe (erbt von T1, wenn die Stufe nichts setzt). */
  function hpOf(v, tier) {
    const own = v.tiers[tier] ? C().getNum(C().find(v.tiers[tier], HP_PATH), "hitpoints") : NaN;
    if (Number.isFinite(own)) return own;
    if (tier !== "1" && v.tiers["1"]) {
      const t1 = C().getNum(C().find(v.tiers["1"], HP_PATH), "hitpoints");
      if (Number.isFinite(t1)) return t1;
    }
    return globalHp(v, tier);
  }
  function setHp(v, tier, val) {
    const node = v.tiers[tier];
    if (!node) return;
    C().setNum(C().ensure(node, HP_PATH), "hitpoints", val);
    touch();
  }
  function touch() {
    P().notify && P().notify();
  }
  const fmt = (n, d) => K().fmt(n, d);

  // ---------------------------------------------------------------- Rechnung
  // Leben-Schaden pro Schuss laut Vanilla-DayZ-Dateien (CfgAmmo > DamageApplied > Health > damage, aus den installierten DayZ-Dateien gelesen)
  const WEAPONS = [
    { k: "pistol", label: "Pistole", ex: "CZ75 · 9×19 mm", dmg: 40, note: "Bullet_9x19 = 40 (.45 ACP der FNX45 ebenfalls 40; .357 Magnum 65)" },
    { k: "smg", label: "SMG", ex: "MP5-K · 9×19 mm", dmg: 40, note: "Bullet_9x19 = 40 je Kugel (UMP45 .45 ACP ebenfalls 40) – der Vorteil der SMG ist die Feuerrate, nicht der Schaden" },
    { k: "shotgun", label: "Schrotflinte", ex: "Saiga/Izh-43 · 12er Schrot", dmg: 280, note: "Bullet_12GaugePellets: 8 Schrotkugeln × 35 = 280, aber nur bei Nähe/allen Treffern (Streuung!); Posten-Patrone (Slug) = 110" },
    { k: "ar", label: "Sturmgewehr", ex: "M4A1 · 5,56×45 mm", dmg: 110, note: "Bullet_556x45 = 110 (AKM 7,62×39 = 110, AK-74 5,45×39 = 115, .308/7,62×54 = 150)" },
  ];
  function dmgOf(w) {
    const x = WEAPONS.find((e) => e.k === (w || st.weapon));
    return x ? x.dmg : st.dmg;
  }
  function hitsTo(hp, w) {
    const d = dmgOf(w);
    return Number.isFinite(hp) && d > 0 ? Math.ceil(hp / d) : NaN;
  }

  function renderOverview(box) {
    const fams = families();
    box.appendChild(head("Übersicht", "Alle Mutanten-Familien mit ihren Lebenspunkten je Stufe. Klick auf eine Familie öffnet sie."));
    const body = h("tbody");
    fams.forEach((f) => {
      const cols = TIERS.map((t) => {
        const hs = f.vars.map((v) => hpOf(v, t)).filter(Number.isFinite);
        return hs.length ? (Math.min.apply(null, hs) === Math.max.apply(null, hs) ? fmt(hs[0], 0) : fmt(Math.min.apply(null, hs), 0) + " – " + fmt(Math.max.apply(null, hs), 0)) : "–";
      });
      body.appendChild(
        h("tr", {}, [
          h("td", {}, [h("button", { class: "linklike", type: "button", text: f.label, onclick: () => ((st.fam = f.id), (st.view = { type: "fam" }), (st.sel = ""), render()) })]),
          h("td", { text: String(f.vars.length) }),
        ].concat(cols.map((c) => h("td", { text: c })), [h("td", { text: C().isChanged(f.model) ? "geändert" : "" })]))
      );
    });
    box.appendChild(h("div", { class: "table-scroll" }, [h("table", { class: "ptable prod-table" }, [h("thead", {}, [h("tr", {}, ["Familie", "Varianten", "T1 HP", "T2 HP", "T3 HP", ""].map((t) => h("th", { text: t })))]), body])]));
    box.appendChild(h("div", { class: "muted small", text: "Rüstung (Trefferzonen) und Schaden der Angriffe zeigt der Editor aus den Original-SFP-PBOs an (SFP.pbo, SFP2.pbo, SFP3.pbo zusätzlich laden; für Vanilla-Nahkampf-Ammo auch weapons_melee.pbo aus DayZ/addons). Änderungen werden in die Override-Config der Stufe geschrieben." }));
  }

  function assumeBar(redraw) {
    const custom = h("input", { type: "number", min: "1", step: "any", value: st.dmg, style: "max-width:110px", disabled: st.weapon !== "custom", oninput: (e) => (Number(e.target.value) > 0 && ((st.dmg = Number(e.target.value)), redraw())) });
    return h("div", { class: "toolbar mp-assume" }, [
      h("div", { class: "field" }, [
        h("label", {}, ["Waffentyp für „Treffer“", tipNode("Welche Waffe die Spalte „Treffer“ rechnet. Die Werte stammen aus den Vanilla-DayZ-Dateien (Leben-Schaden pro Kugel); Waffe und Munition sind stark vereinfacht auf den Waffentyp heruntergebrochen. Nicht eingerechnet: Trefferzone (Kopf/Körper), Entfernung, Rüstung der Mutanten und Mod-Waffen mit eigenen Werten. Nur Anzeige.")]),
        h("select", { onchange: (e) => ((st.weapon = e.target.value), redraw && render()) }, WEAPONS.map((w) => h("option", { value: w.k, text: w.label + " (" + w.dmg + ")", selected: st.weapon === w.k })).concat([h("option", { value: "custom", text: "Eigener Wert", selected: st.weapon === "custom" })])),
      ]),
      h("div", { class: "field" }, [h("label", {}, ["Eigener Schaden", tipNode("Nur aktiv bei „Eigener Wert“: Leben-Schaden pro Treffer, z. B. für eine Mod-Waffe.")]), custom]),
      h("span", { class: "muted small", text: "Annahme für die Live-Rechnung – wird nicht in die Datei geschrieben." }),
    ]);
  }

  function renderFamily(box) {
    const fams = families();
    const f = fams.find((x) => x.id === st.fam) || fams[0];
    if (!f) return;
    st.fam = f.id;
    box.appendChild(head(f.label, "Die drei Stärke-Stufen jeder Mutanten-Variante: T1 ist die Basis, T2 und T3 sind stärkere Klone mit eigenem Klassennamen (XCP_T1_/XCP_T2_/XCP_T3_ + Originalklasse). Lebenspunkte direkt in der Tabelle ändern; Klick auf einen Namen öffnet Details und Beute.", f.model.path.split("/").slice(-3).join("/") + " · " + f.vars.length + " Varianten" + (C().isChanged(f.model) ? " · geändert" : "")));
    const tableHost = h("div", {});
    const draw = () => {
      clear(tableHost);
      const body = h("tbody");
      f.vars.forEach((v) => {
        const hp = TIERS.map((t) => hpOf(v, t));
        const inputs = TIERS.map((t) => {
          if (!v.tiers[t]) return h("td", { text: "–" });
          const own = Number.isFinite(C().getNum(C().find(v.tiers[t], HP_PATH), "hitpoints"));
          const inp = h("input", { type: "number", step: "1", min: "1", value: Number.isFinite(hp[+t - 1]) ? hp[+t - 1] : "", placeholder: "erbt", style: "width:90px", title: own ? "" : "Diese Stufe setzt keine eigenen Lebenspunkte und erbt sie" });
          inp.addEventListener("input", () => {
            const n = Number(inp.value);
            if (inp.value.trim() === "" || !Number.isFinite(n) || n < 1) return;
            setHp(v, t, Math.round(n));
            updateCalc();
          });
          return h("td", {}, [inp]);
        });
        const calcCells = h("td", { class: "small" });
        const ratioCell = h("td", { class: "small" });
        const rowUpdate = () => {
          const a = TIERS.map((t) => hpOf(v, t));
          calcCells.textContent = a.map((x) => fmt(hitsTo(x), 0)).join(" / ");
          ratioCell.textContent = Number.isFinite(a[0]) && a[0] > 0 ? "×" + fmt(a[1] / a[0], 2) + " / ×" + fmt(a[2] / a[0], 2) : "–";
        };
        rowUpdate();
        v.__update = rowUpdate;
        body.appendChild(
          h("tr", { class: st.sel === v.key ? "row-sel" : "" }, [
            h("td", {}, [h("button", { class: "linklike", type: "button", text: v.key.replace(/^SFP_/, ""), title: v.key, onclick: () => ((st.sel = v.key), render()) })]),
          ].concat(inputs, [ratioCell, calcCells]))
        );
      });
      tableHost.appendChild(h("div", { class: "table-scroll" }, [h("table", { class: "ptable prod-table" }, [h("thead", {}, [h("tr", {}, ["Variante", "T1 HP", "T2 HP", "T3 HP", "T2 / T3 vs. T1", "Treffer T1 / T2 / T3"].map((t) => h("th", { text: t })))]), body])]));
    };
    const updateCalc = () => f.vars.forEach((v) => v.__update && v.__update());
    box.appendChild(assumeBar(updateCalc));
    draw();
    box.appendChild(tableHost);
    const v = f.vars.find((x) => x.key === st.sel);
    if (v) renderVariant(box, f, v);
  }

  function field(label, tip, input) {
    return h("div", { class: "field" }, [h("label", {}, [label, tipNode(tip)]), input]);
  }
  function numField(node, path, name, label, tip, isInt) {
    const target = () => C().ensure(node, path);
    const cur = C().getNum(C().find(node, path), name);
    const inp = h("input", { type: "number", step: isInt ? "1" : "any", value: Number.isFinite(cur) ? cur : "", placeholder: "erbt" });
    inp.addEventListener("input", () => {
      const n = Number(inp.value);
      if (inp.value.trim() === "" || !Number.isFinite(n)) return;
      C().setNum(target(), name, isInt ? Math.round(n) : n);
      touch();
    });
    return field(label, tip, inp);
  }

  /** Formular: neues Beute-Teil im Skinning-Block dieser Stufe anlegen. */
  function addLootForm(node) {
    const listId = EQE.uid();
    const names = K().classSuggest("CfgVehicles");
    const item = h("input", { type: "text", placeholder: "Klassenname, z. B. Bone", list: listId, style: "min-width:200px" });
    const count = h("input", { type: "number", min: "1", step: "1", value: 1, style: "width:70px" });
    const qmin = h("input", { type: "number", min: "0", step: "any", value: 0.5, style: "width:70px" });
    const qmax = h("input", { type: "number", min: "0", step: "any", value: 1, style: "width:70px" });
    const add = () => {
      const cls = item.value.trim();
      if (!cls) return EQE.toast("Bitte einen Klassennamen für den Gegenstand eingeben.", true);
      const sk = C().ensure(node, "Skinning");
      const base = "Obtained" + cls.replace(/[^A-Za-z0-9]/g, "");
      let name = base;
      for (let i = 2; sk.children.some((c) => c.name.toLowerCase() === name.toLowerCase()); i++) name = base + i;
      const part = C().ensure(sk, name);
      C().setRaw(part, "item", C().quote(cls));
      C().setNum(part, "count", Math.max(1, Math.round(Number(count.value) || 1)));
      const lo = Number(qmin.value);
      const hi = Number(qmax.value);
      C().setArr(part, "quantityMinMaxCoef", [Number.isFinite(lo) ? lo : 0, Number.isFinite(hi) ? hi : 1]);
      touch();
      render();
    };
    return h("div", { class: "toolbar" }, [
      h("span", { class: "muted small", text: "Neues Teil:" }),
      item,
      names.length ? h("datalist", { id: listId }, names.slice(0, 5000).map((n) => h("option", { value: n }))) : null,
      h("label", { class: "small" }, ["Anzahl ", count, tipNode("Wie viele Stücke dieses Gegenstands beim Ausnehmen entstehen.")]),
      h("label", { class: "small" }, ["Menge min/max ", qmin, " – ", qmax, tipNode("Anteil der Maximalmenge pro Stück (0 bis 1); bei Fleisch/Fett z. B. 0,5 bis 1 = halbe bis volle Portion. Bei Gegenständen ohne Menge egal.")]),
      h("button", { class: "btn small primary", type: "button", text: "Hinzufügen", onclick: add }),
    ]);
  }

  function renderVariant(box, f, v) {
    const tabs = h("div", { class: "toolbar" }, TIERS.filter((t) => v.tiers[t]).map((t) => h("button", { class: "btn small" + (st.tier === t ? " primary" : ""), type: "button", text: "Stufe T" + t, onclick: () => ((st.tier = t), render()) })));
    if (!v.tiers[st.tier]) st.tier = TIERS.find((t) => v.tiers[t]) || "1";
    const node = v.tiers[st.tier];
    const t1 = v.tiers["1"];
    const grid = h("div", { class: "grid2" }, [
      numField(node, HP_PATH, "hitpoints", "Lebenspunkte", "Wie viel Schaden der Mutant aushält, bevor er stirbt. Tabelle oben zeigt, wie viele Treffer das ungefähr sind.", true),
      numField(node, "DamageSystem/GlobalHealth/Blood", "hitpoints", "Blut-Punkte", "Vermutlich der Blut-Pool des Mutanten (sehr kleine Werte wie 5 lassen Blutschaden praktisch wirkungslos bzw. sofort tödlich werden – laut Config-Werten der Mod unverändert lassen, wenn unsicher).", true),
      numField(node, "DamageSystem/GlobalHealth/Shock", "hitpoints", "Schock-Punkte", "Vermutlich der Schock-Pool (Betäubung durch Schock-Schaden). Sehr kleine Werte = fast immun gegen Schock-Wirkung bzw. sofortige Wirkung – unverändert lassen, wenn unsicher.", true),
    ]);
    const lab = C().getArr(C().find(node, HP_PATH), "healthLabels");
    if (lab) grid.appendChild(field("Gesundheits-Stufen", "Prozentstufen für die Zustands-Anzeige (1 = unversehrt … 0 = tot). Normalerweise unverändert lassen.", h("input", { type: "text", value: lab.join(", "), oninput: (e) => (C().setArr(C().ensure(node, HP_PATH), "healthLabels", e.target.value.split(",").map((x) => x.trim()).filter((x) => x !== "")), touch()) })));
    const sk = C().find(node, "Skinning") || (st.tier !== "1" && t1 ? C().find(t1, "Skinning") : null);
    const inherited = !C().find(node, "Skinning") && !!sk;
    const sBody = h("tbody");
    if (sk) {
      sk.children
        .filter((c) => !c.forward)
        .forEach((c) => {
          const cnt = C().getNum(c, "count");
          const mm = C().getArr(c, "quantityMinMaxCoef");
          const q = mm ? mm.map(Number).filter(Number.isFinite) : [];
          const avg = q.length ? q.reduce((a, b) => a + b, 0) / q.length : C().getNum(c, "quantityCoef");
          sBody.appendChild(
            h("tr", {}, [
              h("td", { class: "mono small", text: c.name.replace(/^Obtained/, "") }),
              h("td", {}, [h("input", { type: "text", value: C().getStr(c, "item"), oninput: (e) => (C().setRaw(c, "item", C().quote(e.target.value)), touch()), disabled: inherited })]),
              h("td", {}, [h("input", { type: "number", step: "1", min: "0", value: Number.isFinite(cnt) ? cnt : "", style: "width:70px", disabled: inherited, oninput: (e) => (e.target.value !== "" && (C().setNum(c, "count", Math.round(Number(e.target.value))), touch())) })]),
              h("td", {}, [h("input", { type: "text", value: mm ? mm.join(", ") : "", style: "width:100px", placeholder: "min, max", disabled: inherited || !mm, oninput: (e) => (C().setArr(c, "quantityMinMaxCoef", e.target.value.split(",").map((x) => x.trim()).filter((x) => x !== "")), touch()) })]),
              h("td", { class: "small muted", text: cnt === 0 ? "entfernt (Anzahl 0)" : Number.isFinite(avg) && Number.isFinite(cnt) ? "Ø " + fmt(cnt * avg, 2) + " Einheiten gesamt" : "" }),
              h("td", {}, [h("button", { class: "btn icon small", type: "button", text: "✕", disabled: inherited, title: "Entfernen: setzt die Anzahl auf 0, der Mutant liefert dieses Teil nicht mehr (die Klasse bleibt, damit nichts aus der Basisklasse durchkommt)", onclick: () => (C().setNum(c, "count", 0), touch(), render()) })]),
            ])
          );
        });
    }
    box.appendChild(
      h("div", { class: "section" }, [
        h("div", { class: "section-head", text: v.key + " · Stufe T" + st.tier }),
        h("div", { class: "section-body" }, [
          tabs,
          h("div", { class: "mono muted small", text: node.name + (node.base ? " : " + node.base : "") }),
          grid,
          h("h4", { text: "Treffer bis zum Tod je Waffentyp" }),
          h("div", { class: "table-scroll" }, [
            h("table", { class: "ptable prod-table" }, [
              h("thead", {}, [h("tr", {}, ["Waffentyp", "Schaden/Schuss"].concat(TIERS.map((t) => "T" + t + " (" + fmt(hpOf(v, t), 0) + " HP)"), ["Quelle (Vanilla)"]).map((t) => h("th", { text: t })))]),
              h("tbody", {}, WEAPONS.map((w) => h("tr", {}, [h("td", { text: w.label + " – " + w.ex }), h("td", { text: String(w.dmg) })].concat(TIERS.map((t) => h("td", { text: v.tiers[t] ? fmt(hitsTo(hpOf(v, t), w.k), 0) + " Schuss" : "–" })), [h("td", { class: "small muted", text: w.note })])))),
            ]),
          ]),
          h("div", { class: "help", text: "Schuss = ein Treffer mit voller Wirkung auf den Mutanten (ohne Trefferzonen-Faktor, ohne Rüstung). Bei der Schrotflinte zählen alle 8 Schrotkugeln." }),
          h("h4", { text: "Beute beim Ausnehmen" }),
          sk ? null : h("div", { class: "muted small", text: "Diese Variante definiert keine Beute (erbt sie von der Originalklasse)." }),
          inherited
            ? h("div", { class: "issue ok" }, [
                "Die Beute dieser Stufe wird von T1 geerbt. Um sie nur für T" + st.tier + " zu ändern, muss der Skinning-Block in die Config dieser Stufe geschrieben werden: ",
                h("button", { class: "btn small", type: "button", text: "Eigenen Beute-Block für T" + st.tier + " anlegen (Kopie von T1)", onclick: () => ((node.children = node.children.filter((c) => c.name.toLowerCase() !== "skinning").concat([JSON.parse(JSON.stringify(sk))])), touch(), render()) }),
              ])
            : null,
          !inherited && sk && st.tier !== "1" && t1 && C().find(t1, "Skinning")
            ? h("div", { class: "toolbar" }, [h("button", { class: "btn small", type: "button", text: "Eigenen Block entfernen (wieder von T1 erben)", onclick: () => ((node.children = node.children.filter((c) => c.name.toLowerCase() !== "skinning")), touch(), render()) })])
            : null,
          sk ? h("div", { class: "table-scroll" }, [h("table", { class: "ptable prod-table" }, [h("thead", {}, [h("tr", {}, ["Teil", "Gegenstand", "Anzahl", "Menge min/max (Faktor)", "Erwartung", ""].map((t) => h("th", { text: t })))]), sBody])]) : null,
          !inherited ? addLootForm(node) : null,
          sk && !inherited ? h("div", { class: "help", text: "Entfernen setzt die Anzahl auf 0. Bei Stufen mit eigenem Block gilt das nur für diese Stufe – Teile, die der Block nicht aufführt, kommen weiterhin von der Basisklasse (T1)." }) : null,
        ]),
      ])
    );
    renderArmor(box, v);
    renderAttacks(box, v);
  }

  // ---------------------------------------------------------------- Original-Werte (Registry) + Override
  const lcs = (s) => String(s).toLowerCase();
  const unq = (s) => String(s).trim().replace(/^"(.*)"$/, "$1");
  const origNode = (v) => TIERS.map((t) => v.tiers[t]).find((n) => n && n.base && !/^XCP_T\d_/.test(n.base)) || null;
  function origEntry(v) {
    const n = origNode(v);
    return n && EQE.Cfg ? EQE.Cfg.getEntry("CfgVehicles", n.base) : null;
  }
  function parentTier(v, t) {
    const n = v.tiers[t];
    const m = n && /^XCP_T(\d)_/.exec(n.base || "");
    return m && v.tiers[m[1]] ? m[1] : null;
  }
  function ownProp(node, path) {
    const i = path.lastIndexOf("/");
    const n = i < 0 ? node : C().find(node, path.slice(0, i));
    return n ? C().prop(n, path.slice(i + 1)) : null;
  }
  /** Wert einer Eigenschaft für eine Stufe: eigene Config, dann Eltern-Stufe (T1), dann Original aus der Registry. {raw, items, src} oder null. */
  function valOf(v, tier, path) {
    let t = tier;
    const seen = {};
    while (t && !seen[t]) {
      seen[t] = 1;
      const p = v.tiers[t] ? ownProp(v.tiers[t], path) : null;
      if (p) return { raw: p.raw, items: p.items, array: p.array, src: "T" + t };
      t = parentTier(v, t);
    }
    const e = origEntry(v);
    const o = e ? EQE.Cfg.effProp(e, path) : null;
    return o ? { raw: o.raw, items: o.items, array: o.array, src: "Original" } : null;
  }
  function numVal(v, tier, path) {
    const x = valOf(v, tier, path);
    const n = x && !x.array ? Number(x.raw) : NaN;
    return Number.isFinite(n) ? n : NaN;
  }
  const globalHp = (v, t) => numVal(v, t, HP_PATH + "/hitpoints");

  /** Alle Pfade (Original + Override) unterhalb von prefix, die auf re passen -> Set der erfassten Gruppen */
  function collectKeys(v, tier, re) {
    const out = [];
    const e = origEntry(v);
    if (e) EQE.Cfg.effective(e).forEach((val) => re.test(val.path) && out.push(val.path));
    let t = tier;
    const seen = {};
    while (t && !seen[t]) {
      seen[t] = 1;
      (function walk(n, p) {
        (n.props || []).forEach((q) => re.test(p + q.name) && out.push(p + q.name));
        (n.children || []).forEach((c) => walk(c, p + c.name + "/"));
      })(v.tiers[t], "");
      t = parentTier(v, t);
    }
    return out;
  }

  // ---------------------------------------------------------------- Rüstung
  function renderArmor(box, v) {
    const tier = st.tier;
    const node = v.tiers[tier];
    const keys = collectKeys(v, tier, /^DamageSystem\/DamageZones\/[^/]+\/ArmorType\/[^/]+\/Health\/damage$/i);
    const zones = [];
    const types = [];
    keys.forEach((k) => {
      const m = /^DamageSystem\/DamageZones\/([^/]+)\/ArmorType\/([^/]+)\//i.exec(k);
      if (!zones.some((z) => lcs(z) === lcs(m[1]))) zones.push(m[1]);
      if (!types.some((x) => lcs(x) === lcs(m[2]))) types.push(m[2]);
    });
    types.sort((a, b) => (lcs(a) === "projectile" ? -1 : lcs(b) === "projectile" ? 1 : a.localeCompare(b)));
    const body = h("tbody");
    const hp = globalHp(v, tier);
    const cells = [];
    const updateHits = () => cells.forEach((fn) => fn());
    zones.forEach((z) => {
      const base = "DamageSystem/DamageZones/" + z + "/";
      const tc = numVal(v, tier, base + "Health/transferToGlobalCoef");
      const hitsCell = h("td", { class: "small" });
      cells.push(() => {
        const a = numVal(v, tier, base + "ArmorType/Projectile/Health/damage");
        const d = dmgOf();
        const eff = d * (Number.isFinite(a) ? a : 1) * (Number.isFinite(tc) ? tc : 1);
        hitsCell.textContent = hp > 0 && eff > 0 ? fmt(Math.ceil(hp / eff), 0) + " Schuss" : "–";
      });
      body.appendChild(
        h("tr", {}, [h("td", { text: z })].concat(
          types.map((ty) => {
            const path = base + "ArmorType/" + ty + "/Health/damage";
            const cur = valOf(v, tier, path);
            const own = ownProp(node, path);
            const inp = h("input", { type: "number", step: "any", min: "0", value: cur ? Number(cur.raw) : "", placeholder: "–", style: "width:80px", title: cur ? "Quelle: " + cur.src : "nicht definiert" });
            if (own) inp.classList.add("ov2-changed-input");
            inp.addEventListener("input", () => {
              const n = Number(inp.value);
              if (inp.value.trim() === "" || !Number.isFinite(n) || n < 0) return;
              C().setNum(C().ensure(node, path.replace(/\/damage$/, "")), "damage", n);
              inp.classList.add("ov2-changed-input");
              touch();
              updateHits();
            });
            return h("td", {}, [inp]);
          }),
          [h("td", { class: "small muted", text: Number.isFinite(tc) ? fmt(tc, 2) : "–" }), hitsCell]
        ))
      );
    });
    updateHits();
    box.appendChild(
      h("div", { class: "section" }, [
        h("div", { class: "section-head" }, ["Rüstung (Trefferzonen) · Stufe T" + tier, tipNode("Schadens-Faktor je Trefferzone und Schadensart: 1 = voller Schaden, 0,1 = nur 10 % (stark gepanzert), 2 = doppelter Schaden (Schwachstelle). Werte aus der Original-Config (SFP-PBO); geänderte Werte schreibt der Editor in die Config dieser Stufe. Leere Zellen = Zone/Art ist nicht definiert.")]),
        h("div", { class: "section-body" }, [
          zones.length
            ? h("div", { class: "table-scroll" }, [h("table", { class: "ptable prod-table" }, [h("thead", {}, [h("tr", {}, ["Zone"].concat(types.map((t) => t + "-Faktor"), ["Anteil → Gesamt-Leben", "Schuss bis tot (nur diese Zone)"]).map((t) => h("th", { text: t })))]), body])])
            : h("div", { class: "issue warn", text: "Keine Trefferzonen gefunden. Lade die SFP-PBOs (SFP.pbo, SFP2.pbo, SFP3.pbo) zusätzlich, damit die Original-Werte angezeigt werden können." }),
          zones.length ? h("div", { class: "help", text: "Orange Felder sind in der Config dieser Stufe gesetzt, die übrigen stammen aus dem Original/T1. „Schuss bis tot“ = Gesamt-Leben ÷ (Waffenschaden × Faktor × Anteil) für den gewählten Waffentyp – vereinfacht, ein Schuss in genau diese Zone." }) : null,
        ]),
      ])
    );
  }

  // ---------------------------------------------------------------- Angriffe & Schaden
  const AMMO_DMG = [["Health", "Leben"], ["Blood", "Blut"], ["Shock", "Schock"]];
  function modelAmmo(v, name) {
    const ca = C().child(v.model.root, "CfgAmmo");
    return ca ? ca.children.find((c) => c.name === name && !c.forward) || null : null;
  }
  function ammoDamage(v, ammo, key) {
    const own = modelAmmo(v, ammo);
    if (own) {
      const x = C().getNum(C().find(own, "DamageApplied/" + key), "damage");
      if (Number.isFinite(x)) return x;
      return ammoDamage(v, own.base, key);
    }
    const e = EQE.Cfg ? EQE.Cfg.getEntry("CfgAmmo", ammo) : null;
    const p = e ? EQE.Cfg.effProp(e, "DamageApplied/" + key + "/damage") : null;
    const n = p ? Number(p.raw) : NaN;
    return Number.isFinite(n) ? n : NaN;
  }
  /** Kopiert den DamageApplied-Block einer Ammo-Klasse (Override-Klon oder Registry) als Config-Knoten. */
  function damageAppliedCopy(v, ammo) {
    const own = modelAmmo(v, ammo);
    if (own) {
      const d = C().child(own, "DamageApplied");
      if (d) return JSON.parse(JSON.stringify(d));
      return damageAppliedCopy(v, own.base);
    }
    const node = { name: "DamageApplied", base: "", props: [], children: [] };
    const e = EQE.Cfg ? EQE.Cfg.getEntry("CfgAmmo", ammo) : null;
    if (!e) return node;
    EQE.Cfg.effective(e).forEach((val) => {
      const m = /^DamageApplied\/(.+)$/i.exec(val.path);
      if (!m) return;
      const parts = m[1].split("/");
      const pn = parts.pop();
      const target = parts.length ? C().ensure(node, parts.join("/")) : node;
      if (val.array) C().setArr(target, pn, val.items);
      else C().setRaw(target, pn, val.raw);
    });
    return node;
  }
  function baseAmmoName(v, ammo) {
    const own = modelAmmo(v, ammo);
    return own ? baseAmmoName(v, own.base) : ammo;
  }
  /** Stellt sicher, dass es einen eigenen Ammo-Klon dieser Variante/Stufe gibt, und liefert dessen Namen. */
  function ensureClone(v, tier, ammo) {
    const prefix = "XCP_T" + tier + "_" + v.key + "_";
    if (ammo.indexOf(prefix) === 0 && modelAmmo(v, ammo)) return ammo;
    const root = v.model.root;
    let ca = C().child(root, "CfgAmmo");
    if (!ca) {
      ca = { name: "CfgAmmo", base: "", props: [], children: [] };
      root.children.push(ca);
    }
    const base = baseAmmoName(v, ammo);
    const name = prefix + base;
    if (!ca.children.some((c) => c.name === name)) {
      if (!ca.children.some((c) => c.forward && lcs(c.name) === lcs(base))) ca.children.unshift({ name: base, base: "", props: [], children: [], forward: true });
      const da = damageAppliedCopy(v, ammo);
      ca.children.push({ name: name, base: base, props: [], children: [da] });
    }
    // Vanilla-Nahkampf-Ammo: Addon als Voraussetzung eintragen
    if (/^Melee/.test(base)) {
      const cp = C().child(root, "CfgPatches");
      const pc = cp && cp.children.find((c) => !c.forward);
      if (pc) {
        const ra = C().prop(pc, "requiredAddons");
        if (ra && ra.array && !ra.items.some((i) => lcs(unq(i)) === "dz_weapons_melee")) ra.items.push(C().quote("DZ_Weapons_Melee"));
      }
    }
    return name;
  }
  function setAmmoDamage(v, tier, grp, key, val) {
    const clone = ensureClone(v, tier, grp.ammo);
    const own = modelAmmo(v, clone);
    C().setNum(C().ensure(own, "DamageApplied/" + key), "damage", val);
    if (grp.ammo !== clone) {
      grp.attacks.forEach((a) => C().setRaw(C().ensure(v.tiers[tier], "AttackActions/" + a), "ammoType", C().quote(clone)));
      if (grp.sphere) {
        // Arrays werden nicht gemergt: die komplette Liste mit dem ersetzten Eintrag schreiben
        const cur = valOf(v, tier, "DamageSphereAmmos");
        const items = (cur ? cur.items : []).map((it) => (unq(it) === grp.ammo ? C().quote(clone) : it));
        C().setArr(v.tiers[tier], "DamageSphereAmmos", items);
      }
      grp.ammo = clone;
    }
    touch();
  }
  /** Angriffe der Stufe, gruppiert nach Ammo-Klasse. */
  function attackGroups(v, tier) {
    const keys = collectKeys(v, tier, /^AttackActions\/[^/]+\/ammoType$/i);
    const names = [];
    keys.forEach((k) => {
      const n = /^AttackActions\/([^/]+)\//i.exec(k)[1];
      if (names.indexOf(n) < 0) names.push(n);
    });
    const groups = [];
    names.forEach((a) => {
      const x = valOf(v, tier, "AttackActions/" + a + "/ammoType");
      if (!x) return;
      const ammo = unq(x.raw);
      let g = groups.find((q) => q.ammo === ammo);
      if (!g) groups.push((g = { ammo: ammo, attacks: [] }));
      g.attacks.push(a);
    });
    // Tiere: Schaden über DamageSphereAmmos[] (Liste von Ammo-Klassen)
    const sp = valOf(v, tier, "DamageSphereAmmos");
    if (sp && sp.array) {
      sp.items.forEach((it) => {
        const ammo = unq(it);
        if (ammo && !groups.some((q) => q.ammo === ammo)) groups.push({ ammo: ammo, attacks: [], sphere: true });
      });
    }
    return groups;
  }

  function renderAttacks(box, v) {
    const tier = st.tier;
    const groups = attackGroups(v, tier);
    const host = h("div", {});
    const body = h("div", {});
    groups.forEach((g) => {
      const calc = h("div", { class: "small muted" });
      const upd = () => {
        const hh = ammoDamage(v, g.ammo, "Health");
        const bb = ammoDamage(v, g.ammo, "Blood");
        const ss = ammoDamage(v, g.ammo, "Shock");
        const bits = [];
        if (hh > 0) bits.push("Spieler (100 Leben) tot nach " + fmt(Math.ceil(100 / hh), 0) + " Treffern");
        if (ss > 0) bits.push("bewusstlos (100 Schock) nach " + fmt(Math.ceil(100 / ss), 0));
        if (bb > 0) bits.push("Blutverlust " + fmt(bb, 1) + " je Treffer");
        calc.textContent = bits.join(" · ") + " (ohne Rüstung des Spielers)";
      };
      const row = h("div", { class: "grid2" }, AMMO_DMG.map(([k, l]) => {
        const cur = ammoDamage(v, g.ammo, k);
        const inp = h("input", { type: "number", step: "any", min: "0", value: Number.isFinite(cur) ? cur : "", placeholder: "–" });
        if (g.ammo.indexOf("XCP_T" + tier + "_") === 0) inp.classList.add("ov2-changed-input");
        inp.addEventListener("input", () => {
          const n = Number(inp.value);
          if (inp.value.trim() === "" || !Number.isFinite(n) || n < 0) return;
          setAmmoDamage(v, tier, g, k, n);
          inp.classList.add("ov2-changed-input");
          upd();
        });
        return field(l + "-Schaden", k === "Health" ? "Lebenspunkte, die ein Treffer dem Spieler abzieht (vor Rüstung des Spielers)." : k === "Blood" ? "Blutverlust pro Treffer (Blutungs-Wirkung)." : "Schock pro Treffer; bei 100 wird der Spieler bewusstlos.", inp);
      }));
      upd();
      body.appendChild(
        h("div", { class: "section", style: "margin:6px 0" }, [
          h("div", { class: "section-body" }, [
            h("div", { class: "mono small", text: g.ammo + "   ·   " + (g.sphere ? "Schadenssphäre (Tier-Biss/Prankenhieb)" : "Angriffe: " + g.attacks.join(", ")) }),
            row,
            calc,
          ]),
        ])
      );
    });
    // Reichweite/Takt je Angriff (nur Anzeige)
    const tb = h("tbody");
    groups.forEach((g) => g.attacks.forEach((a) => {
      const f2 = (k) => {
        const x = valOf(v, tier, "AttackActions/" + a + "/" + k);
        return x ? fmt(Number(x.raw), 2) : "–";
      };
      tb.appendChild(h("tr", {}, [h("td", { text: a }), h("td", { class: "mono small", text: g.ammo }), h("td", { text: f2("minDistance") + " – " + f2("distance") + " m" }), h("td", { text: f2("time") + " s" }), h("td", { text: f2("cooldown") + " s" })]));
    }));
    host.appendChild(
      h("div", { class: "section" }, [
        h("div", { class: "section-head" }, ["Angriffe & Schaden · Stufe T" + tier, tipNode("Der Schaden eines Mutanten steht nicht in seiner Klasse, sondern in der Ammo-Klasse seines Angriffs (CfgAmmo). Ändern erzeugt für diese Variante und Stufe einen eigenen Klon (XCP_T<n>_<Variante>_<Ammo>) in der Override-Config und trägt ihn als ammoType der Angriffe ein – so bleiben alle anderen Mutanten unberührt, die dieselbe Original-Ammo teilen.")]),
        h("div", { class: "section-body" }, [
          groups.length
            ? null
            : h("div", { class: "issue warn", text: "Keine Angriffe gefunden. Lade die SFP-PBOs (und für Vanilla-Ammo die weapons_melee.pbo aus dem DayZ-Addons-Ordner), damit die Original-Werte angezeigt werden." }),
          body,
          groups.length ? h("div", { class: "table-scroll" }, [h("table", { class: "ptable prod-table" }, [h("thead", {}, [h("tr", {}, ["Angriff", "Ammo-Klasse", "Reichweite", "Dauer", "Pause"].map((t) => h("th", { text: t })))]), tb])]) : null,
          groups.some((g) => !Number.isFinite(ammoDamage(v, g.ammo, "Health"))) ? h("div", { class: "issue warn", text: "Für mindestens eine Ammo-Klasse fehlen die Werte (nicht geladen). Vanilla-Nahkampf-Ammo (Zombies, Tiere) liegt in den DayZ-PBOs unter DayZ/addons (z. B. weapons_melee.pbo, animals.pbo) – bitte zusätzlich laden. Fehlend: " + groups.filter((g) => !Number.isFinite(ammoDamage(v, g.ammo, "Health"))).map((g) => g.ammo).join(", ") }) : null,
        ]),
      ])
    );
    box.appendChild(host);
  }

  /** Schaden-Faktor: Werte der gleichen Angriffe aus T1 × Faktor als Schaden dieser Stufe. */
  function scaleDamage(v, tier, factor) {
    if (!v.tiers[tier] || !v.tiers["1"] || tier === "1") return 0;
    let n = 0;
    attackGroups(v, tier).forEach((g) => {
      let t1Ammo;
      if (g.sphere) {
        const t1g = attackGroups(v, "1").find((q) => q.sphere && baseAmmoName(v, q.ammo) === baseAmmoName(v, g.ammo));
        if (!t1g) return;
        t1Ammo = t1g.ammo;
      } else {
        const t1x = valOf(v, "1", "AttackActions/" + g.attacks[0] + "/ammoType");
        if (!t1x) return;
        t1Ammo = unq(t1x.raw);
      }
      AMMO_DMG.forEach(([k]) => {
        const b = ammoDamage(v, t1Ammo, k);
        if (Number.isFinite(b)) {
          setAmmoDamage(v, tier, g, k, Math.round(b * factor * 100) / 100);
          n++;
        }
      });
    });
    return n;
  }

  // ---------------------------------------------------------------- Faktor-Werkzeug
  function renderBulk(box) {
    box.appendChild(head("Faktor-Werkzeug", "Setzt die Lebenspunkte von T2 und T3 als Vielfaches von T1 – für eine Familie oder für alle Mutanten auf einmal. Vorschau zeigt, was geändert würde."));
    const fams = families();
    const prev = h("div", {});
    const targets = () => (st.scope === "all" ? fams : fams.filter((f) => f.id === st.fam));
    const calc = () => {
      clear(prev);
      let n = 0;
      const rows = [];
      targets().forEach((f) =>
        f.vars.forEach((v) => {
          const b = hpOf(v, "1");
          if (!Number.isFinite(b)) return;
          [["2", st.f2], ["3", st.f3]].forEach(([t, fac]) => {
            if (!v.tiers[t]) return;
            const nv = Math.max(1, Math.round(b * fac));
            n++;
            if (rows.length < 8) rows.push(K().row(v.key.replace(/^SFP_/, "") + " T" + t, fmt(hpOf(v, t), 0) + " → " + fmt(nv, 0), "T1 = " + fmt(b, 0) + " × " + fmt(fac, 2)));
          });
        })
      );
      const out = [K().head(n + " Werte würden gesetzt (erste " + rows.length + " als Vorschau)")].concat(rows);
      const c = K().calcBox(out);
      if (c) prev.appendChild(c);
    };
    const numIn = (key, label, tip) => field(label, tip, h("input", { type: "number", step: "any", min: "0.1", value: st[key], style: "max-width:110px", oninput: (e) => (Number(e.target.value) > 0 && ((st[key] = Number(e.target.value)), calc())) }));
    const scope = h("select", { onchange: (e) => ((st.scope = e.target.value), calc()) }, [h("option", { value: "fam", text: "Nur die gewählte Familie (" + (st.fam || "–") + ")", selected: st.scope === "fam" }), h("option", { value: "all", text: "Alle Mutanten", selected: st.scope === "all" })]);
    box.appendChild(h("div", { class: "section" }, [h("div", { class: "section-body" }, [
      h("div", { class: "grid2" }, [numIn("f2", "Faktor T2", "T2-Lebenspunkte = T1 × Faktor (gerundet). Beispiel: T1 = 2500, Faktor 1,4 → 3500."), numIn("f3", "Faktor T3", "T3-Lebenspunkte = T1 × Faktor (gerundet). Beispiel: T1 = 2500, Faktor 2 → 5000."), numIn("d2", "Schaden-Faktor T2", "T2-Schaden (Leben/Blut/Schock je Treffer) = T1-Schaden × Faktor. 1 = unverändert (es wird dann nichts geschrieben). Legt für jede betroffene Variante eigene Ammo-Klone in der Override-Config an."), numIn("d3", "Schaden-Faktor T3", "T3-Schaden = T1-Schaden × Faktor. 1 = unverändert."), field("Gilt für", "Welche Mutanten betroffen sind.", scope)]),
      h("div", { class: "toolbar" }, [h("button", { class: "btn primary", type: "button", text: "Anwenden", onclick: () => {
        let n = 0;
        targets().forEach((f) => f.vars.forEach((v) => {
          const b = hpOf(v, "1");
          if (!Number.isFinite(b)) return;
          [["2", st.f2], ["3", st.f3]].forEach(([t, fac]) => v.tiers[t] && (setHp(v, t, Math.max(1, Math.round(b * fac))), n++));
        }));
        targets().forEach((f) => f.vars.forEach((v) => [["2", st.d2], ["3", st.d3]].forEach(([t, fac]) => fac !== 1 && (n += scaleDamage(v, t, fac)))));
        EQE.toast(n + " Werte gesetzt.");
        render();
      } })]),
      prev,
    ])]));
    calc();
  }

  // ---------------------------------------------------------------- Gerüst
  function head(title, blurb, file) {
    return h("div", { class: "mp-sec-head" }, [h("h2", { text: title }), h("div", { class: "muted", text: blurb }), file ? h("div", { class: "mono muted small", text: file }) : null]);
  }

  let root = null;
  function render() {
    if (!root) return;
    clear(root);
    const fams = families();
    root.appendChild(
      h("div", { class: "toolbar" }, [
        h("button", { class: "btn primary", type: "button", text: "Mutanten-PBO / Ordner laden…", onclick: () => P().pick(true), title: "XCP_SFP_Addon.pbo oder den Quellordner mit den config.cpp laden" }),
        fams.length ? h("span", { class: "status", text: fams.length + " Familien · " + fams.reduce((n, f) => n + f.vars.length, 0) + " Varianten" }) : null,
      ])
    );
    if (!fams.length) {
      root.appendChild(
        h("div", { class: "empty-state" }, [
          h("div", { class: "drop-title", text: "Mutanten-Editor" }),
          h("p", { text: "Lade die XCP_SFP_Addon.pbo (oder einen Quellordner mit den config.cpp von XCP_SFP_Mutanten_HP) über den Knopf oben oder im Projekt-Tab. Der Editor liest die Klonen XCP_T1/T2/T3_… mit Lebenspunkten und Beute und schreibt geänderte Configs als config.cpp-Quellordner zurück – die PBO packst du danach selbst." }),
        ])
      );
      return;
    }
    const layout = h("div", { class: "ov2 mp" });
    const nav = h("div", { class: "mp-nav" });
    nav.appendChild(h("div", { class: "nav-title", text: "Werkzeuge" }));
    [["overview", "Übersicht"], ["bulk", "Faktor-Werkzeug"]].forEach(([k, l]) => nav.appendChild(h("button", { class: "mp-navbtn" + (st.view.type === k ? " active" : ""), type: "button", text: l, onclick: () => ((st.view = { type: k }), render()) })));
    nav.appendChild(h("div", { class: "nav-title", text: "Mutanten" }));
    fams.forEach((f) => nav.appendChild(h("button", { class: "mp-navbtn" + (st.view.type === "fam" && st.fam === f.id ? " active" : ""), type: "button", text: f.label + (C().isChanged(f.model) ? " •" : ""), onclick: () => ((st.fam = f.id), (st.view = { type: "fam" }), (st.sel = ""), render()) })));
    layout.appendChild(nav);
    const content = h("div", { class: "mp-content" });
    layout.appendChild(content);
    root.appendChild(layout);
    content.appendChild(h("div", { class: "issue ok mp-note", text: "Gespeichert werden nur die geänderten Familien als config.cpp (Ordner XCP_SFP_Addon/XCP_SFP_Mutanten_HP/…). Kopiere sie in deinen Quellordner und packe die PBO neu. Mit „•“ markierte Familien sind geändert." }));
    if (st.view.type === "bulk") return renderBulk(content);
    if (st.view.type === "fam") return renderFamily(content);
    renderOverview(content);
  }

  function init(panel) {
    root = panel;
    C().register(/XCP_SFP_Mutanten_HP\//i);
    render();
    return { refresh: render };
  }
  EQE.Mutants = { init: init };
})(window.EQE);
