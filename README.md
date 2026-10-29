# Exodus Quest Editor

Browser-Tool zum Erstellen und Bearbeiten der JSON-Dateien von **ExodusQuests** (DayZ-Mod, DayZone):
Quests, NPCs, Dialoge und Stashes. Läuft komplett im Browser, keine Installation, kein Server, kein Build-Schritt.

**Live:** `https://dercryst.github.io/Exodus-Quest-Editor/` (sobald GitHub Pages aktiv ist, siehe unten)

## Benutzung

1. **Projekt laden** (Tab *Projekt*): den ganzen `ExodusQuests`-Profilordner auswählen oder Ordner/Dateien per Drag&Drop
   hineinziehen. Das Tool erkennt selbst, was Quest, NPC, Dialog und Stash ist (Config.json, Spielerdaten u. Ä. werden übersprungen).
2. **Bearbeiten** in den Editor-Tabs: oben die Datei auswählen (oder *Neu* / *Duplizieren*). Alle IDs – NPCs, Quests, Stashes,
   Dialoge, Spawn-IDs, Dialogsprünge – kommen als Vorschlagsliste aus dem Projekt. Änderungen werden sofort gespeichert.
3. **Zuweisen:** Quests und Dialoge weist du im Abschnitt „Zuweisung an NPCs“ direkt dem NPC zu. Im **Dialog-Tab** erst den NPC
   wählen – „Neu“ legt den Dialog dann für genau diesen NPC an, die Liste zeigt nur dessen Dialoge.
4. **Ingame-Vorschau** (Dialog-Tab, rechts): das Gesprächsfenster wie im Spiel, durchklickbar. Rang beim NPC (und bei anderen NPCs),
   offene Rückgaben (`TurnBack`) und Spielername sind einstellbar; Ruf-Bedingungen, `Requires`, `@quests`, `@trade` und die
   Themenliste verhalten sich wie auf dem Server.
5. **NPC-Übersicht:** alle NPCs auf einen Blick – Quests, Daily-Pool, Dialoge, Verbündete/Rivalen, Gegenseiten (wer einen NPC als
   Rivalen eingetragen hat) plus Beziehungsgraph. Fehlende Verweise sind rot markiert.
6. **Prüfen:** pro Datei der Button *Prüfen*; im Projekt-Tab *Alles prüfen* testet jede Datei **und alle Verweise untereinander**
   (unbekannte NPCs/Stashes/Dialoge/Spawn-IDs, nicht angebotene Quests, nicht zugewiesene Dialoge, kaputte Dialogsprünge …).
7. **Exportieren:** *ZIP: nur Geändertes* liefert genau die neu angelegten/geänderten Dateien in der Struktur
   `Quest/ NPC/ Dialog/ Stash/` (Unterordner bleiben erhalten), *ZIP: alles* das ganze Projekt. Unveränderte Dateien werden
   byte-genau wie geladen exportiert.
   **Neue und gelöschte Dateien:** Neue Dateien landen im passenden Ordner (aus den Upload-Pfaden abgeleitet, z. B. `Quest/…`,
   `XCP_Trade_System/trader_category_list/…`). Im Tool gelöschte oder (Kategorien) umbenannte Dateien werden im Projekt-Tab unter
   „Beim Export zu löschen“ gelistet. **„In Projektordner speichern…“** (Chrome/Edge) schreibt Geändertes und löscht Entferntes direkt
   in deinem Projektordner (Ordner einmal bestätigen, vorher kommt eine Liste zur Kontrolle). Das ZIP kann nicht löschen – es enthält
   deshalb `_LOESCHEN.txt` und `_loeschen.bat` (im Profilordner ausführen).

8. **Trader (XCP_Trader_V2):** Bereich *Handel* in der linken Navigation – Trader (Einträge der `Traders_list.json`), Handelskategorien
   (`trader_category_list/*.json`, Produkttabelle mit Filter, Klassen-Import und Preis-Helfern) und Tauschkategorien
   (`barter_category_list/*.json`). Die `Traders_list.json` wird beim Laden in einzelne Trader aufgeteilt und beim Export wieder zusammengefügt;
   die Kategorie-ID ist der Dateiname (Umbenennen zieht die Trader mit). „2 m neben diesen NPC setzen“ + Gesamtprüfung warnen, wenn ein Dialog
   `@trade` nutzt, aber kein Trader innerhalb von 8 m steht.
9. **Interaktive Karte:** lädt immer die DayZone-Karte (`map/`). NPCs, Trader, Quest-Ziele (Explore/Survive/Recovery/Kill/Action), Spawn-Gruppen
   und Stashes erscheinen als Marker; Doppelklick öffnet den Eintrag im Editor. Zones-/Tiers-/Radiation-/Anomalies-JSONs aus dem Projektordner
   werden automatisch angezeigt. Die Karten-App liegt als gebauter Stand im Ordner `map/` (Quelle: Exodus-Interaktivmap, Vite/React).

10. **Overrides (config.cpp):** Bereich *Config → Overrides*. Lädt `config.cpp`, `config.bin` (binarisiert) und **PBO-Dateien** (es wird nur die enthaltene Config gelesen, der Rest der PBO bleibt unberührt) – ganzen Projektordner im Projekt-Tab oder im Override-Tab einen Ordner wählen,
    erkennt alle Klassen (CfgVehicles, CfgWeapons, CfgMagazines, CfgAmmo …) samt Vererbung und sortiert vor: Kleidung nach Slot, Essen & Trinken, Waffen, Magazine, Munition, Behälter.
    Klasse anklicken und Werte ändern (Gewicht, Inventargröße, Cargo, Lebenspunkte, Schutz je Angriffsart, Isolierung, Nährwerte, Waffenwerte …) – Zahlenfelder, Dropdowns, Häkchen;
    „Alle Werte“ zeigt jede Eigenschaft der Klasse. Mit den Häkchen in der Liste mehrere Klassen markieren und Werte für alle setzen, multiplizieren oder addieren.
    Gespeichert wird **nur Geändertes** in `Exodus_Overrides/Exodus_Overrides/config.cpp` (+ `$PBOPREFIX$.txt`), im Projektordner neu angelegt oder – falls schon vorhanden – weiterbearbeitet.
    `requiredAddons` werden aus den CfgPatches der betroffenen Configs ermittelt. Texturen (paa/rvmat) werden ignoriert. Basisklassen aus Vanilla werden aufgelöst, wenn ihre Config mitgeladen wird – z. B. die Vanilla-PBOs aus `DayZServer/addons` (characters_*.pbo, gear_*.pbo, …). Config-Namen werden ohne Beachtung der Groß-/Kleinschreibung behandelt.

11. **MedPlus (Medizin-Mod):** Bereich *Medizin → MedPlus*. Lädt den MedPlus-Ordner (`MedPlusTrim.json`, `ZombieDamageTrim.json`, `AnimalDamageTrim.json`, `BladeDamageTrim.json`,
    `WeaponDamageTrim.json`, `EdibleForMSA.json`, `MedPlusEdibleSoupTrim.json`). Alle ~650 Werte sind nach Themen sortiert (Verletzungen, Körper, Psyche, Medikamente, Suppen), mit „?“-Erklärung
    und **Live-Berechnung** je Abschnitt (z. B. Verbluten in Minuten, Wirkung über die Dauer, Alkohol-Menge bis Betrunken, Zeit bis Herzinfarkt) sowie Plausibilitätsprüfungen
    (doppelte Einträge, ungleich lange Listen, Summe Stecken+Durchschuss ≠ 100 %). Änderungen werden wie bei Dialogen/Tradern per „Änderungen speichern“ in die JSON-Dateien zurückgeschrieben
    (Originalformat: 4 Leerzeichen, Kommazahlen mit `.0`). Die „?“-Texte zitieren die originale MedPlus-Doku (`MedPlus explanation.txt`, falls im Ordner) und ergänzen sie. **Tick-Zeiten (alle):** setzt alle Takt-Zeiten (z. B. überall 1 s) und rechnet die „pro Takt“-Werte und Chancen so mit, dass sich das Verhalten nicht ändert.

12. **Radiation (Radiation-Mod):** Bereich *Medizin → Radiation*, gleicher Aufbau wie MedPlus. Bearbeitet `GeneralSetting.json` (Strahlenkrankheit, Schutz, Heilung, Abfall), `BombingTrim.json` (Bombardement und die drei Panel-Bomben),
    `RadiationZones.json` und `WreckZones.json` (Liste + Detail, Live-Wirkung je Zone), `RadClothProtection.json` und `FilterProtection.json` (Tabellen mit Doppelt-Prüfung). Dazu eine Zonen-Übersicht nach Gefahr, „?“-Erklärungen mit Zitat aus der Mod-Doku und Live-Berechnungen
    (Zeit bis Stufe 1 bis kritisch, Tod, Blutverlust, Überdosis bei geladenem MedPlus). Geschrieben wird im Originalformat.

13. **Gasmasken (Exodus_GM):** Bereich *Medizin → Gasmasken*. Liest die `Exodus_GM.pbo` (config.cpp + Skripte; auch über „Ordner laden“, z. B. den Addons-Ordner des Packs) oder einen vorhandenen Exodus_GM-Quellordner.
    Masken und Filter bearbeiten (Name, Beschreibung, Gewicht, Größe, Filterkapazität, Slots, Haltbarkeit …), neue Klassen anlegen/duplizieren, **Slot-Locks** (welche Slots eine Maske sperrt) und die **Filter-Erkennung** für den Radiation-Mod verwalten sowie CfgSlots ergänzen.
    Mit geladener Radiation-Config zeigt jede Klasse ihren Schutz (mSv), die Laufzeit in Zonen und gegen wie viele Zonen sie komplett schützt; fehlende Schutz-Einträge werden markiert.
    Gespeichert wird der Ordner `Exodus_GM/Exodus_GM/` (`config.cpp`, `Scripts/4_World/…`, `$PBOPREFIX$.txt`) im Projektordner – neu angelegt, falls er fehlt –, den du danach selbst als PBO packst. Die Skripte werden aus den Slot-Lock-Einstellungen erzeugt.

**Umbenennen:** Wird eine ID geändert, ziehen Verweise in anderen Dateien automatisch mit (NPC-Listen, PreQuests/NextQuests,
Dialogsprünge, Ruf-Bereiche, `{rank:npcId}`, StashId …).

Das Projekt wird fortlaufend im Browser zwischengespeichert (`localStorage`) und bleibt beim nächsten Besuch erhalten – das ist aber
nur ein Zwischenspeicher: bitte regelmäßig per ZIP sichern. Es wird nichts hochgeladen oder an einen Server gesendet.

## Lokal starten

Kein Build nötig – einfach `index.html` über einen lokalen Webserver öffnen (wegen `fetch`/Modul-Policies reicht
Doppelklick auf die Datei in den meisten Browsern zwar auch, ein kleiner Server ist aber zuverlässiger):

```bash
python3 -m http.server 8080
# dann im Browser: http://localhost:8080/
```

## GitHub Pages aktivieren

Dieses Repo enthält `.github/workflows/pages.yml`, das bei jedem Push auf `main` automatisch deployt.
Einmalig einrichten: **Settings → Pages → Source: „GitHub Actions“** wählen. Danach ist die Seite unter
`https://<username>.github.io/<repo>/` erreichbar.

## Aufbau

```
index.html          Tabs und Panels
css/style.css        Dark-Theme (an die DayZ/STALKER-Optik des Mods angelehnt)
js/common.js          Gemeinsame UI-Bausteine (Felder, Listen-Editor, Ruf-Bereich-Editor, JSON-Vorschau, Toasts, Tooltips)
js/data.js            Datentabellen: Objective-Parameter je Typ, TargetValue-Hilfen, Ruf-Ränge
js/project.js         Projekt: Dateityp-Erkennung, Verweise/Umbenennen, Gesamtprüfung, ZIP-Export, Autosave
js/shell.js           Editor-Gerüst (Dateiauswahl, Neu/Duplizieren/Löschen, Vorschau) und Zuweisungs-Abschnitt
js/quest.js           Quest-Editor
js/npc.js             NPC-Editor
js/dialog.js          Dialog-Editor inkl. NPC-Auswahl und Ingame-Vorschau
js/stash.js           Stash-Editor
js/trader.js          Trader-, Handels- und Tauschkategorie-Editoren
js/cfgparse.js        config.cpp-Parser, Klassen-Register, Vererbung, Kategorisierung
js/cfgbin.js          config.bin (rapified) und PBO-Archive lesen
js/overrides.js       Override-Tool (Klassen bearbeiten, Config erzeugen)
js/medplus*.js        MedPlus-Editor (Daten, Texte/Erklärungen, Oberfläche, Live-Berechnung)
js/radiation*.js      Radiation-Editor (nutzt die Bausteine aus medplus.js)
js/gasmask.js         Gasmasken-Editor (Exodus_GM: Config, Slot-Locks, Skript-Erzeugung)
js/maptab.js          Karten-Tab (iframe, Marker/Daten aus dem Projekt)
map/                  Gebaute interaktive Karte inkl. DayZone_Map.webp
js/overview.js        Projekt-Tab (Laden, Liste, Prüfung, Export) und NPC-Übersicht
js/main.js            Tab-Umschaltung, Drag&Drop, Start
```

Kein Framework, kein Build – reines HTML/CSS/JS, damit es ohne Weiteres auf GitHub Pages läuft und leicht
erweiterbar bleibt.

## Hinweise

- Komma-getrennte Klassenlisten (z. B. `TargetClass`, `ItemClass`) zählen laut Mod **gemeinsam** zur selben Anzahl –
  das ist keine ODER-Quest, sondern eine Sammelmenge.
- Ruf-Ränge: Brother in Arms, Ally, Friend, Associate, Acquaintance, Neutral, Suspicious, Disliked, Enemy, Wanted,
  Execution Target. `Min`/`Max` eines Ruf-Bereichs mit dem Wert 0 gelten dem Spiel als „nicht gesetzt“ (voller
  Bereich) – für „bis 0“ bitte `MaxRank` „Neutral“ verwenden.
- Das Tool kennt den Stand von ExodusQuests mit Reputation-System, Zeitlimit und Start-Item-Rückgabe. Bei neuen
  Mod-Versionen können `js/data.js` und die Export-Funktionen in `js/quest.js`/`js/npc.js`/`js/dialog.js`
  nachgezogen werden müssen – maßgeblich sind dann `docs/schemas/*.json` im Mod-Repo.

## Lizenz / Nutzung

Internes Werkzeug für das ExodusQuests-Projekt. Keine Daten verlassen den Browser.
