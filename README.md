# Karteikasten

Eine selbst gehostete Karteikarten-Quiz-App für Vorlesungen. Läuft als statische
Web-App auf GitHub Pages und lässt sich auf iPhone/iPad wie eine native App auf
den Home-Bildschirm legen (PWA, offline-fähig).

**Struktur:** Semester → Kurs → Vorlesung. Vor jedem Quiz wählst du frei aus,
welche Vorlesungen abgefragt werden. Fragen sind Single- oder Multiple-Choice;
die Antwortoptionen sind zunächst verdeckt – erst überlegen, dann einblenden,
dann auflösen.

---

## 1. Auf GitHub veröffentlichen

1. Neues Repository auf GitHub anlegen (z. B. `karteikasten`), public oder
   private (GitHub Pages für private Repos braucht GitHub Pro).
2. Alle Dateien dieses Ordners ins Repository hochladen – entweder über
   *Add file → Upload files* im Browser oder per Git:

   ```bash
   git init
   git add .
   git commit -m "Karteikasten initial"
   git branch -M main
   git remote add origin https://github.com/DEIN-NAME/karteikasten.git
   git push -u origin main
   ```

3. Im Repository: **Settings → Pages → Build and deployment** →
   Source: *Deploy from a branch* → Branch: `main`, Ordner: `/ (root)` → Save.
4. Nach ein bis zwei Minuten ist die App erreichbar unter
   `https://DEIN-NAME.github.io/karteikasten/`

Jeder spätere Push (neue Fragen!) ist nach kurzer Zeit automatisch live.

## 2. Auf iPhone/iPad installieren

1. Die App-URL in **Safari** öffnen (wichtig: Safari, nicht Chrome).
2. Teilen-Symbol (Quadrat mit Pfeil) → **Zum Home-Bildschirm**.
3. Fertig – die App startet im Vollbild mit eigenem Icon und funktioniert
   nach dem ersten Laden auch offline. Neue Fragen werden automatisch
   geladen, sobald du online bist.

## 3. Neue Fragen hinzufügen

### Variante A: Mit Claude (empfohlen)

Im Repo liegt unter `claude-skill/karteikarten-fragen/` ein Skill für
Claude (Cowork). Damit reicht es, Claude die Vorlesungsfolien zu geben:

> „Hier ist VL 03 von Fixed Income – erstelle mir daraus Fragen für den
> Karteikasten.“

Claude liest die Unterlagen, schreibt klausurnahe Fragen im richtigen Format,
legt die Datei an, trägt sie in `data/index.json` ein und validiert alles.
Danach nur noch committen/pushen.

### Variante B: Von Hand

1. Markdown-Datei anlegen, z. B. `data/sem1/fixed-income/vl03.md`:

   ```markdown
   # Fixed Income · VL 03 – Thema

   ### Hier steht die Frage?
   - [ ] Falsche Option
   - [x] Richtige Option
   - [ ] Falsche Option
   > Erklärung, warum die richtige Antwort stimmt.
   ```

   Regeln: Frage beginnt mit `### `, Optionen mit `- [ ]` / `- [x]`
   (eine Option pro Zeile), mehrere `[x]` = Multiple Choice (erkennt die App
   automatisch), `>`-Zeilen = Erklärung (optional).

2. Vorlesung in `data/index.json` eintragen:

   ```json
   { "name": "VL 03 – Thema", "file": "data/sem1/fixed-income/vl03.md" }
   ```

   Neue Kurse/Semester nach demselben Muster ergänzen.

3. Optional prüfen:

   ```bash
   python3 claude-skill/karteikarten-fragen/scripts/validate.py data/ --index data/index.json
   ```

4. Committen und pushen – fertig.

## 4. Projektdateien

| Pfad | Zweck |
|---|---|
| `index.html`, `app.js`, `style.css` | Die App (kein Build-Schritt nötig) |
| `data/index.json` | Manifest aller Semester, Kurse, Vorlesungen |
| `data/**/*.md` | Die Fragen, eine Datei pro Vorlesung |
| `manifest.webmanifest`, `sw.js`, `icons/` | PWA: Home-Screen-Installation & Offline-Betrieb |
| `claude-skill/karteikarten-fragen/` | Skill für Claude zum Fragen-Erstellen |

## 5. Tipps

- **Quiz-Einstellungen:** „Fragen mischen" und „Antwortreihenfolge mischen"
  unten in der Übersicht; die Auswahl der Vorlesungen merkt sich die App.
- **Tastatur (iPad/Desktop):** `1`–`9` wählt Antworten, `Enter` löst die
  jeweils nächste Aktion aus (einblenden → auflösen → weiter).
- **Falsche Fragen wiederholen:** Am Ende jedes Quiz direkt als eigener
  Durchgang möglich.
- **Update erscheint nicht?** Die App lädt online immer den neuesten Stand;
  bei hartnäckigem Cache die App einmal schließen und neu öffnen.
