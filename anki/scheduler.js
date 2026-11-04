// Ankis SM-2-Planer (v3) – nachgebaut nach rslib/src/scheduler/states.
// Reine Funktionen: Karte + Stapel-Optionen + Zeit → nächster Zustand.

const DAY = 86400;

export const INITIAL_EASE = 2.5;
const MIN_EASE = 1.3;

// ── Lernschritte ──────────────────────────────────────────────
class Steps {
  constructor(steps) { this.steps = steps || []; }
  get empty() { return this.steps.length === 0; }
  secs(i) { const s = this.steps[i]; return s == null ? null : Math.floor(s * 60); }
  index(remaining) {
    const total = this.steps.length;
    return Math.min(Math.max(total - (remaining % 1000), 0), Math.max(total - 1, 0));
  }
  againDelay() { return this.secs(0); }
  hardDelay(remaining) {
    const idx = this.index(remaining);
    let cur = this.secs(idx);
    if (cur == null) cur = this.secs(0);
    if (cur == null) return null;
    if (idx !== 0) return cur;
    const next = this.secs(1);
    if (next != null) return roundInDays(Math.floor((cur + next) / 2));
    return roundInDays(Math.min(Math.floor(cur * 3 / 2), cur + DAY));
  }
  goodDelay(remaining) { return this.secs(this.index(remaining) + 1); }
  currentDelay(remaining) { return this.secs(this.index(remaining)) || 0; }
  remainingForGood(remaining) { return Math.max(this.steps.length - (this.index(remaining) + 1), 0); }
  remainingForFailed() { return this.steps.length; }
}

function roundInDays(secs) {
  return secs > DAY ? Math.round(secs / DAY) * DAY : secs;
}

// ── Fuzz ──────────────────────────────────────────────────────
const FUZZ_RANGES = [
  { start: 2.5, end: 7, factor: 0.15 },
  { start: 7, end: 20, factor: 0.1 },
  { start: 20, end: Infinity, factor: 0.05 },
];

function fuzzDelta(ivl) {
  if (ivl < 2.5) return 0;
  return FUZZ_RANGES.reduce((d, r) => d + r.factor * Math.max(Math.min(ivl, r.end) - r.start, 0), 1);
}

function withFuzz(fuzz, interval, minimum, maximum) {
  if (fuzz == null) return clamp(Math.round(interval), minimum, maximum);
  minimum = Math.min(minimum, maximum);
  const ivl = clamp(interval, minimum, maximum);
  const delta = fuzzDelta(ivl);
  let lower = clamp(Math.round(ivl - delta), minimum, maximum);
  let upper = clamp(Math.round(ivl + delta), minimum, maximum);
  if (upper === lower && upper > 2 && upper < maximum) upper = lower + 1;
  return Math.floor(lower + fuzz * (1 + upper - lower));
}

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// ── Kontext ───────────────────────────────────────────────────
/**
 * conf: normalisierte Stapel-Optionen (siehe collection.js)
 * timing: { now (Sek.), today (Tag seit Sammlungsbeginn), nextDayAt (Sek.) }
 * fuzz: Zufallswert 0..1 (pro angezeigter Karte fest, damit Vorschau = Ergebnis)
 */
function makeCtx(conf, timing, fuzz) {
  const maxIvl = Math.max(conf.maxIvl, 1);
  return {
    conf, timing, fuzz,
    steps: new Steps(conf.learnSteps),
    relearn: new Steps(conf.relearnSteps),
    minMax(min) { return [clamp(min, 1, maxIvl), maxIvl]; },
    fuzzIvl(interval, min, max) { return withFuzz(fuzz, interval, min, max); },
    constrain(interval, minimum, fuzzIt = true) {
      interval *= conf.intervalMultiplier;
      const [mn, mx] = this.minMax(minimum);
      return fuzzIt ? withFuzz(fuzz, interval, mn, mx) : clamp(Math.round(interval), mn, mx);
    },
  };
}

// ── Aktueller Zustand aus Kartenfeldern ───────────────────────
function currentState(card, ctx) {
  const { today } = ctx.timing;
  switch (card.type) {
    case 0: return { kind: "new" };
    case 1: return { kind: "learn", remaining: card.left, secs: ctx.steps.currentDelay(card.left) };
    case 2: {
      const ivl = Math.max(card.ivl, 0);
      const lastReview = card.due - ivl;
      const elapsed = Math.max(today - lastReview, 0);
      return { kind: "review", review: reviewOf(card, elapsed) };
    }
    case 3: return {
      kind: "relearn",
      remaining: card.left,
      secs: ctx.relearn.currentDelay(card.left),
      review: reviewOf(card, 0),
    };
    default: return { kind: "new" };
  }
}

function reviewOf(card, elapsed) {
  return {
    days: Math.max(card.ivl, 0),
    elapsed,
    ease: card.factor > 0 ? card.factor / 1000 : INITIAL_EASE,
    lapses: card.lapses,
  };
}

// ── Übergänge ─────────────────────────────────────────────────
const learnS = (remaining, secs) => ({ kind: "learn", remaining, secs });
const reviewS = (days, ease, lapses = 0, leeched = false) => ({ kind: "review", review: { days, ease, lapses, leeched } });
const relearnS = (remaining, secs, review) => ({ kind: "relearn", remaining, secs, review });

function learningNext(remaining, ease, ctx) {
  const c = ctx.conf;
  const [mn, mx] = ctx.minMax(1);
  const gradGood = () => reviewS(ctx.fuzzIvl(Math.max(Math.round(c.gradGood), 1), mn, mx), c.initialEase);
  switch (ease) {
    case 1: {
      const d = ctx.steps.againDelay();
      return d != null ? learnS(ctx.steps.remainingForFailed(), d) : gradGood();
    }
    case 2: {
      const d = ctx.steps.hardDelay(remaining);
      return d != null ? learnS(remaining, d) : gradGood();
    }
    case 3: {
      const d = ctx.steps.goodDelay(remaining);
      return d != null ? learnS(ctx.steps.remainingForGood(remaining), d) : gradGood();
    }
    default:
      return reviewS(ctx.fuzzIvl(c.gradEasy, mn, mx), c.initialEase);
  }
}

function leechMet(lapses, threshold) {
  if (threshold <= 0) return false;
  const half = Math.max(Math.ceil(threshold / 2), 1);
  return lapses >= threshold && (lapses - threshold) % half === 0;
}

function reviewNext(r, ease, ctx) {
  const c = ctx.conf;
  if (ease === 1) {
    const lapses = r.lapses + 1;
    const [mn, mx] = ctx.minMax(c.minLapseIvl);
    const failing = ctx.fuzzIvl(Math.max(r.days, 1) * c.lapseMultiplier, mn, mx);
    const again = {
      days: Math.max(Math.round(failing), 1),
      ease: Math.max(r.ease - 0.2, MIN_EASE),
      lapses,
      leeched: leechMet(lapses, c.leechThreshold),
    };
    const d = ctx.relearn.againDelay();
    if (d != null) return relearnS(ctx.relearn.remainingForFailed(), d, again);
    return { kind: "review", review: again };
  }
  const [hard, good, easy] = r.elapsed - r.days < 0 ? earlyIntervals(r, ctx) : passingIntervals(r, ctx);
  if (ease === 2) return reviewS(hard, Math.max(r.ease - 0.15, MIN_EASE), r.lapses);
  if (ease === 3) return reviewS(good, r.ease, r.lapses);
  return reviewS(easy, r.ease + 0.15, r.lapses);
}

function passingIntervals(r, ctx) {
  const c = ctx.conf;
  const cur = Math.max(r.days, 1);
  const late = Math.max(r.elapsed - r.days, 0);
  const hardMin = c.hardMultiplier <= 1 ? 0 : r.days + 1;
  const hard = ctx.constrain(cur * c.hardMultiplier, hardMin);
  const goodMin = c.hardMultiplier <= 1 ? r.days + 1 : hard + 1;
  const good = ctx.constrain((cur + late / 2) * r.ease, goodMin);
  const easy = ctx.constrain((cur + late) * r.ease * c.easyMultiplier, good + 1);
  return [hard, good, easy];
}

function earlyIntervals(r, ctx) {
  const c = ctx.conf;
  const scheduled = Math.max(r.days, 1);
  const elapsed = r.elapsed;
  const hard = ctx.constrain(Math.max(elapsed * c.hardMultiplier, scheduled * c.hardMultiplier / 2), 0, false);
  const good = ctx.constrain(Math.max(elapsed * r.ease, scheduled), 0, false);
  const reduced = c.easyMultiplier - (c.easyMultiplier - 1) / 2;
  const easy = ctx.constrain(Math.max(elapsed * r.ease, scheduled) * reduced, 0, false);
  return [hard, Math.max(good, hard + 1), Math.max(easy, good + 1, hard + 2)];
}

function relearnNext(s, ease, ctx) {
  const review = { ...s.review, leeched: false };
  switch (ease) {
    case 1: {
      const d = ctx.relearn.againDelay();
      return d != null ? relearnS(ctx.relearn.remainingForFailed(), d, review) : { kind: "review", review };
    }
    case 2: {
      const d = ctx.relearn.hardDelay(s.remaining);
      return d != null ? relearnS(s.remaining, d, review) : { kind: "review", review };
    }
    case 3: {
      const d = ctx.relearn.goodDelay(s.remaining);
      return d != null ? relearnS(ctx.relearn.remainingForGood(s.remaining), d, review) : { kind: "review", review };
    }
    default:
      return { kind: "review", review: { ...review, days: review.days + 1 } };
  }
}

function nextState(cur, ease, ctx) {
  switch (cur.kind) {
    case "new": return learningNext(ctx.steps.remainingForFailed(), ease, ctx);
    case "learn": return learningNext(cur.remaining, ease, ctx);
    case "review": return reviewNext(cur.review, ease, ctx);
    case "relearn": return relearnNext(cur, ease, ctx);
  }
}

// Intervall-Art (für Revlog & Anzeige)
function intervalKind(state, untilRollover) {
  if (state.kind === "new") return { secs: 0 };
  if (state.kind === "review") return { days: state.review.days };
  const secs = state.secs;
  if (secs >= untilRollover) return { days: Math.floor((secs - untilRollover) / DAY) + 1 };
  return { secs };
}
const revlogIvl = k => (k.days != null ? k.days : (k.secs ? -k.secs : 0));

/**
 * Berechnet für alle vier Tasten den Folgezustand.
 * Rückgabe: { 1: {card, revlog, label}, 2: …, 3: …, 4: … }
 */
export function previewAnswers(card, conf, timing, fuzz) {
  const ctx = makeCtx(conf, timing, fuzz);
  const cur = currentState(card, ctx);
  const untilRollover = Math.max(timing.nextDayAt - timing.now, 0);
  const out = {};
  for (const ease of [1, 2, 3, 4]) {
    const next = nextState(cur, ease, ctx);
    out[ease] = applyState(card, cur, next, ease, ctx, untilRollover);
  }
  return out;
}

function learnFuzz(secs) {
  const upper = secs + Math.min(Math.floor(secs * 0.25), 300);
  return upper <= secs ? secs : secs + Math.floor(Math.random() * (upper - secs));
}

function applyState(card, cur, next, ease, ctx, untilRollover) {
  const { now, today } = ctx.timing;
  const c = { ...card };
  const data = parseData(card.data);
  if (cur.kind === "new" && next.kind !== "new") data.pos = card.due;
  let ivlKind, factorForLog = 0;

  if (next.kind === "learn" || next.kind === "relearn") {
    c.type = next.kind === "learn" ? 1 : 3;
    c.left = next.remaining;
    ivlKind = intervalKind(next, untilRollover);
    if (ivlKind.secs != null) {
      c.queue = 1;
      c.due = now + learnFuzz(ivlKind.secs);
    } else {
      c.queue = 3;
      c.due = today + ivlKind.days;
    }
    if (next.kind === "relearn") {
      c.ivl = next.review.days;
      c.lapses = next.review.lapses;
      c.factor = Math.round(next.review.ease * 1000);
      factorForLog = c.factor;
    }
  } else {
    const r = next.review;
    c.type = 2;
    c.queue = 2;
    c.ivl = r.days;
    c.due = today + r.days;
    c.factor = Math.round(r.ease * 1000);
    c.lapses = r.lapses;
    c.left = 0;
    ivlKind = { days: r.days };
    factorForLog = c.factor;
  }
  const leeched = !!(next.review && next.review.leeched);
  c.reps = card.reps + 1;
  data.lrt = now;
  c.data = JSON.stringify(data);

  const lastKind = intervalKind(cur, untilRollover);
  const revlogType = cur.kind === "new" || cur.kind === "learn" ? 0
    : cur.kind === "relearn" ? 2
    : (cur.review.elapsed - cur.review.days < 0 ? 3 : 1);

  return {
    card: c,
    leeched,
    revlog: {
      ease,
      ivl: revlogIvl(ivlKind),
      lastIvl: revlogIvl(lastKind),
      factor: factorForLog,
      type: revlogType,
    },
    label: formatInterval(ivlKind),
  };
}

export function parseData(s) {
  if (!s) return {};
  try { const o = JSON.parse(s); return o && typeof o === "object" ? o : {}; } catch { return {}; }
}

export function formatInterval(k) {
  if (k.secs != null) {
    const s = k.secs;
    if (s < 60) return "<1 Min";
    if (s < 3600) return `${Math.round(s / 60)} Min`;
    return `${Math.round(s / 3600)} Std`;
  }
  const d = k.days;
  if (d < 30) return `${d} T`;
  if (d < 365) return `${(d / 30).toFixed(d < 300 ? 1 : 0).replace(".", ",").replace(",0", "")} Mon`;
  return `${(d / 365).toFixed(1).replace(".", ",").replace(",0", "")} J`;
}
