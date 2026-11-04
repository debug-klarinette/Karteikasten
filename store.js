// Ablage der geladenen Pakete im Browser (IndexedDB) – damit der Lernstand
// auch nach dem Schließen der App erhalten bleibt.
//
// Eintrag: { id, name, addedAt, savedAt, exportedAt, dirty, summary,
//            original: Uint8Array (unverändertes Paket), db: Uint8Array (aktuelle Sammlung) }

const DB_NAME = "karteikasten-anki";
const STORE = "packages";

let dbPromise;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result;
    Promise.resolve(fn(store)).then(r => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("Speichern abgebrochen"));
  });
}

const req2p = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

/** Liste ohne die großen Binärdaten. */
export async function listPackages() {
  const all = await tx("readonly", s => req2p(s.getAll()));
  return all
    .map(({ original, db, ...meta }) => ({ ...meta, size: original?.byteLength || 0 }))
    .sort((a, b) => (b.openedAt || b.addedAt) - (a.openedAt || a.addedAt));
}

export const getPackage = id => tx("readonly", s => req2p(s.get(id)));
export const putPackage = pkg => tx("readwrite", s => req2p(s.put(pkg)));
export const deletePackage = id => tx("readwrite", s => req2p(s.delete(id)));

/** Nur Teile aktualisieren (z. B. db + dirty), ohne das Original neu zu schreiben. */
export async function patchPackage(id, patch) {
  return tx("readwrite", async s => {
    const cur = await req2p(s.get(id));
    if (!cur) return;
    await req2p(s.put({ ...cur, ...patch }));
  });
}

export async function requestPersistence() {
  try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch { /* egal */ }
}
