/**
 * Exodus Quest Editor – NPC-Editor (NPC/*.json).
 */
window.EQE = window.EQE || {};

(function (EQE) {
  "use strict";
  const { h, clear, field, section, strList, listEditor, renderJson, renderIssues, toast, copyText, download, openModal, closeModal, saveDraft, loadDraft } = EQE;

  function defaultNpc() {
    return {
      NpcId: "",
      Name: "",
      Role: "",
      Location: "",
      Portrait: "",
      Faction: "",
      Mode: "NPC",
      ClassName: "SurvivorM_Boris",
      Position: "",
      Rotation: 0,
      InteractionRadius: 2.5,
      Animation: "",
      Clothing: [],
      Equipment: [],
      Quests: [],
      Dialogs: [],
      DailyPool: [],
      DailyCount: 3,
      DailyLifetimeSeconds: 259200,
      DailyReplaceOnComplete: false,
      ReputationAllies: [],
      ReputationEnemies: [],
    };
  }
  function defaultLink() {
    return { NpcId: "", Factor: 1.0 };
  }

  const st = { data: null };
  let preview = () => {};

  function init(root) {
    return EQE.createEditor({
      kind: "npc",
      root,
      title: "NPC",
      defaultJson: () => {
        const j = buildOutput(defaultNpc());
        j.NpcId = EQE.Project.uniqueId("npc", "npc_new");
        j.Name = "Neuer NPC";
        return j;
      },
      fromJson: fromJson,
      toJson: buildOutput,
      buildForm,
      validate: validateNpc,
      status: (d) => (d.NpcId || "(ohne Id)") + " · " + d.Quests.length + " Quest(s) · " + d.Dialogs.length + " Dialog(e)",
    });
  }

  function fromJson(obj) {
    const d = Object.assign(defaultNpc(), obj);
    ["Clothing", "Equipment", "Quests", "Dialogs", "DailyPool"].forEach((k) => (d[k] = (obj[k] || []).slice()));
    d.ReputationAllies = (obj.ReputationAllies || []).map((l) => Object.assign(defaultLink(), l));
    d.ReputationEnemies = (obj.ReputationEnemies || []).map((l) => Object.assign(defaultLink(), l));
    return d;
  }

  function buildForm(d, ctx) {
    st.data = d;
    preview = ctx.changed;
    const form = ctx.form;

    form.appendChild(
      section("Grunddaten", "", [
        h("div", { class: "grid2" }, [
          field({ label: "NpcId", key: "NpcId", obj: d, type: "text", required: true, help: "Beim Umbenennen werden Verweise in Quests, Dialogen und anderen NPCs mitgezogen.", onChange: preview }),
          field({ label: "Name", key: "Name", obj: d, type: "text", required: true, onChange: preview }),
        ]),
        h("div", { class: "grid3" }, [
          field({ label: "Role", key: "Role", obj: d, type: "text", help: "z. B. Händler, Questgeber.", onChange: preview }),
          field({ label: "Location", key: "Location", obj: d, type: "text", onChange: preview }),
          field({ label: "Faction", key: "Faction", obj: d, type: "text", onChange: preview }),
        ]),
        field({ label: "Portrait", key: "Portrait", obj: d, type: "text", help: "Pfad zu einem Bild (.paa/.edds), relativ zum Mod-Stamm, z. B. ExodusQuests/gui/portraits/name.paa.", onChange: preview }),
      ])
    );

    form.appendChild(
      section("Figur & Position", "", [
        h("div", { class: "grid2" }, [
          field({ label: "Mode", key: "Mode", obj: d, type: "select", options: EQE.NPC_MODES, help: "NPC = sichtbare Figur. Bubble = reine Interaktionszone (Questgeber ohne Figur).", onChange: preview }),
          field({ label: "ClassName", key: "ClassName", obj: d, type: "text", required: true, help: "Nur Mode NPC: muss von SurvivorBase abgeleitet sein (z. B. SurvivorM_Boris).", onChange: preview }),
        ]),
        h("div", { class: "grid3" }, [
          field({ label: "Position", key: "Position", obj: d, type: "text", required: true, placeholder: "x y z", onChange: preview }),
          field({ label: "Rotation", key: "Rotation", obj: d, type: "number", onChange: preview }),
          field({ label: "InteractionRadius", key: "InteractionRadius", obj: d, type: "number", onChange: preview }),
        ]),
        field({ label: "Animation", key: "Animation", obj: d, type: "text", help: "Optional: Leeranimation (z. B. am Lagerfeuer sitzend).", onChange: preview }),
      ])
    );

    form.appendChild(
      section(
        "Ausrüstung",
        "Kleidung und Gegenstände beim Spawnen",
        [
          h("div", { class: "field" }, [h("label", {}, "Clothing"), strList({ items: d.Clothing, placeholder: "Klasse + Enter", onChange: preview })]),
          h("div", { class: "field" }, [h("label", {}, "Equipment"), strList({ items: d.Equipment, placeholder: "Klasse + Enter", onChange: preview })]),
        ],
        { collapsed: d.Clothing.length === 0 && d.Equipment.length === 0 }
      )
    );

    form.appendChild(
      section("Quests & Dialoge", "Feste Questliste, Dialog-IDs, Daily-Pool", [
        h("div", { class: "field" }, [h("label", {}, "Quests (feste QuestIds)"), strList({ items: d.Quests, placeholder: "QuestId + Enter", datalist: () => EQE.Project.options("quest"), onChange: preview })]),
        h("div", { class: "field" }, [
          h("label", {}, "Dialogs (DialogIds)"),
          strList({ items: d.Dialogs, placeholder: "DialogId + Enter", datalist: () => EQE.Project.options("dialog"), onChange: preview }),
          h("div", { class: "help", text: "Zweite F-Aktion „Sprechen“. Mehrere Dialoge ergeben eine Themenliste; keine Quests/DailyPool + Dialoge = nur „Sprechen“." }),
        ]),
        h("div", { class: "field" }, [h("label", {}, "DailyPool"), strList({ items: d.DailyPool, placeholder: "QuestId + Enter", datalist: () => EQE.Project.options("quest"), onChange: preview })]),
        h("div", { class: "grid3" }, [
          field({ label: "DailyCount", key: "DailyCount", obj: d, type: "number", onChange: preview }),
          field({ label: "DailyLifetimeSeconds", key: "DailyLifetimeSeconds", obj: d, type: "number", help: "Default 259200 (3 Tage).", onChange: preview }),
          field({ label: "DailyReplaceOnComplete", key: "DailyReplaceOnComplete", obj: d, type: "bool", onChange: preview }),
        ]),
      ])
    );

    form.appendChild(
      section(
        "Ruf-Verknüpfungen (optional)",
        "Ruf-Änderungen bei diesem NPC wirken anteilig auch auf andere NPCs",
        [buildLinkList(d, "ReputationAllies", "gleichsinnig (Verbündete)"), buildLinkList(d, "ReputationEnemies", "gegensinnig (Rivalen)")],
        { collapsed: d.ReputationAllies.length === 0 && d.ReputationEnemies.length === 0 }
      )
    );

  }

  function buildLinkList(d, key, label) {
    return h("div", { class: "field" }, [
      h("label", {}, key + " – " + label),
      listEditor({
        items: d[key],
        makeItem: defaultLink,
        title: (l) => l.NpcId || "(ohne Id)",
        badge: (l) => "×" + (l.Factor === undefined ? 1 : l.Factor),
        addLabel: "+ Verknüpfung hinzufügen",
        emptyLabel: "Keine Einträge.",
        renderCard: (l, i, api) => [
          h("div", { class: "grid2" }, [
            field({ label: "NpcId", key: "NpcId", obj: l, type: "text", required: true, datalist: () => EQE.Project.options("npc").filter((o) => o.value !== st.data.NpcId), onChange: () => { api.refreshTitle(); preview(); } }),
            field({ label: "Factor (0.0–1.0)", key: "Factor", obj: l, type: "number", step: "0.1", onChange: () => { api.refreshTitle(); preview(); } }),
          ]),
        ],
        onChange: preview,
      }),
    ]);
  }

  function buildOutput(d) {
    const out = { NpcId: d.NpcId || "", Name: d.Name || "" };
    if (d.Role) out.Role = d.Role;
    if (d.Location) out.Location = d.Location;
    if (d.Portrait) out.Portrait = d.Portrait;
    if (d.Faction) out.Faction = d.Faction;
    out.Mode = d.Mode || "NPC";
    if (out.Mode === "NPC") out.ClassName = d.ClassName || "";
    out.Position = d.Position || "";
    if (d.Rotation) out.Rotation = d.Rotation;
    if (d.InteractionRadius && d.InteractionRadius !== 2.5) out.InteractionRadius = d.InteractionRadius;
    if (d.Animation) out.Animation = d.Animation;
    if (d.Clothing.length) out.Clothing = d.Clothing.slice();
    if (d.Equipment.length) out.Equipment = d.Equipment.slice();
    if (d.Quests.length) out.Quests = d.Quests.slice();
    if (d.Dialogs.length) out.Dialogs = d.Dialogs.slice();
    if (d.DailyPool.length) {
      out.DailyPool = d.DailyPool.slice();
      out.DailyCount = d.DailyCount;
      if (d.DailyLifetimeSeconds !== 259200) out.DailyLifetimeSeconds = d.DailyLifetimeSeconds;
      if (d.DailyReplaceOnComplete) out.DailyReplaceOnComplete = true;
    }
    const cleanLink = (l) => {
      const o = { NpcId: l.NpcId || "" };
      o.Factor = l.Factor === undefined || l.Factor === "" ? 1 : l.Factor;
      return o;
    };
    if (d.ReputationAllies.length) out.ReputationAllies = d.ReputationAllies.map(cleanLink);
    if (d.ReputationEnemies.length) out.ReputationEnemies = d.ReputationEnemies.map(cleanLink);
    return out;
  }

  function validateNpc(d) {
    const issues = [];
    const err = (m) => issues.push({ level: "error", msg: m });
    const warn = (m) => issues.push({ level: "warn", msg: m });
    if (!d.NpcId) err("NpcId fehlt.");
    if (!d.Name) warn("Name ist leer.");
    if (d.Mode !== "NPC" && d.Mode !== "Bubble") err("Mode muss NPC oder Bubble sein.");
    if (!/^-?\d+(\.\d+)?\s+-?\d+(\.\d+)?\s+-?\d+(\.\d+)?$/.test((d.Position || "").trim())) err("Position fehlt oder sieht nicht wie 'x y z' aus.");
    if (d.InteractionRadius <= 0) err("InteractionRadius muss größer als 0 sein.");
    if (d.Mode === "NPC" && !d.ClassName) err("ClassName fehlt (Mode NPC).");
    if (d.DailyPool.length > 0 && d.DailyCount > d.DailyPool.length) warn("DailyCount ist größer als die Anzahl der Einträge in DailyPool.");
    const seenDaily = new Set();
    d.DailyPool.forEach((q) => {
      if (seenDaily.has(q)) warn("DailyPool enthält '" + q + "' mehrfach.");
      seenDaily.add(q);
    });
    d.ReputationAllies.concat(d.ReputationEnemies).forEach((l) => {
      if (!l.NpcId) err("Ruf-Verknüpfung ohne NpcId.");
      if (l.NpcId === d.NpcId) warn("Ruf-Verknüpfung verweist auf den NPC selbst ('" + l.NpcId + "').");
      const f = l.Factor === undefined || l.Factor === "" ? 1 : Number(l.Factor);
      if (f === 0) warn("Factor 0 bei '" + l.NpcId + "' hat keine Wirkung.");
      if (f < 0 || f > 1) err("Factor bei '" + l.NpcId + "' muss zwischen 0.0 und 1.0 liegen.");
    });
    return issues;
  }

  EQE.Npc = { init };
})(window.EQE);
