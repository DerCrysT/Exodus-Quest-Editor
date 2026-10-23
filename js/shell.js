/**
 * Exodus Quest Editor – Editor-Gerüst. Jeder Editor (Quest/NPC/Dialog/Stash) liefert nur sein Formular, die
 * Umwandlung Daten <-> JSON und die Prüfregeln; Dateiauswahl, Neu/Duplizieren/Löschen, Vorschau, Export,
 * Autosave ins Projekt und Umbenennen mit Referenz-Update übernimmt dieses Gerüst.
 */
window.EQE = window.EQE || {};
EQE.editors = EQE.editors || {};

(function (EQE) {
  "use strict";
  const { h, clear } = EQE;

  /**
   * cfg: {
   *   kind, root, title,
   *   defaultJson(project): JSON für eine neue Datei
   *   fromJson(json): Formulardaten, toJson(data): JSON
   *   buildForm(data, ctx): hängt Abschnitte an ctx.form; ctx.changed() nach jeder Änderung
   *   validate(data): [{level,msg}]
   *   status(data): Text
   *   itemFilter(item): optional, welche Dateien im Auswahlfeld erscheinen
   *   header(api): optional, Node über dem Formular
   *   afterCreate(item, api): optional
   *   ingame: optional { label, render(container, data, out, api) }
   * }
   */
  EQE.createEditor = function (cfg) {
    const kind = cfg.kind;
    const ID_KEY = EQE.Project.ID_KEY[kind];
    const st = { uid: null, data: null, baseline: null, lastStr: null, refId: "", view: "json" };
    const lastKey = "eqe:last:" + kind;

    const select = h("select", { class: "item-select", onchange: (e) => open(e.target.value) });
    const status = h("span", { class: "status" });
    const btn = (text, cls, fn, title) => h("button", { class: "btn " + (cls || ""), type: "button", text, title: title || "", onclick: fn });

    const bar = h("div", { class: "toolbar" }, [
      h("span", { class: "bar-label", text: cfg.title + ":" }),
      select,
      btn("Neu", "", () => createNew(), "Neue, leere Datei anlegen"),
      btn("Duplizieren", "", () => duplicate()),
      btn("Löschen", "danger", () => removeCurrent()),
      h("span", { class: "spacer" }),
      status,
      btn("JSON einfügen…", "", () => pasteJson()),
      btn("Prüfen", "", () => runValidate()),
      btn("JSON kopieren", "primary", () => {
        if (st.uid) EQE.copyText(currentText());
      }),
      btn("Herunterladen", "primary", () => download()),
    ]);

    const form = h("div", { class: "col col-form" });
    const pre = h("pre", { class: "preview" });
    const ingame = h("div", { class: "ingame", hidden: true });
    const issues = h("div", { class: "issues" });
    const viewTabs = h("div", { class: "view-tabs" }, [
      btn("JSON", "small active", () => setView("json")),
      cfg.ingame ? btn(cfg.ingame.label || "Ingame", "small", () => setView("ingame")) : null,
    ]);
    const previewCol = h("div", { class: "col col-preview" }, [h("div", { class: "preview-head" }, [h("span", { text: "Vorschau" }), viewTabs]), pre, ingame, issues]);
    const empty = h("div", { class: "empty-state", hidden: true }, [
      h("p", { text: "Noch keine " + cfg.title + "-Datei im Projekt." }),
      h("p", {}, [btn("+ Neu anlegen", "primary", () => createNew()), " ", btn("Dateien laden…", "", () => EQE.Project.pick(false)), " ", btn("Ordner laden…", "", () => EQE.Project.pick(true))]),
    ]);
    const headerNode = cfg.header ? cfg.header(api()) : null;
    const layout = h("div", { class: "layout" }, [form, previewCol]);
    cfg.root.appendChild(bar);
    if (headerNode) cfg.root.appendChild(headerNode);
    cfg.root.appendChild(empty);
    cfg.root.appendChild(layout);

    function setView(v) {
      st.view = v;
      viewTabs.querySelectorAll("button").forEach((b, i) => b.classList.toggle("active", (i === 0 && v === "json") || (i === 1 && v === "ingame")));
      pre.hidden = v !== "json";
      ingame.hidden = v !== "ingame";
      renderPreview();
    }

    function api() {
      return {
        kind,
        open,
        reload,
        refreshSelector,
        currentUid: () => st.uid,
        data: () => st.data,
        changed,
        rebuild: build,
      };
    }
    const apiObj = api();

    function visibleItems() {
      const all = EQE.Project.byKind(kind);
      return cfg.itemFilter ? all.filter((i) => cfg.itemFilter(i)) : all;
    }

    function refreshSelector() {
      const list = visibleItems();
      clear(select);
      list.forEach((it) => {
        select.appendChild(h("option", { value: it.uid, selected: it.uid === st.uid, text: (EQE.Project.isChanged(it) ? "● " : "") + EQE.Project.labelOf(it) + (EQE.Project.nameOf(it) && kind !== "stash" ? " – " + EQE.Project.nameOf(it) : "") }));
      });
      if (st.uid && !list.some((i) => i.uid === st.uid)) {
        const it = EQE.Project.get(st.uid);
        if (it) select.appendChild(h("option", { value: it.uid, selected: true, text: EQE.Project.labelOf(it) }));
      }
      select.disabled = list.length === 0;
    }

    function open(uid) {
      const item = uid ? EQE.Project.get(uid) : null;
      if (!item) {
        st.uid = null;
        st.data = null;
        showEmpty(true);
        refreshSelector();
        return;
      }
      showEmpty(false);
      st.uid = uid;
      st.data = cfg.fromJson(item.json);
      st.baseline = null;
      st.lastStr = null;
      st.refId = st.data[ID_KEY] || "";
      try {
        localStorage.setItem(lastKey, uid);
      } catch (e) {
        /* egal */
      }
      build();
    }

    function showEmpty(on) {
      empty.hidden = !on;
      layout.hidden = on;
      if (on) status.textContent = "";
    }

    function build() {
      if (!st.uid) return;
      clear(form);
      const ctx = { form, changed, rebuild: build, uid: st.uid, api: apiObj };
      cfg.buildForm(st.data, ctx);
      clear(issues);
      changed();
      refreshSelector();
    }

    /** Wird nach jeder Eingabe aufgerufen: JSON bauen, ins Projekt schreiben, Vorschau/Status aktualisieren. */
    function changed() {
      if (!st.uid || !st.data) return;
      const out = cfg.toJson(st.data);
      const str = JSON.stringify(out);
      if (str !== st.lastStr) {
        if (st.baseline === null) st.baseline = str;
        else {
          EQE.Project.setJson(st.uid, out);
        }
        st.lastStr = str;
        const id = st.data[ID_KEY] || "";
        if (id && st.refId && id !== st.refId) {
          const n = EQE.Project.renameRefs(kind, st.refId, id, st.uid);
          if (n > 0) EQE.toast(n + " Verweis(e) auf '" + id + "' in anderen Dateien angepasst.");
        }
        if (id) st.refId = id;
      }
      status.textContent = cfg.status ? cfg.status(st.data) : "";
      renderPreview(out);
    }

    function renderPreview(out) {
      if (!st.uid || !st.data) return;
      out = out || cfg.toJson(st.data);
      if (st.view === "json") EQE.renderJson(pre, out);
      else if (cfg.ingame) cfg.ingame.render(ingame, st.data, out, apiObj);
    }

    function currentText() {
      return JSON.stringify(cfg.toJson(st.data), null, 2) + "\n";
    }

    function download() {
      if (!st.uid) return;
      const item = EQE.Project.get(st.uid);
      let name = (st.data[ID_KEY] || "datei") + ".json";
      if (item && item.path) name = item.path.split("/").pop();
      EQE.download(name, currentText());
    }

    function runValidate() {
      if (!st.uid) return;
      const local = cfg.validate(st.data);
      const cross = EQE.Project.crossCheck()
        .filter((i) => i.uid === st.uid)
        .map((i) => ({ level: i.level, msg: i.msg }));
      EQE.renderIssues(issues, local.concat(cross));
    }

    function createNew() {
      const json = cfg.defaultJson();
      const item = EQE.Project.create(kind, json);
      if (cfg.afterCreate) cfg.afterCreate(item, apiObj);
      open(item.uid);
    }

    function duplicate() {
      if (!st.uid) return;
      const copy = JSON.parse(JSON.stringify(cfg.toJson(st.data)));
      copy[ID_KEY] = EQE.Project.uniqueId(kind, (copy[ID_KEY] || kind) + "_copy");
      const item = EQE.Project.create(kind, copy);
      if (cfg.afterCreate) cfg.afterCreate(item, apiObj);
      open(item.uid);
    }

    function removeCurrent() {
      if (!st.uid) return;
      const item = EQE.Project.get(st.uid);
      if (!confirm("'" + EQE.Project.labelOf(item) + "' aus dem Projekt entfernen? (Die Datei auf deinem Rechner bleibt unberührt.)")) return;
      EQE.Project.remove(st.uid);
      const list = visibleItems();
      open(list.length ? list[0].uid : null);
    }

    function pasteJson() {
      const ta = h("textarea", { placeholder: "JSON hier einfügen – Quest, NPC, Dialog oder Stash werden automatisch erkannt…" });
      const b = h("button", {
        class: "btn primary",
        type: "button",
        text: "Übernehmen",
        onclick: () => {
          try {
            const r = EQE.Project.ingestText(ta.value);
            EQE.closeModal();
            EQE.toast(EQE.Project.KIND_LABEL[r.kind] + " übernommen" + (r.replaced ? " (vorhandene ersetzt)" : "") + ".");
            EQE.openItem(r.item.uid);
          } catch (e) {
            EQE.toast("Ungültiges JSON: " + e.message, true);
          }
        },
      });
      EQE.openModal("JSON einfügen", h("div", {}, [ta, h("div", { style: "margin-top:10px" }, [b])]));
    }

    function reload() {
      // Beim Wechsel auf den Tab: Auswahl prüfen und aktuelle Datei frisch aus dem Projekt laden
      const list = visibleItems();
      let target = st.uid && list.some((i) => i.uid === st.uid) && EQE.Project.get(st.uid) ? st.uid : null;
      if (!target) {
        let last = null;
        try {
          last = localStorage.getItem(lastKey);
        } catch (e) {
          /* egal */
        }
        target = list.some((i) => i.uid === last) ? last : list.length ? list[0].uid : null;
      }
      open(target);
    }

    EQE.Project.on((ev) => {
      if (ev.type === "json" || ev.type === "add" || ev.type === "remove" || ev.type === "clear" || ev.type === "refs") refreshSelector();
    });

    const editor = {
      kind,
      open,
      reload,
      refreshSelector,
      validateJson: (json) => cfg.validate(cfg.fromJson(json)),
      currentUid: () => st.uid,
    };
    EQE.editors[kind] = editor;
    return editor;
  };

  // ---------------------------------------------------------------- Zuweisung NPC <-> Quest/Dialog
  /**
   * assignSection(kind, getId, rows)
   * rows: [{ field: 'Quests', label: 'Angeboten von' }, ...]
   */
  EQE.assignSection = function (title, hint, getId, rows) {
    const body = h("div", {});
    function render() {
      clear(body);
      const id = getId();
      if (!id) {
        body.appendChild(h("div", { class: "help", text: "Erst eine ID vergeben, dann lässt sich die Datei NPCs zuweisen." }));
        return;
      }
      const npcs = EQE.Project.byKind("npc");
      if (npcs.length === 0) {
        body.appendChild(h("div", { class: "help", text: "Noch keine NPCs im Projekt – im Tab „Projekt“ Dateien laden oder im NPC-Tab einen NPC anlegen." }));
        return;
      }
      rows.forEach((row) => {
        const holders = EQE.Project.npcsWith(row.field, id);
        const chips = h(
          "div",
          { class: "strlist" },
          holders.length
            ? holders.map((n) =>
                h("span", { class: "chip" }, [
                  h("a", { href: "#", text: EQE.Project.labelOf(n), onclick: (e) => { e.preventDefault(); EQE.openItem(n.uid); } }),
                  h("button", { type: "button", text: "✕", title: "Zuweisung entfernen", onclick: () => { EQE.Project.unassign(n.uid, row.field, id); render(); } }),
                ])
              )
            : [h("span", { class: "help", text: "Noch keinem NPC zugewiesen." })]
        );
        const free = npcs.filter((n) => holders.indexOf(n) < 0);
        const sel = h("select", {}, [h("option", { value: "", text: "NPC wählen…" })].concat(free.map((n) => h("option", { value: n.uid, text: EQE.Project.labelOf(n) + (EQE.Project.nameOf(n) ? " – " + EQE.Project.nameOf(n) : "") }))));
        const add = h("button", {
          class: "btn small",
          type: "button",
          text: "Zuweisen",
          onclick: () => {
            if (sel.value) {
              EQE.Project.assign(sel.value, row.field, id);
              render();
            }
          },
        });
        body.appendChild(h("div", { class: "field" }, [h("label", { text: row.label }), chips, h("div", { class: "assign-add" }, [sel, add])]));
      });
    }
    render();
    const sec = EQE.section(title, hint, [body]);
    sec._render = render;
    return sec;
  };
})(window.EQE);
