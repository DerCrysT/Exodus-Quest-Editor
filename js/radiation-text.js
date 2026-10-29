/**
 * Exodus Quest Editor – Radiation-Mod: deutsche Titel, Abschnittsbeschreibungen und Wert-Erklärungen.
 * Basis ist die Mod-Dokumentation („Radiation Mod explanation.txt“, wird zitiert); der Mod-Code ist nicht einsehbar,
 * deshalb steht bei Ableitungen „vermutlich“.
 */
window.EQE = window.EQE || {};

(function (EQE) {
  "use strict";

  const GROUPS = [
    { title: "Strahlenkrankheit & Schutz", file: "general", secs: ["agent", "disease", "zone", "cure", "waste"] },
    { title: "Bombardement", file: "bombing", secs: ["bgeneral", "kill", "event", "panel", "min", "mid", "max"] },
  ];

  const SECTIONS = {
    _general: ["Allgemein", "Version und Admin-Steam-IDs."],
    agent: ["Strahlung im Körper (Abbau)", "Die Strahlung im Körper kann sich von selbst abbauen – oder bleibt, bis man sie mit Medikamenten entfernt."],
    disease: ["Strahlenkrankheit (Stufen)", "Ab welchem Strahlungswert welche Stufe beginnt und was dann passiert: Husten (Blutverlust), Erbrechen, Blutungen, Lebensverlust, im kritischen Bereich Tod."],
    zone: ["Strahlungszonen & Schutz", "Takt der Zonen, Verbrauch der Filter, Schutz durch Gebäude, Kleidungsschaden, Effekte (Bild, Partikel, Geigerzähler) und Wirkung von beschädigter Ausrüstung."],
    cure: ["Heilung & Schutz-Items", "Anti-Rad-Mittel, Wodka/Kwas, Schutz-Pillen, Injektion – und die Überdosis-Werte bei geladenem MedPlus."],
    waste: ["Radioaktiver Abfall", "Abfall im Inventar strahlt; Schutzbehälter, Takt und Strahlung pro Takt."],
    bgeneral: ["Bombardement: Allgemein", "Ob und wann das Bombardement der ganzen Karte stattfindet und wie lange es dauert."],
    kill: ["Bombardement: Töten & Schock", "Was im tödlichen Radius zerstört wird und wer im Schockradius bewusstlos wird."],
    event: ["Bombardement: Ablauf & Warnung", "Vorlauf, Ansage, Strahlung während des Ereignisses, Aufräumen und sichere Zonen."],
    panel: ["Bomben vom Panel (Allgemein)", "Wartezeit nach dem Knopfdruck und ob Intensität, Höhe und Radius der Panel-Bomben zufällig sind."],
    min: ["Panel-Bombe: klein (MIN)", "Radius, Höhe, Strahlung, tödlicher Radius und Schock der kleinen Bombe."],
    mid: ["Panel-Bombe: mittel (MID)", "Radius, Höhe, Strahlung, tödlicher Radius und Schock der mittleren Bombe."],
    max: ["Panel-Bombe: groß (MAX)", "Radius, Höhe, Strahlung, tödlicher Radius und Schock der großen Bombe."],
  };

  const H = {
    Rad_ConfigVersion: ["Config-Version", "Versionsstempel der Config. Wird vom Mod gesetzt – normalerweise nicht ändern."],
    GeneralBombing_ConfigVersion: ["Config-Version", "Versionsstempel der Bombing-Config. Wird vom Mod gesetzt – normalerweise nicht ändern."],
    aIDs: ["Admin-IDs", "Steam-64-IDs der Admins (z. B. für das Bomben-Panel und Admin-Funktionen)."],
    enableDieOff: ["Natürlicher Abbau an/aus", "1 = die Strahlung im Körper baut sich mit der Zeit von selbst ab; 0 = sie bleibt, bis man sie mit Anti-Rad, Wodka usw. entfernt."],
    radAgentDieOffSpeedPerSEC: ["Abbau je Sekunde", "Strahlungswert, der pro Sekunde abgebaut wird, wenn der natürliche Abbau an ist."],
    stage1Threshold: ["Stufe 1 ab", "Strahlungswert, ab dem die erste Stufe der Strahlenkrankheit beginnt (Husten)."],
    stage2Threshold: ["Stufe 2 ab", "Strahlungswert für Stufe 2 (Erbrechen)."],
    stage3Threshold: ["Stufe 3 ab", "Strahlungswert für Stufe 3 (Blutungen)."],
    stage4Threshold: ["Stufe 4 ab", "Strahlungswert für Stufe 4 (Lebensverlust)."],
    stageCritical: ["Kritische Stufe ab", "Strahlungswert, ab dem die kritische Stufe beginnt (Todesgefahr)."],
    stage1MinThreshold: ["Stufe 1: min. Abstand (s)", "Mindestzeit in Sekunden bis zum nächsten Ereignis dieser Stufe."],
    stage1MaxThreshold: ["Stufe 1: max. Abstand (s)", "Höchstzeit in Sekunden bis zum nächsten Ereignis dieser Stufe."],
    bloodLossCoughStage1: ["Husten: Blutverlust", "Blut, das pro Husten verloren geht."],
    coughChancePerTickStage1: ["Husten: Chance je Takt (%)", "Chance in Prozent pro Takt, dass der Spieler hustet und Blut verliert."],
    stage2MinThreshold: ["Stufe 2: min. Abstand (s)", "Mindestzeit in Sekunden bis zum nächsten Ereignis dieser Stufe."],
    stage2MaxThreshold: ["Stufe 2: max. Abstand (s)", "Höchstzeit in Sekunden bis zum nächsten Ereignis dieser Stufe."],
    bloodLossVomitStage2: ["Erbrechen: Blutverlust", "Blut, das pro Erbrechen verloren geht."],
    vomitChancePerTickStage2: ["Erbrechen: Chance je Takt (%)", "Chance in Prozent pro Takt auf Erbrechen mit Blutverlust."],
    stage3MinThreshold: ["Stufe 3: min. Abstand (s)", "Mindestzeit in Sekunden bis zum nächsten Ereignis dieser Stufe."],
    stage3MaxThreshold: ["Stufe 3: max. Abstand (s)", "Höchstzeit in Sekunden bis zum nächsten Ereignis dieser Stufe."],
    bleedCutChancePerTickStage3: ["Blutung: Chance je Takt (%)", "Chance in Prozent pro Takt, dass der Spieler zu bluten beginnt (Schnitt)."],
    stage4MinThreshold: ["Stufe 4: min. Abstand (s)", "Mindestzeit in Sekunden bis zum nächsten Ereignis dieser Stufe."],
    stage4MaxThreshold: ["Stufe 4: max. Abstand (s)", "Höchstzeit in Sekunden bis zum nächsten Ereignis dieser Stufe."],
    hpLossQtyPerTick: ["Lebensverlust je Treffer", "Leben, das pro Lebensverlust-Ereignis abgezogen wird (Stufe 4)."],
    hpLossChancePerTickStage4: ["Lebensverlust: Chance je Takt (%)", "Chance in Prozent pro Takt, dass in Stufe 4 Leben verloren geht."],
    enableStageCriticalDeath: ["Tod im kritischen Bereich", "1 = im kritischen Bereich kann man direkt sterben."],
    deathCriticalStagePerTick: ["Tod: Chance je Takt (%)", "Chance in Prozent pro Takt zu sterben, wenn der kritische Wert erreicht ist."],
    radPainSoundChanceLow: ["Schmerzgeräusch Stufe 1–2 (%)", "Chance pro Takt auf ein leichtes Schmerzgeräusch in Stufe 1 oder 2."],
    radPainSoundChanceHigh: ["Schmerzgeräusch Stufe 3–4 (%)", "Chance pro Takt auf ein Schmerzgeräusch in Stufe 3 oder 4."],
    radiationMDFRTickTime: ["Takt Strahlenkrankheit (s)", "Sekunden pro Berechnungstakt der Strahlenkrankheit. Alle „…PerTick“-Werte der Krankheit gelten pro Takt."],
    radiationTriggerTickTime: ["Takt Strahlungszone (s)", "Sekunden pro Takt in der Strahlungszone (Doku: möglichst bei 1 lassen)."],
    qtyConsumedByFiltersInRad: ["Filter-Verbrauch je Takt", "Menge, die ein Filter pro Takt in einer Strahlungszone verbraucht."],
    enableInsideBuildingProtection: ["Schutz in Gebäuden", "1 = in Gebäuden ist man vor Strahlung geschützt."],
    damageClothes: ["Kleidungsschaden", "0 = kein Schaden, 1 = Schaden an nicht schützender Kleidung, 2 = Schaden an jeder Kleidung."],
    percentageDMGClothes: ["Kleidungsschaden (%)", "Anteil der äußeren Strahlung, der als Schaden an der Kleidung ankommt."],
    enableVFX: ["Bildeffekt an/aus", "1 = Strahlungs-Bildeffekt wird angezeigt."],
    enableVFXProtected: ["Bildeffekt nur ohne Vollschutz", "1 = Bildeffekt wird nicht gezeigt, wenn man voll geschützt ist; 0 = immer."],
    enableParticlesRadZones: ["Nebel-Partikel", "1 = Nebel/Partikel in Strahlungs- und Bombenzonen."],
    switchGeigerCounterSound: ["Dynamischer Geigerzähler", "1 = der Ton richtet sich nach der Strahlung der aktuellen Zone (höchste Frequenz = höchste Strahlung dort); 0 = fest bis 9999 mSv."],
    geigerCounterPercentageVariance: ["Geigerzähler-Schwankung (%)", "Erlaubte Schwankung der Geigerzähler-Frequenz in Prozent."],
    wornProtection: ["Schutz abgenutzt (%)", "Wie viel Schutz ein abgenutztes Teil noch hat (in %)."],
    damagedProtection: ["Schutz beschädigt (%)", "Wie viel Schutz ein beschädigtes Teil noch hat (in %)."],
    badlyDamagedProtection: ["Schutz stark beschädigt (%)", "Wie viel Schutz ein stark beschädigtes Teil noch hat (in %)."],
    GasMaskOnly: ["Nur Gasmaske schützt", "1 = nur die Gasmaske zählt als Schutz."],
    AntiRadiationQTYPerTick: ["Anti-Rad: Abbau je Takt", "Strahlung, die das Anti-Rad-Mittel pro Takt entfernt."],
    AntiRadiationLastingTime: ["Anti-Rad: Dauer (s)", "Wie lange das Anti-Rad-Mittel wirkt."],
    AntiRadiationTickTime: ["Anti-Rad: Takt (s)", "Takt des Anti-Rad-Mittels in Sekunden."],
    VodkaRadCurePerCircle: ["Wodka: Abbau je Schluck", "Strahlung, die ein Schluck Wodka entfernt."],
    KvassRadCurePerCircle: ["Kwas: Abbau je Schluck", "Strahlung, die ein Schluck Kwas entfernt."],
    ShieldRadiationProtection: ["Schild: Schutz (%)", "Anteil der Strahlung, den Abschirmung/Pillen blocken."],
    ShieldRadiationLastingTime: ["Schild: Dauer (s)", "Wie lange die Abschirmung wirkt."],
    recoverRADonInject: ["Injektion: Strahlung zurück", "Strahlung, die bei der Injektion „zurückkommt“ (vermutlich Rückstoß der Spritze)."],
    NYRad_AntiRadOverdosePerTick: ["MedPlus: Anti-Rad-Überdosis je Takt", "Überdosis-Wirkstoff pro Takt durch Anti-Rad (nur mit geladenem MedPlus)."],
    NYRad_ShieldRadOverdosePerTick: ["MedPlus: Schild-Überdosis je Takt", "Überdosis-Wirkstoff pro Takt durch Schutzpillen (nur mit geladenem MedPlus)."],
    GatherableWaste: ["Abfall einsammelbar", "1 = radioaktiver Abfall kann eingesammelt oder automatisch entfernt werden."],
    containerProtectors: ["Schutzbehälter", "Items, die vor der Strahlung des Abfalls schützen."],
    WasteTickTime: ["Abfall-Takt (ms)", "Takt der Abfall-Strahlung in MILLISEKUNDEN (1000 = 1 Sekunde)."],
    RadInsertByWastePerTick: ["Strahlung durch Abfall je Takt", "Strahlung, die man pro Takt durch Abfall im Inventar aufnimmt."],
    enableBombing: ["Bombardement an/aus", "1 = das Bombardement-System ist aktiv."],
    AllMapEvent: ["Ganze Karte bombardiert", "1 = das Ereignis betrifft die ganze Karte."],
    serverTimerStartBombing: ["Start nach (s)", "Sekunden nach Serverstart, bis das Bombardement beginnt."],
    lastingTimeWholeMapBombed: ["Dauer (s)", "Wie lange das Ereignis dauert; bei aktivem Aufräumen auch, wie lange die Zone bleibt."],
    bombingOffset: ["Start-Zufallsversatz (s)", "Zufälliger Versatz zur Startzeit in Sekunden."],
    enableKillPlayers: ["Spieler töten", "1 = Spieler im tödlichen Radius sterben."],
    enableKillZombies: ["Zombies töten", "1 = Zombies im tödlichen Radius sterben."],
    enableKillAnimals: ["Tiere töten", "1 = Tiere im tödlichen Radius sterben."],
    enableDestroyCars: ["Fahrzeuge zerstören", "1 = Fahrzeuge im tödlichen Radius werden zerstört."],
    enableDestroyBaseBuildings: ["Basisbauten zerstören", "1 = Basisbauten im tödlichen Radius werden zerstört."],
    explosionsDeadlyRadiusAllMapBombed: ["Tödlicher Radius (m)", "Wer in diesem Radius um den Einschlag draußen steht, stirbt (falls aktiviert)."],
    unconIfCloseToBombImpactNotProtected: ["Schock bei Einschlag-Nähe", "1 = zwischen tödlichem Radius und Schockradius erleidet man Schock (nicht in Gebäuden)."],
    ShockQuantityOnImpact: ["Schock beim Einschlag", "Menge an Schock, die der Einschlag verursacht."],
    radiusFromCenterExcludedTheKillingRadiusAllMap: ["Schockradius (m)", "Schockradius ab dem Einschlagpunkt."],
    serverStandByTimerBombing: ["Standby-Timer (s)", "Wartezeit des Servers (Standby) vor dem Bombardement."],
    enableAdviceBombing: ["Warnungen an/aus", "1 = Spieler werden vor dem Bombardement gewarnt."],
    enableAdviceOnlyToPersonalRadio: ["Warnung nur per Funkgerät", "1 = nur Spieler mit funktionierendem Funkgerät hören die Warnung."],
    adviceTimerBombing: ["Warnung vor Bombe (s)", "Sekunden vor dem eigentlichen Bombardement, in denen die Ansage kommt."],
    insertTimerFreq: ["Aufnahme-Takt (s)", "Takt in Sekunden, mit dem die Strahlung während des Ereignisses auf Spieler übertragen wird."],
    cleanZonesAfterEndOfEvent: ["Zonen danach aufräumen", "1 = bombardierte Zonen werden nach dem Ereignis aufgeräumt (gilt nicht für Einzelbomben vom Panel)."],
    makeSingleBombingFromPanelCleanable: ["Panel-Einzelbomben aufräumbar", "1 = per Panel ausgelöste Einzelbomben-Zonen lassen sich aufräumen."],
    radiationAmountDuringEvent: ["Strahlung während des Ereignisses", "Strahlungsmenge, die während des Ereignisses herrscht."],
    percentageTakenFromAgent: ["Aufgenommener Anteil (%)", "Prozent der Strahlung, die der Spieler pro Aufnahme-Takt tatsächlich aufnimmt."],
    BombGMdamagedProtection: ["Gasmaske beschädigt (Schutz)", "Faktor 0–1: Schutz der Gasmaske bei beschädigter Ausrüstung."],
    BombGMbadlyDamagedProtection: ["Gasmaske stark beschädigt (Schutz)", "Faktor 0–1: Schutz der Gasmaske bei stark beschädigter Ausrüstung."],
    safeZones: ["Sichere Zonen (Koordinaten)", "Koordinaten „x y z“ von Zonen, in denen das Bombardement nichts tut. Der Radius je Zone steht in „Radius der sicheren Zonen“ (gleiche Reihenfolge)."],
    radius: ["Radius der sicheren Zonen (m)", "Radius je sicherer Zone (gleiche Reihenfolge wie die Koordinaten)."],
    waitBeforeStartingEventPanelButton: ["Wartezeit nach Knopfdruck (s)", "Sekunden zwischen dem Drücken des Knopfes am Panel und dem Start des Ereignisses."],
    SelectedBombFromPanelRandomizeIntensity: ["Intensität zufällig", "1 = die Strahlungsstärke der Panel-Bomben wird zufällig gewählt; 0 = der Höchstwert."],
    SelectedBombFromPanelRandomizeHeight: ["Höhe zufällig", "1 = die Höhe der Panel-Bomben wird zufällig gewählt; 0 = der Höchstwert."],
    SelectedBombFromPanelRandomizeRadius: ["Radius zufällig", "1 = der Radius der Panel-Bomben wird zufällig gewählt; 0 = der Höchstwert."],
    SelectedBombFromPanelWholeOrScaled: ["Flache Strahlung", "1 = die erzeugte Zone hat überall gleiche Strahlung; 0 = skaliert (zur Mitte hin stärker)."],
    SelectedBombFromPanelPercentageAbsorbed: ["Aufgenommener Anteil (%)", "Prozent der Strahlung, die der Spieler aufnimmt."],
  };

  // Muster für Bomben-Min/Mid/Max und sonstige Schlüssel
  const PATTERNS = [
    [/BombRadiusMin$/, (s) => "Kleinster zufälliger Bombenradius in Metern (" + s + ")."],
    [/BombRadiusMax$/, (s) => "Größter zufälliger Bombenradius in Metern (" + s + ")."],
    [/HeightMin$/, (s) => "Kleinste zufällige Höhe der Bombe in Metern (" + s + ")."],
    [/HeightMax$/, (s) => "Größte zufällige Höhe der Bombe in Metern (" + s + ")."],
    [/BombRadiationMin$/, (s) => "Kleinste zufällige Strahlung der Bombe (" + s + ")."],
    [/BombRadiationMax$/, (s) => "Größte zufällige Strahlung der Bombe (" + s + ")."],
    [/explosionsDeadlyRadius/, (s) => "Tödlicher Radius in Metern (" + s + "): wer draußen im Radius steht und nicht geschützt ist, stirbt."],
    [/radiusFromCenterExcludedTheKillingRadius/, (s) => "Schockradius in Metern (" + s + ")."],
    [/ShockQuantityOnImpact/, (s) => "Schockmenge beim Einschlag (" + s + ")."],
    [/TickTime$/i, () => "Takt in Sekunden."],
    [/Chance/i, () => "Wahrscheinlichkeit in Prozent."],
    [/Threshold/i, () => "Schwellenwert."],
    [/(^enable|Enable$)/i, () => "1 = aktiv, 0 = aus."],
  ];

  // Felder der Tabellen (Zonen, Wracks, Kleidung, Filter)
  const FIELDS = {
    name: ["Name / Klasse", "Bei Strahlungszonen frei wählbar; bei Wracks der Klassenname des Wracks (z. B. Land_Wreck_Uaz) – der Trigger entsteht bei jedem Wrack dieser Klasse auf der Karte."],
    radiationCenter: ["Mittelpunkt (x y z)", "Mittelpunkt der Strahlungszone in Weltkoordinaten."],
    triggerMins: ["Trigger-Ausdehnung minus (x y z)", "Ausdehnung des Trigger-Quaders in negative Richtung (relativ zum Mittelpunkt)."],
    triggerMaxs: ["Trigger-Ausdehnung plus (x y z)", "Ausdehnung des Trigger-Quaders in positive Richtung (relativ zum Mittelpunkt)."],
    triggerRadius: ["Trigger-Radius (m)", "Radius der runden Zone in Metern. 0 = es zählt der Quader aus Minus/Plus."],
    triggerHeight: ["Trigger-Höhe (m)", "Höhe der Zone in Metern."],
    triggerOffset: ["Trigger-Versatz", "Versatz der Zone in der Höhe (z. B. −100 legt sie unter den Mittelpunkt)."],
    percentageAppliedOutToIn: ["Aufgenommener Anteil (%)", "Laut Doku: Prozent der Strahlung, die der Spieler aufnimmt. Der Name („OutToIn“) könnte auch den Anteil meinen, der von außen nach innen (Gebäude) gelangt."],
    randomizeIntensity: ["Zufällige Intensität", "1 = die Stärke wird zwischen Min und Max zufällig gewählt; 0 = fest."],
    intensityMin: ["Intensität min.", "Kleinste Strahlungsstärke der Zone."],
    intensityMax: ["Intensität max.", "Größte Strahlungsstärke der Zone."],
    wholeOrScaled: ["Flach (1) / skaliert (0)", "1 = überall in der Zone gleiche Strahlung; 0 = skaliert (zur Mitte hin stärker)."],
    cleanable: ["Aufräumbar", "Laut Doku: TRUE = man kann den Abfall ausgraben und die Zone damit entfernen (in deiner Datei steht ein Wert wie 100.0)."],
    randomizerSpawn: ["Spawn-Chance (%)", "0–100: Chance, dass diese Zone/dieser Trigger auf der Karte tatsächlich entsteht."],
    clothName: ["Ausrüstung (Klasse)", "Klassenname von Gasmaske/Schutzausrüstung. Filter und Gasmasken müssen korrekt von Vanilla-Klassen erben."],
    protection: ["Schutz (mSv)", "Schutzmenge in mSv, die dieses Teil gegen Strahlung bietet."],
    filterName: ["Filter (Klasse)", "Klassenname des Gasmasken-Filters."],
    mSvProtection: ["Schutz (mSv)", "Schutzmenge in mSv, die dieser Filter bietet."],
  };

  const UNIT_DE = { SEC: "Sekunden", "INT SEC": "Sekunden (Ganzzahl)", QTY: "Menge/Wert", "%": "Prozent", BOOL: "Ein/Aus", INT: "Ganzzahl", "TIME*CALC": "Zeit × Faktor", TIME: "Zeit", FLOAT: "Kommazahl", STRING: "Text", G: "Gramm", COORDS: "Koordinaten" };

  const titleOf = (k) => (SECTIONS[k] ? SECTIONS[k][0] : k);
  const docOf = (key) => {
    const d = EQE.RadDoc && EQE.RadDoc[key];
    return d ? { unit: d[0], comment: d[1], def: d[2], type: d[3] } : null;
  };
  function pretty(key) {
    return key.replace(/_/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").trim();
  }

  function info(secKey, key) {
    const hh = H[key];
    const d = docOf(key);
    let label;
    let help;
    if (hh) {
      label = hh[0];
      help = hh[1];
    } else {
      label = pretty(key);
      help = "Wert für „" + titleOf(secKey) + "“.";
      for (const [re, fn] of PATTERNS) {
        if (re.test(key)) {
          help = fn(titleOf(secKey));
          break;
        }
      }
    }
    if (d) {
      const unit = UNIT_DE[d.unit] ? " [" + UNIT_DE[d.unit] + "]" : "";
      help += " — Original-Doku: " + (d.comment ? "„" + d.comment + "“" : "(kein Kommentar)") + unit + " · Standard laut Doku: " + d.def + ".";
    }
    return { label: label, help: help + " (JSON: " + key + ")", doc: d };
  }

  EQE.RadText = { GROUPS: GROUPS, SECTIONS: SECTIONS, FIELDS: FIELDS, info: info, titleOf: titleOf, docOf: docOf, pretty: pretty };
})(window.EQE);
