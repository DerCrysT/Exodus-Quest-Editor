/**
 * Exodus Editor – Checkliste: merkt sich über die ganze Sitzung, welche JSON-Dateien hochgeladen und welche PBOs neu
 * gepackt werden müssen, und lässt dich sie abhaken. Einträge bleiben auch nach dem Speichern erhalten (bis sie erledigt
 * und entfernt sind), damit bei längeren Sitzungen nichts vergessen wird.
 */
(function (EQE) {
  "use strict";
  const h = EQE.h;
  const clear = EQE.clear;
  const P = () => EQE.Project;
  const KEY = "eqe:checklist:v1";

  const PBOS = {
    Exodus_Overrides: "Ordner Exodus_Overrides/Exodus_Overrides (mit $PBOPREFIX$.txt) als PBO packen.",
    Exodus_GM: "Innersten Ordner Exodus_GM (config.cpp + Skripte) als PBO packen, Prefix Exodus_GM.",
    XCP_SFP_Addon: "Geänderte config.cpp/Skripte in deinen Quellordner XCP_SFP_Addon kopieren und die PBO neu packen (Prefix XCP_SFP_Addon, nicht verschachtelt).",
  };
  const PBO_RE = /(?:^|\/)(Exodus_Overrides|Exodus_GM|XCP_SFP_Addon)(?:\/|$)/;

  let log = {};
  try {
    log = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch (e) {
    log = {};
  }
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(log));
    } catch (e) {
      /* egal */
    }
  };

  function current() {
    const pl = P().pendingList();
    const cur = {};
    pl.json.forEach((j) => (cur["j:" + j.path.toLowerCase()] = { type: "json", title: j.path, label: j.label }));
    pl.deletes.forEach((d) => (cur["d:" + d.path.toLowerCase()] = { type: "delete", title: d.path }));
    const packs = {};
    pl.files.forEach((f) => {
      const m = PBO_RE.exec(f);
      const name = m ? m[1] : f.split("/")[0];
      (packs[name] = packs[name] || []).push(f);
    });
    Object.keys(packs).forEach((n) => (cur["p:" + n] = { type: "pbo", title: n + ".pbo", files: packs[n].sort(), hint: PBOS[n] || "Ordner als PBO packen." }));
    return cur;
  }

  let timer = null;
  let overlay = null;
  function sync() {
    const cur = current();
    Object.keys(cur).forEach((id) => {
      const e = log[id];
      if (!e) log[id] = Object.assign({ done: false, pending: true }, cur[id]);
      else {
        if (!e.pending || (cur[id].files && JSON.stringify(e.files) !== JSON.stringify(cur[id].files))) e.done = false;
        e.pending = true;
        Object.assign(e, cur[id]);
      }
    });
    Object.keys(log).forEach((id) => {
      if (!cur[id]) log[id].pending = false;
    });
    if (!Object.keys(log).some((id) => log[id].type !== "static")) delete log["s:restart"];
    save();
    badge();
    if (overlay) renderModal();
  }
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(sync, 400);
  };

  const open = () => Object.keys(log).filter((id) => !log[id].done).length;
  function badge() {
    const b = document.getElementById("cl-count");
    if (b) {
      b.textContent = String(open());
      b.parentElement.classList.toggle("has-open", open() > 0);
    }
  }

  function group(type) {
    return Object.keys(log)
      .filter((id) => log[id].type === type)
      .sort()
      .map((id) => [id, log[id]]);
  }

  function renderModal() {
    if (!overlay) return;
    const body = overlay.querySelector(".cl-body");
    clear(body);
    const total = Object.keys(log).length;
    if (!total) {
      body.appendChild(h("div", { class: "empty-state", text: "Noch nichts zu tun. Sobald du etwas änderst, erscheint hier, welche Dateien du hochladen und welche PBOs du neu packen musst." }));
      return;
    }
    const row = (id, e, extra) =>
      h("label", { class: "cl-row" + (e.done ? " done" : "") }, [
        h("input", { type: "checkbox", checked: !!e.done, onchange: (ev) => ((e.done = ev.target.checked), save(), badge(), renderModal()) }),
        h("span", { class: "cl-text" }, [h("span", { class: "mono", text: e.title }), e.label ? h("span", { class: "pill", text: e.label }) : null, !e.pending ? h("span", { class: "muted small", text: " gespeichert" }) : h("span", { class: "small", style: "color:var(--warn,#d9a359)", text: " noch nicht gespeichert" }), extra || null]),
      ]);
    const jsons = group("json");
    const dels = group("delete");
    const pbos = group("pbo");
    if (jsons.length) {
      body.appendChild(h("h4", { text: "JSON-Dateien ins Server-Profil hochladen/kopieren (" + jsons.filter(([, e]) => !e.done).length + " offen)" }));
      jsons.forEach(([id, e]) => body.appendChild(row(id, e)));
    }
    if (dels.length) {
      body.appendChild(h("h4", { text: "Dateien im Server-Profil löschen" }));
      dels.forEach(([id, e]) => body.appendChild(row(id, e)));
    }
    if (pbos.length) {
      body.appendChild(h("h4", { text: "PBOs neu packen und auf den Server (" + pbos.filter(([, e]) => !e.done).length + " offen)" }));
      pbos.forEach(([id, e]) =>
        body.appendChild(
          row(id, e, h("div", { class: "small muted" }, [e.hint, h("ul", { class: "cl-files" }, (e.files || []).map((f) => h("li", { class: "mono", text: f })))]))
        )
      );
    }
    const restart = log["s:restart"] || (log["s:restart"] = { type: "static", title: "Server/Mod neu starten bzw. Mod aktualisieren, damit die Änderungen wirken", done: false, pending: true });
    body.appendChild(h("h4", { text: "Zum Schluss" }));
    body.appendChild(row("s:restart", restart));
  }

  function openModal() {
    if (overlay) return;
    sync();
    overlay = h("div", { class: "modal-backdrop cl-overlay", onclick: (e) => e.target === overlay && closeModal() }, [
      h("div", { class: "modal cl-modal" }, [
        h("div", { class: "modal-head" }, [h("span", { text: "Checkliste: was ist noch zu tun?" }), h("button", { class: "btn icon small", type: "button", text: "✕", onclick: closeModal })]),
        h("div", { class: "cl-body" }),
        h("div", { class: "toolbar" }, [
          h("button", { class: "btn small", type: "button", text: "Erledigte entfernen", onclick: () => (Object.keys(log).forEach((id) => log[id].done && delete log[id]), save(), badge(), renderModal()) }),
          h("button", { class: "btn small danger", type: "button", text: "Liste leeren", onclick: () => confirm("Gesamte Checkliste leeren?") && ((log = {}), save(), sync()) }),
          h("span", { class: "muted small", text: "Die Liste bleibt beim Speichern erhalten und wird im Browser gemerkt." }),
        ]),
      ]),
    ]);
    overlay.hidden = false;
    document.body.appendChild(overlay);
    renderModal();
  }
  function closeModal() {
    if (overlay) overlay.remove();
    overlay = null;
  }

  function init() {
    const btn = document.getElementById("checklist-btn");
    if (btn) btn.addEventListener("click", openModal);
    document.addEventListener("keydown", (e) => e.key === "Escape" && closeModal());
    P().on(schedule);
    badge();
    sync();
  }
  EQE.Checklist = { init: init };
})(window.EQE);
