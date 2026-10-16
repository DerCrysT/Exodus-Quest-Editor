/**
 * Exodus Quest Editor – Quest-Editor (Quest/*.json).
 */
window.EQE = window.EQE || {};

(function (EQE) {
  "use strict";
  const { h, clear, field, section, strList, listEditor, repRangeEditor, validateRepRange, renderJson, renderIssues, toast, copyText, download, openModal, closeModal, saveDraft, loadDraft } = EQE;

  const SPAWN_DEFAULTS = { ActivationRadius: 300, DespawnRadius: 500, Count: 1, Waves: 1, RespawnDelay: 0, WaveDelay: 5, Spread: 2.5, MinDistance: 0 };

  function defaultQuest() {
    return {
      QuestId: "",
      QuestType: "Kill",
      Title: "",
      Description: "",
      Faction: "",
      Category: "Side",
      Location: "",
      PreQuests: [],
      NextQuests: [],
      IsStory: false,
      IsDaily: false,
      Repeatable: false,
      CooldownSeconds: 0,
      TimeLimitSeconds: 0,
      AutoComplete: false,
      FailOnDeath: false,
      TurnInNpcId: "",
      Objectives: [],
      Spawns: [],
      Rewards: [],
      StartItems: [],
      ReputationLossOnAbandon: 0,
      ReputationLossOnFail: 0,
      ReputationLossNpcId: "",
      StartItemsOnFail: "",
      ReputationGainOnTurnBack: 0,
    };
  }
  function defaultObjective(n) {
    return { ObjectiveId: "obj_" + n, Type: "Kill", Description: "", TargetValue: 1, Optional: false, FailQuestOnDone: false, Params: {} };
  }
  function defaultSpawn(n) {
    return Object.assign({ SpawnId: "spawn_" + n, ClassName: "", Positions: [] }, SPAWN_DEFAULTS, { Respawn: false });
  }
  function defaultReward() {
    return { Type: "Item", ClassName: "", Amount: 1, Quantity: -1, FloatAmount: 0, DisplayValue: 0, Attachments: [], NpcId: "" };
  }
  function defaultCondNode() {
    return { Logic: "AND", Objectives: [], Children: [] };
  }

  let st = null; // { data, root, els:{form,preview,issues,status}, refreshCond }

  function init(root) {
    st = { data: loadDraft("quest") || defaultQuest(), root, els: {}, refreshCond: null };
    st.els.form = root.querySelector('[data-el="form"]');
    st.els.preview = root.querySelector('[data-el="preview"]');
    st.els.issues = root.querySelector('[data-el="issues"]');
    st.els.status = root.querySelector('[data-el="status"]');
    wireToolbar(root);
    buildForm();
  }

  // ---------------------------------------------------------------- Toolbar
  function wireToolbar(root) {
    root.querySelector('[data-act="new"]').addEventListener("click", () => {
      if (!confirm("Neues, leeres Quest-Formular? Nicht exportierte Eingaben gehen verloren.")) return;
      st.data = defaultQuest();
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
      const ta = h("textarea", { placeholder: "Quest-JSON hier einfügen…" });
      const btn = h("button", { class: "btn primary", type: "button", text: "Übernehmen", onclick: () => { tryImport(ta.value); closeModal(); } });
      openModal("Quest-JSON einfügen", h("div", {}, [ta, h("div", { style: "margin-top:10px" }, [btn])]));
    });
    root.querySelector('[data-act="validate"]').addEventListener("click", () => {
      renderIssues(st.els.issues, validateQuest(st.data));
    });
    root.querySelector('[data-act="copy"]').addEventListener("click", () => copyText(JSON.stringify(buildOutput(st.data), null, 2)));
    root.querySelector('[data-act="download"]').addEventListener("click", () => {
      download((st.data.QuestId || "quest") + ".json", JSON.stringify(buildOutput(st.data), null, 2));
    });
  }

  function tryImport(text) {
    try {
      const obj = JSON.parse(text);
      st.data = normalizeImported(obj);
      buildForm();
      toast("Quest geladen.");
    } catch (e) {
      toast("Ungültiges JSON: " + e.message, true);
    }
  }

  function normalizeImported(obj) {
    const d = Object.assign(defaultQuest(), obj);
    d.PreQuests = (obj.PreQuests || []).slice();
    d.NextQuests = (obj.NextQuests || []).slice();
    d.Objectives = (obj.Objectives || []).map((o) => Object.assign(defaultObjective(1), o, { Params: Object.assign({}, o.Params || {}) }));
    d.Spawns = (obj.Spawns || []).map((s) => Object.assign(defaultSpawn(1), s, { Positions: (s.Positions || []).slice() }));
    d.Rewards = (obj.Rewards || []).map((r) => Object.assign(defaultReward(), r, { Attachments: (r.Attachments || []).slice() }));
    d.StartItems = (obj.StartItems || []).map((r) => Object.assign(defaultReward(), r, { Attachments: (r.Attachments || []).slice() }));
    if (obj.Conditions) d.Conditions = normalizeCond(obj.Conditions);
    else delete d.Conditions;
    if (obj.Reputation) d.Reputation = Object.assign({ NpcId: "", MinRank: "", MaxRank: "", Min: undefined, Max: undefined, ShowLocked: false }, obj.Reputation);
    else delete d.Reputation;
    return d;
  }
  function normalizeCond(node) {
    return { Logic: node.Logic || "AND", Objectives: (node.Objectives || []).slice(), Children: (node.Children || []).map(normalizeCond) };
  }

  // ---------------------------------------------------------------- Formular
  function buildForm() {
    const d = st.data;
    const form = st.els.form;
    clear(form);

    form.appendChild(
      section("Grunddaten", "QuestId, Titel, Beschreibung, Einordnung", [
        h("div", { class: "grid2" }, [
          field({ label: "QuestId", key: "QuestId", obj: d, type: "text", required: true, help: "Eindeutig; der Dateiname ist frei wählbar.", onChange: preview }),
          field({ label: "QuestType", key: "QuestType", obj: d, type: "text", required: true, datalist: EQE.OBJECTIVE_TYPES.concat(["Mixed"]), help: "Frei wählbar, z. B. gleich dem Objective-Typ oder 'Mixed'.", onChange: preview }),
        ]),
        field({ label: "Title", key: "Title", obj: d, type: "text", required: true, onChange: preview }),
        field({ label: "Description", key: "Description", obj: d, type: "textarea", onChange: preview }),
        h("div", { class: "grid3" }, [
          field({ label: "Faction", key: "Faction", obj: d, type: "text", onChange: preview }),
          field({ label: "Category", key: "Category", obj: d, type: "text", datalist: EQE.CATEGORY_SUGGESTIONS, onChange: preview }),
          field({ label: "Location", key: "Location", obj: d, type: "text", onChange: preview }),
        ]),
        field({ label: "TurnInNpcId", key: "TurnInNpcId", obj: d, type: "text", help: "Leer = Abgabe beim Questgeber (dem NPC, bei dem angenommen wurde).", onChange: preview }),
      ])
    );

    form.appendChild(
      section("Verhalten", "Wiederholbar, Story/Daily, Zeitlimit, Cooldown", [
        h("div", { class: "grid4" }, [
          field({ label: "IsStory", key: "IsStory", obj: d, type: "bool", onChange: preview }),
          field({ label: "IsDaily", key: "IsDaily", obj: d, type: "bool", onChange: preview }),
          field({ label: "Repeatable", key: "Repeatable", obj: d, type: "bool", onChange: preview }),
          field({ label: "AutoComplete", key: "AutoComplete", obj: d, type: "bool", help: "Abschluss ohne Abgabe am NPC.", onChange: preview }),
        ]),
        h("div", { class: "grid3" }, [
          field({ label: "FailOnDeath", key: "FailOnDeath", obj: d, type: "bool", help: "Quest scheitert bei Spielertod.", onChange: preview }),
          field({ label: "CooldownSeconds", key: "CooldownSeconds", obj: d, type: "number", help: "Nur bei Repeatable relevant.", onChange: preview }),
          field({ label: "TimeLimitSeconds", key: "TimeLimitSeconds", obj: d, type: "number", help: "0 = kein Limit. Läuft ab Annahme, auch offline; HUD-Countdown in der letzten Stunde.", onChange: preview }),
        ]),
      ])
    );

    form.appendChild(
      section(
        "Verkettung",
        "Voraussetzungen und Folgequests (QuestIds)",
        [
          h("div", { class: "field" }, [h("label", {}, "PreQuests"), strList({ items: d.PreQuests, placeholder: "QuestId + Enter", onChange: preview })]),
          h("div", { class: "field" }, [h("label", {}, "NextQuests"), strList({ items: d.NextQuests, placeholder: "QuestId + Enter", onChange: preview })]),
        ],
        { collapsed: d.PreQuests.length === 0 && d.NextQuests.length === 0 }
      )
    );

    form.appendChild(section("Objectives", "Mindestens eines nötig", [buildObjectivesList(d)]));

    form.appendChild(
      section(
        "Bedingung (optional)",
        "Ohne eigene Bedingung gilt: alle Pflicht-Objectives (nicht Optional) müssen erfüllt sein (UND).",
        [buildConditionsEditor(d)],
        { collapsed: !d.Conditions }
      )
    );

    form.appendChild(section("Spawns (optional)", "Gegner-/Objekt-Gruppen für Kill-/Action-Objectives", [buildSpawnsList(d)], { collapsed: d.Spawns.length === 0 }));

    form.appendChild(section("Rewards", "Belohnung bei Abschluss", [buildRewardsList(d, "Rewards")]));

    form.appendChild(section("StartItems (optional)", "Items, die der Questgeber bei Annahme aushändigt", [buildRewardsList(d, "StartItems")], { collapsed: d.StartItems.length === 0 }));

    form.appendChild(
      section(
        "Start-Items bei Abbruch/Scheitern",
        "Was mit den StartItems passiert, wenn der Spieler abbricht oder die Quest scheitert",
        [
          h("div", { class: "grid2" }, [
            field({
              label: "StartItemsOnFail",
              key: "StartItemsOnFail",
              obj: d,
              type: "select",
              options: [
                { value: "", label: "(leer) – Spieler behält sie" },
                { value: "Delete", label: "Delete – werden gelöscht" },
                { value: "TurnBack", label: "TurnBack – per Dialog zurückgeben" },
              ],
              onChange: preview,
            }),
            field({ label: "ReputationGainOnTurnBack", key: "ReputationGainOnTurnBack", obj: d, type: "number", help: "Nur bei TurnBack: Ruf-Gutschrift für die Rückgabe.", onChange: preview }),
          ]),
        ],
        { collapsed: !d.StartItemsOnFail }
      )
    );

    form.appendChild(
      section(
        "Ruf-Bedingung (optional)",
        "Sichtbarkeit/Annahme je nach Ruf beim NPC",
        [repRangeEditor(d, "Reputation", { label: "Quest nur in diesem Ruf-Bereich annehmbar", showLocked: true, hint: "NpcId leer = der NPC, der die Quest anbietet.", onChange: preview })],
        { collapsed: !d.Reputation }
      )
    );

    form.appendChild(
      section(
        "Ruf-Verlust bei Abbruch/Scheitern (optional)",
        "Positive Beträge; wirkt beim Questgeber bzw. der angegebenen NpcId",
        [
          h("div", { class: "grid3" }, [
            field({ label: "ReputationLossOnAbandon", key: "ReputationLossOnAbandon", obj: d, type: "number", onChange: preview }),
            field({ label: "ReputationLossOnFail", key: "ReputationLossOnFail", obj: d, type: "number", onChange: preview }),
            field({ label: "ReputationLossNpcId", key: "ReputationLossNpcId", obj: d, type: "text", help: "Leer = Questgeber/Abgabe-NPC.", onChange: preview }),
          ]),
        ],
        { collapsed: !d.ReputationLossOnAbandon && !d.ReputationLossOnFail }
      )
    );

    preview();
  }

  // ---------------------------------------------------------------- Objectives
  function buildObjectivesList(d) {
    return listEditor({
      items: d.Objectives,
      makeItem: () => defaultObjective(d.Objectives.length + 1),
      title: (o) => (o.ObjectiveId || "(ohne Id)") + " · " + o.Type,
      badge: (o) => (o.Optional ? "optional" : null),
      addLabel: "+ Objective hinzufügen",
      emptyLabel: "Noch keine Objectives – mindestens eines wird benötigt.",
      renderCard: renderObjectiveCard,
      onChange: () => {
        st.refreshCond && st.refreshCond();
        preview();
      },
    });
  }

  function renderObjectiveCard(o, index, api) {
    const nodes = [];
    nodes.push(
      h("div", { class: "grid3" }, [
        field({
          label: "ObjectiveId",
          key: "ObjectiveId",
          obj: o,
          type: "text",
          required: true,
          onChange: () => {
            api.refreshTitle();
            st.refreshCond && st.refreshCond();
            preview();
          },
        }),
        field({
          label: "Type",
          key: "Type",
          obj: o,
          type: "select",
          options: EQE.OBJECTIVE_TYPES,
          onChange: () => {
            api.refreshTitle();
            redrawParams();
            preview();
          },
        }),
        field({ label: "TargetValue", key: "TargetValue", obj: o, type: "number", required: true, onChange: preview }),
      ])
    );
    nodes.push(field({ label: "Description", key: "Description", obj: o, type: "text", onChange: preview }));
    nodes.push(
      h("div", { class: "grid2" }, [
        field({
          label: "Optional",
          key: "Optional",
          obj: o,
          type: "bool",
          help: "Muss nicht erfüllt sein, zählt in der Standard-UND-Bedingung nicht mit.",
          onChange: () => {
            api.refreshTitle();
            preview();
          },
        }),
        field({ label: "FailQuestOnDone", key: "FailQuestOnDone", obj: o, type: "bool", help: "Erfüllung lässt die Quest scheitern (verbotene Handlung).", onChange: preview }),
      ])
    );
    const typeHelp = h("div", { class: "help", text: EQE.OBJECTIVE_TYPE_HELP[o.Type] || "" });
    nodes.push(typeHelp);
    const paramsWrap = h("div", { class: "grid2" });
    function redrawParams() {
      clear(paramsWrap);
      typeHelp.textContent = EQE.OBJECTIVE_TYPE_HELP[o.Type] || "";
      if (!o.Params) o.Params = {};
      (EQE.OBJECTIVE_PARAMS[o.Type] || []).forEach((spec) => paramsWrap.appendChild(renderParamField(o.Params, spec)));
    }
    redrawParams();
    nodes.push(h("div", { class: "field" }, [h("label", {}, "Params"), paramsWrap]));
    return nodes;
  }

  function renderParamField(params, spec) {
    if (spec.type === "bool" && !spec.default) {
      const input = h("input", {
        type: "checkbox",
        checked: params[spec.key] === "1",
        onchange: (e) => {
          if (e.target.checked) params[spec.key] = "1";
          else delete params[spec.key];
          preview();
        },
      });
      return h("div", { class: "field" }, [h("label", { class: "checkrow" }, [input, spec.label]), spec.help ? h("div", { class: "help", text: spec.help }) : null]);
    }
    const wrap = h("div", { class: "field" });
    wrap.appendChild(h("label", {}, [spec.label, spec.required ? h("span", { class: "req", text: "*" }) : null]));
    let input;
    if (spec.type === "bool") {
      const cur = params[spec.key];
      input = h(
        "select",
        {
          onchange: (e) => {
            const v = e.target.value;
            if (v === "") delete params[spec.key];
            else params[spec.key] = v;
            preview();
          },
        },
        [
          { value: "", label: "(Standard: an)" },
          { value: "1", label: "An" },
          { value: "0", label: "Aus" },
        ].map((o) => h("option", { value: o.value, selected: (cur === undefined ? "" : cur) === o.value, text: o.label }))
      );
    } else if (spec.type === "select") {
      input = h(
        "select",
        {
          onchange: (e) => {
            const v = e.target.value;
            if (v === "") delete params[spec.key];
            else params[spec.key] = v;
            preview();
          },
        },
        spec.options.map((v) => h("option", { value: v, selected: (params[spec.key] || "") === v, text: v || "(leer)" }))
      );
    } else {
      input = h("input", {
        type: spec.type === "number" ? "number" : "text",
        step: spec.type === "number" ? "any" : undefined,
        oninput: (e) => {
          const v = e.target.value;
          if (v === "") delete params[spec.key];
          else params[spec.key] = v;
          preview();
        },
      });
      input.value = params[spec.key] !== undefined ? params[spec.key] : "";
    }
    wrap.appendChild(input);
    if (spec.help) wrap.appendChild(h("div", { class: "help", text: spec.help }));
    return wrap;
  }

  // ---------------------------------------------------------------- Bedingung (AND/OR/NOT-Baum)
  function buildConditionsEditor(d) {
    const outer = h("div", {});
    function refresh() {
      clear(outer);
      const active = !!d.Conditions;
      outer.appendChild(
        h("label", { class: "checkrow" }, [
          h("input", {
            type: "checkbox",
            checked: active,
            onchange: (e) => {
              if (e.target.checked) d.Conditions = defaultCondNode();
              else delete d.Conditions;
              refresh();
              preview();
            },
          }),
          "Eigene Bedingung verwenden",
        ])
      );
      if (active) {
        outer.appendChild(
          renderCondNode(d, d.Conditions, true, () => {
            refresh();
            preview();
          }, null)
        );
      }
    }
    refresh();
    st.refreshCond = refresh;
    return outer;
  }

  function renderCondNode(d, node, isRoot, onChange, onRemove) {
    const logicSel = h(
      "select",
      {
        onchange: (e) => {
          node.Logic = e.target.value;
          onChange();
        },
      },
      ["AND", "OR", "NOT"].map((v) => h("option", { value: v, selected: node.Logic === v, text: v }))
    );
    const row = h("div", { class: "cond-row" }, [
      h("span", { text: "Logik:" }),
      logicSel,
      h("button", {
        class: "btn small",
        type: "button",
        text: "+ Teilbedingung",
        onclick: () => {
          node.Children.push(defaultCondNode());
          onChange();
        },
      }),
      isRoot
        ? null
        : h("button", {
            class: "btn small danger",
            type: "button",
            text: "Entfernen",
            onclick: () => onRemove(),
          }),
    ]);
    const objs = d.Objectives || [];
    const objsRow = objs.length
      ? h(
          "div",
          { class: "cond-objs" },
          objs.map((o) => {
            const checked = node.Objectives.indexOf(o.ObjectiveId) > -1;
            return h("label", { class: "cond-obj-pill" }, [
              h("input", {
                type: "checkbox",
                checked,
                onchange: (e) => {
                  const idx = node.Objectives.indexOf(o.ObjectiveId);
                  if (e.target.checked) {
                    if (idx < 0) node.Objectives.push(o.ObjectiveId);
                  } else if (idx > -1) node.Objectives.splice(idx, 1);
                  onChange();
                },
              }),
              o.ObjectiveId || "(ohne Id)",
            ]);
          })
        )
      : h("div", { class: "help", text: "Noch keine Objectives angelegt." });
    const childrenWrap = h(
      "div",
      { class: "cond-children" },
      node.Children.map((child, i) =>
        renderCondNode(d, child, false, onChange, () => {
          node.Children.splice(i, 1);
          onChange();
        })
      )
    );
    return h("div", { class: "cond-node" }, [row, objsRow, childrenWrap]);
  }

  // ---------------------------------------------------------------- Spawns
  function buildSpawnsList(d) {
    return listEditor({
      items: d.Spawns,
      makeItem: () => defaultSpawn(d.Spawns.length + 1),
      title: (s) => s.SpawnId || "(ohne Id)",
      badge: (s) => s.ClassName || null,
      addLabel: "+ Spawn-Gruppe hinzufügen",
      emptyLabel: "Keine Spawn-Gruppen.",
      renderCard: renderSpawnCard,
      onChange: preview,
    });
  }

  function renderSpawnCard(s, index, api) {
    return [
      h("div", { class: "grid2" }, [
        field({ label: "SpawnId", key: "SpawnId", obj: s, type: "text", required: true, onChange: () => { api.refreshTitle(); preview(); } }),
        field({ label: "ClassName", key: "ClassName", obj: s, type: "text", required: true, help: "Mehrere Klassen Komma-getrennt = zufällige Variante je Gegner.", onChange: () => { api.refreshTitle(); preview(); } }),
      ]),
      h("div", { class: "field" }, [h("label", {}, "Positions (x y z)"), strList({ items: s.Positions, placeholder: "x y z + Enter", onChange: preview })]),
      h("div", { class: "grid4" }, [
        field({ label: "Count", key: "Count", obj: s, type: "number", onChange: preview }),
        field({ label: "Waves", key: "Waves", obj: s, type: "number", onChange: preview }),
        field({ label: "WaveDelay", key: "WaveDelay", obj: s, type: "number", help: "Pause (s) zwischen zwei Wellen.", onChange: preview }),
        field({ label: "Spread", key: "Spread", obj: s, type: "number", help: "Verteilung bei Count>1 (m).", onChange: preview }),
      ]),
      h("div", { class: "grid4" }, [
        field({ label: "ActivationRadius", key: "ActivationRadius", obj: s, type: "number", onChange: preview }),
        field({ label: "DespawnRadius", key: "DespawnRadius", obj: s, type: "number", onChange: preview }),
        field({ label: "MinDistance", key: "MinDistance", obj: s, type: "number", help: "Mindestabstand (m) zum Spieler beim Spawnen, 0 = aus.", onChange: preview }),
        field({ label: "RespawnDelay", key: "RespawnDelay", obj: s, type: "number", onChange: preview }),
      ]),
      field({ label: "Respawn", key: "Respawn", obj: s, type: "bool", onChange: preview }),
    ];
  }

  // ---------------------------------------------------------------- Rewards / StartItems
  function buildRewardsList(d, key) {
    return listEditor({
      items: d[key],
      makeItem: defaultReward,
      title: (r) => (r.Type === "Reputation" ? "Reputation " + (r.Amount >= 0 ? "+" : "") + (r.Amount || 0) : r.ClassName || r.Type),
      badge: (r) => r.Type,
      addLabel: "+ " + (key === "StartItems" ? "Start-Item" : "Belohnung") + " hinzufügen",
      emptyLabel: key === "StartItems" ? "Keine Start-Items." : "Noch keine Belohnungen.",
      renderCard: renderRewardCard,
      onChange: preview,
    });
  }

  function renderRewardCard(r, index, api) {
    const typeWrap = h("div", {});
    function redraw() {
      clear(typeWrap);
      const rows = [];
      if (r.Type === "Reputation") {
        rows.push(
          h("div", { class: "grid2" }, [
            field({ label: "Amount (Ruf-Betrag, negativ = Verlust)", key: "Amount", obj: r, type: "number", onChange: () => { api.refreshTitle(); preview(); } }),
            field({ label: "NpcId", key: "NpcId", obj: r, type: "text", help: "Leer = Abgabe-NPC/Questgeber.", onChange: preview }),
          ])
        );
      } else if (r.Type === "LonerReputation") {
        rows.push(h("div", { class: "help", text: "Legacy-Feld ohne Wirkung – bitte stattdessen Type 'Reputation' verwenden." }));
        rows.push(field({ label: "FloatAmount", key: "FloatAmount", obj: r, type: "number", onChange: preview }));
      } else if (r.Type === "Currency") {
        rows.push(
          h("div", { class: "grid3" }, [
            field({ label: "ClassName", key: "ClassName", obj: r, type: "text", help: "Optional: Währung als Item.", onChange: () => { api.refreshTitle(); preview(); } }),
            field({ label: "Amount", key: "Amount", obj: r, type: "number", onChange: preview }),
            field({ label: "DisplayValue", key: "DisplayValue", obj: r, type: "number", help: "Nur Anzeige, falls kein ClassName.", onChange: preview }),
          ])
        );
      } else {
        rows.push(
          h("div", { class: "grid2" }, [
            field({ label: "ClassName", key: "ClassName", obj: r, type: "text", required: true, onChange: () => { api.refreshTitle(); preview(); } }),
            field({ label: "Amount", key: "Amount", obj: r, type: "number", onChange: preview }),
          ])
        );
        rows.push(field({ label: "Quantity", key: "Quantity", obj: r, type: "number", help: "Munition/Stapelgröße je Item; -1 = Standard.", onChange: preview }));
        if (!r.Attachments) r.Attachments = [];
        rows.push(h("div", { class: "field" }, [h("label", {}, "Attachments"), strList({ items: r.Attachments, placeholder: "Klasse + Enter", onChange: preview })]));
      }
      rows.forEach((n) => typeWrap.appendChild(n));
    }
    const typeField = field({
      label: "Type",
      key: "Type",
      obj: r,
      type: "select",
      options: EQE.REWARD_TYPES,
      onChange: () => {
        api.refreshTitle();
        redraw();
        preview();
      },
    });
    redraw();
    return [typeField, typeWrap];
  }

  // ---------------------------------------------------------------- Export / Vorschau
  function cleanReward(r) {
    const o = { Type: r.Type || "Item" };
    if (o.Type === "Reputation") {
      if (r.Amount) o.Amount = r.Amount;
      if (r.NpcId) o.NpcId = r.NpcId;
      return o;
    }
    if (o.Type === "LonerReputation") {
      if (r.FloatAmount) o.FloatAmount = r.FloatAmount;
      return o;
    }
    if (r.ClassName) o.ClassName = r.ClassName;
    if (r.Amount !== undefined && r.Amount !== 1) o.Amount = r.Amount;
    if (r.Quantity !== undefined && r.Quantity !== -1) o.Quantity = r.Quantity;
    if (r.DisplayValue) o.DisplayValue = r.DisplayValue;
    if (r.Attachments && r.Attachments.length) o.Attachments = r.Attachments.slice();
    return o;
  }
  function isEmptyCond(node) {
    return (!node.Objectives || node.Objectives.length === 0) && (!node.Children || node.Children.length === 0);
  }
  function cleanCond(node) {
    const o = { Logic: node.Logic || "AND" };
    if (node.Objectives && node.Objectives.length) o.Objectives = node.Objectives.slice();
    if (node.Children && node.Children.length) o.Children = node.Children.map(cleanCond);
    return o;
  }
  function cleanRepRange(r) {
    const o = {};
    if (r.NpcId) o.NpcId = r.NpcId;
    if (r.MinRank) o.MinRank = r.MinRank;
    else if (r.Min) o.Min = r.Min;
    if (r.MaxRank) o.MaxRank = r.MaxRank;
    else if (r.Max) o.Max = r.Max;
    if (r.ShowLocked) o.ShowLocked = true;
    return o;
  }

  function buildOutput(d) {
    const out = { QuestId: d.QuestId || "", QuestType: d.QuestType || "", Title: d.Title || "" };
    if (d.Description) out.Description = d.Description;
    if (d.Faction) out.Faction = d.Faction;
    if (d.Category) out.Category = d.Category;
    if (d.Location) out.Location = d.Location;
    if (d.PreQuests && d.PreQuests.length) out.PreQuests = d.PreQuests.slice();
    if (d.NextQuests && d.NextQuests.length) out.NextQuests = d.NextQuests.slice();
    if (d.IsStory) out.IsStory = true;
    if (d.IsDaily) out.IsDaily = true;
    if (d.Repeatable) out.Repeatable = true;
    if (d.CooldownSeconds) out.CooldownSeconds = d.CooldownSeconds;
    if (d.TimeLimitSeconds) out.TimeLimitSeconds = d.TimeLimitSeconds;
    if (d.AutoComplete) out.AutoComplete = true;
    if (d.FailOnDeath) out.FailOnDeath = true;
    if (d.TurnInNpcId) out.TurnInNpcId = d.TurnInNpcId;
    out.Objectives = (d.Objectives || []).map((o) => {
      const oo = { ObjectiveId: o.ObjectiveId || "", Type: o.Type || "", Description: o.Description || "", TargetValue: o.TargetValue === undefined ? 1 : o.TargetValue };
      if (o.Optional) oo.Optional = true;
      if (o.FailQuestOnDone) oo.FailQuestOnDone = true;
      oo.Params = {};
      const allowed = new Set((EQE.OBJECTIVE_PARAMS[o.Type] || []).map((s) => s.key));
      Object.keys(o.Params || {}).forEach((k) => {
        if (!allowed.has(k)) return;
        if (o.Params[k] === "" || o.Params[k] === undefined) return;
        oo.Params[k] = String(o.Params[k]);
      });
      return oo;
    });
    if (d.Conditions && !isEmptyCond(d.Conditions)) out.Conditions = cleanCond(d.Conditions);
    if (d.Spawns && d.Spawns.length) {
      out.Spawns = d.Spawns.map((s) => {
        const ss = { SpawnId: s.SpawnId || "", ClassName: s.ClassName || "", Positions: (s.Positions || []).slice() };
        Object.keys(SPAWN_DEFAULTS).forEach((k) => {
          if (s[k] !== undefined && s[k] !== SPAWN_DEFAULTS[k]) ss[k] = s[k];
        });
        if (s.Respawn) ss.Respawn = true;
        return ss;
      });
    }
    out.Rewards = (d.Rewards || []).map(cleanReward);
    if (d.StartItems && d.StartItems.length) out.StartItems = d.StartItems.map(cleanReward);
    if (d.Reputation) out.Reputation = cleanRepRange(d.Reputation);
    if (d.ReputationLossOnAbandon) out.ReputationLossOnAbandon = d.ReputationLossOnAbandon;
    if (d.ReputationLossOnFail) out.ReputationLossOnFail = d.ReputationLossOnFail;
    if (d.ReputationLossNpcId) out.ReputationLossNpcId = d.ReputationLossNpcId;
    if (d.StartItemsOnFail) out.StartItemsOnFail = d.StartItemsOnFail;
    if (d.ReputationGainOnTurnBack) out.ReputationGainOnTurnBack = d.ReputationGainOnTurnBack;
    return out;
  }

  function preview() {
    const out = buildOutput(st.data);
    renderJson(st.els.preview, out);
    saveDraft("quest", st.data);
    st.els.status.textContent = (st.data.QuestId || "(ohne Id)") + " · " + st.data.Objectives.length + " Objective(s) · " + st.data.Rewards.length + " Reward(s)";
  }

  // ---------------------------------------------------------------- Validierung
  function checkCondRefs(node, ids, issues) {
    (node.Objectives || []).forEach((oid) => {
      if (!ids.has(oid)) issues.push({ level: "warn", msg: "Bedingung verweist auf unbekannte ObjectiveId '" + oid + "'." });
    });
    (node.Children || []).forEach((c) => checkCondRefs(c, ids, issues));
  }

  function validateQuest(d) {
    const issues = [];
    const err = (m) => issues.push({ level: "error", msg: m });
    const warn = (m) => issues.push({ level: "warn", msg: m });
    if (!d.QuestId) err("QuestId fehlt.");
    if (!d.QuestType) err("QuestType fehlt.");
    if (!d.Title) warn("Title ist leer.");
    if (!d.Objectives || d.Objectives.length === 0) err("Keine Objectives vorhanden.");
    const seen = new Set();
    (d.Objectives || []).forEach((o, i) => {
      const label = "Objective #" + (i + 1) + " ('" + (o.ObjectiveId || "") + "')";
      if (!o.ObjectiveId) err(label + ": ObjectiveId fehlt.");
      else if (seen.has(o.ObjectiveId)) err("ObjectiveId '" + o.ObjectiveId + "' mehrfach vergeben.");
      seen.add(o.ObjectiveId);
      if (!o.Type) err(label + ": Type fehlt.");
      if (!o.TargetValue || o.TargetValue < 1) err(label + ": TargetValue muss mindestens 1 sein.");
      (EQE.OBJECTIVE_PARAMS[o.Type] || [])
        .filter((s) => s.required)
        .forEach((s) => {
          if (!o.Params || !o.Params[s.key]) err(label + ": Parameter '" + s.key + "' fehlt.");
        });
    });
    if (d.Conditions && !isEmptyCond(d.Conditions)) {
      const ids = new Set((d.Objectives || []).map((o) => o.ObjectiveId));
      checkCondRefs(d.Conditions, ids, issues);
    }
    if (!d.Rewards || d.Rewards.length === 0) warn("Keine Rewards eingetragen.");
    (d.Rewards || []).concat(d.StartItems || []).forEach((r, i) => {
      if (r.Type === "Item" && !r.ClassName) err("Reward/StartItem #" + (i + 1) + ": ClassName fehlt (Type Item).");
    });
    EQE.validateRepRange(d.Reputation, "Reputation").forEach(err);
    (d.Spawns || []).forEach((s, i) => {
      const label = "Spawn #" + (i + 1) + " ('" + (s.SpawnId || "") + "')";
      if (!s.SpawnId) err(label + ": SpawnId fehlt.");
      if (!s.ClassName) err(label + ": ClassName fehlt.");
      if (!s.Positions || s.Positions.length === 0) err(label + ": mindestens eine Position nötig.");
      (s.Positions || []).forEach((p) => {
        if (!/^-?\d+(\.\d+)?\s+-?\d+(\.\d+)?\s+-?\d+(\.\d+)?$/.test(p.trim())) warn(label + ": Position '" + p + "' sieht nicht wie 'x y z' aus.");
      });
    });
    if (d.StartItemsOnFail === "TurnBack" && (!d.StartItems || d.StartItems.length === 0)) warn("StartItemsOnFail ist 'TurnBack', aber es sind keine StartItems eingetragen.");
    return issues;
  }

  EQE.Quest = { init };
})(window.EQE);
