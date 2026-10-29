/**
 * Exodus Quest Editor – Anomalien, Detektoren & Artefakt-Effekte.
 * Dateien: StalkerAnomalyUnifiedBalance, AnomalyTriggerSettings, AnomalySpawn, DetectorSettings, AutoReload,
 * StalkerAnomalyTeleport sowie ArtEFX, ArtEFXMedPlus, ArtEFXTimer. Aufbau wie MedPlus/Radiation:
 * „?“-Erklärungen und Live-Berechnungen; Änderungen laufen über den Projekt-Store und werden zurückgeschrieben.
 */
(function (EQE) {
  "use strict";
  const h = EQE.h;
  const clear = EQE.clear;
  const P = () => EQE.Project;
  const K = () => EQE.MPKit;
  const T = () => EQE.AnText;

  const KINDS = ["an_balance", "an_trigger", "an_detector", "an_reload", "an_teleport", "efx_base", "efx_medplus", "efx_timer"];
  // Maximalwerte (Vanilla DayZ) für die „Zeit bis leer“-Rechnungen
  const MAXV = { food: 5000, water: 5000, blood: 5000, health: 100, shock: 100 };
  const tipNode = (t) => K().tipNode(t);

  const st = {
    view: { type: "balance" },
    sel: { balance: "", trigger: "", detector: "", efx: "", spawn: "" },
    calc: { hps: 1, hits: 1 },
    search: "",
  };

  // ---------------------------------------------------------------- Dateien
  const fileItem = (kind) => P().byKind(kind).find((i) => !/_old/i.test(i.fileId || "")) || P().byKind(kind)[0] || null;
  const spawnItem = () => P().byKind("anomalies").find((i) => i.json && Array.isArray(i.json.Artefacts_Otklik)) || P().byKind("anomalies").find((i) => !/_old/i.test(i.fileId || "")) || P().byKind("anomalies")[0] || null;
  const num = (o, k) => (o && typeof o[k] === "number" ? o[k] : NaN);
  const mut = (item, fn) => P().mutate(item.uid, fn);
  const origJ = (item) => K().origOf(item);

  function lookup(map, key) {
    const e = map[key];
    return e ? { label: e[0], help: e[1] } : { label: key, help: "Keine Beschreibung hinterlegt (Wert aus der Datei)." };
  }
  const FLAG_RE = /(Enabled$|^enable|^Enable|^trigger|Scanner$|^Delete|^Run|^ReloadDetector|^EnableReloadFlag|^checkGeometry|^enableAnomaly)/;
  const isFlag = (k, v) => (v === 0 || v === 1) && FLAG_RE.test(k) && !/(Chance|Seconds|Count|Time)/.test(k);

  // ---------------------------------------------------------------- Eingabeelemente für verschachtelte Objekte
  /**
   * Ein Feld, das in get(item.json)[key] schreibt.
   * opts: {label, help (String|Funktion), get, after, isInt}
   */
  function field(item, get, key, opts) {
    const obj = get(item.json);
    const val = obj ? obj[key] : undefined;
    const redraw = () => {
      if (opts.after) opts.after();
    };
    const orig = origJ(item);
    const og = orig ? get(orig) : null;
    const changed = og && !K().sameVal(og[key], val);
    let control;
    if (typeof val === "string") control = h("input", { type: "text", value: val, oninput: (e) => (mut(item, (j) => (get(j)[key] = e.target.value)), redraw()) });
    else if (isFlag(key, val)) {
      control = h("label", { class: "checkrow" }, [
        h("input", { type: "checkbox", checked: val === 1, onchange: (e) => (mut(item, (j) => (get(j)[key] = e.target.checked ? 1 : 0)), redraw()) }),
        "Ein (1)",
      ]);
    } else {
      const inp = h("input", { type: "number", step: opts.isInt ? "1" : "any", value: val });
      inp.addEventListener("input", () => {
        const t = inp.value.trim();
        if (t === "" || !Number.isFinite(Number(t))) return;
        mut(item, (j) => (get(j)[key] = opts.isInt ? Math.round(Number(t)) : Number(t)));
        redraw();
      });
      if (changed) inp.classList.add("ov2-changed-input");
      control = inp;
    }
    return h("div", { class: "field" + (changed ? " ov2-changed" : "") }, [
      h("label", {}, [
        opts.label,
        tipNode(opts.help),
        h("span", { class: "mp-key mono muted small", text: key }),
        og && changed ? h("button", { class: "btn icon small ov2-reset", type: "button", title: "Auf den geladenen Wert zurücksetzen (" + JSON.stringify(og[key]) + ")", text: "↺", onclick: () => (mut(item, (j) => (get(j)[key] = JSON.parse(JSON.stringify(og[key])))), render()) }) : null,
      ]),
      control,
    ]);
  }

  /** Chip-Liste für ein String-Array (get liefert das Array in item.json). */
  function chipList(item, get, label, tip, suggest, after) {
    const arr = get(item.json);
    const chips = h("div", { class: "strlist" });
    const draw = () => {
      clear(chips);
      arr.forEach((v, i) =>
        chips.appendChild(
          h("span", { class: "chip" }, [
            String(v),
            h("button", { type: "button", text: "×", onclick: () => (arr.splice(i, 1), commit()) }),
          ])
        )
      );
      if (!arr.length) chips.appendChild(h("span", { class: "muted small", text: "(leer)" }));
    };
    const commit = () => {
      mut(item, () => {});
      draw();
      if (after) after();
    };
    const id = suggest && suggest.length ? EQE.uid() : null;
    const add = h("input", { type: "text", placeholder: "Hinzufügen (Enter)", list: id || undefined });
    add.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const t = add.value.trim();
      if (!t || arr.indexOf(t) > -1) return;
      arr.push(t);
      add.value = "";
      commit();
    });
    draw();
    return h("div", { class: "field span2" }, [
      h("label", {}, [label, tipNode(tip)]),
      chips,
      add,
      id ? h("datalist", { id: id }, suggest.slice(0, 3000).map((s) => h("option", { value: s }))) : null,
    ]);
  }

  // ---------------------------------------------------------------- Balance (Anomalie-Treffer)
  function balExplain(item, name, key) {
    const info = lookup(T().BAL, key);
    const o = item.json.anomalyBalance[name];
    const v = o[key];
    const lines = [info.help];
    const it = [];
    if (typeof v === "number") {
      if (key === "playerHealthDamage") it.push(K().fmt(v, 2) + " Leben je Treffer → bei 100 HP nach " + (v > 0 ? K().fmt(100 / v, 0) : "∞") + " Treffern tot (ohne Regeneration).");
      else if (key === "playerBloodDamage") it.push(K().fmt(v, 2) + " Blut je Treffer → bei 5000 Blut nach " + (v > 0 ? K().fmt(5000 / v, 0) : "∞") + " Treffern verblutet.");
      else if (key === "playerShockDamage") it.push(K().fmt(v, 2) + " Schock je Treffer → bei 100 Schock nach " + (v > 0 ? K().fmt(100 / v, 0) : "∞") + " Treffern bewusstlos (vermutlich).");
      else if (key === "playerStaminaDamage") it.push(K().fmt(v, 2) + " Ausdauer je Treffer.");
      else if (/Seconds$/.test(key)) it.push(K().fmtTime(v) + ".");
      else if (/Radius/.test(key) && /Meters$/.test(key)) it.push(K().fmt(v, 1) + " m → Fläche " + K().fmt(Math.PI * v * v, 0) + " m².");
      else if (/Meters$/.test(key)) it.push(K().fmt(v, 2) + " m.");
      else if (isFlag(key, v)) it.push(v === 1 ? "Aktuell AN." : "Aktuell AUS.");
    }
    if (it.length) lines.push("Interpretation (aus Name und Werten abgeleitet):\n" + it.join("\n"));
    const og = origJ(item);
    if (og && og.anomalyBalance && og.anomalyBalance[name] && !K().sameVal(og.anomalyBalance[name][key], v)) lines.push("Geladener Wert (Datei): " + JSON.stringify(og.anomalyBalance[name][key]) + ".");
    return lines.join("\n\n");
  }

  function balCalc(o) {
    const out = [];
    const hps = st.calc.hps;
    out.push(K().head("Schaden bei " + K().fmt(hps, 2) + " Treffer(n) pro Sekunde (Annahme, oben einstellbar)"));
    [
      ["playerHealthDamage", "Leben", 100],
      ["playerBloodDamage", "Blut", 5000],
      ["playerShockDamage", "Schock", 100],
      ["playerStaminaDamage", "Ausdauer", 100],
    ].forEach(([k, l, max]) => {
      const v = num(o, k);
      if (!(v > 0)) return;
      const perSec = v * hps;
      out.push(K().row(l, K().fmt(perSec * 60, 1) + " pro Minute", "leer/tot nach " + K().fmtTime(max / perSec) + " (" + K().fmt(max / v, 0) + " Treffer, Maximum " + max + ")"));
    });
    if (!(num(o, "playerHealthDamage") > 0) && !(num(o, "playerBloodDamage") > 0) && !(num(o, "playerShockDamage") > 0)) out.push(K().row("Spieler-Schaden", "keiner", "die Anomalie verletzt den Spieler selbst nicht (ggf. Sonder-Effekte unten)"));
    out.push(K().head("Ausrüstung"));
    out.push(K().row("Kleidung", K().fmt(num(o, "clothDamage"), 1) + " je Treffer", num(o, "clothDamage") > 0 ? "bei 100 % Haltbarkeit hält sie ca. " + K().fmt(100 / num(o, "clothDamage"), 0) + " Treffer (Annahme: Prozent)" : "unversehrt"));
    out.push(K().row("Gegenstände", K().fmt(num(o, "itemDamage"), 1) + " je Treffer", num(o, "itemDamage") >= 100 ? "zerstört Gegenstände mit einem Treffer (≥ 100)" : "ca. " + (num(o, "itemDamage") > 0 ? K().fmt(100 / num(o, "itemDamage"), 0) : "∞") + " Treffer bis kaputt (Annahme: Prozent)"));
    out.push(K().head("Artefakte"));
    const r = num(o, "artifactSpawnScanRadiusMeters");
    out.push(K().row("Suchradius", K().fmt(r, 1) + " m", "Fläche " + K().fmt(Math.PI * r * r, 0) + " m²"));
    out.push(K().row("Sperre", K().fmtTime(num(o, "artifactRevealCooldownSeconds")), "höchstens " + K().fmt(3600 / num(o, "artifactRevealCooldownSeconds"), 0) + " Freigaben pro Stunde"));
    // Sonder-Effekte
    const special = [];
    if (num(o, "graviLaunchHeightMeters") > 0) special.push(["Gravi", K().fmt(num(o, "graviLaunchHeightMeters"), 1) + " m hoch", "Radius " + K().fmt(num(o, "graviRadiusMeters"), 1) + " m · Beinbruch " + (num(o, "graviCatapultFractureEnabled") === 1 ? "ja, nach " + K().fmt(num(o, "graviFractureDelaySeconds"), 1) + " s" : "nein")]);
    if (num(o, "springboardLaunchHeightMeters") > 0) special.push(["Sprungbrett", K().fmt(num(o, "springboardLaunchHeightMeters"), 1) + " m hoch", "Radius " + K().fmt(num(o, "springboardRadiusMeters"), 1) + " m · Beinbruch " + (num(o, "springboardCatapultFractureEnabled") === 1 ? "ja, nach " + K().fmt(num(o, "springboardFractureDelaySeconds"), 1) + " s" : "nein")]);
    if (num(o, "chopperLethalRadiusMeters") > 0) special.push(["Chopper", "tödlich im Radius " + K().fmt(num(o, "chopperLethalRadiusMeters"), 1) + " m", "Sog bis " + K().fmt(num(o, "chopperSuckRadiusMeters"), 1) + " m · Tod nach " + K().fmt(num(o, "chopperCenterKillDelaySeconds"), 1) + " s im Zentrum"]);
    if (num(o, "funnelLethalRadiusMeters") > 0) special.push(["Trichter", "tödlich im Radius " + K().fmt(num(o, "funnelLethalRadiusMeters"), 1) + " m", "Sog ab " + K().fmt(num(o, "funnelOuterRadiusMeters"), 1) + " m · Tod nach " + K().fmt(num(o, "funnelKillDelaySeconds"), 1) + " s"]);
    if (num(o, "fireHeatRadiusMeters") > 0) special.push(["Feuer", "Hitze bis " + K().fmt(num(o, "fireHeatRadiusMeters"), 1) + " m", "voll bis " + K().fmt(num(o, "fireHeatRadiusFullMeters"), 1) + " m · max. Temperatur " + K().fmt(num(o, "fireHeatTemperatureCap"), 0)]);
    if (num(o, "electronicEmpRadiusMeters") > 0) special.push(["EMP", "Radius " + K().fmt(num(o, "electronicEmpRadiusMeters"), 1) + " m", num(o, "electronicEmpEnabled") === 1 ? "stört Elektronik/Detektoren" : "EMP ist aus"]);
    if (num(o, "grabberRadiusMeters") > 0) special.push(["Greifer", "Radius " + K().fmt(num(o, "grabberRadiusMeters"), 1) + " m", "aktiv " + K().fmt(num(o, "grabberActiveSeconds"), 1) + " s, danach " + K().fmt(num(o, "grabberRearmCooldownSeconds"), 1) + " s Pause"]);
    if (num(o, "teleportVomitAfterSeconds") > 0) special.push(["Teleport", "Erbrechen nach " + K().fmt(num(o, "teleportVomitAfterSeconds"), 1) + " s", ""]);
    if (special.length) {
      out.push(K().head("Sonder-Effekte"));
      special.forEach(([l, v, n]) => out.push(K().row(l, v, n)));
    }
    return out;
  }

  function renderBalance(box) {
    const item = fileItem("an_balance");
    if (!item) return empty(box, "StalkerAnomalyUnifiedBalance.json");
    const bal = item.json.anomalyBalance || {};
    const names = Object.keys(bal);
    if (!bal[st.sel.balance]) st.sel.balance = names[0] || "";
    box.appendChild(head("Anomalie-Balance", "Schaden und Sonder-Effekte jeder Anomalie-Art. Links auswählen, rechts bearbeiten; unten die Wirkung auf den Spieler.", "StalkerAnomalyUnifiedBalance.json · " + names.length + " Anomalien"));
    const calcHost = h("div", {});
    const name = st.sel.balance;
    const redrawCalc = () => {
      clear(calcHost);
      const c = K().calcBox(balCalc(bal[name]));
      if (c) calcHost.appendChild(c);
    };
    redrawCalc();
    const list = h("div", { class: "mp-list" });
    names.forEach((n) => list.appendChild(h("button", { class: "mp-navbtn" + (n === name ? " active" : ""), type: "button", text: n, onclick: () => ((st.sel.balance = n), render()) })));
    const grid = h("div", { class: "grid2" });
    Object.keys(bal[name]).forEach((k) => {
      const info = lookup(T().BAL, k);
      grid.appendChild(field(item, (j) => j.anomalyBalance[name], k, { label: info.label, help: () => balExplain(item, name, k), after: redrawCalc }));
    });
    const assume = h("div", { class: "toolbar mp-assume" }, [
      h("div", { class: "field" }, [
        h("label", {}, ["Treffer pro Sekunde", tipNode("Annahme für die Rechnung: Wie oft die Anomalie pro Sekunde zuschlägt, solange der Spieler darin steht. Der echte Takt steht nicht in der Datei. Nur Anzeige.")]),
        h("input", { type: "number", step: "any", min: "0", value: st.calc.hps, style: "max-width:110px", oninput: (e) => (Number(e.target.value) > 0 && ((st.calc.hps = Number(e.target.value)), redrawCalc())) }),
      ]),
      h("span", { class: "muted small", text: "Annahme für die Live-Rechnung – wird nicht in die Datei geschrieben." }),
    ]);
    box.appendChild(h("div", { class: "mp-split" }, [list, h("div", { class: "mp-detail" }, [assume, calcHost, h("div", { class: "section" }, [h("div", { class: "section-body" }, [grid])])])]));
  }

  function renderBalanceOverview(box) {
    const item = fileItem("an_balance");
    if (!item) return empty(box, "StalkerAnomalyUnifiedBalance.json");
    const bal = item.json.anomalyBalance || {};
    box.appendChild(head("Balance-Übersicht", "Alle Anomalien nebeneinander – sortiert nach Gefahr (Treffer bis zum Tod). Klick auf den Namen öffnet die Anomalie.", ""));
    const rows = Object.keys(bal).map((n) => {
      const o = bal[n];
      const hp = num(o, "playerHealthDamage");
      return { n: n, o: o, hits: hp > 0 ? 100 / hp : Infinity };
    });
    rows.sort((a, b) => a.hits - b.hits);
    const body = h("tbody");
    rows.forEach((r) => {
      const o = r.o;
      body.appendChild(
        h("tr", {}, [
          h("td", {}, [h("button", { class: "linklike", type: "button", text: r.n, onclick: () => ((st.sel.balance = r.n), (st.view = { type: "balance" }), render()) })]),
          h("td", { text: K().fmt(num(o, "playerHealthDamage"), 2) }),
          h("td", { text: Number.isFinite(r.hits) ? K().fmt(r.hits, 0) : "–" }),
          h("td", { text: K().fmt(num(o, "playerBloodDamage"), 2) }),
          h("td", { text: K().fmt(num(o, "playerShockDamage"), 2) }),
          h("td", { text: K().fmt(num(o, "playerStaminaDamage"), 2) }),
          h("td", { text: K().fmt(num(o, "clothDamage"), 1) }),
          h("td", { text: K().fmt(num(o, "itemDamage"), 1) }),
          h("td", { text: K().fmt(num(o, "artifactSpawnScanRadiusMeters"), 1) + " m / " + K().fmt(num(o, "artifactRevealCooldownSeconds"), 0) + " s" }),
        ])
      );
    });
    box.appendChild(h("div", { class: "table-scroll" }, [h("table", { class: "ptable prod-table" }, [h("thead", {}, [h("tr", {}, ["Anomalie", "Leben/Treffer", "Treffer bis tot", "Blut", "Schock", "Ausdauer", "Kleidung", "Gegenstände", "Artefakt-Suche / Sperre"].map((t) => h("th", { text: t })))]), body])]));
  }

  // ---------------------------------------------------------------- Trigger
  function renderTrigger(box) {
    const item = fileItem("an_trigger");
    if (!item) return empty(box, "AnomalyTriggerSettings.json");
    const root = item.json.AnomalieTriggerSettings && item.json.AnomalieTriggerSettings[0];
    if (!root) return empty(box, "AnomalyTriggerSettings.json (leer)");
    const specs = root.AnomalieTriggerSpecificSettings || [];
    box.appendChild(head("Auslöser", "Wer oder was eine Anomalie auslösen darf: allgemein (Spieler, Tiere, Mutanten, Gegenstände) und je Anomalie mit Listen erlaubter Gegenstände und Mutanten.", "AnomalyTriggerSettings.json · " + specs.length + " Anomalien"));
    const g0 = (j) => j.AnomalieTriggerSettings[0];
    const gen = h("div", { class: "grid2" });
    ["triggerByPlayersGeneral", "triggerByAnimalsGeneral", "triggerByMutantsGeneral", "triggerByItemsGeneral"].forEach((k) => {
      const info = lookup(T().TRIG, k);
      gen.appendChild(field(item, g0, k, { label: info.label, help: () => info.help + "\n\nAktuell: " + (g0(item.json)[k] === 1 ? "AN" : "AUS") + ". Gilt für alle Anomalien, soweit unten nichts Genaueres steht.", after: () => {} }));
    });
    box.appendChild(h("div", { class: "section" }, [h("div", { class: "section-head", text: "Allgemein" }), h("div", { class: "section-body" }, [gen])]));
    if (!specs.some((s) => s.AnomalyName === st.sel.trigger)) st.sel.trigger = specs[0] ? specs[0].AnomalyName : "";
    const idx = specs.findIndex((s) => s.AnomalyName === st.sel.trigger);
    const list = h("div", { class: "mp-list" });
    specs.forEach((s) => list.appendChild(h("button", { class: "mp-navbtn" + (s.AnomalyName === st.sel.trigger ? " active" : ""), type: "button", text: s.AnomalyName, onclick: () => ((st.sel.trigger = s.AnomalyName), render()) })));
    const detail = h("div", { class: "mp-detail" });
    if (idx > -1) {
      const gs = (j) => j.AnomalieTriggerSettings[0].AnomalieTriggerSpecificSettings[idx];
      const s = specs[idx];
      const calcHost = h("div", {});
      const redraw = () => {
        clear(calcHost);
        const out = [];
        const cd = s.triggerItemWhitelist ? num(s.triggerItemWhitelist, "Cooldown") : NaN;
        out.push(K().head("Wirkung"));
        out.push(K().row("Spieler", root.triggerByPlayersGeneral === 1 ? "lösen aus" : "lösen nicht aus", "aus der allgemeinen Einstellung oben"));
        if (s.triggerByWhitelistedItems === 1) out.push(K().row("Gegenstände", (s.triggerItemWhitelist.Triggeritems || []).length + " freigegeben", "Abklingzeit " + K().fmtTime(cd) + " → höchstens " + K().fmt(3600 / cd, 0) + " Auslösungen pro Stunde durch Gegenstände"));
        else out.push(K().row("Gegenstände", root.triggerByItemsGeneral === 1 ? "alle lösen aus" : "keine", "Liste ist aus (triggerByWhitelistedItems = 0)"));
        out.push(K().row("Mutanten", s.triggerByWhitelistedMutants === 1 ? (s.triggerMutantWhitelist || []).length + " Klassen freigegeben" : root.triggerByMutantsGeneral === 1 ? "alle lösen aus" : "keine", s.triggerByWhitelistedMutants === 1 ? "nur die Klassen der Liste" : "allgemeine Einstellung"));
        if (s.triggerByWhitelistedItems === 1 && !(s.triggerItemWhitelist.Triggeritems || []).length) out.push(K().warn("Die Gegenstände-Liste ist an, aber leer – niemand kann so auslösen."));
        const c = K().calcBox(out);
        if (c) calcHost.appendChild(c);
      };
      redraw();
      const grid = h("div", { class: "grid2" });
      [["triggerByWhitelistedItems", "Gegenstände"], ["triggerByWhitelistedMutants", "Mutanten"]].forEach(([k]) => {
        const info = lookup(T().TRIG, k);
        grid.appendChild(field(item, gs, k, { label: info.label, help: info.help, after: redraw }));
      });
      if (s.triggerItemWhitelist) {
        grid.appendChild(field(item, (j) => gs(j).triggerItemWhitelist, "Cooldown", { label: lookup(T().TRIG, "Cooldown").label, help: lookup(T().TRIG, "Cooldown").help, after: redraw }));
        grid.appendChild(chipList(item, (j) => gs(j).triggerItemWhitelist.Triggeritems, "Auslösende Gegenstände", "Klassennamen von Gegenständen, die diese Anomalie auslösen (z. B. Hammer, XCP_Bolt). Zum Auslösen werfen oder fallen lassen.", [], redraw));
      }
      if (Array.isArray(s.triggerMutantWhitelist)) grid.appendChild(chipList(item, (j) => gs(j).triggerMutantWhitelist, "Auslösende Mutanten", "Klassennamen von Infizierten/Mutanten, die diese Anomalie auslösen (z. B. DayZInfected).", [], redraw));
      detail.appendChild(calcHost);
      detail.appendChild(h("div", { class: "section" }, [h("div", { class: "section-head", text: s.AnomalyName }), h("div", { class: "section-body" }, [grid])]));
    }
    box.appendChild(h("div", { class: "mp-split" }, [list, detail]));
  }

  // ---------------------------------------------------------------- Spawn (AnomalySpawn.json)
  function renderSpawn(box) {
    const item = spawnItem();
    if (!item) return empty(box, "AnomalySpawn.json");
    const j = item.json;
    box.appendChild(head("Anomalie-Spawn", "Allgemeine Spawn-Einstellungen, welche Artefakte welcher Detektor findet und eine Übersicht der Zonen. Die Zonen-Positionen selbst bearbeitest du in der Datei bzw. siehst sie auf der Karte.", "AnomalySpawn.json"));
    const calcHost = h("div", {});
    const redraw = () => {
      clear(calcHost);
      const out = [];
      const dist = num(j, "spawnDistanceNearPlayer");
      out.push(K().head("Aktivierung"));
      out.push(K().row("Umkreis um Spieler", K().fmt(dist, 0) + " m", "Fläche " + K().fmt((Math.PI * dist * dist) / 10000, 1) + " ha · Anteil der Karte " + K().fmt(((Math.PI * dist * dist) / (num(j, "worldSizeX") * num(j, "worldSizeY"))) * 100, 2) + " % je Spieler"));
      out.push(K().row("Prüfung", "alle " + K().fmtTime(num(j, "updateTime")), num(j, "enableAnomalyOptimization") === 1 ? "Optimierung an: nur Anomalien nahe Spielern" : "Optimierung aus: alle Anomalien dauerhaft aktiv (mehr Serverlast)"));
      const dyn = j.dynamicAnomaly || [];
      const cnt = {};
      let total = 0;
      dyn.forEach((z) => (z.anomalyData || []).forEach((a) => ((cnt[a.anomalyName] = (cnt[a.anomalyName] || 0) + (a.anomalyCount || 0)), (total += a.anomalyCount || 0))));
      out.push(K().head("Zonen"));
      out.push(K().row("Dynamische Zonen", String(dyn.length), total + " Anomalien insgesamt"));
      out.push(K().row("Statische Anomalien", String((j.staticAnomaly || []).length), ""));
      out.push(K().row("Teleport-Anomalien", String((j.teleportAnomaly || []).length), ""));
      const top = Object.keys(cnt).filter((k) => cnt[k] > 0);
      if (top.length) out.push(K().row("Anzahl je Art", top.map((k) => k + " ×" + cnt[k]).join(", "), ""));
      if (j.ArtefactsSpawnData && !j.ArtefactsSpawnData.length) out.push(K().row("ArtefactsSpawnData", "leer", "keine zusätzlichen Spawn-Daten hinterlegt"));
      const c = K().calcBox(out);
      if (c) calcHost.appendChild(c);
    };
    redraw();
    const grid = h("div", { class: "grid2" });
    Object.keys(T().SPAWN).forEach((k) => {
      if (j[k] === undefined) return;
      const info = lookup(T().SPAWN, k);
      grid.appendChild(field(item, (x) => x, k, { label: info.label, help: info.help, after: redraw, isInt: Number.isInteger(j[k]) }));
    });
    box.appendChild(calcHost);
    box.appendChild(h("div", { class: "section" }, [h("div", { class: "section-head", text: "Einstellungen" }), h("div", { class: "section-body" }, [grid])]));
    const efx = fileItem("efx_base");
    const sugg = efx ? efx.json.ArtEFXAllBase.map((a) => a.name) : [];
    const lists = h("div", { class: "grid2" });
    Object.keys(j)
      .filter((k) => /^Artefacts_/.test(k) && Array.isArray(j[k]))
      .forEach((k) => {
        const det = k.replace("Artefacts_", "");
        lists.appendChild(chipList(item, (x) => x[k], "Artefakte für " + det + " (" + j[k].length + ")", "Welche Artefakte der Detektor „" + det + "“ finden kann. Der Name muss ein Artefakt-Klassenname sein (Vorschläge aus der Artefakt-EFX-Datei).", sugg, redraw));
      });
    box.appendChild(h("div", { class: "section" }, [h("div", { class: "section-head", text: "Artefakte je Detektor" }), h("div", { class: "section-body" }, [lists])]));
  }

  // ---------------------------------------------------------------- Detektoren
  function detCalc(o, all) {
    const out = [];
    const r = num(o, "DetectorRange");
    const ang = Math.min(360, num(o, "WorkAngle"));
    const area = (ang / 360) * Math.PI * r * r;
    out.push(K().head("Erfassung"));
    out.push(K().row("Form", ang >= 360 ? "Vollkreis" : "Sektor " + K().fmt(ang, 0) + "°", ang >= 360 ? "erfasst rundum" : "nur in einem Kegel von " + K().fmt(ang, 0) + "° vor dem Spieler"));
    out.push(K().row("Fläche", K().fmt(area, 0) + " m²", "Reichweite " + K().fmt(r, 0) + " m · " + K().fmt(area / 10000, 2) + " ha"));
    out.push(K().row("Ziele", num(o, "MaxDisplayTargets") + " gleichzeitig", "Anzeige wechselt alle " + num(o, "DisplayCycleTicks") + " Tick(s)"));
    const what = [];
    if (num(o, "ArtefaktScanner") === 1) what.push("Artefakte");
    if (num(o, "AnomalieScanner") === 1) what.push("Anomalien");
    out.push(K().row("Findet", what.length ? what.join(" + ") : "nichts", ""));
    if (!what.length) out.push(K().warn("Weder Artefakt- noch Anomalie-Scanner sind an – der Detektor zeigt nichts an."));
    const rs = Object.keys(all)
      .map((k) => num(all[k], "DetectorRange"))
      .filter(Number.isFinite);
    if (rs.length > 1) out.push(K().row("Vergleich", "Reichweite Rang " + (rs.filter((x) => x > r).length + 1) + " von " + rs.length, "kürzeste " + K().fmt(Math.min.apply(null, rs), 0) + " m · weiteste " + K().fmt(Math.max.apply(null, rs), 0) + " m"));
    return out;
  }

  function renderDetectors(box) {
    const item = fileItem("an_detector");
    if (!item) return empty(box, "DetectorSettings.json");
    const names = Object.keys(item.json);
    if (!item.json[st.sel.detector]) st.sel.detector = names[0] || "";
    box.appendChild(head("Detektoren", "Reichweite, Winkel und Anzeige jedes Detektor-Typs. Links auswählen; rechts bearbeiten, unten die Live-Berechnung.", "DetectorSettings.json · " + names.length + " Detektoren"));
    const name = st.sel.detector;
    const calcHost = h("div", {});
    const redraw = () => {
      clear(calcHost);
      const c = K().calcBox(detCalc(item.json[name], item.json));
      if (c) calcHost.appendChild(c);
    };
    redraw();
    const list = h("div", { class: "mp-list" });
    names.forEach((n) => list.appendChild(h("button", { class: "mp-navbtn" + (n === name ? " active" : ""), type: "button", text: n, onclick: () => ((st.sel.detector = n), render()) })));
    const grid = h("div", { class: "grid2" });
    Object.keys(item.json[name]).forEach((k) => {
      const info = lookup(T().DET, k);
      grid.appendChild(field(item, (j) => j[name], k, { label: info.label, help: () => info.help + (k === "DetectorRange" ? "\n\nFläche bei Vollkreis: " + K().fmt(Math.PI * item.json[name][k] * item.json[name][k], 0) + " m²." : ""), after: redraw, isInt: Number.isInteger(item.json[name][k]) && !/Range|Offset|Angle/.test(k) }));
    });
    box.appendChild(h("div", { class: "mp-split" }, [list, h("div", { class: "mp-detail" }, [calcHost, h("div", { class: "section" }, [h("div", { class: "section-body" }, [grid])])])]));
    // Vergleichstabelle
    const body = h("tbody");
    names.forEach((n) => {
      const o = item.json[n];
      const ang = Math.min(360, num(o, "WorkAngle"));
      body.appendChild(h("tr", {}, [h("td", { text: n }), h("td", { text: K().fmt(num(o, "DetectorRange"), 0) + " m" }), h("td", { text: K().fmt(ang, 0) + "°" }), h("td", { text: K().fmt((ang / 360) * Math.PI * Math.pow(num(o, "DetectorRange"), 2), 0) + " m²" }), h("td", { text: String(num(o, "MaxDisplayTargets")) }), h("td", { text: (o.ArtefaktScanner === 1 ? "Artefakte " : "") + (o.AnomalieScanner === 1 ? "Anomalien" : "") })]));
    });
    box.appendChild(h("div", { class: "section" }, [h("div", { class: "section-head", text: "Vergleich aller Detektoren" }), h("div", { class: "section-body" }, [h("div", { class: "table-scroll" }, [h("table", { class: "ptable prod-table" }, [h("thead", {}, [h("tr", {}, ["Detektor", "Reichweite", "Winkel", "Fläche", "Ziele", "Findet"].map((t) => h("th", { text: t })))]), body])])])]));
  }

  // ---------------------------------------------------------------- Neuladen + Teleport
  function renderMisc(box) {
    const rl = fileItem("an_reload");
    box.appendChild(head("Neuladen & Teleport", "Automatisches Neuladen der Anomalie-Config und die Zufalls-Ziele der Teleport-Anomalien.", "AutoReload.json · StalkerAnomalyTeleport.json"));
    if (rl) {
      const j = rl.json;
      const calcHost = h("div", {});
      const redraw = () => {
        clear(calcHost);
        const out = [];
        out.push(K().head("Neuladen"));
        out.push(K().row("Automatisch", j.EnableAutoReload === 1 ? "alle " + K().fmtTime(num(j, "AutoReloadIntervalSeconds")) : "aus", j.EnableAutoReload === 1 ? K().fmt(86400 / num(j, "AutoReloadIntervalSeconds"), 1) + " Neuladungen pro Tag" : ""));
        out.push(K().row("Per Flag-Datei", j.EnableReloadFlag === 1 ? "möglich" : "aus", j.EnableReloadFlag === 1 ? "Datei anlegen: " + j.ReloadFlagPath + (j.DeleteReloadFlagAfterUse === 1 ? " (wird danach gelöscht)" : "") : ""));
        if (j.EnableAutoReload === 1 && num(j, "AutoReloadIntervalSeconds") < 300) out.push(K().warn("Unter 5 Minuten Neuladen belastet den Server unnötig."));
        const c = K().calcBox(out);
        if (c) calcHost.appendChild(c);
      };
      redraw();
      const grid = h("div", { class: "grid2" });
      Object.keys(j).forEach((k) => {
        const info = lookup(T().RELOAD, k);
        grid.appendChild(field(rl, (x) => x, k, { label: info.label, help: info.help, after: redraw }));
      });
      box.appendChild(calcHost);
      box.appendChild(h("div", { class: "section" }, [h("div", { class: "section-head", text: "Neuladen" }), h("div", { class: "section-body" }, [grid])]));
    } else box.appendChild(h("div", { class: "empty-state", text: "AutoReload.json ist nicht geladen." }));
    const tp = fileItem("an_teleport");
    if (tp) {
      const arr = tp.json.randomTeleportDestinations;
      const body = h("tbody");
      const draw = () => {
        clear(body);
        arr.forEach((p, i) =>
          body.appendChild(
            h("tr", {}, [
              h("td", { text: String(i + 1) }),
              h("td", {}, [h("input", { type: "text", value: p, placeholder: "x y z", oninput: (e) => ((arr[i] = e.target.value), mut(tp, () => {})) })]),
              h("td", {}, [h("button", { class: "btn icon small", type: "button", text: "✕", onclick: () => (arr.splice(i, 1), mut(tp, () => {}), draw()) })]),
            ])
          )
        );
      };
      draw();
      box.appendChild(
        h("div", { class: "section" }, [
          h("div", { class: "section-head", text: "Zufalls-Teleportziele" }),
          h("div", { class: "section-body" }, [
            h("div", { class: "field span2" }, [
              h("label", {}, ["Ziele (x y z)", tipNode("Mögliche Ziele für Teleport-Anomalien mit zufälligem Ziel. Der Spieler landet an einer dieser Positionen (vermutlich zufällig gewählt). Format: „x y z“, y = Höhe (0 = Bodenhöhe).")]),
              h("div", { class: "table-scroll" }, [h("table", { class: "ptable prod-table" }, [h("thead", {}, [h("tr", {}, ["#", "Koordinaten", ""].map((t) => h("th", { text: t })))]), body])]),
              h("div", { class: "toolbar" }, [h("button", { class: "btn small", type: "button", text: "Ziel hinzufügen", onclick: () => (arr.push("0 0 0"), mut(tp, () => {}), draw()) })]),
            ]),
          ]),
        ])
      );
    }
  }

  // ---------------------------------------------------------------- Artefakt-Effekte
  function efxPair(name) {
    const b = fileItem("efx_base");
    const m = fileItem("efx_medplus");
    const bi = b ? b.json.ArtEFXAllBase.findIndex((a) => a.name === name) : -1;
    const mi = m ? m.json.ArtEFXAllMedPlus.findIndex((a) => a.name === name) : -1;
    return { b: b, bi: bi, m: m, mi: mi };
  }
  function tickSec() {
    const t = fileItem("efx_timer");
    return t && num(t.json, "time") > 0 ? t.json.time / 1000 : 1;
  }

  function efxCalc(name) {
    const out = [];
    const pr = efxPair(name);
    const tick = tickSec();
    out.push(K().head("Takt: alle " + K().fmt(tick, 2) + " s (aus ArtEFXTimer.json" + (fileItem("efx_timer") ? "" : " – nicht geladen, Annahme 1 s") + ")"));
    const a = pr.bi > -1 ? pr.b.json.ArtEFXAllBase[pr.bi] : null;
    if (a) {
      if (a.enable !== 1) out.push(K().warn("Der Effekt dieses Artefakts ist ausgeschaltet (enable = 0)."));
      out.push(K().head("Wirkung im Rucksack/Inventar je Minute"));
      let any = false;
      T().EFX.forEach(([en, vk, label]) => {
        const v = num(a, vk);
        const on = a["enable" + en] === 1;
        if (!on || !v) return;
        any = true;
        const perMin = (v / tick) * 60;
        const max = MAXV[vk];
        let note = "";
        if (v < 0) note = max ? "von voll bis leer in " + K().fmtTime(max / (-v / tick)) : "";
        else if (v > 0 && (vk === "food" || vk === "water" || vk === "blood" || vk === "health")) note = max ? "von leer bis voll in " + K().fmtTime(max / (v / tick)) : "";
        else if (v > 0 && vk === "shock") note = "Schock-Maximum (100) nach " + K().fmtTime(100 / (v / tick)) + " (Annahme: positiver Wert = mehr Schock)";
        if (vk === "health" && v < 0) note = "tot nach " + K().fmtTime(100 / (-v / tick)) + " (100 HP, ohne Regeneration)";
        out.push(K().row(label, (perMin > 0 ? "+" : "") + K().fmt(perMin, 2) + " / min", note));
      });
      if (!any) out.push(K().row("Basiswerte", "keine aktiv", "kein Leben-/Blut-/Schock-/Nahrungs-/Wasser-Effekt"));
      out.push(K().row("drainQty", K().fmt(num(a, "drainQty"), 2), "vermutlich Multiplikator auf den Entzug (1 = normal) – hier nicht eingerechnet"));
    } else out.push(K().warn("Keine Basiswerte in ArtEFX.json für dieses Artefakt."));
    const mp = pr.mi > -1 ? pr.m.json.ArtEFXAllMedPlus[pr.mi] : null;
    if (mp) {
      out.push(K().head("MedPlus-Effekte je Minute"));
      let any = false;
      T().MPEFX.forEach(([en, vk, label]) => {
        if (mp[en] !== 1) return;
        const v = num(mp, vk);
        if (!v) return;
        any = true;
        if (/ChancePerTick/.test(vk)) {
          const p = v / 100;
          out.push(K().row(label, K().fmt(v, 2) + " % je Takt", "Ø alle " + K().fmtTime(tick / p) + " · in 1 Minute " + K().fmt((1 - Math.pow(1 - p, 60 / tick)) * 100, 1) + " %"));
        } else out.push(K().row(label, (v > 0 ? "+" : "") + K().fmt((v / tick) * 60, 2) + " / min", K().fmt(v, 3) + " je Takt"));
      });
      if (!any) out.push(K().row("MedPlus", "keine aktiv", ""));
      const med = P().byKind("medplus")[0];
      if (med && mp.enableOverdose === 1 && num(mp, "overdose") > 0) {
        const od = K().odData(med.json, "");
        const perSec = mp.overdose / tick;
        out.push(K().row("Überdosis-Malus", "ab " + K().fmtTime(od.T1 / Math.max(perSec - od.die, 1e-9)), perSec > od.die ? "MedPlus-Schwelle " + K().fmt(od.T1, 0) + ", Abbau " + K().fmt(od.die * 60, 1) + "/min" : "wird durch den Abbau (" + K().fmt(od.die * 60, 1) + "/min) ausgeglichen – kein Malus"));
      }
    } else if (pr.m) out.push(K().head("MedPlus"), K().row("MedPlus-Effekte", "nicht definiert", "kein Eintrag in ArtEFXMedPlus.json"));
    return out;
  }

  function newBase(name) {
    return { enable: 1, name: name, enableHealth: 0, health: 0.0, enableblood: 0, blood: 0.0, enableshock: 0, shock: 0.0, enablefood: 0, food: 0.0, enablewater: 0, water: 0.0, drainQty: 1.0 };
  }
  function newMed(name) {
    return { name: name, enableLaceration: 0, lacerationChancePerTick: 0.0, enableBrainConcussion: 0, brainconcussionChancePerTick: 0.0, enableSleep: 0, sleepQtyPerTick: 0.0, enableHygiene: 0, hygieneQtyPerTick: 0.0, enableMental: 0, mentalQtyPerTick: 0.0, enableAlchol: 0, alchol: 0.0, enableOverdose: 0, overdose: 0.0 };
  }

  function renderEfx(box) {
    const b = fileItem("efx_base");
    if (!b) return empty(box, "ArtEFX.json");
    const arr = b.json.ArtEFXAllBase;
    const names = arr.map((a) => a.name);
    if (names.indexOf(st.sel.efx) < 0) st.sel.efx = names[0] || "";
    const timer = fileItem("efx_timer");
    box.appendChild(head("Artefakt-Effekte", "Was ein Artefakt im Inventar bewirkt: Leben, Blut, Schock, Nahrung, Wasser (ArtEFX.json) und die MedPlus-Zusatzwerte (ArtEFXMedPlus.json). Alle Werte gelten pro Takt; der Takt steht in ArtEFXTimer.json.", "ArtEFX.json · ArtEFXMedPlus.json · ArtEFXTimer.json · " + names.length + " Artefakte"));
    if (timer) {
      const tg = h("div", { class: "grid2" }, [
        field(timer, (x) => x, "time", {
          label: "Takt (ms)",
          help: () => "Zeit zwischen zwei Effekt-Anwendungen in Millisekunden (laut Datei „Is in Milliseconds“).\n\nAktuell " + K().fmt(timer.json.time, 0) + " ms = alle " + K().fmt(timer.json.time / 1000, 2) + " s, also " + K().fmt(60000 / timer.json.time, 1) + " Takte pro Minute. Alle „…pro Takt“-Werte der Artefakte gelten pro Takt – bei kleinerem Takt wirken sie entsprechend schneller.",
          after: () => render(),
        }),
      ]);
      box.appendChild(h("div", { class: "section" }, [h("div", { class: "section-head", text: "Takt" }), h("div", { class: "section-body" }, [tg])]));
    }
    const calcHost = h("div", {});
    const name = st.sel.efx;
    const redraw = () => {
      clear(calcHost);
      const c = K().calcBox(efxCalc(name));
      if (c) calcHost.appendChild(c);
    };
    redraw();
    const filter = h("input", { type: "search", placeholder: "Artefakt suchen…", value: st.search, oninput: (e) => ((st.search = e.target.value), fillList()) });
    const list = h("div", { class: "mp-list" });
    const fillList = () => {
      clear(list);
      names
        .filter((n) => n.toLowerCase().indexOf(st.search.toLowerCase()) > -1)
        .forEach((n) => list.appendChild(h("button", { class: "mp-navbtn" + (n === name ? " active" : ""), type: "button", text: n.replace(/^Exodus_Artefakte_/, ""), title: n, onclick: () => ((st.sel.efx = n), render()) })));
    };
    fillList();
    const pr = efxPair(name);
    const detail = h("div", { class: "mp-detail" }, [calcHost]);
    // Basis
    const base = arr[pr.bi];
    const gb = h("div", { class: "grid2" });
    if (base) {
      const get = (j) => j.ArtEFXAllBase[pr.bi];
      gb.appendChild(field(b, get, "enable", { label: "Effekt aktiv", help: "1 = dieses Artefakt wirkt im Inventar, 0 = komplett ohne Wirkung.", after: redraw }));
      T().EFX.forEach(([en, vk, label, help]) => {
        gb.appendChild(field(b, get, "enable" + en, { label: label + " an", help: "Schaltet den Effekt „" + label + "“ ein oder aus.", after: redraw }));
        gb.appendChild(field(b, get, vk, { label: label + " je Takt", help: () => help + "\n\nBei Takt " + K().fmt(tickSec(), 2) + " s sind das " + K().fmt((num(get(b.json), vk) / tickSec()) * 60, 2) + " pro Minute.", after: redraw }));
      });
      gb.appendChild(field(b, get, "drainQty", { label: "drainQty", help: "Vermutlich ein Faktor auf die Entzugsmenge von Nahrung/Wasser (1 = normal). Die Bedeutung ist nicht dokumentiert.", after: redraw }));
    }
    detail.appendChild(h("div", { class: "section" }, [h("div", { class: "section-head", text: "Basis-Effekte" }), h("div", { class: "section-body" }, [gb])]));
    // MedPlus
    if (pr.m) {
      const gm = h("div", { class: "grid2" });
      if (pr.mi > -1) {
        const getm = (j) => j.ArtEFXAllMedPlus[pr.mi];
        T().MPEFX.forEach(([en, vk, label, help]) => {
          gm.appendChild(field(pr.m, getm, en, { label: label.replace(/ \(.*\)| je Takt/g, "") + " an", help: "Schaltet den MedPlus-Effekt ein oder aus.", after: redraw }));
          gm.appendChild(field(pr.m, getm, vk, { label: label, help: () => help, after: redraw }));
        });
      } else gm.appendChild(h("div", { class: "field span2" }, [h("button", { class: "btn small", type: "button", text: "MedPlus-Eintrag anlegen", onclick: () => (mut(pr.m, (j) => j.ArtEFXAllMedPlus.push(newMed(name))), render()) })]));
      detail.appendChild(h("div", { class: "section" }, [h("div", { class: "section-head", text: "MedPlus-Effekte" }), h("div", { class: "section-body" }, [gm])]));
    }
    detail.appendChild(
      h("div", { class: "toolbar" }, [
        h("button", { class: "btn small danger", type: "button", text: "Artefakt entfernen", onclick: () => { if (!confirm("„" + name + "“ aus ArtEFX (und MedPlus) entfernen?")) return; mut(b, (j) => j.ArtEFXAllBase.splice(pr.bi, 1)); if (pr.mi > -1) mut(pr.m, (j) => j.ArtEFXAllMedPlus.splice(pr.mi, 1)); render(); } }),
      ])
    );
    const addIn = h("input", { type: "text", placeholder: "Neuer Klassenname (z. B. Exodus_Artefakte_Neu)" });
    const left = h("div", { class: "mp-listcol" }, [
      filter,
      list,
      h("div", { class: "toolbar" }, [
        addIn,
        h("button", { class: "btn small", type: "button", text: "Hinzufügen", onclick: () => {
          const n = addIn.value.trim();
          if (!n || names.indexOf(n) > -1) return;
          mut(b, (j) => j.ArtEFXAllBase.push(newBase(n)));
          if (pr.m) mut(pr.m, (j) => j.ArtEFXAllMedPlus.push(newMed(n)));
          st.sel.efx = n;
          render();
        } }),
      ]),
    ]);
    box.appendChild(h("div", { class: "mp-split" }, [left, detail]));
  }

  function renderEfxOverview(box) {
    const b = fileItem("efx_base");
    if (!b) return empty(box, "ArtEFX.json");
    const tick = tickSec();
    box.appendChild(head("Artefakt-Übersicht", "Alle Artefakte mit ihren Wirkungen pro Minute (Takt " + K().fmt(tick, 2) + " s). Klick auf den Namen öffnet das Artefakt.", ""));
    const m = fileItem("efx_medplus");
    const body = h("tbody");
    b.json.ArtEFXAllBase.forEach((a) => {
      const cells = T().EFX.map(([en, vk]) => (a["enable" + en] === 1 && a[vk] ? (a[vk] > 0 ? "+" : "") + K().fmt((a[vk] / tick) * 60, 1) : "–"));
      const mp = m ? m.json.ArtEFXAllMedPlus.find((x) => x.name === a.name) : null;
      const extra = mp ? T().MPEFX.filter(([en, vk]) => mp[en] === 1 && mp[vk]).map(([, , l]) => l.replace(/ \(.*\)| je Takt/g, "")).join(", ") : "";
      body.appendChild(
        h("tr", { class: a.enable === 1 ? "" : "muted" }, [
          h("td", {}, [h("button", { class: "linklike", type: "button", text: a.name.replace(/^Exodus_Artefakte_/, ""), onclick: () => ((st.sel.efx = a.name), (st.view = { type: "efx" }), render()) })]),
          h("td", { text: a.enable === 1 ? "an" : "aus" }),
        ].concat(cells.map((c) => h("td", { text: c })), [h("td", { class: "small", text: extra || "–" })]))
      );
    });
    box.appendChild(h("div", { class: "table-scroll" }, [h("table", { class: "ptable prod-table" }, [h("thead", {}, [h("tr", {}, ["Artefakt", "Effekt"].concat(T().EFX.map((x) => x[2] + "/min"), ["MedPlus"]).map((t) => h("th", { text: t })))]), body])]));
  }

  // ---------------------------------------------------------------- Gerüst
  function head(title, blurb, file) {
    return h("div", { class: "mp-sec-head" }, [h("h2", { text: title }), h("div", { class: "muted", text: blurb }), file ? h("div", { class: "mono muted small", text: file }) : null]);
  }
  function empty(box, file) {
    box.appendChild(h("div", { class: "empty-state", text: file + " ist nicht geladen. Lade den Ordner über „Ordner laden…“ oben." }));
  }

  const NAV = [
    ["Anomalien", [["balance", "Balance"], ["balover", "Balance-Übersicht"], ["trigger", "Auslöser"], ["spawn", "Spawn"]]],
    ["Detektoren", [["detector", "Detektoren"], ["misc", "Neuladen & Teleport"]]],
    ["Artefakte", [["efx", "Artefakt-Effekte"], ["efxover", "Artefakt-Übersicht"]]],
  ];
  const RENDER = { balance: renderBalance, balover: renderBalanceOverview, trigger: renderTrigger, spawn: renderSpawn, detector: renderDetectors, misc: renderMisc, efx: renderEfx, efxover: renderEfxOverview };

  let root = null;
  function render() {
    if (!root) return;
    clear(root);
    const any = KINDS.some((k) => fileItem(k)) || spawnItem();
    root.appendChild(h("div", { class: "toolbar" }, [h("button", { class: "btn primary", type: "button", text: "Ordner laden…", onclick: () => P().pick(true) })]));
    if (!any) {
      root.appendChild(
        h("div", { class: "empty-state" }, [
          h("div", { class: "drop-title", text: "Anomalien, Detektoren & Artefakte" }),
          h("p", { text: "Lade die Ordner „Anomaly & Detectoren“ und „Artefakt EFX“ (über den Knopf oben oder im Projekt-Tab). Änderungen werden wie bei Dialogen und Tradern in die JSON-Dateien zurückgeschrieben („Änderungen speichern“ oben rechts)." }),
        ])
      );
      return;
    }
    const layout = h("div", { class: "ov2 mp" });
    const nav = h("div", { class: "mp-nav" });
    NAV.forEach(([title, items]) => {
      nav.appendChild(h("div", { class: "nav-title", text: title }));
      items.forEach(([k, l]) => nav.appendChild(h("button", { class: "mp-navbtn" + (st.view.type === k ? " active" : ""), type: "button", text: l, onclick: () => ((st.view = { type: k }), render()) })));
    });
    layout.appendChild(nav);
    const content = h("div", { class: "mp-content" });
    layout.appendChild(content);
    root.appendChild(layout);
    content.appendChild(h("div", { class: "issue ok mp-note", text: "Für diese Mods liegt keine Doku vor: Die „?“-Erklärungen sind aus den Wertenamen und den Beispieldateien abgeleitet („vermutlich“ = nicht sicher). Die Live-Rechnungen sind Näherungen mit den eingestellten Annahmen." }));
    (RENDER[st.view.type] || renderBalance)(content);
  }

  function init(panel) {
    root = panel;
    P().registerSerializer(KINDS, K().stringify);
    render();
    return { refresh: render };
  }

  EQE.Anomaly = {
    init: init,
    KINDS: KINDS,
    openItem: (uid) => {
      const it = P().get(uid);
      if (!it) return;
      const map = { an_balance: "balance", an_trigger: "trigger", an_detector: "detector", an_reload: "misc", an_teleport: "misc", efx_base: "efx", efx_medplus: "efx", efx_timer: "efx", anomalies: "spawn" };
      if (map[it.kind]) st.view = { type: map[it.kind] };
      render();
    },
  };
})(window.EQE);
