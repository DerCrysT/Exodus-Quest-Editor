/**
 * Exodus Quest Editor – binarisierte Configs (config.bin, "rapified") und PBO-Archive lesen.
 * parseRap(buffer)  -> Klassenbaum im gleichen Format wie EQE.Cfg.parse (props/children/base/forward)
 * readPbo(file)     -> [{name, buffer}] aller config.bin / config.cpp im Archiv (liest nur Header + diese Einträge)
 */
window.EQE = window.EQE || {};

(function (EQE) {
  "use strict";

  // ---------------------------------------------------------------- rapified config.bin
  function newNode(name, base) {
    return { name: name, base: base || "", forward: false, props: [], children: [] };
  }

  function fmtFloat(f) {
    if (!Number.isFinite(f)) return "0";
    return String(parseFloat(f.toPrecision(7)));
  }
  function quote(s) {
    return '"' + String(s).replace(/"/g, '""') + '"';
  }

  function parseRap(buffer) {
    const u8 = new Uint8Array(buffer);
    const dv = new DataView(buffer);
    if (u8.length < 16 || u8[0] !== 0 || u8[1] !== 0x72 || u8[2] !== 0x61 || u8[3] !== 0x50) throw new Error("kein rapified config.bin (Kennung \\0raP fehlt)");
    const dec = new TextDecoder("utf-8");
    let p = 0;

    function cstr() {
      const start = p;
      while (p < u8.length && u8[p] !== 0) p++;
      const s = dec.decode(u8.subarray(start, p));
      p++;
      return s;
    }
    function cint() {
      let b = u8[p++];
      let val = b;
      if (b & 0x80) {
        let mult = 0x80;
        let extra;
        do {
          extra = u8[p++];
          val += (extra - 1) * mult;
          mult *= 0x80;
        } while (extra & 0x80);
      }
      return val;
    }
    function u32() {
      const v = dv.getUint32(p, true);
      p += 4;
      return v;
    }
    function value(sub) {
      if (sub === 0) return quote(cstr());
      if (sub === 1) {
        const f = dv.getFloat32(p, true);
        p += 4;
        return fmtFloat(f);
      }
      if (sub === 2) {
        const i = dv.getInt32(p, true);
        p += 4;
        return String(i);
      }
      throw new Error("unbekannter Wertetyp " + sub);
    }
    function arrayItems() {
      const n = cint();
      const items = [];
      for (let i = 0; i < n; i++) {
        const sub = u8[p++];
        if (sub === 3) items.push("{" + arrayItems().join(", ") + "}");
        else items.push(value(sub));
      }
      return items;
    }

    function body(offset, node, depth) {
      if (depth > 40) throw new Error("zu tiefe Verschachtelung");
      const save = p;
      p = offset;
      const parent = cstr();
      if (parent) node.base = parent;
      const count = cint();
      const classes = [];
      for (let i = 0; i < count; i++) {
        const type = u8[p++];
        if (type === 0) {
          const name = cstr();
          const off = u32();
          classes.push([name, off]);
        } else if (type === 1) {
          const sub = u8[p++];
          const name = cstr();
          const raw = value(sub);
          node.props.push({ name: name, array: false, raw: raw, items: null, op: "=" });
        } else if (type === 2) {
          const name = cstr();
          node.props.push({ name: name, array: true, items: arrayItems(), op: "=" });
        } else if (type === 3) {
          const fwd = newNode(cstr(), "");
          fwd.forward = true;
          node.children.push(fwd);
        } else if (type === 4) {
          cstr(); // delete: ignorieren
        } else if (type === 5) {
          const flag = u32();
          const name = cstr();
          node.props.push({ name: name, array: true, items: arrayItems(), op: flag === 2 ? "-=" : "+=" });
        } else throw new Error("unbekannter Eintragstyp " + type);
      }
      const after = p;
      classes.forEach(([name, off]) => {
        const child = newNode(name, "");
        body(off, child, depth + 1);
        node.children.push(child);
      });
      p = save > after ? save : after;
    }

    const root = newNode("", "");
    body(16, root, 0);
    return root;
  }

  // ---------------------------------------------------------------- PBO
  const METHOD_VERS = 0x56657273; // "Vers"
  const METHOD_CPRS = 0x43707273; // "Cprs"

  /** LZSS wie in PBO-Archiven (Methode "Cprs"). */
  function lzssDecompress(src, outSize) {
    const out = new Uint8Array(outSize);
    let ip = 0;
    let op = 0;
    while (op < outSize && ip < src.length) {
      const flags = src[ip++];
      for (let bit = 0; bit < 8 && op < outSize && ip < src.length; bit++) {
        if (flags & (1 << bit)) {
          out[op++] = src[ip++];
        } else {
          const b1 = src[ip++];
          const b2 = src[ip++];
          const pointer = b1 | ((b2 & 0xf0) << 4);
          const len = (b2 & 0x0f) + 3;
          let rpos = op - pointer;
          for (let k = 0; k < len && op < outSize; k++, rpos++) out[op++] = rpos < 0 ? 0x20 : out[rpos];
        }
      }
    }
    return out;
  }

  async function readSlice(file, start, end) {
    return new Uint8Array(await file.slice(start, end).arrayBuffer());
  }

  /** Liest den PBO-Header und gibt alle Einträge samt Datenposition zurück. */
  async function readPboHeader(file) {
    let size = 64 * 1024;
    for (let attempt = 0; attempt < 8; attempt++) {
      const buf = await readSlice(file, 0, Math.min(size, file.size));
      try {
        return parseHeader(buf);
      } catch (e) {
        if (e !== "more" || size >= file.size) throw new Error("PBO-Header nicht lesbar");
        size *= 4;
      }
    }
    throw new Error("PBO-Header zu groß");
  }

  function parseHeader(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const dec = new TextDecoder("utf-8");
    let p = 0;
    const need = (n) => {
      if (p + n > u8.length) throw "more";
    };
    const cstr = () => {
      const start = p;
      while (p < u8.length && u8[p] !== 0) p++;
      if (p >= u8.length) throw "more";
      const s = dec.decode(u8.subarray(start, p));
      p++;
      return s;
    };
    const entries = [];
    const props = {};
    for (;;) {
      const name = cstr();
      need(20);
      const method = dv.getUint32(p, true);
      const orig = dv.getUint32(p + 4, true);
      const dataSize = dv.getUint32(p + 16, true);
      p += 20;
      if (name === "") {
        if (method === METHOD_VERS) {
          for (;;) {
            const key = cstr();
            if (key === "") break;
            props[key] = cstr();
          }
          continue;
        }
        break; // Ende der Eintragsliste
      }
      entries.push({ name: name, method: method, orig: orig, size: dataSize });
    }
    let offset = p;
    entries.forEach((e) => {
      e.offset = offset;
      offset += e.size;
    });
    entries.props = props;
    return entries;
  }

  /** Liest die Einträge eines PBO, für die matcher(name, props) true liefert. Rückgabe: {files:[{name,buffer}], props} */
  async function readPboFiles(file, matcher) {
    const entries = await readPboHeader(file);
    const files = [];
    for (const e of entries) {
      if (!matcher(e.name, entries.props)) continue;
      let data = await readSlice(file, e.offset, e.offset + e.size);
      if (e.method === METHOD_CPRS) data = lzssDecompress(data, e.orig);
      else if (e.method !== 0) continue; // unbekannte Packmethode
      files.push({ name: e.name.replace(/\\/g, "/"), buffer: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) });
    }
    return { files: files, props: entries.props || {} };
  }

  const CONFIG_RE = /(^|[\\/])config\.(bin|cpp)$/i;
  /** Alle config.bin/config.cpp eines PBO (nur diese Einträge werden gelesen). */
  async function readPbo(file) {
    return (await readPboFiles(file, (n) => CONFIG_RE.test(n))).files;
  }

  /** Ist der Pfad eine Config-Quelle (config.cpp, config.bin oder PBO)? */
  function isConfigSource(path) {
    return /(^|\/)config\.(cpp|bin)$/i.test(path) || /\.pbo$/i.test(path);
  }

  function ingestBuffer(name, buffer, path) {
    if (/\.bin$/i.test(name)) EQE.Cfg.ingestRoot(parseRap(buffer), path, "");
    else EQE.Cfg.ingestText(new TextDecoder("utf-8").decode(buffer), path);
  }

  /** config.cpp / config.bin / PBO einlesen (rebuild danach nicht vergessen). Rückgabe: Anzahl gelesener Configs; wirft bei Fehlern. */
  async function ingestFile(file, path) {
    if (/\.pbo$/i.test(path)) {
      let n = 0;
      // Exodus_GM (Gasmasken-Mod): zusätzlich die Skripte lesen, damit der Gasmasken-Editor sie bearbeiten kann
      const r = await readPboFiles(file, (name, props) => CONFIG_RE.test(name) || (props && props.prefix === "Exodus_GM" && /\.c$/i.test(name)));
      const text = new TextDecoder("utf-8");
      const gm = { path: path, config: "", scripts: {} };
      for (const e of r.files) {
        if (/\.c$/i.test(e.name)) {
          gm.scripts[e.name] = text.decode(e.buffer);
          continue;
        }
        ingestBuffer(e.name, e.buffer, path + "/" + e.name);
        n++;
        if (r.props.prefix === "Exodus_GM" && /\.cpp$/i.test(e.name)) gm.config = text.decode(e.buffer);
      }
      if (r.props.prefix === "Exodus_GM" && gm.config && EQE.GasMask) EQE.GasMask.ingestSources(gm);
      return n;
    }
    ingestBuffer(path, await file.arrayBuffer(), path);
    return 1;
  }

  EQE.CfgBin = { parseRap: parseRap, readPbo: readPbo, readPboFiles: readPboFiles, readPboHeader: readPboHeader, isConfigSource: isConfigSource, ingestFile: ingestFile };
})(window.EQE);
