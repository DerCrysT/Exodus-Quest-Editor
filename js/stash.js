/**
 * Exodus Quest Editor – Stash-Editor (Stash/*.json).
 */
window.EQE = window.EQE || {};

(function (EQE) {
  "use strict";
  const { h, clear, field, section, strList, renderJson, renderIssues, toast, copyText, download, openModal, closeModal, saveDraft, loadDraft } = EQE;

  const DEFAULTS = { Mode: "Container", ClassName: "SeaChest", Spread: 1.5, Rotation: 0, ActivationRadius: 200, DespawnRadius: 400 };

  function defaultStash() {
    return { StashId: "", Mode: "Container", ClassName: "SeaChest", Spread: 1.5, Position: "", Rotation: 0, ActivationRadius: 200, DespawnRadius: 400, Inventory: [] };
  }

  const st = { data: null };
  let preview = () => {};

  function init(root) {
    return EQE.createEditor({
      kind: "stash",
      root,
      title: "Stash",
      defaultJson: () => {
        const j = buildOutput(defaultStash());
        j.StashId = EQE.Project.uniqueId("stash", "stash_new");
        return j;
      },
      fromJson: (obj) => {
        const d = Object.assign(defaultStash(), obj);
        d.Inventory = (obj.Inventory || []).slice();
        return d;
      },
      toJson: buildOutput,
      buildForm,
      validate: validateStash,
      status: (d) => (d.StashId || "(ohne Id)") + " · " + d.Mode + " · " + d.Inventory.length + " Item(s)",
    });
  }

  function buildForm(d, ctx) {
    st.data = d;
    preview = ctx.changed;
    const form = ctx.form;

    const modeHint = h("div", { class: "help" });
    function updateModeHint() {
      modeHint.textContent =
        d.Mode === "Hidden"
          ? "Hidden: unsichtbarer Behälter – der Inhalt erscheint im Spielerinventar, sobald der Spieler an der Position steht."
          : d.Mode === "Ground"
          ? "Ground: kein Behälter – die Items liegen im Kreis (Spread) auf dem Boden, z. B. über einer Leiche."
          : "Container: ein sichtbarer Behälter (ClassName) wird an der Position erzeugt.";
    }
    updateModeHint();

    const classField = field({ label: "ClassName", key: "ClassName", obj: d, type: "text", help: "Nur Mode Container.", onChange: preview });
    const spreadField = field({ label: "Spread", key: "Spread", obj: d, type: "number", help: "Nur Mode Ground: Radius (m), auf dem die Items verteilt werden.", onChange: preview });
    function updateVisibility() {
      classField.style.display = d.Mode === "Container" ? "" : "none";
      spreadField.style.display = d.Mode === "Ground" ? "" : "none";
    }
    updateVisibility();

    form.appendChild(
      section("Grunddaten", "", [
        h("div", { class: "grid2" }, [
          field({ label: "StashId", key: "StashId", obj: d, type: "text", required: true, help: "Beim Umbenennen werden Verweise in Quests mitgezogen.", onChange: preview }),
          field({
            label: "Mode",
            key: "Mode",
            obj: d,
            type: "select",
            options: EQE.STASH_MODES,
            onChange: () => {
              updateModeHint();
              updateVisibility();
              preview();
            },
          }),
        ]),
        modeHint,
        h("div", { class: "grid2" }, [classField, spreadField]),
        h("div", { class: "grid3" }, [
          field({ label: "Position", key: "Position", obj: d, type: "text", required: true, placeholder: "x y z", onChange: preview }),
          field({ label: "Rotation", key: "Rotation", obj: d, type: "number", onChange: preview }),
        ]),
        h("div", { class: "grid2" }, [
          field({ label: "ActivationRadius", key: "ActivationRadius", obj: d, type: "number", help: "Container spawnt, wenn der Spieler diesen Radius betritt.", onChange: preview }),
          field({ label: "DespawnRadius", key: "DespawnRadius", obj: d, type: "number", help: "Container despawnt beim Verlassen dieses Radius.", onChange: preview }),
        ]),
      ])
    );

    form.appendChild(
      section("Inhalt", "Klassen, die beim Spawn im Container erzeugt werden (bei DeliverContainer ignoriert)", [
        strList({ items: d.Inventory, placeholder: "Klasse + Enter", onChange: preview }),
      ])
    );

  }

  function buildOutput(d) {
    const out = { StashId: d.StashId || "" };
    if (d.Mode && d.Mode !== DEFAULTS.Mode) out.Mode = d.Mode;
    if (d.Mode !== "Ground" && d.ClassName && d.ClassName !== DEFAULTS.ClassName) out.ClassName = d.ClassName;
    else if (d.Mode === "Hidden") delete out.ClassName;
    if (d.Mode === "Ground" && d.Spread !== undefined && d.Spread !== DEFAULTS.Spread) out.Spread = d.Spread;
    out.Position = d.Position || "";
    if (d.Rotation) out.Rotation = d.Rotation;
    if (d.ActivationRadius !== undefined && d.ActivationRadius !== DEFAULTS.ActivationRadius) out.ActivationRadius = d.ActivationRadius;
    if (d.DespawnRadius !== undefined && d.DespawnRadius !== DEFAULTS.DespawnRadius) out.DespawnRadius = d.DespawnRadius;
    if (d.Inventory && d.Inventory.length) out.Inventory = d.Inventory.slice();
    return out;
  }

  function validateStash(d) {
    const issues = [];
    const err = (m) => issues.push({ level: "error", msg: m });
    const warn = (m) => issues.push({ level: "warn", msg: m });
    if (!d.StashId) err("StashId fehlt.");
    if (!/^-?\d+(\.\d+)?\s+-?\d+(\.\d+)?\s+-?\d+(\.\d+)?$/.test((d.Position || "").trim())) err("Position fehlt oder sieht nicht wie 'x y z' aus.");
    if (d.Mode === "Container" && !d.ClassName) err("ClassName fehlt (Mode Container).");
    if (d.Mode !== "Container" && d.Inventory.length === 0) warn("Inventory ist leer – der Stash hätte nichts, das entnommen werden kann.");
    return issues;
  }

  EQE.Stash = { init };
})(window.EQE);
