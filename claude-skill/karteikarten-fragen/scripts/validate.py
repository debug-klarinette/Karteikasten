#!/usr/bin/env python3
"""Validiert Karteikasten-Fragendateien und data/index.json.

Spiegelt den Markdown-Parser der App (app.js) in Python:
  - Fragen beginnen mit '### '
  - Optionen: '- [ ]' / '- [x]', eine pro Zeile
  - >= 2 Optionen, >= 1 richtige
  - Erklärung: '>'-Zeilen nach den Optionen (optional, aber empfohlen)

Aufruf:
  python3 validate.py data/ --index data/index.json
  python3 validate.py data/sem1/fixed-income/vl03.md
"""

import argparse
import json
import re
import sys
from pathlib import Path

OPTION_RE = re.compile(r"^-\s*\[([ xX])\]\s*(.*)$")
HEADER_RE = re.compile(r"^###\s+")
SUSPECT_HEADER_RE = re.compile(r"^###\S")          # '###Frage' ohne Leerzeichen
SUSPECT_OPTION_RE = re.compile(r"^-\[([ xX])\]")   # '-[x]' ohne Leerzeichen


def parse_file(path: Path):
    """Gibt (fragen, fehler, warnungen) zurück."""
    questions, errors, warnings = [], [], []
    cur, mode = None, None

    def commit(line_no):
        nonlocal cur
        if cur is None:
            return
        correct = sum(1 for _, c in cur["options"] if c)
        label = f"{path}:{cur['line']} – \"{cur['question'][:60]}…\""
        if not cur["question"].strip():
            errors.append(f"{label}: leerer Fragetext")
        elif len(cur["options"]) < 2:
            errors.append(f"{label}: nur {len(cur['options'])} Option(en), mindestens 2 nötig")
        elif correct < 1:
            errors.append(f"{label}: keine richtige Antwort ([x]) markiert")
        else:
            if not cur["explanation"]:
                warnings.append(f"{label}: keine Erklärung (>) – bitte ergänzen")
            if correct == len(cur["options"]):
                warnings.append(f"{label}: ALLE Optionen sind richtig – Absicht?")
            questions.append(cur)
        cur = None

    lines = path.read_text(encoding="utf-8").splitlines()
    for no, raw in enumerate(lines, start=1):
        line = raw.strip()

        if SUSPECT_HEADER_RE.match(line):
            errors.append(f"{path}:{no}: '###' ohne Leerzeichen – Frage wird nicht erkannt")
        if SUSPECT_OPTION_RE.match(line):
            errors.append(f"{path}:{no}: '-[ ]' ohne Leerzeichen nach '-' – Option wird nicht erkannt")

        if HEADER_RE.match(line):
            commit(no)
            cur = {"question": HEADER_RE.sub("", line), "options": [],
                   "explanation": [], "line": no}
            mode = "question"
            continue
        if cur is None:
            continue

        m = OPTION_RE.match(line)
        if m:
            cur["options"].append((m.group(2).strip(), m.group(1).lower() == "x"))
            mode = "options"
            continue
        if line.startswith(">") and mode != "question":
            cur["explanation"].append(line.lstrip("> ").strip())
            mode = "explanation"
            continue
        if not line:
            continue
        if mode == "question":
            cur["question"] += "\n" + line
        elif mode == "explanation":
            cur["explanation"].append(line)
        elif mode == "options":
            warnings.append(f"{path}:{no}: Freitext nach Optionen wird ignoriert "
                            f"(umgebrochene Option? → in eine Zeile ziehen)")

    commit(len(lines))
    return questions, errors, warnings


def check_index(index_path: Path, repo_root: Path):
    errors, warnings, listed = [], [], set()
    try:
        data = json.loads(index_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        return [f"{index_path}: ungültiges JSON – {e}"], [], set()

    for sem in data.get("semesters", []):
        for course in sem.get("courses", []):
            for lec in course.get("lectures", []):
                f = lec.get("file", "")
                listed.add(f)
                if not f.startswith("data/"):
                    errors.append(f"index.json: Pfad sollte mit 'data/' beginnen: {f}")
                if not (repo_root / f).exists():
                    errors.append(f"index.json: Datei fehlt: {f} "
                                  f"(VL \"{lec.get('name', '?')}\")")
    return errors, warnings, listed


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("paths", nargs="+", help=".md-Dateien oder Ordner")
    ap.add_argument("--index", help="Pfad zu data/index.json (optional)")
    args = ap.parse_args()

    md_files = []
    for p in map(Path, args.paths):
        if p.is_dir():
            md_files += sorted(p.rglob("*.md"))
        elif p.suffix == ".md":
            md_files.append(p)

    all_errors, all_warnings, total_q = [], [], 0
    parsed_files = set()
    for f in md_files:
        qs, errs, warns = parse_file(f)
        total_q += len(qs)
        all_errors += errs
        all_warnings += warns
        parsed_files.add(str(f).replace("\\", "/"))
        sc = sum(1 for q in qs if sum(c for _, c in q["options"]) == 1)
        print(f"  {f}: {len(qs)} Fragen ({sc} SC, {len(qs)-sc} MC)")

    if args.index:
        index_path = Path(args.index)
        repo_root = index_path.parent.parent  # data/index.json → Repo-Root
        errs, warns, listed = check_index(index_path, repo_root)
        all_errors += errs
        all_warnings += warns
        for f in parsed_files:
            rel = str(Path(f).resolve().relative_to(repo_root.resolve())) \
                if Path(f).is_absolute() else f
            rel = rel.replace("\\", "/")
            if rel.startswith("data/") and rel not in listed:
                all_warnings.append(f"{rel}: existiert, ist aber NICHT in index.json eingetragen")

    print()
    for w in all_warnings:
        print(f"  WARNUNG  {w}")
    for e in all_errors:
        print(f"  FEHLER   {e}")
    print(f"\n{total_q} Fragen in {len(md_files)} Datei(en) · "
          f"{len(all_errors)} Fehler · {len(all_warnings)} Warnungen")
    sys.exit(1 if all_errors else 0)


if __name__ == "__main__":
    main()
