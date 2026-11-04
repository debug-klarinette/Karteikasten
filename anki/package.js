// Lesen und Schreiben von Anki-Paketen (.apkg / .colpkg).
//
// Aufbau eines Pakets (ZIP):
//   meta                 Protobuf PackageMetadata (fehlt bei Alt-Formaten)
//   collection.anki21b   SQLite-Sammlung, zstd-komprimiert   (aktuelles Format)
//   collection.anki21    SQLite-Sammlung, unkomprimiert      (Alt-Format 2)
//   collection.anki2     SQLite-Sammlung, unkomprimiert      (Alt-Format 1 bzw. Platzhalter)
//   media                Liste der Mediendateien (Protobuf+zstd bzw. JSON)
//   0, 1, 2 …            die Mediendateien selbst (aktuell: zstd-komprimiert)
//
// Beim Zurückschreiben wird nur die Sammlung ersetzt; alle anderen Einträge
// bleiben byte-genau so, wie sie aus Anki kamen.

import { unzipSync, zipSync } from "../vendor/fflate.mjs";
import * as zstd from "./zstd.js";
import { decode, get } from "./proto.js";

const td = new TextDecoder();

export class PackageError extends Error {}

function unzip(bytes, filter) {
  try {
    return unzipSync(bytes, filter ? { filter } : undefined);
  } catch (e) {
    throw new PackageError("Die Datei ist kein gültiges Anki-Paket (kein ZIP-Archiv).");
  }
}

/** Analysiert ein Paket. Liefert Metadaten + die unkomprimierte SQLite-Datenbank. */
export function readPackage(bytes) {
  // Erst nur die kleinen Verwaltungsdateien entpacken, nicht alle Medien.
  const wanted = new Set(["meta", "media", "collection.anki21b", "collection.anki21", "collection.anki2"]);
  const files = unzip(bytes, f => wanted.has(f.name));

  let version = 0;
  if (files.meta) version = get.uint(decode(files.meta), 1, 0);

  let collectionEntry, dbBytes, format;
  if (files["collection.anki21b"] && (version === 3 || version === 0)) {
    collectionEntry = "collection.anki21b";
    format = "latest";
    dbBytes = zstd.decompress(files[collectionEntry]);
  } else if (files["collection.anki21"]) {
    collectionEntry = "collection.anki21";
    format = "legacy2";
    dbBytes = files[collectionEntry];
  } else if (files["collection.anki2"]) {
    collectionEntry = "collection.anki2";
    format = "legacy1";
    dbBytes = files[collectionEntry];
  } else {
    throw new PackageError("In dem Paket wurde keine Anki-Sammlung gefunden.");
  }

  const media = parseMediaMap(files.media, format);
  return { format, collectionEntry, dbBytes, media };
}

/** Medienliste → Map Dateiname → ZIP-Eintrag */
function parseMediaMap(raw, format) {
  const map = new Map();
  if (!raw || !raw.length) return map;
  let data = raw;
  if (zstd.isZstd(data)) data = zstd.decompress(data);
  const first = data[0];
  if (format !== "latest" || first === 0x7b /* { */) {
    try {
      const obj = JSON.parse(td.decode(data));
      for (const [entry, name] of Object.entries(obj)) map.set(name, entry);
      return map;
    } catch { /* weiter mit Protobuf */ }
  }
  const msg = decode(data);
  get.msgs(msg, 1).forEach((entry, idx) => {
    const name = get.str(entry, 1);
    const legacy = entry.get(255) ? get.uint(entry, 255) : null;
    map.set(name, String(legacy ?? idx));
  });
  return map;
}

/** Holt eine Mediendatei (entpackt, ggf. zstd-dekomprimiert). */
export function readMedia(bytes, pkgInfo, name) {
  const entry = pkgInfo.media.get(name);
  if (entry == null) return null;
  const files = unzip(bytes, f => f.name === entry);
  let data = files[entry];
  if (!data) return null;
  if (zstd.isZstd(data)) data = zstd.decompress(data);
  return data;
}

/** Baut das Paket mit neuer Datenbank wieder zusammen. */
export function writePackage(originalBytes, pkgInfo, newDbBytes) {
  const all = unzip(originalBytes);
  const out = {};
  for (const [name, data] of Object.entries(all)) {
    if (name === pkgInfo.collectionEntry) {
      const payload = pkgInfo.format === "latest" ? zstd.compress(newDbBytes) : newDbBytes;
      out[name] = [payload, { level: 0 }];
    } else {
      out[name] = [data, { level: 0 }];
    }
  }
  return zipSync(out);
}
