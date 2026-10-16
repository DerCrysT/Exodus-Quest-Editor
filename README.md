# Exodus Quest Editor

Browser-Tool zum Erstellen und Bearbeiten der JSON-Dateien von **ExodusQuests** (DayZ-Mod, DayZone):
Quests, NPCs, Dialoge und Stashes. Läuft komplett im Browser, keine Installation, kein Server, kein Build-Schritt.

**Live:** `https://dercryst.github.io/Exodus-Quest-Editor/` (sobald GitHub Pages aktiv ist, siehe unten)

## Benutzung

1. Tab wählen (Quest / NPC / Dialog / Stash) und das Formular ausfüllen. Rechts erscheint live die fertige JSON-Datei.
2. **Prüfen** klickt gegen die wichtigsten Regeln des Mod-Validators (fehlende Pflichtfelder, doppelte IDs,
   unbekannte Rangnamen, leere Ruf-Bereiche, kaputte Dialog-Verweise, …). Ersetzt nicht den echten Validator im
   Server-Log, findet aber die häufigsten Fehler vorher.
3. **JSON kopieren** oder **Herunterladen**, Datei in den passenden Ordner im Server-Profil legen
   (`Quest/`, `NPC/`, `Dialog/`, `Stash/` – beliebig tief verschachtelt, wird rekursiv geladen).
4. Bestehende Datei ändern: **JSON laden…** (Datei wählen) oder **JSON einfügen…** (Text einfügen) – das Formular
   füllt sich automatisch.

Entwürfe werden fortlaufend im Browser zwischengespeichert (`localStorage`, pro Tab getrennt) und bleiben beim
nächsten Besuch erhalten. Es wird nichts hochgeladen oder an einen Server gesendet.

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
index.html          Shell, Tabs, Formular-/Vorschau-Layout
css/style.css        Dark-Theme (an die DayZ/STALKER-Optik des Mods angelehnt)
js/common.js          Gemeinsame UI-Bausteine (Felder, Listen-Editor, Ruf-Bereich-Editor, JSON-Vorschau, Toasts)
js/data.js            Datentabellen: Objective-Parameter je Typ, Belohnungstypen, Ruf-Ränge
js/quest.js           Quest-Editor
js/npc.js             NPC-Editor
js/dialog.js          Dialog-Editor
js/stash.js           Stash-Editor
js/main.js            Tab-Umschaltung, Start
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
