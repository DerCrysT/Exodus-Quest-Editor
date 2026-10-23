/**
 * Exodus Quest Editor – gemeinsame Helfer (DOM-Aufbau, Formularfelder, Listen-Editor, JSON-Vorschau,
 * Toasts/Modal, Entwurf-Speicherung). Alle Editoren (quest.js/npc.js/dialog.js/stash.js) nutzen diese Bausteine.
 */
window.EQE = window.EQE || {};

(function (EQE) {
  "use strict";

  // ---------------------------------------------------------------- DOM-Hilfsfunktion
  function h(tag, attrs, children) {
    attrs = attrs || {};
    const node = document.createElement(tag);
    for (const key in attrs) {
      const val = attrs[key];
      if (val === undefined || val === null || val === false) continue;
      if (key === "class") node.className = val;
      else if (key === "text") node.textContent = val;
      else if (key === "html") node.innerHTML = val;
      else if (key.indexOf("on") === 0 && typeof val === "function") node.addEventListener(key.slice(2), val);
      else if (key === "checked" || key === "disabled" || key === "hidden" || key === "selected") node[key] = !!val;
      else node.setAttribute(key, val === true ? "" : val);
    }
    const kids = children === undefined ? [] : [].concat(children);
    for (const c of kids) {
      if (c === null || c === undefined) continue;
      node.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    }
    return node;
  }
  EQE.h = h;

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }
  EQE.clear = clear;

  let uidCounter = 0;
  EQE.uid = function () {
    uidCounter += 1;
    return "id" + Date.now().toString(36) + uidCounter.toString(36);
  };

  // ---------------------------------------------------------------- Zahlen/Strings
  EQE.toNumber = function (v, fallback) {
    if (v === "" || v === null || v === undefined) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  EQE.splitCsv = function (s) {
    return String(s || "")
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x !== "");
  };

  // ---------------------------------------------------------------- Felder (bidirektional an ein Objekt gebunden)
  /**
   * field({ label, key, type, obj, help, required, placeholder, options, step, onChange })
   * type: 'text' | 'number' | 'textarea' | 'bool' | 'select'
   * Liest/schreibt obj[key] direkt; ruft onChange(value) nach jeder Änderung (für Live-Vorschau).
   */
  EQE.field = function (opts) {
    const { label, key, type, obj, help, required, placeholder, options, step, span, onChange, tip } = opts;
    // datalist darf ein Array (Strings oder {value,label}) oder eine Funktion sein, die es liefert
    const datalist = typeof opts.datalist === "function" ? opts.datalist() : opts.datalist;
    const tipNode = tip ? h("span", { class: "tip", "data-tip": tip, tabindex: "0", text: "?" }) : null;
    let input;
    const fire = () => {
      if (typeof onChange === "function") onChange(obj[key]);
    };
    if (type === "bool") {
      input = h("input", {
        type: "checkbox",
        checked: !!obj[key],
        onchange: (e) => {
          obj[key] = e.target.checked;
          fire();
        },
      });
      const row = h("label", { class: "checkrow" }, [input, label]);
      if (help) return h("div", { class: "field" + (span ? " span" + span : "") }, [row, h("div", { class: "help", text: help })]);
      return h("div", { class: "field" + (span ? " span" + span : "") }, [row]);
    }
    if (type === "textarea") {
      input = h("textarea", {
        placeholder: placeholder || "",
        oninput: (e) => {
          obj[key] = e.target.value;
          fire();
        },
      });
      input.value = obj[key] || "";
    } else if (type === "select") {
      input = h(
        "select",
        {
          onchange: (e) => {
            obj[key] = e.target.value;
            fire();
          },
        },
        options.map((o) => {
          const val = typeof o === "string" ? o : o.value;
          const lbl = typeof o === "string" ? o || "(leer)" : o.label;
          return h("option", { value: val, selected: (obj[key] || "") === val, text: lbl });
        })
      );
    } else {
      const dlId = datalist ? EQE.uid() : null;
      input = h("input", {
        type: type === "number" ? "number" : "text",
        step: step || (type === "number" ? "any" : undefined),
        placeholder: placeholder || "",
        list: dlId || undefined,
        oninput: (e) => {
          if (type === "number") {
            obj[key] = e.target.value === "" ? undefined : Number(e.target.value);
          } else {
            obj[key] = e.target.value;
          }
          fire();
        },
      });
      input.value = obj[key] === undefined || obj[key] === null ? "" : obj[key];
      if (datalist) {
        const dl = h(
          "datalist",
          { id: dlId },
          datalist.map((d) => h("option", typeof d === "string" ? { value: d } : { value: d.value, label: d.label }))
        );
        const wrap = h("div", { class: "field" + (span ? " span" + span : "") }, [
          h("label", {}, [label, required ? h("span", { class: "req", text: "*" }) : null, tipNode]),
          input,
          dl,
          help ? h("div", { class: "help", text: help }) : null,
        ]);
        return wrap;
      }
    }
    return h("div", { class: "field" + (span ? " span" + span : "") }, [
      h("label", {}, [label, required ? h("span", { class: "req", text: "*" }) : null, tipNode]),
      input,
      help ? h("div", { class: "help", text: help }) : null,
    ]);
  };

  // ---------------------------------------------------------------- Zusammenklappbarer Abschnitt
  EQE.section = function (title, hint, bodyNodes, opts) {
    opts = opts || {};
    const body = h("div", { class: "section-body" }, bodyNodes);
    const sec = h("div", { class: "section" + (opts.collapsed ? " collapsed" : "") }, [
      h(
        "div",
        {
          class: "section-head",
          onclick: () => sec.classList.toggle("collapsed"),
        },
        [
          h("div", {}, [h("h3", { text: title }), hint ? h("div", { class: "hint", text: hint }) : null]),
          h("span", { class: "section-toggle", text: "▾" }),
        ]
      ),
      body,
    ]);
    return sec;
  };

  // ---------------------------------------------------------------- Zeichenketten-Liste (Chips)
  /**
   * strList({ items: array<string> (wird mutiert), placeholder, onChange })
   */
  EQE.strList = function (opts) {
    const { items, placeholder, onChange } = opts;
    const wrap = h("div", { class: "strlist" });
    const dlId = opts.datalist ? EQE.uid() : null;
    const render = () => {
      clear(wrap);
      items.forEach((val, i) => {
        wrap.appendChild(
          h("span", { class: "chip" }, [
            h("span", { text: val }),
            h("button", {
              type: "button",
              text: "✕",
              onclick: () => {
                items.splice(i, 1);
                render();
                onChange && onChange();
              },
            }),
          ])
        );
      });
      const dlItems = typeof opts.datalist === "function" ? opts.datalist() : opts.datalist;
      if (dlId) {
        wrap.appendChild(h("datalist", { id: dlId }, (dlItems || []).map((d) => h("option", typeof d === "string" ? { value: d } : { value: d.value, label: d.label }))));
      }
      const addInput = h("input", {
        type: "text",
        list: dlId || undefined,
        placeholder: placeholder || "hinzufügen…",
        onkeydown: (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const v = e.target.value.trim();
            if (v) {
              items.push(v);
              e.target.value = "";
              render();
              onChange && onChange();
            }
          }
        },
      });
      wrap.appendChild(h("span", { class: "chip-add" }, [addInput]));
    };
    render();
    return wrap;
  };

  // ---------------------------------------------------------------- Generischer Listen-Editor (Objective, Reward, Node, …)
  /**
   * listEditor({
   *   items: array (wird mutiert),
   *   makeItem: () => neues Objekt,
   *   renderCard(item, index, api): Node[]  // Inhalt der Karte; api.refreshTitle(), api.refresh() stehen zur Verfügung
   *   title(item, index): string,
   *   badge(item, index): string|null,
   *   addLabel, emptyLabel,
   *   onChange: () => void   // nach jeder Strukturänderung (Hinzufügen/Entfernen/Verschieben)
   * })
   */
  EQE.listEditor = function (opts) {
    const { items, makeItem, renderCard, title, badge, addLabel, emptyLabel, onChange } = opts;
    const wrap = h("div", { class: "list" });

    function move(i, dir) {
      const j = i + dir;
      if (j < 0 || j >= items.length) return;
      const tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
      render();
      onChange && onChange();
    }

    function render() {
      clear(wrap);
      if (items.length === 0) {
        wrap.appendChild(h("div", { class: "list-empty", text: emptyLabel || "Noch nichts eingetragen." }));
      }
      items.forEach((item, i) => {
        const titleEl = h("span", { class: "title", text: title ? title(item, i) : "" });
        const api = {
          refreshTitle: () => {
            titleEl.textContent = title ? title(item, i) : "";
          },
          refresh: () => render(),
        };
        const head = h("div", { class: "card-head" }, [
          titleEl,
          badge && badge(item, i) ? h("span", { class: "badge", text: badge(item, i) }) : null,
          h("div", { class: "card-actions" }, [
            h("button", { class: "btn icon small", title: "Nach oben", text: "↑", type: "button", onclick: () => move(i, -1) }),
            h("button", { class: "btn icon small", title: "Nach unten", text: "↓", type: "button", onclick: () => move(i, 1) }),
            h("button", {
              class: "btn icon small danger",
              title: "Entfernen",
              text: "✕",
              type: "button",
              onclick: () => {
                items.splice(i, 1);
                render();
                onChange && onChange();
              },
            }),
          ]),
        ]);
        const body = h("div", { class: "card-body" }, renderCard(item, i, api));
        wrap.appendChild(h("div", { class: "card" }, [head, body]));
      });
      const addBtn = h("button", {
        class: "btn",
        type: "button",
        text: addLabel || "+ Hinzufügen",
        onclick: () => {
          items.push(makeItem());
          render();
          onChange && onChange();
        },
      });
      wrap.appendChild(addBtn);
    }
    render();
    return wrap;
  };

  // ---------------------------------------------------------------- JSON-Vorschau mit einfacher Syntaxfärbung
  EQE.renderJson = function (preEl, obj) {
    const text = JSON.stringify(obj, null, 2);
    const esc = text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const colored = esc.replace(/(&quot;|")(.*?)\1(\s*:)?|(\btrue\b|\bfalse\b|\bnull\b)|(-?\d+\.?\d*)/g, () => "");
    // einfache Regex-Einfärbung direkt auf dem escaped Text
    const highlighted = esc
      .replace(/(&quot;[^&]*?&quot;)(\s*:)/g, '<span class="k">$1</span>$2')
      .replace(/:(\s*)(&quot;.*?&quot;)/g, ':$1<span class="s">$2</span>')
      .replace(/:(\s*)(true|false|null)/g, ':$1<span class="b">$2</span>')
      .replace(/:(\s*)(-?\d+\.?\d*)/g, ':$1<span class="n">$2</span>');
    preEl.innerHTML = highlighted;
    return text;
  };

  // ---------------------------------------------------------------- Toasts
  EQE.toast = function (msg, isError) {
    const host = document.querySelector('[data-el="toast-host"]');
    if (!host) return;
    const t = h("div", { class: "toast" + (isError ? " error" : ""), text: msg });
    host.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  };

  // ---------------------------------------------------------------- Zwischenablage / Download
  EQE.copyText = function (text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => EQE.toast("In die Zwischenablage kopiert."))
        .catch(() => EQE.fallbackCopy(text));
    } else {
      EQE.fallbackCopy(text);
    }
  };
  EQE.fallbackCopy = function (text) {
    const ta = h("textarea", {});
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      EQE.toast("In die Zwischenablage kopiert.");
    } catch (e) {
      EQE.toast("Kopieren fehlgeschlagen – bitte manuell markieren.", true);
    }
    ta.remove();
  };
  EQE.download = function (filename, text) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  // ---------------------------------------------------------------- Modal (JSON einfügen)
  EQE.openModal = function (title, bodyNode) {
    const backdrop = document.querySelector('[data-el="modal-backdrop"]');
    document.querySelector('[data-el="modal-title"]').textContent = title;
    const body = document.querySelector('[data-el="modal-body"]');
    clear(body);
    body.appendChild(bodyNode);
    backdrop.hidden = false;
  };
  EQE.closeModal = function () {
    document.querySelector('[data-el="modal-backdrop"]').hidden = true;
  };
  document.addEventListener("DOMContentLoaded", () => {
    const backdrop = document.querySelector('[data-el="modal-backdrop"]');
    if (!backdrop) return;
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) EQE.closeModal();
    });
    document.querySelectorAll('[data-act="modal-close"]').forEach((b) => b.addEventListener("click", EQE.closeModal));
  });

  // ---------------------------------------------------------------- Entwurf-Speicherung
  EQE.saveDraft = function (key, obj) {
    try {
      localStorage.setItem("eqe:" + key, JSON.stringify(obj));
    } catch (e) {
      /* privater Modus o.ä. – egal */
    }
  };
  EQE.loadDraft = function (key) {
    try {
      const s = localStorage.getItem("eqe:" + key);
      return s ? JSON.parse(s) : null;
    } catch (e) {
      return null;
    }
  };

  // ---------------------------------------------------------------- Ruf-Bereich (EQ_RepRange) – gemeinsam für Quest/Dialog
  /**
   * repRangeEditor(holder, key, { label, hint, showLocked, onChange })
   * holder[key] ist entweder undefined (keine Bedingung) oder ein EQ_RepRange-Objekt.
   */
  EQE.repRangeEditor = function (holder, key, opts) {
    opts = opts || {};
    const wrap = h("div", { class: "field span4" });
    const rankOptions = [""].concat(EQE.REPUTATION_RANKS.map((r) => r.label));

    function render() {
      clear(wrap);
      const active = !!holder[key];
      wrap.appendChild(
        h("label", { class: "checkrow" }, [
          h("input", {
            type: "checkbox",
            checked: active,
            onchange: (e) => {
              if (e.target.checked) {
                holder[key] = { NpcId: "", MinRank: "", MaxRank: "", Min: undefined, Max: undefined };
                if (opts.showLocked) holder[key].ShowLocked = false;
              } else {
                delete holder[key];
              }
              render();
              opts.onChange && opts.onChange();
            },
          }),
          opts.label || "Ruf-Bedingung",
        ])
      );
      if (opts.hint) wrap.appendChild(h("div", { class: "help", text: opts.hint }));
      if (!active) return;
      const r = holder[key];
      const body = h("div", { class: "grid4", style: "margin-top:8px" });
      body.appendChild(EQE.field({ label: "NpcId", key: "NpcId", obj: r, type: "text", placeholder: "leer = aktueller NPC", datalist: () => (EQE.Project ? EQE.Project.options("npc") : []), onChange: () => opts.onChange && opts.onChange() }));
      body.appendChild(EQE.field({ label: "MinRank", key: "MinRank", obj: r, type: "select", options: rankOptions, onChange: () => opts.onChange && opts.onChange() }));
      body.appendChild(EQE.field({ label: "MaxRank", key: "MaxRank", obj: r, type: "select", options: rankOptions, onChange: () => opts.onChange && opts.onChange() }));
      if (opts.showLocked) {
        body.appendChild(
          EQE.field({ label: "ShowLocked (gesperrt statt verborgen anzeigen)", key: "ShowLocked", obj: r, type: "bool", onChange: () => opts.onChange && opts.onChange() })
        );
      }
      body.appendChild(
        EQE.field({
          label: "Min (nur falls kein MinRank)",
          key: "Min",
          obj: r,
          type: "number",
          help: "0 oder leer = -1000 (nicht gesetzt).",
          onChange: () => opts.onChange && opts.onChange(),
        })
      );
      body.appendChild(
        EQE.field({
          label: "Max (nur falls kein MaxRank)",
          key: "Max",
          obj: r,
          type: "number",
          help: "0 oder leer = +1000 (nicht gesetzt).",
          onChange: () => opts.onChange && opts.onChange(),
        })
      );
      wrap.appendChild(body);
    }
    render();
    return wrap;
  };

  // Unter-/Obergrenzen je Rang (siehe EQ_ReputationRanks.AddRank im Mod) – für die clientseitige Plausibilitätsprüfung.
  const RANK_LOWER = { brotherinarms: 1000, ally: 750, friend: 500, associate: 250, acquaintance: 100, neutral: -99, suspicious: -249, disliked: -499, enemy: -749, wanted: -999, executiontarget: -1000 };
  const RANK_UPPER = { brotherinarms: 1000, ally: 999, friend: 749, associate: 499, acquaintance: 249, neutral: 99, suspicious: -100, disliked: -250, enemy: -500, wanted: -750, executiontarget: -1000 };

  /** Prüft einen EQ_RepRange wie der Mod-Validator (für die Problem-Liste). Gibt Array von Strings (Fehlern) zurück. */
  EQE.validateRepRange = function (range, label) {
    const problems = [];
    if (!range) return problems;
    if (range.MinRank && !EQE.findRank(range.MinRank)) problems.push(label + ": MinRank '" + range.MinRank + "' ist kein bekannter Rang.");
    if (range.MaxRank && !EQE.findRank(range.MaxRank)) problems.push(label + ": MaxRank '" + range.MaxRank + "' ist kein bekannter Rang.");
    let lo = range.Min || -1000;
    let hi = range.Max || 1000;
    const minRank = range.MinRank && EQE.findRank(range.MinRank);
    const maxRank = range.MaxRank && EQE.findRank(range.MaxRank);
    if (minRank) lo = RANK_LOWER[minRank.id];
    if (maxRank) hi = RANK_UPPER[maxRank.id];
    if (lo > hi) problems.push(label + ": Bereich ist leer (Min " + lo + " > Max " + hi + ").");
    return problems;
  };

  // ---------------------------------------------------------------- Issue-Liste rendern
  EQE.renderIssues = function (container, issues) {
    clear(container);
    if (!issues || issues.length === 0) {
      container.appendChild(h("div", { class: "issue ok", text: "Keine Probleme gefunden." }));
      return;
    }
    issues.forEach((it) => {
      container.appendChild(h("div", { class: "issue " + it.level, text: (it.level === "error" ? "Fehler: " : "Warnung: ") + it.msg }));
    });
  };
})(window.EQE);
