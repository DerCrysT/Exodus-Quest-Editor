/**
 * Exodus Quest Editor – Projekt-Tab (Dateien laden, Liste, Gesamtprüfung, ZIP-Export) und NPC-Übersicht.
 */
window.EQE = window.EQE || {};

(function (EQE) {
  "use strict";
  const { h, clear } = EQE;
  const P = () => EQE.Project;

  // ============================================================== Projekt-Tab
  const pstate = { filter: "", kind: "", results: null };

  function initProject(root) {
    const host = h("div", { class: "project" });
    root.appendChild(host);

    function summaryCards() {
      const core = ["quest", "npc", "dialog", "stash", "trader"];
      const kinds = P().KINDS.filter((k) => core.indexOf(k) > -1 || P().byKind(k).length > 0);
      return h(
        "div",
        { class: "stat-row" },
        kinds
          .map((k) => h("div", { class: "stat" }, [h("div", { class: "stat-num", text: String(P().byKind(k).length) }), h("div", { class: "stat-label", text: P().KIND_LABEL[k] })]))
          .concat([h("div", { class: "stat changed" }, [h("div", { class: "stat-num", text: String(P().changedCount()) }), h("div", { class: "stat-label", text: "neu / geändert" })])])
      );
    }

    function runCheck() {
      const rows = [];
      P()
        .items()
        .forEach((it) => {
          const ed = EQE.editors[it.kind];
          let local = [];
          try {
            local = ed ? ed.validateJson(it.json, it) : [];
          } catch (e) {
            local = [{ level: "error", msg: "Datei konnte nicht geprüft werden: " + e.message }];
          }
          local.forEach((i) => rows.push({ level: i.level, uid: it.uid, kind: it.kind, id: P().idOf(it), msg: i.msg }));
        });
      P()
        .crossCheck()
        .forEach((i) => rows.push(i));
      const seen = new Set();
      pstate.results = rows.filter((r) => {
        const key = r.uid + "|" + r.msg;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      render();
    }

    const downloadZip = (onlyChanged) => P().downloadZip(onlyChanged);

    function tableBody() {
      const f = pstate.filter.toLowerCase();
      const counts = {};
      (pstate.results || []).forEach((r) => {
        counts[r.uid] = counts[r.uid] || { error: 0, warn: 0 };
        counts[r.uid][r.level] = (counts[r.uid][r.level] || 0) + 1;
      });
      const rows = P()
        .items()
        .filter((it) => (!pstate.kind || it.kind === pstate.kind) && (!f || (P().idOf(it) + " " + P().nameOf(it) + " " + (it.path || "")).toLowerCase().indexOf(f) > -1));
      if (!rows.length) return [h("tr", {}, [h("td", { colspan: "6", class: "muted", text: P().items().length ? "Keine Treffer." : "Noch keine Dateien – oben laden oder in einem Editor „Neu“ wählen." })])];
      return rows.map((it) => {
        const c = counts[it.uid];
        return h("tr", {}, [
          h("td", {}, [h("span", { class: "kind kind-" + it.kind, text: P().KIND_LABEL[it.kind] })]),
          h("td", { class: "mono", text: P().labelOf(it) }),
          h("td", { text: it.kind === "stash" ? "" : P().nameOf(it) }),
          h("td", { class: "mono muted", text: P().exportPath(it) }),
          h("td", {}, [
            P().isChanged(it) ? h("span", { class: "pill", text: it.isNew ? "neu" : "geändert" }) : null,
            c && c.error ? h("span", { class: "pill err", text: c.error + " Fehler" }) : null,
            c && c.warn ? h("span", { class: "pill warn", text: c.warn + " Warn." }) : null,
          ]),
          h("td", { class: "actions" }, [
            h("button", { class: "btn small", type: "button", text: "Öffnen", onclick: () => EQE.openItem(it.uid) }),
            h("button", { class: "btn small danger", type: "button", text: "✕", title: "Aus dem Projekt entfernen", onclick: () => { if (confirm("'" + P().labelOf(it) + "' aus dem Projekt entfernen?")) P().remove(it.uid); } }),
          ]),
        ]);
      });
    }

    function render() {
      clear(host);
      const drop = h("div", { class: "dropzone" }, [
        h("div", { class: "drop-title", text: "Dateien oder ganze Ordner hierher ziehen" }),
        h("div", { class: "help", text: "Der Typ (Quest / NPC / Dialog / Stash) wird automatisch erkannt. Config.json, Spielerdaten u. Ä. werden übersprungen. Gleiche IDs ersetzen vorhandene Einträge." }),
        h("div", { class: "drop-buttons" }, [
          h("button", { class: "btn primary", type: "button", text: "Ordner wählen… (z. B. ExodusQuests-Profilordner)", onclick: () => P().pick(true) }),
          h("button", { class: "btn", type: "button", text: "Einzelne Dateien wählen…", onclick: () => P().pick(false) }),
        ]),
      ]);
      const actions = h("div", { class: "toolbar" }, [
        h("button", { class: "btn", type: "button", text: "Alles prüfen", onclick: runCheck }),
        h("span", { class: "spacer" }),
        P().canWriteFolder()
          ? h("button", { class: "btn primary", type: "button", title: "Schreibt neue/geänderte Dateien in den gewählten Projektordner und löscht dort die im Editor entfernten Dateien", text: "In Projektordner speichern…", onclick: () => P().saveToFolder() })
          : null,
        h("button", { class: "btn primary", type: "button", text: "ZIP: nur Geändertes", onclick: () => downloadZip(true) }),
        h("button", { class: "btn primary", type: "button", text: "ZIP: alles", onclick: () => downloadZip(false) }),
        h("button", { class: "btn danger", type: "button", text: "Projekt leeren", onclick: () => { if (confirm("Alle Dateien aus dem Projekt entfernen? (Deine Dateien auf dem Rechner bleiben unberührt, ungesicherte Änderungen gehen verloren.)")) { pstate.results = null; P().clearAll(); } } }),
      ]);

      const parts = [drop, summaryCards(), actions];

      const dels = P().pendingDeletes();
      if (dels.length) {
        parts.push(
          h("div", { class: "card" }, [
            h("h3", { text: "Beim Export zu löschen (" + dels.length + ")" }),
            h("p", { class: "hint", text: "Im Editor gelöscht oder umbenannt. „In Projektordner speichern“ entfernt sie direkt; das ZIP enthält _LOESCHEN.txt und _loeschen.bat." }),
            h("ul", {}, dels.slice(0, 30).map((d) => h("li", {}, [h("code", { text: d.path })]))),
            dels.length > 30 ? h("p", { class: "hint", text: "… und " + (dels.length - 30) + " weitere" }) : null,
          ])
        );
      }

      if (pstate.results) {
        const errs = pstate.results.filter((r) => r.level === "error").length;
        const warns = pstate.results.length - errs;
        const box = h("div", { class: "check-box" }, [h("div", { class: "check-head", text: pstate.results.length ? errs + " Fehler, " + warns + " Warnung(en)" : "Alles in Ordnung – keine Probleme gefunden." })]);
        pstate.results.forEach((r) =>
          box.appendChild(
            h("div", { class: "issue " + r.level }, [
              h("strong", { text: P().KIND_LABEL[r.kind] + " " + (r.id || "(unbenannt)") + ": " }),
              r.msg,
              " ",
              h("a", { href: "#", text: "öffnen", onclick: (e) => { e.preventDefault(); EQE.openItem(r.uid); } }),
            ])
          )
        );
        parts.push(box);
      }

      const tbody = h("tbody", {}, tableBody());
      const filter = h("input", {
        type: "text",
        placeholder: "Suchen (ID, Name, Pfad)…",
        value: pstate.filter,
        oninput: (e) => {
          pstate.filter = e.target.value;
          clear(tbody);
          tableBody().forEach((r) => tbody.appendChild(r));
        },
      });
      const kindSel = h(
        "select",
        {
          onchange: (e) => {
            pstate.kind = e.target.value;
            clear(tbody);
            tableBody().forEach((r) => tbody.appendChild(r));
          },
        },
        [h("option", { value: "", text: "Alle Typen" })].concat(P().KINDS.map((k) => h("option", { value: k, selected: pstate.kind === k, text: P().KIND_LABEL[k] })))
      );
      parts.push(h("div", { class: "toolbar" }, [filter, kindSel]));
      parts.push(h("table", { class: "ptable" }, [h("thead", {}, [h("tr", {}, ["Typ", "ID", "Name / Titel", "Export-Pfad", "Status", ""].map((t) => h("th", { text: t })))]), tbody]));
      parts.forEach((p) => host.appendChild(p));
    }

    let raf = null;
    P().on((ev) => {
      if (ev.type === "json") return; // Tipp-Ereignisse nicht neu zeichnen
      if (!root.classList.contains("active")) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(render);
    });
    render();
    return { refresh: render };
  }

  // ============================================================== NPC-Übersicht
  function initOverview(root) {
    const host = h("div", { class: "overview" });
    root.appendChild(host);

    function chip(text, cls, onclick, title) {
      return h("span", { class: "chip " + (cls || ""), title: title || "", onclick }, [h("span", { text })]);
    }
    /** Anzeigename eines NPCs (Name, sonst ID); Unbekannte bleiben bei der ID. */
    function npcLabel(id) {
      const it = P().find("npc", id);
      return it && it.json.Name ? it.json.Name : id;
    }
    function openBy(kind, id) {
      const it = P().find(kind, id);
      return it ? () => EQE.openItem(it.uid) : null;
    }

    function npcCard(it, allNpcs) {
      const j = it.json;
      const id = P().idOf(it);
      const asEnemy = allNpcs.filter((o) => (o.json.ReputationEnemies || []).some((l) => l.NpcId === id));
      const asAlly = allNpcs.filter((o) => (o.json.ReputationAllies || []).some((l) => l.NpcId === id));
      const quests = (j.Quests || []).map((q) => {
        const qi = P().find("quest", q);
        return chip(qi && qi.json.Title ? q + " – " + qi.json.Title : q, qi ? "" : "bad", openBy("quest", q), qi ? "" : "Quest existiert nicht im Projekt");
      });
      const daily = (j.DailyPool || []).map((q) => chip(q, P().find("quest", q) ? "" : "bad", openBy("quest", q)));
      const dialogs = (j.Dialogs || []).map((d) => {
        const di = P().find("dialog", d);
        return chip(di && di.json.Title ? d + " – " + di.json.Title : d, di ? "" : "bad", openBy("dialog", d), di ? "" : "Dialog existiert nicht im Projekt");
      });
      const links = (arr, cls) =>
        (arr || []).map((l) => chip(npcLabel(l.NpcId) + " ×" + (l.Factor === undefined ? 1 : l.Factor), P().find("npc", l.NpcId) ? cls : "bad", openBy("npc", l.NpcId), l.NpcId + " · Faktor " + (l.Factor === undefined ? 1 : l.Factor)));
      const row = (label, nodes, empty) =>
        h("div", { class: "ov-row" }, [h("div", { class: "ov-label", text: label }), h("div", { class: "strlist" }, nodes.length ? nodes : [h("span", { class: "muted", text: empty || "—" })])]);

      return h("div", { class: "ov-card" }, [
        h("div", { class: "ov-head" }, [
          h("div", {}, [h("div", { class: "ov-name", text: j.Name || "(ohne Namen)" }), h("div", { class: "mono muted", text: id })]),
          h("div", { class: "ov-actions" }, [
            h("span", { class: "pill", text: j.Mode || "NPC" }),
            h("button", { class: "btn small", type: "button", text: "Bearbeiten", onclick: () => EQE.openItem(it.uid) }),
          ]),
        ]),
        h("div", { class: "muted small", text: [j.Role, j.Location, j.Faction].filter((x) => x).join(" · ") }),
        row("Quests (" + quests.length + ")", quests, "keine festen Quests"),
        daily.length ? row("Daily-Pool (" + daily.length + ", " + (j.DailyCount || 3) + " je Spieler)", daily) : null,
        row("Dialoge (" + dialogs.length + ")", dialogs, "keine Dialoge"),
        row("Verbündete (Ruf folgt gleichsinnig)", links(j.ReputationAllies, "good")),
        row("Rivalen (Ruf folgt gegensinnig)", links(j.ReputationEnemies, "bad2")),
        asEnemy.length || asAlly.length
          ? h("div", { class: "ov-row" }, [
              h("div", { class: "ov-label", text: "Von anderen so eingetragen" }),
              h("div", { class: "strlist" }, asAlly.map((o) => chip("Verbündeter von " + npcLabel(P().idOf(o)), "good", () => EQE.openItem(o.uid), P().idOf(o))).concat(asEnemy.map((o) => chip("Rivale von " + npcLabel(P().idOf(o)), "bad2", () => EQE.openItem(o.uid), P().idOf(o))))),
            ])
          : null,
      ]);
    }

    function graph(npcs) {
      const edges = [];
      npcs.forEach((n) => {
        (n.json.ReputationAllies || []).forEach((l) => edges.push({ from: P().idOf(n), to: l.NpcId, f: l.Factor === undefined ? 1 : l.Factor, enemy: false }));
        (n.json.ReputationEnemies || []).forEach((l) => edges.push({ from: P().idOf(n), to: l.NpcId, f: l.Factor === undefined ? 1 : l.Factor, enemy: true }));
      });
      if (npcs.length < 2 || !edges.length) return h("div", { class: "muted", text: "Noch keine Ruf-Verknüpfungen zwischen NPCs – im NPC-Editor unter „Ruf-Verknüpfungen“ eintragen." });
      const ids = npcs.map((n) => P().idOf(n));
      const W = 720;
      const H = 460;
      const cx = W / 2;
      const cy = H / 2;
      const R = Math.min(W, H) / 2 - 70;
      const pos = {};
      ids.forEach((id, i) => {
        const a = (i / ids.length) * Math.PI * 2 - Math.PI / 2;
        pos[id] = { x: cx + R * 1.35 * Math.cos(a), y: cy + R * Math.sin(a) };
      });
      const NS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      svg.setAttribute("class", "ov-graph");
      const defs = document.createElementNS(NS, "defs");
      ["good", "bad"].forEach((k) => {
        const m = document.createElementNS(NS, "marker");
        m.setAttribute("id", "arr-" + k);
        m.setAttribute("viewBox", "0 0 10 10");
        m.setAttribute("refX", "9");
        m.setAttribute("refY", "5");
        m.setAttribute("markerWidth", "7");
        m.setAttribute("markerHeight", "7");
        m.setAttribute("orient", "auto-start-reverse");
        const pth = document.createElementNS(NS, "path");
        pth.setAttribute("d", "M0,0 L10,5 L0,10 z");
        pth.setAttribute("fill", k === "good" ? "#7aa364" : "#c25c4f");
        m.appendChild(pth);
        defs.appendChild(m);
      });
      svg.appendChild(defs);
      edges.forEach((e) => {
        const a = pos[e.from];
        const b = pos[e.to];
        if (!a || !b) return;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const sx = a.x + (dx / len) * 26;
        const sy = a.y + (dy / len) * 16;
        const ex = b.x - (dx / len) * 30;
        const ey = b.y - (dy / len) * 20;
        const mx = (sx + ex) / 2 - (dy / len) * 22;
        const my = (sy + ey) / 2 + (dx / len) * 22;
        const path = document.createElementNS(NS, "path");
        path.setAttribute("d", "M" + sx + "," + sy + " Q" + mx + "," + my + " " + ex + "," + ey);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", e.enemy ? "#c25c4f" : "#7aa364");
        path.setAttribute("stroke-width", String(1 + e.f * 2));
        path.setAttribute("marker-end", "url(#arr-" + (e.enemy ? "bad" : "good") + ")");
        svg.appendChild(path);
        const t = document.createElementNS(NS, "text");
        t.setAttribute("x", String((sx + 2 * mx + ex) / 4));
        t.setAttribute("y", String((sy + 2 * my + ey) / 4));
        t.setAttribute("class", "ov-edge-label");
        t.textContent = "×" + e.f;
        svg.appendChild(t);
      });
      npcs.forEach((n) => {
        const id = P().idOf(n);
        const g = document.createElementNS(NS, "g");
        g.setAttribute("class", "ov-node");
        g.addEventListener("click", () => EQE.openItem(n.uid));
        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("x", String(pos[id].x - 56));
        rect.setAttribute("y", String(pos[id].y - 16));
        rect.setAttribute("width", "112");
        rect.setAttribute("height", "32");
        rect.setAttribute("rx", "5");
        const t = document.createElementNS(NS, "text");
        t.setAttribute("x", String(pos[id].x));
        t.setAttribute("y", String(pos[id].y + 4));
        t.setAttribute("text-anchor", "middle");
        t.textContent = (n.json.Name || id).slice(0, 16);
        g.appendChild(rect);
        g.appendChild(t);
        svg.appendChild(g);
      });
      return h("div", { class: "graph-wrap" }, [h("div", { class: "legend" }, [h("span", { class: "dot good" }), " Verbündeter ", h("span", { class: "dot bad" }), " Rivale (Pfeil: „Ruf-Änderung bei A wirkt auf B“, Dicke = Faktor)"]), svg]);
    }

    function render() {
      clear(host);
      const npcs = P().byKind("npc");
      if (!npcs.length) {
        host.appendChild(h("div", { class: "empty-state" }, [h("p", { text: "Noch keine NPCs im Projekt." }), h("p", {}, [h("button", { class: "btn primary", type: "button", text: "Ordner laden…", onclick: () => P().pick(true) })])]));
        return;
      }
      host.appendChild(h("h2", { class: "ov-title", text: "Beziehungen" }));
      host.appendChild(graph(npcs));
      host.appendChild(h("h2", { class: "ov-title", text: "NPCs (" + npcs.length + ")" }));
      host.appendChild(h("div", { class: "ov-grid" }, npcs.map((n) => npcCard(n, npcs))));
    }
    return { refresh: render };
  }

  EQE.Overview = { initProject, initOverview };
})(window.EQE);
