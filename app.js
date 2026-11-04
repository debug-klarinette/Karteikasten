// Karteikasten – Anki-Stapel im Browser lernen.
// Ablauf: .apkg/.colpkg öffnen → lernen (Anki-Planer) → als Paket mit Fortschritt zurückgeben.

import sqlite3InitModule from "./vendor/sqlite-wasm/index.mjs";
import { readPackage, writePackage, readMedia, PackageError } from "./anki/package.js";
import { openCollection } from "./anki/collection.js";
import { renderCard, hydrate, CARD_BASE_CSS } from "./anki/render.js";
import { SpringValue, VelocityTracker, project, rubberband, materialize, reduceMotion } from "./ui/motion.js";
import * as store from "./store.js";

// ───────────────────────── Zustand ─────────────────────────
const state = {
  record: null,      // gespeicherter Eintrag (Original + Sammlung)
  info: null,        // { format, collectionEntry, media: Map }
  col: null,         // Collection
  media: new Map(),  // Dateiname → Blob-URL
  study: null,       // laufende Lernsitzung
  exportFile: null,
};

const $ = id => document.getElementById(id);
const views = { home: $("view-home"), decks: $("view-decks"), study: $("view-study") };
const prefersDark = matchMedia("(prefers-color-scheme: dark)");

let sqlitePromise;
const getSqlite = () => (sqlitePromise ??= sqlite3InitModule({ print: () => {}, printErr: (...a) => console.warn(...a) }));

const prefs = {
  get ignoreLimits() { return readLS("ignoreLimits") === "1"; },
  set ignoreLimits(v) { writeLS("ignoreLimits", v ? "1" : "0"); },
};
function readLS(k) { try { return localStorage.getItem("kk." + k); } catch { return null; } }
function writeLS(k, v) { try { localStorage.setItem("kk." + k, v); } catch { /* egal */ } }

// iOS zeigt :active nur, wenn es irgendeinen touchstart-Listener gibt → Feedback schon beim Antippen
document.addEventListener("touchstart", () => {}, { passive: true });

// Nach einer Wischgeste den nachfolgenden „Klick“ verschlucken
let suppressClickUntil = 0;
addEventListener("click", e => {
  if (performance.now() < suppressClickUntil) { e.stopPropagation(); e.preventDefault(); }
}, true);
const swallowClick = () => { suppressClickUntil = performance.now() + 120; };

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

function fmtDate(ms) {
  if (!ms) return "–";
  const d = new Date(ms);
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === new Date().toDateString()) return `heute, ${time}`;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }) + `, ${time}`;
}
function fmtSize(b) {
  if (b > 1e6) return (b / 1e6).toFixed(1).replace(".", ",") + " MB";
  return Math.max(1, Math.round(b / 1e3)) + " KB";
}

const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", m4a: "audio/mp4", mp4: "video/mp4", webm: "video/webm" };

function busy(text) {
  $("busy-text").textContent = text || "Bitte warten …";
  const el = $("busy");
  if (text && el.hidden) { el.hidden = false; materialize(el.firstElementChild, { y: 0, scale: 0.94 }); }
  else if (!text) el.hidden = true;
}

// ───────────────────────── Toast ─────────────────────────
let toastTimer;
function toast(msg, { ms = 2600, action } = {}) {
  const t = $("toast");
  $("toast-text").textContent = msg;
  const btn = $("toast-action");
  btn.hidden = !action;
  if (action) {
    btn.textContent = action.label;
    btn.onclick = () => { hideToast(); action.run(); };
  }
  const wasHidden = t.hidden;
  t.hidden = false;
  if (wasHidden) materialize(t, { y: 10, scale: 0.96 });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms);
}
function hideToast() {
  const t = $("toast");
  if (t.hidden) return;
  clearTimeout(toastTimer);
  const anim = t.animate?.([{ opacity: 1 }, { opacity: 0, transform: reduceMotion() ? "none" : "translateY(8px) scale(.97)" }], { duration: 160, easing: "ease-in" });
  if (anim) anim.onfinish = () => { t.hidden = true; }; else t.hidden = true;
}

// ───────────────────────── Navigation (Stapel mit Wisch-zurück) ─────────────────────────
// Ansichten schieben sich von rechts herein und verlassen den Bildschirm wieder nach rechts.
// Fortschritt p: 0 = obere Ansicht liegt vollständig auf, 1 = obere Ansicht rechts draußen.

const nav = { stack: [], trans: null };
const dim = $("nav-dim");
const navSpring = new SpringValue(0, p => {
  const t = nav.trans;
  if (!t) return;
  const w = innerWidth;
  t.top.style.transform = `translate3d(${p * w}px,0,0)`;
  t.under.style.transform = `translate3d(${-0.3 * w * (1 - p)}px,0,0)`;
  dim.style.opacity = String(0.12 * (1 - clamp(p, 0, 1)));
});

const current = () => nav.stack[nav.stack.length - 1];

function showOnly(name) {
  for (const [k, el] of Object.entries(views)) {
    el.hidden = k !== name;
    el.classList.remove("is-under", "is-moving");
    el.style.transform = "";
  }
  dim.style.display = "none";
}

function beginTransition(topName, underName) {
  if (nav.trans && nav.trans.topName === topName && nav.trans.underName === underName) return nav.trans;
  finishTransition();
  const top = views[topName], under = views[underName];
  top.hidden = false; under.hidden = false;
  refreshBar(top); refreshBar(under);
  under.classList.add("is-under");
  top.classList.add("is-moving");
  dim.style.display = "block";
  nav.trans = { top, under, topName, underName, complete: null };
  return nav.trans;
}

function endTransition(keepTop) {
  const t = nav.trans;
  if (!t) return;
  nav.trans = null;
  t.top.classList.remove("is-moving");
  t.under.classList.remove("is-under");
  t.top.style.transform = t.under.style.transform = "";
  dim.style.display = "none";
  (keepTop ? t.under : t.top).hidden = true;
}

/** Laufenden Übergang sofort abschließen (nur wenn ein anderer Übergang beginnt). */
function finishTransition() {
  if (!nav.trans) return;
  navSpring.stop();
  nav.trans.complete?.();
}

function crossFade(el) {
  el.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: "ease-out" });
}

function push(name) {
  const from = current();
  if (from === name) return;
  if (!from) { nav.stack = [name]; showOnly(name); return; }
  const reusing = nav.trans && nav.trans.topName === name && nav.trans.underName === from;
  const t = beginTransition(name, from);
  if (!reusing) {
    nav.stack.push(name);
    views[name].scrollTop = 0;
    refreshBar(views[name]);
    navSpring.set(1);
  }
  t.complete = () => endTransition(true);
  if (reduceMotion()) { navSpring.set(0); t.complete(); crossFade(views[name]); return; }
  navSpring.animateTo(0, { damping: 1, response: 0.38, onComplete: t.complete });
}

function pop({ velocity } = {}) {
  if (nav.stack.length < 2) return;
  const topName = current(), underName = nav.stack[nav.stack.length - 2];
  const reusing = nav.trans && nav.trans.topName === topName && nav.trans.underName === underName;
  if (!reusing) { prepareUnder(underName); beginTransition(topName, underName); navSpring.set(0); }
  const t = nav.trans;
  t.complete = () => {
    endTransition(false);
    nav.stack.pop();
    arrived(topName);
  };
  if (reduceMotion()) { navSpring.set(1); t.complete(); crossFade(views[underName]); return; }
  navSpring.animateTo(1, { damping: 1, response: 0.34, velocity, onComplete: t.complete });
}

function resetNav(names) {
  finishTransition();
  nav.stack = names.slice();
  showOnly(current());
  refreshBar(views[current()]);
}

/** Die darunterliegende Ansicht aktuell zeichnen, bevor sie sichtbar wird. */
function prepareUnder(name) {
  if (name === "decks" && state.col) renderDecks();
  if (name === "home") renderHome();
}

/** Nach dem Zurückgehen: die verlassene Ansicht aufräumen. */
function arrived(leftName) {
  if (leftName === "study") {
    clearTimeout(state.study?.waitTimer);
    state.study = null;
  }
  flushSave();
}

document.querySelectorAll("[data-back]").forEach(b => b.addEventListener("click", () => pop()));

// Wisch-zurück vom linken Rand – 1:1 mit dem Finger, der Schwung entscheidet
(() => {
  const stackEl = $("stack");
  let g = null;
  stackEl.addEventListener("pointerdown", e => {
    if (nav.stack.length < 2 || sheetOpen) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.clientX > 28) return;
    if (e.pointerType === "mouse") e.preventDefault();
    g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, decided: false, tracker: new VelocityTracker(), p0: 0 };
  });
  stackEl.addEventListener("pointermove", e => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (!g.decided) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (dx <= Math.abs(dy)) { g = null; return; }
      g.decided = true;
      try { stackEl.setPointerCapture(e.pointerId); } catch { /* egal */ }
      const topName = current(), underName = nav.stack[nav.stack.length - 2];
      const grabbing = nav.trans && nav.trans.topName === topName && nav.trans.underName === underName;
      if (!grabbing) { prepareUnder(underName); beginTransition(topName, underName); navSpring.set(0); }
      navSpring.stop();
      g.p0 = navSpring.value - dx / innerWidth; // bei Unterbrechung vom aktuellen Wert aus weiter
    }
    const w = innerWidth;
    let p = g.p0 + dx / w;
    if (p < 0) p = rubberband(p * w, w) / w;
    navSpring.set(p);
    g.tracker.add(e.clientX);
  });
  const release = e => {
    if (!g || e.pointerId !== g.id) return;
    const wasDecided = g.decided;
    const vPx = g.tracker.velocity;
    g = null;
    if (!wasDecided || !nav.trans) return;
    swallowClick();
    const w = innerWidth;
    const v = vPx / w;
    const commit = Math.abs(vPx) > 300 ? vPx > 0 : navSpring.value + project(vPx) / w > 0.5;
    if (commit) pop({ velocity: v });
    else {
      const t = nav.trans;
      t.complete = () => endTransition(true);
      navSpring.animateTo(0, { damping: 1, response: 0.35, velocity: v, onComplete: t.complete });
    }
  };
  stackEl.addEventListener("pointerup", release);
  stackEl.addEventListener("pointercancel", release);
})();

// Navigationsleiste: Material erst, wenn Inhalt darunter liegt; kleiner Titel, sobald der große verschwindet
function refreshBar(view) {
  if (view.hidden) return; // unsichtbar → keine Maße
  const bar = view.querySelector(".nav-bar");
  const lt = view.querySelector(".large-title");
  view.classList.toggle("is-scrolled", view.scrollTop > 1);
  if (lt) view.classList.toggle("show-title", lt.getBoundingClientRect().bottom < bar.getBoundingClientRect().bottom + 2);
}
for (const v of Object.values(views)) v.addEventListener("scroll", () => refreshBar(v), { passive: true });

// ───────────────────────── Sheet (ziehbar) ─────────────────────────
const sheetEl = $("sheet"), backdrop = $("sheet-backdrop"), sheetBody = $("sheet-body");
let sheetH = 1, sheetOpen = false, sheetOnClose = null;
const sheetY = new SpringValue(0, y => {
  sheetEl.style.transform = `translate3d(0,${y}px,0)`;
  backdrop.style.opacity = String(clamp(1 - y / sheetH, 0, 1));
}, 0.5);

function openSheet(title, html, bind, { onClose } = {}) {
  const prev = sheetOnClose;
  sheetOnClose = onClose || null;
  prev?.();
  $("sheet-title").textContent = title;
  sheetBody.innerHTML = html;
  sheetBody.scrollTop = 0;
  const wasOpen = sheetOpen;
  sheetOpen = true;
  sheetEl.hidden = false;
  backdrop.hidden = false;
  backdrop.style.pointerEvents = "";
  sheetH = sheetEl.offsetHeight || 1;
  bind?.(sheetBody);
  sheetBody.style.touchAction = sheetBody.scrollHeight <= sheetBody.clientHeight + 1 ? "none" : "pan-y";
  if (wasOpen) materialize(sheetBody, { y: 4, scale: 1 });
  else if (!sheetY.animating) sheetY.set(sheetH);
  if (reduceMotion() && !wasOpen) sheetEl.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
  sheetY.animateTo(0, { damping: 1, response: 0.35 });
}

function closeSheet({ velocity } = {}) {
  if (!sheetOpen) return;
  sheetOpen = false;
  const cb = sheetOnClose;
  sheetOnClose = null;
  backdrop.style.pointerEvents = "none";
  const done = () => { if (!sheetOpen) { sheetEl.hidden = true; backdrop.hidden = true; } };
  if (reduceMotion()) {
    const a = sheetEl.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 160 });
    if (a) a.onfinish = () => { if (!sheetOpen) sheetY.set(sheetH); done(); }; else done();
  } else {
    sheetY.animateTo(sheetH + 30, { damping: 1, response: 0.3, velocity, onComplete: done });
  }
  cb?.();
}
backdrop.addEventListener("click", () => closeSheet());

(() => {
  let d = null;
  sheetEl.addEventListener("pointerdown", e => {
    if (!sheetOpen) return;
    const inHandle = !!e.target.closest(".sheet-handle");
    const bodyFits = sheetBody.scrollHeight <= sheetBody.clientHeight + 1;
    if (!inHandle && !bodyFits) return;
    d = { id: e.pointerId, y0: e.clientY, x0: e.clientX, start: sheetY.value, decided: false, tracker: new VelocityTracker() };
    if (inHandle) { sheetY.stop(); d.start = sheetY.value; } // mitten in der Bewegung greifen
    if (e.pointerType === "mouse" && inHandle) e.preventDefault(); // keine Textauswahl/Drag&Drop
  });
  sheetEl.addEventListener("pointermove", e => {
    if (!d || e.pointerId !== d.id) return;
    const dy = e.clientY - d.y0, dx = e.clientX - d.x0;
    if (!d.decided) {
      if (Math.abs(dy) < 10 && Math.abs(dx) < 10) return;
      if (Math.abs(dy) <= Math.abs(dx)) { d = null; return; }
      d.decided = true;
      sheetY.stop();
      d.start = sheetY.value - dy;
      try { sheetEl.setPointerCapture(e.pointerId); } catch { /* egal */ }
    }
    let y = d.start + dy;
    if (y < 0) y = rubberband(y, sheetH);
    sheetY.set(y);
    d.tracker.add(e.clientY);
  });
  const release = e => {
    if (!d || e.pointerId !== d.id) return;
    const { decided, tracker } = d;
    d = null;
    if (!decided) { if (sheetOpen && !sheetY.animating && sheetY.value !== 0) sheetY.animateTo(0); return; }
    swallowClick();
    const v = tracker.velocity;
    const projected = sheetY.value + project(v);
    if ((v > 500 || projected > sheetH * 0.5) && v > -200) closeSheet({ velocity: v });
    else sheetY.animateTo(0, { damping: 0.8, response: 0.3, velocity: v }); // nach Schwung: leichtes Nachfedern
  };
  sheetEl.addEventListener("pointerup", release);
  sheetEl.addEventListener("pointercancel", release);
})();

function confirmSheet(title, html, okLabel, danger = false) {
  return new Promise(resolve => {
    let ok = false;
    openSheet(title, `${html}
      <div class="sheet-actions">
        <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-ok>${esc(okLabel)}</button>
        <button class="btn btn-ghost" data-cancel>Abbrechen</button>
      </div>`, body => {
      body.querySelector("[data-ok]").onclick = () => { ok = true; closeSheet(); };
      body.querySelector("[data-cancel]").onclick = () => closeSheet();
    }, { onClose: () => resolve(ok) });
  });
}

// ───────────────────────── Bibliothek ─────────────────────────
async function renderHome() {
  const list = await store.listPackages();
  const box = $("home-list");
  $("home-empty").hidden = list.length > 0;
  box.innerHTML = list.map(p => `
    <div class="row row-press">
      <button class="pkg" data-id="${esc(p.id)}">
        <span class="pkg-icon" aria-hidden="true"><span>${p.kind === "colpkg" ? "col" : "apkg"}</span></span>
        <span class="pkg-main">
          <span class="pkg-name">${esc(p.name.replace(/\.(apkg|colpkg)$/i, ""))}</span>
          <span class="pkg-meta">${p.summary ? `${p.summary.cards} Karten · ${p.summary.decks} Stapel` : fmtSize(p.size)}</span>
          <span class="pkg-meta">Gelernt: ${fmtDate(p.studiedAt)}</span>
        </span>
        ${p.dirty ? `<span class="badge" title="Fortschritt noch nicht exportiert">Neu</span>` : ""}
        <svg class="chev"><use href="#i-chev"/></svg>
      </button>
    </div>`).join("");
  box.querySelectorAll(".pkg").forEach(b => b.addEventListener("click", () => openStored(b.dataset.id, { animate: true })));
  refreshBar(views.home);
}

$("file-input").addEventListener("change", async e => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (file) await importFile(file);
});

async function importFile(file) {
  const name = file.name || "Stapel.apkg";
  const kind = /\.colpkg$/i.test(name) ? "colpkg" : "apkg";
  if (!/\.(apkg|colpkg)$/i.test(name)) {
    toast("Bitte eine .apkg- oder .colpkg-Datei aus Anki wählen.");
    return;
  }
  busy("Lese Anki-Datei …");
  await nextFrame();
  try {
    const original = new Uint8Array(await file.arrayBuffer());
    const info = readPackage(original);
    const sqlite3 = await getSqlite();
    const col = await openCollection(sqlite3, info.dbBytes);
    const summary = summarize(col);
    col.close();

    const id = name.toLowerCase();
    const existing = (await store.listPackages()).find(p => p.id === id);
    busy(null);
    if (existing) {
      const ok = await confirmSheet(
        "Datei ersetzen?",
        `<p>„${esc(name)}“ ist schon geladen.${existing.dirty ? ` <b>Der Lernfortschritt dort wurde noch nicht exportiert und geht verloren.</b>` : ""}</p><p>Die neue Version übernimmt Karten <i>und</i> Lernstand aus der Datei.</p>`,
        "Ersetzen", existing.dirty);
      if (!ok) return;
    }
    const now = Date.now();
    await store.putPackage({
      id, name, kind, addedAt: now, openedAt: now, savedAt: now, exportedAt: null, studiedAt: null,
      dirty: false, summary,
      info: { format: info.format, collectionEntry: info.collectionEntry, media: [...info.media] },
      original, db: info.dbBytes,
    });
    store.requestPersistence();
    await openStored(id, { animate: current() === "home" });
    toast(`${summary.cards} Karten geladen`);
  } catch (err) {
    console.error(err);
    busy(null);
    toast(err instanceof PackageError ? err.message : "Die Datei konnte nicht gelesen werden: " + (err.message || err), { ms: 5000 });
  }
}

function summarize(col) {
  return { cards: col.cards.size, decks: visibleDecks(col).length };
}

// ───────────────────────── Datei öffnen ─────────────────────────
async function openStored(id, { animate = false } = {}) {
  busy("Öffne …");
  await nextFrame();
  try {
    await closeCurrent();
    const record = await store.getPackage(id);
    if (!record) throw new Error("Datei nicht gefunden");
    const sqlite3 = await getSqlite();
    state.col = await openCollection(sqlite3, record.db);
    state.record = record;
    state.info = { ...record.info, media: new Map(record.info.media) };
    record.openedAt = Date.now();
    store.patchPackage(id, { openedAt: record.openedAt });
    writeLS("last", id);
    renderDecks();
    busy(null);
    if (animate && current() === "home") push("decks");
    else resetNav(["home", "decks"]);
  } catch (err) {
    console.error(err);
    busy(null);
    toast("Öffnen fehlgeschlagen: " + (err.message || err), { ms: 5000 });
    resetNav(["home"]);
    renderHome();
  }
}

async function closeCurrent() {
  await flushSave();
  state.col?.close();
  for (const url of state.media.values()) URL.revokeObjectURL(url);
  state.media.clear();
  state.col = state.record = state.info = null;
}

// ───────────────────────── Stapelliste ─────────────────────────
function visibleDecks(col) {
  const decks = col.deckList();
  const withCards = new Set([...col.cards.values()].map(c => c.did));
  // „Default“ ausblenden, wenn er leer ist und es andere Stapel gibt (wie in Anki)
  return decks.filter(d => !(d.id === 1 && !withCards.has(1) && decks.length > 1 && !decks.some(x => x.name.startsWith(d.name + "::"))));
}

const opts = () => ({ ignoreLimits: prefs.ignoreLimits });

function renderDecks() {
  const { col, record } = state;
  if (!col) return;
  const title = record.name.replace(/\.(apkg|colpkg)$/i, "");
  $("decks-title").textContent = title;
  $("decks-compact").textContent = title;
  $("decks-kicker").textContent = record.kind === "colpkg" ? "Anki-Sammlung" : "Anki-Stapelpaket";
  $("dirty-banner").hidden = !record.dirty;
  $("opt-ignore-limits").checked = prefs.ignoreLimits;

  const timing = col.timing();
  const rows = visibleDecks(col).map(d => {
    const c = col.counts(d.id, opts(), timing);
    const total = col.cardsIn(d.id).length;
    return `
      <li class="deck row row-press" style="--depth:${d.depth}">
        <button class="deck-main" data-deck="${d.id}">
          <span class="deck-name">${esc(d.label)}<small>${total} Karten</small></span>
          <span class="c-new ${c.new ? "" : "zero"}">${c.new}</span>
          <span class="c-learn ${c.learn ? "" : "zero"}">${c.learn}</span>
          <span class="c-due ${c.review ? "" : "zero"}">${c.review}</span>
        </button>
        <button class="deck-more" data-more="${d.id}" aria-label="Optionen für ${esc(d.label)}"><svg><use href="#i-more"/></svg></button>
      </li>`;
  });
  const all = col.counts(null, opts(), timing);
  const due = all.new + all.learn + all.review;
  $("deck-list").innerHTML = rows.join("") || `<li class="deck-empty">Keine Karten in dieser Datei.</li>`;
  $("btn-study-all").textContent = due ? `Alles lernen · ${due}` : "Alles lernen";
  $("deck-list").querySelectorAll("[data-deck]").forEach(b => b.addEventListener("click", () => startStudy(Number(b.dataset.deck))));
  $("deck-list").querySelectorAll("[data-more]").forEach(b => b.addEventListener("click", () => deckSheet(Number(b.dataset.more))));
  refreshBar(views.decks);
}

$("opt-ignore-limits").addEventListener("change", e => {
  prefs.ignoreLimits = e.target.checked;
  renderDecks();
});
$("btn-study-all").addEventListener("click", () => startStudy(null));

function statsHtml(deckId) {
  const s = state.col.stats(deckId);
  const cell = (n, l, cls = "") => `<div class="stat ${cls}"><b>${n}</b><span>${l}</span></div>`;
  return `<div class="stats">
    ${cell(s.total, "Karten")}
    ${cell(s.new, "Neu", "c-new")}
    ${cell(s.learning, "Lernen", "c-learn")}
    ${cell(s.young + s.mature, "Wiederholung", "c-due")}
    ${s.mature ? cell(s.mature, "≥ 21 Tage") : ""}
    ${s.suspended ? cell(s.suspended, "Ausgesetzt") : ""}
  </div>`;
}

function deckSheet(deckId) {
  const deck = state.col.decks.get(deckId);
  openSheet(deck?.name.split("::").pop() || "Stapel", `
    ${statsHtml(deckId)}
    <div class="sheet-actions">
      <button class="btn btn-primary" data-act="study">Lernen</button>
      <button class="btn btn-danger-soft" data-act="reset">Lernfortschritt zurücksetzen …</button>
    </div>`, body => {
    body.querySelector("[data-act=study]").onclick = () => { closeSheet(); startStudy(deckId); };
    body.querySelector("[data-act=reset]").onclick = () => resetSheet(deckId);
  });
}

$("btn-pkg-menu").addEventListener("click", () => {
  const { record } = state;
  openSheet(record.name.replace(/\.(apkg|colpkg)$/i, ""), `
    ${statsHtml(null)}
    <dl class="facts">
      <dt>Format</dt><dd>${record.kind === "colpkg" ? "Sammlungspaket (.colpkg)" : "Stapelpaket (.apkg)"}${record.info.format !== "latest" ? " · altes Format" : ""}</dd>
      <dt>Geladen</dt><dd>${fmtDate(record.addedAt)}</dd>
      <dt>Exportiert</dt><dd>${fmtDate(record.exportedAt)}</dd>
    </dl>
    <div class="sheet-actions">
      <button class="btn btn-primary" data-act="export">Für Anki exportieren</button>
      <button class="btn btn-danger-soft" data-act="reset">Gesamten Lernfortschritt zurücksetzen …</button>
      <button class="btn btn-ghost" data-act="remove">Datei aus der App entfernen</button>
    </div>`, body => {
    body.querySelector("[data-act=export]").onclick = () => prepareExport();
    body.querySelector("[data-act=reset]").onclick = () => resetSheet(null);
    body.querySelector("[data-act=remove]").onclick = removeCurrent;
  });
});

async function removeCurrent() {
  const { record } = state;
  const ok = await confirmSheet("Datei entfernen?",
    `<p>„${esc(record.name)}“ wird nur aus dieser App gelöscht, nicht aus Anki.${record.dirty ? " <b>Der nicht exportierte Lernfortschritt geht verloren.</b>" : ""}</p>`,
    "Entfernen", true);
  if (!ok) return;
  const id = record.id;
  await closeCurrent();
  await store.deletePackage(id);
  writeLS("last", "");
  pop();
  toast("Datei entfernt");
}

// ───────────────────────── Zurücksetzen (mit Widerrufen) ─────────────────────────
function resetSheet(deckId) {
  const { col } = state;
  const n = col.cardsIn(deckId).length;
  const name = deckId == null ? "allen Stapeln dieser Datei" : `„${col.decks.get(deckId)?.name.split("::").pop()}“`;
  openSheet("Lernfortschritt zurücksetzen", `
    <p>Alle <b>${n} Karten</b> in ${esc(name)} werden wieder zu neuen Karten – wie „Zurücksetzen“ in Anki. Die Lernhistorie für die Statistik bleibt erhalten.</p>
    <label class="check-row"><input type="checkbox" id="reset-counts" checked> Wiederholungs- und Fehlerzähler ebenfalls auf 0</label>
    <div class="sheet-actions">
      <button class="btn btn-danger" data-ok>Zurücksetzen</button>
      <button class="btn btn-ghost" data-cancel>Abbrechen</button>
    </div>`, body => {
    body.querySelector("[data-cancel]").onclick = () => closeSheet();
    body.querySelector("[data-ok]").onclick = async () => {
      const resetCounts = body.querySelector("#reset-counts").checked;
      closeSheet();
      const snapshot = col.export();
      const wasDirty = state.record.dirty;
      const changed = col.resetProgress(deckId, { resetCounts });
      await saveNow({ studied: false });
      renderDecks();
      if (!changed) { toast("Es gab nichts zurückzusetzen."); return; }
      toast(`${changed} Karten zurückgesetzt`, {
        ms: 7000,
        action: { label: "Widerrufen", run: () => restoreSnapshot(snapshot, wasDirty) },
      });
    };
  });
}

async function restoreSnapshot(bytes, wasDirty) {
  if (!state.record) return;
  const sqlite3 = await getSqlite();
  state.col.close();
  state.col = await openCollection(sqlite3, bytes);
  await saveNow({ studied: false });
  if (!wasDirty) {
    state.record.dirty = false;
    await store.patchPackage(state.record.id, { dirty: false });
  }
  renderDecks();
  toast("Lernfortschritt wiederhergestellt");
}

// ───────────────────────── Speichern ─────────────────────────
let saveTimer = null, savePending = false, saveStudied = false;
function scheduleSave(studied = true) {
  savePending = true;
  saveStudied ||= studied;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveNow(), 700);
}

async function saveNow({ studied } = {}) {
  clearTimeout(saveTimer);
  if (!state.col || !state.record) return;
  const db = state.col.export();
  const patch = { db, dirty: true, savedAt: Date.now(), summary: summarize(state.col) };
  if (studied ?? saveStudied) patch.studiedAt = Date.now();
  Object.assign(state.record, patch);
  savePending = false; saveStudied = false;
  try {
    await store.patchPackage(state.record.id, patch);
  } catch (err) {
    console.error(err);
    toast("Speichern im Browser fehlgeschlagen – bitte bald exportieren.", { ms: 5000 });
  }
}

async function flushSave() {
  if (savePending) await saveNow();
}

document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushSave(); });
addEventListener("pagehide", () => { flushSave(); });

// ───────────────────────── Export ─────────────────────────
$("btn-export").addEventListener("click", prepareExport);
$("dirty-banner").addEventListener("click", prepareExport);

async function prepareExport() {
  busy("Erstelle Anki-Datei …");
  await nextFrame();
  try {
    await flushSave();
    const { record, info, col } = state;
    const bytes = writePackage(record.original, info, col.export());
    const file = new File([bytes], record.name, { type: "application/octet-stream" });
    state.exportFile = file;
    busy(null);
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    const step = (n, html) => `<li><span class="step-no">${n}</span><span>${html}</span></li>`;
    const steps = record.kind === "colpkg"
      ? `<ol class="sheet-steps">
          ${step(1, "Datei auf den Computer bringen (AirDrop, iCloud Drive …).")}
          ${step(2, "In Anki <b>Datei → Importieren</b> und die Datei wählen.")}
          ${step(3, "Das <b>Ersetzen</b> der Sammlung bestätigen – fertig.")}
        </ol>
        <p class="note">Ersetzt die komplette Sammlung am Computer. Dort seit dem letzten Export gemachte Änderungen gehen verloren.</p>`
      : `<ol class="sheet-steps">
          ${step(1, "Datei auf den Computer bringen (AirDrop, iCloud Drive …).")}
          ${step(2, "In Anki die betroffenen Stapel <b>löschen</b> – sonst übernimmt Anki keinen Lernstand für Karten, die es schon kennt.")}
          ${step(3, "<b>Datei → Importieren</b> mit „Lernfortschritt importieren“.")}
        </ol>
        <p class="note">Bequemer: in Anki als <b>.colpkg</b> exportieren – dann klappt der Rückweg ohne Löschen.</p>`;
    openSheet("Für Anki exportieren", `
      <div class="export-file"><b>${esc(record.name)}</b><span>${fmtSize(bytes.length)}</span></div>
      ${steps}
      <div class="sheet-actions">
        ${canShare ? `<button class="btn btn-primary" data-act="share"><svg class="btn-icon-svg"><use href="#i-share"/></svg>Teilen oder sichern</button>` : ""}
        <button class="btn ${canShare ? "btn-secondary" : "btn-primary"}" data-act="download">Herunterladen</button>
      </div>`, body => {
      body.querySelector("[data-act=share]")?.addEventListener("click", async () => {
        try {
          await navigator.share({ files: [state.exportFile], title: record.name });
          markExported();
        } catch (err) {
          if (err?.name !== "AbortError") toast("Teilen nicht möglich – bitte „Herunterladen“ nutzen.");
        }
      });
      body.querySelector("[data-act=download]").addEventListener("click", () => {
        const url = URL.createObjectURL(state.exportFile);
        const a = document.createElement("a");
        a.href = url; a.download = record.name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        markExported();
      });
    });
  } catch (err) {
    console.error(err);
    busy(null);
    toast("Export fehlgeschlagen: " + (err.message || err), { ms: 5000 });
  }
}

async function markExported() {
  closeSheet();
  const patch = { dirty: false, exportedAt: Date.now() };
  Object.assign(state.record, patch);
  await store.patchPackage(state.record.id, patch);
  renderDecks();
  toast("Exportiert – jetzt in Anki importieren");
}

// ───────────────────────── Lernen ─────────────────────────
const host = $("card-host");
const shadow = host.attachShadow({ mode: "open" });

function startStudy(deckId) {
  state.study = { deckId, newShown: 0, revShown: 0, shown: 0, undo: [], current: null, learnAheadAll: false, waitTimer: null };
  const deck = deckId == null ? null : state.col.decks.get(deckId);
  $("study-deck").textContent = deck ? deck.name.split("::").pop() : "Alle Stapel";
  nextCard({ animate: false });
  push("study");
}

function updateCounts() {
  const { col, study } = state;
  const c = col.counts(study.deckId, opts());
  const el = $("study-counts").children;
  el[0].textContent = c.new; el[1].textContent = c.learn; el[2].textContent = c.review;
  const cur = study.current?.card;
  for (const x of el) x.classList.remove("active");
  if (cur) el[cur.queue === 0 ? 0 : (cur.queue === 1 || cur.queue === 3 ? 1 : 2)].classList.add("active");
  $("btn-undo").disabled = study.undo.length === 0;
}

async function nextCard({ animate = true } = {}) {
  const { col, study } = state;
  clearTimeout(study.waitTimer);
  const res = col.nextCard(study.deckId, { ...opts(), learnAheadAll: study.learnAheadAll }, study);
  if (!res.card) return showDone(res);
  await presentCard(res.card, { animate });
}

async function presentCard(card, { animate = true } = {}) {
  const { col, study } = state;
  const note = col.note(card.nid);
  const notetype = note && col.notetypes.get(note.mid);
  study.current = { card, note, notetype, fuzz: Math.random(), shownAt: performance.now(), side: "q", typed: "" };
  study.shown++;
  $("study-done").hidden = true;
  host.hidden = false;
  host.classList.remove("is-answer");
  $("study-actions").hidden = false;
  $("btn-show").hidden = false;
  $("ease-buttons").hidden = true;
  $("tap-hint").hidden = study.shown > 2;
  updateCounts();
  if (!note || !notetype) {
    paint(`<p>Diese Karte konnte nicht gelesen werden.</p>`, "");
    return;
  }
  await paintSide("q");
  views.study.scrollTop = 0;
  refreshBar(views.study);
  if (animate) materialize(host, { y: 10, scale: 0.99, duration: 260 });
  shadow.querySelector("#typeans")?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); showAnswer(); } });
}

async function paintSide(side) {
  const { col, study } = state;
  const { card, note, notetype } = study.current;
  const deck = col.decks.get(card.did);
  const html = renderCard({ card, note, notetype, deckName: deck?.name || "", side, typed: study.current.typed });
  paint(html, notetype.css, card.ord);
  await hydrate(shadow.querySelector(".card"), { mediaUrl, note, notetype, card, side });
}

function paint(html, css, ord = 0) {
  const dark = prefersDark.matches;
  shadow.innerHTML = `<style>${CARD_BASE_CSS}\n${css || ""}</style><div class="card card${ord + 1}${dark ? " nightMode night_mode" : ""}">${html}</div>`;
}

async function mediaUrl(name) {
  if (state.media.has(name)) return state.media.get(name);
  const data = readMedia(state.record.original, state.info, name);
  if (!data) return null;
  const ext = name.split(".").pop().toLowerCase();
  const url = URL.createObjectURL(new Blob([data], { type: MIME[ext] || "application/octet-stream" }));
  state.media.set(name, url);
  return url;
}

async function showAnswer() {
  const { study, col } = state;
  const cur = study?.current;
  if (!cur || cur.side === "a" || !cur.notetype) return;
  cur.typed = shadow.querySelector("#typeans")?.value || "";
  cur.side = "a";
  host.classList.add("is-answer");
  $("tap-hint").hidden = true;
  const pv = col.preview(cur.card, cur.fuzz);
  document.querySelectorAll("#ease-buttons .ease").forEach(b => {
    b.querySelector(".ease-ivl").textContent = pv[b.dataset.ease].label;
  });
  $("btn-show").hidden = true;
  $("ease-buttons").hidden = false;
  await paintSide("a");
  const mark = shadow.querySelector("#answer");
  if (mark && mark.getBoundingClientRect().top > innerHeight * 0.6) {
    mark.scrollIntoView({ block: "start", behavior: reduceMotion() ? "auto" : "smooth" });
  }
}

// Auf die Karte tippen zeigt die Antwort (wie in AnkiMobile)
host.addEventListener("click", e => {
  if (state.study?.current?.side !== "q") return;
  const interactive = e.composedPath().some(n => n instanceof HTMLElement && /^(A|INPUT|TEXTAREA|SELECT|AUDIO|VIDEO|BUTTON|LABEL)$/.test(n.tagName));
  if (!interactive) showAnswer();
});

async function answer(ease) {
  const { study, col } = state;
  const cur = study?.current;
  if (!cur || cur.side !== "a") return;
  const taken = performance.now() - cur.shownAt;
  const info = col.answer(cur.card, ease, taken, cur.fuzz);
  navigator.vibrate?.(8);
  if (cur.card.queue === 0) study.newShown++; else study.revShown++;
  study.undo.push({ ...info, wasNew: cur.card.queue === 0 });
  if (study.undo.length > 30) study.undo.shift();
  if (info.leeched) toast("Diese Karte wird oft vergessen und wurde als „Leech“ markiert.");
  scheduleSave();
  study.current = null;
  await nextCard();
}

async function undo() {
  const { study, col } = state;
  const info = study?.undo.pop();
  if (!info) return;
  col.undo(info);
  if (info.wasNew) study.newShown = Math.max(0, study.newShown - 1); else study.revShown = Math.max(0, study.revShown - 1);
  scheduleSave();
  await presentCard(col.cards.get(info.before.id));
  toast("Letzte Antwort zurückgenommen");
}

function showDone(res) {
  const { study } = state;
  study.current = null;
  updateCounts();
  host.hidden = true;
  $("tap-hint").hidden = true;
  shadow.innerHTML = "";
  $("study-actions").hidden = true;
  $("study-done").hidden = false;
  materialize($("study-done"));
  const later = state.col.queues(study.deckId, opts()).learnLater.length;
  if (res.nextLearnAt) {
    const wait = Math.max(5, res.nextLearnAt - Date.now() / 1000 - Number(state.col.config("collapseTime", 1200)));
    const mins = Math.max(1, Math.round(wait / 60));
    $("done-title").textContent = "Kurze Pause";
    $("done-text").textContent = `${later} Karte${later === 1 ? "" : "n"} in der Lernphase – die nächste ist in etwa ${mins} Min wieder dran. Bleib einfach hier, sie erscheint automatisch.`;
    $("btn-learn-ahead").hidden = false;
    if (wait < 3600) study.waitTimer = setTimeout(() => { if (current() === "study" && state.study === study && !study.current) nextCard(); }, wait * 1000);
  } else {
    const c = state.col.counts(study.deckId, { ignoreLimits: true });
    $("done-title").textContent = "Für heute geschafft";
    $("done-text").textContent = !prefs.ignoreLimits && c.new
      ? `Das Tageslimit ist erreicht. ${c.new} neue Karten warten noch – in der Übersicht „Tageslimits ignorieren“ einschalten, um weiterzumachen.`
      : "Alles Fällige ist gelernt. Denk daran, den Fortschritt an Anki zurückzugeben.";
    $("btn-learn-ahead").hidden = true;
  }
}

$("btn-show").addEventListener("click", showAnswer);
document.querySelectorAll("#ease-buttons .ease").forEach(b => b.addEventListener("click", () => answer(Number(b.dataset.ease))));
$("btn-undo").addEventListener("click", undo);
$("btn-learn-ahead").addEventListener("click", () => { state.study.learnAheadAll = true; nextCard(); });
$("btn-done-back").addEventListener("click", () => pop());

document.addEventListener("keydown", e => {
  if (current() !== "study" || !state.study?.current || sheetOpen) return;
  if (e.target instanceof HTMLInputElement || e.composedPath()[0] instanceof HTMLInputElement) return;
  const cur = state.study.current;
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    if (cur.side === "q") showAnswer(); else answer(3);
  } else if (cur.side === "a" && ["1", "2", "3", "4"].includes(e.key)) {
    answer(Number(e.key));
  } else if (e.key === "z" && !e.metaKey) {
    undo();
  }
});

// Tageswechsel o. Ä.: Zähler beim Zurückkehren in die App aktualisieren
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.col && current() === "decks") renderDecks();
});

// ───────────────────────── Start ─────────────────────────
async function init() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
  getSqlite().catch(err => console.error("SQLite konnte nicht geladen werden", err));
  resetNav(["home"]);
  const last = readLS("last");
  const list = await store.listPackages().catch(() => []);
  if (last && list.some(p => p.id === last)) await openStored(last);
  else renderHome();
}

init();
