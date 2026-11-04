// Minimaler Protobuf-Leser/-Schreiber – genug für Ankis Konfig-Blobs
// (Notiztypen, Vorlagen, Stapel, Stapel-Optionen, Paket-Metadaten, Medienliste).

const td = new TextDecoder();
const te = new TextEncoder();

/** Liest eine Protobuf-Nachricht in eine Map: Feldnummer → Liste von {wt, v}. */
export function decode(bytes) {
  const out = new Map();
  if (!bytes || !bytes.length) return out;
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let i = 0;
  const varint = () => {
    let result = 0, mul = 1, byte;
    do {
      byte = b[i++];
      result += (byte & 0x7f) * mul;
      mul *= 128;
    } while (byte & 0x80 && i < b.length);
    return result;
  };
  while (i < b.length) {
    const key = varint();
    const field = Math.floor(key / 8), wt = key & 7;
    let v;
    if (wt === 0) v = varint();
    else if (wt === 1) { v = b.subarray(i, i + 8); i += 8; }
    else if (wt === 2) { const len = varint(); v = b.subarray(i, i + len); i += len; }
    else if (wt === 5) { v = b.subarray(i, i + 4); i += 4; }
    else break; // Gruppen o. Ä. kommen bei Anki nicht vor
    if (!out.has(field)) out.set(field, []);
    out.get(field).push({ wt, v });
  }
  return out;
}

const f32 = bytes => new DataView(bytes.buffer, bytes.byteOffset, 4).getFloat32(0, true);

export const get = {
  uint(msg, f, def = 0) { const e = msg.get(f); return e ? e[e.length - 1].v : def; },
  bool(msg, f) { return !!get.uint(msg, f, 0); },
  str(msg, f, def = "") { const e = msg.get(f); return e ? td.decode(e[e.length - 1].v) : def; },
  bytes(msg, f) { const e = msg.get(f); return e ? e[e.length - 1].v : null; },
  msg(msg, f) { return decode(get.bytes(msg, f)); },
  msgs(msg, f) { return (msg.get(f) || []).map(e => decode(e.v)); },
  float(msg, f, def = 0) {
    const e = msg.get(f);
    if (!e) return def;
    const last = e[e.length - 1];
    return last.wt === 5 ? f32(last.v) : def;
  },
  /** repeated float – gepackt (wt 2) oder einzeln (wt 5) */
  floats(msg, f) {
    const res = [];
    for (const e of msg.get(f) || []) {
      if (e.wt === 5) res.push(f32(e.v));
      else if (e.wt === 2) for (let j = 0; j + 4 <= e.v.length; j += 4) res.push(f32(e.v.subarray(j, j + 4)));
    }
    return res;
  },
};

// ── Schreiben (nur für die Medienliste beim Export benötigt) ──

function writeVarint(arr, n) {
  while (n > 127) { arr.push((n % 128) | 0x80); n = Math.floor(n / 128); }
  arr.push(n);
}

export function encodeFields(fields) {
  // fields: [[fieldNo, type, value]] mit type 'varint' | 'bytes' | 'string'
  const arr = [];
  for (const [no, type, value] of fields) {
    if (type === "varint") { writeVarint(arr, no * 8); writeVarint(arr, value); }
    else {
      const data = type === "string" ? te.encode(value) : value;
      writeVarint(arr, no * 8 + 2); writeVarint(arr, data.length);
      for (const x of data) arr.push(x);
    }
  }
  return new Uint8Array(arr);
}
