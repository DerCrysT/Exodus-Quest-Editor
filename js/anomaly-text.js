/**
 * Exodus Editor – Anomalien, Detektoren, Artefakte: deutsche Namen und Erklärungen.
 * Für diese Mods lag keine Doku vor – die Erklärungen sind aus den Wertenamen und den Beispieldateien abgeleitet
 * und mit „vermutlich“ markiert, wo die Bedeutung nicht eindeutig ist.
 */
window.EQE = window.EQE || {};

(function (EQE) {
  "use strict";

  // Anomalie-Balance: Schlüssel -> [Name, Erklärung]
  const BAL = {
    clothDamage: ["Schaden an Kleidung", "Schaden, den die Kleidung des Spielers bei einem Treffer der Anomalie nimmt."],
    itemDamage: ["Schaden an Gegenständen", "Schaden an Gegenständen (Inventar/Hände) bei einem Treffer – vermutlich in Prozent der Haltbarkeit."],
    playerHealthDamage: ["Leben (Schaden)", "Lebensverlust des Spielers bei einem Treffer bzw. pro Anwendungstakt der Anomalie."],
    playerStaminaDamage: ["Ausdauer (Schaden)", "Ausdauerverlust des Spielers."],
    playerBloodDamage: ["Blut (Schaden)", "Blutverlust des Spielers."],
    playerShockDamage: ["Schock (Schaden)", "Schock, der dem Spieler zugefügt wird."],
    artifactSpawnScanRadiusMeters: ["Artefakt-Suchradius (m)", "Radius um die Anomalie, in dem für das Erscheinen von Artefakten geprüft wird."],
    artifactHoverHeightMeters: ["Artefakt-Schwebehöhe (m)", "Höhe, in der ein Artefakt über dem Boden schwebt."],
    artifactRevealCooldownSeconds: ["Artefakt-Sperre (s)", "Wartezeit in Sekunden, bevor die Anomalie erneut ein Artefakt freigeben kann."],
    teleportVomitAfterSeconds: ["Erbrechen nach Teleport (s)", "Sekunden nach dem Teleport, bis der Spieler sich übergibt."],
    graviRadiusMeters: ["Gravi: Radius (m)", "Wirkradius der Gravitations-Anomalie."],
    graviLaunchHeightMeters: ["Gravi: Wurfhöhe (m)", "Höhe, auf die der Spieler geschleudert wird."],
    graviFractureDelaySeconds: ["Gravi: Bruch nach (s)", "Verzögerung bis zum Beinbruch nach dem Wurf."],
    graviCatapultFractureEnabled: ["Gravi: Beinbruch", "1 = der Wurf kann einen Beinbruch verursachen."],
    chopperCenterKillDelaySeconds: ["Chopper: Tod nach (s)", "Sekunden im Zentrum, bis der Spieler stirbt."],
    chopperCenterCorpseTeleportDelaySeconds: ["Chopper: Leiche versetzen nach (s)", "Sekunden, bis die Leiche aus dem Zentrum versetzt wird."],
    chopperSuckHorizontal: ["Chopper: Sog horizontal", "Stärke des seitlichen Sogs zum Zentrum."],
    chopperLethalHeightMeters: ["Chopper: tödliche Höhe (m)", "Höhe des tödlichen Bereichs."],
    chopperSuckTickSeconds: ["Chopper: Sog-Takt (s)", "Takt, in dem der Sog angewendet wird."],
    chopperSuckRadiusMeters: ["Chopper: Sogradius (m)", "Radius, in dem der Sog wirkt."],
    chopperLethalRadiusMeters: ["Chopper: tödlicher Radius (m)", "Radius um das Zentrum, in dem man stirbt."],
    funnelKillDelaySeconds: ["Trichter: Tod nach (s)", "Sekunden im tödlichen Bereich, bis der Spieler stirbt."],
    funnelSuckTickSeconds: ["Trichter: Sog-Takt (s)", "Takt, in dem der Sog angewendet wird."],
    funnelLethalRadiusMeters: ["Trichter: tödlicher Radius (m)", "Radius des tödlichen Kerns."],
    funnelOuterRadiusMeters: ["Trichter: Außenradius (m)", "Radius, ab dem der Sog beginnt."],
    funnelSuckUp: ["Trichter: Sog nach oben", "Stärke des Sogs nach oben."],
    funnelCorpseTeleportDelaySeconds: ["Trichter: Leiche versetzen nach (s)", "Sekunden, bis die Leiche versetzt wird."],
    funnelLethalHeightMeters: ["Trichter: tödliche Höhe (m)", "Höhe des tödlichen Bereichs."],
    funnelSuckHorizontal: ["Trichter: Sog horizontal", "Stärke des seitlichen Sogs."],
    springboardCatapultFractureEnabled: ["Sprungbrett: Beinbruch", "1 = der Sprung kann einen Beinbruch verursachen."],
    springboardRadiusMeters: ["Sprungbrett: Radius (m)", "Wirkradius der Sprungbrett-Anomalie."],
    springboardFractureDelaySeconds: ["Sprungbrett: Bruch nach (s)", "Verzögerung bis zum Beinbruch."],
    springboardLaunchHeightMeters: ["Sprungbrett: Wurfhöhe (m)", "Höhe, auf die der Spieler geschleudert wird."],
    steamEarRingEnabled: ["Dampf: Ohrenklingeln", "1 = Dampf-Anomalie löst Ohrenklingeln aus."],
    steamEarRingDurationSeconds: ["Dampf: Dauer Ohrenklingeln (s)", "Wie lange das Klingeln anhält."],
    frostWeakWalkSeconds: ["Frost: Schwäche-Gang (s)", "Sekunden, in denen der Spieler nach dem Treffer nur geschwächt gehen kann."],
    electronicEmpRadiusMeters: ["Elektro: EMP-Radius (m)", "Radius, in dem Elektronik (z. B. Detektoren) gestört wird."],
    electronicEmpEnabled: ["Elektro: EMP", "1 = die Anomalie stört Elektronik."],
    grabberRearmCooldownSeconds: ["Greifer: Wiederladezeit (s)", "Wartezeit, bis der Greifer wieder zuschlagen kann."],
    grabberRadiusMeters: ["Greifer: Radius (m)", "Wirkradius des Greifers."],
    grabberActiveSeconds: ["Greifer: Aktivzeit (s)", "Wie lange der Greifer aktiv ist."],
    fireHeatRadiusMeters: ["Feuer: Hitzeradius (m)", "Außenradius der Hitze."],
    fireHeatTemperatureCap: ["Feuer: max. Temperatur", "Obergrenze der Hitze-Temperatur."],
    fireHeatRadiusFullMeters: ["Feuer: voller Hitzeradius (m)", "Radius mit voller Hitze."],
    fireHeatEnabled: ["Feuer: Hitze", "1 = die Anomalie erhitzt den Spieler."],
    chemicalPoisonAgentAmount: ["Chemie: Gift-Menge", "Menge an Giftwirkstoff, den die Anomalie überträgt."],
    chemicalPoisonOnEnterEnabled: ["Chemie: Gift beim Betreten", "1 = Gift schon beim Betreten statt erst bei Treffern."],
  };

  // Detektoren
  const DET = {
    DetectorRange: ["Reichweite (m)", "Wie weit der Detektor Ziele erfasst."],
    DirectionOffset: ["Richtungs-Offset (°)", "Drehung der Erfassungsrichtung gegenüber der Blickrichtung (vermutlich Winkel in Grad)."],
    WorkAngle: ["Arbeitswinkel (°)", "Öffnungswinkel des Erfassungsbereichs: 360 = rundum, kleinere Werte = Kegel in Blickrichtung."],
    SquareSearchOffset: ["Such-Raster", "Versatz/Raster der quadratischen Suche (größer = gröberes, schnelleres Suchen) – vermutlich in Rasterfeldern."],
    MaxDisplayTargets: ["Max. angezeigte Ziele", "Wie viele Ziele gleichzeitig angezeigt werden."],
    DisplayCycleTicks: ["Anzeige-Zyklus (Ticks)", "Anzahl Ticks, nach denen die Anzeige wechselt/aktualisiert wird."],
    ArtefaktScanner: ["Findet Artefakte", "1 = der Detektor zeigt Artefakte an."],
    AnomalieScanner: ["Findet Anomalien", "1 = der Detektor zeigt Anomalien an."],
  };

  // Trigger
  const TRIG = {
    triggerByPlayersGeneral: ["Spieler lösen aus", "1 = Spieler können Anomalien grundsätzlich auslösen."],
    triggerByAnimalsGeneral: ["Tiere lösen aus", "1 = Tiere können Anomalien auslösen."],
    triggerByMutantsGeneral: ["Mutanten/Zombies lösen aus", "1 = Mutanten und Zombies können Anomalien auslösen."],
    triggerByItemsGeneral: ["Gegenstände lösen aus", "1 = geworfene/liegende Gegenstände lösen Anomalien allgemein aus."],
    triggerByWhitelistedItems: ["Nur freigegebene Items lösen aus", "1 = die Items der Liste lösen diese Anomalie aus (z. B. Bolzen werfen)."],
    triggerByWhitelistedMutants: ["Nur freigegebene Mutanten lösen aus", "1 = nur die gelisteten Mutanten/Zombieklassen lösen diese Anomalie aus."],
    Cooldown: ["Abklingzeit (s)", "Sekunden, bevor dieselbe Anomalie erneut durch ein Item ausgelöst werden kann."],
  };

  // Spawn-Einstellungen
  const SPAWN = {
    enableAnomalyOptimization: ["Optimierung", "1 = Anomalien werden nur in der Nähe von Spielern erzeugt/aktiv gehalten (spart Serverleistung)."],
    worldSizeX: ["Kartengröße X (m)", "Ausdehnung der Karte in Ost-West-Richtung."],
    worldSizeY: ["Kartengröße Y (m)", "Ausdehnung der Karte in Nord-Süd-Richtung."],
    spawnDistanceNearPlayer: ["Spawn-Abstand zum Spieler (m)", "Anomalien in diesem Umkreis um Spieler werden erzeugt (vermutlich Aktivierungsradius)."],
    updateTime: ["Aktualisierung (s)", "Intervall, in dem geprüft wird, welche Anomalien nahe Spielern erzeugt oder entfernt werden."],
    enableDebugLog: ["Debug-Log", "1 = ausführliche Logeinträge (nur zur Fehlersuche)."],
    enableAnomalyOrientation: ["Anomalie-Ausrichtung", "1 = Anomalien werden am Gelände ausgerichtet."],
    enableSpawnArtefacts: ["Artefakte spawnen", "1 = Anomalien lassen Artefakte entstehen."],
    spawnArtefactsType: ["Artefakt-Spawn-Art", "Art, wie Artefakte entstehen (1 = Standard laut Beispiel-Config; weitere Werte unbekannt)."],
  };

  // Auto-Reload
  const RELOAD = {
    EnableAutoReload: ["Automatisches Neuladen", "1 = die Anomalie-Config wird in festem Intervall neu geladen."],
    AutoReloadIntervalSeconds: ["Intervall (s)", "Sekunden zwischen den automatischen Neuladungen (7200 = 2 Stunden)."],
    EnableReloadFlag: ["Reload-Flag-Datei", "1 = das Neuladen kann zusätzlich durch eine Flag-Datei ausgelöst werden."],
    DeleteReloadFlagAfterUse: ["Flag danach löschen", "1 = die Flag-Datei wird nach dem Neuladen gelöscht."],
    ReloadFlagPath: ["Flag-Pfad", "Pfad der Flag-Datei (reload.flag) im Server-Profil."],
    RunReloadOnMissionStart: ["Beim Start neu laden", "1 = beim Missionsstart direkt einmal neu laden."],
    ReloadDetectorArtefactData: ["Detektor-/Artefaktdaten neu laden", "1 = beim Neuladen auch die Detektor- und Artefakt-Daten neu einlesen."],
  };

  // Artefakt-Effekte (Basis)
  const EFX = [
    ["Health", "health", "Leben", "Leben pro Takt (positiv = heilt, negativ = Schaden)."],
    ["blood", "blood", "Blut", "Blut pro Takt (positiv = Zuwachs, negativ = Verlust)."],
    ["shock", "shock", "Schock", "Schock pro Takt (positiv = Zuwachs/Schaden, negativ = Abbau – vermutlich)."],
    ["food", "food", "Nahrung", "Nahrungsenergie pro Takt (negativ = zusätzlicher Hunger)."],
    ["water", "water", "Wasser", "Wasser pro Takt (negativ = zusätzlicher Durst)."],
  ];
  // Artefakt-Effekte (MedPlus-Anbindung)
  const MPEFX = [
    ["enableLaceration", "lacerationChancePerTick", "Platzwunde (% je Takt)", "Chance in Prozent pro Takt auf eine Platzwunde (MedPlus)."],
    ["enableBrainConcussion", "brainconcussionChancePerTick", "Gehirnerschütterung (% je Takt)", "Chance in Prozent pro Takt auf eine Gehirnerschütterung (MedPlus)."],
    ["enableSleep", "sleepQtyPerTick", "Schlaf je Takt", "Schlafwert pro Takt (negativ = müder)."],
    ["enableHygiene", "hygieneQtyPerTick", "Hygiene je Takt", "Hygienewert pro Takt (negativ = schmutziger)."],
    ["enableMental", "mentalQtyPerTick", "Mental je Takt", "Mentalwert pro Takt (negativ = Verlust)."],
    ["enableAlchol", "alchol", "Alkohol je Takt", "Alkohol-Wirkstoff pro Takt."],
    ["enableOverdose", "overdose", "Überdosis je Takt", "Überdosis-Wirkstoff pro Takt (MedPlus: ab der Malus-Schwelle Lebens-/Schock-/Ausdauerverlust)."],
  ];

  EQE.AnText = { BAL: BAL, DET: DET, TRIG: TRIG, SPAWN: SPAWN, RELOAD: RELOAD, EFX: EFX, MPEFX: MPEFX };
})(window.EQE);
