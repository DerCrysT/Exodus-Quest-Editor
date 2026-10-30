/**
 * Exodus Editor – Dialog-Editor (Dialog/*.json).
 */
window.EQE = window.EQE || {};

(function (EQE) {
  "use strict";
  const { h, clear, field, section, listEditor, repRangeEditor, validateRepRange, renderJson, renderIssues, toast, copyText, download, openModal, closeModal, saveDraft, loadDraft } = EQE;

  function defaultDialog() {
    return { DialogId: "", Title: "", Start: "start", Nodes: [defaultNode("start")] };
  }
  function defaultNode(id) {
    return { NodeId: id || "", OnEnter: "", Lines: [defaultLine()], Options: [defaultOption()] };
  }
  function defaultLine() {
    return { Speaker: "NPC", Text: "", Requires: "" };
  }
  function defaultOption() {
    return { Text: "", Next: "", Requires: "" };
  }

  const st = { data: null };
  let preview = () => {};
  const NPC_KEY = "eqe:dlg:npc";
  let npcFilter = "";
  try {
    npcFilter = localStorage.getItem(NPC_KEY) || "";
  } catch (e) {
    /* egal */
  }

  function npcOfFilter() {
    return npcFilter && npcFilter !== "__none" ? EQE.Project.get(npcFilter) : null;
  }

  function init(root) {
    return EQE.createEditor({
      kind: "dialog",
      root,
      title: "Dialog",
      itemFilter: (item) => {
        if (!npcFilter) return true;
        const id = EQE.Project.idOf(item);
        if (npcFilter === "__none") return EQE.Project.npcsWith("Dialogs", id).length === 0;
        const npc = EQE.Project.get(npcFilter);
        return !!npc && Array.isArray(npc.json.Dialogs) && npc.json.Dialogs.indexOf(id) > -1;
      },
      defaultJson: () => {
        const npc = npcOfFilter();
        const base = npc ? "dlg_" + EQE.Project.idOf(npc).replace(/^npc_/, "") : "dlg_new";
        const j = buildOutput(defaultDialog());
        j.DialogId = EQE.Project.uniqueId("dialog", base);
        return j;
      },
      afterCreate: (item) => {
        const npc = npcOfFilter();
        if (npc) {
          EQE.Project.assign(npc.uid, "Dialogs", EQE.Project.idOf(item));
          EQE.toast("Dialog dem NPC '" + EQE.Project.idOf(npc) + "' zugewiesen.");
        }
      },
      header: buildNpcBar,
      fromJson,
      toJson: buildOutput,
      buildForm,
      validate: validateDialog,
      status: (d) => (d.DialogId || "(ohne Id)") + " · " + d.Nodes.length + " Knoten",
      ingame: { label: "Ingame-Vorschau", render: renderIngame },
    });
  }

  /** Auswahl „Dialoge für NPC“ über dem Formular. */
  function buildNpcBar(api) {
    const sel = h("select", {
      class: "item-select",
      onchange: (e) => {
        npcFilter = e.target.value;
        try {
          localStorage.setItem(NPC_KEY, npcFilter);
        } catch (err) {
          /* egal */
        }
        api.reload();
        renderInfo();
      },
    });
    const info = h("span", { class: "help npc-info" });
    function renderInfo() {
      const npc = npcOfFilter();
      if (npc) {
        const n = (npc.json.Dialogs || []).length;
        info.textContent = (npc.json.Name || "") + " · " + n + " Dialog" + (n === 1 ? "" : "e") + (n > 1 ? " → Themenliste" : "");
      } else info.textContent = npcFilter === "__none" ? "Dialoge ohne NPC-Zuweisung" : "";
    }
    function fill() {
      clear(sel);
      sel.appendChild(h("option", { value: "", selected: npcFilter === "", text: "— alle Dialoge —" }));
      EQE.Project.byKind("npc").forEach((n) => {
        const c = (n.json.Dialogs || []).length;
        sel.appendChild(h("option", { value: n.uid, selected: npcFilter === n.uid, text: EQE.Project.labelOf(n) + (n.json.Name ? " – " + n.json.Name : "") + " (" + c + ")" }));
      });
      sel.appendChild(h("option", { value: "__none", selected: npcFilter === "__none", text: "— keinem NPC zugewiesen —" }));
      renderInfo();
    }
    fill();
    EQE.Project.on((ev) => {
      if (ev.type !== "json") fill();
    });
    return h("div", { class: "toolbar npc-bar" }, [h("span", { class: "bar-label", text: "Dialoge für NPC:" }), sel, info, h("span", { class: "spacer" }), h("span", { class: "help", text: "„Neu“ legt den Dialog direkt für diesen NPC an." })]);
  }

  function normalizeRepRange(r) {
    return r ? Object.assign({ NpcId: "", MinRank: "", MaxRank: "", Min: undefined, Max: undefined }, r) : undefined;
  }

  function fromJson(obj) {
    const d = Object.assign(defaultDialog(), obj);
    d.Nodes = (obj.Nodes || []).map((n) => {
      const node = Object.assign(defaultNode(""), n);
      node.Lines = (n.Lines || []).map((l) => Object.assign(defaultLine(), l));
      node.Options = (n.Options || []).map((o) => Object.assign(defaultOption(), o));
      if (n.Reputation) node.Reputation = normalizeRepRange(n.Reputation);
      else delete node.Reputation;
      node.Lines.forEach((l) => {
        if (l.Reputation) l.Reputation = normalizeRepRange(l.Reputation);
        else delete l.Reputation;
      });
      node.Options.forEach((o) => {
        if (o.Reputation) o.Reputation = normalizeRepRange(o.Reputation);
        else delete o.Reputation;
      });
      return node;
    });
    if (obj.Reputation) d.Reputation = normalizeRepRange(obj.Reputation);
    else delete d.Reputation;
    return d;
  }

  /** Vorschläge für das Feld „Next“: eigene Knoten, Sonderziele und Knoten anderer Dialoge. */
  function nextSuggestions() {
    const list = [];
    (st.data.Nodes || []).forEach((n) => n.NodeId && list.push({ value: n.NodeId, label: n.NodeId + " (dieser Dialog)" }));
    list.push({ value: "@quests", label: "@quests – Questboard öffnen" });
    list.push({ value: "@trade", label: "@trade – Handelsfenster öffnen" });
    list.push({ value: "@topics", label: "@topics – zurück zur Themenliste" });
    EQE.Project.byKind("dialog").forEach((it) => {
      const did = EQE.Project.idOf(it);
      if (!did || did === st.data.DialogId) return;
      (it.json.Nodes || []).forEach((n) => list.push({ value: did + "/" + n.NodeId, label: did + "/" + n.NodeId + " (anderer Dialog)" }));
    });
    return list;
  }

  function buildForm(d, ctx) {
    st.data = d;
    preview = ctx.changed;
    const form = ctx.form;
    let assignSec = null;

    form.appendChild(
      section("Grunddaten", "", [
        h("div", { class: "grid3" }, [
          field({ label: "DialogId", key: "DialogId", obj: d, type: "text", required: true, help: "Beim Umbenennen werden NPC-Zuweisungen und Verweise anderer Dialoge mitgezogen.", onChange: () => { assignSec && assignSec._render(); preview(); } }),
          field({ label: "Title", key: "Title", obj: d, type: "text", help: "Bezeichnung in der Themenliste, falls der NPC mehrere Dialoge hat.", onChange: preview }),
          field({ label: "Start", key: "Start", obj: d, type: "text", required: true, help: "NodeId des Startknotens.", onChange: preview }),
        ]),
      ])
    );

    assignSec = EQE.assignSection("Zuweisung an NPCs", "Welche NPCs bieten diesen Dialog über „Sprechen“ an?", () => d.DialogId, [{ field: "Dialogs", label: "Dialog von" }]);
    form.appendChild(assignSec);

    form.appendChild(
      section(
        "Ruf-Bedingung (optional)",
        "Dieser Dialog ist nur in diesem Ruf-Bereich verfügbar",
        [repRangeEditor(d, "Reputation", { label: "Dialog nur in diesem Ruf-Bereich", hint: "NpcId leer = der NPC, mit dem gesprochen wird.", onChange: preview })],
        { collapsed: !d.Reputation }
      )
    );

    form.appendChild(section("Knoten (Nodes)", "Jeder Knoten hat Gesprächszeilen und Antwortoptionen", [buildNodesList(d)]));

  }

  function buildNodesList(d) {
    return listEditor({
      items: d.Nodes,
      makeItem: () => defaultNode("node_" + (d.Nodes.length + 1)),
      title: (n) => n.NodeId || "(ohne Id)",
      badge: (n) => (n.NodeId === d.Start ? "Start" : null),
      addLabel: "+ Knoten hinzufügen",
      emptyLabel: "Noch keine Knoten.",
      renderCard: renderNodeCard,
      onChange: preview,
    });
  }

  function renderNodeCard(n, index, api) {
    const nodes = [];
    nodes.push(
      h("div", { class: "grid2" }, [
        field({ label: "NodeId", key: "NodeId", obj: n, type: "text", required: true, onChange: () => { api.refreshTitle(); preview(); } }),
        field({
          label: "OnEnter",
          key: "OnEnter",
          obj: n,
          type: "select",
          options: [
            { value: "", label: "(keine Aktion)" },
            { value: "TurnBack", label: "TurnBack – offene StartItems dieses NPCs zurückgeben" },
          ],
          onChange: preview,
        }),
      ])
    );
    nodes.push(repRangeEditor(n, "Reputation", { label: "Knoten nur in diesem Ruf-Bereich erreichbar", onChange: preview }));

    nodes.push(
      h("div", { class: "field" }, [
        h("label", {}, "Lines (Gesprächsverlauf)"),
        listEditor({
          items: n.Lines,
          makeItem: defaultLine,
          title: (l) => "[" + (l.Speaker || "NPC") + "] " + (l.Text ? l.Text.slice(0, 40) : "(leer)"),
          badge: (l) => (l.Requires ? l.Requires : null),
          addLabel: "+ Zeile hinzufügen",
          emptyLabel: "Keine Zeilen.",
          renderCard: (l, li, lapi) => [
            h("div", { class: "grid3" }, [
              field({ label: "Speaker", key: "Speaker", obj: l, type: "text", placeholder: "NPC / Player / eigener Name", datalist: ["NPC", "Player"], onChange: () => { lapi.refreshTitle(); preview(); } }),
              field({ label: "Requires", key: "Requires", obj: l, type: "select", options: EQE.REQUIRES_VALUES, onChange: preview }),
            ]),
            field({ label: "Text", key: "Text", obj: l, type: "textarea", help: "{player}, {npc}, {rank}, {rank:npcId} werden ersetzt. Auch #STR_... möglich.", onChange: () => { lapi.refreshTitle(); preview(); } }),
            repRangeEditor(l, "Reputation", { label: "Zeile nur in diesem Ruf-Bereich", onChange: preview }),
          ],
          onChange: preview,
        }),
      ])
    );

    nodes.push(
      h("div", { class: "field" }, [
        h("label", {}, "Options (Antworten)"),
        listEditor({
          items: n.Options,
          makeItem: defaultOption,
          title: (o) => o.Text || "(ohne Text)",
          badge: (o) => (o.Next === "" ? "beendet" : o.Next),
          addLabel: "+ Option hinzufügen",
          emptyLabel: "Keine Optionen – ohne Optionen erscheint automatisch „Das war alles für jetzt“.",
          renderCard: (o, oi, oapi) => [
            field({ label: "Text", key: "Text", obj: o, type: "text", onChange: () => { oapi.refreshTitle(); preview(); } }),
            h("div", { class: "grid2" }, [
              nextField(o, oapi),
              field({ label: "Requires", key: "Requires", obj: o, type: "select", options: EQE.REQUIRES_VALUES, onChange: preview }),
            ]),
            repRangeEditor(o, "Reputation", { label: "Option nur in diesem Ruf-Bereich sichtbar", onChange: preview }),
          ],
          onChange: preview,
        }),
      ])
    );
    return nodes;
  }

  function nextField(o, oapi) {
    const f = field({
      label: "Next",
      key: "Next",
      obj: o,
      type: "text",
      datalist: nextSuggestions,
      help: "Leer beendet das Gespräch. Knoten, @quests, @trade, @topics oder „dialogId/knotenId“ – Vorschläge per Klick ins Feld.",
      onChange: () => {
        oapi.refreshTitle();
        preview();
      },
    });
    f.addEventListener("focusin", () => {
      const dl = f.querySelector("datalist");
      if (!dl) return;
      clear(dl);
      nextSuggestions().forEach((x) => dl.appendChild(h("option", { value: x.value, label: x.label })));
    });
    return f;
  }

  function cleanRepRange(r) {
    if (!r) return undefined;
    const o = {};
    if (r.NpcId) o.NpcId = r.NpcId;
    if (r.MinRank) o.MinRank = r.MinRank;
    else if (r.Min) o.Min = r.Min;
    if (r.MaxRank) o.MaxRank = r.MaxRank;
    else if (r.Max) o.Max = r.Max;
    return Object.keys(o).length ? o : undefined;
  }

  function buildOutput(d) {
    const out = { DialogId: d.DialogId || "" };
    if (d.Title) out.Title = d.Title;
    out.Start = d.Start || "start";
    out.Nodes = (d.Nodes || []).map((n) => {
      const nn = { NodeId: n.NodeId || "" };
      const rep = cleanRepRange(n.Reputation);
      if (rep) nn.Reputation = rep;
      if (n.OnEnter) nn.OnEnter = n.OnEnter;
      nn.Lines = (n.Lines || [])
        .filter((l) => l.Text || l.Requires || l.Reputation)
        .map((l) => {
          const ll = { Speaker: l.Speaker || "NPC", Text: l.Text || "" };
          const lrep = cleanRepRange(l.Reputation);
          if (lrep) ll.Reputation = lrep;
          if (l.Requires) ll.Requires = l.Requires;
          return ll;
        });
      nn.Options = (n.Options || []).map((o) => {
        const oo = { Text: o.Text || "", Next: o.Next || "" };
        const orep = cleanRepRange(o.Reputation);
        if (orep) oo.Reputation = orep;
        if (o.Requires) oo.Requires = o.Requires;
        return oo;
      });
      return nn;
    });
    const drep = cleanRepRange(d.Reputation);
    if (drep) out.Reputation = drep;
    return out;
  }

  function validateDialog(d) {
    const issues = [];
    const err = (m) => issues.push({ level: "error", msg: m });
    const warn = (m) => issues.push({ level: "warn", msg: m });
    if (!d.DialogId) err("DialogId fehlt.");
    if (!d.Nodes || d.Nodes.length === 0) err("Keine Knoten vorhanden.");
    const ids = new Set();
    (d.Nodes || []).forEach((n, i) => {
      if (!n.NodeId) err("Knoten #" + (i + 1) + ": NodeId fehlt.");
      else if (ids.has(n.NodeId)) err("NodeId '" + n.NodeId + "' mehrfach vorhanden.");
      ids.add(n.NodeId);
      (n.Options || []).forEach((o) => {
        if (!o.Text) warn("Knoten '" + n.NodeId + "': Option ohne Text.");
      });
    });
    if (!ids.has(d.Start)) err("Startknoten '" + d.Start + "' existiert nicht unter den Knoten.");
    (d.Nodes || []).forEach((n) => {
      (n.Options || []).forEach((o) => {
        const target = o.Next || "";
        if (target === "" || target[0] === "@") return;
        if (target.indexOf("/") > -1) return; // Verweis auf anderen Dialog – kann hier nicht geprüft werden
        if (!ids.has(target)) err("Knoten '" + n.NodeId + "': Option verweist auf unbekannten Knoten '" + target + "'.");
      });
    });
    EQE.validateRepRange(d.Reputation, "Reputation").forEach(err);
    (d.Nodes || []).forEach((n) => {
      EQE.validateRepRange(n.Reputation, "Knoten '" + n.NodeId + "'").forEach(err);
      (n.Lines || []).forEach((l) => EQE.validateRepRange(l.Reputation, "Knoten '" + n.NodeId + "' (Zeile)").forEach(err));
      (n.Options || []).forEach((o) => EQE.validateRepRange(o.Reputation, "Knoten '" + n.NodeId + "' (Option)").forEach(err));
    });
    return issues;
  }


  // ---------------------------------------------------------------- Ingame-Vorschau (Simulation des Gesprächsfensters)
  const sim = { uid: null, npcUid: "", rankIdx: 5, others: {}, pending: false, tbResult: "Done", player: "Spieler", log: [], mode: "node", dialogId: null, nodeId: null, tb: 0, ended: "" };

  function simReset() {
    sim.log = [];
    sim.mode = "node";
    sim.dialogId = null;
    sim.nodeId = null;
    sim.tb = 0;
    sim.ended = "";
  }

  function collectNpcIds(out) {
    const ids = [];
    (function walk(o) {
      if (Array.isArray(o)) o.forEach(walk);
      else if (o && typeof o === "object") {
        Object.keys(o).forEach((k) => {
          if (k === "NpcId" && typeof o[k] === "string" && o[k]) ids.push(o[k]);
          else if (typeof o[k] === "string") {
            const re = /\{rank:([^}]+)\}/g;
            let m;
            while ((m = re.exec(o[k]))) ids.push(m[1]);
          } else walk(o[k]);
        });
      }
    })(out);
    return ids.filter((x, i) => ids.indexOf(x) === i);
  }

  function renderIngame(container, d, out, api) {
    const P = EQE.Project;
    const uid = api.currentUid();
    if (sim.uid !== uid) {
      sim.uid = uid;
      simReset();
      const holder = P.npcsWith("Dialogs", out.DialogId)[0];
      sim.npcUid = holder ? holder.uid : npcFilter && npcFilter !== "__none" ? npcFilter : "";
    }
    const npcItem = P.get(sim.npcUid);
    const npcId = npcItem ? P.idOf(npcItem) : "";
    const npcName = npcItem && npcItem.json.Name ? npcItem.json.Name : "NPC";

    function dlgJson(id) {
      if (id === out.DialogId) return out;
      const it = P.find("dialog", id);
      return it ? it.json : null;
    }
    function rankIdxOf(id) {
      if (!id || id === npcId) return sim.rankIdx;
      return sim.others[id] === undefined ? 5 : sim.others[id];
    }
    function rankLabel(id) {
      return EQE.REPUTATION_RANKS[rankIdxOf(id)].label;
    }
    function inRange(range) {
      if (!range) return true;
      return EQE.inRepRange(range, EQE.REPUTATION_RANKS[rankIdxOf(range.NpcId || npcId)].value);
    }
    function req(r) {
      if (!r) return true;
      let neg = false;
      if (r[0] === "!") {
        neg = true;
        r = r.slice(1);
      }
      let met = false;
      if (r === "TurnBackPending") met = sim.pending;
      else if (r === "TurnBackDone") met = sim.tb === 1;
      else if (r === "TurnBackMissing") met = sim.tb === 2;
      return neg ? !met : met;
    }
    function prep(t) {
      return String(t || "")
        .replace(/\{player\}/g, sim.player)
        .replace(/\{npc\}/g, npcName)
        .replace(/\{rank:([^}]+)\}/g, (m, id) => rankLabel(id))
        .replace(/\{rank\}/g, rankLabel(npcId));
    }
    function sys(text) {
      sim.log.push({ sys: true, text });
    }

    function enterNode(did, nid) {
      const dj = dlgJson(did);
      sim.mode = "node";
      sim.dialogId = did;
      sim.nodeId = nid;
      if (!dj) return sys("Dialog '" + did + "' existiert nicht – der Server meldet einen Fehler.");
      const node = (dj.Nodes || []).find((n) => n.NodeId === nid);
      if (!node) {
        sim.nodeId = null;
        return sys("Knoten '" + nid + "' existiert nicht – der Server meldet einen Fehler.");
      }
      if (node.Reputation && !inRange(node.Reputation)) {
        sim.nodeId = null;
        return sys("Knoten '" + nid + "' wegen des Rufs nicht erreichbar – der Server lehnt ab.");
      }
      sim.tb = 0;
      if (node.OnEnter === "TurnBack") sim.tb = sim.pending ? (sim.tbResult === "Missing" ? 2 : 1) : 0;
      (node.Lines || []).forEach((l) => {
        if (l.Reputation && !inRange(l.Reputation)) return;
        if (!req(l.Requires)) return;
        sim.log.push({ speaker: l.Speaker || "NPC", text: l.Text || "" });
      });
    }

    function topicDialogs() {
      const ids = npcItem && Array.isArray(npcItem.json.Dialogs) ? npcItem.json.Dialogs.slice() : [];
      if (ids.indexOf(out.DialogId) < 0) ids.push(out.DialogId);
      return ids.map((id) => ({ id, json: dlgJson(id) })).filter((x) => x.json && inRange(x.json.Reputation));
    }
    function showTopics() {
      sim.mode = "topics";
      sim.nodeId = null;
      sim.dialogId = null;
    }
    function startDirect() {
      simReset();
      if (out.Reputation && !inRange(out.Reputation)) {
        sys("Dieser Dialog ist bei diesem Rang nicht verfügbar – der Spieler bekommt stattdessen: „" + npcName + " hat dir nichts zu sagen.“");
        sim.ended = "closed";
        return;
      }
      enterNode(out.DialogId, out.Start || "start");
    }
    function startReal() {
      simReset();
      const list = topicDialogs();
      if (list.length > 1) showTopics();
      else if (list.length === 1) enterNode(list[0].id, list[0].json.Start || "start");
      else {
        sys(npcName + " hat dir nichts zu sagen.");
        sim.ended = "closed";
      }
    }

    function currentOptions() {
      if (sim.mode === "topics") {
        return topicDialogs()
          .map((x) => ({ text: x.json.Title || x.id, next: x.id + "/" }))
          .concat([{ text: "Das war alles für jetzt.", next: "" }]);
      }
      const dj = dlgJson(sim.dialogId);
      const node = dj && (dj.Nodes || []).find((n) => n.NodeId === sim.nodeId);
      if (!node) return [];
      let opts = (node.Options || []).filter((o) => (!o.Reputation || inRange(o.Reputation)) && req(o.Requires)).map((o) => ({ text: o.Text || "", next: o.Next || "" }));
      if (!opts.length) opts = [{ text: "Das war alles für jetzt.", next: "" }];
      return opts;
    }

    function choose(i) {
      const opts = currentOptions();
      const o = opts[i];
      if (!o) return;
      sim.log.push({ speaker: "Player", text: o.text });
      const n = o.next;
      if (n === "") sim.ended = "closed";
      else if (n.indexOf("@quests") === 0) sim.ended = "quests";
      else if (n.indexOf("@trade") === 0) sim.ended = "trade";
      else if (n.indexOf("@topics") === 0) showTopics();
      else if (n.indexOf("/") > -1) {
        const parts = n.split("/");
        const dj = dlgJson(parts[0]);
        enterNode(parts[0], parts[1] || (dj && dj.Start) || "start");
      } else enterNode(sim.dialogId, n);
      draw();
    }

    // Erststart bzw. Knoten gelöscht
    if (!sim.ended && sim.mode === "node" && sim.dialogId === null) startDirect();
    if (!sim.ended && sim.mode === "node" && sim.dialogId === out.DialogId) {
      const exists = (out.Nodes || []).some((n) => n.NodeId === sim.nodeId);
      if (!exists && sim.nodeId !== null) startDirect();
    }

    function ctl(label, node) {
      return h("label", { class: "sim-ctl" }, [h("span", { text: label }), node]);
    }
    function rankSelect(cur, onch) {
      return h(
        "select",
        { onchange: (e) => onch(Number(e.target.value)) },
        EQE.REPUTATION_RANKS.map((r, i) => h("option", { value: i, selected: i === cur, text: r.label }))
      );
    }

    function draw() {
      clear(container);
      const npcSel = h(
        "select",
        {
          onchange: (e) => {
            sim.npcUid = e.target.value;
            startDirect();
            draw();
          },
        },
        [h("option", { value: "", text: "(kein NPC)" })].concat(P.byKind("npc").map((n) => h("option", { value: n.uid, selected: n.uid === sim.npcUid, text: P.labelOf(n) + (n.json.Name ? " – " + n.json.Name : "") })))
      );
      const controls = h("div", { class: "sim-controls" }, [
        ctl("NPC", npcSel),
        ctl("Dein Rang bei " + npcName, rankSelect(sim.rankIdx, (v) => { sim.rankIdx = v; draw(); })),
        ctl("Spielername", h("input", { type: "text", value: sim.player, onchange: (e) => { sim.player = e.target.value || "Spieler"; draw(); } })),
      ]);
      collectNpcIds(out)
        .filter((id) => id !== npcId)
        .forEach((id) => controls.appendChild(ctl("Rang bei " + id, rankSelect(rankIdxOf(id), (v) => { sim.others[id] = v; draw(); }))));
      controls.appendChild(
        h("label", { class: "sim-ctl check" }, [
          h("input", { type: "checkbox", checked: sim.pending, onchange: (e) => { sim.pending = e.target.checked; draw(); } }),
          h("span", { text: "Items zur Rückgabe offen (TurnBackPending)" }),
        ])
      );
      controls.appendChild(
        ctl(
          "Ergebnis der Rückgabe",
          h("select", { onchange: (e) => { sim.tbResult = e.target.value; draw(); } }, [
            h("option", { value: "Done", selected: sim.tbResult === "Done", text: "Done – alle Items vorhanden" }),
            h("option", { value: "Missing", selected: sim.tbResult === "Missing", text: "Missing – Items fehlen" }),
          ])
        )
      );
      controls.appendChild(
        h("div", { class: "sim-buttons" }, [
          h("button", { class: "btn small", type: "button", text: "↺ Diesen Dialog neu starten", onclick: () => { startDirect(); draw(); } }),
          h("button", { class: "btn small", type: "button", text: "Wie ingame (F → Sprechen)", title: "Zeigt bei mehreren Dialogen des NPCs zuerst die Themenliste", onclick: () => { startReal(); draw(); } }),
        ])
      );

      const logEl = h("div", { class: "game-log" });
      sim.log.forEach((e) => {
        if (e.sys) {
          logEl.appendChild(h("div", { class: "game-sys", text: e.text }));
          return;
        }
        const sp = String(e.speaker || "NPC");
        const low = sp.toLowerCase();
        const isPlayer = low === "player";
        const name = low === "npc" ? npcName : isPlayer ? sim.player : prep(sp);
        const raw = prep(e.text);
        logEl.appendChild(
          h("div", { class: "game-line" }, [
            h("div", { class: "game-name" + (isPlayer ? " player" : ""), text: name }),
            h("div", { class: "game-text" + (raw[0] === "#" ? " key" : ""), text: raw }),
          ])
        );
      });
      if (sim.mode === "topics" && !sim.ended) logEl.appendChild(h("div", { class: "game-line" }, [h("div", { class: "game-name", text: npcName }), h("div", { class: "game-text", text: "Worüber möchtest du reden?" })]));
      if (sim.ended) {
        const msg = sim.ended === "quests" ? "→ Das Questboard von " + npcName + " öffnet sich." : sim.ended === "trade" ? "→ Das Handelsfenster öffnet sich (XCP Trader)." : "Gespräch beendet – das Fenster schließt sich.";
        logEl.appendChild(h("div", { class: "game-banner", text: msg }));
      }

      const optsEl = h("div", { class: "game-opts" });
      if (!sim.ended) {
        currentOptions().forEach((o, i) => {
          const t = prep(o.text);
          optsEl.appendChild(h("button", { class: "game-opt", type: "button", text: i + 1 + ". " + (t || "(ohne Text)"), onclick: () => choose(i) }));
        });
      } else {
        optsEl.appendChild(h("button", { class: "game-opt", type: "button", text: "↺ Noch einmal", onclick: () => { startDirect(); draw(); } }));
      }

      const frame = h("div", { class: "game" }, [
        h("div", { class: "game-head" }, [h("span", { class: "game-title", text: npcName }), h("span", { class: "game-x", text: "✕" })]),
        logEl,
        h("div", { class: "game-divider" }),
        optsEl,
      ]);
      container.appendChild(controls);
      container.appendChild(frame);
      logEl.scrollTop = logEl.scrollHeight;
    }
    draw();
  }

  EQE.Dialog = { init };
})(window.EQE);
