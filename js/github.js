/**
 * Exodus Editor – GitHub-Abgleich: den Projektordner aus einem (privaten) GitHub-Repository pullen und Änderungen pushen,
 * damit alle auf dem gleichen Stand bleiben, ohne ZIPs zu verschicken. Läuft direkt im Browser über die GitHub-REST-API
 * (Git-Data-API: ein Push = ein Commit). Das Zugriffstoken bleibt im Browser (standardmäßig nur für diese Sitzung).
 */
(function (EQE) {
  "use strict";
  const h = EQE.h;
  const clear = EQE.clear;
  const P = () => EQE.Project;

  const CFG_KEY = "eqe:gh:cfg:v1";
  const BASE_KEY = "eqe:gh:base:v1";
  const TOKEN_KEY = "eqe:gh:token";
  const API = "https://api.github.com";
  const SYNC_RE = /\.(json|cpp|c|bin)$/i;

  const cfg = Object.assign({ repo: "DerCrysT/Exodus-Editor-Shared-Files", branch: "main", root: "Exodus", remember: false, pbo: true, message: "" }, read(localStorage, CFG_KEY));
  let base = read(localStorage, BASE_KEY) || {}; // Repo-Pfad -> Blob-SHA beim letzten Pull/Push
  const state = { busy: false, status: "", log: [] };
  let host = null;

  function read(store, key) {
    try {
      return JSON.parse(store.getItem(key) || "null") || {};
    } catch (e) {
      return {};
    }
  }
  const saveCfg = () => {
    try {
      localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    } catch (e) {
      /* egal */
    }
  };
  const saveBase = () => {
    try {
      localStorage.setItem(BASE_KEY, JSON.stringify(base));
    } catch (e) {
      /* egal */
    }
  };
  function getToken() {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || "";
    } catch (e) {
      return "";
    }
  }
  function setToken(t) {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
      if (t) (cfg.remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, t);
    } catch (e) {
      /* egal */
    }
  }

  // ---------------------------------------------------------------- API
  async function api(path, opts, raw) {
    const token = getToken();
    if (!token) throw new Error("Bitte zuerst ein Zugriffstoken eintragen.");
    const res = await fetch(API + path, {
      method: (opts && opts.method) || "GET",
      headers: Object.assign({ Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json", Authorization: "Bearer " + token, "X-GitHub-Api-Version": "2022-11-28" }, opts && opts.body ? { "Content-Type": "application/json" } : {}),
      body: opts && opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      let msg = "";
      try {
        msg = (await res.json()).message || "";
      } catch (e) {
        /* egal */
      }
      if (res.status === 401) throw new Error("Token ungültig oder abgelaufen (401).");
      if (res.status === 403) throw new Error("Zugriff verweigert (403): " + msg + " – hat das Token die Berechtigung „Contents: Read and write“?");
      if (res.status === 404) throw new Error("Nicht gefunden (404): Repository/Branch falsch geschrieben, oder das Token hat keinen Zugriff auf dieses (private) Repository.");
      if (res.status === 409 || res.status === 422) throw new Error("GitHub lehnt die Änderung ab (" + res.status + "): " + msg + " – meist hat sich das Repository inzwischen geändert: erst Pull, dann erneut Push.");
      throw new Error("GitHub-Fehler " + res.status + ": " + msg);
    }
    return raw ? res.arrayBuffer() : res.json();
  }
  const repoPath = (s) => "/repos/" + cfg.repo.trim() + s;

  async function head() {
    const ref = await api(repoPath("/git/ref/heads/" + encodeURIComponent(cfg.branch).replace(/%2F/g, "/")));
    const commit = await api(repoPath("/git/commits/" + ref.object.sha));
    return { commit: ref.object.sha, tree: commit.tree.sha };
  }
  async function listTree(treeSha) {
    const t = await api(repoPath("/git/trees/" + treeSha + "?recursive=1"));
    if (t.truncated) throw new Error("Das Repository ist zu groß für den Abgleich (Dateiliste abgeschnitten).");
    const map = {};
    t.tree.forEach((e) => e.type === "blob" && (map[e.path] = { sha: e.sha, size: e.size }));
    return map;
  }

  async function pool(list, n, fn) {
    let i = 0;
    const workers = Array.from({ length: Math.min(n, list.length) }, async () => {
      while (i < list.length) {
        const k = i++;
        await fn(list[k], k);
      }
    });
    await Promise.all(workers);
  }

  async function gitSha(text) {
    const body = new TextEncoder().encode(text);
    const head = new TextEncoder().encode("blob " + body.length + "\0");
    const all = new Uint8Array(head.length + body.length);
    all.set(head);
    all.set(body, head.length);
    const d = await crypto.subtle.digest("SHA-1", all);
    return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  const rootOf = () => (cfg.root || "Exodus").replace(/^\/+|\/+$/g, "");
  const stripRoot = (p, root) => (root && p.indexOf(root + "/") === 0 ? p.slice(root.length + 1) : p);

  // ---------------------------------------------------------------- Pull
  async function pull() {
    if (P().changedCount() > 0 && !confirm("Es gibt ungespeicherte Änderungen im Editor. Ein Pull ersetzt gleiche Dateien durch die Version aus dem Repository. Trotzdem fortfahren?")) return;
    setStatus("Verbinde mit GitHub …");
    const hd = await head();
    const tree = await listTree(hd.tree);
    const root = rootOf();
    const want = Object.keys(tree).filter((p) => SYNC_RE.test(p) || (cfg.pbo && /\.pbo$/i.test(p)));
    const known = EQE.Cfg ? EQE.Cfg.sources().map((s) => s.path) : [];
    const todo = want.filter((p) => !(/\.pbo$/i.test(p) && base[p] === tree[p].sha && known.some((k) => k.indexOf(root + "/" + p) === 0)));
    const totalMb = todo.reduce((n, p) => n + (tree[p].size || 0), 0) / 1048576;
    let done = 0;
    const entries = [];
    await pool(todo, 5, async (p) => {
      const buf = await api(repoPath("/git/blobs/" + tree[p].sha), null, true);
      entries.push({ file: new File([buf], p.split("/").pop()), path: root + "/" + p });
      done++;
      setStatus("Lade " + done + " / " + todo.length + " Dateien (" + totalMb.toFixed(1) + " MB) …");
    });
    const r = await P().ingestEntries(entries);
    want.forEach((p) => (base[p] = tree[p].sha));
    saveBase();
    setStatus("Pull fertig: " + todo.length + " Dateien geladen (Commit " + hd.commit.slice(0, 7) + ", " + cfg.repo + "@" + cfg.branch + ")." + (r.errors.length ? " " + r.errors.length + " fehlerhaft." : ""));
  }

  // ---------------------------------------------------------------- Push
  async function push() {
    const plan = P().repoPlan();
    const root = plan.rootName || rootOf();
    if (!plan.writes.length && !plan.dels.length) {
      EQE.toast("Nichts zu pushen – es gibt keine Änderungen.", true);
      return;
    }
    setStatus("Prüfe das Repository …");
    const hd = await head();
    const remote = await listTree(hd.tree);
    const writes = [];
    const conflicts = [];
    for (const w of plan.writes) {
      const rp = stripRoot(w.path, root);
      const sha = await gitSha(w.text);
      const r = remote[rp];
      if (r && r.sha === sha) {
        writes.push({ w: w, rp: rp, sha: sha, same: true });
        continue;
      }
      if (r && base[rp] !== r.sha) conflicts.push(rp);
      writes.push({ w: w, rp: rp, sha: sha, same: false });
    }
    const dels = plan.dels.map((d) => ({ d: d, rp: stripRoot(d.path, root) })).filter((x) => remote[x.rp]);
    const real = writes.filter((x) => !x.same);
    if (!real.length && !dels.length) {
      P().repoFinish(plan.writes, plan.dels);
      setStatus("Bereits auf dem neuesten Stand – das Repository enthält schon genau diese Dateien.");
      return;
    }
    let msg = real.length + " Datei(en) pushen" + (dels.length ? ", " + dels.length + " löschen" : "") + " nach " + cfg.repo + "@" + cfg.branch + ":\n\n" + real.slice(0, 12).map((x) => "+ " + x.rp).join("\n") + (real.length > 12 ? "\n… (+" + (real.length - 12) + ")" : "") + dels.slice(0, 6).map((x) => "\n– " + x.rp).join("");
    if (conflicts.length) msg += "\n\nACHTUNG: Diese Dateien wurden im Repository seit deinem letzten Pull geändert (z. B. von deinem Partner) und würden überschrieben:\n" + conflicts.slice(0, 8).map((c) => "! " + c).join("\n") + "\nBesser abbrechen und zuerst „Pull“ ausführen.";
    msg += "\n\nFortfahren?";
    if (!window.confirm(msg)) {
      setStatus("Push abgebrochen.");
      return;
    }
    setStatus("Lade Dateien hoch …");
    const tree = [];
    let n = 0;
    await pool(real, 5, async (x) => {
      const b = await api(repoPath("/git/blobs"), { method: "POST", body: { content: x.w.text, encoding: "utf-8" } });
      x.sha = b.sha;
      tree.push({ path: x.rp, mode: "100644", type: "blob", sha: b.sha });
      n++;
      setStatus("Lade hoch " + n + " / " + real.length + " …");
    });
    dels.forEach((x) => tree.push({ path: x.rp, mode: "100644", type: "blob", sha: null }));
    setStatus("Erstelle Commit …");
    const nt = await api(repoPath("/git/trees"), { method: "POST", body: { base_tree: hd.tree, tree: tree } });
    const message = (cfg.message || "").trim() || "Update über Exodus Editor (" + real.length + " Datei(en)" + (dels.length ? ", " + dels.length + " gelöscht" : "") + ")";
    const c = await api(repoPath("/git/commits"), { method: "POST", body: { message: message, tree: nt.sha, parents: [hd.commit] } });
    await api(repoPath("/git/refs/heads/" + encodeURIComponent(cfg.branch).replace(/%2F/g, "/")), { method: "PATCH", body: { sha: c.sha } });
    writes.forEach((x) => (base[x.rp] = x.sha));
    dels.forEach((x) => delete base[x.rp]);
    saveBase();
    P().repoFinish(plan.writes, plan.dels);
    setStatus("Push fertig: Commit " + c.sha.slice(0, 7) + " – " + real.length + " Datei(en)" + (dels.length ? ", " + dels.length + " gelöscht" : "") + ".");
  }

  // ---------------------------------------------------------------- UI
  function setStatus(t) {
    state.status = t;
    const el = host && host.querySelector(".gh-status");
    if (el) el.textContent = t;
  }
  async function run(fn) {
    if (state.busy) return;
    state.busy = true;
    refreshButtons();
    try {
      await fn();
    } catch (e) {
      setStatus("Fehler: " + (e && e.message ? e.message : e));
      EQE.toast(String(e && e.message ? e.message : e), true);
    } finally {
      state.busy = false;
      refreshButtons();
    }
  }
  function refreshButtons() {
    if (!host) return;
    host.querySelectorAll("button.gh-act").forEach((b) => (b.disabled = state.busy));
  }

  function card() {
    const box = h("div", { class: "card gh-card" });
    host = box;
    const field = (label, tip, input) => h("div", { class: "field" }, [h("label", {}, [label, EQE.MPKit ? EQE.MPKit.tipNode(tip) : null]), input]);
    const tokenIn = h("input", { type: "password", value: getToken(), placeholder: "github_pat_… (Fine-grained Token)", autocomplete: "off", oninput: (e) => setToken(e.target.value.trim()) });
    const grid = h("div", { class: "grid2" }, [
      field("Repository", "Besitzer/Name, z. B. DerCrysT/Exodus-Editor-Shared-Files.", h("input", { type: "text", value: cfg.repo, oninput: (e) => ((cfg.repo = e.target.value.trim()), saveCfg()) })),
      field("Branch", "Meist main.", h("input", { type: "text", value: cfg.branch, oninput: (e) => ((cfg.branch = e.target.value.trim()), saveCfg()) })),
      field("Zugriffstoken", "Persönliches Zugriffstoken (GitHub → Settings → Developer settings → Personal access tokens → Fine-grained). Nur auf dieses Repository beschränken, Berechtigung „Contents: Read and write“. Das Token bleibt in diesem Browser und wird nur an api.github.com gesendet.", tokenIn),
      field("Wurzelordner-Name", "So heißt der Projektordner im Editor (Pfade im Repo werden darunter eingeordnet). Muss zu deinem lokal geladenen Ordner passen, z. B. „Exodus“.", h("input", { type: "text", value: cfg.root, oninput: (e) => ((cfg.root = e.target.value.trim()), saveCfg()) })),
      field("Commit-Nachricht (optional)", "Text des Commits beim Push. Leer = automatische Nachricht.", h("input", { type: "text", value: cfg.message, placeholder: "z. B. Mutanten-HP angepasst", oninput: (e) => ((cfg.message = e.target.value), saveCfg()) })),
    ]);
    const opts = h("div", { class: "toolbar" }, [
      h("label", { class: "checkrow" }, [h("input", { type: "checkbox", checked: cfg.remember, onchange: (e) => ((cfg.remember = e.target.checked), saveCfg(), setToken(tokenIn.value.trim())) }), "Token in diesem Browser merken (sonst nur bis zum Schließen des Tabs)"]),
      h("label", { class: "checkrow" }, [h("input", { type: "checkbox", checked: cfg.pbo, onchange: (e) => ((cfg.pbo = e.target.checked), saveCfg()) }), "PBOs beim Pull mitladen"]),
    ]);
    const acts = h("div", { class: "toolbar" }, [
      h("button", { class: "btn primary gh-act", type: "button", text: "⇩ Pull (aus Repository laden)", title: "Lädt JSONs, Configs, Skripte (und PBOs) aus dem Repository in den Editor", onclick: () => run(pull) }),
      h("button", { class: "btn primary gh-act", type: "button", text: "⇧ Push (Änderungen hochladen)", title: "Schreibt deine neuen/geänderten Dateien als einen Commit ins Repository", onclick: () => run(push) }),
      h("span", { class: "gh-status muted small", text: state.status }),
    ]);
    box.appendChild(h("h3", { text: "GitHub-Abgleich (gemeinsames Repository)" }));
    box.appendChild(h("p", { class: "hint", text: "Pull lädt den aktuellen Stand aus dem Repository, Push lädt deine Änderungen als Commit hoch – so bleibt ihr auf demselben Stand. Vor dem Arbeiten pullen, nach dem Arbeiten pushen. Hat dein Partner dieselbe Datei geändert, warnt der Push vor dem Überschreiben." }));
    box.appendChild(grid);
    box.appendChild(opts);
    box.appendChild(acts);
    return box;
  }

  EQE.GitHub = { card: card, pull: () => run(pull), push: () => run(push) };
})(window.EQE);
