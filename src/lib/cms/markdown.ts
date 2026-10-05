// Small, dependency-free Markdown → HTML renderer, tuned to the writer agent's
// output (answer-first prose, H2/H3 sections, GFM tables, bullet/numbered lists,
// blockquote "Add your experience" callouts, inline links/bold/italic, and a
// trailing ```json fence of JSON-LD).
//
// Why not a library: the app deliberately keeps its dependency set tiny, and the
// writer emits a predictable, well-formed subset of Markdown. This covers that
// subset and — importantly — lifts any JSON-LD fenced block out of the visible
// body into a real <script type="application/ld+json"> tag so search engines read
// the schema instead of readers seeing a wall of raw JSON.

// GitHub-style heading slug, so a "## Oversized Caskets" heading gets
// id="oversized-caskets" and the writer's table-of-contents "[…](#oversized-caskets)"
// jump links actually land.
export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → their text
    .replace(/`[^`]*`|[*_]/g, "") // code spans + bold/italic marks
    .replace(/[^\w\s-]/g, "") // drop remaining punctuation
    .trim()
    .replace(/\s+/g, "-");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Inline: code spans first (so their contents aren't further parsed), then
// links, bold, italic. Operates on already HTML-escaped text.
function inline(text: string): string {
  let t = text;
  t = t.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const external = /^https?:\/\//i.test(href);
    const attrs = external ? ' target="_blank" rel="noopener"' : "";
    return `<a href="${href}"${attrs}>${label}</a>`;
  });
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
  return t;
}

function renderTableRows(rows: string[]): string {
  const cells = (row: string): string[] =>
    row
      .replace(/^\s*\|/, "")
      .replace(/\|\s*$/, "")
      .split("|")
      .map((c) => c.trim());
  const head = cells(rows[0]);
  const bodyRows = rows.slice(2); // rows[1] is the |---|---| separator
  const thead = `<thead><tr>${head.map((c) => `<th>${inline(escapeHtml(c))}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${bodyRows
    .map((r) => `<tr>${cells(r).map((c) => `<td>${inline(escapeHtml(c))}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}

// Lift every JSON-LD fenced block out of `md` into `sink`, returning the body
// with those blocks removed. Handles the writer's normal closed ```json … ```
// fence AND — critically — an UNTERMINATED trailing ```json whose closing ```
// was lost (an over-eager envelope-strip in a revise/refresh pass used to do
// this). Without this, the raw schema would leak into the visible page as text
// and the pre-publish gate would (correctly) refuse to publish.
function liftJsonLd(md: string, sink: string[]): string {
  const JSON_LANG = "(?:json|jsonld|json-ld|ld\\+json)";
  return md
    // Closed fences first.
    .replace(new RegExp("```" + JSON_LANG + "[^\\n]*\\n([\\s\\S]*?)```", "gi"), (_, body) => {
      sink.push(String(body).trim());
      return "\n";
    })
    // Then any unterminated trailing ```json … end-of-document.
    .replace(new RegExp("```" + JSON_LANG + "[^\\n]*\\n([\\s\\S]*)$", "gi"), (_, body) => {
      sink.push(String(body).trim());
      return "\n";
    });
}

// The two guide sections render as plain text: a heading and a simple list.
// "In this guide" entries are plain labels (never jump links, even if an old
// entry carries one).
function renderTocBox(items: string[]): string {
  const lis = items.map((it) => `<li>${inline(escapeHtml(it.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")))}</li>`).join("");
  return `<h2 id="in-this-guide">In This Guide</h2>\n<ol>${lis}</ol>`;
}

function renderTakeawaysBox(items: string[]): string {
  const lis = items.map((it) => `<li>${inline(escapeHtml(it))}</li>`).join("");
  return `<h2 id="what-to-know-first">What To Know First</h2>\n<ul>${lis}</ul>`;
}

/** Render the writer's Markdown to clean HTML for a CMS body_html field. */
export function markdownToHtml(md: string): string {
  const jsonLd: string[] = [];

  // Pull JSON-LD fences out first (closed or unterminated), then remaining
  // fenced code blocks become <pre><code>.
  const codeBlocks: string[] = [];
  const withoutFences = liftJsonLd(md, jsonLd).replace(
    /```([a-zA-Z-]*)\n([\s\S]*?)```/g,
    (_, _lang, body) => {
      const idx = codeBlocks.push(`<pre><code>${escapeHtml(body.replace(/\n$/, ""))}</code></pre>`) - 1;
      return ` CODE${idx} `;
    },
  );

  // Also lift any raw JSON-LD <script> block the writer emitted directly (rather
  // than as a ```json fence) into the schema list, so it renders as an invisible
  // script tag instead of being HTML-escaped into visible page text.
  const withoutScripts = withoutFences.replace(
    /<script\s+type=["']application\/ld\+json["']\s*>([\s\S]*?)<\/script>/gi,
    (_, body) => {
      jsonLd.push(String(body).trim());
      return "\n";
    },
  );

  const lines = withoutScripts.split("\n");
  const out: string[] = [];
  let i = 0;

  const flushParagraph = (buf: string[]) => {
    if (buf.length) out.push(`<p>${inline(escapeHtml(buf.join(" ").trim()))}</p>`);
    buf.length = 0;
  };

  const para: string[] = [];

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Restore a placeholder for a non-JSON code block.
    const codeMatch = trimmed.match(/^ CODE(\d+) $/);
    if (codeMatch) {
      flushParagraph(para);
      out.push(codeBlocks[Number(codeMatch[1])]);
      i++;
      continue;
    }

    if (trimmed === "") {
      flushParagraph(para);
      i++;
      continue;
    }

    // The two guide sections ("In this guide" / "What to know first"): a plain
    // heading + list, with "In this guide" entries never rendered as links.
    const box = trimmed.match(/^##\s+(in this guide|what to know first)\s*$/i);
    if (box) {
      flushParagraph(para);
      i++;
      const items: string[] = [];
      while (i < lines.length && !/^#{1,6}\s/.test(lines[i].trim()) && !/^ CODE\d+ $/.test(lines[i].trim())) {
        const it = lines[i].trim().match(/^(?:\d+[.)]|[-*+])\s+(.*)$/);
        if (it) items.push(it[1]);
        else if (lines[i].trim() && items.length) break;
        i++;
      }
      out.push(/guide/i.test(box[1]) ? renderTocBox(items) : renderTakeawaysBox(items));
      continue;
    }

    // Headings
    const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushParagraph(para);
      const level = h[1].length;
      let raw = h[2].trim();
      // Support the "{#custom-id}" heading-attribute syntax: strip it from the
      // visible text and use it as the id (so the writer's TOC anchors land).
      let explicitId = "";
      const attr = raw.match(/\s*\{#([A-Za-z0-9_-]+)\}\s*$/);
      if (attr) {
        explicitId = attr[1];
        raw = raw.slice(0, raw.length - attr[0].length).trim();
      }
      const id = explicitId || headingId(raw);
      out.push(`<h${level} id="${id}">${inline(escapeHtml(raw))}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph(para);
      out.push("<hr>");
      i++;
      continue;
    }

    // Table (a header row followed by a |---| separator)
    if (/^\|.*\|/.test(trimmed) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1].trim())) {
      flushParagraph(para);
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(lines[i].trim());
        i++;
      }
      out.push(renderTableRows(rows));
      continue;
    }

    // Blockquote (may span multiple lines) — the writer's "> **Add your experience:**" callouts
    if (/^>\s?/.test(trimmed)) {
      flushParagraph(para);
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quote.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${inline(escapeHtml(quote.join(" ").trim()))}</blockquote>`);
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      flushParagraph(para);
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ""));
        i++;
      }
      out.push(`<ul>${items.map((it) => `<li>${inline(escapeHtml(it))}</li>`).join("")}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph(para);
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      out.push(`<ol>${items.map((it) => `<li>${inline(escapeHtml(it))}</li>`).join("")}</ol>`);
      continue;
    }

    // Default: accumulate into a paragraph.
    para.push(trimmed);
    i++;
  }
  flushParagraph(para);

  for (const schema of jsonLd) {
    out.push(`<script type="application/ld+json">${schema}</script>`);
  }

  return out.join("\n");
}
