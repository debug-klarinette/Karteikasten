# Karteikasten

Anki-Stapel unterwegs lernen – im Browser, als App auf dem Home-Bildschirm.

Am Computer erstellst und bearbeitest du Karten wie gewohnt in **Anki**. Die App
öffnet die exportierte Datei (`.apkg` oder `.colpkg`), du lernst mit Ankis
eigenem Planer (Nochmal / Schwer / Gut / Einfach), und am Ende gibst du die
Datei **mit deinem Lernfortschritt** wieder an Anki zurück.

Alles läuft lokal im Browser. Die Datei wird nirgends hochgeladen; der Lernstand
wird im Browser gespeichert und überlebt das Schließen der App.

---

## Workflow

### Computer → Handy

1. In Anki: **Datei → Exportieren**
   - Format: **Anki-Sammlungspaket (.colpkg)** *(empfohlen)* oder **Anki-Stapelpaket (.apkg)**
   - Häkchen bei **Lernfortschritt einbeziehen** und **Medien einbeziehen**
2. Datei aufs iPhone bringen (AirDrop → „In Dateien sichern“, iCloud Drive, Mail …).
3. In der App **Anki-Datei öffnen** und die Datei wählen. Fertig.

### Handy → Computer

1. In der App **Exportieren** → **Teilen / In „Dateien“ sichern** (oder AirDrop an den Mac).
2. Am Computer in Anki zurückholen:

| Format | So importierst du in Anki |
|---|---|
| **.colpkg** | **Datei → Importieren**, Datei wählen, das Ersetzen der Sammlung bestätigen. Karten + Fortschritt sind 1:1 übernommen. |
| **.apkg** | Zuerst die betroffenen Stapel in Anki **löschen**, dann **Datei → Importieren** mit „Lernfortschritt importieren“. |

**Warum der Unterschied?** Anki übernimmt beim Import eines `.apkg` für Karten,
die es schon kennt, *keinen* Lernstand (das steht so im Anki-Quellcode). Ein
`.colpkg` ersetzt dagegen die ganze Sammlung – dafür gehen Änderungen verloren,
die du am Computer seit dem letzten Export gemacht hast. Faustregel: nicht
gleichzeitig am Computer und am Handy lernen, sondern die Datei hin- und hergeben.

> Bei `.colpkg` fragt Anki danach beim nächsten Sync mit AnkiWeb, ob hoch- oder
> heruntergeladen werden soll – „Hochladen“ wählen, damit der Handy-Fortschritt gilt.

## Funktionen

- **Stapel-Übersicht** mit Neu / Lernen / Fällig wie in Anki, inkl. Unterstapeln
- **Lernen nach Ankis SM-2-Planer (v3)**: Lernschritte, Intervalle, Ease, Fuzz,
  Tageslimits und Leech-Erkennung – mit den Stapel-Optionen aus deiner Datei
- **Rückgängig** (↶) für die letzten Antworten
- **Lernfortschritt zurücksetzen** – für einen Stapel (⋯ neben dem Stapel) oder
  für die ganze Datei (⋯ oben rechts). Entspricht „Zurücksetzen/Vergessen“ in Anki:
  alle Karten werden wieder neu, die Statistik-Historie bleibt.
- **Tageslimits ignorieren** – praktisch vor der Klausur, um alle neuen Karten sofort zu lernen
- Kartenvorlagen mit deinem Anki-CSS, Bilder, Audio, Lückentext (Cloze),
  Eingabefelder (`{{type:…}}`), Image Occlusion
- Mehrere Dateien parallel, offline nutzbar
- Karten aus **Filterstapeln** werden beim Lernen in ihren Heimatstapel
  zurückgelegt (wie „Leeren“ in Anki); den Filterstapel in Anki danach einfach neu aufbauen

**Nicht enthalten:** Karten anlegen/bearbeiten (dafür ist Anki am Computer da),
FSRS (die App plant mit SM-2; Anki rechnet FSRS-Werte aus der Lernhistorie
nach, falls du FSRS nutzt), JavaScript in Kartenvorlagen, MathJax.

## Auf GitHub Pages veröffentlichen

1. **Settings → Pages → Build and deployment** → Source: *Deploy from a branch*
   → Branch `main`, Ordner `/ (root)` → Save.
2. Nach ein, zwei Minuten läuft die App unter
   `https://<name>.github.io/<repo>/`.

## Auf iPhone/iPad installieren

1. Die App-URL in **Safari** öffnen.
2. Teilen-Symbol → **Zum Home-Bildschirm**.

## Projektdateien

| Pfad | Zweck |
|---|---|
| `index.html`, `app.js`, `style.css` | Oberfläche |
| `store.js` | Speicherung im Browser (IndexedDB) |
| `anki/package.js` | `.apkg`/`.colpkg` lesen und schreiben (ZIP, zstd, Medienliste) |
| `anki/collection.js` | Zugriff auf die Anki-Datenbank: Stapel, Warteschlangen, Antworten, Zurücksetzen |
| `anki/scheduler.js` | Ankis SM-2-Planer (nachgebaut nach `rslib/src/scheduler`) |
| `anki/render.js` | Kartenvorlagen, Cloze, Image Occlusion, Medien |
| `anki/proto.js`, `anki/zstd.js` | Protobuf- und Zstandard-Hilfen |
| `vendor/` | [SQLite WASM](https://sqlite.org/wasm) 3.54.1, [fflate](https://github.com/101arrowz/fflate) 0.8.3, [fzstd](https://github.com/101arrowz/fzstd) 0.1.1 |
| `manifest.webmanifest`, `sw.js`, `icons/` | PWA: Home-Bildschirm & Offline-Betrieb |

Getestet wurde der Rückweg mit dem offiziellen Anki-Backend (Anki 26.09):
Exporte aus der App lassen sich als `.apkg` und `.colpkg` importieren, die
Datenbank-Prüfung meldet keine Fehler, Lernstand und Historie kommen an.
