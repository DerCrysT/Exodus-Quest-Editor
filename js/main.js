/**
 * Exodus Quest Editor – Tab-Umschaltung und Start.
 */
(function () {
  "use strict";

  function switchTab(name) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === "panel-" + name));
    try {
      localStorage.setItem("eqe:tab", name);
    } catch (e) {
      /* egal */
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".tab").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

    window.EQE.Quest.init(document.getElementById("panel-quest"));
    window.EQE.Npc.init(document.getElementById("panel-npc"));
    window.EQE.Dialog.init(document.getElementById("panel-dialog"));
    window.EQE.Stash.init(document.getElementById("panel-stash"));

    let startTab = "quest";
    try {
      startTab = localStorage.getItem("eqe:tab") || "quest";
    } catch (e) {
      /* egal */
    }
    if (document.getElementById("panel-" + startTab)) switchTab(startTab);
  });
})();
