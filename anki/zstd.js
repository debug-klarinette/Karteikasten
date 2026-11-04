// Zstandard für Anki-Pakete.
// Entpacken: fzstd (reines JS).
// Packen: gültiger Zstd-Frame aus unkomprimierten „Raw“-Blöcken. Das ist
// spezifikationskonform (RFC 8878), jeder Zstd-Decoder – auch Ankis – liest es.
// Die Datei wird dadurch etwas größer, dafür braucht es keinen Encoder.

import { decompress as fzstdDecompress } from "../vendor/fzstd.mjs";

const MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

export function isZstd(bytes) {
  return bytes && bytes.length >= 4 && MAGIC.every((m, i) => bytes[i] === m);
}

export function decompress(bytes) {
  return fzstdDecompress(bytes);
}

const MAX_BLOCK = 128 * 1024;

export function compress(data) {
  const n = data.length;
  if (n > 0xffffffff) throw new Error("Datei zu groß");
  const blocks = Math.max(1, Math.ceil(n / MAX_BLOCK));
  const out = new Uint8Array(4 + 1 + 4 + blocks * 3 + n);
  let o = 0;
  out.set(MAGIC, o); o += 4;
  // Frame-Header-Descriptor: FCS-Feld 4 Byte (Flag 2), Single-Segment, keine Prüfsumme, kein Dictionary
  out[o++] = (2 << 6) | (1 << 5);
  out[o++] = n & 0xff; out[o++] = (n >>> 8) & 0xff; out[o++] = (n >>> 16) & 0xff; out[o++] = (n >>> 24) & 0xff;
  for (let b = 0; b < blocks; b++) {
    const start = b * MAX_BLOCK;
    const size = Math.min(MAX_BLOCK, n - start);
    const last = b === blocks - 1 ? 1 : 0;
    const header = (size << 3) | (0 << 1) | last; // Blocktyp 0 = Raw
    out[o++] = header & 0xff; out[o++] = (header >>> 8) & 0xff; out[o++] = (header >>> 16) & 0xff;
    out.set(data.subarray(start, start + size), o); o += size;
  }
  return out;
}
