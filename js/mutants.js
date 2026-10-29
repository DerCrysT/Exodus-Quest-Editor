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
    dmg: 50, // Annahme: Schaden pro Treffer
    f2: 1.4,
    f3: 2,
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
    if (tier !== "1" && v.tiers["1"]) return C().getNum(C().find(v.tiers["1"], HP_PATH), "hitpoints");
    return NaN;
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
  function hitsTo(hp) {
    return Number.isFinite(hp) && st.dmg > 0 ? Math.ceil(hp / st.dmg) : NaN;
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
    box.appendChild(h("div", { class: "muted small", text: "Schaden und Verhalten der Mutanten stehen NICHT in dieser Mod (nur Lebenspunkte und Beute) – sie kommen aus der Original-SFP-Config." }));
  }

  function assumeBar(redraw) {
    return h("div", { class: "toolbar mp-assume" }, [
      h("div", { class: "field" }, [
        h("label", {}, ["Schaden pro Treffer", tipNode("Annahme für die Spalte „Treffer“: Wie viel Lebenspunkte-Schaden ein Schuss/Hieb anrichtet. Typische Größenordnung: Pistole 20–40, Sturmgewehr 40–60, Scharfschützengewehr 100+ (grobe Schätzung, hängt von Waffe, Munition und Trefferzone ab). Nur Anzeige.")]),
        h("input", { type: "number", min: "1", step: "any", value: st.dmg, style: "max-width:110px", oninput: (e) => (Number(e.target.value) > 0 && ((st.dmg = Number(e.target.value)), redraw())) }),
      ]),
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
          sk && !inherited ? h("div", { class: "help", text: "Entfernen setzt die Anzahl auf 0. Bei Stufen mit eigenem Block gilt das nur für diese Stufe – Teile, die der Block nicht aufführt, kommen weiterhin von der Basisklasse (T1)." }) : null,
        ]),
      ])
    );
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
      h("div", { class: "grid2" }, [numIn("f2", "Faktor T2", "T2-Lebenspunkte = T1 × Faktor (gerundet). Beispiel: T1 = 2500, Faktor 1,4 → 3500."), numIn("f3", "Faktor T3", "T3-Lebenspunkte = T1 × Faktor (gerundet). Beispiel: T1 = 2500, Faktor 2 → 5000."), field("Gilt für", "Welche Mutanten betroffen sind.", scope)]),
      h("div", { class: "toolbar" }, [h("button", { class: "btn primary", type: "button", text: "Anwenden", onclick: () => {
        let n = 0;
        targets().forEach((f) => f.vars.forEach((v) => {
          const b = hpOf(v, "1");
          if (!Number.isFinite(b)) return;
          [["2", st.f2], ["3", st.f3]].forEach(([t, fac]) => v.tiers[t] && (setHp(v, t, Math.max(1, Math.round(b * fac))), n++));
        }));
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
