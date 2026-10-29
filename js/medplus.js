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

  function isBoolKey(item, key) {
    const v = item.json[key];
    if (v !== 0 && v !== 1) return false;
    return /(enable|enabel|norun|dropitem|canclimb|carried|forcewakeup|disable|limp|halve|or_hp|based|cure$|^bulletinfluence$|available|^regenhealth)/i.test(key) && !/(Chance|Time|Tick)/i.test(key);
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
      out.push(row("Ohne Item", fmt(num(c, "StoppingCutChanceToGetInfectOnCloseNoItem") * 100, 1) + " %", "falls der Wert ein Faktor 0–1 ist (0,4 = 40 %)"));
      out.push(row("Mit schmutzigem Item", fmt(num(c, "StoppingCutChanceToGetInfectOnCloseDirtyItem") * 100, 1) + " %", "falls der Wert ein Faktor 0–1 ist"));
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
      const a = c.clothProtectionHematoma || [];
      const p = c.percentageProtectionHematoma || [];
      if (a.length !== p.length) out.push(warn("Kleidungs-Liste (" + a.length + ") und Schutz-Liste (" + p.length + ") sind nicht gleich lang."));
    },
    HeartAttack(c, out) {
      const tt = num(c, "HATickTime");
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
      out.push(row("Vom Maximum bis nüchtern", fmtTime((num(c, "DrunkenessAgentMAXCOUNT") - num(c, "DrunkAgentThresholdDeActivation")) / die * tt), fmt(die) + " je Takt à " + fmt(tt) + " s"));
      out.push(row("Von „Ohnmacht“ bis nüchtern", fmtTime((num(c, "DrunkAgentThresholdFaint") - num(c, "DrunkAgentThresholdDeActivation")) / die * tt), ""));
      const g = ["DrunkAgentThresholdDeActivation", "DrunkAgentThresholdActivation", "DrunkAgentThresholdVomit", "DrunkAgentThresholdFaint", "DrunkenessAgentMAXCOUNT"].map((k) => num(c, k));
      if (g.some((v, i) => i && v < g[i - 1])) out.push(warn("Die Schwellen sollten aufsteigen: Nüchtern < Betrunken < Erbrechen < Ohnmacht < Maximum."));
    },
    Overdose(c, out) {
      const tt = num(c, "OverdoseTickTime");
      const die = num(c, "OverdoseAgentDieOffSpeed");
      out.push(head("Abbau"));
      out.push(row("Vom Maximum bis 0", fmtTime(num(c, "OverdoseAgentMAXCOUNT") / die * tt), fmt(die) + " je Takt à " + fmt(tt) + " s"));
      out.push(row("Von „Malus“ bis 0", fmtTime(num(c, "OverdoseAgentThresholdMalusActivation") / die * tt), ""));
      const minute = 60 / tt;
      out.push(head("Folgen pro Minute (ab Malus-Schwelle)"));
      [["OverdoseHealthLossPerTick", "Lebensverlust"], ["OverdoseShockLossPerTick", "Schock"], ["OverdoseStaminaLossPerTick", "Ausdauerverlust"]].forEach(([k, l]) => out.push(row(l, fmt(num(c, k) * minute, 1) + " / min", fmt(num(c, k)) + " je Takt")));
      out.push(head("Wie schnell die Medikamente die Überdosis aufbauen (je Minute)"));
      Object.keys(c)
        .filter((k) => /^Overdose\w+PerTick$/.test(k) && !/(Health|Shock|Stamina|Charcoal)/.test(k))
        .forEach((k) => out.push(row(k.replace(/^Overdose|PerTick$/g, ""), fmt(c[k] * minute, 1) + " / min", "")));
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
      out.push(head("Schlafaufbau pro Stunde (relativ)"));
      const base = num(c, "SleepGainDefaultPerTick");
      out.push(row("Standard", fmt(base * hour, 0), ""));
      [["SleepGainIfIsWarm", "Wärme"], ["SleepGainIfIsCover", "Deckung"], ["SleepGainIfIsNight", "Nacht"], ["SleepGainIfIsTeddy", "Teddy"], ["SleepGainIfIsSleepBag", "Schlafsack"]].forEach(([k, l]) => {
        const v = num(c, k);
        out.push(row("+ " + l, "+" + fmt(v * hour, 0), "Zuschlag " + fmt(v) + " je Takt"));
      });
      const all = base + ["SleepGainIfIsWarm", "SleepGainIfIsCover", "SleepGainIfIsNight", "SleepGainIfIsTeddy", "SleepGainIfIsSleepBag"].reduce((s, k) => s + num(c, k), 0);
      out.push(row("Alles zusammen", fmt(all * hour, 0), (fmt(all / base, 1)) + "× Standard (falls sich die Zuschläge addieren)"));
      out.push(head("Dauer"));
      out.push(row("Schlafzyklus", fmtTime(num(c, "SleepDuration")), fmt(num(c, "SleepDuration") / 3600, 1) + " Stunden"));
    },
    Igiene(c, out) {
      out.push(head("Dauer"));
      out.push(row("Sauberkeit hält", fmtTime(num(c, "IgieneDuration")), fmt(num(c, "IgieneDuration") / 3600, 1) + " Stunden"));
      out.push(row("Hot-Water ab", fmt(num(c, "IgieneMinTempToBeConsideredHotWater"), 0) + " °C", "Verbrühung ab " + fmt(num(c, "IgieneMinHotTempToMakeDamage"), 0) + " °C"));
      out.push(row("Geruchs-Reichweite", fmt(num(c, "IgieneSniffRange"), 0) + " m", ""));
    },
    Mental(c, out) {
      const tt = num(c, "MentalTickTime");
      out.push(head("Mentalwert"));
      out.push(row("Verlust pro Stunde", fmt(num(c, "MentalStatLossPerTick") * 3600 / tt, 0), fmt(num(c, "MentalStatLossPerTick")) + " alle " + fmt(tt) + " s"));
      const kp = num(c, "MentalInsertByKillingPlayer");
      const kz = num(c, "MentalInsertByKillingZombie");
      out.push(row("Spieler töten ≙ Zombies töten", fmt(kp / kz, 1) + " Zombies", fmt(kp, 0) + " ÷ " + fmt(kz, 0)));
      const ka = num(c, "MentalInsertByKillingAnimal");
      out.push(row("Tier töten ≙ Zombies töten", fmt(ka / kz, 1) + " Zombies", ""));
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
      if (CALC[secKey] && /Soup|Stew|Herbal|Chowder|Potage|Ibuprofene|Ematogel|Vikasol|Diazepam|AntiRad|Naxalone|EnergyDrink|Recover/.test(secKey)) perTickRows(out, c, sec);
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
    box.appendChild(calcHost);
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
