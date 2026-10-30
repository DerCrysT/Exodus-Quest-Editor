/**
 * Exodus Editor – Datentabellen: Objective-Parameter je Typ, Belohnungstypen, Ruf-Ränge.
 * Quelle: scripts/4_World/Objectives/*.c (Doc-Kommentare) und scripts/3_Game/EQ_Data_Reputation.c im Mod-Repo.
 */
window.EQE = window.EQE || {};

(function (EQE) {
  "use strict";

  EQE.OBJECTIVE_TYPES = [
    "Kill",
    "Collect",
    "Deliver",
    "DeliverContainer",
    "Fish",
    "Harvest",
    "Craft",
    "Explore",
    "Action",
    "LootStash",
    "Recovery",
    "Survive",
  ];

  // key, label, type(text/number/bool/select), help, default, required, options
  EQE.OBJECTIVE_PARAMS = {
    Kill: [
      { key: "TargetClass", label: "TargetClass", type: "text", help: "Klasse(n) des Ziels, mehrere Komma-getrennt (zählen alle zusammen). Default ZombieBase; auch Tiere, SurvivorBase für Spieler/NPCs, Mod-Klassen." },
      { key: "Radius", label: "Radius", type: "number", help: "Optional (2D): Kills zählen nur, wenn das Ziel in diesem Kreis um Center stirbt." },
      { key: "CenterX", label: "CenterX", type: "number" },
      { key: "CenterY", label: "CenterY", type: "number" },
      { key: "CenterZ", label: "CenterZ", type: "number" },
      { key: "ResetOnLeave", label: "ResetOnLeave", type: "bool", help: "Braucht Radius/Center: verlässt der Spieler den Kreis, setzt sich der Fortschritt zurück." },
      { key: "SpawnId", label: "SpawnId", type: "text", ref: "spawn", help: "Optional: nur Gegner dieser Spawn-Gruppe der Quest zählen." },
      { key: "KillMethod", label: "KillMethod", type: "select", options: ["", "Any", "Melee", "Ranged"], help: "Default Any." },
      { key: "WeaponClass", label: "WeaponClass", type: "text", help: "Optional, mehrere Komma-getrennt möglich." },
    ],
    Collect: [
      { key: "ItemClass", label: "ItemClass", type: "text", required: true, help: "Mehrere Klassen Komma-getrennt möglich – zählen zusammen zur TargetValue-Anzahl." },
      { key: "RemoveOnComplete", label: "RemoveOnComplete", type: "bool", help: "Items beim Abschluss der Quest aus dem Inventar entfernen (Default aus)." },
    ],
    Deliver: [
      { key: "ItemClass", label: "ItemClass", type: "text", required: true, help: "Mehrere Klassen Komma-getrennt möglich, z. B. verschiedene Patches." },
      { key: "RemoveOnComplete", label: "RemoveOnComplete", type: "bool", default: true, help: "Default an – Items werden bei Abgabe entfernt." },
    ],
    DeliverContainer: [
      { key: "StashId", label: "StashId", type: "text", required: true, ref: "stash", help: "Stash aus dem Stash-Pool (Mode Container empfohlen)." },
      { key: "ItemClass", label: "ItemClass", type: "text", required: true, help: "Abzugebende Klasse(n), mehrere Komma-getrennt (zählen zusammen)." },
      { key: "ConfirmAction", label: "ConfirmAction", type: "bool", default: true, help: "Default an: Bestätigung per F an der Kiste nötig. Aus = automatisch bei genug Items." },
      { key: "KeepSeconds", label: "KeepSeconds", type: "number", help: "Wie lange die geleerte Kiste nach Abgabe stehen bleibt (Default 600)." },
    ],
    Fish: [
      { key: "ItemClass", label: "ItemClass", type: "text", help: "Gefangene Fischklasse (optional – leer = jeder Fisch)." },
    ],
    Harvest: [
      { key: "ItemClass", label: "ItemClass", type: "text", help: "Optional: nur diese Erntegut-Klasse zählt." },
      { key: "ActionClass", label: "ActionClass", type: "text", help: "Komma-getrennt; Default ActionHarvestCrops,ActionPickBerry,ActionMineBush,ActionMineTree,ActionMineRock,ActionDigWorms." },
    ],
    Craft: [{ key: "ItemClass", label: "ItemClass", type: "text", required: true }],
    Explore: [
      { key: "Waypoints", label: "Waypoints", type: "text", help: '"x y z [radius];x y z [radius];…" – mehrere Wegpunkte, mit Semikolon getrennt.' },
      { key: "X", label: "X", type: "number", help: "Alternativ zu Waypoints: ein einzelner Wegpunkt." },
      { key: "Y", label: "Y", type: "number" },
      { key: "Z", label: "Z", type: "number" },
      { key: "Radius", label: "Radius", type: "number", help: "Standardradius (Default 25)." },
      { key: "Ordered", label: "Ordered", type: "bool", default: true, help: "Default an: Wegpunkte in Reihenfolge besuchen." },
      { key: "StaySeconds", label: "StaySeconds", type: "number", help: "Aufenthaltsdauer pro Wegpunkt (Default 0 = sofort)." },
      { key: "StayInside", label: "StayInside", type: "bool", help: "Erfüllung geht verloren, sobald der Spieler den Bereich verlässt (wie Survive)." },
    ],
    Action: [
      { key: "ActionClass", label: "ActionClass", type: "text", required: true, help: "Komma-getrennt (Pflicht)." },
      { key: "TargetClass", label: "TargetClass", type: "text", help: "Optional." },
      { key: "Radius", label: "Radius", type: "number", help: "Optional (2D, an der Spielerposition)." },
      { key: "CenterX", label: "CenterX", type: "number" },
      { key: "CenterY", label: "CenterY", type: "number" },
      { key: "CenterZ", label: "CenterZ", type: "number" },
    ],
    LootStash: [{ key: "StashId", label: "StashId", type: "text", required: true, ref: "stash" }],
    Recovery: [
      { key: "ItemClass", label: "ItemClass", type: "text", required: true, help: "Klasse des Questitems." },
      { key: "X", label: "X", type: "number", required: true },
      { key: "Y", label: "Y", type: "number", required: true },
      { key: "Z", label: "Z", type: "number", required: true },
      { key: "Radius", label: "Radius", type: "number", help: "Aktivierungsradius am Fundort (Default 200)." },
      { key: "ReturnX", label: "ReturnX", type: "number", help: "Optionaler Rückgabeort." },
      { key: "ReturnY", label: "ReturnY", type: "number" },
      { key: "ReturnZ", label: "ReturnZ", type: "number" },
      { key: "ReturnRadius", label: "ReturnRadius", type: "number", help: "Default 25." },
    ],
    Survive: [
      { key: "X", label: "X", type: "number", required: true },
      { key: "Y", label: "Y", type: "number", required: true },
      { key: "Z", label: "Z", type: "number", required: true },
      { key: "Radius", label: "Radius", type: "number", help: "Gebiet, 2D (Default 100)." },
      { key: "FailOnLeave", label: "FailOnLeave", type: "bool", help: "An: Verlassen lässt das Objective fehlschlagen. Aus: Timer pausiert nur." },
      { key: "RequireItem", label: "RequireItem", type: "text", help: "Klasse, die im Inventar sein muss (Start und Ende)." },
      { key: "NightOnly", label: "NightOnly", type: "bool", help: "Timer läuft nur nachts." },
      { key: "NightStart", label: "NightStart", type: "number", help: "Default 22 Uhr Spielzeit." },
      { key: "NightEnd", label: "NightEnd", type: "number", help: "Default 5 Uhr Spielzeit." },
      { key: "MinRain", label: "MinRain", type: "number", help: "Mindest-Regenstärke 0.0–1.0." },
      { key: "MinOvercast", label: "MinOvercast", type: "number", help: "Mindest-Bewölkung 0.0–1.0." },
    ],
  };

  EQE.OBJECTIVE_TYPE_HELP = {
    Kill: "Zählt Tötungen. TargetValue = Anzahl.",
    Collect: "Items müssen im Inventar vorhanden sein. TargetValue = benötigte Anzahl.",
    Deliver: "Wie Collect, Items werden bei Abgabe entfernt (Default).",
    DeliverContainer: "Items in eine sichtbare Quest-Kiste legen und bestätigen. TargetValue = Anzahl.",
    Fish: "Einen Fisch fangen (Angel-Minispiel).",
    Harvest: "Ernten/Sammeln per Action. TargetValue = Anzahl.",
    Craft: "Ein Rezept erfolgreich herstellen.",
    Explore: "Orte besuchen. TargetValue wird automatisch auf die Wegpunkt-Anzahl gesetzt.",
    Action: "Eine beliebige (Mod-)Action ausführen.",
    LootStash: "Einen Stash plündern. TargetValue = Anzahl zu entnehmender Items.",
    Recovery: "Ein dynamisch gespawntes Questitem aufheben (optional zurückbringen).",
    Survive: "Eine Zeit lang in einem Gebiet ausharren. TargetValue = Sekunden.",
  };

  EQE.REWARD_TYPES = ["Item", "Currency", "Reputation", "LonerReputation"];

  EQE.REPUTATION_RANKS = [
    { id: "brotherinarms", label: "Brother in Arms", value: 1000 },
    { id: "ally", label: "Ally", value: 750 },
    { id: "friend", label: "Friend", value: 500 },
    { id: "associate", label: "Associate", value: 250 },
    { id: "acquaintance", label: "Acquaintance", value: 100 },
    { id: "neutral", label: "Neutral", value: 0 },
    { id: "suspicious", label: "Suspicious", value: -100 },
    { id: "disliked", label: "Disliked", value: -250 },
    { id: "enemy", label: "Enemy", value: -500 },
    { id: "wanted", label: "Wanted", value: -750 },
    { id: "executiontarget", label: "Execution Target", value: -1000 },
  ];

  EQE.normalizeRank = function (name) {
    return String(name || "")
      .toLowerCase()
      .replace(/[\s_-]/g, "");
  };
  EQE.findRank = function (name) {
    const n = EQE.normalizeRank(name);
    if (!n) return null;
    let key = n;
    if (key === "brother") key = "brotherinarms";
    if (key === "target") key = "executiontarget";
    return EQE.REPUTATION_RANKS.find((r) => r.id === key) || null;
  };

  EQE.REQUIRES_VALUES = ["", "TurnBackPending", "!TurnBackPending", "TurnBackDone", "!TurnBackDone", "TurnBackMissing", "!TurnBackMissing"];

  EQE.STASH_MODES = ["Container", "Hidden", "Ground"];
  EQE.NPC_MODES = ["NPC", "Bubble"];
  EQE.CATEGORY_SUGGESTIONS = ["Story", "Side", "Daily"];

  // TargetValue bedeutet je Objective-Typ etwas anderes (Tooltip + Einheit am Feld)
  EQE.TARGET_VALUE_HELP = {
    Kill: { unit: "Anzahl Kills", tip: "Wie viele Gegner getötet werden müssen. Gezählt wird nur, was zu TargetClass/Radius/SpawnId/KillMethod passt." },
    Collect: { unit: "Anzahl Items", tip: "Benötigte Anzahl Items im Inventar. Alle Klassen aus ItemClass zählen zusammen." },
    Deliver: { unit: "Anzahl Items", tip: "Anzahl abzugebender Items (alle Klassen aus ItemClass zählen zusammen)." },
    DeliverContainer: { unit: "Anzahl Items", tip: "Anzahl Items, die in die Quest-Kiste gelegt werden müssen." },
    Fish: { unit: "Anzahl Fische", tip: "Wie viele Fische gefangen werden müssen." },
    Harvest: { unit: "Anzahl", tip: "Wie oft geerntet/gesammelt werden muss (zählt Aktionen bzw. Items je nach Mod-Event)." },
    Craft: { unit: "Anzahl", tip: "Wie oft das Item erfolgreich hergestellt werden muss." },
    Explore: { unit: "wird automatisch gesetzt", tip: "Beim Explore setzt der Mod TargetValue automatisch auf die Anzahl der Wegpunkte. Der eingetragene Wert wird ignoriert – bitte trotzdem mindestens 1 stehen lassen." },
    Action: { unit: "Anzahl Ausführungen", tip: "Wie oft die Action ausgeführt werden muss." },
    LootStash: { unit: "Anzahl Items", tip: "Wie viele Items aus dem Stash entnommen werden müssen." },
    Recovery: { unit: "normalerweise 1", tip: "Recovery spawnt genau ein Questitem – TargetValue ist normalerweise 1." },
    Survive: { unit: "Dauer in SEKUNDEN", tip: "Beim Survive ist TargetValue die benötigte Zeit in Sekunden (600 = 10 Minuten, 3600 = 1 Stunde). Der alte Parameter 'Seconds' wird ignoriert." },
  };

  // Rang-Grenzen (siehe EQ_ReputationRanks.AddRank im Mod)
  EQE.RANK_BOUNDS = {
    brotherinarms: [1000, 1000], ally: [750, 999], friend: [500, 749], associate: [250, 499], acquaintance: [100, 249],
    neutral: [-99, 99], suspicious: [-249, -100], disliked: [-499, -250], enemy: [-749, -500], wanted: [-999, -750], executiontarget: [-1000, -1000],
  };
  /** [lo, hi] eines EQ_RepRange wie im Mod (0 = nicht gesetzt, Ränge überschreiben Min/Max). */
  EQE.rangeBounds = function (range) {
    let lo = range.Min || -1000;
    let hi = range.Max || 1000;
    const a = range.MinRank && EQE.findRank(range.MinRank);
    const b = range.MaxRank && EQE.findRank(range.MaxRank);
    if (a) lo = EQE.RANK_BOUNDS[a.id][0];
    if (b) hi = EQE.RANK_BOUNDS[b.id][1];
    return [lo, hi];
  };
  EQE.inRepRange = function (range, value) {
    if (!range) return true;
    const [lo, hi] = EQE.rangeBounds(range);
    return value >= lo && value <= hi;
  };
})(window.EQE);
