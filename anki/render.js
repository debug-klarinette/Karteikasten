// Kartenvorlagen rendern – Ankis Template-Syntax:
//   {{Feld}}  {{#Feld}}…{{/Feld}}  {{^Feld}}…{{/Feld}}  {{filter:Feld}}
//   Spezialfelder: FrontSide, Tags, Type, Deck, Subdeck, Card, CardFlag
//   Filter: cloze, text, hint, type, furigana, kana, kanji, tts (wird ignoriert)

const EMPTY_RE = /^(?:\s|&nbsp;|<br\s*\/?>|<\/?div>)*$/i;
export const fieldIsEmpty = v => !v || EMPTY_RE.test(v);

export function stripHtml(html) {
  const t = document.createElement("template");
  t.innerHTML = String(html).replace(/<br\s*\/?>/gi, " ").replace(/<\/(div|p|li)>/gi, " ");
  return (t.content.textContent || "").replace(/\s+/g, " ").trim();
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ── Template → Baum ──
function parse(tpl) {
  const root = { children: [] };
  const stack = [root];
  const re = /\{\{(.*?)\}\}/gs;
  let last = 0, m;
  while ((m = re.exec(tpl))) {
    if (m.index > last) stack.at(-1).children.push({ text: tpl.slice(last, m.index) });
    last = re.lastIndex;
    const tag = m[1].trim();
    if (tag.startsWith("#") || tag.startsWith("^")) {
      const node = { cond: tag.slice(1).trim(), negate: tag[0] === "^", children: [] };
      stack.at(-1).children.push(node);
      stack.push(node);
    } else if (tag.startsWith("/")) {
      if (stack.length > 1) stack.pop();
    } else {
      stack.at(-1).children.push({ tag });
    }
  }
  if (last < tpl.length) stack.at(-1).children.push({ text: tpl.slice(last) });
  return root;
}

function evaluate(node, ctx) {
  let out = "";
  for (const n of node.children) {
    if (n.text != null) out += n.text;
    else if (n.tag != null) out += replaceTag(n.tag, ctx);
    else if (n.cond != null) {
      const val = lookup(n.cond, ctx);
      const nonEmpty = !fieldIsEmpty(val);
      if (nonEmpty !== n.negate) out += evaluate(n, ctx);
    }
  }
  return out;
}

function lookup(name, ctx) {
  if (name in ctx.fields) return ctx.fields[name];
  if (name in ctx.special) return ctx.special[name];
  return "";
}

function replaceTag(tag, ctx) {
  const parts = tag.split(":");
  const name = parts.pop().trim();
  const filters = parts.map(f => f.trim()).reverse(); // Filter wirken von rechts nach links
  if (filters.some(f => f.startsWith("tts"))) return "";
  let val = lookup(name, ctx);
  if (!(name in ctx.fields) && !(name in ctx.special)) return "";
  if (filters.includes("type")) {
    // {{type:Feld}} bzw. {{type:cloze:Text}} – Eingabefeld/Vergleich auf dem Rohwert
    return applyFilter("type", val, { ...ctx, clozeType: filters.includes("cloze") }, name);
  }
  for (const f of filters) val = applyFilter(f, val, ctx, name);
  return val;
}

function applyFilter(filter, val, ctx, fieldName) {
  switch (filter) {
    case "text": return esc(stripHtml(val));
    case "cloze": return renderCloze(val, ctx.clozeOrd, ctx.side);
    case "cloze-only": return esc(clozeOnly(val, ctx.clozeOrd));
    case "hint": {
      if (fieldIsEmpty(val)) return "";
      return `<a class="hint" href="#" onclick="this.style.display='none';this.nextElementSibling.style.display='inline';return false;">${esc(fieldName)} anzeigen</a><span class="hint-content" style="display:none">${val}</span>`;
    }
    case "type": {
      const expected = ctx.clozeType ? clozeOnly(val, ctx.clozeOrd) : stripHtml(val);
      if (ctx.side === "q") return `<input id="typeans" class="typeans" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Antwort eintippen">`;
      return typeCompare(ctx.typed ?? "", expected);
    }
    case "furigana": return val.replace(/ ?([^ >]+?)\[(.+?)\]/g, "<ruby><rb>$1</rb><rt>$2</rt></ruby>");
    case "kana": return val.replace(/ ?([^ >]+?)\[(.+?)\]/g, "$2");
    case "kanji": return val.replace(/ ?([^ >]+?)\[(.+?)\]/g, "$1");
    default:
      if (filter.startsWith("type") || filter === "cloze") return val;
      return val;
  }
}

function typeCompare(typed, expected) {
  const norm = s => s.normalize("NFC").trim().replace(/\s+/g, " ");
  const ok = norm(typed).toLowerCase() === norm(expected).toLowerCase();
  if (!typed) return `<div class="typeans-result"><span class="typeans-expected">${esc(expected)}</span></div>`;
  return `<div class="typeans-result ${ok ? "is-ok" : "is-bad"}">
    <div><span class="typeans-label">Deine Eingabe</span> <span class="typeans-typed">${esc(typed)}</span></div>
    ${ok ? "" : `<div><span class="typeans-label">Richtig</span> <span class="typeans-expected">${esc(expected)}</span></div>`}
  </div>`;
}

// ── Lückentext ──
function parseCloze(text) {
  const root = { children: [] };
  const stack = [root];
  const re = /\{\{c(\d+)::|\}\}/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) stack.at(-1).children.push(text.slice(last, m.index));
    last = re.lastIndex;
    if (m[0] === "}}") {
      if (stack.length > 1) stack.pop();
      else stack.at(-1).children.push("}}");
    } else {
      const node = { ord: Number(m[1]), children: [] };
      stack.at(-1).children.push(node);
      stack.push(node);
    }
  }
  if (last < text.length) stack.at(-1).children.push(text.slice(last));
  // nicht geschlossene Lücken als Text zurückführen
  return root;
}

function splitHint(node) {
  // Hinweis = alles nach dem letzten „::“ auf oberster Ebene
  for (let i = node.children.length - 1; i >= 0; i--) {
    const ch = node.children[i];
    if (typeof ch === "string" && ch.includes("::")) {
      const pos = ch.lastIndexOf("::");
      return {
        content: [...node.children.slice(0, i), ch.slice(0, pos)],
        hint: [ch.slice(pos + 2), ...node.children.slice(i + 1)],
      };
    }
  }
  return { content: node.children, hint: null };
}

function clozeToHtml(children, ord, side) {
  let out = "";
  for (const ch of children) {
    if (typeof ch === "string") { out += ch; continue; }
    const { content, hint } = splitHint(ch);
    const inner = clozeToHtml(content, ord, side);
    if (ch.ord === ord) {
      if (side === "q") {
        const h = hint ? clozeToHtml(hint, ord, side) : "…";
        out += `<span class="cloze" data-cloze="${esc(stripHtml(inner))}" data-ordinal="${ch.ord}">[${h}]</span>`;
      } else {
        out += `<span class="cloze" data-ordinal="${ch.ord}">${inner}</span>`;
      }
    } else {
      out += `<span class="cloze-inactive" data-ordinal="${ch.ord}">${inner}</span>`;
    }
  }
  return out;
}

function renderCloze(text, ord, side) {
  return clozeToHtml(parseCloze(text).children, ord, side);
}

function clozeOnly(text, ord) {
  const parts = [];
  const walk = children => {
    for (const ch of children) {
      if (typeof ch === "string") continue;
      if (ch.ord === ord) parts.push(stripHtml(clozeToHtml(splitHint(ch).content, -1, "a")));
      else walk(ch.children);
    }
  };
  walk(parseCloze(text).children);
  return parts.join(", ");
}

// ── Image Occlusion ──
export function parseOcclusions(text) {
  const shapes = [];
  const re = /\{\{c(\d+)::image-occlusion:(\w+):([^}]*)\}\}/g;
  let m;
  while ((m = re.exec(text))) {
    const props = {};
    for (const kv of m[3].split(":")) {
      const i = kv.indexOf("=");
      if (i > 0) props[kv.slice(0, i)] = kv.slice(i + 1);
    }
    shapes.push({ ord: Number(m[1]), shape: m[2], props });
  }
  return shapes;
}

function occlusionSvg(shapes, ord, side) {
  const nums = shapes.flatMap(s => ["left", "top", "width", "height", "rx", "ry"].map(k => Number(s.props[k])).filter(n => !isNaN(n)));
  const normalized = nums.every(n => n <= 1.0001);
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("class", "io-overlay");
  svg.setAttribute("preserveAspectRatio", "none");
  if (normalized) svg.setAttribute("viewBox", "0 0 1 1");
  svg.dataset.normalized = normalized ? "1" : "0";
  for (const s of shapes) {
    const active = s.ord === ord;
    const occludeInactive = s.props.oi === "1";
    if (!active && !occludeInactive) continue;
    if (active && side === "a") {
      // Auf der Rückseite die gesuchte Fläche nur umranden
    }
    let el;
    const p = k => Number(s.props[k]) || 0;
    if (s.shape === "rect") {
      el = document.createElementNS(svgNs, "rect");
      el.setAttribute("x", p("left")); el.setAttribute("y", p("top"));
      el.setAttribute("width", p("width")); el.setAttribute("height", p("height"));
    } else if (s.shape === "ellipse") {
      el = document.createElementNS(svgNs, "ellipse");
      el.setAttribute("cx", p("left") + p("rx")); el.setAttribute("cy", p("top") + p("ry"));
      el.setAttribute("rx", p("rx")); el.setAttribute("ry", p("ry"));
    } else if (s.shape === "polygon") {
      el = document.createElementNS(svgNs, "polygon");
      el.setAttribute("points", (s.props.points || "").replace(/,/g, " ").trim().split(/\s+/).reduce((acc, v, i, a) => (i % 2 ? acc : acc + `${a[i]},${a[i + 1]} `), "").trim());
    } else continue;
    el.setAttribute("class", active ? (side === "q" ? "io-active" : "io-revealed") : "io-inactive");
    el.setAttribute("vector-effect", "non-scaling-stroke");
    svg.appendChild(el);
  }
  return svg;
}

// ── Gesamte Karte ──
/**
 * @returns {string} HTML der Kartenseite
 */
export function renderCard({ card, note, notetype, deckName, side, typed }) {
  const tmpl = notetype.cloze ? notetype.templates[0] : notetype.templates[card.ord] || notetype.templates[0];
  if (!tmpl) return `<p>Keine Vorlage für diese Karte gefunden.</p>`;
  const fields = {};
  notetype.fields.forEach((name, i) => { fields[name] = note.fields[i] ?? ""; });
  const deckParts = (deckName || "").split("::");
  const special = {
    Tags: esc(note.tags.join(" ")),
    Type: esc(notetype.name),
    Deck: esc(deckName || ""),
    Subdeck: esc(deckParts[deckParts.length - 1]),
    Card: esc(tmpl.name),
    CardFlag: card.flags ? `flag${card.flags & 7}` : "",
    CardID: String(card.id),
  };
  const clozeType = /\{\{\s*type:cloze:/i.test(tmpl.qfmt);
  const base = { fields, special, clozeOrd: card.ord + 1, clozeType, typed };
  let html = evaluate(parse(tmpl.qfmt), { ...base, side: "q" });
  if (side === "a") {
    const qForFront = html.replace(/<input id="typeans"[^>]*>/, "");
    html = evaluate(parse(tmpl.afmt), { ...base, side: "a", special: { ...special, FrontSide: qForFront } });
  }
  return html
    .replace(/\[sound:([^\]]+)\]/g, (_, f) => `<audio controls preload="none" data-media="${esc(f)}"></audio>`)
    // Medien erst nach dem Einfügen auflösen – sonst lädt der Browser „bild.png“ vom Server
    .replace(/(<(?:img|audio|video|source)\b[^>]*?)\ssrc\s*=/gi, "$1 data-media=");
}

/** Medien einsetzen + Image-Occlusion-Overlay aufbauen (im fertigen DOM). */
export async function hydrate(root, { mediaUrl, note, notetype, card, side }) {
  root.querySelectorAll("script").forEach(s => s.remove());
  const nodes = root.querySelectorAll("[data-media]");
  await Promise.all([...nodes].map(async el => {
    const raw = el.getAttribute("data-media");
    if (!raw) return;
    if (/^(https?:|data:|blob:)/i.test(raw)) { el.setAttribute("src", raw); return; }
    let url = await mediaUrl(raw);
    if (!url) { try { url = await mediaUrl(decodeURIComponent(raw)); } catch { /* ignorieren */ } }
    if (url) el.setAttribute("src", url);
  }));

  const ioBox = root.querySelector("#image-occlusion-container");
  if (ioBox) {
    const idx = notetype.fields.findIndex(f => f === "Occlusion" || f === "Occlusions");
    const shapes = parseOcclusions(note.fields[idx >= 0 ? idx : 0] || "");
    root.querySelectorAll("#err, #image-occlusion-canvas").forEach(e => e.remove());
    ioBox.classList.add("io-box");
    const svg = occlusionSvg(shapes, card.ord + 1, side);
    ioBox.appendChild(svg);
    const img = ioBox.querySelector("img");
    if (img && svg.dataset.normalized === "0") {
      const setBox = () => svg.setAttribute("viewBox", `0 0 ${img.naturalWidth} ${img.naturalHeight}`);
      if (img.complete && img.naturalWidth) setBox(); else img.addEventListener("load", setBox, { once: true });
    }
  }
}

export const CARD_BASE_CSS = `
:host { display: block; }
.card { padding: 20px 18px 28px; min-height: 100%; overflow-wrap: anywhere; }
.card img { max-width: 100%; height: auto; }
.card table { max-width: 100%; display: block; overflow-x: auto; }
.card hr#answer, .card hr { border: none; border-top: 1px solid rgba(127,127,127,.35); margin: 18px 0; }
.cloze { font-weight: bold; color: blue; }
.nightMode .cloze { color: lightblue; }
.hint { color: #0065BD; }
.typeans { font: inherit; width: 100%; padding: 10px 12px; margin-top: 12px; border: 1px solid #b9c3cf; border-radius: 10px; }
.typeans-result { margin-top: 12px; padding: 10px 12px; border-radius: 10px; background: rgba(127,127,127,.12); font-family: ui-monospace, Menlo, monospace; }
.typeans-result.is-ok { background: rgba(27,138,86,.15); }
.typeans-result.is-bad { background: rgba(194,64,28,.12); }
.typeans-label { font-family: system-ui, sans-serif; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; opacity: .7; }
.io-box { position: relative; display: inline-block; max-width: 100%; }
.io-box img { display: block; }
.io-overlay { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.io-active { fill: #ff8e8e; stroke: #212121; stroke-width: 1px; }
.io-inactive { fill: #ffeba2; stroke: #212121; stroke-width: 1px; }
.io-revealed { fill: transparent; stroke: #d6453a; stroke-width: 2px; }
`;
