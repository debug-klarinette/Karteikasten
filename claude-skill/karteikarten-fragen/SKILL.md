---
name: karteikarten-fragen
description: Erstellt klausurnahe Multiple-Choice- und Single-Choice-Fragen für Konstantins Karteikasten-App (GitHub-Pages-Quiz-PWA) aus Vorlesungsunterlagen. Dieses Skill IMMER verwenden, wenn der Nutzer Vorlesungsfolien, Skripte, PDFs oder Notizen hochlädt und daraus Fragen, Karteikarten, ein Quiz oder Klausurvorbereitung möchte – auch wenn er nur sagt "mach mir Fragen zu dieser Vorlesung", "füge VL 3 hinzu" oder "neuer Kurs". Ebenso verwenden, wenn bestehende Fragen im Karteikasten-Repo geändert, erweitert oder geprüft werden sollen.
---

# Karteikarten-Fragen für den Karteikasten

Du erstellst Quizfragen für Konstantins **Karteikasten** – eine selbst gehostete
Web-App (GitHub Pages), die Fragen aus Markdown-Dateien lädt. Deine Aufgabe:
Vorlesungsunterlagen in **klausurnahe** Single-/Multiple-Choice-Fragen im exakten
App-Format übersetzen und sauber ins Repo einsortieren.

## Repo-Struktur

```
karteikasten/
├── index.html, app.js, style.css, …   ← App-Code: NICHT anfassen
├── data/
│   ├── index.json                     ← Manifest: Semester → Kurse → Vorlesungen
│   └── <semester>/<kurs>/<vl>.md      ← eine Datei pro Vorlesung
└── claude-skill/…                     ← dieses Skill
```

Jede Vorlesung = eine `.md`-Datei. Die App findet sie nur, wenn sie in
`data/index.json` eingetragen ist. **Beides gehört immer zusammen:
Datei anlegen + Manifest aktualisieren.**

### data/index.json

```json
{
  "semesters": [
    {
      "name": "Semester 1 · WS 25/26",
      "courses": [
        {
          "name": "Fixed Income",
          "lectures": [
            { "name": "VL 01 – Anleihen, Spot & Forward Rates",
              "file": "data/sem1/fixed-income/vl01.md" }
          ]
        }
      ]
    }
  ]
}
```

Konventionen: Ordner-/Dateinamen klein, ohne Umlaute/Leerzeichen
(`fixed-income`, `vl03.md`); `file`-Pfade relativ zum Repo-Root mit `data/`-Präfix.
Bestehende Einträge nie löschen oder umbenennen, nur ergänzen – sonst verliert
die App gespeicherte Auswahlen.

## Das Fragenformat (exakt einhalten)

```markdown
# Kurs · VL 03 – Thema          ← Titelzeile, von der App ignoriert

### Hier steht die Frage. Sie kann
auch über mehrere Zeilen gehen.
- [ ] Falsche Antwortoption
- [x] Richtige Antwortoption
- [ ] Falsche Antwortoption
- [ ] Falsche Antwortoption
> Erklärung: Warum die richtige Antwort stimmt – mit Rechenweg,
> falls es eine Rechenaufgabe ist. Mehrzeilig erlaubt.
```

Regeln des Parsers:

- Jede Frage beginnt mit `### ` (drei Rauten + Leerzeichen).
- Optionen: `- [ ]` (falsch) oder `- [x]` (richtig). **Eine Option = eine Zeile.**
- Genau eine richtige Option → App zeigt „Single Choice“.
  Mehrere richtige → „Multiple Choice“ (App erkennt das automatisch).
- Mindestens 2 Optionen und mindestens 1 richtige, sonst wird die Frage verworfen.
- Erklärung: Zeilen mit `> ` direkt nach den Optionen. Optional, aber **immer schreiben**.
- Kein sonstiges Markdown (kein Fett, keine Tabellen, keine Bilder) – alles wird
  als Klartext angezeigt. Formeln als Text: `(1+s₂)² = (1+s₁)·(1+f(1,2))`,
  Unicode wie `σ`, `√`, `₂`, `≈`, `→` ist erlaubt und erwünscht.

## Qualitätsmaßstab: Klausurniveau

Die Fragen sollen so klingen, als kämen sie aus einer TUM-Klausur, nicht aus
einem Lückentext. Konkret:

1. **Verständnis vor Wiedergabe.** Frage Konzepte, Abgrenzungen, Implikationen
   („Warum unterschätzt die Duration …?“), nicht Foliendefinitionen wortwörtlich.
2. **Rechenaufgaben einstreuen.** Bei quantitativen Themen mindestens ⅓
   Rechenfragen mit konkreten Zahlen. Distraktoren = typische Rechenfehler
   (Vorzeichen vergessen, falsch skaliert, √t statt t …). Rechenweg in die Erklärung.
3. **Plausible Distraktoren.** Falsche Optionen müssen für jemanden mit
   Halbwissen attraktiv sein: verwandte Konzepte, vertauschte Richtungen,
   fast-richtige Zahlen. Keine offensichtlichen Witzantworten, kein
   „Alle Antworten sind richtig“.
4. **Mischung.** Pro Vorlesung Standard: **8–15 Fragen**, davon 1–3 Multiple
   Choice (bei MC „(Mehrfachauswahl)“ an die Frage anhängen). Schwierigkeit
   gemischt: ein Drittel Grundlagen, der Rest Anwendung/Transfer.
5. **Abdeckung.** Die ganze Vorlesung abdecken, nicht nur die ersten Folien.
   Gewichtung nach dem, was klausurrelevant wirkt (Definitionen mit Rechenregeln,
   betonte Konzepte, Beispiele der Folien in abgewandelter Form).
6. **Sprache der Vorlesung.** Deutsche Folien → deutsche Fragen, englische
   Folien → englische Fragen. Fachbegriffe so lassen, wie die Vorlesung sie nutzt.
7. **Eigenständig lösbar.** Jede Frage muss ohne die Folien beantwortbar sein –
   keine Bezüge wie „laut Folie 12“ oder „im Beispiel der Vorlesung“.

## Arbeitsablauf

1. **Unterlagen lesen.** Hochgeladene PDFs/Folien vollständig durchgehen
   (bei PDFs das pdf-Reading-Vorgehen nutzen). Kernthemen und rechnerische
   Inhalte notieren.
2. **Einordnung klären.** Aus Kontext oder Dateinamen ableiten: Semester, Kurs,
   VL-Nummer, Thema. Wenn unklar oder der Kurs neu ist: kurz nachfragen
   (eine Frage, z. B. „Soll das als neuer Kurs ‚Corporate Finance' in Semester 1?“).
3. **Fragen schreiben** nach dem Qualitätsmaßstab oben, im exakten Format.
4. **Dateien aktualisieren:** `.md` unter `data/<semester>/<kurs>/` anlegen
   und den Eintrag in `data/index.json` ergänzen (Reihenfolge: VL-Nummern aufsteigend).
5. **Validieren.** Immer das Prüfskript laufen lassen:
   ```bash
   python3 claude-skill/karteikarten-fragen/scripts/validate.py data/ --index data/index.json
   ```
   Es prüft Format, Optionszahl, richtige Antworten und ob alle Dateien aus
   `index.json` existieren (und umgekehrt). Fehler beheben, bis es grün ist.
6. **Übergabe.** Kurz zusammenfassen: wie viele Fragen, welche Themen, was in
   `index.json` neu ist. Wenn Git verfügbar ist und der Nutzer es möchte:
   committen/pushen (Commit-Stil: `VL 03 Fixed Income: 12 Fragen hinzugefügt`).
   Sonst die geänderten Dateien bereitstellen.

## Bestehende Fragen erweitern

Beim Ergänzen einer bestehenden `.md`-Datei: vorhandene Fragen lesen, Dubletten
vermeiden, neue Fragen unten anhängen. Beim Überarbeiten nur ändern, was der
Nutzer nennt – Fragen sind Lernstand, kein Wegwerfmaterial.

## Schnellreferenz: häufige Fehlerquellen

- `###` ohne Leerzeichen danach → Frage wird nicht erkannt
- `-[x]` ohne Leerzeichen nach dem Bindestrich → Option wird nicht erkannt
- Option über zwei Zeilen umgebrochen → zweite Zeile geht verloren
- Datei angelegt, aber `index.json` vergessen → Vorlesung erscheint nicht in der App
- JSON mit trailing comma → App lädt gar nichts mehr (immer JSON-Syntax prüfen)
