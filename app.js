// Karteikasten – Anki-Stapel im Browser lernen.
// Ablauf: .apkg/.colpkg öffnen → lernen (Anki-Planer) → als Paket mit Fortschritt zurückgeben.

import sqlite3InitModule from "./vendor/sqlite-wasm/index.mjs";
import { readPackage, writePackage, readMedia, PackageError } from "./anki/package.js";
import { openCollection } from "./anki/collection.js";
import { renderCard, hydrate, CARD_BASE_CSS } from "./anki/render.js";
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

// ───────────────────────── Hilfen ─────────────────────────
function show(view) {
  for (const [k, el] of Object.entries(views)) el.hidden = k !== view;
  window.scrollTo(0, 0);
}

let toastTimer;
function toast(msg, ms = 2600) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

function busy(text) {
  $("busy-text").textContent = text || "Bitte warten …";
  $("busy").hidden = !text;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

function fmtDate(ms) {
  if (!ms) return "–";
  const d = new Date(ms);
  const today = new Date();
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `heute, ${time}`;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }) + `, ${time}`;
}

function fmtSize(b) {
  if (b > 1e6) return (b / 1e6).toFixed(1).replace(".", ",") + " MB";
  return Math.max(1, Math.round(b / 1e3)) + " KB";
}

const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", m4a: "audio/mp4", mp4: "video/mp4", webm: "video/webm" };

// ───────────────────────── Sheet ─────────────────────────
function openSheet(title, html, bind) {
  $("sheet-title").textContent = title;
  $("sheet-body").innerHTML = html;
  $("sheet").hidden = false;
  $("sheet-backdrop").hidden = false;
  bind?.($("sheet-body"));
}
function closeSheet() {
  $("sheet").hidden = true;
  $("sheet-backdrop").hidden = true;
}
$("sheet-backdrop").addEventListener("click", closeSheet);

// ───────────────────────── Bibliothek ─────────────────────────
async function renderHome() {
  const list = await store.listPackages();
  const box = $("home-list");
  $("home-empty").hidden = list.length > 0;
  box.innerHTML = list.map(p => `
    <button class="pkg" data-id="${esc(p.id)}">
      <span class="pkg-icon" aria-hidden="true">${p.kind === "colpkg" ? "▤" : "▦"}</span>
      <span class="pkg-main">
        <span class="pkg-name">${esc(p.name)}</span>
        <span class="pkg-meta">${p.summary ? `${p.summary.cards} Karten · ${p.summary.decks} Stapel · ` : ""}${fmtSize(p.size)}</span>
        <span class="pkg-meta">Zuletzt gelernt: ${fmtDate(p.studiedAt)}</span>
      </span>
      ${p.dirty ? `<span class="badge" title="Fortschritt noch nicht exportiert">neu</span>` : ""}
    </button>`).join("");
  box.querySelectorAll(".pkg").forEach(b => b.addEventListener("click", () => openStored(b.dataset.id)));
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
        `<p>„${esc(name)}“ ist schon geladen.${existing.dirty ? ` <b>Achtung:</b> Der Lernfortschritt dort wurde noch nicht exportiert und geht verloren.` : ""}</p><p>Die neue Version (z. B. frisch aus Anki) übernimmt Karten <i>und</i> Lernstand aus der Datei.</p>`,
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
    await openStored(id);
    toast(`${summary.cards} Karten geladen`);
  } catch (err) {
    console.error(err);
    busy(null);
    toast(err instanceof PackageError ? err.message : "Die Datei konnte nicht gelesen werden: " + (err.message || err), 5000);
  }
}

function summarize(col) {
  const decks = visibleDecks(col);
  return { cards: col.cards.size, decks: decks.length };
}

// ───────────────────────── Datei öffnen ─────────────────────────
async function openStored(id) {
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
    show("decks");
  } catch (err) {
    console.error(err);
    toast("Öffnen fehlgeschlagen: " + (err.message || err), 5000);
    show("home");
    renderHome();
  } finally {
    busy(null);
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

function opts() {
  return { ignoreLimits: prefs.ignoreLimits };
}

function renderDecks() {
  const { col, record } = state;
  $("decks-title").textContent = record.name.replace(/\.(apkg|colpkg)$/i, "");
  $("decks-kicker").textContent = record.kind === "colpkg" ? "Anki-Sammlung" : "Anki-Stapelpaket";
  $("dirty-banner").hidden = !record.dirty;
  $("opt-ignore-limits").checked = prefs.ignoreLimits;

  const timing = col.timing();
  const decks = visibleDecks(col);
  const rows = decks.map(d => {
    const c = col.counts(d.id, opts(), timing);
    const total = col.cardsIn(d.id).length;
    return `
      <li class="deck" style="--depth:${d.depth}">
        <button class="deck-main" data-deck="${d.id}">
          <span class="deck-name">${esc(d.label)}<small>${total} Karten</small></span>
          <span class="c-new ${c.new ? "" : "zero"}">${c.new}</span>
          <span class="c-learn ${c.learn ? "" : "zero"}">${c.learn}</span>
          <span class="c-due ${c.review ? "" : "zero"}">${c.review}</span>
        </button>
        <button class="deck-more" data-more="${d.id}" aria-label="Optionen für ${esc(d.label)}">⋯</button>
      </li>`;
  });
  const all = col.counts(null, opts(), timing);
  $("deck-list").innerHTML = rows.join("") || `<li class="deck-empty">Keine Karten in dieser Datei.</li>`;
  $("btn-study-all").textContent = all.new + all.learn + all.review ? `Alles lernen (${all.new + all.learn + all.review})` : "Alles lernen";
  $("deck-list").querySelectorAll("[data-deck]").forEach(b => b.addEventListener("click", () => startStudy(Number(b.dataset.deck))));
  $("deck-list").querySelectorAll("[data-more]").forEach(b => b.addEventListener("click", () => deckSheet(Number(b.dataset.more))));
}

$("opt-ignore-limits").addEventListener("change", e => {
  prefs.ignoreLimits = e.target.checked;
  renderDecks();
});
$("btn-study-all").addEventListener("click", () => startStudy(null));
document.querySelectorAll("[data-nav=home]").forEach(b => b.addEventListener("click", async () => {
  await flushSave();
  show("home");
  renderHome();
}));

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
      <button class="btn btn-danger-soft" data-act="reset">Lernfortschritt zurücksetzen</button>
    </div>`, body => {
    body.querySelector("[data-act=study]").onclick = () => { closeSheet(); startStudy(deckId); };
    body.querySelector("[data-act=reset]").onclick = () => resetSheet(deckId);
  });
}

$("btn-pkg-menu").addEventListener("click", () => {
  const { record } = state;
  openSheet("Datei", `
    ${statsHtml(null)}
    <dl class="facts">
      <dt>Format</dt><dd>${record.kind === "colpkg" ? "Sammlungspaket (.colpkg)" : "Stapelpaket (.apkg)"}${record.info.format !== "latest" ? " · altes Format" : ""}</dd>
      <dt>Geladen</dt><dd>${fmtDate(record.addedAt)}</dd>
      <dt>Exportiert</dt><dd>${fmtDate(record.exportedAt)}</dd>
    </dl>
    <div class="sheet-actions">
      <button class="btn btn-primary" data-act="export">Für Anki exportieren</button>
      <button class="btn btn-danger-soft" data-act="reset">Gesamten Lernfortschritt zurücksetzen</button>
      <button class="btn btn-ghost" data-act="remove">Datei aus der App entfernen</button>
    </div>`, body => {
    body.querySelector("[data-act=export]").onclick = () => { closeSheet(); prepareExport(); };
    body.querySelector("[data-act=reset]").onclick = () => resetSheet(null);
    body.querySelector("[data-act=remove]").onclick = removeCurrent;
  });
});

async function removeCurrent() {
  const { record } = state;
  const ok = await confirmSheet("Datei entfernen?",
    `<p>„${esc(record.name)}“ wird nur aus dieser App gelöscht.${record.dirty ? " <b>Der nicht exportierte Lernfortschritt geht verloren.</b>" : ""}</p>`,
    "Entfernen", true);
  if (!ok) return;
  const id = record.id;
  await closeCurrent();
  await store.deletePackage(id);
  show("home");
  renderHome();
  toast("Entfernt");
}

function confirmSheet(title, html, okLabel, danger = false) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (done) return; done = true; closeSheet(); $("sheet-backdrop").removeEventListener("click", onBackdrop); resolve(v); };
    const onBackdrop = () => finish(false);
    $("sheet-backdrop").addEventListener("click", onBackdrop);
    openSheet(title, `${html}
      <div class="sheet-actions">
        <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-ok>${esc(okLabel)}</button>
        <button class="btn btn-ghost" data-cancel>Abbrechen</button>
      </div>`, body => {
      body.querySelector("[data-ok]").onclick = () => finish(true);
      body.querySelector("[data-cancel]").onclick = () => finish(false);
    });
  });
}

// ───────────────────────── Zurücksetzen ─────────────────────────
function resetSheet(deckId) {
  const { col } = state;
  const n = col.cardsIn(deckId).length;
  const name = deckId == null ? "alle Stapel dieser Datei" : `„${col.decks.get(deckId)?.name.split("::").pop()}“`;
  openSheet("Lernfortschritt zurücksetzen", `
    <p>Alle <b>${n} Karten</b> in ${esc(name)} werden wieder zu neuen Karten – wie „Zurücksetzen / Vergessen“ in Anki. Die Lernhistorie für die Statistik bleibt erhalten.</p>
    <label class="check-row"><input type="checkbox" id="reset-counts" checked> Wiederholungs- und Fehlerzähler ebenfalls auf 0</label>
    <div class="sheet-actions">
      <button class="btn btn-danger" data-ok>Zurücksetzen</button>
      <button class="btn btn-ghost" data-cancel>Abbrechen</button>
    </div>`, body => {
    body.querySelector("[data-cancel]").onclick = closeSheet;
    body.querySelector("[data-ok]").onclick = async () => {
      const resetCounts = body.querySelector("#reset-counts").checked;
      closeSheet();
      const changed = col.resetProgress(deckId, { resetCounts });
      await saveNow({ studied: false });
      renderDecks();
      toast(changed ? `${changed} Karten zurückgesetzt – auf ein Neues!` : "Es gab nichts zurückzusetzen.");
    };
  });
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
    toast("Speichern im Browser fehlgeschlagen – bitte bald exportieren.", 5000);
  }
}

async function flushSave() {
  if (savePending) await saveNow();
}

document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushSave(); });
addEventListener("pagehide", () => { flushSave(); });

// ───────────────────────── Export ─────────────────────────
$("btn-export").addEventListener("click", prepareExport);
$("btn-banner-export").addEventListener("click", prepareExport);

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
    const steps = record.kind === "colpkg"
      ? `<ol class="steps">
          <li>Datei auf den Computer bringen (AirDrop, iCloud Drive …).</li>
          <li>In Anki: <b>Datei → Importieren</b> und die Datei wählen.</li>
          <li>Anki fragt, ob die Sammlung <b>ersetzt</b> werden soll → bestätigen. Fertig – Karten und Fortschritt sind übernommen.</li>
        </ol>
        <p class="note">Ein Sammlungspaket ersetzt die komplette Sammlung am Computer. Änderungen, die du dort seit dem letzten Export gemacht hast, gehen dabei verloren.</p>`
      : `<ol class="steps">
          <li>Datei auf den Computer bringen (AirDrop, iCloud Drive …).</li>
          <li>In Anki die betroffenen Stapel <b>löschen</b> (Zahnrad → Löschen). Anki übernimmt beim Import sonst keinen Lernstand für Karten, die es schon kennt.</li>
          <li><b>Datei → Importieren</b>, Datei wählen, „Lernfortschritt importieren“ anhaken.</li>
        </ol>
        <p class="note">Bequemer: in Anki als <b>.colpkg</b> (Sammlungspaket) exportieren – dann klappt der Rückweg ohne Löschen.</p>`;
    openSheet("Für Anki exportieren", `
      <p class="export-file"><b>${esc(record.name)}</b><span>${fmtSize(bytes.length)}</span></p>
      ${steps}
      <div class="sheet-actions">
        ${canShare ? `<button class="btn btn-primary" data-act="share">Teilen / In „Dateien“ sichern</button>` : ""}
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
    toast("Export fehlgeschlagen: " + (err.message || err), 5000);
  }
}

async function markExported() {
  closeSheet();
  const patch = { dirty: false, exportedAt: Date.now() };
  Object.assign(state.record, patch);
  await store.patchPackage(state.record.id, patch);
  if (!views.decks.hidden) renderDecks();
  toast("Exportiert – jetzt in Anki importieren.");
}

// ───────────────────────── Lernen ─────────────────────────
const host = $("card-host");
const shadow = host.attachShadow({ mode: "open" });

function startStudy(deckId) {
  state.study = { deckId, newShown: 0, revShown: 0, undo: [], current: null, learnAheadAll: false, waitTimer: null };
  const deck = deckId == null ? null : state.col.decks.get(deckId);
  $("study-deck").textContent = deck ? deck.name.split("::").pop() : "Alle Stapel";
  show("study");
  nextCard();
}

function updateCounts() {
  const { col, study } = state;
  const c = col.counts(study.deckId, opts());
  const el = $("study-counts").children;
  el[0].textContent = c.new; el[1].textContent = c.learn; el[2].textContent = c.review;
  const cur = study.current?.card;
  for (const x of el) x.classList.remove("active");
  if (cur) {
    const idx = cur.queue === 0 ? 0 : (cur.queue === 1 || cur.queue === 3 ? 1 : 2);
    el[idx].classList.add("active");
  }
  $("btn-undo").disabled = study.undo.length === 0;
}

async function nextCard() {
  const { col, study } = state;
  clearTimeout(study.waitTimer);
  const res = col.nextCard(study.deckId, { ...opts(), learnAheadAll: study.learnAheadAll }, study);
  if (!res.card) return showDone(res);
  await presentCard(res.card);
}

async function presentCard(card) {
  const { col, study } = state;
  const note = col.note(card.nid);
  const notetype = note && col.notetypes.get(note.mid);
  study.current = { card, note, notetype, fuzz: Math.random(), shownAt: performance.now(), side: "q", typed: "" };
  $("study-done").hidden = true;
  host.hidden = false;
  $("study-actions").hidden = false;
  $("btn-show").hidden = false;
  $("ease-buttons").hidden = true;
  updateCounts();
  if (!note || !notetype) {
    paint(`<p>Diese Karte konnte nicht gelesen werden.</p>`, "");
    return;
  }
  await paintSide("q");
  window.scrollTo(0, 0);
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
  const cur = study.current;
  if (!cur || cur.side === "a" || !cur.notetype) return;
  cur.typed = shadow.querySelector("#typeans")?.value || "";
  cur.side = "a";
  await paintSide("a");
  const answerMark = shadow.querySelector("#answer");
  if (answerMark) answerMark.scrollIntoView({ block: "start", behavior: "smooth" });
  const pv = col.preview(cur.card, cur.fuzz);
  document.querySelectorAll("#ease-buttons .ease").forEach(b => {
    b.querySelector(".ease-ivl").textContent = pv[b.dataset.ease].label;
  });
  $("btn-show").hidden = true;
  $("ease-buttons").hidden = false;
}

async function answer(ease) {
  const { study, col } = state;
  const cur = study.current;
  if (!cur || cur.side !== "a") return;
  const taken = performance.now() - cur.shownAt;
  const info = col.answer(cur.card, ease, taken, cur.fuzz);
  if (cur.card.queue === 0) study.newShown++; else study.revShown++;
  study.undo.push({ ...info, wasNew: cur.card.queue === 0 });
  if (study.undo.length > 30) study.undo.shift();
  if (info.leeched) toast("Diese Karte ist ein „Leech“ (oft vergessen) und wurde markiert.");
  scheduleSave();
  study.current = null;
  await nextCard();
}

async function undo() {
  const { study, col } = state;
  const info = study.undo.pop();
  if (!info) return;
  col.undo(info);
  if (info.wasNew) study.newShown = Math.max(0, study.newShown - 1); else study.revShown = Math.max(0, study.revShown - 1);
  scheduleSave();
  await presentCard(col.cards.get(info.before.id));
  toast("Rückgängig gemacht");
}

function showDone(res) {
  const { study } = state;
  study.current = null;
  updateCounts();
  host.hidden = true;
  shadow.innerHTML = "";
  $("study-actions").hidden = true;
  $("study-done").hidden = false;
  const later = state.col.queues(study.deckId, opts()).learnLater.length;
  if (res.nextLearnAt) {
    const wait = Math.max(5, res.nextLearnAt - Date.now() / 1000 - Number(state.col.config("collapseTime", 1200)));
    const mins = Math.max(1, Math.round(wait / 60));
    $("done-title").textContent = "Kurze Pause";
    $("done-text").textContent = `${later} Karte${later === 1 ? "" : "n"} in der Lernphase – die nächste ist in etwa ${mins} Min wieder dran. Bleib einfach hier, sie erscheint automatisch.`;
    $("btn-learn-ahead").hidden = false;
    if (wait < 3600) study.waitTimer = setTimeout(() => { if (!views.study.hidden && !study.current) nextCard(); }, wait * 1000);
  } else {
    const c = state.col.counts(study.deckId, { ignoreLimits: true });
    $("done-title").textContent = "Für heute geschafft";
    $("done-text").textContent = !prefs.ignoreLimits && c.new
      ? `Das Tageslimit ist erreicht. Es warten noch ${c.new} neue Karten – in der Übersicht „Tageslimits ignorieren“ einschalten, um weiterzumachen.`
      : "Alles Fällige ist gelernt. Vergiss nicht, den Fortschritt an Anki zurückzugeben.";
    $("btn-learn-ahead").hidden = true;
  }
}

$("btn-show").addEventListener("click", showAnswer);
document.querySelectorAll("#ease-buttons .ease").forEach(b => b.addEventListener("click", () => answer(Number(b.dataset.ease))));
$("btn-undo").addEventListener("click", undo);
$("btn-learn-ahead").addEventListener("click", () => { state.study.learnAheadAll = true; nextCard(); });
$("btn-done-back").addEventListener("click", leaveStudy);
$("btn-study-back").addEventListener("click", leaveStudy);

async function leaveStudy() {
  clearTimeout(state.study?.waitTimer);
  state.study = null;
  await flushSave();
  renderDecks();
  show("decks");
}

document.addEventListener("keydown", e => {
  if (views.study.hidden || !state.study?.current) return;
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

// Neue Tag-Grenze o. ä.: Zähler beim Zurückkehren in die App aktualisieren
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.col && !views.decks.hidden) renderDecks();
});

// ───────────────────────── Start ─────────────────────────
async function init() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
  getSqlite().catch(err => console.error("SQLite konnte nicht geladen werden", err));
  const last = readLS("last");
  const list = await store.listPackages().catch(() => []);
  if (last && list.some(p => p.id === last)) await openStored(last);
  else { show("home"); renderHome(); }
}

init();
