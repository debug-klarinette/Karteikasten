// Bewegung wie bei Apple: Federn statt fester Dauer, Geschwindigkeit übernehmen,
// Schwung projizieren, an Grenzen nachgeben. Alles jederzeit unterbrechbar.

const reduceMotionQuery = matchMedia("(prefers-reduced-motion: reduce)");
export const reduceMotion = () => reduceMotionQuery.matches;

/**
 * Ein Wert, der per Feder animiert wird. Startet immer vom aktuellen Wert und
 * behält die aktuelle Geschwindigkeit, wenn das Ziel mitten in der Bewegung wechselt.
 * Parameter wie bei Apple: damping (1 = ohne Überschwingen) und response (Sekunden).
 */
export class SpringValue {
  constructor(value, onUpdate, precision = 0.001) {
    this.value = value;
    this.velocity = 0;
    this.onUpdate = onUpdate;
    this.precision = precision;
    this.raf = 0;
  }

  get animating() { return this.raf !== 0; }

  /** Direkt setzen (z. B. 1:1 beim Ziehen). Stoppt laufende Animation. */
  set(v) {
    this.stop();
    this.value = v;
    this.onUpdate(v);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  animateTo(target, { damping = 1, response = 0.35, velocity, onComplete } = {}) {
    this.stop();
    if (velocity !== undefined) this.velocity = velocity;
    if (reduceMotion()) {
      this.value = target; this.velocity = 0;
      this.onUpdate(target);
      onComplete?.();
      return;
    }
    const k = (2 * Math.PI / response) ** 2;
    const c = (4 * Math.PI * damping) / response;
    const eps = this.precision;
    let last = performance.now();
    const step = now => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      const n = Math.max(1, Math.ceil(dt * 240));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        const a = -k * (this.value - target) - c * this.velocity;
        this.velocity += a * h;
        this.value += this.velocity * h;
      }
      if (Math.abs(this.value - target) < eps && Math.abs(this.velocity) < eps * 10) {
        this.value = target; this.velocity = 0; this.raf = 0;
        this.onUpdate(target);
        onComplete?.();
        return;
      }
      this.onUpdate(this.value);
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
}

/** Geschwindigkeit aus den letzten ~100 ms Zeigerbewegung (px/s). */
export class VelocityTracker {
  constructor() { this.samples = []; }
  reset() { this.samples = []; }
  add(x, t = performance.now()) {
    this.samples.push({ x, t });
    while (this.samples.length > 2 && t - this.samples[0].t > 100) this.samples.shift();
  }
  get velocity() {
    const s = this.samples;
    if (s.length < 2) return 0;
    const a = s[0], b = s[s.length - 1];
    // Finger stand zuletzt still → kein Schwung mehr
    if (performance.now() - b.t > 80) return 0;
    const dt = b.t - a.t;
    return dt > 0 ? ((b.x - a.x) / dt) * 1000 : 0;
  }
}

/** Wohin der Schwung trägt – Apples Projektionsfunktion. */
export function project(velocity, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Weicher Widerstand jenseits einer Grenze. */
export function rubberband(overshoot, dimension, constant = 0.55) {
  const sign = Math.sign(overshoot);
  const o = Math.abs(overshoot);
  return sign * (o * dimension * constant) / (dimension + constant * o);
}

/** Kurzes Einblenden für Inhalte, die nicht per Geste bewegt werden. */
export function materialize(el, { y = 6, scale = 0.985, duration = 220 } = {}) {
  if (!el.animate) return;
  const from = reduceMotion()
    ? { opacity: 0 }
    : { opacity: 0, transform: `translateY(${y}px) scale(${scale})` };
  el.animate([from, { opacity: 1, transform: "none" }], { duration: reduceMotion() ? 160 : duration, easing: "cubic-bezier(.2,.8,.2,1)" });
}
