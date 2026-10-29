/**
 * Exodus Quest Editor – Tab-Umschaltung, globales Drag&Drop und Start.
 */
(function () {
  "use strict";
  const EQE = window.EQE;
  const TAB_KEY = "eqe:tab";
  const refreshers = {};

  function switchTab(name) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === "panel-" + name));
    if (EQE.editors[name]) EQE.editors[name].reload();
    if (refreshers[name]) refreshers[name]();
    document.getElementById("tabs").classList.remove("open");
    try {
      localStorage.setItem(TAB_KEY, name);
    } catch (e) {
      /* egal */
    }
  }
  EQE.switchTab = switchTab;

  /** Datei in ihrem Editor öffnen (springt auf den passenden Tab). */
  EQE.openItem = function (uid) {
    const item = EQE.Project.get(uid);
    if (!item) return;
    if (!EQE.editors[item.kind]) {
      switchTab(EQE.Project.MAP_KINDS.indexOf(item.kind) > -1 ? "map" : "project");
      return;
    }
    switchTab(item.kind);
    EQE.editors[item.kind].open(uid);
  };

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".tab").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

    const project = EQE.Overview.initProject(document.getElementById("panel-project"));
    const mapTab = EQE.MapTab.init(document.getElementById("panel-map"));
    refreshers.map = mapTab.refresh;
    const overrides = EQE.Overrides.init(document.getElementById("panel-overrides"));
    refreshers.overrides = overrides.refresh;
    const overview = EQE.Overview.initOverview(document.getElementById("panel-overview"));
    refreshers.project = project.refresh;
    refreshers.overview = overview.refresh;
    EQE.Quest.init(document.getElementById("panel-quest"));
    EQE.Npc.init(document.getElementById("panel-npc"));
    EQE.Dialog.init(document.getElementById("panel-dialog"));
    EQE.Stash.init(document.getElementById("panel-stash"));
    EQE.Trader.initTrader(document.getElementById("panel-trader"));
    EQE.Trader.initTcat(document.getElementById("panel-tcat"));
    EQE.Trader.initBcat(document.getElementById("panel-bcat"));

    // Menü auf schmalen Bildschirmen ein-/ausklappen
    const navToggle = document.getElementById("nav-toggle");
    const sidenav = document.getElementById("tabs");
    navToggle.addEventListener("click", () => sidenav.classList.toggle("open"));

    // Drag&Drop über das ganze Fenster
    const overlay = document.querySelector('[data-el="drop-overlay"]');
    let depth = 0;
    const hasFiles = (e) => e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") > -1;
    window.addEventListener("dragenter", (e) => {
      if (!hasFiles(e)) return;
      depth++;
      overlay.hidden = false;
    });
    window.addEventListener("dragleave", (e) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) overlay.hidden = true;
    });
    window.addEventListener("dragover", (e) => {
      if (hasFiles(e)) e.preventDefault();
    });
    window.addEventListener("drop", async (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      overlay.hidden = true;
      await EQE.Project.ingestDrop(e.dataTransfer);
      switchTab("project");
    });

    // Globaler Button: alle neuen/geänderten Dateien als ZIP
    const dlBtn = document.getElementById("dl-changed");
    const dlCount = document.getElementById("dl-count");
    const updateCount = () => {
      const n = EQE.Project.changedCount();
      dlCount.textContent = String(n);
      dlBtn.disabled = n === 0;
    };
    const direct = EQE.Project.canWriteFolder();
    dlBtn.firstChild.textContent = direct ? "Änderungen speichern " : "Geänderte Dateien laden ";
    dlBtn.title = direct ? "Neue/geänderte Dateien in den Projektordner schreiben, gelöschte dort entfernen" : "Alle neuen/geänderten Dateien als ZIP herunterladen";
    dlBtn.addEventListener("click", () => (direct ? EQE.Project.saveToFolder() : EQE.Project.downloadZip(true)));
    EQE.Project.on(updateCount);
    updateCount();

    // Nach dem Laden von Dateien zur Projekt-Übersicht springen
    EQE.Project.on((ev) => {
      if (ev.type === "ingest") switchTab("project");
    });

    let startTab = "project";
    try {
      startTab = localStorage.getItem(TAB_KEY) || "project";
    } catch (e) {
      /* egal */
    }
    if (!document.getElementById("panel-" + startTab)) startTab = "project";
    switchTab(startTab);
  });
})();
