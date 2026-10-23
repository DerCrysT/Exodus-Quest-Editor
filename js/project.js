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

  const KINDS = ["quest", "npc", "dialog", "stash"];
  const ID_KEY = { quest: "QuestId", npc: "NpcId", dialog: "DialogId", stash: "StashId" };
  const NAME_KEY = { quest: "Title", npc: "Name", dialog: "Title", stash: "Mode" };
  const FOLDER = { quest: "Quest", npc: "NPC", dialog: "Dialog", stash: "Stash" };
  const KIND_LABEL = { quest: "Quest", npc: "NPC", dialog: "Dialog", stash: "Stash" };
  const STORE_KEY = "eqe:project:v1";

  let items = [];
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
    } catch (e) {
      items = [];
    }
  }

  function uid() {
    return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /** Dateityp an der Struktur erkennen; null = unbekannt (z. B. Config.json, Spielerdaten). */
  function classify(j) {
    if (!j || typeof j !== "object" || Array.isArray(j)) return null;
    if (typeof j.DialogId === "string" && Array.isArray(j.Nodes)) return "dialog";
    if (typeof j.QuestId === "string" && (Array.isArray(j.Objectives) || j.QuestType !== undefined)) return "quest";
    if (typeof j.StashId === "string") return "stash";
    if (typeof j.NpcId === "string" && (j.Name !== undefined || j.Position !== undefined)) return "npc";
    return null;
  }

  function idOf(item) {
    const v = item.json[ID_KEY[item.kind]];
    return typeof v === "string" ? v : "";
  }
  function nameOf(item) {
    const v = item.json[NAME_KEY[item.kind]];
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
    const id = typeof json[ID_KEY[kind]] === "string" ? json[ID_KEY[kind]] : "";
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

  function create(kind, json) {
    return add(kind, json, { isNew: true }).item;
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
    items = [];
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
    return issues;
  }

  // ---------------------------------------------------------------- Einlesen
  async function readEntries(entries) {
    const result = { counts: { quest: 0, npc: 0, dialog: 0, stash: 0 }, replaced: 0, unknown: [], errors: [] };
    for (const e of entries) {
      const name = e.path || e.file.name;
      if (!/\.json$/i.test(name)) continue;
      let text;
      try {
        text = await e.file.text();
        text = text.replace(/^﻿/, "");
        const json = JSON.parse(text);
        const kind = classify(json);
        if (!kind) {
          result.unknown.push(name);
          continue;
        }
        const r = add(kind, json, { path: name, rawText: text });
        result.counts[kind]++;
        if (r.replaced) result.replaced++;
      } catch (err) {
        result.errors.push(name + " (" + err.message + ")");
      }
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
      if (r.counts[k]) parts.push(r.counts[k] + " " + KIND_LABEL[k] + (r.counts[k] === 1 ? "" : "s"));
    });
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

  function exportPath(item) {
    const folder = FOLDER[item.kind];
    if (item.path) {
      const segs = item.path.split("/").filter((x) => x);
      const idx = segs.findIndex((s) => s.toLowerCase() === folder.toLowerCase());
      if (idx > -1 && idx < segs.length - 1) return folder + "/" + segs.slice(idx + 1).join("/");
      return folder + "/" + segs[segs.length - 1];
    }
    return folder + "/" + (idOf(item) || "unbenannt") + ".json";
  }

  function exportText(item) {
    if (!isChanged(item) && item.rawText) return item.rawText;
    return JSON.stringify(item.json, null, 2) + "\n";
  }

  function exportZip(onlyChanged) {
    const used = new Set();
    const files = [];
    items.forEach((it) => {
      if (onlyChanged && !isChanged(it)) return;
      let name = exportPath(it);
      while (used.has(name.toLowerCase())) name = name.replace(/\.json$/i, "") + "_" + it.uid.slice(-3) + ".json";
      used.add(name.toLowerCase());
      files.push({ name, text: exportText(it) });
    });
    return { blob: buildZip(files), count: files.length };
  }

  // ---------------------------------------------------------------- Datei-Dialoge
  function pick(folder) {
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
      EQE.toast(summary(r), !(r.counts.quest + r.counts.npc + r.counts.dialog + r.counts.stash));
      emit({ type: "ingest", result: r });
    });
    input.click();
  }

  async function ingestDrop(dataTransfer) {
    const entries = await entriesFromDrop(dataTransfer);
    const r = await readEntries(entries);
    EQE.toast(summary(r), !(r.counts.quest + r.counts.npc + r.counts.dialog + r.counts.stash));
    emit({ type: "ingest", result: r });
    return r;
  }

  /** Einzelnes JSON aus Text (Einfügen): Typ erkennen, ins Projekt aufnehmen. */
  function ingestText(text) {
    const json = JSON.parse(text.replace(/^﻿/, ""));
    const kind = classify(json);
    if (!kind) throw new Error("Unbekanntes Format (weder Quest, NPC, Dialog noch Stash).");
    const r = add(kind, json, { rawText: null });
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
    exportPath,
    changedCount: () => items.filter(isChanged).length,
  };
})(window.EQE);
