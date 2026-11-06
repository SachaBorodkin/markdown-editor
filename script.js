(function () {
  "use strict";

  /* ---------- Minimal Markdown parser ---------- */

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function safeUrl(u) {
    return /^\s*(javascript|data|vbscript):/i.test(u) ? "#" : u;
  }

  function inline(text) {
    const codes = [];
    text = text.replace(/`([^`]+)`/g, function (_, c) {
      codes.push(c);
      return "\u0000" + (codes.length - 1) + "\u0000";
    });
    text = escapeHtml(text);

    // images, then links
    text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;(.*?)&quot;)?\)/g, function (_, alt, url, title) {
      return '<img src="' + safeUrl(url) + '" alt="' + alt + '"' + (title ? ' title="' + title + '"' : "") + ">";
    });
    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;(.*?)&quot;)?\)/g, function (_, label, url, title) {
      return '<a href="' + safeUrl(url) + '" target="_blank" rel="noopener"' + (title ? ' title="' + title + '"' : "") + ">" + label + "</a>";
    });
    // autolinks
    text = text.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');

    text = text.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    text = text.replace(/\*\*(.+?)\*\*|__(.+?)__/g, function (_, a, b) { return "<strong>" + (a || b) + "</strong>"; });
    text = text.replace(/\*(?!\s)(.+?)\*/g, "<em>$1</em>");
    text = text.replace(/(^|[^\w])_(?!\s)(.+?)_(?=[^\w]|$)/g, "$1<em>$2</em>");
    text = text.replace(/~~(.+?)~~/g, "<del>$1</del>");
    text = text.replace(/ {2}\n/g, "<br>\n");

    text = text.replace(/\u0000(\d+)\u0000/g, function (_, i) {
      return "<code>" + escapeHtml(codes[+i]) + "</code>";
    });
    return text;
  }

  const RE_LIST = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;
  const RE_HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
  const RE_TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

  function splitRow(line) {
    return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(function (c) { return c.trim(); });
  }

  function renderList(lines) {
    let html = "";
    const stack = [];
    lines.forEach(function (line) {
      const m = line.match(RE_LIST);
      const indent = m[1].replace(/\t/g, "  ").length;
      const type = /\d/.test(m[2]) ? "ol" : "ul";
      let content = m[3];

      while (stack.length && indent < stack[stack.length - 1].indent) {
        html += "</li></" + stack.pop().type + ">";
      }
      if (!stack.length || indent > stack[stack.length - 1].indent) {
        html += "<" + type + ">";
        stack.push({ indent: indent, type: type });
      } else {
        html += "</li>";
      }

      const task = content.match(/^\[( |x|X)\]\s+(.*)$/);
      if (task) {
        html += '<li class="task"><input type="checkbox" disabled' + (task[1] !== " " ? " checked" : "") + ">" + inline(task[2]);
      } else {
        html += "<li>" + inline(content);
      }
    });
    while (stack.length) html += "</li></" + stack.pop().type + ">";
    return html;
  }

  function render(md) {
    const lines = md.replace(/\r\n?/g, "\n").split("\n");
    let html = "";
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (/^\s*$/.test(line)) { i++; continue; }

      // fenced code
      const fence = line.match(/^\s*(```|~~~)\s*(\w*)/);
      if (fence) {
        const buf = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith(fence[1])) buf.push(lines[i++]);
        i++;
        html += "<pre><code" + (fence[2] ? ' class="language-' + fence[2] + '"' : "") + ">" + escapeHtml(buf.join("\n")) + "</code></pre>";
        continue;
      }

      // heading
      const h = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
      if (h) {
        html += "<h" + h[1].length + ">" + inline(h[2]) + "</h" + h[1].length + ">";
        i++;
        continue;
      }

      // horizontal rule
      if (RE_HR.test(line)) { html += "<hr>"; i++; continue; }

      // blockquote
      if (/^\s{0,3}>/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s{0,3}>/.test(lines[i])) buf.push(lines[i++].replace(/^\s{0,3}>\s?/, ""));
        html += "<blockquote>" + render(buf.join("\n")) + "</blockquote>";
        continue;
      }

      // table
      if (line.indexOf("|") !== -1 && i + 1 < lines.length && RE_TABLE_SEP.test(lines[i + 1]) && lines[i + 1].indexOf("-") !== -1) {
        const head = splitRow(line);
        const aligns = splitRow(lines[i + 1]).map(function (c) {
          if (/^:-+:$/.test(c)) return "center";
          if (/^-+:$/.test(c)) return "right";
          if (/^:-+$/.test(c)) return "left";
          return "";
        });
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].indexOf("|") !== -1 && !/^\s*$/.test(lines[i])) rows.push(splitRow(lines[i++]));
        const cell = function (tag, c, idx) {
          return "<" + tag + (aligns[idx] ? ' style="text-align:' + aligns[idx] + '"' : "") + ">" + inline(c) + "</" + tag + ">";
        };
        html += "<table><thead><tr>" + head.map(function (c, k) { return cell("th", c, k); }).join("") + "</tr></thead><tbody>";
        rows.forEach(function (r) {
          html += "<tr>" + head.map(function (_, k) { return cell("td", r[k] || "", k); }).join("") + "</tr>";
        });
        html += "</tbody></table>";
        continue;
      }

      // list
      if (RE_LIST.test(line)) {
        const buf = [];
        while (i < lines.length && RE_LIST.test(lines[i])) buf.push(lines[i++]);
        html += renderList(buf);
        continue;
      }

      // paragraph
      const buf = [];
      while (
        i < lines.length &&
        !/^\s*$/.test(lines[i]) &&
        !/^\s*(```|~~~)/.test(lines[i]) &&
        !/^\s{0,3}#{1,6}\s/.test(lines[i]) &&
        !/^\s{0,3}>/.test(lines[i]) &&
        !RE_HR.test(lines[i]) &&
        !RE_LIST.test(lines[i])
      ) buf.push(lines[i++]);
      html += "<p>" + inline(buf.join("\n")) + "</p>";
    }
    return html;
  }

  /* ---------- Cheatsheet data ---------- */

  const CHEATSHEET = [
    { title: "Headings", items: [
      ["# Heading 1", "# Heading 1\n"],
      ["## Heading 2", "## Heading 2\n"],
      ["### Heading 3", "### Heading 3\n"]
    ]},
    { title: "Text style", items: [
      ["**bold**", "**bold**"],
      ["*italic*", "*italic*"],
      ["~~strikethrough~~", "~~strikethrough~~"],
      ["`inline code`", "`inline code`"]
    ]},
    { title: "Links & images", items: [
      ["[title](https://example.com)", "[title](https://example.com)"],
      ["![alt](image-url)", "![alt text](https://picsum.photos/80/40)"]
    ]},
    { title: "Lists", items: [
      ["- item\n- item", "- item\n- item\n"],
      ["1. first\n2. second", "1. first\n2. second\n"],
      ["- [x] done\n- [ ] todo", "- [x] done\n- [ ] todo\n"],
      ["- parent\n  - child", "- parent\n  - child\n"]
    ]},
    { title: "Blocks", items: [
      ["> quote", "> quote\n"],
      ["---", "\n---\n"],
      ["```\ncode block\n```", "```js\nconsole.log('hi');\n```\n"]
    ]},
    { title: "Table", items: [
      ["| A | B |\n|---|---|\n| 1 | 2 |", "| A | B |\n|---|---|\n| 1 | 2 |\n"]
    ]}
  ];

  /* ---------- App ---------- */

  const DEFAULT_TEXT = [
    "# Hello Markdown",
    "",
    "Write on the **left**, see the result in the *middle*, and click the cheatsheet on the right to insert syntax.",
    "",
    "## Features",
    "",
    "- Live preview",
    "- [x] Tables, lists, task lists",
    "- Code blocks",
    "",
    "```js",
    "console.log('Hello, world!');",
    "```",
    "",
    "> Your text is saved automatically in this browser.",
    ""
  ].join("\n");

  const editor = document.getElementById("editor");
  const preview = document.getElementById("preview");
  const stats = document.getElementById("stats");
  const cheat = document.getElementById("cheatsheet");
  const KEY = "md-editor-content";

  function load() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function save(v) {
    try { localStorage.setItem(KEY, v); } catch (e) { /* ignore */ }
  }

  function update() {
    const v = editor.value;
    preview.innerHTML = render(v);
    const words = (v.trim().match(/\S+/g) || []).length;
    stats.textContent = words + " words · " + v.length + " chars";
    save(v);
  }

  function insertAtCursor(text) {
    const s = editor.selectionStart, e = editor.selectionEnd;
    editor.setRangeText(text, s, e, "end");
    editor.focus();
    update();
  }

  // build cheatsheet
  CHEATSHEET.forEach(function (group) {
    const h = document.createElement("h3");
    h.textContent = group.title;
    cheat.appendChild(h);
    group.items.forEach(function (it) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cs-item";
      const code = document.createElement("code");
      code.textContent = it[0];
      const res = document.createElement("div");
      res.className = "res";
      res.innerHTML = render(it[0]);
      b.appendChild(code);
      b.appendChild(res);
      b.addEventListener("click", function () { insertAtCursor(it[1]); });
      cheat.appendChild(b);
    });
  });

  // Tab key inserts two spaces
  editor.addEventListener("keydown", function (e) {
    if (e.key === "Tab") {
      e.preventDefault();
      insertAtCursor("  ");
    }
  });
  editor.addEventListener("input", update);

  // buttons
  document.getElementById("btn-copy").addEventListener("click", function (e) {
    const btn = e.currentTarget;
    const done = function () {
      const old = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(function () { btn.textContent = old; }, 1200);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(preview.innerHTML).then(done);
  });
  document.getElementById("btn-download").addEventListener("click", function () {
    const blob = new Blob([editor.value], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "document.md";
    a.click();
    URL.revokeObjectURL(a.href);
  });
  document.getElementById("btn-clear").addEventListener("click", function () {
    if (!editor.value || confirm("Clear the editor?")) {
      editor.value = "";
      update();
      editor.focus();
    }
  });

  const saved = load();
  editor.value = saved !== null ? saved : DEFAULT_TEXT;
  update();
})();
