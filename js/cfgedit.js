/**
 * Exodus Quest Editor – gemeinsame Hilfen für Editoren, die Config-Bäume (aus config.cpp / config.bin / PBO) bearbeiten
 * und als config.cpp zurückschreiben (Mutanten-Editor, Exoskelett-Editor).
 * Die Bäume werden aus der Config-Registry KOPIERT, damit das Override-Werkzeug unberührt bleibt.
 */
window.EQE = window.EQE || {};

(function (EQE) {
  "use strict";

  const models = {}; // Pfad -> {path, srcObj, root, baseText}
  const scripts = {}; // Pfad -> {path, text, baseText}
  const listeners = [];

  // ---------------------------------------------------------------- Baum-Zugriff
  const lc = (s) => String(s).toLowerCase();
  const child = (node, name) => (node && node.children ? node.children.find((c) => lc(c.name) === lc(name) && !c.forward) || node.children.find((c) => lc(c.name) === lc(name)) : null) || null;
  function find(node, path) {
    let n = node;
    String(path)
      .split("/")
      .filter((x) => x)
      .forEach((seg) => {
        n = n ? child(n, seg) : null;
      });
    return n || null;
  }
  function ensure(node, path) {
    let n = node;
    String(path)
      .split("/")
      .filter((x) => x)
      .forEach((seg) => {
        let c = child(n, seg);
        if (!c || c.forward) {
          c = { name: seg, base: "", props: [], children: [] };
          n.children.push(c);
        }
        n = c;
      });
    return n;
  }
  const prop = (node, name) => (node && node.props ? node.props.find((p) => lc(p.name) === lc(name)) || null : null);
  const unq = (s) => String(s).trim().replace(/^"(.*)"$/, "$1");
  function getNum(node, name) {
    const p = prop(node, name);
    if (!p || p.array) return NaN;
    const n = Number(p.raw);
    return Number.isFinite(n) ? n : NaN;
  }
  function getStr(node, name) {
    const p = prop(node, name);
    return p && !p.array ? unq(p.raw) : "";
  }
  function getArr(node, name) {
    const p = prop(node, name);
    return p && p.array ? p.items.map((i) => unq(i)) : null;
  }
  function setRaw(node, name, raw) {
    const p = prop(node, name);
    if (p) {
      p.array = false;
      p.raw = String(raw);
      p.items = null;
    } else node.props.push({ name: name, array: false, raw: String(raw), items: null, op: "=" });
  }
  function setArr(node, name, items) {
    const p = prop(node, name);
    if (p) {
      p.array = true;
      p.items = items.map(String);
      p.raw = undefined;
    } else node.props.push({ name: name, array: true, items: items.map(String), op: "=" });
  }
  const setNum = (node, name, n) => setRaw(node, name, String(n));
  const quote = (s) => '"' + String(s).replace(/"/g, '""') + '"';

  // ---------------------------------------------------------------- Schreiben
  function writeNode(node, pad, out) {
    if (node.forward) {
      out.push(pad + "class " + node.name + (node.base ? ": " + node.base : "") + ";");
      return;
    }
    out.push(pad + "class " + node.name + (node.base ? ": " + node.base : ""));
    out.push(pad + "{");
    node.props.forEach((p) => {
      if (p.array) {
        const items = p.items.map((i) => String(i).replace(/\s*\n\s*/g, " "));
        const one = items.join(", ");
        const op = p.op && p.op !== "=" ? " " + p.op + " " : " = ";
        if (one.length <= 100) out.push(pad + "\t" + p.name + "[]" + op + "{" + one + "};");
        else {
          out.push(pad + "\t" + p.name + "[]" + op + "{");
          items.forEach((it, i) => out.push(pad + "\t\t" + it + (i < items.length - 1 ? "," : "")));
          out.push(pad + "\t};");
        }
      } else out.push(pad + "\t" + p.name + " = " + p.raw + ";");
    });
    node.children.forEach((c) => writeNode(c, pad + "\t", out));
    out.push(pad + "};");
  }
  function textOf(root) {
    const out = [];
    root.children.forEach((c) => writeNode(c, "", out));
    return out.join("\n") + "\n";
  }

  // ---------------------------------------------------------------- Modelle aus der Registry
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /** Bringt die Modelle auf den Stand der Config-Registry (geänderte Modelle bleiben erhalten). */
  function sync() {
    if (!EQE.Cfg) return;
    const seen = {};
    EQE.Cfg.sources().forEach((s) => {
      if (!s || !s.root || !s.path) return;
      seen[s.path] = true;
      const m = models[s.path];
      if (m && (m.srcObj === s || isChanged(m))) return;
      const root = clone(s.root);
      models[s.path] = { path: s.path, srcObj: s, root: root, baseText: textOf(root) };
    });
    Object.keys(models).forEach((p) => {
      if (!seen[p] && !isChanged(models[p])) delete models[p];
    });
  }
  const isChanged = (m) => textOf(m.root) !== m.baseText;
  function list(re) {
    sync();
    return Object.keys(models)
      .filter((p) => re.test(p))
      .sort()
      .map((p) => models[p]);
  }

  /** Zielpfad: aus config.bin/PBO wird ein Quellordner mit config.cpp ("X.pbo/" -> "X/"), Textconfigs werden an Ort und Stelle ersetzt. */
  function outPath(p) {
    if (/\.pbo\//i.test(p) || /config\.bin$/i.test(p)) return p.replace(/\.pbo\//i, "/").replace(/config\.bin$/i, "config.cpp");
    return p;
  }

  // ---------------------------------------------------------------- Skripte
  function ingestScript(path, text) {
    const old = scripts[path];
    if (old && old.text !== old.baseText) return;
    scripts[path] = { path: path, text: text, baseText: text };
  }
  const scriptList = (re) => Object.keys(scripts).filter((p) => re.test(p)).map((p) => scripts[p]);

  // ---------------------------------------------------------------- Projekt-Anbindung (je Editor)
  /** Registriert Schreib-/Zip-Funktionen für die Modelle/Skripte, deren Pfad auf re passt. */
  function register(re, label) {
    const changedModels = () => list(re).filter(isChanged);
    const changedScripts = () => scriptList(re).filter((s) => s.text !== s.baseText);
    EQE.Project.registerExtra({
      changedCount: () => changedModels().length + changedScripts().length,
      zipFiles: (onlyChanged) =>
        list(re)
          .filter((m) => !onlyChanged || isChanged(m))
          .map((m) => ({ name: outPath(m.path), text: textOf(m.root) }))
          .concat(scriptList(re).filter((s) => !onlyChanged || s.text !== s.baseText).map((s) => ({ name: scriptOut(s.path), text: s.text }))),
      fileWrites: () =>
        changedModels()
          .map((m) => ({ path: outPath(m.path), text: textOf(m.root), onDone: () => (m.baseText = textOf(m.root)) }))
          .concat(changedScripts().map((s) => ({ path: scriptOut(s.path), text: s.text, onDone: () => (s.baseText = s.text) }))),
      paths: () => changedModels().map((m) => outPath(m.path)),
    });
  }
  const scriptOut = (p) => p.replace(/\.pbo\//i, "/");

  EQE.CfgEdit = {
    child: child,
    find: find,
    ensure: ensure,
    prop: prop,
    getNum: getNum,
    getStr: getStr,
    getArr: getArr,
    setRaw: setRaw,
    setNum: setNum,
    setArr: setArr,
    quote: quote,
    textOf: textOf,
    list: list,
    isChanged: isChanged,
    outPath: outPath,
    ingestScript: ingestScript,
    scripts: scriptList,
    register: register,
    onChange: (fn) => listeners.push(fn),
    changed: () => listeners.forEach((f) => f()),
  };
})(window.EQE);
