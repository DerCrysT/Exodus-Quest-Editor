/**
 * Exodus Editor – Karten-Tab: bettet die interaktive DayZone-Karte (Ordner map/) als Fenster ein.
 * Die Karte lädt standardmäßig immer die mitgelieferte DayZone-Karte. Aus dem Projekt bekommt sie:
 *  - Zones/Tiers/Radiation/Anomalies-JSONs (Mutanten, Strahlung, Anomalien)
 *  - Marker: NPCs, Trader, Quest-Ziele (Explore/Survive/Recovery/Kill/Action), Spawn-Gruppen, Stashes
 * Ein Doppelklick auf einen Marker öffnet die Datei im passenden Editor.
 */
window.EQE = window.EQE || {};

(function (EQE) {
  "use strict";
  const { h } = EQE;
  const P = () => EQE.Project;

  let frame = null;
  let ready = false;
  let timer = null;
  let sentData = "";

  function xz(str) {
    const p = String(str || "").trim().split(/\s+/).map(Number);
    if (p.length >= 3 && !p.some(isNaN)) return { x: p[0], z: p[2] };
    if (p.length === 2 && !p.some(isNaN)) return { x: p[0], z: p[1] };
    return null;
  }
  const num = (v, d) => (v === undefined || v === "" || isNaN(Number(v)) ? d : Number(v));

  function buildMarkers() {
    const out = [];
    P()
      .byKind("npc")
      .forEach((it) => {
        const p = xz(it.json.Position);
        if (p) out.push({ cat: "npc", label: it.json.Name || P().idOf(it), x: p.x, z: p.z, r: num(it.json.InteractionRadius, 0), uid: it.uid });
      });
    P()
      .byKind("trader")
      .forEach((it) => {
        const pos = it.json.position;
        if (Array.isArray(pos) && pos.length >= 3) out.push({ cat: "trader", label: it.json.trader_name || P().idOf(it), x: Number(pos[0]), z: Number(pos[2]), uid: it.uid });
      });
    P()
      .byKind("stash")
      .forEach((it) => {
        const p = xz(it.json.Position);
        if (p) out.push({ cat: "stash", label: P().idOf(it), x: p.x, z: p.z, r: num(it.json.ActivationRadius, 0), uid: it.uid });
      });
    P()
      .byKind("quest")
      .forEach((it) => {
        const qid = P().idOf(it);
        (it.json.Objectives || []).forEach((o) => {
          const pr = o.Params || {};
          const label = qid + " · " + (o.ObjectiveId || o.Type);
          const add = (x, z, r, suffix) => {
            if (isFinite(x) && isFinite(z)) out.push({ cat: "quest", label: label + (suffix || ""), x, z, r: r || 0, uid: it.uid });
          };
          if (o.Type === "Explore") {
            if (pr.Waypoints) {
              String(pr.Waypoints)
                .split(";")
                .forEach((w, i) => {
                  const parts = w.trim().split(/\s+/).map(Number);
                  if (parts.length >= 3) add(parts[0], parts[2], parts[3] || num(pr.Radius, 25), " #" + (i + 1));
                });
            } else if (pr.X !== undefined && pr.Z !== undefined) add(num(pr.X), num(pr.Z), num(pr.Radius, 25));
          } else if (o.Type === "Survive") {
            if (pr.X !== undefined && pr.Z !== undefined) add(num(pr.X), num(pr.Z), num(pr.Radius, 100));
          } else if (o.Type === "Recovery") {
            if (pr.X !== undefined && pr.Z !== undefined) add(num(pr.X), num(pr.Z), num(pr.Radius, 200), " (Fundort)");
            if (pr.ReturnX !== undefined && pr.ReturnZ !== undefined) add(num(pr.ReturnX), num(pr.ReturnZ), num(pr.ReturnRadius, 25), " (Abgabe)");
          } else if ((o.Type === "Kill" || o.Type === "Action") && pr.CenterX !== undefined && pr.CenterZ !== undefined) {
            add(num(pr.CenterX), num(pr.CenterZ), num(pr.Radius, 0));
          }
        });
        (it.json.Spawns || []).forEach((s) =>
          (s.Positions || []).forEach((pos) => {
            const p = xz(pos);
            if (p) out.push({ cat: "spawn", label: qid + " · " + (s.SpawnId || "Spawn"), x: p.x, z: p.z, r: num(s.ActivationRadius, 300), uid: it.uid });
          })
        );
      });
    return out;
  }

  function send(msg) {
    if (frame && frame.contentWindow) frame.contentWindow.postMessage(msg, window.location.origin);
  }

  /** Quelldatei je Kartendaten-Typ (die Karte kennt „radiation“ auch für die Strahlungszonen des Radiation-Mods). */
  const pick = (kind) => P().byKind(kind).find((i) => !/_old/i.test(i.fileId || "")) || P().byKind(kind)[0] || null;
  const SOURCES = {
    zones: () => pick("zones"),
    tiers: () => pick("tiers"),
    radiation: () => pick("rad_zones") || pick("radiation"),
    anomalies: () => pick("anomalies"),
  };
  function hash(str) {
    let x = 5381;
    for (let i = 0; i < str.length; i++) x = ((x << 5) + x + str.charCodeAt(i)) | 0;
    return x;
  }
  function dataSignature() {
    return Object.keys(SOURCES)
      .map((k) => {
        const it = SOURCES[k]();
        return k + ":" + (it ? it.uid + ":" + hash(JSON.stringify(it.json)) : "-");
      })
      .join("|");
  }

  function sendAll() {
    if (!ready) return;
    // Kartendaten (Mutanten, Strahlung, Anomalien) nur senden, wenn sich der Inhalt geändert hat
    const dataSig = dataSignature();
    if (dataSig !== sentData) {
      sentData = dataSig;
      Object.keys(SOURCES).forEach((k) => {
        const it = SOURCES[k]();
        if (it) send({ eqe: "data", type: k, json: it.json });
      });
    }
    send({ eqe: "markers", markers: buildMarkers() });
  }

  /** Änderung aus der Karte in die Projektdatei übernehmen (wird beim Speichern mitgeschrieben). */
  function applyChange(type, payload) {
    const it = SOURCES[type] && SOURCES[type]();
    if (!it || payload === undefined || payload === null) return;
    P().mutate(it.uid, (j) => {
      if (type === "anomalies") {
        Object.keys(j).forEach((k) => delete j[k]);
        Object.assign(j, payload);
      } else if (Array.isArray(j)) {
        j.length = 0;
        payload.forEach((x) => j.push(x));
      } else {
        const keys = type === "zones" ? ["zones", "Zones", "spawnZones", "SpawnZones"] : ["m_RadiationTrigger", "RadiationZones", "radiationZones", "Zones", "zones"];
        const key = keys.find((k) => Array.isArray(j[k])) || Object.keys(j).find((k) => Array.isArray(j[k])) || keys[0];
        if (type === "radiation") {
          // Neue Zonen der Karte haben nur wenige Felder: fehlende Werte aus einer vollständigen Zone übernehmen
          const full = (j[key] || []).reduce((a, z) => (!a || Object.keys(z).length > Object.keys(a).length ? z : a), null);
          if (full)
            payload.forEach((z) => {
              if (Object.keys(z).length <= 6) Object.keys(full).forEach((k) => z[k] === undefined && (z[k] = JSON.parse(JSON.stringify(full[k]))));
            });
        }
        j[key] = payload;
      }
    });
    sentData = dataSignature(); // nicht an die Karte zurückschicken
  }

  function schedule() {
    if (!ready) return;
    clearTimeout(timer);
    timer = setTimeout(sendAll, 400);
  }

  function init(root) {
    // Zonen/Tiers/Anomalien in der Originaleinrückung und mit .0-Kommazahlen zurückschreiben
    if (EQE.MPKit) P().registerSerializer(["zones", "tiers", "anomalies", "radiation"], EQE.MPKit.stringify);
    const host = h("div", { class: "map-host" });
    root.appendChild(host);

    window.addEventListener("message", (ev) => {
      if (ev.origin !== window.location.origin) return;
      const m = ev.data;
      if (!m || typeof m !== "object") return;
      if (m.eqe === "map-ready") {
        ready = true;
        sentData = "";
        sendAll();
      } else if (m.eqe === "open" && m.uid) {
        EQE.openItem(m.uid);
      } else if (m.eqe === "changed" && m.type) {
        applyChange(m.type, m.payload);
      }
    });
    P().on((ev) => {
      if (ev.type === "json" && !root.classList.contains("active")) return;
      schedule();
    });

    return {
      refresh: () => {
        if (!frame) {
          host.appendChild(h("div", { class: "help map-hint", text: "Die Karte lädt beim ersten Öffnen (ca. 5 MB). NPCs, Trader, Quest-Ziele, Spawn-Gruppen und Stashes aus dem Projekt erscheinen als Marker – Doppelklick öffnet sie im Editor." }));
          frame = h("iframe", { class: "map-frame", src: "map/index.html", title: "DayZone Karte", allow: "fullscreen" });
          host.appendChild(frame);
        } else schedule();
      },
    };
  }

  EQE.MapTab = { init };
})(window.EQE);
