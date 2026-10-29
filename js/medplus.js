/**
 * Exodus Quest Editor – MedPlus-Editor (Medizin-Mod): MedPlusTrim.json sowie die Tabellen-Dateien
 * (Zombie-/Tier-Schaden, Klingen, Munition, Getränke, Suppen-Zutaten). Mit Erklärungen („?“) und Live-Berechnungen.
 * Änderungen laufen über den Projekt-Store und werden – wie bei Dialogen/Tradern – beim Speichern in die JSON-Dateien geschrieben.
 */
(function (EQE) {
  "use strict";
  const h = EQE.h;
  const clear = EQE.clear;
  const P = () => EQE.Project;
  const T = () => EQE.MPText;
  const D = () => EQE.MPData;

  const BLOOD_MAX = 5000; // Standard-Blutmenge in DayZ

  // ---------------------------------------------------------------- Zustand
  const st = {
    main: "", // uid der MedPlusTrim-Datei
    view: { type: "sec", key: "BrainConcussion" }, // sec | file | search
    search: "",
  };

  // ---------------------------------------------------------------- Katalog
  function catalog() {
    const secs = D().sections.map(([key, titleEn, keys]) => ({ key: key, en: titleEn, keys: keys }));
    const byKey = {};
    secs.forEach((s) => s.keys.forEach(([k, t]) => (byKey[k] = { sec: s.key, t: t })));
    return { secs: secs, byKey: byKey, bySec: Object.fromEntries(secs.map((s) => [s.key, s])) };
  }
  let CAT = null;
  const cat = () => CAT || (CAT = catalog());

  // Paarweise Listen (gleiche Reihenfolge): [Namensliste, Wertliste, Beschriftung Name, Beschriftung Wert, Einheit]
  const PAIRS = {
    SlipperyShoes: ["SlipperyShoes", "SlipFactor", "Schuh (Klasse)", "Rutsch-Faktor", ""],
    Helms: ["Helms", "ProtectionHelms", "Helm (Klasse)", "Schutz %", "%"],
    clothProtectionHematoma: ["clothProtectionHematoma", "percentageProtectionHematoma", "Kleidung (Klasse)", "Schutz %", "%"],
  };
  const PAIR_SECOND = new Set(Object.values(PAIRS).map((p) => p[1]));

  // ---------------------------------------------------------------- Hilfen
  function num(c, k) {
    const v = c[k];
    return typeof v === "number" ? v : NaN;
  }
  function fmt(n, d) {
    if (!Number.isFinite(n)) return "–";
    const dec = d === undefined ? 2 : d;
    return String(parseFloat(n.toFixed(dec))).replace(".", ",");
  }
  function fmtTime(sec) {
    if (!Number.isFinite(sec)) return "–";
    sec = Math.round(sec);
    const hh = Math.floor(sec / 3600);
    const mm = Math.floor((sec % 3600) / 60);
    const ss = sec % 60;
    const parts = [];
    if (hh) parts.push(hh + " h");
    if (mm) parts.push(mm + " min");
    if (ss || !parts.length) parts.push(ss + " s");
    return parts.join(" ");
  }
  const row = (l, v, n) => ({ k: "row", l: l, v: v, n: n || "" });
  const head = (t) => ({ k: "head", t: t });
  const warn = (t) => ({ k: "warn", t: t });
  const ok = (t) => ({ k: "ok", t: t });

  // Ganzzahl-Schalter mit mehreren Stufen (laut Doku)
  const ENUMS = {
    BulletInfluence: [[-1, "-1 – Kugel bleibt eher stecken"], [0, "0 – zufällig"], [1, "1 – Kugel geht eher durch"]],
    BrokenArmDropItemOnModifierActivation: [[0, "0 – Item nie fallen lassen"], [1, "1 – nur nicht passende Items fallen lassen"], [2, "2 – immer fallen lassen"]],
    BrokenArmItemAvailableTobeCarried: [[0, "0 – keine Waffen/schweren Items"], [1, "1 – nur Pistolen und leichte Items"], [2, "2 – alle Items"]],
    MentalDeathTouchHalveOrSubOrShock: [[0, "0 – Leben halbieren"], [1, "1 – Leben abziehen"], [2, "2 – Schock anwenden"]],
  };

  function isBoolKey(item, key) {
    const v = item.json[key];
    if (ENUMS[key] || (v !== 0 && v !== 1)) return false;
    const d = T().docOf(key);
    if (d) return d.type === "bool" && !/(Chance|Time|Tick)/i.test(key);
    return /(enable|enabel|norun|canclimb|forcewakeup|disable|limp|halve|or_hp|based|cure$|^regenhealth)/i.test(key) && !/(Chance|Time|Tick)/i.test(key);
  }

  // ---------------------------------------------------------------- Live-Berechnungen
  function bleedRows(out, label, drain, tick, stopTime) {
    const perSec = drain / tick;
    out.push(head(label));
    out.push(row("Blutverlust je Wunde", fmt(perSec * 60, 1) + " Blut / min", fmt(drain) + " Blut alle " + fmt(tick) + " s"));
    [1, 2, 4].forEach((w) =>
      out.push(row("Verbluten bei " + w + " offener Wunde" + (w > 1 ? "n" : ""), fmtTime(BLOOD_MAX / (perSec * w)), "ab " + BLOOD_MAX + " Blut, ohne Heilung"))
    );
    if (Number.isFinite(stopTime)) out.push(row("Blutverlust bis Verband wirkt", fmt(perSec * stopTime, 0) + " Blut", "während der " + fmtTime(stopTime) + " bis zur Blutstillung"));
  }

  function chanceRows(out, c, keys, label) {
    out.push(head(label));
    keys.forEach(([k, name]) => {
      const p = num(c, k) / 100;
      if (!Number.isFinite(p)) return;
      out.push(row(name, fmt(num(c, k), 1) + " %", p > 0 ? "im Schnitt nach " + fmt(1 / Math.min(1, p), 1) + " Treffern" : "tritt nie auf"));
    });
  }

  function perTickRows(out, c, sec) {
    const keys = sec.keys.map((x) => x[0]);
    const tick = keys.find((k) => /TickTime$/i.test(k));
    const last = keys.find((k) => /(LastingTime|Lastingtime)$/i.test(k));
    if (!tick || !last) return;
    const tt = num(c, tick);
    const lt = num(c, last);
    if (!(tt > 0) || !(lt >= 0)) return;
    const ticks = Math.floor(lt / tt);
    out.push(head("Wirkung über die gesamte Dauer"));
    out.push(row("Wirkdauer", fmtTime(lt), ticks + " Takte à " + fmt(tt) + " s"));
    keys
      .filter((k) => /PerTick$/i.test(k) && !/Chance/i.test(k) && typeof c[k] === "number" && c[k] !== 0)
      .forEach((k) => out.push(row(T().info(sec.key, k).label, fmt(c[k] * ticks, 2), fmt(c[k]) + " × " + ticks + " Takte")));
  }

  // ---------------------------------------------------------------- Überdosis durch Medikamente
  const OD_MEDS = [
    ["Vikasol", "Vikasol", "VikasolLastingTime"],
    ["Diazepam", "Diazepam", "DiazepamLastingTime"],
    ["Painkiller", "Schmerzmittel", null],
    ["Ibuprofene", "Ibuprofen", "IbuprofeneLastingtime"],
    ["Tetracycline", "Tetracyclin", null],
    ["Morphine", "Morphin", null],
    ["Epinephrine", "Epinephrin", null],
    ["AntiRad", "Anti-Rad", "AntiRadLastingTime"],
    ["Charcoal", "Aktivkohle", null],
  ];
  /** Einstellbare Annahmen der Überdosis-Rechnung (nur Anzeige, nicht in der JSON). */
  const od = { interval: 60, unknownDur: 60 };

  /** Dosen bis die Schwelle erreicht ist; interval = 0: alle auf einmal. Infinity = wird nie erreicht. */
  function dosesTo(threshold, dose, decayPerSec, interval) {
    if (!(dose > 0)) return Infinity;
    if (!interval) return Math.ceil(threshold / dose);
    let a = 0;
    for (let n = 1; n <= 500; n++) {
      a = Math.max(0, a - decayPerSec * interval) + dose;
      if (a >= threshold) return n;
      if (n > 1 && dose <= decayPerSec * interval) return Infinity;
    }
    return Infinity;
  }
  const nTxt = (n) => (n === Infinity ? "nie" : String(n));

  const HP_MAX = 100; // Spieler-Leben (DayZ-Standard)

  /** Zeile "Tod nach": Lebensverlust pro Sekunde -> Zeit von 100 HP bis 0 (ohne Regeneration/Heilung). */
  function deathRow(out, label, perSec, note) {
    if (!(perSec > 0)) {
      out.push(row(label, "kein Lebensverlust", "Wert ist 0"));
      return;
    }
    out.push(row(label, "Tod nach " + fmtTime(HP_MAX / perSec), fmt(perSec * 60, 2) + " HP pro Minute" + (note ? " · " + note : "")));
  }
  /** Zeile "Anwendungen bis Tod" für einmalige Lebensverluste. */
  function hitsRow(out, label, perHit, note) {
    if (!(perHit > 0)) {
      out.push(row(label, "kein Lebensverlust", "Wert ist 0"));
      return;
    }
    out.push(row(label, Math.ceil(HP_MAX / perHit) + "× bis Tod", fmt(perHit) + " HP je Mal" + (note ? " · " + note : "")));
  }

  /** Überdosis-Wirkstoff je Dosis aller Medikamente samt Schwellen. */
  function odData(c, only) {
    const tick = num(c, "OverdoseTickTime");
    const meds = OD_MEDS.map(([k, label, lastKey]) => {
      const per = num(c, "Overdose" + k + "PerTick");
      const known = !!lastKey && Number.isFinite(num(c, lastKey));
      const dur = known ? num(c, lastKey) : od.unknownDur;
      const ticks = Math.max(1, Math.floor(dur / tick));
      return { k: k, label: label, per: per, known: known, dur: dur, ticks: ticks, dose: per * ticks };
    }).filter((m) => Number.isFinite(m.per) && m.per > 0 && (!only || m.k === only));
    return {
      tick: tick,
      die: num(c, "OverdoseAgentDieOffSpeed"),
      T1: num(c, "OverdoseAgentThresholdMalusActivation"),
      T2: num(c, "OverdoseAgentThresholdVomit"),
      T3: num(c, "OverdoseAgentMAXCOUNT"),
      meds: meds,
    };
  }

  function overdoseRows(c, out, only) {
    const data = odData(c, only);
    const tick = data.tick;
    const die = data.die;
    const T1 = data.T1;
    const T2 = data.T2;
    const T3 = data.T3;
    const meds = data.meds;
    if (!meds.length) return;
    out.push(head("Überdosis durch Medikamente – Annahme: während der Wirkdauer wird bei jedem Überdosis-Takt (" + fmt(tick) + " s) der Wert „Overdose…PerTick“ addiert"));
    out.push(row("Schwellen", "Malus ab " + fmt(T1, 0) + " · Erbrechen ab " + fmt(T2, 0) + " · Maximum " + fmt(T3, 0), "Abbau " + fmt(die * 60, 1) + " pro Minute (" + fmt(die) + " pro Sekunde)"));
    out.push(head("Wirkstoff pro Dosis (eine Tablette/Spritze)"));
    meds.forEach((m) =>
      out.push(row(m.label, fmt(m.dose, 1), fmt(m.per) + " × " + m.ticks + " Takte (Wirkdauer " + fmtTime(m.dur) + (m.known ? "" : " – Annahme, siehe oben") + ") · baut sich in " + fmtTime(m.dose / die) + " ab"))
    );
    out.push(head("Wie viele Dosen bis zur Überdosis?"));
    meds.forEach((m) => {
      const s1 = dosesTo(T1, m.dose, die, 0);
      const s2 = dosesTo(T2, m.dose, die, 0);
      const s3 = dosesTo(T3, m.dose, die, 0);
      const i1 = dosesTo(T1, m.dose, die, od.interval);
      const dz = (n) => n + (n === 1 ? " Dosis" : " Dosen");
      out.push(row(m.label, "Malus ab " + dz(s1), "Erbrechen ab " + dz(s2) + ", Maximum bei " + dz(s3) + " (alle auf einmal) · bei Einnahme alle " + fmtTime(od.interval) + ": Malus " + (i1 === Infinity ? "nie (der Abbau ist schneller als eine Dosis)" : "ab " + dz(i1))));
    });
    // Lebensverlust ab der Malus-Schwelle und wann er tödlich wird (100 HP, ohne Regeneration)
    const hpRate = num(c, "OverdoseHealthLossPerTick") / tick;
    if (hpRate > 0) {
      out.push(head("Lebensverlust durch Überdosis und Tod (" + HP_MAX + " HP, ohne Regeneration)"));
      deathRow(out, "Dauerhaft über der Malus-Schwelle", hpRate, fmt(num(c, "OverdoseHealthLossPerTick")) + " HP je Takt à " + fmt(tick) + " s");
      const lethalAgent = T1 + (HP_MAX * die) / hpRate;
      out.push(row("Tödlicher Wirkstoffwert", lethalAgent <= T3 ? "ab " + fmt(lethalAgent, 0) : "nie erreichbar", "Malus " + fmt(T1, 0) + " + Abbauzeit bis 100 HP verbraucht; das Maximum ist " + fmt(T3, 0)));
      meds.forEach((m) => {
        const peak = Math.min(m.dose, T3);
        const lost = (Math.max(0, peak - T1) / die) * hpRate;
        const nLethal = lethalAgent <= T3 ? Math.ceil(lethalAgent / m.dose) : Infinity;
        out.push(row(m.label, "1 Dosis: −" + fmt(lost, 1) + " HP", (lost >= HP_MAX ? "TÖDLICH" : "überlebbar") + " · tödlich ab " + (nLethal === Infinity ? "nie" : nLethal + (nLethal === 1 ? " Dosis" : " Dosen")) + " (alle auf einmal)"));
      });
    }
    if (!only && meds.length > 1) {
      const total = meds.reduce((a, m) => a + m.dose, 0);
      out.push(head("Alles gleichzeitig (je 1 Dosis von jedem)"));
      out.push(row("Summe", fmt(total, 1), total >= T1 ? "über der Malus-Schwelle – Überdosis" + (total >= T2 ? ", auch Erbrechen" : "") : "unter der Malus-Schwelle (" + fmt(T1, 0) + ")"));
    }
  }

  // ---------------------------------------------------------------- Medikamente: Wirkung je Dosis
  const MEDS = [
    { sec: "Ibuprofene", label: "Ibuprofen", tick: "IbuprofeneTickTime", last: "IbuprofeneLastingtime", delay: "IbuprofeneDelayTime", per: [["RegenShockPerTick", "Schock-Regeneration"]], od: "Ibuprofene" },
    { sec: "Ematogel", label: "Hämatom-Gel", tick: "EmatogelTickTime", last: "EmatogelLastingtime", delay: "EmatogelDelayTime", per: [["RegenStaminaPerTick", "Ausdauer"]], once: [["DecreaseEmatomaPerApply", "Blutergüsse geheilt je Anwendung"], ["EmatogelTimerBeforeCure", "Heilung der Blutergüsse nach (s)"]] },
    { sec: "Vikasol", label: "Vikasol", tick: "VikasolTickTime", last: "VikasolLastingTime", od: "Vikasol", mods: [["VikasolHealWoundModifier", "Wundheilung (Faktor)"], ["VikasolSlowBloodFlowModifier", "Blutstillung (Faktor)"]] },
    { sec: "EnergyDrink", label: "Energy-Drink", tick: "EnergyDrinkTickTime", last: "EnergyDrinkLastingTime", per: [["EnergyDrinkWaterLossPerTick", "Wasserverlust"]], mods: [["EnergyDrinkStaminaRecoverMultiplier", "Ausdauer-Regeneration (×)"], ["EnergyDrinkStaminaDepletionMultiplier", "Ausdauer-Verbrauch (×)"]], once: [["EnergyDrinkSleepRecoverValue", "Schlaf-Erholung (einmalig)"], ["EnergyDrinkMinQtyThresholdDrunkToStart", "Mindestmenge getrunken, damit er wirkt"]] },
    { sec: "Diazepam", label: "Diazepam", tick: "DiazepamTickTime", last: "DiazepamLastingTime", delay: "DiazepamDelayActivation", per: [["DiazepamInsertSleepPerTick", "Schlaf"], ["DiazepamMentalRecoverPerTick", "Mental"]], od: "Diazepam" },
    { sec: "AntiRad", label: "Anti-Rad", tick: "AntiRadTickTime", last: "AntiRadLastingTime", delay: "AntiRadDelayActivation", od: "AntiRad", once: [["AntiRadQTY", "Anti-Rad-Menge"], ["AntiPOXQTY", "Anti-Pocken-Menge"]] },
    { sec: "NaxaloneSyringe", label: "Naxalon", tick: "NaxaloneTickTime", last: "NaxaloneLastingTime", per: [["NaxaloneHealOverDosePertick", "Überdosis-Wirkstoff entfernt"]], naloxone: true },
    { sec: "HPRecover", label: "HP-Injektor", last: "HPRecoverLastingTime", noTick: [["HP_Recover_PerTick", "Leben"]] },
    { sec: "BPRecover", label: "BP-Injektor", last: "BPRecoverLastingTime", noTick: [["BP_Recover_PerTick", "Blut"]] },
    { sec: "MHRecover", label: "MH-Injektor", last: "MHRecoverLastingTime", noTick: [["MH_Recover_PerTick", "Mental"]] },
  ];
  const SOUPS = ["Herbal", "FishStew", "MeatStew", "Potage", "SeaAndMountainSoup", "Stew", "Chowder", "CompleteSoup", "BurnedSoup"];

  /** Wirkung einer Dosis: Takte, Gesamtwerte je Effekt. */
  function medDose(c, m) {
    const hasTick = !!m.tick;
    const tick = hasTick ? num(c, m.tick) : 1;
    const last = num(c, m.last);
    const ticks = Math.max(0, Math.floor(last / tick));
    const per = (m.per || []).concat(m.noTick || []).map(([k, l]) => ({ k: k, label: l, per: num(c, k), total: num(c, k) * ticks }));
    return { tick: tick, last: last, ticks: ticks, assumedTick: !hasTick, delay: m.delay ? num(c, m.delay) : 0, per: per };
  }

  function medRows(c, out, sec) {
    const m = MEDS.find((x) => x.sec === sec);
    if (!m) return;
    const d = medDose(c, m);
    out.push(head("Eine Dosis (" + m.label + ")"));
    out.push(row("Wirkdauer", fmtTime(d.last), d.ticks + " Takte à " + fmt(d.tick) + " s" + (d.assumedTick ? " – Takt nicht in der Config, 1 s angenommen" : "") + (d.delay ? " · Wirkung beginnt nach " + fmtTime(d.delay) : "")));
    d.per.forEach((e) => out.push(row(e.label + " gesamt", fmt(e.total, 2), fmt(e.per) + " × " + d.ticks + " Takte · " + fmt(d.last > 0 ? (e.total / d.last) * 60 : 0, 1) + " pro Minute")));
    (m.mods || []).forEach(([k, l]) => out.push(row(l, fmt(num(c, k)), "während der Wirkdauer")));
    (m.once || []).forEach(([k, l]) => out.push(row(l, fmt(num(c, k)), "")));
    if (m.naloxone) {
      const od0 = odData(c, "");
      const per = d.per[0] ? d.per[0].total : 0;
      out.push(head("Was die Spritze gegen Überdosis bewirkt"));
      out.push(row("Entfernter Überdosis-Wirkstoff", fmt(per, 1), "pro Spritze (zusätzlich zum natürlichen Abbau)"));
      od0.meds.forEach((x) => out.push(row("≙ Dosen " + x.label, fmt(per / x.dose, 1), "eine Dosis enthält " + fmt(x.dose, 1) + " Wirkstoff")));
      out.push(row("Reicht für den Abbau von", fmt(per / od0.T1, 1) + "× Malus-Schwelle", "Malus ab " + fmt(od0.T1, 0)));
    }
    if (m.od) overdoseRows(c, out, m.od);
  }

  const PUFFS = {
    Joint: { label: "Joint", qty: "JointQtyLostPerCircle", effects: [["JointInsertSleepPerCircle", "Schlaf +"], ["JointCureMentalIllnesPerCircle", "Mentalkrankheit geheilt"], ["JointFoodLostPerCircle", "Energie −"], ["JointRadCurePerCircle", "Strahlung abgebaut"], ["JointTripQtyAddedPerCircle", "Trip-Menge +"]], od: "JointInsertOverdoseAgentPerCircle" },
    Sigaretta: { label: "Zigarette", qty: "SigarettaQtyLostPerCircle", effects: [["SigarettaCureSleepPerCircle", "Schlaf geheilt"], ["SigarettaCureMentalIllnesPerCircle", "Mentalkrankheit geheilt"], ["SigarettaHealthLostPerCircle", "Leben −"], ["SigarettaWaterLostPerCircle", "Wasser −"], ["SigarettaRadCurePerCircle", "Strahlung abgebaut"]] },
  };

  function puffRows(c, out, sec) {
    const p = PUFFS[sec];
    if (!p) return;
    const qty = num(c, p.qty);
    out.push(head("Ein Zug (" + p.label + ") und was er kostet"));
    out.push(row("Menge pro Zug", fmt(qty), "wird von der Menge des Items abgezogen – ein Item mit Menge M reicht für M ÷ " + fmt(qty) + " Züge"));
    p.effects.forEach(([k, l]) => {
      const v = num(c, k);
      out.push(row(l, fmt(v), "pro Zug · pro 10 Züge: " + fmt(v * 10, 1)));
    });
    const hpKey = Object.keys(c).find((k) => k === (sec === "Sigaretta" ? "SigarettaHealthLostPerCircle" : ""));
    if (hpKey) hitsRow(out, "Lebensverlust durch Züge", num(c, hpKey), "ohne Regeneration");
    if (p.od) {
      const od0 = odData(c, "");
      const perPuff = num(c, p.od);
      out.push(head("Überdosis durch Züge"));
      out.push(row("Wirkstoff pro Zug", fmt(perPuff), "Malus ab " + fmt(od0.T1, 0)));
      out.push(row("Züge bis Überdosis-Malus", perPuff > 0 ? String(Math.ceil(od0.T1 / perPuff)) : "nie", "ohne Abbau (Abbau " + fmt(od0.die * 60, 1) + " pro Minute) · bis Erbrechen: " + (perPuff > 0 ? Math.ceil(od0.T2 / perPuff) : "nie")));
    }
  }

  function soupDose(c, sec) {
    const tick = num(c, sec + "TickTime");
    const last = num(c, sec + "LastingTime");
    const ticks = Math.max(0, Math.floor(last / tick));
    const get = (k) => num(c, sec + k) * ticks;
    return { tick: tick, last: last, ticks: ticks, hp: get("AmountHealthPerTick"), bp: get("AmountBloodPerTick"), mental: get("AmountMentalPerTick"), sleep: get("AmountSleepPerTick"), rad: get("IncrementRADPerTick") };
  }

  /** Eingabefelder für die Annahmen der Überdosis-Rechnung (Abschnitte mit Medikamenten). */
  function calcControls(secKey, redraw) {
    if (["Overdose", "Ibuprofene", "Vikasol", "Diazepam", "AntiRad", "NaxaloneSyringe", "Joint"].indexOf(secKey) < 0) return null;
    const mk = (label, key, tip) => {
      const inp = h("input", { type: "number", step: "any", min: "0", value: od[key], style: "max-width:100px" });
      inp.addEventListener("input", () => {
        const v = Number(inp.value);
        if (Number.isFinite(v) && v >= 0) {
          od[key] = v;
          redraw();
        }
      });
      return h("div", { class: "field" }, [h("label", {}, [label, tipNode(tip)]), inp]);
    };
    return h("div", { class: "toolbar mp-assume" }, [
      mk("Einnahme-Abstand (s)", "interval", "Für die Rechnung „wie viele Dosen bis zur Überdosis“: Zeit zwischen zwei Dosen. Der Wirkstoff baut sich dazwischen ab."),
      mk("Wirkdauer ohne Config (s)", "unknownDur", "Für Medikamente ohne eigene Dauer in der MedPlus-Config (Schmerzmittel, Tetracyclin, Morphin, Epinephrin, Kohle) ist die Wirkdauer unbekannt – hier eine Annahme eintragen."),
      h("span", { class: "muted small", text: "Annahmen für die Live-Rechnung – werden nicht in die Datei geschrieben." }),
    ]);
  }

  const CALC = {
    BrainConcussion(c, out) {
      const lt = num(c, "modifierLastingTime");
      const tt = num(c, "modifierTickTime");
      const ticks = Math.floor(lt / tt);
      out.push(head("Dauer & Folgen"));
      out.push(row("Dauer", fmtTime(lt), ticks + " Takte à " + fmt(tt) + " s"));
      out.push(row("Schock gesamt", fmt(num(c, "shockApplyedperTick") * ticks, 0), fmt(num(c, "shockApplyedperTick")) + " × " + ticks));
      const pv = num(c, "BrainConcussionChanceVomitPerTick") / 100;
      out.push(row("Chance auf Erbrechen währenddessen", fmt((1 - Math.pow(1 - pv, ticks)) * 100, 1) + " %", fmt(num(c, "BrainConcussionChanceVomitPerTick"), 1) + " % je Takt über " + ticks + " Takte"));
      chanceRows(out, c, [
        ["BrainConcussionChanceHit", "Allgemeiner Treffer"],
        ["BrainConcussionChanceHitZombie", "Zombie"],
        ["BrainConcussionChanceHitAnimal", "Tier"],
        ["BrainConcussionChanceHitMelee", "Nahkampf"],
        ["BrainConcussionChanceHitGrenade", "Granate"],
        ["BrainConcussionChanceHitFireArm", "Schusswaffe"],
      ], "Wie oft bis zur Gehirnerschütterung?");
    },
    HelmetProtectionBrainConcussion(c, out) {
      out.push(head("Schutzstufen"));
      [["PristineProtection", "Neuwertig"], ["WornProtection", "Abgenutzt"], ["DamagedProtection", "Beschädigt"], ["BadlyDamagedProtection", "Stark beschädigt"]].forEach(([k, l]) =>
        out.push(row(l, fmt(num(c, k) * 100, 0) + " %", "Schutzfaktor " + fmt(num(c, k))))
      );
      const a = ["PristineProtection", "WornProtection", "DamagedProtection", "BadlyDamagedProtection"].map((k) => num(c, k));
      if (a.some((v, i) => i && v > a[i - 1])) out.push(warn("Ein schlechterer Zustand schützt besser als ein besserer – die Stufen sollten absteigen (Neu ≥ Abgenutzt ≥ Beschädigt ≥ Stark beschädigt)."));
      const base = num(c, "BrainConcussionChanceHitFireArm");
      out.push(head("Beispiel (Annahme: Restchance = Chance × (1 − Schutzfaktor))"));
      [["PristineProtection", "Helm neuwertig"], ["DamagedProtection", "Helm beschädigt"]].forEach(([k, l]) => out.push(row("Schusswaffen-Treffer, " + l, fmt(base * (1 - num(c, k)), 1) + " %", "statt " + fmt(base, 1) + " % ohne Helm")));
    },
    KnifeWound(c, out) {
      bleedRows(out, "Blutverlust durch Messerwunden", num(c, "KnifeBloodDrainedPerTickPerWound"), num(c, "KnifeModifierBleedTickTime"), num(c, "KnifeStopBleedTimeSimpleCure"));
      out.push(head("Lebensverlust durch Behandlung"));
      hitsRow(out, "Ausbrennen mit der Fackel", num(c, "KnifeStitchWithTorchHPDepletion"), "je Wunde");
      if (c.KnifeEnableAutoClose === 1) out.push(row("Selbstschluss nach", fmtTime(num(c, "KnifeWoundTimerAutoClose")), fmt(num(c, "KnifeAutoCloseWInfectionChance"), 0) + " % Infektionsrisiko"));
    },
    BulletDMG(c, out) {
      bleedRows(out, "Blutverlust durch Schusswunden", num(c, "bloodDrainedPerTick"), num(c, "modifierBleedTickTime"), num(c, "stopBleedTimeSimpleCure"));
      const a = num(c, "bulletDamageChanceHit");
      const b = num(c, "bulletDamageChanceTrepassing");
      out.push(head("Kugelverbleib"));
      out.push(row("Kugel bleibt stecken", fmt(a, 0) + " %", ""));
      out.push(row("Durchschuss", fmt(b, 0) + " %", ""));
      if (Math.abs(a + b - 100) > 0.001) out.push(warn("Stecken (" + a + " %) + Durchschuss (" + b + " %) ergeben " + (a + b) + " % statt 100 %."));
      else out.push(ok("Stecken + Durchschuss = 100 %."));
    },
    StoppingCut(c, out) {
      out.push(head("Infektionsrisiko beim Schließen"));
      out.push(row("Sich selbst schließende Wunde", fmt(num(c, "StoppingCutChanceToGetInfectOnCloseNoItem") * 100, 1) + " %", "Faktor " + fmt(num(c, "StoppingCutChanceToGetInfectOnCloseNoItem")) + " (Vanilla 0,40)"));
      out.push(row("Nicht desinfizierter Verband", fmt(num(c, "StoppingCutChanceToGetInfectOnCloseDirtyItem") * 100, 1) + " %", "Faktor " + fmt(num(c, "StoppingCutChanceToGetInfectOnCloseDirtyItem")) + " (Vanilla 0,15)"));
      out.push(row("Blutstillung dauert", fmtTime(num(c, "StoppingCutTimeSimpleCure")), ""));
    },
    Ematoma(c, out) {
      const lt = num(c, "EmatomaLastingtime");
      const tt = num(c, "EmatomaTickTime");
      const ticks = Math.floor(lt / tt);
      out.push(head("Ein Bluterguss"));
      out.push(row("Dauer", fmtTime(lt), ticks + " Takte"));
      out.push(row("Lebensverlust gesamt", fmt(num(c, "EmatomaHealthDrainedPerTick") * ticks, 1), fmt(num(c, "EmatomaHealthDrainedPerTick")) + " × " + ticks));
      out.push(row("Rennen gesperrt ab", fmt(num(c, "EmatomaNoRunCount"), 0) + " Blutergüssen", ""));
      out.push(head("Tod durch Blutergüsse"));
      deathRow(out, "Ab " + fmt(num(c, "EmatomaThresholdActivation"), 0) + " Blutergüssen", num(c, "EmatomaHealthDrainedPerTick") / tt, "bleibt der Lebensverlust bestehen, solange die Schwelle überschritten ist");
      const a = c.clothProtectionHematoma || [];
      const p = c.percentageProtectionHematoma || [];
      if (a.length !== p.length) out.push(warn("Kleidungs-Liste (" + a.length + ") und Schutz-Liste (" + p.length + ") sind nicht gleich lang."));
    },
    HeartAttack(c, out) {
      const tt = num(c, "HATickTime");
      out.push(head("Lebensverlust und Tod"));
      if (num(c, "HAHalveOrSubtractHP") === 1) out.push(row("Herzinfarkt", "−50 % der aktuellen HP", "ein Infarkt ist bei vollem Leben nie sofort tödlich; bei " + fmt(num(c, "HAHealthDepletedFaint"), 0) + " HP bleiben je 50 %"));
      hitsRow(out, "Ohnmacht (HAHealthDepletedFaint)", num(c, "HAHealthDepletedFaint"), "laut Doku wird der Betrag abgezogen, wenn Halbieren aus ist");
      out.push(head("Erwartete Zeit bis zum Ereignis (Dauerbelastung)"));
      [["HAChanceWithOverweightPerTick", "Herzinfarkt bei Übergewicht"], ["HAChanceWithFearPerTick", "Herzinfarkt bei Angst"], ["HAChanceWithElectricPerTick", "Herzinfarkt bei Strom"], ["HAChanceToFaintPerTick", "Ohnmacht"]].forEach(([k, l]) => {
        const p = num(c, k) / 100;
        out.push(row(l, p > 0 ? "Ø " + fmtTime(tt / p) : "nie", fmt(num(c, k), 2) + " % je Takt (" + fmt(tt) + " s)"));
      });
    },
    BrokenArm(c, out) {
      const lt = num(c, "BrokenArmLastingtime");
      const tt = num(c, "BrokenArmTickTime");
      const ticks = Math.floor(lt / tt);
      out.push(head("Heilung über die Dauer (" + fmtTime(lt) + ", " + ticks + " Takte)"));
      out.push(row("Ohne Verband", fmt(num(c, "BrokenArmHealNoArmBandage") * ticks, 1), fmt(num(c, "BrokenArmHealNoArmBandage")) + " × " + ticks));
      out.push(row("Mit Armverband", fmt(num(c, "BrokenArmHealWithArmBandage") * ticks, 1), fmt(num(c, "BrokenArmHealWithArmBandage")) + " × " + ticks));
      out.push(row("Heilungs-Schwelle", fmt(num(c, "BrokenArmHealingHealthThreshold"), 0), "ab diesem Lebenswert darf der Arm heilen"));
      if (num(c, "BrokenArmsEnable") === 0) out.push(warn("Armbrüche sind deaktiviert (BrokenArmsEnable = 0) – die übrigen Werte wirken nicht."));
    },
    Leg(c, out) {
      out.push(head("Humpeln"));
      out.push(row("Leichtes Humpeln unter", fmt(num(c, "LegLightLimp"), 0) + " Bein-Gesundheit", ""));
      out.push(row("Starkes Humpeln unter", fmt(num(c, "LegHeavyLimp"), 0) + " Bein-Gesundheit", ""));
      if (num(c, "LegHeavyLimp") > num(c, "LegLightLimp")) out.push(warn("Starkes Humpeln beginnt vor dem leichten – „Stark“ sollte kleiner als „Leicht“ sein."));
    },
    Slippery(c, out) {
      const shoes = c.SlipperyShoes || [];
      const f = c.SlipFactor || [];
      out.push(head("Schuhe & Rutsch-Faktor"));
      out.push(row("Barfuß (Grundchance)", fmt(num(c, "SlipperyBaseChanceBareFoot"), 0) + " %", ""));
      if (shoes.length !== f.length) out.push(warn("Schuh-Liste (" + shoes.length + ") und Rutsch-Faktoren (" + f.length + ") sind nicht gleich lang."));
      else if (f.length) {
        const max = Math.max.apply(null, f);
        const min = Math.min.apply(null, f);
        out.push(row("Rutschigster Schuh", shoes[f.indexOf(max)], "Faktor " + fmt(max)));
        out.push(row("Griffigster Schuh", shoes[f.indexOf(min)], "Faktor " + fmt(min)));
      }
      out.push(head("Folgen eines Sturzes"));
      out.push(row("Bein verletzt", fmt(num(c, "SlipperyChanceToDamageLeg"), 0) + " %", "Schaden " + fmt(num(c, "SlipperyLegDamage"), 0)));
      out.push(row("Arm verletzt", fmt(num(c, "SlipperyChanceToDamageArm"), 0) + " %", "Schaden " + fmt(num(c, "SlipperyArmDamage"), 0)));
    },
    Drunkeness(c, out) {
      const tt = num(c, "DrunkTickTime");
      const die = num(c, "DrunkenessAgentDieOffSpeed");
      const vod = num(c, "DrunkAgentInsertedPerQuantityVodka");
      out.push(head("Wodka-Menge bis zur Stufe (Einheiten, vermutlich ml)"));
      [["DrunkAgentThresholdActivation", "Betrunken"], ["DrunkAgentThresholdVomit", "Erbrechen möglich"], ["DrunkAgentThresholdFaint", "Ohnmacht möglich"], ["DrunkenessAgentMAXCOUNT", "Maximum"]].forEach(([k, l]) =>
        out.push(row(l, fmt(num(c, k) / vod, 0), "Schwelle " + fmt(num(c, k), 0) + " ÷ " + fmt(vod, 3) + " je Einheit"))
      );
      out.push(head("Abbau"));
      out.push(row("Vom Maximum bis nüchtern", fmtTime((num(c, "DrunkenessAgentMAXCOUNT") - num(c, "DrunkAgentThresholdDeActivation")) / die), fmt(die) + " pro Sekunde (laut Doku)"));
      out.push(row("Von „Ohnmacht“ bis nüchtern", fmtTime((num(c, "DrunkAgentThresholdFaint") - num(c, "DrunkAgentThresholdDeActivation")) / die), ""));
      const g = ["DrunkAgentThresholdDeActivation", "DrunkAgentThresholdActivation", "DrunkAgentThresholdVomit", "DrunkAgentThresholdFaint", "DrunkenessAgentMAXCOUNT"].map((k) => num(c, k));
      if (g.some((v, i) => i && v < g[i - 1])) out.push(warn("Die Schwellen sollten aufsteigen: Nüchtern < Betrunken < Erbrechen < Ohnmacht < Maximum."));
      const coal = num(c, "DrunkAgentCuredByCharcoalPerTick");
      if (coal > 0) {
        out.push(head("Mit Aktivkohle"));
        out.push(row("Zusätzlicher Abbau", fmt(coal * 60 / tt, 1) + " pro Minute", fmt(coal) + " alle " + fmt(tt) + " s – natürlicher Abbau: " + fmt(die * 60, 1) + " pro Minute"));
        out.push(row("Vom Maximum bis nüchtern", fmtTime((num(c, "DrunkenessAgentMAXCOUNT") - num(c, "DrunkAgentThresholdDeActivation")) / (die + coal / tt)), "mit Kohle (statt " + fmtTime((num(c, "DrunkenessAgentMAXCOUNT") - num(c, "DrunkAgentThresholdDeActivation")) / die) + ")"));
      }
    },
    Overdose(c, out) {
      const tt = num(c, "OverdoseTickTime");
      const die = num(c, "OverdoseAgentDieOffSpeed");
      out.push(head("Abbau"));
      out.push(row("Vom Maximum bis 0", fmtTime(num(c, "OverdoseAgentMAXCOUNT") / die), fmt(die) + " pro Sekunde (laut Doku)"));
      out.push(row("Von „Malus“ bis 0", fmtTime(num(c, "OverdoseAgentThresholdMalusActivation") / die), ""));
      const minute = 60 / tt;
      out.push(head("Folgen pro Minute (ab Malus-Schwelle)"));
      [["OverdoseHealthLossPerTick", "Lebensverlust"], ["OverdoseShockLossPerTick", "Schock"], ["OverdoseStaminaLossPerTick", "Ausdauerverlust"]].forEach(([k, l]) => out.push(row(l, fmt(num(c, k) * minute, 1) + " / min", fmt(num(c, k)) + " je Takt")));
      overdoseRows(c, out, "");
    },
    Ibuprofene(c, out) {
      medRows(c, out, "Ibuprofene");
    },
    Ematogel(c, out) {
      medRows(c, out, "Ematogel");
    },
    Vikasol(c, out) {
      medRows(c, out, "Vikasol");
    },
    EnergyDrink(c, out) {
      medRows(c, out, "EnergyDrink");
    },
    Diazepam(c, out) {
      medRows(c, out, "Diazepam");
    },
    AntiRad(c, out) {
      medRows(c, out, "AntiRad");
    },
    NaxaloneSyringe(c, out) {
      medRows(c, out, "NaxaloneSyringe");
    },
    HPRecover(c, out) {
      medRows(c, out, "HPRecover");
    },
    BPRecover(c, out) {
      medRows(c, out, "BPRecover");
    },
    MHRecover(c, out) {
      medRows(c, out, "MHRecover");
    },
    Joint(c, out) {
      puffRows(c, out, "Joint");
    },
    Sigaretta(c, out) {
      puffRows(c, out, "Sigaretta");
    },
    HeadBone(c, out) {
      out.push(head("Heilung der Kopfverletzung relativ zu Vanilla (Vanilla = ×2)"));
      [["HeadBoneRegenWithHeadBandMultiplier", "Mit Kopfband"], ["HeadBoneRegenWithIbuprofeneMultiplier", "Mit Ibuprofen"], ["HeadBoneRegenWithBothMultiplier", "Mit Kopfband + Ibuprofen"]].forEach(([k, l]) =>
        out.push(row(l, "×" + fmt(num(c, k)), fmt(num(c, k) / 2, 2) + "× so schnell wie Vanilla"))
      );
      out.push(row("Kopfsymbol sichtbar", "unter " + fmt(num(c, "HeadBoneThresholdToShowIcon"), 0) + " von 33 HP", "wieder weg ab " + fmt(num(c, "HeadBoneThresholdToUnShowIcon"), 0)));
    },
    Overweight(c, out) {
      out.push(head("Traglast"));
      out.push(row("Max. Traggewicht", fmt(num(c, "OverweightMaxWeightCarryable") / 1000, 1) + " kg", fmt(num(c, "OverweightMaxWeightCarryable"), 0) + " g"));
      out.push(row("Folgen nach", fmtTime(num(c, "OverweightOverloadTimeToActivate")), "unter Überlast"));
      out.push(row("Max. Zeit unter Überlast", fmtTime(num(c, "OverweightMaxTimeSufferingOverload")), ""));
      if (num(c, "OverweightEnableMaxWeightThresBySleep") === 1) out.push(row("Tragegrenze bei Müdigkeit", fmt(num(c, "OverweightMaxWeightCarryable") * num(c, "OverweightEnableMaxWeightThresBySleepDivider") / 1000, 1) + " kg", "× " + fmt(num(c, "OverweightEnableMaxWeightThresBySleepDivider"))));
      const tt = num(c, "OverweightTickTime");
      out.push(head("Verlust pro Minute unter Überlast"));
      out.push(row("Energie", fmt(num(c, "OverweightEnergyLossPerTick") * 60 / tt, 1), ""));
      out.push(row("Müdigkeit", fmt(num(c, "OverweightTirednessLossPerTick") * 60 / tt, 1), ""));
    },
    Sleep(c, out) {
      const tt = num(c, "SleepTickTime");
      const hour = 3600 / tt;
      out.push(head("Schlafaufbau pro Stunde (Multiplikator = 1 + Zuschläge, laut Doku)"));
      const base = num(c, "SleepGainDefaultPerTick");
      out.push(row("Ohne Zuschläge (×1)", fmt(base * hour, 0), fmt(base) + " je Takt à " + fmt(tt) + " s"));
      const add = [["SleepGainIfIsWarm", "Wärme"], ["SleepGainIfIsCover", "Deckung"], ["SleepGainIfIsNight", "Nacht"], ["SleepGainIfIsTeddy", "Teddy"], ["SleepGainIfIsSleepBag", "Schlafsack"]];
      add.forEach(([k, l]) => {
        const m = 1 + num(c, k);
        out.push(row("Nur " + l, fmt(base * m * hour, 0), "× " + fmt(m)));
      });
      const mult = 1 + add.reduce((s, [k]) => s + num(c, k), 0);
      out.push(row("Alles zusammen", fmt(base * mult * hour, 0), "× " + fmt(mult) + " (Wärme + Deckung + Nacht + Teddy + Schlafsack)"));
      out.push(row("Zeit für 1000 Schlafwert (Beispiel)", fmtTime(1000 / (base * mult) * tt), "mit allen Zuschlägen; ohne: " + fmtTime(1000 / base * tt)));
      out.push(head("Dauer"));
      out.push(row("Schlafzyklus", fmtTime(num(c, "SleepDuration")), fmt(num(c, "SleepDuration") / 3600, 1) + " Stunden"));
    },
    Igiene(c, out) {
      out.push(head("Dauer"));
      out.push(row("Sauberkeit hält", fmtTime(num(c, "IgieneDuration")), fmt(num(c, "IgieneDuration") / 3600, 1) + " Stunden"));
      out.push(row("Hot-Water ab", fmt(num(c, "IgieneMinTempToBeConsideredHotWater"), 0) + " °C", "Verbrühung ab " + fmt(num(c, "IgieneMinHotTempToMakeDamage"), 0) + " °C"));
      out.push(row("Geruchs-Reichweite", fmt(num(c, "IgieneSniffRange"), 0) + " m", ""));
      out.push(head("Lebensverlust"));
      hitsRow(out, "Waschen mit heißem Wasser (Topf/Kessel)", num(c, "IgieneCleaningBottleBaseHotDMGCycle"), "je Waschzyklus ab " + fmt(num(c, "IgieneMinHotTempToMakeDamage"), 0) + " °C");
    },
    Mental(c, out) {
      const tt = num(c, "MentalTickTime");
      out.push(head("Mentalwert"));
      out.push(row("Verlust pro Stunde", fmt(num(c, "MentalStatLossPerTick") * 3600 / tt, 0), fmt(num(c, "MentalStatLossPerTick")) + " alle " + fmt(tt) + " s – gilt nur, wenn „Wahnsinn“ (MentalEnableMadness) an ist"));
      const kp = num(c, "MentalInsertByKillingPlayer");
      const kz = num(c, "MentalInsertByKillingZombie");
      out.push(row("Spieler töten ≙ Zombies töten", fmt(kp / kz, 1) + " Zombies", fmt(kp, 0) + " ÷ " + fmt(kz, 0)));
      const ka = num(c, "MentalInsertByKillingAnimal");
      out.push(row("Tier töten ≙ Zombies töten", fmt(ka / kz, 1) + " Zombies", ""));
      out.push(head("Lebensverlust und Tod"));
      if (num(c, "MentalDeathTouchHalveOrSubOrShock") === 1) hitsRow(out, "Todesberührung (Phantom/Albtraum)", num(c, "MentalDeathTouchHPLost"), "Modus: Leben abziehen");
      else out.push(row("Todesberührung", num(c, "MentalDeathTouchHalveOrSubOrShock") === 0 ? "halbiert das Leben" : "Schock statt Leben", "Modus " + fmt(num(c, "MentalDeathTouchHalveOrSubOrShock"), 0)));
      hitsRow(out, "Kruzifix", num(c, "MentalPrayingCrucifixDamage"), "Schaden je Gebet");
      out.push(head("Schwellen (Mentalwert, ab dem das Ereignis auftritt)"));
      [["MentalLaughStatThreshold", "Lachen"], ["MentalPhantomStatThreshold", "Phantom-Schüsse"], ["MentalSuicideStatThreshold", "Selbstmord-Stufe 1"], ["MentalSuicideFinalStatThreshold", "Selbstmord final"], ["MentalNightmareLevelThreshold", "Albträume"]].forEach(([k, l]) => out.push(row(l, fmt(num(c, k), 0), "")));
    },
    Shit(c, out) {
      cycle(c, out, "Shit", "Stuhlgang");
    },
    Piss(c, out) {
      cycle(c, out, "Piss", "Wasserlassen");
    },
    FirePlaceRecover(c, out) {
      const tt = num(c, "FirePlaceRecoverTickTime");
      out.push(head("Erholung pro Minute am Feuer (Radius " + fmt(num(c, "FirePlaceRecoverRadius"), 1) + " m)"));
      [["FirePlaceRecoverHPAmount", "Leben"], ["FirePlaceRecoverBPAmount", "Blut"], ["FirePlaceRecoverMentalAmount", "Mental"]].forEach(([k, l]) => out.push(row(l, fmt(num(c, k) * 60 / tt, 1) + " / min", fmt(num(c, k)) + " alle " + fmt(tt) + " s")));
    },
    CabinFever(c, out) {
      const tt = num(c, "CabinFeverTickTime");
      const up = num(c, "CabinFeverRiskIncreasePerTick");
      const thr = num(c, "CabinFeverThresholdToTrigger");
      out.push(head("Zeit bis zum Lagerkoller"));
      out.push(row("Drinnen", fmtTime(thr / up * tt + num(c, "CabinFeverMinTimeIndoorsBeforeGrowing")), "Auslöse-Schwelle ÷ Anstieg + Karenzzeit"));
      if (num(c, "CabinFeverWorseInBadWeather") === 1) out.push(row("Bei schlechtem Wetter", fmtTime(thr / (up * num(c, "CabinFeverBadWeatherIncreaseMultiplier")) * tt + num(c, "CabinFeverMinTimeIndoorsBeforeGrowing")), "× " + fmt(num(c, "CabinFeverBadWeatherIncreaseMultiplier"))));
      out.push(row("Abbau draußen (von der Schwelle)", fmtTime(thr / num(c, "CabinFeverRiskDecayPerTick") * tt), ""));
      const dzUp = num(c, "CabinfeverDiazepamIncreaseDivider");
      const dzDown = num(c, "CabinFeverDiazepamDecreaseMultiplier");
      out.push(head("Mit Diazepam"));
      out.push(row("Zeit bis Lagerkoller drinnen", fmtTime(thr / (up * dzUp) * tt + num(c, "CabinFeverMinTimeIndoorsBeforeGrowing")), "Anstieg × " + fmt(dzUp)));
      out.push(row("Abbau draußen", fmtTime(thr / (num(c, "CabinFeverRiskDecayPerTick") * dzDown) * tt), "Abbau × " + fmt(dzDown)));
    },
    Insomnia(c, out) {
      out.push(head("Schlaflosigkeit"));
      out.push(row("Aktiv für", fmtTime(num(c, "InsomniaDurationActive")), ""));
      out.push(row("Aufwach-Chance je Takt", fmt(num(c, "InsomniaWakeUpChancePerTick"), 0) + " %", "Takt " + fmt(num(c, "InsomniaTickTime")) + " s"));
    },
  };

  function cycle(c, out, p, label) {
    const tt = num(c, p + "ModifierTickTime");
    const per = num(c, p === "Shit" ? "ShitQtyOfShitByDigestingFoodPerTick" : "PissQtyOfPissByDigestingWaterPerTick");
    const max = num(c, p + "MaxValue");
    out.push(head(label + ": wann welche Schwelle erreicht wird (bei ununterbrochener Verdauung)"));
    [[p + "ThresholdValue", "Drang"], [p + "ThresholdEffectiveness", "Wirkung (Folgen)"], [p + "ValueToDisableRun", "Rennen gesperrt"], [p + "ThresholdShitYourPantsOut".replace("Shit", p === "Shit" ? "Shit" : "Piss"), "Unfall möglich"]].forEach(([k, l]) => {
      const v = num(c, k);
      if (!Number.isFinite(v)) return;
      out.push(row(l, fmtTime(v / per * tt), fmt(v, 0) + " von " + fmt(max, 0) + " (" + fmt(v / max * 100, 0) + " %)"));
    });
  }

  function listWarnings(c, secKey, out) {
    const sec = cat().bySec[secKey];
    if (!sec) return;
    sec.keys.forEach(([k, t]) => {
      if (t !== "a" || !Array.isArray(c[k]) || typeof c[k][0] !== "string") return;
      const seen = new Set();
      const dup = [];
      c[k].forEach((x) => (seen.has(x) ? dup.indexOf(x) < 0 && dup.push(x) : seen.add(x)));
      if (dup.length) out.push(warn(k + ": doppelte Einträge – " + dup.join(", ")));
    });
    const pair = Object.values(PAIRS).find((p) => sec.keys.some((x) => x[0] === p[0]));
    if (pair && Array.isArray(c[pair[0]]) && Array.isArray(c[pair[1]]) && c[pair[0]].length !== c[pair[1]].length && secKey !== "Slippery" && secKey !== "Ematoma") {
      out.push(warn(pair[0] + " hat " + c[pair[0]].length + " Einträge, " + pair[1] + " aber " + c[pair[1]].length + ". Die Werte werden vermutlich nach Position zugeordnet – die Listen sollten gleich lang sein (unten „Auf gleiche Länge bringen“)."));
    }
  }

  function calcFor(item, secKey) {
    const c = item.json;
    const out = [];
    const sec = cat().bySec[secKey];
    try {
      if (CALC[secKey]) CALC[secKey](c, out);
      else if (sec) perTickRows(out, c, sec);
      listWarnings(c, secKey, out);
    } catch (e) {
      out.push(warn("Berechnung nicht möglich: " + e.message));
    }
    return out;
  }

  function renderCalc(item, secKey) {
    const lines = calcFor(item, secKey);
    const box = h("div", { class: "mp-calc" });
    if (!lines.length) return null;
    box.appendChild(h("div", { class: "check-head", text: "Live-Berechnung" }));
    lines.forEach((l) => {
      if (l.k === "head") box.appendChild(h("div", { class: "mp-calc-head", text: l.t }));
      else if (l.k === "warn") box.appendChild(h("div", { class: "issue warn", text: l.t }));
      else if (l.k === "ok") box.appendChild(h("div", { class: "issue ok", text: l.t }));
      else box.appendChild(h("div", { class: "mp-calc-row" }, [h("span", { class: "mp-calc-l", text: l.l }), h("span", { class: "mp-calc-v", text: l.v }), l.n ? h("span", { class: "mp-calc-n muted small", text: l.n }) : null]));
    });
    return box;
  }

  // ---------------------------------------------------------------- JSON schreiben (Format der Originaldateien, Kommazahlen mit .0)
  function floatNames(item) {
    const set = new Set();
    if (item.kind === "medplus") cat().secs.forEach((s) => s.keys.forEach(([k, t]) => t === "f" && set.add(k)));
    const raw = item.rawText || "";
    let m;
    const rx = /"([A-Za-z0-9_]+)"\s*:\s*\[?\s*-?\d+\.\d/g;
    while ((m = rx.exec(raw))) set.add(m[1]);
    return set;
  }
  function ser(v, ind, key, fl) {
    const pad = " ".repeat(ind);
    if (v === null || v === undefined) return "null";
    if (typeof v === "number") return Number.isInteger(v) && fl.has(key) ? v.toFixed(1) : String(v);
    if (typeof v === "string") return JSON.stringify(v);
    if (typeof v === "boolean") return v ? "true" : "false";
    if (Array.isArray(v)) {
      if (!v.length) return "[]";
      return "[\n" + v.map((x) => pad + "    " + ser(x, ind + 4, key, fl)).join(",\n") + "\n" + pad + "]";
    }
    const keys = Object.keys(v);
    if (!keys.length) return "{}";
    return "{\n" + keys.map((k) => pad + "    " + JSON.stringify(k) + ": " + ser(v[k], ind + 4, k, fl)).join(",\n") + "\n" + pad + "}";
  }
  function stringify(item) {
    return ser(item.json, 0, "", floatNames(item)) + "\n";
  }

  // ---------------------------------------------------------------- Zugriff auf Dateien
  function mainItems() {
    return P().byKind("medplus");
  }
  function mainItem() {
    const items = mainItems();
    let it = items.find((i) => i.uid === st.main);
    if (!it) it = items.find((i) => !/_old/i.test(i.fileId || "")) || items[0];
    if (it) st.main = it.uid;
    return it || null;
  }
  function fileItem(kind) {
    return P().byKind(kind)[0] || null;
  }
  function origOf(item) {
    if (!item.rawText) return null;
    if (item.__origText !== item.rawText) {
      try {
        item.__orig = JSON.parse(item.rawText);
      } catch (e) {
        item.__orig = null;
      }
      item.__origText = item.rawText;
    }
    return item.__orig;
  }
  function setVal(item, key, value) {
    P().mutate(item.uid, (j) => {
      j[key] = value;
    });
  }
  function sameVal(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  // ---------------------------------------------------------------- Eingabeelemente
  function classSuggest(section, baseRe) {
    if (!EQE.Cfg) return [];
    const names = EQE.Cfg.classNames(section);
    if (!baseRe) return names.slice(0, 5000);
    return names.filter((n) => {
      const e = EQE.Cfg.getEntry(section, n);
      return e && EQE.Cfg.chainNames(e).some((x) => baseRe.test(x));
    }).slice(0, 5000);
  }

  function tipNode(text) {
    return h("span", { class: "tip", "data-tip": text, tabindex: "0", text: "?" });
  }

  /** Zahlenfeld, das direkt in item.json[key] schreibt. */
  function numInput(item, key, isInt, afterChange) {
    const orig = origOf(item);
    const input = h("input", { type: "number", step: isInt ? "1" : "any", value: item.json[key] });
    input.addEventListener("input", () => {
      const t = input.value.trim();
      if (t === "" || !Number.isFinite(Number(t))) return;
      setVal(item, key, isInt ? Math.round(Number(t)) : Number(t));
      input.classList.toggle("ov2-changed-input", !!orig && !sameVal(orig[key], item.json[key]));
      if (afterChange) afterChange();
    });
    if (orig && !sameVal(orig[key], item.json[key])) input.classList.add("ov2-changed-input");
    return input;
  }

  function chipEditor(item, key, suggest, afterChange) {
    const arr = item.json[key];
    const chips = h("div", { class: "strlist" });
    const isNum = arr.length && typeof arr[0] === "number";
    const draw = () => {
      clear(chips);
      arr.forEach((v, i) =>
        chips.appendChild(h("span", { class: "chip" }, [String(v), h("button", { type: "button", text: "×", onclick: () => (arr.splice(i, 1), commit()) })]))
      );
      if (!arr.length) chips.appendChild(h("span", { class: "muted small", text: "(leer)" }));
    };
    const commit = () => {
      P().mutate(item.uid, (j) => {
        j[key] = arr;
      });
      draw();
      if (afterChange) afterChange();
    };
    const id = suggest && suggest.length ? EQE.uid() : null;
    const add = h("input", { type: isNum ? "number" : "text", placeholder: "Hinzufügen (Enter)", list: id || undefined });
    add.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const t = add.value.trim();
      if (!t) return;
      arr.push(isNum ? Number(t) : t);
      add.value = "";
      commit();
    });
    draw();
    return h("div", { class: "list" }, [chips, h("div", { class: "chip-add" }, [add, id ? h("datalist", { id: id }, suggest.map((s) => h("option", { value: s }))) : null])]);
  }

  /** Paar-Tabelle (Name + Wert, gleiche Position in zwei Arrays). */
  function pairTable(item, pair, secKey, afterChange) {
    const [nk, vk, nLabel, vLabel] = pair;
    const j = item.json;
    if (!Array.isArray(j[nk])) j[nk] = [];
    if (!Array.isArray(j[vk])) j[vk] = [];
    const body = h("tbody");
    const dlId = EQE.uid();
    const suggest = classSuggest("CfgVehicles");
    const commit = () => {
      P().mutate(item.uid, (x) => {
        x[nk] = j[nk];
        x[vk] = j[vk];
      });
      if (afterChange) afterChange();
    };
    const draw = () => {
      clear(body);
      const n = Math.max(j[nk].length, j[vk].length);
      for (let i = 0; i < n; i++) {
        const name = h("input", { type: "text", value: j[nk][i] === undefined ? "" : j[nk][i], list: dlId, oninput: (e) => ((j[nk][i] = e.target.value), commit()) });
        const val = h("input", {
          type: "number",
          step: "any",
          value: j[vk][i] === undefined ? "" : j[vk][i],
          placeholder: "fehlt",
          class: j[vk][i] === undefined ? "invalid" : "",
          oninput: (e) => {
            if (e.target.value === "") return;
            j[vk][i] = Number(e.target.value);
            e.target.classList.remove("invalid");
            commit();
          },
        });
        body.appendChild(
          h("tr", {}, [
            h("td", { class: "muted small", text: String(i + 1) }),
            h("td", {}, [name]),
            h("td", {}, [val]),
            h("td", {}, [h("button", { class: "btn icon small", type: "button", title: "Zeile löschen", text: "✕", onclick: () => (j[nk].splice(i, 1), j[vk].splice(i, 1), commit(), draw()) })]),
          ])
        );
      }
    };
    draw();
    const lenNote = h("div", { class: "help" });
    const refreshNote = () => {
      lenNote.textContent = j[nk].length + " Namen · " + j[vk].length + " Werte" + (j[nk].length !== j[vk].length ? " – NICHT gleich lang" : "");
      lenNote.style.color = j[nk].length !== j[vk].length ? "var(--danger)" : "";
    };
    refreshNote();
    const origCommit = commit;
    return h("div", { class: "field span2" }, [
      h("label", {}, [nLabel + " & " + vLabel, tipNode("Beide Listen gehören zusammen: der Wert an Position n gehört zum Namen an Position n. " + (T().info(secKey, vk).help || ""))]),
      lenNote,
      h("div", { class: "table-scroll" }, [h("table", { class: "ptable prod-table" }, [h("thead", {}, [h("tr", {}, ["#", nLabel, vLabel, ""].map((t) => h("th", { text: t })))]), body])]),
      h("datalist", { id: dlId }, suggest.map((s) => h("option", { value: s }))),
      h("div", { class: "toolbar" }, [
        h("button", { class: "btn small", type: "button", text: "Zeile hinzufügen", onclick: () => (j[nk].push(""), j[vk].push(0), origCommit(), draw(), refreshNote()) }),
        h("button", {
          class: "btn small",
          type: "button",
          text: "Auf gleiche Länge bringen",
          onclick: () => {
            const n = Math.max(j[nk].length, j[vk].length);
            while (j[nk].length < n) j[nk].push("");
            while (j[vk].length < n) j[vk].push(0);
            origCommit();
            draw();
            refreshNote();
          },
        }),
      ]),
    ]);
  }

  // ---------------------------------------------------------------- Abschnitt anzeigen
  function fieldRow(item, secKey, key, type, afterChange) {
    const info = T().info(secKey, key);
    const val = item.json[key];
    if (val === undefined) {
      return h("div", { class: "field" }, [
        h("label", {}, [info.label, tipNode(info.help), h("span", { class: "pill", text: "nicht in der Datei" })]),
        h("button", {
          class: "btn small",
          type: "button",
          text: "Hinzufügen",
          onclick: () => (setVal(item, key, type === "a" ? [] : type === "s" ? "" : 0), render()),
        }),
      ]);
    }
    let control;
    if (type === "a") control = chipEditor(item, key, key === "SleepingBeds" || key === "Helms" ? classSuggest("CfgVehicles") : null, afterChange);
    else if (type === "s") {
      control = h("input", { type: "text", value: val, oninput: (e) => setVal(item, key, e.target.value) });
    } else if (ENUMS[key]) {
      control = h(
        "select",
        { onchange: (e) => (setVal(item, key, Number(e.target.value)), afterChange && afterChange()) },
        ENUMS[key].map(([v, l]) => h("option", { value: String(v), text: l, selected: v === val }))
      );
    } else if (isBoolKey(item, key)) {
      control = h("label", { class: "checkrow" }, [
        h("input", {
          type: "checkbox",
          checked: val === 1,
          onchange: (e) => {
            setVal(item, key, e.target.checked ? 1 : 0);
            if (afterChange) afterChange();
          },
        }),
        "Ein (1)",
      ]);
    } else control = numInput(item, key, type === "i", afterChange);
    const orig = origOf(item);
    const changed = orig && !sameVal(orig[key], val);
    const wrap = h("div", { class: "field" + (type === "a" ? " span2" : "") + (changed ? " ov2-changed" : "") }, [
      h("label", {}, [
        info.label,
        tipNode(info.help),
        h("span", { class: "mp-key mono muted small", text: key }),
        orig && changed
          ? h("button", { class: "btn icon small ov2-reset", type: "button", title: "Auf den geladenen Wert zurücksetzen (" + JSON.stringify(orig[key]) + ")", text: "↺", onclick: () => (setVal(item, key, JSON.parse(JSON.stringify(orig[key]))), render()) })
          : null,
      ]),
      control,
    ]);
    return wrap;
  }

  function renderSection(item, secKey, box) {
    const sec = cat().bySec[secKey];
    if (!sec) return;
    const meta = T().SECTIONS[secKey] || [secKey, ""];
    box.appendChild(h("div", { class: "mp-sec-head" }, [h("h2", { text: meta[0] }), h("div", { class: "muted", text: meta[1] }), h("div", { class: "mono muted small", text: "Abschnitt „" + secKey + "“ · " + sec.keys.length + " Werte" })]));
    const calcHost = h("div", {});
    const redrawCalc = () => {
      clear(calcHost);
      const c = renderCalc(item, secKey);
      if (c) calcHost.appendChild(c);
    };
    redrawCalc();
    const ctl = calcControls(secKey, redrawCalc);
    if (ctl) box.appendChild(ctl);
    box.appendChild(calcHost);
    if (sec.keys.some((x) => /TickTime$/i.test(x[0]))) {
      box.appendChild(
        h("div", { class: "issue ok mp-note" }, [
          "Tipp: Alle Takt-Zeiten lassen sich zentral vereinheitlichen (z. B. überall 1 s) – die Pro-Takt-Werte werden dabei mitgerechnet. ",
          h("a", { href: "#", text: "Zu „Tick-Zeiten (alle)“", onclick: (e) => (e.preventDefault(), setView({ type: "ticks" })) }),
        ])
      );
    }
    const grid = h("div", { class: "grid2" });
    const done = new Set();
    sec.keys.forEach(([k, t]) => {
      if (done.has(k) || PAIR_SECOND.has(k)) return;
      if (PAIRS[k]) {
        done.add(PAIRS[k][1]);
        grid.appendChild(pairTable(item, PAIRS[k], secKey, redrawCalc));
        return;
      }
      grid.appendChild(fieldRow(item, secKey, k, t, redrawCalc));
    });
    // Eingabeänderungen aktualisieren die Berechnung
    grid.addEventListener("input", redrawCalc);
    grid.addEventListener("change", redrawCalc);
    box.appendChild(h("div", { class: "section" }, [h("div", { class: "section-body" }, [grid])]));
  }

  // ---------------------------------------------------------------- Tabellen-Dateien
  const TABLES = {
    mp_zombie: {
      title: "Zombie-Schaden",
      intro: "Je Zombietyp: welche Verletzungen ein Treffer auslösen kann (jeweils Schalter + Chance in %), Mental- und Angst-Werte.",
      list: "ZombieDamageAll",
      name: "nameZombie",
      nameLabel: "Zombie-Klasse",
      suggest: () => classSuggest("CfgVehicles", /^ZombieBase$/i),
      cols: [
        ["Gehirnerschütterung", "enableBrainConcussion", "brainChance", "Chance in %, dass ein Treffer dieses Zombies eine Gehirnerschütterung auslöst (Schalter = aktiv)."],
        ["Platzwunde", "enableLaceration", "lacerationChance", "Chance in %, dass ein Treffer eine Platzwunde auslöst."],
        ["Bluterguss", "enableEmatoma", "ematomaChance", "Chance in %, dass ein Treffer einen Bluterguss auslöst."],
        ["Armbruch", "enableBreakArm", "breakArmChance", "Chance in %, dass ein Treffer den Arm bricht."],
        ["Beintreffer", null, "legHitChance", "Chance in %, dass das Bein getroffen wird."],
        ["Bein-Faktor", null, "legHitMux", "Faktor/Multiplikator für den Beinschaden."],
        ["Mental bei Treffer", "enableMentalInsertHit", "mentalQTYInserted", "Mentalwert-Änderung bei einem Treffer (Schalter = aktiv)."],
        ["Angst-Bedrohung", null, "fearThreatQty", "Bedrohungswert dieses Zombies für das Angst-System."],
        ["Mental beim Töten", "enableMentalGrowUpOnKill", "qtyOfMentalRecovered", "Mentalwert, den man beim Töten zurückbekommt (Schalter = aktiv)."],
      ],
    },
    mp_animal: {
      title: "Tier-Schaden",
      intro: "Je Tierart: Verletzungen durch Angriffe (Schalter + Chance in %), Mental- und Angst-Werte.",
      list: "AnimalDamageAll",
      name: "nameAnimal",
      nameLabel: "Tier-Klasse",
      suggest: () => classSuggest("CfgVehicles", /^AnimalBase$/i),
      cols: [
        ["Gehirnerschütterung", "enableBrainConcussionA", "brainChanceA", "Chance in %, dass ein Angriff eine Gehirnerschütterung auslöst."],
        ["Platzwunde", "enableLacerationA", "lacerationChanceA", "Chance in %, dass ein Angriff eine Platzwunde auslöst."],
        ["Bluterguss", "enableEmatomaA", "ematomaChanceA", "Chance in %, dass ein Angriff einen Bluterguss auslöst."],
        ["Armbruch", "enableBreakArmA", "breakArmChanceA", "Chance in %, dass ein Angriff den Arm bricht."],
        ["Beintreffer", null, "legHitChanceA", "Chance in %, dass das Bein getroffen wird."],
        ["Bein-Faktor", null, "legHitMuxA", "Faktor für den Beinschaden."],
        ["Mental bei Treffer", "enableMentalInsertHitA", "mentalQTYInsertedA", "Mentalwert-Änderung bei einem Treffer."],
        ["Angst-Bedrohung", null, "fearThreatQtyA", "Bedrohungswert dieses Tiers für das Angst-System."],
        ["Mental beim Töten", "enableMentalGrowUpOnKillA", "qtyOfMentalRecoveredA", "Mentalwert, den man beim Töten zurückbekommt."],
      ],
    },
    mp_blade: {
      title: "Klingen (Schnittwunden)",
      intro: "Je Klingenwaffe: Chance auf Platzwunde bei einem Schnitt und Infektionsrisiko beim Entfernen einer Kugel.",
      list: "BladeDamageAll",
      name: "nameBlade",
      nameLabel: "Waffen-Klasse",
      suggest: () => classSuggest("CfgWeapons").concat(classSuggest("CfgVehicles")),
      cols: [
        ["Platzwunde", "enableLacerationCalculation", "chanceOfLacerationWhenACutIsDealt", "Chance in %, dass ein Schnitt dieser Klinge zur Platzwunde wird (Schalter = Berechnung aktiv)."],
        ["Infektion beim Kugelentfernen", null, "chanceOfGettingWoundInfectionRemovingBullet", "Chance in %, dass beim Entfernen einer Kugel mit dieser Klinge die Wunde infiziert wird."],
      ],
    },
    mp_weapon: {
      title: "Munition (Steckenbleiben / Durchschuss)",
      intro: "Je Munitionstyp: ob eine Kugel im Körper stecken bleibt oder durchgeht (jeweils Schalter + Chance in %). Beide Chancen sollten zusammen 100 % ergeben.",
      list: "WeaponDamageAll",
      name: "nameAmmo",
      nameLabel: "Munitions-Klasse",
      suggest: () => classSuggest("CfgAmmo"),
      cols: [
        ["Kugel bleibt stecken", "enableGetStuckInbody", "getStuckChance", "Chance in %, dass die Kugel im Körper stecken bleibt (muss operativ entfernt werden)."],
        ["Durchschuss", "enableTrepassingBullet", "trepassingBulletChance", "Chance in %, dass die Kugel durch den Körper geht."],
      ],
      rowCheck: (r) => {
        const s = Number(r.getStuckChance) + Number(r.trepassingBulletChance);
        return Math.abs(s - 100) < 0.001 ? "" : "Summe " + fmt(s, 1) + " % ≠ 100 %";
      },
    },
    mp_liquid: {
      title: "Getränke / Flüssigkeiten",
      intro: "Je Getränk (Flüssigkeits-ID): Wirkung auf Mentalkrankheit, Schlaf und Alkohol.",
      list: "EdibleAll",
      name: "nameEdible",
      nameLabel: "Getränk",
      suggest: () => [],
      extra: [["Flüssigkeits-ID", "nameLiquid", "Interne Flüssigkeits-ID des Getränks (muss zur Flüssigkeit im Spiel passen).", true]],
      cols: [
        ["Mentalkrankheit", null, "MentalDisease", "Wirkung auf die Mentalkrankheit (positiv/negativ je nach Mod-Logik)."],
        ["Schlaf", null, "SleepValue", "Schlafwert-Änderung durch das Getränk."],
        ["Alkohol", null, "Alchol", "Alkoholgehalt der Flüssigkeit."],
      ],
    },
  };

  function renderTable(kind, box) {
    const spec = TABLES[kind];
    const item = fileItem(kind);
    box.appendChild(h("div", { class: "mp-sec-head" }, [h("h2", { text: spec.title }), h("div", { class: "muted", text: spec.intro })]));
    if (!item) {
      box.appendChild(h("div", { class: "empty-state", text: "Die Datei ist nicht geladen. Lade den MedPlus-Ordner im Projekt-Tab oder oben über „MedPlus-Ordner laden“." }));
      return;
    }
    const list = item.json[spec.list];
    const dl = h("datalist", { id: "mp-names-" + kind }, spec.suggest().map((s) => h("option", { value: s })));
    let q = "";
    let page = 1;
    const tbody = h("tbody");
    const live = h("div", { class: "help" });
    const commit = () => P().mutate(item.uid, () => {});
    const defaults = () => {
      const r = {};
      r[spec.name] = "";
      (spec.extra || []).forEach((e) => (r[e[1]] = 0));
      spec.cols.forEach(([, en, val]) => {
        if (en) r[en] = 0;
        r[val] = 0.0;
      });
      return r;
    };
    const cell = (r, en, val) => {
      const nodes = [];
      if (en) nodes.push(h("input", { type: "checkbox", title: "aktiv", checked: r[en] === 1, onchange: (e) => ((r[en] = e.target.checked ? 1 : 0), commit()) }));
      nodes.push(
        h("input", {
          type: "number",
          step: "any",
          value: r[val],
          oninput: (e) => {
            if (e.target.value === "" || !Number.isFinite(Number(e.target.value))) return;
            r[val] = Number(e.target.value);
            commit();
            updateLive();
          },
        })
      );
      return h("td", { class: "mp-cell" }, nodes);
    };
    const draw = () => {
      clear(tbody);
      const rows = list.map((r, i) => [r, i]).filter(([r]) => !q || String(r[spec.name]).toLowerCase().indexOf(q) > -1);
      rows.slice(0, page * 100).forEach(([r, i]) => {
        const tr = h("tr", {}, [
          h("td", {}, [h("input", { type: "text", value: r[spec.name], list: "mp-names-" + kind, oninput: (e) => ((r[spec.name] = e.target.value), commit()) })]),
        ]);
        (spec.extra || []).forEach(([, k]) => tr.appendChild(h("td", {}, [h("input", { type: "number", step: "1", value: r[k], oninput: (e) => ((r[k] = Number(e.target.value)), commit()) })])));
        spec.cols.forEach(([, en, val]) => tr.appendChild(cell(r, en, val)));
        if (spec.rowCheck) {
          const m = spec.rowCheck(r);
          tr.appendChild(h("td", { class: m ? "mp-bad" : "muted small", text: m || "✓" }));
        }
        tr.appendChild(
          h("td", { class: "actions" }, [
            h("button", { class: "btn icon small", type: "button", title: "Duplizieren", text: "⧉", onclick: () => (list.splice(i + 1, 0, JSON.parse(JSON.stringify(r))), commit(), draw(), updateLive()) }),
            h("button", { class: "btn icon small", type: "button", title: "Löschen", text: "✕", onclick: () => (list.splice(i, 1), commit(), draw(), updateLive()) }),
          ])
        );
        tbody.appendChild(tr);
      });
      if (rows.length > page * 100) tbody.appendChild(h("tr", {}, [h("td", { colspan: 20 }, [h("button", { class: "btn small", type: "button", text: "Mehr anzeigen (" + (rows.length - page * 100) + ")", onclick: () => (page++, draw()) })])]));
    };
    const updateLive = () => {
      let msg = list.length + " Einträge";
      if (spec.rowCheck) {
        const bad = list.filter((r) => spec.rowCheck(r)).length;
        msg += bad ? " · " + bad + " mit Summe ≠ 100 %" : " · alle Summen = 100 %";
      }
      live.textContent = msg;
      draw();
    };
    const head = h("tr", {}, [h("th", { text: spec.nameLabel })]);
    (spec.extra || []).forEach(([l, , tip]) => head.appendChild(h("th", {}, [l, tipNode(tip)])));
    spec.cols.forEach(([l, , , tip]) => head.appendChild(h("th", {}, [l, tipNode(tip)])));
    if (spec.rowCheck) head.appendChild(h("th", { text: "Prüfung" }));
    head.appendChild(h("th", { text: "" }));
    box.appendChild(
      h("div", { class: "section" }, [
        h("div", { class: "section-body" }, [
          h("div", { class: "toolbar" }, [
            h("input", { type: "text", placeholder: "Suchen …", oninput: (e) => ((q = e.target.value.toLowerCase()), (page = 1), draw()) }),
            h("button", { class: "btn small primary", type: "button", text: "Eintrag hinzufügen", onclick: () => (list.push(defaults()), commit(), updateLive()) }),
            live,
          ]),
          h("div", { class: "table-scroll" }, [h("table", { class: "ptable prod-table" }, [h("thead", {}, [head]), tbody])]),
          dl,
          h("div", { class: "help", text: "Pro Spalte: Häkchen = Funktion aktiv, Zahl = Chance in % bzw. Wert. Neue Einträge starten mit 0." }),
        ]),
      ])
    );
    updateLive();
  }

  function renderSoup(box) {
    const item = fileItem("mp_soup");
    box.appendChild(h("div", { class: "mp-sec-head" }, [h("h2", { text: "Suppen-Zutaten" }), h("div", { class: "muted", text: "Welche Items als Zutat einer Kategorie (Fleisch, Gemüse, Pilze, Fisch, Beeren) für die Suppen zählen." })]));
    if (!item) return box.appendChild(h("div", { class: "empty-state", text: "MedPlusEdibleSoupTrim.json ist nicht geladen." }));
    const names = { Meat: "Fleisch", Vegetables: "Gemüse", Mushroom: "Pilze", Fish: "Fisch", Berry: "Beeren" };
    const sug = classSuggest("CfgVehicles");
    Object.keys(item.json).forEach((k) => {
      if (!Array.isArray(item.json[k])) return;
      const f = h("div", { class: "field span2" }, [h("label", {}, [(names[k] || k) + " (" + item.json[k].length + ")", tipNode("Items der Kategorie „" + (names[k] || k) + "“, die in den MedPlus-Suppen als Zutat akzeptiert werden.")]), chipEditor(item, k, sug)]);
      box.appendChild(h("div", { class: "section" }, [h("div", { class: "section-body" }, [f])]));
    });
  }

  // ---------------------------------------------------------------- Navigation & Aufbau
  let root = null;
  let content = null;

  function setView(v) {
    st.view = v;
    render();
  }

  // ---------------------------------------------------------------- Tick-Zeiten zentral
  const EXTRA_TICKS = { MentalRecoverByTeddyBearTick: { sec: "Mental", deps: ["MentalTeddyBearInHandRecoverPerTick"] } };
  const tickState = { target: 1, scaleQty: true, scaleChance: true, off: {}, depOff: {}, newTick: {} };

  /** Alle Takt-Gruppen: Takt-Schlüssel je Abschnitt mit den davon abhängigen "pro Takt"-Werten. */
  function tickGroups(item) {
    const c = item.json;
    const out = [];
    cat().secs.forEach((s) => {
      const keys = s.keys.map((x) => x[0]);
      const tk = keys.find((k) => /TickTime$/i.test(k) && typeof c[k] === "number");
      const groups = [];
      if (tk) groups.push({ tickKey: tk, extra: [] });
      Object.keys(EXTRA_TICKS).forEach((k) => EXTRA_TICKS[k].sec === s.key && typeof c[k] === "number" && groups.push({ tickKey: k, extra: EXTRA_TICKS[k].deps }));
      groups.forEach((g) => {
        const deps = [];
        s.keys.forEach(([k, t]) => {
          if (k === g.tickKey || typeof c[k] !== "number" || c[k] === 0) return;
          const d = T().docOf(k);
          const nameHit = /PerTick/i.test(k) || (d && /per tick/i.test(d.comment) && !/per second/i.test(d.comment));
          const isExtra = g.extra.indexOf(k) > -1;
          if (!nameHit && !isExtra) return;
          if (g.tickKey !== tk && !isExtra) return;
          if (g.tickKey === tk && Object.keys(EXTRA_TICKS).some((x) => EXTRA_TICKS[x].deps.indexOf(k) > -1)) return;
          const chance = (d && d.unit === "%") || /Chance/i.test(k);
          let skip = "";
          if (d && /per second/i.test(d.comment)) skip = "laut Doku „pro Sekunde“ – nicht an den Takt gebunden";
          else if (t === "i") skip = "Ganzzahl – Umrechnung würde runden";
          deps.push({ k: k, chance: chance, skip: skip, isInt: t === "i" });
        });
        out.push({ sec: s.key, tickKey: g.tickKey, deps: deps, isInt: (cat().byKey[g.tickKey] || {}).t === "i" });
      });
    });
    return out;
  }

  function convert(dep, oldV, r) {
    if (dep.chance) {
      const p = Math.min(1, Math.max(0, oldV / 100));
      return Math.round(100 * (1 - Math.pow(1 - p, r)) * 10000) / 10000;
    }
    return Math.round(oldV * r * 10000) / 10000;
  }

  function renderTicks(item, box) {
    const c = item.json;
    const groups = tickGroups(item);
    box.appendChild(
      h("div", { class: "mp-sec-head" }, [
        h("h2", { text: "Tick-Zeiten (alle)" }),
        h("div", { class: "muted", text: "Jede Verletzung/Wirkung rechnet in einem eigenen Takt (…TickTime, in Sekunden). Mit gleichem Takt überall (z. B. 1 Sekunde) wird „pro Takt“ zu „pro Sekunde“ – das macht das Einstellen viel einfacher." }),
      ])
    );
    const info = h("div", { class: "mp-calc" }, [
      h("div", { class: "check-head", text: "So wird umgerechnet" }),
      h("div", { class: "small", text: "Damit sich das Verhalten im Spiel nicht ändert, werden die „pro Takt“-Werte mitgerechnet: Mengen (Blutverlust, Heilung …) × (neuer Takt ÷ alter Takt); Chancen in % so, dass die Wahrscheinlichkeit pro Sekunde gleich bleibt (1 − (1 − p)^Faktor). Dauer- und Zeitwerte in Sekunden bleiben unverändert. Du siehst jeden Wert vorher und kannst einzelne Gruppen oder Werte abwählen." }),
    ]);
    box.appendChild(info);

    const targetIn = h("input", { type: "number", step: "any", min: "0.1", value: tickState.target, style: "max-width:110px" });
    const scaleQty = h("label", { class: "checkrow" }, [h("input", { type: "checkbox", checked: tickState.scaleQty, onchange: (e) => ((tickState.scaleQty = e.target.checked), draw()) }), "Mengen pro Takt mitrechnen"]);
    const scaleCh = h("label", { class: "checkrow" }, [h("input", { type: "checkbox", checked: tickState.scaleChance, onchange: (e) => ((tickState.scaleChance = e.target.checked), draw()) }), "Chancen (%) pro Takt mitrechnen"]);
    const tbody = h("tbody");
    const sumNote = h("div", { class: "help" });

    const plan = () => {
      const res = [];
      groups.forEach((g) => {
        const key = g.sec + "/" + g.tickKey;
        const oldT = c[g.tickKey];
        const newT = g.isInt ? Math.round(tickState.newTick[key] !== undefined ? tickState.newTick[key] : tickState.target) : tickState.newTick[key] !== undefined ? tickState.newTick[key] : tickState.target;
        const on = !tickState.off[key] && Number.isFinite(newT) && newT > 0 && newT !== oldT;
        const r = newT / oldT;
        const deps = g.deps.map((d) => {
          const dk = key + "/" + d.k;
          const wanted = (d.chance ? tickState.scaleChance : tickState.scaleQty) && !d.skip && !tickState.depOff[dk];
          return { d: d, dk: dk, oldV: c[d.k], newV: on && Number.isFinite(r) ? convert(d, c[d.k], r) : c[d.k], wanted: wanted };
        });
        res.push({ g: g, key: key, oldT: oldT, newT: newT, on: on, deps: deps });
      });
      return res;
    };

    const draw = () => {
      clear(tbody);
      const rows = plan();
      let tickN = 0;
      let depN = 0;
      rows.forEach((p) => {
        if (p.on) {
          tickN++;
          depN += p.deps.filter((x) => x.wanted).length;
        }
        const tIn = h("input", {
          type: "number",
          step: "any",
          min: "0.1",
          value: p.newT,
          style: "max-width:90px",
          oninput: (e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v > 0) tickState.newTick[p.key] = v;
            else delete tickState.newTick[p.key];
            draw();
          },
        });
        tbody.appendChild(
          h("tr", { class: p.on ? "" : "muted" }, [
            h("td", {}, [h("input", { type: "checkbox", checked: !tickState.off[p.key], onchange: (e) => ((tickState.off[p.key] = !e.target.checked), draw()) })]),
            h("td", { text: T().titleOf(p.g.sec) }),
            h("td", { class: "mono small", text: p.g.tickKey }),
            h("td", { class: "mono", text: fmt(p.oldT) + " s" }),
            h("td", {}, [tIn]),
            h("td", { class: "small", text: p.g.deps.length ? p.deps.filter((x) => x.wanted).length + " von " + p.g.deps.length + " Werten" : "keine Pro-Takt-Werte" }),
          ])
        );
        if (p.on && p.deps.length) {
          const det = h("details", { class: "mp-det" }, [h("summary", { class: "small muted", text: "Werte anzeigen (" + p.deps.length + ")" })]);
          const t = h("table", { class: "ptable" }, [h("tbody", {}, p.deps.map((x) => h("tr", { class: x.d.skip ? "muted" : "" }, [
            h("td", {}, [h("input", { type: "checkbox", disabled: !!x.d.skip, checked: x.wanted, onchange: (e) => ((tickState.depOff[x.dk] = !e.target.checked), draw()) })]),
            h("td", { class: "mono small", text: x.d.k }),
            h("td", { class: "mono small", text: fmt(x.oldV, 4) + (x.d.chance ? " %" : "") }),
            h("td", { class: "small", text: "→" }),
            h("td", { class: "mono small", style: "color:var(--accent)", text: x.wanted ? fmt(x.newV, 4) + (x.d.chance ? " %" : "") : "unverändert" }),
            h("td", { class: "small muted", text: x.d.skip || (x.d.chance ? "Chance" : "Menge") }),
          ]))) ]);
          det.appendChild(t);
          tbody.appendChild(h("tr", {}, [h("td", {}), h("td", { colspan: 5 }, [det])]));
        }
      });
      sumNote.textContent = tickN + " Takt(e) werden geändert, " + depN + " Pro-Takt-Werte werden umgerechnet.";
      applyBtn.disabled = !tickN;
    };

    const applyBtn = h("button", {
      class: "btn primary",
      type: "button",
      text: "Anwenden",
      onclick: () => {
        const rows = plan().filter((p) => p.on);
        let ticks = 0;
        let vals = 0;
        P().mutate(item.uid, (j) => {
          rows.forEach((p) => {
            j[p.g.tickKey] = p.newT;
            ticks++;
            p.deps.forEach((x) => {
              if (!x.wanted) return;
              j[x.d.k] = x.newV;
              vals++;
            });
          });
        });
        EQE.toast(ticks + " Takt-Zeiten und " + vals + " Werte angepasst. Prüfe das Ergebnis in den Abschnitten (↺ setzt auf den geladenen Wert zurück).");
        tickState.newTick = {};
        render();
      },
    });

    box.appendChild(
      h("div", { class: "section" }, [
        h("div", { class: "section-body" }, [
          h("div", { class: "toolbar" }, [
            h("div", { class: "field" }, [h("label", { text: "Ziel-Takt für alle (Sekunden)" }), targetIn]),
            h("button", { class: "btn small", type: "button", text: "Auf alle übernehmen", onclick: () => ((tickState.target = Number(targetIn.value) || 1), (tickState.newTick = {}), draw()) }),
            scaleQty,
            scaleCh,
          ]),
          h("div", { class: "table-scroll" }, [h("table", { class: "ptable prod-table" }, [h("thead", {}, [h("tr", {}, ["", "Abschnitt", "Takt-Wert", "Aktuell", "Neu (s)", "Betroffen"].map((t) => h("th", { text: t })))]), tbody])]),
          sumNote,
          h("div", { class: "toolbar" }, [applyBtn]),
        ]),
      ])
    );
    draw();
  }

  // ---------------------------------------------------------------- Medikamente: Übersicht
  function renderMedsOverview(item, box) {
    const c = item.json;
    box.appendChild(
      h("div", { class: "mp-sec-head" }, [
        h("h2", { text: "Medikamente (Übersicht)" }),
        h("div", { class: "muted", text: "Alle Medikamente, Injektoren und Suppen mit ihrer Wirkung je Dosis, ihrem Überdosis-Beitrag und den Dosen bis zur Überdosis – an einem Ort. Klick auf den Namen springt in den Abschnitt." }),
      ])
    );
    const odAll = odData(c, "");
    const odByKey = {};
    odAll.meds.forEach((x) => (odByKey[x.k] = x));
    const go = (sec) => h("a", { href: "#", text: T().titleOf(sec), onclick: (e) => (e.preventDefault(), setView({ type: "sec", key: sec })) });
    const rows = MEDS.map((m) => {
      const d = medDose(c, m);
      const eff = d.per.map((e) => e.label + " " + fmt(e.total, 1)).concat((m.mods || []).map(([k, l]) => l + " " + fmt(num(c, k)))).join(" · ");
      const o = m.od ? odByKey[m.od] : null;
      const nMalus = o ? dosesTo(odAll.T1, o.dose, odAll.die, 0) : null;
      return h("tr", {}, [
        h("td", {}, [go(m.sec)]),
        h("td", { class: "mono small", text: fmtTime(d.last) + (d.delay ? " (+" + fmtTime(d.delay) + ")" : "") }),
        h("td", { class: "small", text: eff || "–" }),
        h("td", { class: "mono small", text: o ? fmt(o.dose, 1) : "–" }),
        h("td", { class: "mono small", text: nMalus ? nMalus + (nMalus === 1 ? " Dosis" : " Dosen") : "–" }),
      ]);
    });
    SOUPS.forEach((sk) => {
      if (typeof c[sk + "TickTime"] !== "number") return;
      const d = soupDose(c, sk);
      const eff = [["Leben", d.hp], ["Blut", d.bp], ["Mental", d.mental], ["Schlaf", d.sleep], ["Strahlung", d.rad]].filter((x) => x[1]).map((x) => x[0] + " " + fmt(x[1], 1)).join(" · ");
      rows.push(
        h("tr", {}, [h("td", {}, [go(sk)]), h("td", { class: "mono small", text: fmtTime(d.last) }), h("td", { class: "small", text: eff || "–" }), h("td", { class: "mono small", text: "–" }), h("td", { class: "mono small", text: "–" })])
      );
    });
    const head = h("tr", {}, ["Medikament / Speise", "Wirkdauer", "Wirkung je Dosis (gesamt)", "Überdosis-Wirkstoff", "Dosen bis Malus"].map((t) => h("th", { text: t })));
    box.appendChild(
      h("div", { class: "section" }, [
        h("div", { class: "section-body" }, [
          h("div", { class: "table-scroll" }, [h("table", { class: "ptable prod-table" }, [h("thead", {}, [head]), h("tbody", {}, rows)])]),
          h("div", { class: "help", text: "Malus-Schwelle: " + fmt(odAll.T1, 0) + " · Erbrechen: " + fmt(odAll.T2, 0) + " · Abbau " + fmt(odAll.die * 60, 1) + " pro Minute. Medikamente ohne eigene Wirkdauer in der Config (Schmerzmittel, Tetracyclin, Morphin, Epinephrin, Kohle) rechnen unter „Überdosis“ mit der dort einstellbaren Annahme. HP/BP/MH-Injektoren: Takt nicht in der Config, 1 s angenommen." }),
        ]),
      ])
    );
  }

  function fileList() {
    return [
      ["mp_zombie", "Zombie-Schaden"],
      ["mp_animal", "Tier-Schaden"],
      ["mp_blade", "Klingen"],
      ["mp_weapon", "Munition"],
      ["mp_liquid", "Getränke"],
      ["mp_soup", "Suppen-Zutaten"],
    ];
  }

  function searchView(item, box) {
    const q = st.search.toLowerCase();
    box.appendChild(h("div", { class: "mp-sec-head" }, [h("h2", { text: "Suche: „" + st.search + "“" })]));
    const grid = h("div", { class: "grid2" });
    let n = 0;
    cat().secs.forEach((s) => {
      s.keys.forEach(([k, t]) => {
        if (n >= 60 || PAIR_SECOND.has(k)) return;
        const info = T().info(s.key, k);
        if ((k + " " + info.label + " " + info.help + " " + T().titleOf(s.key)).toLowerCase().indexOf(q) < 0) return;
        n++;
        const f = fieldRow(item, s.key, k, t);
        f.insertBefore(h("div", { class: "muted small", text: T().titleOf(s.key) }), f.firstChild);
        grid.appendChild(f);
      });
    });
    box.appendChild(n ? h("div", { class: "section" }, [h("div", { class: "section-body" }, [grid])]) : h("div", { class: "list-empty", text: "Nichts gefunden." }));
  }

  function render() {
    if (!root) return;
    clear(root);
    const item = mainItem();
    const tablesLoaded = TABLE_KINDS.some((k) => fileItem(k));
    const bar = h("div", { class: "toolbar" }, [
      h("button", { class: "btn primary", type: "button", text: "MedPlus-Ordner laden…", onclick: () => P().pick(true) }),
      mainItems().length > 1
        ? h("select", { class: "item-select", onchange: (e) => ((st.main = e.target.value), render()) }, mainItems().map((i) => h("option", { value: i.uid, text: (i.fileId || "?") + ".json", selected: i.uid === st.main })))
        : item
        ? h("span", { class: "status mono", text: (item.fileId || "") + ".json" + (item.dirty ? " · geändert" : "") })
        : null,
      h("span", { class: "spacer" }),
      item
        ? h("input", {
            type: "text",
            placeholder: "Wert suchen (z. B. Erbrechen, Blut, Takt) …",
            value: st.search,
            style: "max-width:320px",
            oninput: (e) => {
              st.search = e.target.value;
              if (st.search.length >= 2) st.view = { type: "search" };
              else if (st.view.type === "search") st.view = { type: "sec", key: "BrainConcussion" };
              renderContent();
            },
          })
        : null,
    ]);
    root.appendChild(bar);
    if (!item && !tablesLoaded) {
      root.appendChild(
        h("div", { class: "empty-state" }, [
          h("div", { class: "drop-title", text: "MedPlus-Editor" }),
          h("p", { text: "Lade deinen MedPlus-Ordner (MedPlusTrim.json, ZombieDamageTrim.json, …) – über den Knopf oben oder im Projekt-Tab. Änderungen werden wie bei Dialogen und Tradern direkt in die JSON-Dateien zurückgeschrieben („Änderungen speichern“ oben rechts)." }),
        ])
      );
      return;
    }
    const layout = h("div", { class: "ov2 mp" });
    const nav = h("div", { class: "mp-nav" });
    T().GROUPS.forEach((g) => {
      nav.appendChild(h("div", { class: "nav-title", text: g.title }));
      g.secs.forEach((sk) => {
        if (!cat().bySec[sk]) return;
        nav.appendChild(h("button", { class: "mp-navbtn" + (st.view.type === "sec" && st.view.key === sk ? " active" : ""), type: "button", text: T().titleOf(sk), onclick: () => ((st.search = ""), setView({ type: "sec", key: sk })) }));
      });
    });
    nav.appendChild(h("div", { class: "nav-title", text: "Werkzeuge" }));
    nav.appendChild(h("button", { class: "mp-navbtn" + (st.view.type === "ticks" ? " active" : ""), type: "button", text: "Tick-Zeiten (alle)", onclick: () => ((st.search = ""), setView({ type: "ticks" })) }));
    nav.appendChild(h("button", { class: "mp-navbtn" + (st.view.type === "meds" ? " active" : ""), type: "button", text: "Medikamente (Übersicht)", onclick: () => ((st.search = ""), setView({ type: "meds" })) }));
    nav.appendChild(h("div", { class: "nav-title", text: "Tabellen" }));
    fileList().forEach(([k, l]) => {
      nav.appendChild(h("button", { class: "mp-navbtn" + (st.view.type === "file" && st.view.key === k ? " active" : ""), type: "button", text: l + (fileItem(k) ? "" : " (nicht geladen)"), onclick: () => ((st.search = ""), setView({ type: "file", key: k })) }));
    });
    layout.appendChild(nav);
    content = h("div", { class: "mp-content" });
    layout.appendChild(content);
    root.appendChild(layout);
    renderContent();
  }
  const TABLE_KINDS = ["mp_zombie", "mp_animal", "mp_blade", "mp_weapon", "mp_liquid", "mp_soup"];

  function renderContent() {
    if (!content) return;
    clear(content);
    const item = mainItem();
    content.appendChild(
      h("div", { class: "issue ok mp-note", text: "Die „?“-Erklärungen sind aus den Wertenamen abgeleitet (der Mod-Code ist nicht einsehbar). Wo die Bedeutung nicht eindeutig ist, steht „vermutlich“. Die Live-Berechnungen gehen davon aus, dass ein Takt in Sekunden angegeben ist." })
    );
    if (st.view.type === "file") {
      if (st.view.key === "mp_soup") renderSoup(content);
      else renderTable(st.view.key, content);
      return;
    }
    if (!item) {
      content.appendChild(h("div", { class: "empty-state", text: "MedPlusTrim.json ist nicht geladen." }));
      return;
    }
    if (st.view.type === "search") return searchView(item, content);
    if (st.view.type === "ticks") return renderTicks(item, content);
    if (st.view.type === "meds") return renderMedsOverview(item, content);
    renderSection(item, st.view.key, content);
  }

  function init(panel) {
    root = panel;
    P().registerSerializer(P().MP_KINDS, stringify);
    render();
    return { refresh: render };
  }

  EQE.MedPlus = {
    init: init,
    stringify: stringify,
    openItem: (uid) => {
      const it = P().get(uid);
      if (!it) return;
      if (it.kind === "medplus") st.main = uid;
      else if (TABLES[it.kind] || it.kind === "mp_soup") st.view = { type: "file", key: it.kind };
      render();
    },
  };
})(window.EQE);
