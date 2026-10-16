/**
 * Exodus Quest Editor – Dialog-Editor (Dialog/*.json).
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

  let st = null;

  function init(root) {
    st = { data: loadDraft("dialog") || defaultDialog(), root, els: {} };
    st.els.form = root.querySelector('[data-el="form"]');
    st.els.preview = root.querySelector('[data-el="preview"]');
    st.els.issues = root.querySelector('[data-el="issues"]');
    st.els.status = root.querySelector('[data-el="status"]');
    wireToolbar(root);
    buildForm();
  }

  function wireToolbar(root) {
    root.querySelector('[data-act="new"]').addEventListener("click", () => {
      if (!confirm("Neues, leeres Dialog-Formular? Nicht exportierte Eingaben gehen verloren.")) return;
      st.data = defaultDialog();
      buildForm();
    });
    const fileInput = root.querySelector('[data-act="import-file"]');
    root.querySelector('[data-act="import"]').addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => tryImport(reader.result);
      reader.readAsText(file);
      e.target.value = "";
    });
    root.querySelector('[data-act="paste"]').addEventListener("click", () => {
      const ta = h("textarea", { placeholder: "Dialog-JSON hier einfügen…" });
      const btn = h("button", { class: "btn primary", type: "button", text: "Übernehmen", onclick: () => { tryImport(ta.value); closeModal(); } });
      openModal("Dialog-JSON einfügen", h("div", {}, [ta, h("div", { style: "margin-top:10px" }, [btn])]));
    });
    root.querySelector('[data-act="validate"]').addEventListener("click", () => renderIssues(st.els.issues, validateDialog(st.data)));
    root.querySelector('[data-act="copy"]').addEventListener("click", () => copyText(JSON.stringify(buildOutput(st.data), null, 2)));
    root.querySelector('[data-act="download"]').addEventListener("click", () => download("dlg_" + (st.data.DialogId || "dialog").replace(/^dlg_/, "") + ".json", JSON.stringify(buildOutput(st.data), null, 2)));
  }

  function normalizeRepRange(r) {
    return r ? Object.assign({ NpcId: "", MinRank: "", MaxRank: "", Min: undefined, Max: undefined }, r) : undefined;
  }

  function tryImport(text) {
    try {
      const obj = JSON.parse(text);
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
      st.data = d;
      buildForm();
      toast("Dialog geladen.");
    } catch (e) {
      toast("Ungültiges JSON: " + e.message, true);
    }
  }

  function buildForm() {
    const d = st.data;
    const form = st.els.form;
    clear(form);

    form.appendChild(
      section("Grunddaten", "", [
        h("div", { class: "grid3" }, [
          field({ label: "DialogId", key: "DialogId", obj: d, type: "text", required: true, onChange: preview }),
          field({ label: "Title", key: "Title", obj: d, type: "text", help: "Bezeichnung in der Themenliste, falls der NPC mehrere Dialoge hat.", onChange: preview }),
          field({ label: "Start", key: "Start", obj: d, type: "text", required: true, help: "NodeId des Startknotens.", onChange: preview }),
        ]),
      ])
    );

    form.appendChild(
      section(
        "Ruf-Bedingung (optional)",
        "Dieser Dialog ist nur in diesem Ruf-Bereich verfügbar",
        [repRangeEditor(d, "Reputation", { label: "Dialog nur in diesem Ruf-Bereich", hint: "NpcId leer = der NPC, mit dem gesprochen wird.", onChange: preview })],
        { collapsed: !d.Reputation }
      )
    );

    form.appendChild(section("Knoten (Nodes)", "Jeder Knoten hat Gesprächszeilen und Antwortoptionen", [buildNodesList(d)]));

    preview();
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
              field({ label: "Speaker", key: "Speaker", obj: l, type: "text", placeholder: "NPC / Player / eigener Name", onChange: () => { lapi.refreshTitle(); preview(); } }),
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
              field({ label: "Next", key: "Next", obj: o, type: "text", help: "'' beendet; 'knotenId'; 'dialogId/knotenId'; '@topics'; '@quests'; '@trade'.", onChange: () => { oapi.refreshTitle(); preview(); } }),
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

  function preview() {
    renderJson(st.els.preview, buildOutput(st.data));
    saveDraft("dialog", st.data);
    st.els.status.textContent = (st.data.DialogId || "(ohne Id)") + " · " + st.data.Nodes.length + " Knoten";
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

  EQE.Dialog = { init };
})(window.EQE);
