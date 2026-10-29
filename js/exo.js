/**
 * Exodus Quest Editor – Exoskelett-Editor (XCP_EXO_Override): die fünf Basisklassen XCP_EXO_BASE_* (Helm, Oberteil, Hose,
 * Handschuhe, Stiefel), von denen alle Fraktions-Anzüge (Exodus_Exo_*) erben, sowie die Sprung-Faktoren aus dem Skript.
 * Schreibt config.cpp und Skript als Quellordner zurück (PBO danach von Hand packen).
 */
(function (EQE) {
  "use strict";
  const h = EQE.h;
  const clear = EQE.clear;
  const C = () => EQE.CfgEdit;
  const K = () => EQE.MPKit;
  const P = () => EQE.Project;
  const tipNode = (t) => K().tipNode(t);
  const fmt = (n, d) => K().fmt(n, d);

  const SRC_RE = /XCP_EXO_Override\/config\.(bin|cpp)$/i;
  const SCRIPT_RE = /XCP_EXO_Override\/scripts\/4_World\/OVERRIDE_SFP_ExoMark5_PlayerBase\.c$/i;
  const PARTS = [
    ["XCP_EXO_BASE_HELM", "Helm", "Slot Maske; Schutz gegen Chemie/Staub + Gasmasken-Filter, Nachtsicht und Lampe"],
    ["XCP_EXO_BASE_TORSO", "Oberteil", "Slot Körper; trägt den Exo-Akku"],
    ["XCP_EXO_BASE_PANTS", "Hose", "Slot Beine"],
    ["XCP_EXO_BASE_GLOVE", "Handschuhe", "Slot Handschuhe"],
    ["XCP_EXO_BASE_BOOTS", "Stiefel", "Slot Schuhe (erbt fast alles vom Original SFP_ExoArmor_Boots)"],
  ];
  const ARMOR = [
    ["Projectile", "Projektile (Kugeln)"],
    ["Melee", "Nahkampf"],
    ["Infected", "Infizierte/Mutanten"],
    ["FragGrenade", "Splitter (Granaten)"],
  ];
  const AMMO = [["Health", "Leben"], ["Blood", "Blut"], ["Shock", "Schock"]];

  const st = { view: { type: "overview" } };

  // ---------------------------------------------------------------- Zugriff
  function model() {
    return C().list(SRC_RE)[0] || null;
  }
  function vehicles() {
    const m = model();
    return m ? C().child(m.root, "CfgVehicles") : null;
  }
  const part = (name) => {
    const v = vehicles();
    return v ? v.children.find((c) => c.name === name && !c.forward) || null : null;
  };
  const script = () => C().scripts(SCRIPT_RE)[0] || null;
  const touch = () => P().notify && P().notify();
  const numAt = (node, path, key) => C().getNum(C().find(node, path), key);

  function variants() {
    const v = vehicles();
    if (!v) return [];
    return v.children.filter((c) => /^Exodus_Exo_/.test(c.name) && !c.forward);
  }

  // ---------------------------------------------------------------- Eingaben
  function field(label, tip, input, span) {
    return h("div", { class: "field" + (span ? " span2" : "") }, [h("label", {}, [label, tipNode(tip)]), input]);
  }
  function numField(node, path, key, label, tip, isInt, after) {
    const cur = numAt(node, path, key);
    const inp = h("input", { type: "number", step: isInt ? "1" : "any", value: Number.isFinite(cur) ? cur : "", placeholder: "erbt" });
    inp.addEventListener("input", () => {
      const n = Number(inp.value);
      if (inp.value.trim() === "" || !Number.isFinite(n)) return;
      C().setNum(path ? C().ensure(node, path) : node, key, isInt ? Math.round(n) : n);
      touch();
      if (after) after();
    });
    return field(label, tip, inp);
  }
  function arrField(node, key, label, tip, after) {
    const cur = C().getArr(node, key);
    const inp = h("input", { type: "text", value: cur ? cur.join(", ") : "", placeholder: "erbt" });
    inp.addEventListener("input", () => {
      C().setArr(node, key, inp.value.split(",").map((x) => x.trim()).filter((x) => x !== ""));
      touch();
      if (after) after();
    });
    return field(label, tip, inp);
  }

  // ---------------------------------------------------------------- Teil-Editor
  function partCalc(node) {
    const out = [];
    const hp = numAt(node, "DamageSystem/GlobalHealth/Health", "hitpoints");
    const w = C().getNum(node, "weight");
    const sz = C().getArr(node, "itemSize");
    const cg = C().getArr(node, "itemsCargoSize");
    out.push(K().head("Eckdaten"));
    out.push(K().row("Gewicht", Number.isFinite(w) ? fmt(w / 1000, 2) + " kg" : "geerbt", Number.isFinite(w) ? fmt(w, 0) + " g" : ""));
    out.push(K().row("Inventar-Größe", sz && sz.length === 2 ? sz[0] + " × " + sz[1] + " (" + sz[0] * sz[1] + " Felder)" : "geerbt", ""));
    if (cg && cg.length === 2) out.push(K().row("Taschen-Platz", cg[0] + " × " + cg[1] + " (" + cg[0] * cg[1] + " Felder)", "Ladung, die das Teil selbst trägt"));
    out.push(K().row("Haltbarkeit", Number.isFinite(hp) ? fmt(hp, 0) : "geerbt", "Schaden, den das Teil aushält, bis es „ruiniert“ ist"));
    const heat = C().getNum(node, "heatIsolation");
    if (Number.isFinite(heat)) out.push(K().row("Wärmeisolierung", fmt(heat * 100, 0) + " %", heat >= 0.8 ? "sehr warm – im Sommer/Feuernähe Hitze-Gefahr" : ""));
    const vis = C().getNum(node, "visibilityModifier");
    if (Number.isFinite(vis)) out.push(K().row("Sichtbarkeit", fmt(vis * 100, 0) + " %", vis < 1 ? "Tiere/KI sehen dich schlechter (kleiner = unauffälliger)" : "normal"));
    out.push(K().head("Schutz (Anteil des Schadens, der DURCHKOMMT: 0 = völlig immun, 1 = kein Schutz)"));
    ARMOR.forEach(([a, l]) => {
      const vals = AMMO.map(([k]) => numAt(node, "DamageSystem/GlobalArmor/" + a + "/" + k, "damage"));
      if (vals.every((x) => !Number.isFinite(x))) return;
      out.push(K().row(l, vals.map((x, i) => AMMO[i][1] + " " + (Number.isFinite(x) ? fmt((1 - x) * 100, 0) + " % geschützt" : "geerbt")).join(" · "), Number.isFinite(vals[0]) && vals[0] > 0 ? "von 100 Schaden kommen " + fmt(vals[0] * 100, 0) + " Leben-Schaden durch" : ""));
    });
    return out;
  }

  function renderPart(box, name) {
    const node = part(name);
    const meta = PARTS.find((p) => p[0] === name);
    if (!node) return box.appendChild(h("div", { class: "empty-state", text: name + " ist in der Config nicht vorhanden." }));
    box.appendChild(head(meta[1], meta[2] + ". Alle Fraktions-Anzüge (Exodus_Exo_…) erben diese Werte – eine Änderung gilt für alle.", name + (node.base ? " : " + node.base : "")));
    const calcHost = h("div", {});
    const redraw = () => {
      clear(calcHost);
      const c = K().calcBox(partCalc(node));
      if (c) calcHost.appendChild(c);
    };
    redraw();
    const gen = h("div", { class: "grid2" }, [
      numField(node, "", "weight", "Gewicht (g)", "Gewicht in Gramm. 1000 = 1 kg. Macht dich bei Überladung langsamer.", true, redraw),
      arrField(node, "itemSize", "Größe im Inventar (Breite, Höhe)", "Belegte Felder im Inventar, z. B. 5, 5.", redraw),
      arrField(node, "itemsCargoSize", "Taschen-Platz (Breite, Höhe)", "Wie viel Ladung das Teil selbst aufnehmen kann, z. B. 8, 8.", redraw),
      numField(node, "", "heatIsolation", "Wärmeisolierung", "0 bis 1: wie gut das Teil warm hält (auch gegen Hitze-Abkühlung). Hohe Werte = sehr warm.", false, redraw),
      numField(node, "", "visibilityModifier", "Sichtbarkeit", "Faktor, wie gut Tiere/KI dich sehen. Unter 1 = unauffälliger.", false, redraw),
      numField(node, "", "varWetMax", "Max. Nässe", "Wie nass das Teil werden kann (0–1). Kleine Werte = fast wasserdicht.", false, redraw),
      numField(node, "", "absorbency", "Saugfähigkeit", "Wie stark Nässe aufgesaugt wird (0 = nicht).", false, redraw),
      numField(node, "", "quickBarBonus", "Schnellleisten-Plätze", "Zusätzliche Plätze in der Schnellleiste.", true, redraw),
      numField(node, "DamageSystem/GlobalHealth/Health", "hitpoints", "Haltbarkeit (HP)", "Schaden, den das Teil aushält, bis es ruiniert ist.", true, redraw),
    ]);
    box.appendChild(calcHost);
    box.appendChild(h("div", { class: "section" }, [h("div", { class: "section-head", text: "Allgemein" }), h("div", { class: "section-body" }, [gen])]));
    // Rüstung
    const body = h("tbody");
    ARMOR.forEach(([a, l]) => {
      body.appendChild(
        h("tr", {}, [h("td", { text: l })].concat(
          AMMO.map(([k]) => {
            const path = "DamageSystem/GlobalArmor/" + a + "/" + k;
            const cur = numAt(node, path, "damage");
            const inp = h("input", { type: "number", step: "any", min: "0", max: "1", value: Number.isFinite(cur) ? cur : "", placeholder: "erbt", style: "width:80px" });
            inp.addEventListener("input", () => {
              const n = Number(inp.value);
              if (inp.value.trim() === "" || !Number.isFinite(n)) return;
              C().setNum(C().ensure(node, path), "damage", n);
              touch();
              redraw();
            });
            return h("td", {}, [inp]);
          })
        ))
      );
    });
    box.appendChild(
      h("div", { class: "section" }, [
        h("div", { class: "section-head", text: "Rüstung" }),
        h("div", { class: "section-body" }, [
          h("div", { class: "help", text: "Anteil des Schadens, der durchkommt: 1 = kein Schutz, 0,5 = halber Schaden, 0 = immun. Leer = wird von der Basisklasse geerbt." }),
          h("div", { class: "table-scroll" }, [h("table", { class: "ptable prod-table" }, [h("thead", {}, [h("tr", {}, ["Schadensart"].concat(AMMO.map((x) => x[1])).map((t) => h("th", { text: t })))]), body])]),
        ]),
      ])
    );
  }

  // ---------------------------------------------------------------- Gesamt-Übersicht
  function renderOverview(box) {
    box.appendChild(head("Anzug gesamt", "Alle fünf Exo-Teile nebeneinander – Gewicht, Haltbarkeit und Schutz im Vergleich. Klick auf ein Teil öffnet es."));
    let tw = 0;
    let thp = 0;
    const body = h("tbody");
    PARTS.forEach(([name, label]) => {
      const n = part(name);
      if (!n) return;
      const w = C().getNum(n, "weight");
      const hp = numAt(n, "DamageSystem/GlobalHealth/Health", "hitpoints");
      if (Number.isFinite(w)) tw += w;
      if (Number.isFinite(hp)) thp += hp;
      const arm = (a) => {
        const d = numAt(n, "DamageSystem/GlobalArmor/" + a + "/Health", "damage");
        return Number.isFinite(d) ? fmt((1 - d) * 100, 0) + " %" : "erbt";
      };
      const sz = C().getArr(n, "itemSize");
      body.appendChild(
        h("tr", {}, [
          h("td", {}, [h("button", { class: "linklike", type: "button", text: label, onclick: () => ((st.view = { type: "part", key: name }), render()) })]),
          h("td", { text: Number.isFinite(w) ? fmt(w / 1000, 2) + " kg" : "erbt" }),
          h("td", { text: sz && sz.length === 2 ? sz.join(" × ") : "erbt" }),
          h("td", { text: Number.isFinite(hp) ? fmt(hp, 0) : "erbt" }),
          h("td", { text: arm("Projectile") }),
          h("td", { text: arm("Melee") }),
          h("td", { text: arm("Infected") }),
          h("td", { text: arm("FragGrenade") }),
        ])
      );
    });
    box.appendChild(h("div", { class: "table-scroll" }, [h("table", { class: "ptable prod-table" }, [h("thead", {}, [h("tr", {}, ["Teil", "Gewicht", "Größe", "HP", "Kugeln", "Nahkampf", "Infizierte", "Splitter"].map((t) => h("th", { text: t })))]), body])]));
    box.appendChild(K().calcBox([K().head("Kompletter Anzug (nur Teile mit eigenem Wert)"), K().row("Gewicht", fmt(tw / 1000, 2) + " kg", "Summe der Teile ohne Akku/Inhalt"), K().row("Haltbarkeit", fmt(thp, 0), "Summe der HP-Werte"), K().row("Spieler-Slots", "Rücken, Weste, Kopfbedeckung gesperrt", "laut Skript: solange ein Exo-Teil getragen wird, sind diese Slots gesperrt, und Exo-Teile können nur getragen werden, wenn sie frei sind")]));
    box.appendChild(h("div", { class: "muted small", text: "Schutzwerte zeigen den Schutz gegen Leben-Schaden (100 % = immun)." }));
  }

  // ---------------------------------------------------------------- Sprung (Skript)
  const JUMP_V = /(cfg\.JumpVerticalVelocity\s*\*\s*)([0-9.]+)/;
  const JUMP_F = /(cfg\.JumpForwardVelocityBonus\s*\*\s*)([0-9.]+)/;
  function renderJump(box) {
    const s = script();
    box.appendChild(head("Sprung-Verstärkung", "Der Exo-Anzug verstärkt Sprünge. Das Skript skaliert die Werte der Original-Mod mit zwei Faktoren – hier kannst du sie ändern. Gespeichert wird das Skript OVERRIDE_SFP_ExoMark5_PlayerBase.c neu.", "XCP_EXO_Override/scripts/4_World/OVERRIDE_SFP_ExoMark5_PlayerBase.c"));
    if (!s) return box.appendChild(h("div", { class: "empty-state", text: "Das Skript wurde nicht gefunden. Lade die XCP_SFP_Addon.pbo erneut (das Skript wird mitgelesen)." }));
    const mv = JUMP_V.exec(s.text);
    const mf = JUMP_F.exec(s.text);
    if (!mv || !mf) return box.appendChild(h("div", { class: "empty-state", text: "Die Faktor-Zeilen (JumpVerticalVelocity / JumpForwardVelocityBonus) wurden im Skript nicht gefunden – das Skript hat sich vermutlich geändert." }));
    const calcHost = h("div", {});
    const redraw = () => {
      clear(calcHost);
      const v = Number(JUMP_V.exec(s.text)[2]);
      const f = Number(JUMP_F.exec(s.text)[2]);
      const c = K().calcBox([
        K().head("Wirkung gegenüber der Original-Mod-Einstellung (100 %)"),
        K().row("Sprunghöhe", fmt(v * 100, 0) + " %", v < 1 ? "um " + fmt((1 - v) * 100, 0) + " % abgeschwächt" : v > 1 ? "um " + fmt((v - 1) * 100, 0) + " % verstärkt" : "wie im Original"),
        K().row("Sprungweite", fmt(f * 100, 0) + " %", f < 1 ? "um " + fmt((1 - f) * 100, 0) + " % abgeschwächt" : f > 1 ? "um " + fmt((f - 1) * 100, 0) + " % verstärkt" : "wie im Original"),
        v > 1.5 || f > 2 ? K().warn("Sehr hohe Faktoren können Fall-/Landeschaden und Fehlverhalten (Durch-Wände-Springen) auslösen.") : K().head("Hinweis: Die Basis-Werte (JumpVerticalVelocity …) stehen in der Config der Original-Mod und sind hier nicht sichtbar."),
      ]);
      if (c) calcHost.appendChild(c);
    };
    const mk = (re, label, tip) => {
      const inp = h("input", { type: "number", step: "any", min: "0", value: Number(re.exec(s.text)[2]), style: "max-width:110px" });
      inp.addEventListener("input", () => {
        const n = Number(inp.value);
        if (inp.value.trim() === "" || !Number.isFinite(n) || n < 0) return;
        s.text = s.text.replace(re, "$1" + String(n));
        touch();
        redraw();
      });
      return field(label, tip, inp);
    };
    redraw();
    box.appendChild(calcHost);
    box.appendChild(h("div", { class: "section" }, [h("div", { class: "section-head", text: "Faktoren" }), h("div", { class: "section-body" }, [h("div", { class: "grid2" }, [
      mk(JUMP_V, "Sprunghöhe-Faktor", "Multipliziert die senkrechte Absprunggeschwindigkeit der Original-Mod (im Skript mit „Höhe“ kommentiert). 0,6 = 60 %."),
      mk(JUMP_F, "Sprungweite-Faktor", "Multipliziert den Vorwärts-Bonus beim Sprung (im Skript mit „Weite“ kommentiert). 1 = unverändert."),
    ])])]));
  }

  // ---------------------------------------------------------------- Varianten
  function renderVariants(box) {
    box.appendChild(head("Fraktions-Anzüge", "Die fertigen Anzüge (Exodus_Exo_…) erben ihre Werte komplett von den Basisklassen und setzen nur Name und Textur. Werte änderst du deshalb in den Teilen links.", ""));
    const vs = variants();
    const groups = {};
    vs.forEach((c) => {
      const m = /^Exodus_Exo_(.+?)_?(Helm|Tors|Pants)?$/.exec(c.name);
      const fac = m && m[2] ? m[1] : c.name.replace(/^Exodus_Exo_/, "");
      (groups[fac] = groups[fac] || []).push(c);
    });
    const body = h("tbody");
    Object.keys(groups).forEach((fac) => {
      const cls = groups[fac];
      body.appendChild(h("tr", {}, [h("td", { text: fac }), h("td", { text: cls.map((c) => c.name.replace(/^Exodus_Exo_/, "") + " (" + (c.base || "").replace(/^XCP_EXO_BASE_/, "") + ")").join(", ") }), h("td", { class: "small muted", text: cls.some((c) => C().getArr(c, "hiddenSelectionsTextures")) ? "eigene Textur" : "Standard" })]));
    });
    box.appendChild(h("div", { class: "table-scroll" }, [h("table", { class: "ptable prod-table" }, [h("thead", {}, [h("tr", {}, ["Fraktion", "Klassen (Basis)", "Textur"].map((t) => h("th", { text: t })))]), body])]));
  }

  // ---------------------------------------------------------------- Gerüst
  function head(title, blurb, file) {
    return h("div", { class: "mp-sec-head" }, [h("h2", { text: title }), h("div", { class: "muted", text: blurb }), file ? h("div", { class: "mono muted small", text: file }) : null]);
  }

  let root = null;
  function render() {
    if (!root) return;
    clear(root);
    const m = model();
    root.appendChild(h("div", { class: "toolbar" }, [h("button", { class: "btn primary", type: "button", text: "Mutanten-PBO / Ordner laden…", onclick: () => P().pick(true), title: "XCP_SFP_Addon.pbo oder den Quellordner mit XCP_EXO_Override laden" }), m ? h("span", { class: "status", text: variants().length + " Anzug-Klassen" + (C().isChanged(m) || (script() && script().text !== script().baseText) ? " · geändert" : "") }) : null]));
    if (!m || !vehicles()) {
      root.appendChild(h("div", { class: "empty-state" }, [h("div", { class: "drop-title", text: "Exoskelett-Editor" }), h("p", { text: "Lade die XCP_SFP_Addon.pbo (oder den Quellordner mit XCP_EXO_Override). Der Editor liest die fünf Basisklassen der Exo-Anzüge sowie das Sprung-Skript und schreibt Änderungen als config.cpp/Skript-Quellordner zurück – die PBO packst du danach selbst." })]));
      return;
    }
    const layout = h("div", { class: "ov2 mp" });
    const nav = h("div", { class: "mp-nav" });
    nav.appendChild(h("div", { class: "nav-title", text: "Anzug" }));
    nav.appendChild(h("button", { class: "mp-navbtn" + (st.view.type === "overview" ? " active" : ""), type: "button", text: "Anzug gesamt", onclick: () => ((st.view = { type: "overview" }), render()) }));
    PARTS.forEach(([name, label]) => nav.appendChild(h("button", { class: "mp-navbtn" + (st.view.type === "part" && st.view.key === name ? " active" : ""), type: "button", text: label, onclick: () => ((st.view = { type: "part", key: name }), render()) })));
    nav.appendChild(h("div", { class: "nav-title", text: "Mehr" }));
    [["jump", "Sprung-Verstärkung"], ["variants", "Fraktions-Anzüge"]].forEach(([k, l]) => nav.appendChild(h("button", { class: "mp-navbtn" + (st.view.type === k ? " active" : ""), type: "button", text: l, onclick: () => ((st.view = { type: k }), render()) })));
    layout.appendChild(nav);
    const content = h("div", { class: "mp-content" });
    layout.appendChild(content);
    root.appendChild(layout);
    content.appendChild(h("div", { class: "issue ok mp-note", text: "Gespeichert werden config.cpp (und bei Änderung das Sprung-Skript) unter XCP_SFP_Addon/XCP_EXO_Override/… Kopiere sie in deinen Quellordner und packe die PBO neu. Leere Felder werden von der Basisklasse des Original-Mods geerbt." }));
    if (st.view.type === "part") return renderPart(content, st.view.key);
    if (st.view.type === "jump") return renderJump(content);
    if (st.view.type === "variants") return renderVariants(content);
    renderOverview(content);
  }

  function init(panel) {
    root = panel;
    C().register(/XCP_EXO_Override\//i);
    render();
    return { refresh: render };
  }
  EQE.Exo = { init: init };
})(window.EQE);
