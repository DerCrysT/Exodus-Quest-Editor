/**
 * Exodus Editor – Radiation-Editor (Radiation-Mod): GeneralSetting.json, BombingTrim.json sowie die Tabellen
 * (Strahlungszonen, Wrack-Zonen, Schutz-Ausrüstung, Filter). Aufbau wie der MedPlus-Editor: „?“-Erklärungen und Live-Berechnungen.
 * Änderungen laufen über den Projekt-Store und werden beim Speichern in die JSON-Dateien geschrieben.
 */
(function (EQE) {
  "use strict";
  const h = EQE.h;
  const clear = EQE.clear;
  const P = () => EQE.Project;
  const K = () => EQE.MPKit;
  const T = () => EQE.RadText;
  const D = () => EQE.RadData;

  const KINDS = { general: "rad_general", bombing: "rad_bombing" };
  const TABLE_KINDS = ["rad_zones", "rad_wrecks", "rad_cloth", "rad_filter"];
  const HP_MAX = 100;

  // ---------------------------------------------------------------- Zustand
  const st = {
    view: { type: "sec", file: "general", key: "disease" },
    general: "",
    bombing: "",
    search: "",
    calc: { intake: 20, protect: 0, filterQty: 100 }, // Annahmen der Live-Rechnung (nicht in der Datei)
    zone: { rad_zones: "", rad_wrecks: "" },
    zoneFilter: "",
  };

  // ---------------------------------------------------------------- Katalog
  let CATS = null;
  function cats() {
    if (CATS) return CATS;
    CATS = {};
    ["general", "bombing"].forEach((f) => {
      const secs = D()[f].map(([key, keys]) => ({ key: key, keys: keys }));
      const byKey = {};
      secs.forEach((s) => s.keys.forEach(([k, t]) => (byKey[k] = { sec: s.key, t: t })));
      CATS[f] = { secs: secs, byKey: byKey, bySec: Object.fromEntries(secs.map((s) => [s.key, s])) };
    });
    return CATS;
  }

  // ---------------------------------------------------------------- Dateien
  function mainItem(file) {
    const items = P().byKind(KINDS[file]);
    let it = items.find((i) => i.uid === st[file]);
    if (!it) it = items.find((i) => !/_old/i.test(i.fileId || "")) || items[0];
    if (it) st[file] = it.uid;
    return it || null;
  }
  const fileItem = (kind) => P().byKind(kind).find((i) => !/_old/i.test(i.fileId || "")) || P().byKind(kind)[0] || null;
  const gen = () => {
    const i = mainItem("general");
    return i ? i.json : null;
  };
  const bomb = () => {
    const i = mainItem("bombing");
    return i ? i.json : null;
  };
  const medplusJson = () => {
    const i = P().byKind("medplus").find((x) => !/_old/i.test(x.fileId || "")) || P().byKind("medplus")[0];
    return i ? i.json : null;
  };

  const num = (c, k) => (c && typeof c[k] === "number" ? c[k] : NaN);
  const STAGES = [
    ["stage1Threshold", "Stufe 1 (Husten)"],
    ["stage2Threshold", "Stufe 2 (Erbrechen)"],
    ["stage3Threshold", "Stufe 3 (Blutungen)"],
    ["stage4Threshold", "Stufe 4 (Lebensverlust)"],
    ["stageCritical", "Kritisch (Todesgefahr)"],
  ];

  // ---------------------------------------------------------------- Live-Berechnungen
  function timeRows(out, g, rate, label) {
    out.push(K().head(label));
    STAGES.forEach(([k, l]) => {
      const t = num(g, k);
      if (Number.isFinite(t)) out.push(K().row(l, K().fmtTime(t / rate), K().fmt(t, 0) + " ÷ " + K().fmt(rate, 2) + " pro Sekunde"));
    });
  }

  const CALC_G = {
    agent(c, out) {
      const rate = num(c, "radAgentDieOffSpeedPerSEC");
      if (num(c, "enableDieOff") !== 1) {
        out.push(K().warn("Der natürliche Abbau ist aus (enableDieOff = 0): Strahlung geht nur durch Anti-Rad, Wodka/Kwas usw. wieder weg."));
        return;
      }
      out.push(K().head("Natürlicher Abbau"));
      out.push(K().row("Abbau", K().fmt(rate * 60, 1) + " pro Minute", K().fmt(rate) + " pro Sekunde"));
      STAGES.forEach(([k, l]) => {
        const t = num(c, k);
        if (Number.isFinite(t)) out.push(K().row("Von „" + l + "“ bis 0", K().fmtTime(t / rate), ""));
      });
    },
    disease(c, out) {
      const tick = num(c, "radiationMDFRTickTime");
      const crit = num(c, "stageCritical");
      out.push(K().head("Schwellen"));
      STAGES.forEach(([k, l]) => out.push(K().row(l, K().fmt(num(c, k), 0), K().fmt((num(c, k) / crit) * 100, 0) + " % von kritisch")));
      const st0 = STAGES.map(([k]) => num(c, k));
      if (st0.some((v, i) => i && v < st0[i - 1])) out.push(K().warn("Die Stufen sollten aufsteigen: 1 < 2 < 3 < 4 < kritisch."));
      timeRows(out, c, st.calc.intake, "Zeit bis zur Stufe bei Aufnahme von " + K().fmt(st.calc.intake, 1) + " pro Sekunde (einstellbar oben)");
      out.push(K().head("Was in der jeweiligen Stufe passiert (pro Takt = " + K().fmt(tick) + " s)"));
      const perMin = 60 / tick;
      const p1 = num(c, "coughChancePerTickStage1") / 100;
      const bl1 = num(c, "bloodLossCoughStage1");
      out.push(K().row("Stufe 1: Husten", K().fmt(p1 * perMin, 1) + " pro Minute", "Ø alle " + K().fmtTime(tick / p1) + " · Blutverlust " + K().fmt(p1 * perMin * bl1, 0) + " pro Minute → Verbluten (5000 Blut) nach " + K().fmtTime(5000 / (p1 * bl1 / tick))));
      const p2 = num(c, "vomitChancePerTickStage2") / 100;
      const bl2 = num(c, "bloodLossVomitStage2");
      out.push(K().row("Stufe 2: Erbrechen", K().fmt(p2 * perMin, 1) + " pro Minute", "Ø alle " + K().fmtTime(tick / p2) + " · Blutverlust " + K().fmt(p2 * perMin * bl2, 0) + " pro Minute → Verbluten nach " + K().fmtTime(5000 / (p2 * bl2 / tick))));
      const p3 = num(c, "bleedCutChancePerTickStage3") / 100;
      out.push(K().row("Stufe 3: Blutung", "Ø nach " + K().fmtTime(tick / p3), K().fmt(p3 * 100, 0) + " % je Takt, zu bluten zu beginnen"));
      const p4 = num(c, "hpLossChancePerTickStage4") / 100;
      const q4 = num(c, "hpLossQtyPerTick");
      const hpPerSec = (p4 * q4) / tick;
      out.push(K().row("Stufe 4: Lebensverlust", K().fmt(hpPerSec * 60, 2) + " HP pro Minute", hpPerSec > 0 ? "Tod nach " + K().fmtTime(HP_MAX / hpPerSec) + " (100 HP, ohne Regeneration)" : "kein Lebensverlust"));
      if (num(c, "enableStageCriticalDeath") === 1) {
        const pd = num(c, "deathCriticalStagePerTick") / 100;
        out.push(K().row("Kritisch: Tod", "Ø nach " + K().fmtTime(tick / pd), K().fmt(pd * 100, 1) + " % je Takt · in 1 Minute: " + K().fmt((1 - Math.pow(1 - pd, perMin)) * 100, 1) + " %"));
      } else out.push(K().warn("Tod im kritischen Bereich ist aus (enableStageCriticalDeath = 0)."));
      const h4 = [num(c, "stage1MinThreshold"), num(c, "stage1MaxThreshold")];
      if (h4[0] > h4[1]) out.push(K().warn("Stufe 1: Mindest-Abstand ist größer als der Höchst-Abstand."));
    },
    zone(c, out) {
      const tick = num(c, "radiationTriggerTickTime");
      const q = num(c, "qtyConsumedByFiltersInRad");
      out.push(K().head("Filter"));
      out.push(K().row("Verbrauch", K().fmt((q * 60) / tick, 2) + " pro Minute", K().fmt(q, 3) + " je Takt à " + K().fmt(tick) + " s"));
      out.push(K().row("Haltbarkeit eines Filters", K().fmtTime(st.calc.filterQty / (q / tick)), "Annahme: Filtermenge " + K().fmt(st.calc.filterQty, 0) + " (oben einstellbar)"));
      const cl = fileItem("rad_cloth");
      if (cl) {
        const vals = Array.from(new Set(cl.json.RadClothAll.map((x) => x.protection))).sort((a, b) => b - a);
        out.push(K().head("Schutz beschädigter Ausrüstung (Annahme: Schutz × Prozent)"));
        const w = num(c, "wornProtection");
        const d = num(c, "damagedProtection");
        const b = num(c, "badlyDamagedProtection");
        vals.slice(0, 5).forEach((v) => out.push(K().row(K().fmt(v, 0) + " mSv Maske", "abgenutzt " + K().fmt((v * w) / 100, 0) + " · beschädigt " + K().fmt((v * d) / 100, 0) + " · stark beschädigt " + K().fmt((v * b) / 100, 0), cl.json.RadClothAll.filter((x) => x.protection === v).length + " Ausrüstungsteile")));
        if (w < d || d < b) out.push(K().warn("Der Schutz sollte mit dem Zustand sinken: abgenutzt ≥ beschädigt ≥ stark beschädigt."));
      }
      if (num(c, "enableInsideBuildingProtection") !== 1) out.push(K().row("Gebäudeschutz", "aus", "In Gebäuden gibt es keinen Schutz vor der Zonenstrahlung (enableInsideBuildingProtection = 0)"));
      if (num(c, "GasMaskOnly") === 1) out.push(K().row("Schutz", "nur Gasmaske", "andere Schutzausrüstung zählt nicht (GasMaskOnly = 1)"));
    },
    cure(c, out) {
      const tick = num(c, "AntiRadiationTickTime");
      const last = num(c, "AntiRadiationLastingTime");
      const ticks = Math.floor(last / tick);
      const per = num(c, "AntiRadiationQTYPerTick");
      const total = per * ticks;
      out.push(K().head("Anti-Rad-Mittel (eine Dosis)"));
      out.push(K().row("Entfernt gesamt", K().fmt(total, 0), K().fmt(per) + " × " + ticks + " Takte (" + K().fmtTime(last) + ")"));
      out.push(K().row("Entspricht Aufenthalt von", K().fmtTime(total / st.calc.intake), "bei " + K().fmt(st.calc.intake, 1) + " Strahlung pro Sekunde (oben einstellbar)"));
      const g = c;
      out.push(K().head("Weitere Mittel"));
      out.push(K().row("Wodka", K().fmt(num(g, "VodkaRadCurePerCircle"), 0) + " je Schluck", "10 Schlucke: " + K().fmt(num(g, "VodkaRadCurePerCircle") * 10, 0)));
      out.push(K().row("Kwas", K().fmt(num(g, "KvassRadCurePerCircle"), 0) + " je Schluck", "10 Schlucke: " + K().fmt(num(g, "KvassRadCurePerCircle") * 10, 0)));
      out.push(K().row("Schild / Pillen", K().fmt(num(g, "ShieldRadiationProtection"), 0) + " % blockiert", "für " + K().fmtTime(num(g, "ShieldRadiationLastingTime"))));
      out.push(K().row("Injektion", "+" + K().fmt(num(g, "recoverRADonInject"), 0) + " Strahlung", "kommt laut Name bei der Injektion zurück – ein Einsatz muss das ausgleichen"));
      const mp = medplusJson();
      if (mp) {
        const od = K().odData(mp, "");
        out.push(K().head("Überdosis (MedPlus ist geladen: Malus ab " + K().fmt(od.T1, 0) + ", Abbau " + K().fmt(od.die * 60, 1) + " pro Minute)"));
        [["NYRad_AntiRadOverdosePerTick", "Anti-Rad", last], ["NYRad_ShieldRadOverdosePerTick", "Schild", num(g, "ShieldRadiationLastingTime")]].forEach(([k, l, dur]) => {
          const dose = num(g, k) * Math.floor(dur / tick);
          const n = K().dosesTo(od.T1, dose, od.die, 0);
          out.push(K().row(l, K().fmt(dose, 1) + " Wirkstoff je Dosis", "Malus ab " + n + (n === 1 ? " Dosis" : " Dosen") + " (alle auf einmal) · baut sich in " + K().fmtTime(dose / od.die) + " ab"));
        });
      }
    },
    waste(c, out) {
      const tickMs = num(c, "WasteTickTime");
      const per = num(c, "RadInsertByWastePerTick");
      const perSec = per / (tickMs / 1000);
      out.push(K().head("Strahlung durch Abfall im Inventar"));
      out.push(K().row("Aufnahme", K().fmt(perSec * 60, 0) + " pro Minute", K().fmt(per) + " alle " + K().fmt(tickMs, 0) + " ms"));
      if (num(c, "stage1Threshold") > 0) {
        out.push(K().row("Bis Stufe 1", K().fmtTime(num(c, "stage1Threshold") / perSec), "ohne Schutzbehälter"));
        out.push(K().row("Bis kritisch", K().fmtTime(num(c, "stageCritical") / perSec), ""));
      }
      if (tickMs < 100) out.push(K().warn("WasteTickTime ist in MILLISEKUNDEN angegeben – unter 100 ms belastet den Server stark."));
    },
  };

  const BOMB_CLASSES = { min: "MIN", mid: "MID", max: "MAX" };

  function bombClassRows(b, g, out, size) {
    const S = BOMB_CLASSES[size];
    const pre = "SelectedBombFromPanel" + S;
    const rMin = num(b, pre + "BombRadiusMin");
    const rMax = num(b, pre + "BombRadiusMax");
    const area = (r) => (Math.PI * r * r) / 1e6;
    out.push(K().head("Größe"));
    out.push(K().row("Radius", K().fmt(rMin, 0) + " – " + K().fmt(rMax, 0) + " m", "Durchmesser " + K().fmt(rMin * 2, 0) + " – " + K().fmt(rMax * 2, 0) + " m"));
    out.push(K().row("Fläche", K().fmt(area(rMin), 2) + " – " + K().fmt(area(rMax), 2) + " km²", "π · r²"));
    out.push(K().row("Höhe", K().fmt(num(b, pre + "HeightMin"), 0) + " – " + K().fmt(num(b, pre + "HeightMax"), 0) + " m", ""));
    const dead = num(b, "explosionsDeadlyRadius" + S + "Bomb");
    const shock = num(b, "radiusFromCenterExcludedTheKillingRadius" + S + "Bomb");
    out.push(K().row("Tödlicher Radius", K().fmt(dead, 0) + " m", "Schockradius " + K().fmt(shock, 0) + " m, Schock " + K().fmt(num(b, "ShockQuantityOnImpact" + S), 0)));
    if (dead > shock) out.push(K().warn("Der tödliche Radius ist größer als der Schockradius."));
    const rad = [num(b, pre + "BombRadiationMin"), num(b, pre + "BombRadiationMax")];
    const pct = num(b, "SelectedBombFromPanelPercentageAbsorbed");
    const tick = num(b, "insertTimerFreq");
    out.push(K().head("Strahlung (Annahme: Aufnahme je Takt = Strahlung × " + K().fmt(pct, 0) + " %)"));
    rad.forEach((r, i) => {
      const rate = ((r * pct) / 100) / tick;
      out.push(K().row(i ? "Maximum" : "Minimum", K().fmt(r, 0) + " → " + K().fmt(rate, 1) + " pro Sekunde", g ? "kritisch nach " + K().fmtTime(num(g, "stageCritical") / rate) + " · Stufe 1 nach " + K().fmtTime(num(g, "stage1Threshold") / rate) : "Radiation-Config nicht geladen"));
    });
    if (rad[0] > rad[1]) out.push(K().warn("Die Mindest-Strahlung ist größer als die Höchst-Strahlung."));
    if (rMin > rMax) out.push(K().warn("Der Mindest-Radius ist größer als der Höchst-Radius."));
  }

  const CALC_B = {
    bgeneral(c, out) {
      if (num(c, "enableBombing") !== 1) out.push(K().warn("Das Bombardement ist aus (enableBombing = 0) – die übrigen Werte wirken nicht."));
      const start = num(c, "serverTimerStartBombing");
      out.push(K().head("Zeitplan"));
      out.push(K().row("Start nach", start > 86400 * 30 ? "praktisch nie" : K().fmtTime(start), K().fmt(start, 0) + " Sekunden nach Serverstart" + (start >= 999999 ? " (Platzhalterwert)" : "")));
      out.push(K().row("Dauer", K().fmtTime(num(c, "lastingTimeWholeMapBombed")), ""));
      if (num(c, "AllMapEvent") !== 1) out.push(K().row("Ganze Karte", "aus", "das Ereignis betrifft nur die Panel-Bomben (AllMapEvent = 0)"));
    },
    kill(c, out) {
      const dead = num(c, "explosionsDeadlyRadiusAllMapBombed");
      const shock = num(c, "radiusFromCenterExcludedTheKillingRadiusAllMap");
      out.push(K().head("Radien um den Einschlag"));
      out.push(K().row("Tödlich", K().fmt(dead, 0) + " m", "Fläche " + K().fmt(Math.PI * dead * dead, 0) + " m²"));
      out.push(K().row("Schock", K().fmt(shock, 0) + " m", "Ring " + K().fmt(Math.PI * (shock * shock - dead * dead), 0) + " m² (nicht tödlich, aber " + K().fmt(num(c, "ShockQuantityOnImpact"), 0) + " Schock)"));
      if (dead > shock) out.push(K().warn("Der tödliche Radius ist größer als der Schockradius."));
      const off = ["enableKillPlayers", "enableKillZombies", "enableKillAnimals", "enableDestroyCars", "enableDestroyBaseBuildings"].filter((k) => num(c, k) !== 1);
      if (off.length) out.push(K().row("Ausgeschaltet", off.length + " von 5", off.join(", ")));
    },
    event(c, out) {
      const tick = num(c, "insertTimerFreq");
      const amount = num(c, "radiationAmountDuringEvent");
      const pct = num(c, "percentageTakenFromAgent");
      const rate = ((amount * pct) / 100) / tick;
      const g = gen();
      out.push(K().head("Strahlung während des Ereignisses (Annahme: Aufnahme je Takt = Strahlung × Prozent)"));
      out.push(K().row("Aufnahme", K().fmt(rate, 1) + " pro Sekunde", K().fmt(amount, 0) + " × " + K().fmt(pct, 0) + " % alle " + K().fmt(tick) + " s"));
      if (g) {
        STAGES.forEach(([k, l]) => out.push(K().row(l, "nach " + K().fmtTime(num(g, k) / rate), "ohne Schutz")));
        const dur = num(bomb(), "lastingTimeWholeMapBombed");
        if (Number.isFinite(dur)) {
          const total = rate * dur;
          out.push(K().row("Gesamt in " + K().fmtTime(dur), K().fmt(total, 0), total >= num(g, "stageCritical") ? "über der kritischen Schwelle – ohne Schutz tödlich" : "unter der kritischen Schwelle (" + K().fmt(num(g, "stageCritical"), 0) + ")"));
        }
      } else out.push(K().row("Hinweis", "Radiation-Config nicht geladen", "für die Zeit bis zu den Stufen"));
      out.push(K().head("Warnung"));
      out.push(K().row("Ansage", K().fmtTime(num(c, "adviceTimerBombing")) + " vor der Bombe", num(c, "enableAdviceBombing") === 1 ? (num(c, "enableAdviceOnlyToPersonalRadio") === 1 ? "nur mit funktionierendem Funkgerät" : "für alle Spieler") : "Warnungen sind aus"));
      out.push(K().row("Schutz Gasmaske", "beschädigt " + K().fmt(num(c, "BombGMdamagedProtection") * 100, 0) + " % · stark beschädigt " + K().fmt(num(c, "BombGMbadlyDamagedProtection") * 100, 0) + " %", "Faktor 0–1 laut Doku"));
      const z = c.safeZones || [];
      const r = c.radius || [];
      out.push(K().head("Sichere Zonen"));
      out.push(K().row("Anzahl", String(z.length), z.map((s, i) => s + " (r " + (r[i] || "?") + " m)").join(" · ")));
      if (z.length !== r.length) out.push(K().warn("Sichere Zonen (" + z.length + ") und Radien (" + r.length + ") sind nicht gleich lang."));
    },
    panel(c, out) {
      out.push(K().head("Panel-Bomben"));
      out.push(K().row("Wartezeit", K().fmtTime(num(c, "waitBeforeStartingEventPanelButton")), "nach dem Knopfdruck"));
      ["Intensity", "Height", "Radius"].forEach((k) => out.push(K().row("Zufall: " + { Intensity: "Intensität", Height: "Höhe", Radius: "Radius" }[k], num(c, "SelectedBombFromPanelRandomize" + k) === 1 ? "ja" : "nein", num(c, "SelectedBombFromPanelRandomize" + k) === 1 ? "zwischen Min und Max" : "immer der Höchstwert")));
      out.push(K().row("Strahlung", num(c, "SelectedBombFromPanelWholeOrScaled") === 1 ? "flach" : "skaliert", "ein Wert in der ganzen Zone bzw. zur Mitte hin stärker"));
    },
    min(c, out) {
      bombClassRows(c, gen(), out, "min");
    },
    mid(c, out) {
      bombClassRows(c, gen(), out, "mid");
    },
    max(c, out) {
      bombClassRows(c, gen(), out, "max");
    },
  };

  function calcFor(file, secKey) {
    const item = mainItem(file);
    if (!item) return [];
    const out = [];
    try {
      const fn = (file === "general" ? CALC_G : CALC_B)[secKey];
      if (fn) fn(item.json, out);
    } catch (e) {
      out.push(K().warn("Berechnung nicht möglich: " + e.message));
    }
    return out;
  }

  // ---------------------------------------------------------------- Felder
  const tipNode = (t) => K().tipNode(t);

  function secTickKey(file, secKey) {
    const map = { disease: "radiationMDFRTickTime", zone: "radiationTriggerTickTime", cure: "AntiRadiationTickTime", waste: "WasteTickTime", event: "insertTimerFreq", agent: "" };
    return file === "general" || secKey === "event" ? map[secKey] || "" : "";
  }

  function explain(item, file, secKey, key, info) {
    const c = item.json;
    const v = c[key];
    const d = T().docOf(key);
    const lines = [info.help];
    const interp = [];
    const tk = secTickKey(file, secKey);
    let tick = tk && typeof c[tk] === "number" ? c[tk] : NaN;
    if (tk === "WasteTickTime") tick = tick / 1000;
    const crit = num(c, "stageCritical");
    const isFlag = d ? d.type === "bool" : (v === 0 || v === 1) && /^(enable|Gas|Gather|switch|SelectedBombFromPanelRandomize|SelectedBombFromPanelWhole|unconIf|AllMap|clean|make)/i.test(key);
    if (typeof v === "number") {
      if (isFlag && (v === 0 || v === 1)) {
        interp.push(v === 1 ? "Aktuell AN." : "Aktuell AUS.");
        interp.push("Bei AUS entfällt die Funktion „" + T().titleOf(secKey) + "“ bzw. dieses Verhalten.");
      } else if (/Threshold$/.test(key) && /^stage/.test(key) && Number.isFinite(crit)) {
        interp.push("Ab einem Strahlungswert von " + K().fmt(v, 0) + " beginnt diese Stufe (" + K().fmt((v / crit) * 100, 0) + " % von kritisch " + K().fmt(crit, 0) + ").");
        interp.push("Bei einer Aufnahme von " + K().fmt(st.calc.intake, 1) + " pro Sekunde erreichst du sie nach " + K().fmtTime(v / st.calc.intake) + " (Wert oben einstellbar).");
      } else if (/ChancePerTick|StagePerTick|Chance.*Stage/i.test(key) || /PerTick/i.test(key) && /%/.test(d ? d.unit : "")) {
        const p = v / 100;
        interp.push("Bei jedem Takt wird mit " + K().fmt(v, 2) + " % gewürfelt.");
        if (p > 0 && Number.isFinite(tick)) interp.push("Im Schnitt tritt es nach " + K().fmtTime(tick / p) + " ein (ein Wurf alle " + K().fmt(tick) + " s). Innerhalb einer Minute: " + K().fmt((1 - Math.pow(1 - p, 60 / tick)) * 100, 1) + " %.");
      } else if (/Chance/i.test(key)) {
        interp.push(K().fmt(v, 2) + " % – im Schnitt nach " + (v > 0 ? K().fmt(100 / v, 1) : "∞") + " Versuchen.");
      } else if (/TickTime$|insertTimerFreq$/.test(key)) {
        const sec = key === "WasteTickTime" ? v / 1000 : v;
        interp.push("Alle " + K().fmt(sec) + " s wird gerechnet = " + K().fmt(60 / sec, 1) + " Takte pro Minute. Alle „…PerTick“-Werte dieses Bereichs gelten pro Takt.");
      } else if (/Radius/i.test(key)) {
        interp.push(K().fmt(v, 0) + " m → Fläche " + K().fmt(Math.PI * v * v, 0) + " m² (" + K().fmt((Math.PI * v * v) / 10000, 2) + " ha).");
      } else if (/PerTick$/.test(key) && Number.isFinite(tick)) {
        interp.push(K().fmt(v, 3) + " pro Takt = " + K().fmt(v / tick, 3) + " pro Sekunde, " + K().fmt((v * 60) / tick, 2) + " pro Minute.");
      } else if (/(Lasting|Duration|Timer|Offset|Time)/i.test(key) && !/Tick/.test(key)) {
        interp.push(K().fmtTime(v) + ".");
      } else if (d && d.unit === "%") {
        interp.push(K().fmt(v, 2) + " %.");
      } else if (d && d.unit === "SEC") {
        interp.push(K().fmtTime(v) + ".");
      } else {
        interp.push("Aktueller Wert: " + K().fmt(v, 4) + ".");
      }
    } else if (Array.isArray(v)) interp.push("Liste mit " + v.length + " Einträgen.");
    if (interp.length) lines.push("Interpretation (aus Name, Doku und deinen Werten abgeleitet):\n" + interp.join("\n"));
    const orig = K().origOf(item);
    const cmp = [];
    if (d && typeof v === "number" && Number.isFinite(Number(d.def)) && Number(d.def) !== v) {
      const dv = Number(d.def);
      cmp.push("Standard laut Doku: " + dv + (dv !== 0 ? " → dein Wert liegt " + K().fmt(Math.abs((v / dv - 1) * 100), 0) + " % " + (v > dv ? "darüber" : "darunter") : "") + ".");
    }
    if (orig && !K().sameVal(orig[key], v)) cmp.push("Geladener Wert (Datei): " + JSON.stringify(orig[key]) + ".");
    if (cmp.length) lines.push(cmp.join(" "));
    return lines.join("\n\n");
  }

  function isBoolKey(item, key) {
    const v = item.json[key];
    if (v !== 0 && v !== 1) return false;
    const d = T().docOf(key);
    if (d) return d.type === "bool" && !/(Chance|Time|Tick)/i.test(key);
    return /^(enable|GasMask|Gather|switch|SelectedBombFromPanelRandomize|SelectedBombFromPanelWhole|unconIf|AllMap|clean|make)/i.test(key);
  }

  function fieldRow(item, file, secKey, key, type, afterChange) {
    const info = T().info(secKey, key);
    const val = item.json[key];
    const redraw = () => render();
    if (val === undefined) {
      return h("div", { class: "field" }, [
        h("label", {}, [info.label, tipNode(info.help), h("span", { class: "pill", text: "nicht in der Datei" })]),
        h("button", { class: "btn small", type: "button", text: "Hinzufügen", onclick: () => (K().setVal(item, key, type === "a" ? [] : type === "s" ? "" : 0), redraw()) }),
      ]);
    }
    let control;
    if (type === "a") control = K().chipEditor(item, key, key === "containerProtectors" ? K().classSuggest("CfgVehicles") : null, afterChange);
    else if (type === "s") control = h("input", { type: "text", value: val, oninput: (e) => K().setVal(item, key, e.target.value) });
    else if (isBoolKey(item, key)) {
      control = h("label", { class: "checkrow" }, [
        h("input", {
          type: "checkbox",
          checked: val === 1,
          onchange: (e) => {
            K().setVal(item, key, e.target.checked ? 1 : 0);
            if (afterChange) afterChange();
          },
        }),
        "Ein (1)",
      ]);
    } else control = K().numInput(item, key, type === "i", afterChange);
    const orig = K().origOf(item);
    const changed = orig && !K().sameVal(orig[key], val);
    return h("div", { class: "field" + (type === "a" ? " span2" : "") + (changed ? " ov2-changed" : "") }, [
      h("label", {}, [
        info.label,
        tipNode(() => explain(item, file, secKey, key, info)),
        h("span", { class: "mp-key mono muted small", text: key }),
        orig && changed ? h("button", { class: "btn icon small ov2-reset", type: "button", title: "Auf den geladenen Wert zurücksetzen (" + JSON.stringify(orig[key]) + ")", text: "↺", onclick: () => (K().setVal(item, key, JSON.parse(JSON.stringify(orig[key]))), redraw()) }) : null,
      ]),
      control,
    ]);
  }

  /** Sichere Zonen: Koordinaten + Radius (zwei Listen, gleiche Position). */
  function safeZoneTable(item, afterChange) {
    const j = item.json;
    if (!Array.isArray(j.safeZones)) j.safeZones = [];
    if (!Array.isArray(j.radius)) j.radius = [];
    const body = h("tbody");
    const commit = () => {
      P().mutate(item.uid, (x) => {
        x.safeZones = j.safeZones;
        x.radius = j.radius;
      });
      if (afterChange) afterChange();
    };
    const draw = () => {
      clear(body);
      const n = Math.max(j.safeZones.length, j.radius.length);
      for (let i = 0; i < n; i++) {
        body.appendChild(
          h("tr", {}, [
            h("td", { class: "muted small", text: String(i + 1) }),
            h("td", {}, [h("input", { type: "text", value: j.safeZones[i] === undefined ? "" : j.safeZones[i], placeholder: "x y z", oninput: (e) => ((j.safeZones[i] = e.target.value), commit()) })]),
            h("td", {}, [h("input", { type: "text", value: j.radius[i] === undefined ? "" : j.radius[i], placeholder: "Radius (m)", oninput: (e) => ((j.radius[i] = e.target.value), commit()) })]),
            h("td", {}, [h("button", { class: "btn icon small", type: "button", text: "✕", onclick: () => (j.safeZones.splice(i, 1), j.radius.splice(i, 1), commit(), draw()) })]),
          ])
        );
      }
    };
    draw();
    return h("div", { class: "field span2" }, [
      h("label", {}, ["Sichere Zonen & Radius", tipNode(T().info("event", "safeZones").help + " " + T().info("event", "radius").help)]),
      h("div", { class: "table-scroll" }, [h("table", { class: "ptable prod-table" }, [h("thead", {}, [h("tr", {}, ["#", "Koordinaten (x y z)", "Radius (m)", ""].map((t) => h("th", { text: t })))]), body])]),
      h("div", { class: "toolbar" }, [h("button", { class: "btn small", type: "button", text: "Zone hinzufügen", onclick: () => (j.safeZones.push("0 0 0"), j.radius.push("20"), commit(), draw()) })]),
    ]);
  }

  // ---------------------------------------------------------------- Abschnitte
  function calcControls(file, secKey, redraw) {
    const inputs = [];
    const mk = (label, key, tip) => {
      const inp = h("input", { type: "number", step: "any", min: "0", value: st.calc[key], style: "max-width:110px" });
      inp.addEventListener("input", () => {
        const v = Number(inp.value);
        if (Number.isFinite(v) && v >= 0) {
          st.calc[key] = v;
          redraw();
        }
      });
      return h("div", { class: "field" }, [h("label", {}, [label, tipNode(tip)]), inp]);
    };
    if (file === "general" && ["disease", "cure"].indexOf(secKey) > -1) inputs.push(mk("Strahlungsaufnahme pro Sekunde", "intake", "Annahme für die Rechnung: Wie viel Strahlung der Spieler pro Sekunde aufnimmt (z. B. in einer Zone mit Intensität × Prozent). Nur Anzeige, wird nicht gespeichert."));
    if (file === "general" && secKey === "zone") inputs.push(mk("Filtermenge", "filterQty", "Annahme: Menge eines vollen Filters, um die Haltbarkeit aus dem Verbrauch pro Takt zu rechnen. Nur Anzeige."));
    if (!inputs.length) return null;
    return h("div", { class: "toolbar mp-assume" }, inputs.concat([h("span", { class: "muted small", text: "Annahmen für die Live-Rechnung – werden nicht in die Datei geschrieben." })]));
  }

  function renderSection(file, secKey, box) {
    const item = mainItem(file);
    const sec = cats()[file].bySec[secKey];
    if (!item || !sec) {
      box.appendChild(h("div", { class: "empty-state", text: (file === "general" ? "GeneralSetting.json" : "BombingTrim.json") + " ist nicht geladen." }));
      return;
    }
    const meta = T().SECTIONS[secKey] || [secKey, ""];
    box.appendChild(h("div", { class: "mp-sec-head" }, [h("h2", { text: meta[0] }), h("div", { class: "muted", text: meta[1] }), h("div", { class: "mono muted small", text: (file === "general" ? "GeneralSetting.json" : "BombingTrim.json") + " · " + sec.keys.length + " Werte" })]));
    const calcHost = h("div", {});
    const redrawCalc = () => {
      clear(calcHost);
      const c = K().calcBox(calcFor(file, secKey));
      if (c) calcHost.appendChild(c);
    };
    redrawCalc();
    const ctl = calcControls(file, secKey, redrawCalc);
    if (ctl) box.appendChild(ctl);
    box.appendChild(calcHost);
    const grid = h("div", { class: "grid2" });
    sec.keys.forEach(([k, t]) => {
      if (k === "radius" && secKey === "event") return;
      if (k === "safeZones") {
        grid.appendChild(safeZoneTable(item, redrawCalc));
        return;
      }
      grid.appendChild(fieldRow(item, file, secKey, k, t, redrawCalc));
    });
    grid.addEventListener("input", redrawCalc);
    grid.addEventListener("change", redrawCalc);
    box.appendChild(h("div", { class: "section" }, [h("div", { class: "section-body" }, [grid])]));
  }

  // ---------------------------------------------------------------- Zonen (Liste + Detail)
  const ZONE_SPECS = {
    rad_zones: { list: "m_RadiationTrigger", title: "Strahlungszonen", intro: "Feste Strahlungsgebiete auf der Karte: Mittelpunkt, Radius/Quader, Stärke und Spawn-Chance. Links auswählen, rechts bearbeiten; unten steht die Wirkung auf den Spieler.", center: true, cleanable: true },
    rad_wrecks: { list: "m_RadiationWreckTrigger", title: "Wrack-Zonen", intro: "Strahlung an Wracks bestimmter Klassen (z. B. Land_Wreck_Uaz): bei jedem Wrack dieser Klasse entsteht mit der Spawn-Chance ein Trigger.", center: false, cleanable: false },
  };

  const vec = (s) => String(s || "0 0 0").trim().split(/\s+/).map(Number).concat([0, 0, 0]).slice(0, 3).map((n) => (Number.isFinite(n) ? n : 0));

  function vecInput(z, key, label, tip, commit) {
    const v = vec(z[key]);
    const ins = ["x", "y", "z"].map((ax, i) =>
      h("input", {
        type: "number",
        step: "any",
        value: v[i],
        oninput: (e) => {
          const cur = vec(z[key]);
          const n = Number(e.target.value);
          cur[i] = Number.isFinite(n) ? n : 0;
          z[key] = cur.join(" ");
          commit();
        },
      })
    );
    return h("div", { class: "field span2" }, [h("label", {}, [label, tipNode(tip)]), h("div", { class: "grid3" }, ins.map((x, i) => h("div", { class: "field" }, [h("div", { class: "help", text: ["x", "y (Höhe)", "z"][i] }), x])))]);
  }

  function zoneCalc(z, spec) {
    const out = [];
    const g = gen();
    const pct = num(z, "percentageAppliedOutToIn");
    const iMin = num(z, "intensityMin");
    const iMax = num(z, "intensityMax");
    const prot = st.calc.protect;
    const tick = g ? num(g, "radiationTriggerTickTime") : 1;
    out.push(K().head("Größe"));
    const r = num(z, "triggerRadius");
    if (r > 0) out.push(K().row("Radius", K().fmt(r, 0) + " m", "Fläche " + K().fmt(Math.PI * r * r, 0) + " m² (" + K().fmt((Math.PI * r * r) / 10000, 2) + " ha) · Höhe " + K().fmt(num(z, "triggerHeight"), 0) + " m"));
    else {
      const a = vec(z.triggerMins);
      const b = vec(z.triggerMaxs);
      out.push(K().row("Quader", K().fmt(Math.abs(b[0] - a[0]), 0) + " × " + K().fmt(Math.abs(b[2] - a[2]), 0) + " m", "Radius ist 0 – es gilt der Quader · Höhe y: " + K().fmt(Math.abs(b[1] - a[1]), 0) + " m"));
    }
    out.push(K().row("Spawn-Chance", K().fmt(num(z, "randomizerSpawn"), 0) + " %", num(z, "randomizerSpawn") >= 100 ? "entsteht immer" : "entsteht nur in diesem Anteil der Serverstarts"));
    if (iMin > iMax) out.push(K().warn("Die Mindest-Intensität ist größer als die Höchst-Intensität."));
    out.push(K().head("Aufnahme (Annahme: Intensität × " + K().fmt(pct, 0) + " % je Takt à " + K().fmt(tick) + " s, Schutz zieht von der Intensität ab)"));
    [["Minimum", iMin], ["Maximum", iMax]].forEach(([l, i]) => {
      const eff = Math.max(0, i - prot);
      const rate = ((eff * pct) / 100) / tick;
      if (!(rate > 0)) {
        out.push(K().row(l + " (Intensität " + K().fmt(i, 1) + ")", "keine Aufnahme", prot > 0 ? "Schutz " + K().fmt(prot, 0) + " mSv ≥ Intensität" : "Prozentwert oder Intensität ist 0"));
        return;
      }
      out.push(K().row(l + " (Intensität " + K().fmt(i, 1) + ")", K().fmt(rate, 2) + " pro Sekunde", g ? "Stufe 1 nach " + K().fmtTime(num(g, "stage1Threshold") / rate) + " · kritisch nach " + K().fmtTime(num(g, "stageCritical") / rate) : "Radiation-Config nicht geladen"));
    });
    if (num(z, "wholeOrScaled") === 0 && spec.center) out.push(K().row("Verlauf", "skaliert", "in der Mitte am stärksten (Maximum), zum Rand schwächer (Minimum)"));
    return out;
  }

  function protectionSelect(redraw) {
    const cl = fileItem("rad_cloth");
    const vals = cl ? Array.from(new Set(cl.json.RadClothAll.map((x) => x.protection))).sort((a, b) => a - b) : [];
    const opts = [h("option", { value: "0", text: "kein Schutz (0 mSv)", selected: st.calc.protect === 0 })].concat(vals.map((v) => h("option", { value: String(v), text: K().fmt(v, 0) + " mSv (Gasmaske/Schutzausrüstung)", selected: st.calc.protect === v })));
    return h("div", { class: "field" }, [
      h("label", {}, ["Schutz für die Rechnung", tipNode("Wähle einen Schutzwert aus deiner Ausrüstungs-Tabelle. Annahme: der Schutz zieht von der Zonen-Intensität ab. Nur Anzeige.")]),
      h("select", { onchange: (e) => ((st.calc.protect = Number(e.target.value)), redraw()) }, opts),
    ]);
  }

  function renderZones(kind, box) {
    const spec = ZONE_SPECS[kind];
    const item = fileItem(kind);
    box.appendChild(h("div", { class: "mp-sec-head" }, [h("h2", { text: spec.title }), h("div", { class: "muted", text: spec.intro })]));
    if (!item) {
      box.appendChild(h("div", { class: "empty-state", text: "Die Datei ist nicht geladen (Radiation-Ordner laden)." }));
      return;
    }
    const list = item.json[spec.list];
    const commit = () => P().mutate(item.uid, () => {});
    let sel = list.findIndex((z, i) => String(i) === st.zone[kind]);
    if (sel < 0) sel = list.length ? 0 : -1;
    const host = h("div", { class: "ov2 mp-zone" });
    const left = h("div", { class: "ov2-left" });
    const right = h("div", { class: "ov2-right" });
    host.appendChild(left);
    host.appendChild(right);
    box.appendChild(host);

    const listBox = h("div", { class: "ov2-list" });
    const drawList = () => {
      clear(listBox);
      const q = st.zoneFilter.toLowerCase();
      list.forEach((z, i) => {
        if (q && String(z.name).toLowerCase().indexOf(q) < 0) return;
        listBox.appendChild(
          h("div", { class: "ov2-row" + (i === sel ? " current" : ""), onclick: () => ((st.zone[kind] = String(i)), renderContent()) }, [
            h("div", { class: "ov2-name" }, [h("div", { class: "mono", text: z.name || "(unbenannt)" }), h("div", { class: "muted small", text: (num(z, "triggerRadius") > 0 ? "r " + K().fmt(num(z, "triggerRadius"), 0) + " m · " : "") + "Intensität " + K().fmt(num(z, "intensityMin"), 0) + "–" + K().fmt(num(z, "intensityMax"), 0) })]),
          ])
        );
      });
      if (!list.length) listBox.appendChild(h("div", { class: "list-empty", text: "Keine Einträge." }));
    };
    left.appendChild(
      h("div", { class: "section" }, [
        h("div", { class: "section-body" }, [
          h("input", { type: "text", placeholder: "Suchen …", value: st.zoneFilter, oninput: (e) => ((st.zoneFilter = e.target.value), drawList()) }),
          h("div", { class: "toolbar" }, [
            h("button", { class: "btn small primary", type: "button", text: "Neu", onclick: () => (list.push(newZone(list, spec)), commit(), (st.zone[kind] = String(list.length - 1)), renderContent()) }),
            h("button", { class: "btn small", type: "button", text: "Duplizieren", disabled: sel < 0, onclick: () => (list.splice(sel + 1, 0, JSON.parse(JSON.stringify(list[sel]))), commit(), (st.zone[kind] = String(sel + 1)), renderContent()) }),
            h("button", { class: "btn small danger", type: "button", text: "Löschen", disabled: sel < 0, onclick: () => (list.splice(sel, 1), commit(), (st.zone[kind] = ""), renderContent()) }),
          ]),
          h("div", { class: "muted small", text: list.length + " Einträge" }),
        ]),
      ])
    );
    left.appendChild(listBox);
    drawList();

    if (sel < 0) {
      right.appendChild(h("div", { class: "empty-state", text: "Keine Zone ausgewählt." }));
      return;
    }
    const z = list[sel];
    const calcHost = h("div", {});
    const redrawCalc = () => {
      clear(calcHost);
      const c = K().calcBox(zoneCalc(z, spec));
      if (c) calcHost.appendChild(c);
    };
    const upd = () => {
      commit();
      redrawCalc();
    };
    const F = T().FIELDS;
    const num_ = (key, int) => {
      const fld = F[key] || [key, ""];
      const input = h("input", {
        type: "number",
        step: int ? "1" : "any",
        value: z[key],
        oninput: (e) => {
          if (e.target.value === "" || !Number.isFinite(Number(e.target.value))) return;
          z[key] = int ? Math.round(Number(e.target.value)) : Number(e.target.value);
          upd();
        },
      });
      return h("div", { class: "field" }, [h("label", {}, [fld[0], tipNode(fld[1])]), input]);
    };
    const flag = (key) => {
      const fld = F[key] || [key, ""];
      return h("div", { class: "field" }, [
        h("label", { class: "checkrow" }, [
          h("input", { type: "checkbox", checked: z[key] === 1 || z[key] === 1.0, onchange: (e) => ((z[key] = e.target.checked ? 1 : 0), upd()) }),
          fld[0],
          tipNode(fld[1]),
        ]),
      ]);
    };
    const grid = h("div", { class: "grid2" });
    const nameFld = F.name;
    grid.appendChild(h("div", { class: "field span2" }, [h("label", {}, [nameFld[0], tipNode(nameFld[1])]), h("input", { type: "text", value: z.name, list: "rad-names", oninput: (e) => ((z.name = e.target.value), commit(), drawList()) }), h("datalist", { id: "rad-names" }, kind === "rad_wrecks" ? K().classSuggest("CfgVehicles").filter((n) => /wreck|train|wagon|bus|truck/i.test(n)).slice(0, 800).map((n) => h("option", { value: n })) : [])]));
    if (spec.center) grid.appendChild(vecInput(z, "radiationCenter", F.radiationCenter[0], F.radiationCenter[1], upd));
    grid.appendChild(num_("triggerRadius"));
    grid.appendChild(num_("triggerHeight"));
    grid.appendChild(num_("triggerOffset"));
    grid.appendChild(num_("percentageAppliedOutToIn"));
    grid.appendChild(vecInput(z, "triggerMins", F.triggerMins[0], F.triggerMins[1], upd));
    grid.appendChild(vecInput(z, "triggerMaxs", F.triggerMaxs[0], F.triggerMaxs[1], upd));
    grid.appendChild(num_("intensityMin"));
    grid.appendChild(num_("intensityMax"));
    grid.appendChild(flag("randomizeIntensity"));
    grid.appendChild(flag("wholeOrScaled"));
    grid.appendChild(num_("randomizerSpawn"));
    if (spec.cleanable) grid.appendChild(num_("cleanable"));

    right.appendChild(h("div", { class: "toolbar mp-assume" }, [protectionSelect(redrawCalc), h("span", { class: "muted small", text: "Annahme für die Live-Rechnung – nicht in der Datei." })]));
    redrawCalc();
    right.appendChild(calcHost);
    right.appendChild(h("div", { class: "section" }, [h("div", { class: "section-body" }, [grid])]));
  }

  function newZone(list, spec) {
    const base = list.length ? JSON.parse(JSON.stringify(list[list.length - 1])) : { name: "", triggerMins: "-5 -5 -5", triggerMaxs: "5 5 5", triggerRadius: 50.0, triggerHeight: 200.0, triggerOffset: -100.0, percentageAppliedOutToIn: 10.0, randomizeIntensity: 0, intensityMin: 10.0, intensityMax: 100.0, wholeOrScaled: 0, randomizerSpawn: 100.0 };
    if (spec.center && !base.radiationCenter) base.radiationCenter = "0 0 0";
    base.name = (base.name || "Zone") + "_neu";
    return base;
  }

  // ---------------------------------------------------------------- Schutz-Tabellen (Kleidung, Filter)
  const PROT = {
    rad_cloth: { list: "RadClothAll", name: "clothName", val: "protection", title: "Schutz-Ausrüstung (Gasmasken)", intro: "Welche Ausrüstung wie viel Strahlung abhält (mSv). Laut Doku müssen Filter und Gasmasken korrekt von Vanilla-Klassen erben.", nameLabel: "Ausrüstung (Klasse)", valLabel: "Schutz (mSv)" },
    rad_filter: { list: "FilterAll", name: "filterName", val: "mSvProtection", title: "Filter", intro: "Wie viel Strahlung (mSv) die Gasmasken-Filter abhalten.", nameLabel: "Filter (Klasse)", valLabel: "Schutz (mSv)" },
  };

  function renderProt(kind, box) {
    const spec = PROT[kind];
    const item = fileItem(kind);
    box.appendChild(h("div", { class: "mp-sec-head" }, [h("h2", { text: spec.title }), h("div", { class: "muted", text: spec.intro })]));
    if (!item) {
      box.appendChild(h("div", { class: "empty-state", text: "Die Datei ist nicht geladen (Radiation-Ordner laden)." }));
      return;
    }
    const list = item.json[spec.list];
    const commit = () => P().mutate(item.uid, () => {});
    let q = "";
    const tbody = h("tbody");
    const note = h("div", { class: "help" });
    const dl = h("datalist", { id: "rad-prot-names" }, K().classSuggest("CfgVehicles").slice(0, 5000).map((n) => h("option", { value: n })));
    const draw = () => {
      clear(tbody);
      list.forEach((r, i) => {
        if (q && String(r[spec.name]).toLowerCase().indexOf(q) < 0) return;
        tbody.appendChild(
          h("tr", {}, [
            h("td", {}, [h("input", { type: "text", value: r[spec.name], list: "rad-prot-names", oninput: (e) => ((r[spec.name] = e.target.value), commit()) })]),
            h("td", {}, [h("input", { type: "number", step: "any", value: r[spec.val], style: "max-width:120px", oninput: (e) => (e.target.value !== "" && ((r[spec.val] = Number(e.target.value)), commit(), summary())) })]),
            h("td", { class: "actions" }, [
              h("button", { class: "btn icon small", type: "button", title: "Duplizieren", text: "⧉", onclick: () => (list.splice(i + 1, 0, JSON.parse(JSON.stringify(r))), commit(), draw(), summary()) }),
              h("button", { class: "btn icon small", type: "button", title: "Löschen", text: "✕", onclick: () => (list.splice(i, 1), commit(), draw(), summary()) }),
            ]),
          ])
        );
      });
    };
    const summary = () => {
      const groups = new Map();
      list.forEach((r) => groups.set(r[spec.val], (groups.get(r[spec.val]) || 0) + 1));
      const names = list.map((r) => r[spec.name]);
      const dup = names.filter((n, i) => names.indexOf(n) !== i);
      note.textContent = list.length + " Einträge · " + Array.from(groups.entries()).sort((a, b) => b[0] - a[0]).map(([v, n]) => n + "× " + K().fmt(v, 0) + " mSv").join(" · ") + (dup.length ? " · DOPPELT: " + Array.from(new Set(dup)).join(", ") : "");
      note.style.color = dup.length ? "var(--danger)" : "";
    };
    draw();
    summary();
    box.appendChild(
      h("div", { class: "section" }, [
        h("div", { class: "section-body" }, [
          h("div", { class: "toolbar" }, [
            h("input", { type: "text", placeholder: "Suchen …", style: "max-width:260px", oninput: (e) => ((q = e.target.value.toLowerCase()), draw()) }),
            h("button", { class: "btn small primary", type: "button", text: "Eintrag hinzufügen", onclick: () => (list.push({ [spec.name]: "", [spec.val]: 0.0 }), commit(), draw(), summary()) }),
          ]),
          note,
          h("div", { class: "table-scroll" }, [h("table", { class: "ptable prod-table" }, [h("thead", {}, [h("tr", {}, [h("th", {}, [spec.nameLabel, tipNode(T().FIELDS[spec.name][1])]), h("th", {}, [spec.valLabel, tipNode(T().FIELDS[spec.val][1])]), h("th", { text: "" })])]), tbody])]),
          dl,
        ]),
      ])
    );
  }

  // ---------------------------------------------------------------- Zonen-Übersicht
  function renderOverview(box) {
    box.appendChild(h("div", { class: "mp-sec-head" }, [h("h2", { text: "Zonen-Übersicht" }), h("div", { class: "muted", text: "Alle Strahlungszonen und Wrack-Zonen mit der Gefahr für einen Spieler – sortiert nach Aufnahme pro Sekunde. Annahme: Aufnahme = Intensität × Prozent; der gewählte Schutz zieht von der Intensität ab." })]));
    const g = gen();
    const zi = fileItem("rad_zones");
    const wi = fileItem("rad_wrecks");
    if (!zi && !wi) {
      box.appendChild(h("div", { class: "empty-state", text: "RadiationZones.json / WreckZones.json sind nicht geladen." }));
      return;
    }
    const redraw = () => renderContent();
    box.appendChild(h("div", { class: "toolbar mp-assume" }, [protectionSelect(redraw)]));
    const rows = [];
    const add = (src, kind) => (src ? src.json[ZONE_SPECS[kind].list] : []).forEach((z) => rows.push({ z: z, kind: kind }));
    add(zi, "rad_zones");
    add(wi, "rad_wrecks");
    const prot = st.calc.protect;
    const tick = g ? num(g, "radiationTriggerTickTime") : 1;
    const calc = rows.map((r) => {
      const eff = Math.max(0, num(r.z, "intensityMax") - prot);
      const rate = ((eff * num(r.z, "percentageAppliedOutToIn")) / 100) / tick;
      return Object.assign(r, { rate: rate });
    });
    calc.sort((a, b) => b.rate - a.rate);
    const tb = h("tbody", {}, calc.map((r) =>
      h("tr", {}, [
        h("td", { class: "mono small", text: r.z.name }),
        h("td", { class: "small", text: r.kind === "rad_zones" ? "Zone" : "Wrack" }),
        h("td", { class: "mono small", text: num(r.z, "triggerRadius") > 0 ? K().fmt(num(r.z, "triggerRadius"), 0) + " m" : "Quader" }),
        h("td", { class: "mono small", text: K().fmt(num(r.z, "intensityMin"), 0) + " – " + K().fmt(num(r.z, "intensityMax"), 0) }),
        h("td", { class: "mono small", text: r.rate > 0 ? K().fmt(r.rate, 2) + " / s" : "keine" }),
        h("td", { class: "mono small", text: g && r.rate > 0 ? K().fmtTime(num(g, "stage1Threshold") / r.rate) : "–" }),
        h("td", { class: "mono small", text: g && r.rate > 0 ? K().fmtTime(num(g, "stageCritical") / r.rate) : "–" }),
        h("td", { class: "small", text: K().fmt(num(r.z, "randomizerSpawn"), 0) + " %" }),
      ])
    ));
    box.appendChild(
      h("div", { class: "section" }, [
        h("div", { class: "section-body" }, [
          h("div", { class: "table-scroll" }, [h("table", { class: "ptable prod-table" }, [h("thead", {}, [h("tr", {}, ["Name", "Art", "Größe", "Intensität", "Aufnahme (max.)", "Stufe 1 nach", "Kritisch nach", "Spawn"].map((t) => h("th", { text: t })))]), tb])]),
        ]),
      ])
    );
  }

  // ---------------------------------------------------------------- Aufbau
  let root = null;
  let content = null;

  function setView(v) {
    st.view = v;
    render();
  }

  function render() {
    if (!root) return;
    clear(root);
    const gi = mainItem("general");
    const bi = mainItem("bombing");
    const any = gi || bi || TABLE_KINDS.some((k) => fileItem(k));
    const bar = h("div", { class: "toolbar" }, [
      h("button", { class: "btn primary", type: "button", text: "Radiation-Ordner laden…", onclick: () => P().pick(true) }),
      gi ? h("span", { class: "status mono", text: (gi.fileId || "") + ".json" + (gi.dirty ? " · geändert" : "") }) : null,
      bi ? h("span", { class: "status mono", text: (bi.fileId || "") + ".json" + (bi.dirty ? " · geändert" : "") }) : null,
    ]);
    root.appendChild(bar);
    if (!any) {
      root.appendChild(
        h("div", { class: "empty-state" }, [
          h("div", { class: "drop-title", text: "Radiation-Editor" }),
          h("p", { text: "Lade deinen Radiation-Ordner (GeneralSetting.json, BombingTrim.json, RadiationZones.json, WreckZones.json, RadClothProtection.json, FilterProtection.json) – über den Knopf oben oder im Projekt-Tab. Änderungen werden wie bei Dialogen und Tradern in die JSON-Dateien zurückgeschrieben („Änderungen speichern“ oben rechts)." }),
        ])
      );
      return;
    }
    const layout = h("div", { class: "ov2 mp" });
    const nav = h("div", { class: "mp-nav" });
    T().GROUPS.forEach((g) => {
      nav.appendChild(h("div", { class: "nav-title", text: g.title }));
      g.secs.forEach((sk) => nav.appendChild(h("button", { class: "mp-navbtn" + (st.view.type === "sec" && st.view.key === sk ? " active" : ""), type: "button", text: T().titleOf(sk), onclick: () => setView({ type: "sec", file: g.file, key: sk }) })));
    });
    nav.appendChild(h("div", { class: "nav-title", text: "Zonen & Schutz" }));
    [["rad_zones", "Strahlungszonen"], ["rad_wrecks", "Wrack-Zonen"], ["rad_cloth", "Schutz-Ausrüstung"], ["rad_filter", "Filter"]].forEach(([k, l]) =>
      nav.appendChild(h("button", { class: "mp-navbtn" + (st.view.type === "file" && st.view.key === k ? " active" : ""), type: "button", text: l + (fileItem(k) ? "" : " (nicht geladen)"), onclick: () => setView({ type: "file", key: k }) }))
    );
    nav.appendChild(h("div", { class: "nav-title", text: "Werkzeuge" }));
    nav.appendChild(h("button", { class: "mp-navbtn" + (st.view.type === "overview" ? " active" : ""), type: "button", text: "Zonen-Übersicht", onclick: () => setView({ type: "overview" }) }));
    layout.appendChild(nav);
    content = h("div", { class: "mp-content" });
    layout.appendChild(content);
    root.appendChild(layout);
    renderContent();
  }

  function renderContent() {
    if (!content) return;
    clear(content);
    content.appendChild(h("div", { class: "issue ok mp-note", text: "Die „?“-Erklärungen zitieren die Doku des Radiation-Mods und ergänzen sie aus den Wertenamen (der Mod-Code ist nicht einsehbar); wo es nicht eindeutig ist, steht „vermutlich“ bzw. „Annahme“. Die Live-Rechnungen sind Näherungen." }));
    const v = st.view;
    if (v.type === "file") {
      if (ZONE_SPECS[v.key]) return renderZones(v.key, content);
      return renderProt(v.key, content);
    }
    if (v.type === "overview") return renderOverview(content);
    renderSection(v.file, v.key, content);
  }

  function init(panel) {
    root = panel;
    P().registerSerializer(P().RAD_KINDS, K().stringify);
    ["general", "bombing"].forEach((f) => {
      K().extraFloatKeys[KINDS[f]] = D()[f].flatMap(([, keys]) => keys.filter((x) => x[1] === "f").map((x) => x[0]));
    });
    render();
    return { refresh: render };
  }

  EQE.Radiation = {
    init: init,
    openItem: (uid) => {
      const it = P().get(uid);
      if (!it) return;
      if (it.kind === "rad_general") (st.general = uid), (st.view = { type: "sec", file: "general", key: "disease" });
      else if (it.kind === "rad_bombing") (st.bombing = uid), (st.view = { type: "sec", file: "bombing", key: "bgeneral" });
      else if (ZONE_SPECS[it.kind] || PROT[it.kind]) st.view = { type: "file", key: it.kind };
      render();
    },
  };
})(window.EQE);
