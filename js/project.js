/**
 * Exodus Quest Editor – Projekt: alle geladenen/erstellten JSON-Dateien (Quest, NPC, Dialog, Stash) an einem Ort.
 * - erkennt den Dateityp automatisch an der Struktur
 * - hält Verweise zwischen den Dateien konsistent (Umbenennen zieht Referenzen mit)
 * - prüft Verweise projektweit (crossCheck)
 * - exportiert alles oder nur Geändertes als ZIP (Ordnerstruktur Quest/ NPC/ Dialog/ Stash/)
 * - speichert automatisch im Browser (localStorage)
 */
window.EQE = window.EQE || {};

(function (EQE) {
  "use strict";

  // Bearbeitbar: quest, npc, dialog, stash, trader, tcat (Handelskategorie), bcat (Tauschkategorie).
  // Nur Anzeige/Durchreichen: zones, tiers, radiation, anomalies (Karte) und tsettings (Trader-Hauptsettings).
  const KINDS = ["quest", "npc", "dialog", "stash", "trader", "tcat", "bcat", "zones", "tiers", "radiation", "anomalies", "tsettings"];
  const ID_KEY = { quest: "QuestId", npc: "NpcId", dialog: "DialogId", stash: "StashId", trader: "trader_id" };
  // Dateien ohne ID im JSON: die ID ist der Dateiname (ohne .json) – bei Kategorien so von den Tradern referenziert
  const FILEID_KINDS = ["tcat", "bcat", "zones", "tiers", "radiation", "anomalies", "tsettings"];
  const NAME_KEY = { quest: "Title", npc: "Name", dialog: "Title", stash: "Mode", trader: "trader_name", tcat: "name_category", bcat: "name_category" };
  const FOLDER = { quest: "Quest", npc: "NPC", dialog: "Dialog", stash: "Stash", trader: "XCP_Trade_System", tcat: "XCP_Trade_System/trader_category_list", bcat: "XCP_Trade_System/barter_category_list", tsettings: "XCP_Trade_System", zones: "Map", tiers: "Map", radiation: "Map", anomalies: "Map" };
  const FOLDER_MARKER = { tcat: "trader_category_list", bcat: "barter_category_list" };
  const KIND_LABEL = { quest: "Quest", npc: "NPC", dialog: "Dialog", stash: "Stash", trader: "Trader", tcat: "Handelskategorie", bcat: "Tauschkategorie", zones: "Mutanten-Zonen", tiers: "Tiers", radiation: "Strahlung", anomalies: "Anomalien", tsettings: "Trader-Settings" };
  const MAP_KINDS = ["zones", "tiers", "radiation", "anomalies"];
  const STORE_KEY = "eqe:project:v1";

  /** Verbundener Projektordner (File System Access API), falls per Ordner-Dialog geladen. */
  let rootHandle = null;
  /** Weitere Teile des Tools, die mit ins ZIP/in den Projektordner geschrieben werden (z. B. Override-Config). */
  const extras = [];
  const DEL_KEY = "eqe:deleted:v1";
  let items = [];
  /** Im Tool gelöschte Dateien, die aus dem Upload stammen: {kind, path} – werden beim Export mitgelöscht. */
  let deleted = [];
  const listeners = [];
  let persistTimer = null;
  let warnedQuota = false;

  function emit(what) {
    listeners.forEach((f) => {
      try {
        f(what);
      } catch (e) {
        console.error(e);
      }
    });
  }

  function persist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(items));
        localStorage.setItem(DEL_KEY, JSON.stringify(deleted));
      } catch (e) {
        if (!warnedQuota) {
          warnedQuota = true;
          EQE.toast("Das Projekt ist zu groß für den Browser-Speicher – Autosave ist aus. Bitte regelmäßig als ZIP sichern!", true);
        }
      }
    }, 400);
  }

  function load() {
    try {
      const s = localStorage.getItem(STORE_KEY);
      if (s) items = JSON.parse(s).filter((i) => i && KINDS.indexOf(i.kind) > -1 && i.json && typeof i.json === "object");
      const d = localStorage.getItem(DEL_KEY);
      if (d) deleted = JSON.parse(d).filter((x) => x && x.path && FOLDER[x.kind]);
    } catch (e) {
      items = [];
      deleted = [];
    }
  }

  function uid() {
    return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /** Dateityp an der Struktur erkennen; null = unbekannt (z. B. Config.json, Spielerdaten). "traders_file" = Traders_list.json. */
  function classify(j, path) {
    const hint = String(path || "").toLowerCase();
    if (Array.isArray(j)) {
      const f = j[0];
      if (f && typeof f === "object") {
        if (f.spawnPoints || f.SpawnPoints || f.triggerRadius !== undefined || f.TriggerRadius !== undefined) return "zones";
        if (f.radiationCenter || f.RadiationCenter || f.intensityMax !== undefined || f.IntensityMax !== undefined) return "radiation";
      }
      return null;
    }
    if (!j || typeof j !== "object") return null;
    if (typeof j.DialogId === "string" && Array.isArray(j.Nodes)) return "dialog";
    if (typeof j.QuestId === "string" && (Array.isArray(j.Objectives) || j.QuestType !== undefined)) return "quest";
    if (typeof j.StashId === "string") return "stash";
    if (typeof j.NpcId === "string" && (j.Name !== undefined || j.Position !== undefined)) return "npc";
    if (Array.isArray(j.Traders)) return "traders_file";
    if (j.name_category !== undefined && Array.isArray(j.products)) {
      const first = j.products[0];
      if (first && first.received_classname !== undefined) return "bcat";
      if (first) return "tcat";
      return hint.indexOf("barter") > -1 ? "bcat" : "tcat";
    }
    if (Array.isArray(j.currency_list)) return "tsettings";
    if (j.teleportAnomaly || j.dynamicAnomaly || j.staticAnomaly) return "anomalies";
    if (j.RadiationZones || j.radiationZones) return "radiation";
    if (j.Zones || j.zones || j.spawnZones || j.SpawnZones) return hint.indexOf("radiation") > -1 ? "radiation" : "zones";
    if (j.tiers || j.Tiers) return "tiers";
    const vals = Object.values(j);
    if (vals.length && vals.every((v) => v && typeof v === "object" && (Array.isArray(v.classnames) || Array.isArray(v.Classnames)))) return "tiers";
    return null;
  }

  function idOf(item) {
    if (FILEID_KINDS.indexOf(item.kind) > -1) return item.fileId || "";
    const v = item.json[ID_KEY[item.kind]];
    return typeof v === "string" ? v : "";
  }
  function fileIdFromPath(path) {
    const base = String(path || "").split("/").pop().replace(/\.json$/i, "");
    return base;
  }
  function nameOf(item) {
    const v = item.json && NAME_KEY[item.kind] ? item.json[NAME_KEY[item.kind]] : "";
    return typeof v === "string" ? v : "";
  }
  function labelOf(item) {
    return idOf(item) || "(unbenannt)";
  }
  function isChanged(item) {
    return !!(item.isNew || item.dirty);
  }

  function byKind(kind) {
    return items.filter((i) => i.kind === kind);
  }
  function get(id) {
    return items.find((i) => i.uid === id) || null;
  }
  function find(kind, id) {
    return id ? items.find((i) => i.kind === kind && idOf(i) === id) || null : null;
  }
  function ids(kind) {
    return byKind(kind).map(idOf).filter((x) => x);
  }
  /** Für <datalist>: [{value:id, label:"id – Name"}] */
  function options(kind) {
    return byKind(kind)
      .filter((i) => idOf(i))
      .map((i) => ({ value: idOf(i), label: idOf(i) + (nameOf(i) && kind !== "stash" ? " – " + nameOf(i) : "") }));
  }

  function add(kind, json, opts) {
    opts = opts || {};
    const fileBased = FILEID_KINDS.indexOf(kind) > -1;
    const id = fileBased ? opts.fileId || fileIdFromPath(opts.path) : typeof json[ID_KEY[kind]] === "string" ? json[ID_KEY[kind]] : "";
    if (opts.path) deleted = deleted.filter((d) => d.path !== opts.path);
    let item = id && !opts.isNew ? find(kind, id) : null;
    let replaced = false;
    if (item) {
      replaced = true;
      item.json = json;
      item.rawText = opts.rawText || null;
      item.path = opts.path || item.path || null;
      item.dirty = false;
      item.isNew = false;
    } else {
      item = { uid: uid(), kind, path: opts.path || null, json, rawText: opts.rawText || null, dirty: false, isNew: !!opts.isNew };
      if (fileBased) item.fileId = id;
      items.push(item);
    }
    persist();
    emit({ type: "add", uid: item.uid });
    return { item, replaced };
  }

  function uniqueId(kind, base) {
    const taken = new Set(ids(kind));
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(base + "_" + n)) n++;
    return base + "_" + n;
  }

  function create(kind, json, fileId) {
    return add(kind, json, { isNew: true, fileId }).item;
  }

  /** Datei-ID (Dateiname) von Kategorien u. Ä. ändern; Verweise der Trader ziehen mit. */
  function setFileId(uidValue, newId) {
    const it = get(uidValue);
    if (!it || it.fileId === newId) return;
    const old = it.fileId;
    it.fileId = newId;
    it.dirty = true;
    if (old && newId && (it.kind === "tcat" || it.kind === "bcat")) {
      const field = it.kind === "tcat" ? "category_list_trader" : "category_list_barter";
      byKind("trader").forEach((t) => {
        if (replaceInArray(t.json[field], old, newId) > 0) t.dirty = true;
      });
    }
    persist();
    emit({ type: "json", uid: uidValue });
  }

  function setJson(id, json) {
    const it = get(id);
    if (!it) return;
    it.json = json;
    it.dirty = true;
    persist();
    emit({ type: "json", uid: id });
  }

  function mutate(id, fn) {
    const it = get(id);
    if (!it) return;
    fn(it.json);
    it.dirty = true;
    persist();
    emit({ type: "json", uid: id });
  }

  function remove(id) {
    const it = get(id);
    if (!it) return;
    const myId = idOf(it);
    items = items.filter((i) => i.uid !== id);
    if (it.path && it.kind !== "trader" && !deleted.some((d) => d.path === it.path)) deleted.push({ kind: it.kind, path: it.path });
    // Zuweisungen in NPCs aufräumen
    if (myId && (it.kind === "quest" || it.kind === "dialog")) {
      byKind("npc").forEach((n) => {
        let touched = false;
        ["Quests", "DailyPool", "Dialogs"].forEach((f) => {
          if (Array.isArray(n.json[f]) && n.json[f].indexOf(myId) > -1) {
            n.json[f] = n.json[f].filter((x) => x !== myId);
            touched = true;
          }
        });
        if (touched) n.dirty = true;
      });
    }
    persist();
    emit({ type: "remove", uid: id });
  }

  function clearAll() {
    if (EQE.Cfg) EQE.Cfg.clear();
    items = [];
    deleted = [];
    rootHandle = null;
    persist();
    emit({ type: "clear" });
  }

  // ---------------------------------------------------------------- Zuweisungen NPC <-> Quest/Dialog
  function npcsWith(field, id) {
    if (!id) return [];
    return byKind("npc").filter((n) => Array.isArray(n.json[field]) && n.json[field].indexOf(id) > -1);
  }
  function assign(npcUid, field, id) {
    mutate(npcUid, (j) => {
      if (!Array.isArray(j[field])) j[field] = [];
      if (j[field].indexOf(id) < 0) j[field].push(id);
    });
  }
  function unassign(npcUid, field, id) {
    mutate(npcUid, (j) => {
      if (Array.isArray(j[field])) j[field] = j[field].filter((x) => x !== id);
    });
  }

  // ---------------------------------------------------------------- Umbenennen: Referenzen mitziehen
  function walkReplaceKeys(obj, keyNames, oldId, newId) {
    let n = 0;
    if (Array.isArray(obj)) {
      obj.forEach((x) => (n += walkReplaceKeys(x, keyNames, oldId, newId)));
    } else if (obj && typeof obj === "object") {
      Object.keys(obj).forEach((k) => {
        if (keyNames.indexOf(k) > -1 && obj[k] === oldId) {
          obj[k] = newId;
          n++;
        } else if (typeof obj[k] === "object") {
          n += walkReplaceKeys(obj[k], keyNames, oldId, newId);
        }
      });
    }
    return n;
  }
  function walkReplaceText(obj, from, to) {
    let n = 0;
    if (Array.isArray(obj)) obj.forEach((x) => (n += walkReplaceText(x, from, to)));
    else if (obj && typeof obj === "object") {
      Object.keys(obj).forEach((k) => {
        if (typeof obj[k] === "string" && obj[k].indexOf(from) > -1) {
          obj[k] = obj[k].split(from).join(to);
          n++;
        } else if (typeof obj[k] === "object") n += walkReplaceText(obj[k], from, to);
      });
    }
    return n;
  }
  function replaceInArray(arr, oldId, newId) {
    let n = 0;
    if (Array.isArray(arr)) {
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] === oldId) {
          arr[i] = newId;
          n++;
        }
      }
    }
    return n;
  }

  /** (Datei-ID-Kinder werden über setFileId umbenannt.) */
  /** Eine ID wurde geändert: alle Verweise in den anderen Dateien auf die neue ID umstellen. */
  function renameRefs(kind, oldId, newId, selfUid) {
    if (!oldId || !newId || oldId === newId) return 0;
    let total = 0;
    items.forEach((it) => {
      if (it.uid === selfUid) return;
      let n = 0;
      const j = it.json;
      if (kind === "npc") {
        if (it.kind === "quest") n += walkReplaceKeys(j, ["NpcId", "TurnInNpcId", "ReputationLossNpcId"], oldId, newId);
        else if (it.kind === "npc") n += walkReplaceKeys([j.ReputationAllies, j.ReputationEnemies], ["NpcId"], oldId, newId);
        else if (it.kind === "dialog") {
          n += walkReplaceKeys(j, ["NpcId"], oldId, newId);
          n += walkReplaceText(j, "{rank:" + oldId + "}", "{rank:" + newId + "}");
        }
      } else if (kind === "quest") {
        if (it.kind === "npc") n += replaceInArray(j.Quests, oldId, newId) + replaceInArray(j.DailyPool, oldId, newId);
        else if (it.kind === "quest") n += replaceInArray(j.PreQuests, oldId, newId) + replaceInArray(j.NextQuests, oldId, newId);
      } else if (kind === "dialog") {
        if (it.kind === "npc") n += replaceInArray(j.Dialogs, oldId, newId);
        else if (it.kind === "dialog") {
          (j.Nodes || []).forEach((node) =>
            (node.Options || []).forEach((o) => {
              if (typeof o.Next === "string" && o.Next.indexOf(oldId + "/") === 0) {
                o.Next = newId + o.Next.slice(oldId.length);
                n++;
              }
            })
          );
        }
      } else if (kind === "stash") {
        if (it.kind === "quest") (j.Objectives || []).forEach((o) => {
          if (o.Params && o.Params.StashId === oldId) {
            o.Params.StashId = newId;
            n++;
          }
        });
      }
      if (n > 0) {
        it.dirty = true;
        total += n;
      }
    });
    if (total > 0) {
      persist();
      emit({ type: "refs" });
    }
    return total;
  }

  // ---------------------------------------------------------------- Projektweite Prüfung
  function deepFind(obj, keyNames, out) {
    if (Array.isArray(obj)) obj.forEach((x) => deepFind(x, keyNames, out));
    else if (obj && typeof obj === "object") {
      Object.keys(obj).forEach((k) => {
        if (keyNames.indexOf(k) > -1 && typeof obj[k] === "string" && obj[k]) out.push(obj[k]);
        else if (typeof obj[k] === "object") deepFind(obj[k], keyNames, out);
      });
    }
    return out;
  }
  function tokenNpcIds(obj, out) {
    if (Array.isArray(obj)) obj.forEach((x) => tokenNpcIds(x, out));
    else if (obj && typeof obj === "object") {
      Object.keys(obj).forEach((k) => {
        if (typeof obj[k] === "string") {
          const re = /\{rank:([^}]+)\}/g;
          let m;
          while ((m = re.exec(obj[k]))) out.push(m[1]);
        } else if (typeof obj[k] === "object") tokenNpcIds(obj[k], out);
      });
    }
    return out;
  }

  function crossCheck() {
    const issues = [];
    const push = (level, it, msg) => issues.push({ level, uid: it.uid, kind: it.kind, id: idOf(it), msg });
    const npcIds = new Set(ids("npc"));
    const questIds = new Set(ids("quest"));
    const dlgIds = new Set(ids("dialog"));
    const stashIds = new Set(ids("stash"));
    const offered = new Set();
    const assignedDialogs = new Set();
    const usedStashes = new Set();

    byKind("npc").forEach((it) => {
      const j = it.json;
      (j.Quests || []).forEach((q) => {
        offered.add(q);
        if (!questIds.has(q)) push("error", it, "Quest '" + q + "' (Quests) existiert nicht im Projekt.");
      });
      (j.DailyPool || []).forEach((q) => {
        offered.add(q);
        if (!questIds.has(q)) push("error", it, "Quest '" + q + "' (DailyPool) existiert nicht im Projekt.");
      });
      (j.Dialogs || []).forEach((d) => {
        assignedDialogs.add(d);
        if (!dlgIds.has(d)) push("error", it, "Dialog '" + d + "' existiert nicht im Projekt.");
      });
      const allies = (j.ReputationAllies || []).map((l) => l.NpcId);
      const enemies = (j.ReputationEnemies || []).map((l) => l.NpcId);
      allies.concat(enemies).forEach((n) => {
        if (n && !npcIds.has(n)) push("error", it, "Ruf-Verknüpfung verweist auf unbekannten NPC '" + n + "'.");
      });
      allies.forEach((n) => {
        if (n && enemies.indexOf(n) > -1) push("warn", it, "NPC '" + n + "' ist gleichzeitig Verbündeter und Rivale.");
      });
    });

    byKind("quest").forEach((it) => {
      const j = it.json;
      deepFind(j, ["NpcId", "TurnInNpcId", "ReputationLossNpcId"], []).forEach((n) => {
        if (!npcIds.has(n)) push("error", it, "NPC '" + n + "' existiert nicht im Projekt.");
      });
      (j.PreQuests || []).concat(j.NextQuests || []).forEach((q) => {
        if (!questIds.has(q)) push("warn", it, "Verkettete Quest '" + q + "' existiert nicht im Projekt.");
      });
      const spawnIds = new Set((j.Spawns || []).map((s) => s.SpawnId));
      (j.Objectives || []).forEach((o) => {
        const p = o.Params || {};
        if (p.StashId) {
          usedStashes.add(p.StashId);
          if (!stashIds.has(p.StashId)) push("error", it, "Objective '" + o.ObjectiveId + "': Stash '" + p.StashId + "' existiert nicht im Projekt.");
        }
        if (p.SpawnId && !spawnIds.has(p.SpawnId)) push("error", it, "Objective '" + o.ObjectiveId + "': SpawnId '" + p.SpawnId + "' ist in dieser Quest nicht definiert.");
      });
      if (npcIds.size > 0 && idOf(it) && !offered.has(idOf(it))) push("warn", it, "Wird von keinem NPC angeboten (weder Quests noch DailyPool).");
    });

    byKind("dialog").forEach((it) => {
      const j = it.json;
      const myId = idOf(it);
      if (npcIds.size > 0 && myId && !assignedDialogs.has(myId)) push("warn", it, "Ist keinem NPC zugewiesen (NPC-Feld 'Dialogs').");
      deepFind(j, ["NpcId"], []).concat(tokenNpcIds(j, [])).forEach((n) => {
        if (!npcIds.has(n)) push("error", it, "NPC '" + n + "' (Ruf) existiert nicht im Projekt.");
      });
      (j.Nodes || []).forEach((node) =>
        (node.Options || []).forEach((o) => {
          const t = o.Next || "";
          if (t.indexOf("/") > 0 && t[0] !== "@") {
            const [d, n] = t.split("/");
            const target = find("dialog", d);
            if (!target) push("error", it, "Knoten '" + node.NodeId + "': Ziel-Dialog '" + d + "' existiert nicht im Projekt.");
            else if (n && !(target.json.Nodes || []).some((x) => x.NodeId === n)) push("error", it, "Knoten '" + node.NodeId + "': Zielknoten '" + d + "/" + n + "' existiert nicht.");
          }
        })
      );
    });

    byKind("stash").forEach((it) => {
      const myId = idOf(it);
      if (byKind("quest").length > 0 && myId && !usedStashes.has(myId)) push("warn", it, "Wird von keiner Quest verwendet.");
    });

    // ---- Trader / Kategorien
    const tcatIds = new Set(ids("tcat"));
    const bcatIds = new Set(ids("bcat"));
    const currencyIds = new Set();
    byKind("tsettings").forEach((it) => (it.json.currency_list || []).forEach((c) => c && c.currency_id && currencyIds.add(c.currency_id)));
    const usedT = new Set();
    const usedB = new Set();
    byKind("trader").forEach((it) => {
      const j = it.json;
      (j.category_list_trader || []).forEach((c) => {
        usedT.add(c);
        if (tcatIds.size && !tcatIds.has(c)) push("error", it, "Handelskategorie '" + c + "' existiert nicht im Projekt (Datei trader_category_list/" + c + ".json).");
      });
      (j.category_list_barter || []).forEach((c) => {
        usedB.add(c);
        if (bcatIds.size && !bcatIds.has(c)) push("error", it, "Tauschkategorie '" + c + "' existiert nicht im Projekt (Datei barter_category_list/" + c + ".json).");
      });
      if (currencyIds.size && j.currency_id && !currencyIds.has(j.currency_id)) push("error", it, "Währung '" + j.currency_id + "' steht nicht in trader_main_setting.json.");
    });
    byKind("tcat").forEach((it) => {
      if (byKind("trader").length && idOf(it) && !usedT.has(idOf(it))) push("warn", it, "Wird von keinem Trader verwendet.");
    });
    byKind("bcat").forEach((it) => {
      if (byKind("trader").length && idOf(it) && !usedB.has(idOf(it))) push("warn", it, "Wird von keinem Trader verwendet.");
    });

    // ---- @trade im Dialog: Der Trader muss in der Nähe des Dialog-NPCs stehen (Trader-Mod: max. 8 m zum Spieler)
    const traderPos = byKind("trader").map((t) => ({ t, p: t.json.position })).filter((x) => Array.isArray(x.p) && x.p.length >= 3);
    byKind("npc").forEach((it) => {
      const usesTrade = (it.json.Dialogs || []).some((d) => {
        const di = find("dialog", d);
        return di && (di.json.Nodes || []).some((n) => (n.Options || []).some((o) => typeof o.Next === "string" && o.Next.indexOf("@trade") === 0));
      });
      if (!usesTrade) return;
      if (!traderPos.length) {
        if (byKind("trader").length || byKind("dialog").length) push("warn", it, "Ein Dialog öffnet mit @trade den Handel, aber es gibt keinen Trader im Projekt.");
        return;
      }
      const pp = String(it.json.Position || "").trim().split(/\s+/).map(Number);
      if (pp.length < 3 || pp.some(isNaN)) return;
      const near = traderPos.some((x) => Math.hypot(x.p[0] - pp[0], x.p[2] - pp[2]) <= 8);
      if (!near) push("warn", it, "Ein Dialog öffnet mit @trade den Handel, aber kein Trader steht innerhalb von 8 m um diesen NPC (der Trader-Mod prüft die Distanz).");
    });
    return issues;
  }

  // ---------------------------------------------------------------- Einlesen
  async function readEntries(entries) {
    const counts = {};
    KINDS.forEach((k) => (counts[k] = 0));
    const result = { counts, replaced: 0, unknown: [], errors: [], configs: 0 };
    for (const e of entries) {
      const name = e.path || e.file.name;
      if (EQE.CfgBin && EQE.CfgBin.isConfigSource(name)) {
        try {
          result.configs += await EQE.CfgBin.ingestFile(e.file, name);
        } catch (err) {
          result.errors.push(name + " (" + err.message + ")");
        }
        continue;
      }
      if (!/\.json$/i.test(name)) continue;
      let text;
      try {
        text = await e.file.text();
        text = text.replace(/^﻿/, "");
        const json = JSON.parse(text);
        const kind = classify(json, name);
        if (!kind) {
          result.unknown.push(name);
          continue;
        }
        if (kind === "traders_file") {
          json.Traders.forEach((t) => {
            if (!t || typeof t !== "object") return;
            const r = add("trader", t, { path: name });
            result.counts.trader++;
            if (r.replaced) result.replaced++;
          });
          continue;
        }
        const r = add(kind, json, { path: name, rawText: text });
        result.counts[kind]++;
        if (r.replaced) result.replaced++;
      } catch (err) {
        result.errors.push(name + " (" + err.message + ")");
      }
    }
    if (result.configs && EQE.Cfg) {
      EQE.Cfg.rebuild();
      if (EQE.Overrides) EQE.Overrides.afterIngest();
    }
    return result;
  }

  function entriesFromFileList(list) {
    return Array.from(list).map((f) => ({ file: f, path: f.webkitRelativePath || f.name }));
  }

  function readDirEntry(entry, path) {
    return new Promise((resolve) => {
      if (entry.isFile) {
        entry.file(
          (f) => resolve([{ file: f, path: path + entry.name }]),
          () => resolve([])
        );
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const all = [];
        const readBatch = () => {
          reader.readEntries(
            async (batch) => {
              if (!batch.length) {
                const nested = await Promise.all(all.map((c) => readDirEntry(c, path + entry.name + "/")));
                resolve([].concat(...nested));
              } else {
                all.push(...batch);
                readBatch();
              }
            },
            () => resolve([])
          );
        };
        readBatch();
      } else resolve([]);
    });
  }

  async function entriesFromDrop(dataTransfer) {
    const out = [];
    const list = dataTransfer.items ? Array.from(dataTransfer.items) : [];
    if (list.length && list[0].webkitGetAsEntry) {
      const entries = list.map((i) => i.webkitGetAsEntry()).filter((x) => x);
      for (const en of entries) out.push(...(await readDirEntry(en, "")));
      if (out.length) return out;
    }
    return entriesFromFileList(dataTransfer.files);
  }

  function summary(r) {
    const parts = [];
    KINDS.forEach((k) => {
      if (r.counts[k]) parts.push(r.counts[k] + " " + KIND_LABEL[k]);
    });
    if (r.configs) parts.push(r.configs + " config.cpp");
    let msg = parts.length ? parts.join(", ") + " geladen" : "Keine passenden Dateien gefunden";
    if (r.replaced) msg += " (" + r.replaced + " vorhandene ersetzt)";
    if (r.unknown.length) msg += " · " + r.unknown.length + " unbekannte übersprungen";
    if (r.errors.length) msg += " · " + r.errors.length + " fehlerhaft";
    return msg;
  }

  // ---------------------------------------------------------------- Export (ZIP, unkomprimiert)
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function buildZip(files) {
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const chunks = [];
    const central = [];
    let offset = 0;
    files.forEach((f) => {
      const name = enc.encode(f.name);
      const data = enc.encode(f.text);
      const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true);
      lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true);
      lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true);
      lh.setUint16(28, 0, true);
      chunks.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true);
      ch.setUint16(14, dosDate, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true);
      ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    });
    let centralSize = 0;
    central.forEach((c) => (centralSize += c.length));
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    return new Blob([].concat(chunks, central, [new Uint8Array(end.buffer)]), { type: "application/zip" });
  }

  /** Pfad relativ zum Profilordner, abgeleitet aus dem Upload-Pfad (z. B. "Quest/Test/x.json"). */
  function relFromPath(kind, path) {
    const folder = FOLDER[kind];
    const marker = FOLDER_MARKER[kind] || folder.split("/").pop();
    const segs = String(path).split("/").filter((x) => x);
    const idx = segs.findIndex((s) => s.toLowerCase() === marker.toLowerCase());
    if (idx > -1 && idx < segs.length - 1) return folder + "/" + segs.slice(idx + 1).join("/");
    return folder + "/" + segs[segs.length - 1];
  }

  function exportPath(item) {
    const folder = FOLDER[item.kind];
    const fileBased = FILEID_KINDS.indexOf(item.kind) > -1;
    if (item.path && !(fileBased && item.fileId && fileIdFromPath(item.path) !== item.fileId)) return relFromPath(item.kind, item.path);
    if (item.kind === "trader") return folder + "/Traders_list.json";
    return folder + "/" + (idOf(item) || "unbenannt") + ".json";
  }

  /** Ordner oberhalb des Profil-Unterordners (z. B. "profiles/ExodusQuests") einer geladenen Datei. */
  function prefixOf(item) {
    const n = relFromPath(item.kind, item.path).split("/").length;
    const segs = item.path.split("/").filter((x) => x);
    return segs.slice(0, Math.max(0, segs.length - n)).join("/");
  }

  /** Voller Zielpfad im hochgeladenen Projektordner (inkl. Wurzelordner). */
  function targetPath(item) {
    const rel = exportPath(item);
    if (item.path && relFromPath(item.kind, item.path) === rel) return item.path;
    const top = rel.split("/")[0];
    const src = (item.path ? [item] : []).concat(
      items.filter((i) => i.path && FOLDER[i.kind].split("/")[0] === top),
      items.filter((i) => i.path)
    );
    const prefix = src.length ? prefixOf(src[0]) : "";
    return prefix ? prefix + "/" + rel : rel;
  }

  /** Alles, was beim Export gelöscht werden soll: im Tool gelöschte und umbenannte Dateien. */
  function pendingDeletes() {
    const writes = new Set();
    items.forEach((it) => writes.add(targetPath(it).toLowerCase()));
    const out = [];
    const seen = new Set();
    const push = (path, kind) => {
      const key = path.toLowerCase();
      if (writes.has(key) || seen.has(key)) return;
      seen.add(key);
      out.push({ path, rel: relFromPath(kind, path), kind });
    };
    deleted.forEach((d) => push(d.path, d.kind));
    items.forEach((it) => {
      if (it.kind !== "trader" && it.path && targetPath(it) !== it.path) push(it.path, it.kind);
    });
    return out;
  }

  function exportText(item) {
    if (!isChanged(item) && item.rawText) return item.rawText;
    return JSON.stringify(item.json, null, 2) + "\n";
  }

  function exportZip(onlyChanged) {
    const used = new Set();
    const files = [];
    // Alle Trader gehören in EINE Datei (Traders_list.json)
    const traders = byKind("trader");
    if (traders.length && (!onlyChanged || traders.some(isChanged))) {
      files.push({ name: exportPath(traders[0]), text: JSON.stringify({ Traders: traders.map((t) => t.json) }, null, 2) + "\n" });
      used.add(exportPath(traders[0]).toLowerCase());
    }
    items.forEach((it) => {
      if (it.kind === "trader") return;
      if (onlyChanged && !isChanged(it)) return;
      let name = exportPath(it);
      while (used.has(name.toLowerCase())) name = name.replace(/\.json$/i, "") + "_" + it.uid.slice(-3) + ".json";
      used.add(name.toLowerCase());
      files.push({ name, text: exportText(it) });
    });
    extras.forEach((x) => x.zipFiles(onlyChanged).forEach((f) => files.push(f)));
    const extraCount = files.length;
    const dels = pendingDeletes();
    if (dels.length) {
      const nl = "\r\n";
      files.push({
        name: "_LOESCHEN.txt",
        text: "Diese Dateien wurden im Editor gelöscht/umbenannt und sollen im Profilordner entfernt werden:" + nl + dels.map((d) => d.rel).join(nl) + nl,
      });
      files.push({
        name: "_loeschen.bat",
        text:
          "@echo off" + nl +
          "REM Im Profilordner ausfuehren (dort, wo Quest/ NPC/ Dialog/ Stash/ liegen). Loescht die im Editor entfernten Dateien." + nl +
          "chcp 65001 >nul" + nl +
          dels.map((d) => { const w = d.rel.replace(/\//g, "\\"); return 'if exist "' + w + '" del "' + w + '"'; }).join(nl) + nl +
          "echo Fertig." + nl + "pause" + nl,
      });
    }
    return { blob: buildZip(files), count: files.length - (dels.length ? 2 : 0), deletes: dels.length, extra: extraCount };
  }

  // ---------------------------------------------------------------- Direkt in den Projektordner speichern
  const canWriteFolder = () => typeof window.showDirectoryPicker === "function";

  async function dirFor(root, segs, create) {
    let d = root;
    for (const seg of segs) d = await d.getDirectoryHandle(seg, { create });
    return d;
  }

  /** Geänderte Dateien in den Projektordner schreiben und gelöschte entfernen (Chromium: File System Access API). */
  /** Wurzelordner des Projekts (erstes Pfadsegment der geladenen Dateien bzw. Name des verbundenen Ordners). */
  function projectRootName(handle) {
    if (handle && handle.name && (handle === rootHandle || !items.length)) {
      const sample = items.find((i) => i.path && i.path.indexOf("/") > -1);
      if (!sample || sample.path.split("/")[0] === handle.name) return handle.name;
    }
    const paths = items.filter((i) => i.path).map((i) => i.path);
    extras.forEach((x) => x.paths().forEach((p) => paths.push(p)));
    const firsts = paths.filter((p) => p.indexOf("/") > -1).map((p) => p.split("/")[0]);
    return firsts.length && firsts.every((f) => f === firsts[0]) ? firsts[0] : null;
  }

  async function saveToFolder() {
    if (!canWriteFolder()) {
      EQE.toast("Dein Browser kann nicht direkt in Ordner schreiben – bitte Chrome/Edge nutzen oder das ZIP verwenden.", true);
      return null;
    }
    const changed = items.filter((i) => i.kind !== "trader" && isChanged(i));
    const traders = byKind("trader");
    const traderChanged = traders.length > 0 && traders.some(isChanged);
    const dels = pendingDeletes();
    const extraChanged = extras.some((x) => x.changedCount() > 0);
    if (!changed.length && !traderChanged && !dels.length && !extraChanged) {
      EQE.toast("Nichts zu speichern – es gibt keine Änderungen.", true);
      return null;
    }
    let root = rootHandle;
    try {
      if (root && (await root.requestPermission({ mode: "readwrite" })) !== "granted") root = null;
    } catch (e) {
      root = null;
    }
    if (!root) {
      try {
        root = await window.showDirectoryPicker({ mode: "readwrite", id: "eqe-project" });
      } catch (e) {
        return null; // abgebrochen
      }
    }
    const rootName = projectRootName(root);
    if (rootName && root.name !== rootName) {
      if (root !== rootHandle && !window.confirm('Du hast den Ordner "' + root.name + '" gewählt, hochgeladen wurde aber "' + rootName + '". Trotzdem dort speichern?')) return null;
    }
    const writes = changed.map((it) => ({ group: [it], path: targetPath(it), text: exportText(it) }));
    if (traderChanged) writes.push({ group: traders, path: targetPath(traders[0]), text: JSON.stringify({ Traders: traders.map((t) => t.json) }, null, 2) + "\n" });
    extras.forEach((x) => x.fileWrites({ rootName: rootName }).forEach((w) => writes.push({ group: [], path: w.path, text: w.text, onDone: w.onDone })));
    const more = (n) => (n > 12 ? "\n… (+" + (n - 12) + ")" : "");
    const msg =
      writes.length + " Datei(en) schreiben, " + dels.length + " löschen in \"" + root.name + '":\n\n' +
      writes.slice(0, 12).map((w) => "+ " + w.path).join("\n") + more(writes.length) +
      (dels.length ? "\n\n" + dels.slice(0, 12).map((d) => "– " + d.path).join("\n") + more(dels.length) : "") +
      "\n\nFortfahren?";
    if (!window.confirm(msg)) return null;
    rootHandle = root;

    const rel = (p) => {
      const segs = p.split("/").filter((x) => x);
      if (rootName && segs[0] === rootName) segs.shift();
      return segs;
    };
    let okW = 0;
    let okD = 0;
    const errors = [];
    const failedDel = new Set();
    for (const w of writes) {
      try {
        const segs = rel(w.path);
        const name = segs.pop();
        const dir = await dirFor(root, segs, true);
        const fh = await dir.getFileHandle(name, { create: true });
        const ws = await fh.createWritable();
        await ws.write(w.text);
        await ws.close();
        w.group.forEach((it) => {
          it.rawText = it.kind === "trader" ? null : w.text;
          it.isNew = false;
          it.dirty = false;
          it.path = w.path;
        });
        if (w.onDone) w.onDone();
        okW++;
      } catch (e) {
        errors.push(w.path + ": " + (e && e.message));
      }
    }
    for (const d of dels) {
      try {
        const segs = rel(d.path);
        const name = segs.pop();
        const dir = await dirFor(root, segs, false);
        await dir.removeEntry(name);
        okD++;
      } catch (e) {
        if (e && e.name === "NotFoundError") okD++; // schon weg
        else {
          failedDel.add(d.path);
          errors.push(d.path + ": " + (e && e.message));
        }
      }
    }
    deleted = deleted.filter((d) => failedDel.has(d.path));
    persist();
    emit({ type: "saved" });
    EQE.toast(okW + " geschrieben, " + okD + " gelöscht" + (errors.length ? " – " + errors.length + " Fehler: " + errors[0] : "."), errors.length > 0);
    return { written: okW, deleted: okD, errors };
  }

  function downloadZip(onlyChanged) {
    const r = exportZip(onlyChanged);
    if (!r.count && !r.deletes) {
      EQE.toast(onlyChanged ? "Nichts geändert – es gibt nichts zu exportieren." : "Das Projekt ist leer.", true);
      return;
    }
    const url = URL.createObjectURL(r.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = onlyChanged ? "exodus-quests-geaendert.zip" : "exodus-quests-projekt.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    EQE.toast(r.count + " Datei(en) exportiert" + (r.deletes ? ", " + r.deletes + " zum Löschen (siehe _LOESCHEN.txt / _loeschen.bat im ZIP)." : "."));
  }

  // ---------------------------------------------------------------- Datei-Dialoge
  async function walkHandle(dir, prefix, out) {
    for await (const [name, h] of dir.entries()) {
      if (h.kind === "directory") await walkHandle(h, prefix + name + "/", out);
      else if (/\.json$/i.test(name) || /^config\.(cpp|bin)$/i.test(name) || /\.pbo$/i.test(name)) {
        try {
          out.push({ file: await h.getFile(), path: prefix + name });
        } catch (e) {
          /* überspringen */
        }
      }
    }
  }

  async function pickWithHandle() {
    let dir;
    try {
      dir = await window.showDirectoryPicker({ mode: "readwrite", id: "eqe-project" });
    } catch (e) {
      return; // abgebrochen
    }
    rootHandle = dir;
    const entries = [];
    await walkHandle(dir, dir.name + "/", entries);
    const r = await readEntries(entries);
    EQE.toast(summary(r) + " – Ordner verbunden, Speichern schreibt direkt dorthin.", !KINDS.some((k) => r.counts[k]));
    emit({ type: "ingest", result: r });
  }

  function pick(folder) {
    if (folder && canWriteFolder()) return pickWithHandle();
    const input = document.createElement("input");
    input.type = "file";
    if (folder) {
      input.webkitdirectory = true;
    } else {
      input.multiple = true;
      input.accept = ".json,application/json";
    }
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", async () => {
      const r = await readEntries(entriesFromFileList(input.files));
      input.remove();
      EQE.toast(summary(r), !KINDS.some((k) => r.counts[k]));
      emit({ type: "ingest", result: r });
    });
    input.click();
  }

  async function ingestDrop(dataTransfer) {
    try {
      const its = Array.from(dataTransfer.items || []);
      if (its.length === 1 && its[0].getAsFileSystemHandle) {
        const hd = await its[0].getAsFileSystemHandle();
        if (hd && hd.kind === "directory") rootHandle = hd;
      }
    } catch (e) {
      /* kein Handle – dann beim Speichern nachfragen */
    }
    const entries = await entriesFromDrop(dataTransfer);
    const r = await readEntries(entries);
    EQE.toast(summary(r), !KINDS.some((k) => r.counts[k]));
    emit({ type: "ingest", result: r });
    return r;
  }

  /** Einzelnes JSON aus Text (Einfügen): Typ erkennen, ins Projekt aufnehmen. */
  function ingestText(text) {
    const json = JSON.parse(text.replace(/^﻿/, ""));
    const kind = classify(json, "");
    if (!kind) throw new Error("Unbekanntes Format (weder Quest, NPC, Dialog, Stash noch Trader/Kategorie).");
    if (kind === "traders_file") throw new Error("Das ist eine komplette Traders_list.json - bitte über Dateien laden einlesen.");
    const r = add(kind, json, { rawText: null, fileId: FILEID_KINDS.indexOf(kind) > -1 ? uniqueId(kind, "eingefuegt") : undefined });
    r.item.dirty = true;
    return { kind, item: r.item, replaced: r.replaced };
  }

  load();

  EQE.Project = {
    KINDS,
    ID_KEY,
    FOLDER,
    KIND_LABEL,
    items: () => items,
    on: (f) => listeners.push(f),
    classify,
    idOf,
    nameOf,
    labelOf,
    isChanged,
    byKind,
    get,
    find,
    ids,
    options,
    add,
    create,
    setFileId,
    FILEID_KINDS,
    MAP_KINDS,
    uniqueId,
    setJson,
    mutate,
    remove,
    clearAll,
    npcsWith,
    assign,
    unassign,
    renameRefs,
    crossCheck,
    pick,
    ingestDrop,
    ingestText,
    exportZip,
    downloadZip,
    exportPath,
    changedCount: () => items.filter(isChanged).length + pendingDeletes().length + extras.reduce((n, x) => n + x.changedCount(), 0),
    registerExtra: (x) => extras.push(x),
    notify: () => emit({ type: "extra" }),
    buildZip: buildZip,
    pendingDeletes,
    targetPath,
    canWriteFolder,
    saveToFolder,
    hasFolder: () => !!rootHandle,
  };
})(window.EQE);
