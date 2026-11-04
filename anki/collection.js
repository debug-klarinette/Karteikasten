// Zugriff auf eine Anki-Sammlung (SQLite) – lesen, lernen, zurücksetzen.
// Unterstützt das aktuelle Schema (18, Anki ≥ 2.1.50) und das alte Schema 11.

import { decode, get } from "./proto.js";
import { previewAnswers, parseData } from "./scheduler.js";

const td = new TextDecoder();
const te = new TextEncoder();

const DEFAULT_CONF = {
  learnSteps: [1, 10], relearnSteps: [10],
  newPerDay: 20, reviewsPerDay: 200,
  initialEase: 2.5, easyMultiplier: 1.3, hardMultiplier: 1.2, lapseMultiplier: 0,
  intervalMultiplier: 1, maxIvl: 36500, minLapseIvl: 1, gradGood: 1, gradEasy: 4,
  leechThreshold: 8, leechAction: 1, capAnswerSecs: 60,
};

export async function openCollection(sqlite3, dbBytes) {
  const { capi, wasm, oo1 } = sqlite3;
  const db = new oo1.DB();
  // Anki speichert im WAL-Modus (Header-Bytes 18/19 = 2). Eine In-Memory-DB kann
  // kein WAL – daher auf den klassischen Modus umstellen. Anki schaltet beim
  // Öffnen selbst wieder auf WAL.
  if (dbBytes[18] === 2 || dbBytes[19] === 2) {
    dbBytes = dbBytes.slice();
    dbBytes[18] = 1; dbBytes[19] = 1;
  }
  const p = wasm.allocFromTypedArray(dbBytes);
  const rc = capi.sqlite3_deserialize(
    db.pointer, "main", p, dbBytes.byteLength, dbBytes.byteLength,
    capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_RESIZEABLE,
  );
  db.checkRc(rc);
  // Anki nutzt eine eigene Sortierung „unicase“ (Groß-/Kleinschreibung egal).
  capi.sqlite3_create_collation_v2(db.pointer, "unicase", capi.SQLITE_UTF8, 0, (_p, n1, p1, n2, p2) => {
    const heap = wasm.heap8u();
    const a = td.decode(heap.slice(p1, p1 + n1)).toLowerCase();
    const b = td.decode(heap.slice(p2, p2 + n2)).toLowerCase();
    return a < b ? -1 : a > b ? 1 : 0;
  }, 0);
  const col = new Collection(sqlite3, db);
  col.load();
  return col;
}

export class Collection {
  constructor(sqlite3, db) {
    this.sqlite3 = sqlite3;
    this.db = db;
    this.dirty = false;
  }

  // ── Hilfen ──
  all(sql, bind) { return this.db.selectObjects(sql, bind); }
  one(sql, bind) { return this.all(sql, bind)[0]; }
  run(sql, bind) { this.db.exec({ sql, bind }); }

  close() { try { this.db.close(); } catch { /* egal */ } }

  export() {
    return this.sqlite3.capi.sqlite3_js_db_export(this.db.pointer);
  }

  // ── Laden ──
  load() {
    const col = this.one("SELECT crt, ver, conf, models, decks, dconf FROM col");
    this.crt = Number(col.crt);
    this.ver = Number(col.ver);
    this.legacy = this.ver < 15;
    this.hasConfigTable = !!this.one("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name='config'");
    this.legacyConf = col.conf ? safeJson(col.conf) || {} : {};
    if (this.legacy) this.loadLegacy(col);
    else this.loadModern();
    this.loadCards();
  }

  loadModern() {
    this.notetypes = new Map();
    for (const r of this.all("SELECT id, name, config FROM notetypes")) {
      const cfg = decode(r.config);
      this.notetypes.set(Number(r.id), {
        id: Number(r.id), name: r.name,
        cloze: get.uint(cfg, 1) === 1,
        css: get.str(cfg, 3),
        fields: [], templates: [],
      });
    }
    for (const r of this.all("SELECT ntid, ord, name FROM fields ORDER BY ntid, ord")) {
      const nt = this.notetypes.get(Number(r.ntid));
      if (nt) nt.fields[Number(r.ord)] = r.name;
    }
    for (const r of this.all("SELECT ntid, ord, name, config FROM templates ORDER BY ntid, ord")) {
      const nt = this.notetypes.get(Number(r.ntid));
      if (!nt) continue;
      const cfg = decode(r.config);
      nt.templates[Number(r.ord)] = { name: r.name, qfmt: get.str(cfg, 1), afmt: get.str(cfg, 2) };
    }

    this.confs = new Map();
    for (const r of this.all("SELECT id, name, config FROM deck_config")) {
      this.confs.set(Number(r.id), parseModernConf(decode(r.config)));
    }

    this.decks = new Map();
    for (const r of this.all("SELECT id, name, kind FROM decks")) {
      const kind = decode(r.kind);
      const filtered = kind.has(2);
      const confId = filtered ? 1 : get.uint(get.msg(kind, 1), 1, 1);
      const parts = String(r.name).split("\x1f");
      this.decks.set(Number(r.id), { id: Number(r.id), parts, name: parts.join("::"), filtered, confId });
    }
  }

  loadLegacy(col) {
    this.notetypes = new Map();
    for (const m of Object.values(safeJson(col.models) || {})) {
      this.notetypes.set(Number(m.id), {
        id: Number(m.id), name: m.name, cloze: m.type === 1, css: m.css || "",
        fields: (m.flds || []).sort((a, b) => a.ord - b.ord).map(f => f.name),
        templates: (m.tmpls || []).sort((a, b) => a.ord - b.ord).map(t => ({ name: t.name, qfmt: t.qfmt, afmt: t.afmt })),
      });
    }
    this.confs = new Map();
    for (const c of Object.values(safeJson(col.dconf) || {})) {
      this.confs.set(Number(c.id), {
        ...DEFAULT_CONF,
        learnSteps: c.new?.delays ?? DEFAULT_CONF.learnSteps,
        relearnSteps: c.lapse?.delays ?? DEFAULT_CONF.relearnSteps,
        newPerDay: c.new?.perDay ?? 20,
        reviewsPerDay: c.rev?.perDay ?? 200,
        initialEase: (c.new?.initialFactor ?? 2500) / 1000,
        easyMultiplier: c.rev?.ease4 ?? 1.3,
        hardMultiplier: c.rev?.hardFactor ?? 1.2,
        lapseMultiplier: c.lapse?.mult ?? 0,
        intervalMultiplier: c.rev?.ivlFct ?? 1,
        maxIvl: c.rev?.maxIvl ?? 36500,
        minLapseIvl: c.lapse?.minInt ?? 1,
        gradGood: c.new?.ints?.[0] ?? 1,
        gradEasy: c.new?.ints?.[1] ?? 4,
        leechThreshold: c.lapse?.leechFails ?? 8,
        leechAction: c.lapse?.leechAction ?? 1,
      });
    }
    this.decks = new Map();
    for (const d of Object.values(safeJson(col.decks) || {})) {
      const parts = String(d.name).split("::");
      this.decks.set(Number(d.id), { id: Number(d.id), parts, name: parts.join("::"), filtered: !!d.dyn, confId: Number(d.conf || 1) });
    }
  }

  loadCards() {
    this.cards = new Map();
    const rows = this.all("SELECT id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data FROM cards");
    for (const r of rows) {
      const c = {};
      for (const k in r) c[k] = k === "data" ? (r[k] == null ? "" : String(r[k])) : Number(r[k]);
      // Karten in Filterstapeln werden so behandelt, als lägen sie wieder in ihrem
      // Heimatstapel (wie „Leeren“ in Anki). In die Datenbank geschrieben wird das
      // erst, wenn die Karte tatsächlich gelernt oder zurückgesetzt wird.
      this.cards.set(c.id, restoreFromFiltered(c));
    }
  }

  // ── Einstellungen ──
  config(key, def) {
    if (this.hasConfigTable) {
      const r = this.one("SELECT val FROM config WHERE KEY = ?", [key]);
      if (r) {
        const v = safeJson(typeof r.val === "string" ? r.val : td.decode(r.val));
        return v === undefined ? def : v;
      }
    }
    return key in this.legacyConf ? this.legacyConf[key] : def;
  }

  setConfig(key, value) {
    const now = Math.floor(Date.now() / 1000);
    if (this.hasConfigTable) {
      this.run("INSERT OR REPLACE INTO config (KEY, usn, mtime_secs, val) VALUES (?, -1, ?, ?)",
        [key, now, te.encode(JSON.stringify(value))]);
    }
    if (this.legacy || !this.hasConfigTable) {
      this.legacyConf[key] = value;
      this.run("UPDATE col SET conf = ?", [JSON.stringify(this.legacyConf)]);
    }
  }

  confFor(deckId) {
    const deck = this.decks.get(deckId);
    return this.confs.get(deck?.confId ?? 1) || this.confs.get(1) || DEFAULT_CONF;
  }

  // ── Zeit (wie sched_timing_today in Anki) ──
  timing(nowMs = Date.now()) {
    const now = Math.floor(nowMs / 1000);
    const rollover = Number(this.config("rollover", 4)) || 0;
    const curWest = new Date(nowMs).getTimezoneOffset();
    const creationWest = this.config("creationOffset", null);
    const localDay = (secs, west) => {
      const d = new Date((secs - west * 60) * 1000);
      return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), dayNo: Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 864e5) };
    };
    const nowL = localDay(now, curWest);
    const rolloverToday = Date.UTC(nowL.y, nowL.m, nowL.d, rollover) / 1000 + curWest * 60;
    const passed = rolloverToday <= now;
    const nextDayAt = passed ? rolloverToday + 86400 : rolloverToday;
    let today;
    if (creationWest != null) {
      const crtL = localDay(this.crt, Number(creationWest));
      today = Math.max(nowL.dayNo - crtL.dayNo - (passed ? 0 : 1), 0);
    } else {
      const c = localDay(this.crt, curWest);
      const crtAtRollover = Date.UTC(c.y, c.m, c.d, rollover) / 1000 + curWest * 60;
      today = Math.max(Math.floor((now - crtAtRollover) / 86400), 0);
    }
    return { now, today, nextDayAt, dayStart: nextDayAt - 86400 };
  }

  // ── Stapel ──
  /** Liste der normalen Stapel, alphabetisch, mit Tiefe. */
  deckList() {
    return [...this.decks.values()]
      .filter(d => !d.filtered)
      .sort((a, b) => a.name.localeCompare(b.name, "de"))
      .map(d => ({ ...d, depth: d.parts.length - 1, label: d.parts[d.parts.length - 1] }));
  }

  /** IDs des Stapels samt Unterstapeln (null = alle). */
  deckSet(deckId) {
    if (deckId == null) return null;
    const root = this.decks.get(deckId);
    if (!root) return new Set([deckId]);
    const prefix = root.name + "::";
    const set = new Set([deckId]);
    for (const d of this.decks.values()) if (d.name.startsWith(prefix)) set.add(d.id);
    return set;
  }

  cardsIn(deckId) {
    const set = this.deckSet(deckId);
    const out = [];
    for (const c of this.cards.values()) if (!set || set.has(c.did)) out.push(c);
    return out;
  }

  /** Heute bereits gelernte neue Karten / Wiederholungen. */
  studiedToday(deckId, timing = this.timing()) {
    const set = this.deckSet(deckId);
    const rows = this.all("SELECT cid, type, lastIvl FROM revlog WHERE id >= ? ORDER BY id", [timing.dayStart * 1000]);
    const newCards = new Set();
    let reviews = 0;
    for (const r of rows) {
      const c = this.cards.get(Number(r.cid));
      if (!c || (set && !set.has(c.did))) continue;
      // Nach einem Zurücksetzen zählt die Karte heute wieder als „noch nicht gelernt“.
      if (Number(r.type) === 4) newCards.delete(c.id);
      else if (Number(r.type) === 0 && Number(r.lastIvl) === 0) newCards.add(c.id);
      else if (Number(r.type) === 1) reviews++;
    }
    return { newCount: newCards.size, reviewCount: reviews };
  }

  limits(deckId, opts = {}, timing = this.timing()) {
    if (opts.ignoreLimits) return { newLeft: Infinity, reviewLeft: Infinity };
    const conf = this.confFor(deckId ?? 1);
    const done = this.studiedToday(deckId, timing);
    return {
      newLeft: Math.max(conf.newPerDay - done.newCount, 0),
      reviewLeft: Math.max(conf.reviewsPerDay - done.reviewCount, 0),
    };
  }

  /** Fällige Karten eines Stapels, gruppiert. */
  queues(deckId, opts = {}, timing = this.timing()) {
    const { now, today, nextDayAt } = timing;
    const learnAhead = Number(this.config("collapseTime", 1200)) || 0;
    const learnNow = [], learnLater = [], reviews = [], news = [];
    for (const c of this.cardsIn(deckId)) {
      if (c.queue === 1) {
        if (c.due <= now + learnAhead) learnNow.push(c);
        else if (c.due < nextDayAt) learnLater.push(c);
      } else if (c.queue === 3) {
        if (c.due <= today) reviews.push(c);
      } else if (c.queue === 2) {
        if (c.due <= today) reviews.push(c);
      } else if (c.queue === 0) news.push(c);
    }
    const { newLeft, reviewLeft } = this.limits(deckId, opts, timing);
    learnNow.sort((a, b) => a.due - b.due);
    learnLater.sort((a, b) => a.due - b.due);
    reviews.sort((a, b) => (a.queue === 3) - (b.queue === 3) || a.due - b.due || a.id - b.id);
    news.sort((a, b) => a.due - b.due || a.nid - b.nid || a.ord - b.ord);
    return {
      learnNow, learnLater,
      reviews: reviews.slice(0, reviewLeft),
      news: news.slice(0, newLeft),
    };
  }

  counts(deckId, opts = {}, timing = this.timing()) {
    const q = this.queues(deckId, opts, timing);
    return { new: q.news.length, learn: q.learnNow.length + q.learnLater.length, review: q.reviews.length };
  }

  /** Nächste Karte – oder null + Zeitpunkt der nächsten Lernkarte. */
  nextCard(deckId, opts = {}, session = { newShown: 0, revShown: 0 }) {
    const timing = this.timing();
    const q = this.queues(deckId, opts, timing);
    const dueLearn = q.learnNow.filter(c => c.due <= timing.now);
    if (dueLearn.length) return { card: dueLearn[0], timing };
    if (q.reviews.length || q.news.length) {
      let pickNew = false;
      if (q.news.length && !q.reviews.length) pickNew = true;
      else if (q.news.length && q.reviews.length) {
        // neue Karten gleichmäßig unter die Wiederholungen mischen
        const shown = session.newShown + session.revShown;
        const ratio = q.news.length / (q.news.length + q.reviews.length);
        pickNew = shown === 0 ? false : session.newShown / shown < ratio;
      }
      return { card: pickNew ? q.news[0] : q.reviews[0], timing };
    }
    if (q.learnNow.length) return { card: q.learnNow[0], timing };
    if (opts.learnAheadAll && q.learnLater.length) return { card: q.learnLater[0], timing };
    return { card: null, timing, nextLearnAt: q.learnLater[0]?.due ?? null };
  }

  // ── Notizen ──
  note(nid) {
    const r = this.one("SELECT id, mid, flds, tags FROM notes WHERE id = ?", [nid]);
    if (!r) return null;
    return { id: Number(r.id), mid: Number(r.mid), fields: String(r.flds).split("\x1f"), tags: String(r.tags).trim().split(/\s+/).filter(Boolean) };
  }

  // ── Lernen ──
  preview(card, fuzz) {
    return previewAnswers(card, this.confFor(card.did), this.timing(), fuzz);
  }

  /** Antwort speichern. Gibt Undo-Information zurück. */
  answer(card, ease, takenMs, fuzz) {
    const before = this.cards.get(card.id);
    const conf = this.confFor(card.did);
    const result = previewAnswers(before, conf, this.timing(), fuzz)[ease];
    const now = Date.now();
    const next = { ...result.card, mod: Math.floor(now / 1000), usn: -1, odid: 0, odue: 0 };
    let noteBefore = null;
    if (result.leeched) {
      const note = this.note(card.nid);
      if (note && !note.tags.some(t => t.toLowerCase() === "leech")) {
        noteBefore = note;
        this.setNoteTags(note.id, [...note.tags, "leech"]);
      }
      if (conf.leechAction === 0) next.queue = -1;
    }
    let revId = now;
    while (this.one("SELECT 1 AS x FROM revlog WHERE id = ?", [revId])) revId++;
    const r = result.revlog;
    const time = Math.min(Math.max(Math.round(takenMs), 0), (conf.capAnswerSecs || 60) * 1000);
    this.db.transaction(() => {
      this.writeCard(next);
      this.run("INSERT INTO revlog (id, cid, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?,?,?,?,?,?,?,?,?)",
        [revId, card.id, -1, r.ease, r.ivl, r.lastIvl, r.factor, time, r.type]);
      this.touch();
    });
    this.dirty = true;
    return { before, revId, noteBefore, leeched: result.leeched };
  }

  undo(info) {
    this.db.transaction(() => {
      this.writeCard(info.before, true);
      this.run("DELETE FROM revlog WHERE id = ?", [info.revId]);
      if (info.noteBefore) this.setNoteTags(info.noteBefore.id, info.noteBefore.tags);
      this.touch();
    });
    this.dirty = true;
  }

  writeCard(c, raw = false) {
    this.run(`UPDATE cards SET did=?, mod=?, usn=?, type=?, queue=?, due=?, ivl=?, factor=?, reps=?, lapses=?, left=?, odue=?, odid=?, data=? WHERE id=?`,
      [c.did, c.mod, c.usn, c.type, c.queue, c.due, c.ivl, c.factor, c.reps, c.lapses, c.left, c.odue, c.odid, c.data, c.id]);
    this.cards.set(c.id, raw ? { ...c } : c);
  }

  setNoteTags(nid, tags) {
    const str = tags.length ? ` ${tags.join(" ")} ` : "";
    this.run("UPDATE notes SET tags = ?, mod = ?, usn = -1 WHERE id = ?", [str, Math.floor(Date.now() / 1000), nid]);
    if (!this.legacy) {
      for (const t of tags) this.run("INSERT OR IGNORE INTO tags (tag, usn, collapsed, config) VALUES (?, -1, 0, NULL)", [t]);
    }
  }

  touch() {
    this.run("UPDATE col SET mod = ?", [Date.now()]);
  }

  // ── Zurücksetzen („Vergessen“ in Anki) ──
  resetProgress(deckId, { resetCounts = true } = {}) {
    const cards = this.cardsIn(deckId);
    let nextPos = Number(this.config("nextPos", 0)) || 0;
    for (const c of this.cards.values()) if (c.type === 0 && c.due >= nextPos) nextPos = c.due + 1;
    const nowMs = Date.now();
    const now = Math.floor(nowMs / 1000);
    // Reihenfolge der neuen Karten möglichst wie ursprünglich hinzugefügt
    const ordered = cards.slice().sort((a, b) => {
      const pa = a.type === 0 ? a.due : parseData(a.data).pos ?? Infinity;
      const pb = b.type === 0 ? b.due : parseData(b.data).pos ?? Infinity;
      return pa - pb || a.nid - b.nid || a.ord - b.ord;
    });
    let revId = nowMs;
    let changed = 0;
    this.db.transaction(() => {
      for (const c of ordered) {
        const data = parseData(c.data);
        const wasNew = c.type === 0;
        let due;
        if (wasNew) due = c.due;
        else if (data.pos != null) due = data.pos;
        else due = nextPos++;
        delete data.pos; delete data.s; delete data.d; delete data.dr;
        const next = {
          ...c, type: 0, queue: c.queue === -1 ? -1 : 0, due, ivl: 0, factor: 0, left: 0,
          odue: 0, odid: 0, mod: now, usn: -1, data: JSON.stringify(data),
          reps: resetCounts ? 0 : c.reps, lapses: resetCounts ? 0 : c.lapses,
        };
        const unchanged = wasNew && c.queue === next.queue && c.reps === next.reps && c.lapses === next.lapses && !c.odid;
        if (unchanged && !this.needsWrite(c)) continue;
        this.writeCard(next);
        if (!wasNew) {
          while (this.one("SELECT 1 AS x FROM revlog WHERE id = ?", [revId])) revId++;
          this.run("INSERT INTO revlog (id, cid, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?,?,-1,0,0,?,0,0,4)", [revId, c.id, c.ivl]);
          revId++;
        }
        changed++;
      }
      this.setConfig("nextPos", nextPos);
      this.touch();
    });
    this.dirty = true;
    return changed;
  }

  needsWrite(c) {
    const row = this.one("SELECT odid, queue, due FROM cards WHERE id = ?", [c.id]);
    return row && (Number(row.odid) !== c.odid || Number(row.queue) !== c.queue || Number(row.due) !== c.due);
  }

  // ── Statistik ──
  stats(deckId, timing = this.timing()) {
    const s = { total: 0, new: 0, learning: 0, young: 0, mature: 0, suspended: 0, dueToday: 0 };
    for (const c of this.cardsIn(deckId)) {
      s.total++;
      if (c.queue === -1) { s.suspended++; continue; }
      if (c.type === 0) s.new++;
      else if (c.type === 1 || c.type === 3) s.learning++;
      else if (c.ivl >= 21) s.mature++;
      else s.young++;
    }
    return s;
  }
}

// ── Hilfsfunktionen ──
function safeJson(s) {
  try { return JSON.parse(s); } catch { return undefined; }
}

function parseModernConf(cfg) {
  // deck_config.config enthält direkt die Nachricht DeckConfig.Config
  const val = (f, def) => (cfg.has(f) ? get.uint(cfg, f) : def);
  const fl = (f, def) => { const v = get.float(cfg, f, 0); return v || def; };
  return {
    learnSteps: get.floats(cfg, 1),
    relearnSteps: get.floats(cfg, 2),
    newPerDay: val(9, 0),
    reviewsPerDay: val(10, 0),
    initialEase: fl(11, 2.5),
    easyMultiplier: fl(12, 1.3),
    hardMultiplier: fl(13, 1.2),
    lapseMultiplier: get.float(cfg, 14, 0),
    intervalMultiplier: fl(15, 1),
    maxIvl: val(16, 0) || 36500,
    minLapseIvl: val(17, 0) || 1,
    gradGood: val(18, 0) || 1,
    gradEasy: val(19, 0) || 4,
    leechAction: val(21, 0),
    leechThreshold: val(22, 0) || 8,
    capAnswerSecs: val(24, 0) || 60,
  };
}

/** Karte aus einem Filterstapel virtuell in den Heimatstapel zurücklegen. */
function restoreFromFiltered(c) {
  if (!c.odid) return c;
  const r = { ...c, did: c.odid, odid: 0 };
  if (c.odue) r.due = c.odue;
  r.odue = 0;
  if (r.queue >= 0) {
    if (r.type === 1 || r.type === 3) r.queue = r.due > 1_000_000_000 ? 1 : 3;
    else r.queue = r.type === 0 ? 0 : 2;
  }
  return r;
}
