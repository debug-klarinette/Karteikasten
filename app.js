/* ════════════════════════════════════════════════════════════════
   Karteikasten – app.js
   Vanilla JS, kein Build-Schritt. Läuft direkt auf GitHub Pages.
   ════════════════════════════════════════════════════════════════ */

"use strict";

/* ───────────────────────── Zustand ───────────────────────── */

const state = {
  index: null,              // Inhalt von data/index.json
  lectures: new Map(),      // file → { meta, questions, error }
  selection: new Set(),     // ausgewählte Datei-Pfade
  quiz: null,               // laufendes Quiz
};

const els = {
  viewLibrary:   document.getElementById("view-library"),
  viewQuiz:      document.getElementById("view-quiz"),
  viewSummary:   document.getElementById("view-summary"),
  libraryContent: document.getElementById("library-content"),
  selectionSummary: document.getElementById("selection-summary"),
  btnStart:      document.getElementById("btn-start"),
  optShuffleQ:   document.getElementById("opt-shuffle-questions"),
  optShuffleA:   document.getElementById("opt-shuffle-answers"),
  // Quiz
  btnQuit:       document.getElementById("btn-quit"),
  counterText:   document.getElementById("quiz-counter-text"),
  progressFill:  document.getElementById("progress-fill"),
  quizScore:     document.getElementById("quiz-score"),
  questionMeta:  document.getElementById("question-meta"),
  questionType:  document.getElementById("question-type"),
  questionText:  document.getElementById("question-text"),
  answersHidden: document.getElementById("answers-hidden"),
  answerList:    document.getElementById("answer-list"),
  explanation:   document.getElementById("explanation"),
  explanationText: document.getElementById("explanation-text"),
  btnQuizAction: document.getElementById("btn-quiz-action"),
  questionCard:  document.getElementById("question-card"),
  // Ergebnis
  summaryCorrect: document.getElementById("summary-correct"),
  summaryTotal:  document.getElementById("summary-total"),
  summaryPercent: document.getElementById("summary-percent"),
  summaryNote:   document.getElementById("summary-note"),
  wrongSection:  document.getElementById("summary-wrong-section"),
  wrongList:     document.getElementById("summary-wrong-list"),
  btnRetryWrong: document.getElementById("btn-retry-wrong"),
  btnRestart:    document.getElementById("btn-restart"),
  btnBackLibrary: document.getElementById("btn-back-library"),
  toast:         document.getElementById("toast"),
};

const STORAGE_KEY = "karteikasten.selection.v1";
const SETTINGS_KEY = "karteikasten.settings.v1";

/* ───────────────────────── Hilfsfunktionen ───────────────────────── */

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let toastTimer = null;
function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 3200);
}

function showView(view) {
  for (const v of [els.viewLibrary, els.viewQuiz, els.viewSummary]) v.hidden = v !== view;
  window.scrollTo(0, 0);
}

function saveSelection() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.selection])); } catch (e) {}
}
function loadSelection() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) for (const f of JSON.parse(raw)) state.selection.add(f);
  } catch (e) {}
}
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      shuffleQuestions: els.optShuffleQ.checked,
      shuffleAnswers: els.optShuffleA.checked,
    }));
  } catch (e) {}
}
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (typeof s.shuffleQuestions === "boolean") els.optShuffleQ.checked = s.shuffleQuestions;
    if (typeof s.shuffleAnswers === "boolean") els.optShuffleA.checked = s.shuffleAnswers;
  } catch (e) {}
}

/* ───────────────────────── Markdown-Parser ─────────────────────────
   Format (siehe README / Skill):

   ### Fragetext (kann über mehrere Zeilen gehen)
   - [ ] falsche Option
   - [x] richtige Option
   > Erklärung (optional, mehrzeilig)
*/

function parseLectureMarkdown(md) {
  const lines = md.split(/\r?\n/);
  const questions = [];
  let cur = null;
  let mode = null; // "question" | "options" | "explanation"

  const OPTION_RE = /^-\s*\[([ xX])\]\s*(.*)$/;

  function commit() {
    if (!cur) return;
    const correctCount = cur.options.filter(o => o.correct).length;
    if (cur.question.trim() && cur.options.length >= 2 && correctCount >= 1) {
      questions.push({
        question: cur.question.trim(),
        options: cur.options,
        explanation: cur.explanation.join("\n").trim(),
        multiple: correctCount > 1,
      });
    }
    cur = null;
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (/^###\s+/.test(trimmed)) {
      commit();
      cur = { question: trimmed.replace(/^###\s+/, ""), options: [], explanation: [] };
      mode = "question";
      continue;
    }
    if (!cur) continue; // Titelzeilen (#, ##), Leerzeilen vor erster Frage etc.

    const opt = trimmed.match(OPTION_RE);
    if (opt) {
      cur.options.push({ text: opt[2].trim(), correct: opt[1].toLowerCase() === "x" });
      mode = "options";
      continue;
    }
    if (/^>/.test(trimmed) && mode !== "question") {
      cur.explanation.push(trimmed.replace(/^>\s?/, ""));
      mode = "explanation";
      continue;
    }
    if (trimmed === "") continue;
    if (mode === "question") cur.question += "\n" + trimmed;
    else if (mode === "explanation") cur.explanation.push(trimmed);
    // Freitext nach Optionen ohne ">" wird ignoriert
  }
  commit();
  return questions;
}

/* ───────────────────────── Daten laden ───────────────────────── */

async function loadIndex() {
  const res = await fetch("./data/index.json", { cache: "no-cache" });
  if (!res.ok) throw new Error("data/index.json nicht gefunden (" + res.status + ")");
  return res.json();
}

async function loadLecture(meta) {
  if (state.lectures.has(meta.file)) return state.lectures.get(meta.file);
  const entry = { meta, questions: [], error: null };
  try {
    const res = await fetch("./" + meta.file, { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    entry.questions = parseLectureMarkdown(await res.text());
    if (entry.questions.length === 0) entry.error = "keine gültigen Fragen";
  } catch (e) {
    entry.error = e.message;
  }
  state.lectures.set(meta.file, entry);
  return entry;
}

/* ───────────────────────── Bibliothek ───────────────────────── */

function flattenLectures() {
  const out = [];
  for (const sem of state.index.semesters || []) {
    for (const course of sem.courses || []) {
      for (const lec of course.lectures || []) {
        out.push({ semester: sem.name, course: course.name, name: lec.name, file: lec.file });
      }
    }
  }
  return out;
}

function renderLibrary() {
  const root = els.libraryContent;
  root.innerHTML = "";

  if (!state.index || !(state.index.semesters || []).length) {
    root.innerHTML = '<p class="loading-note">Keine Kurse gefunden. Lege Vorlesungen in <code>data/</code> an und trage sie in <code>data/index.json</code> ein.</p>';
    return;
  }

  for (const sem of state.index.semesters) {
    const label = document.createElement("div");
    label.className = "semester-label";
    label.textContent = sem.name;
    root.appendChild(label);

    for (const course of sem.courses || []) {
      const details = document.createElement("details");
      details.className = "course";

      const lectures = course.lectures || [];
      const anySelected = lectures.some(l => state.selection.has(l.file));
      if (anySelected) details.open = true;

      const summary = document.createElement("summary");
      const title = document.createElement("span");
      title.textContent = course.name;
      const count = document.createElement("span");
      count.className = "course-count";
      const chevron = document.createElement("span");
      chevron.className = "course-chevron";
      chevron.textContent = "›";
      summary.append(title, count, chevron);
      details.appendChild(summary);

      const body = document.createElement("div");
      body.className = "course-body";

      const toggleAll = document.createElement("button");
      toggleAll.type = "button";
      toggleAll.className = "course-toggle-all";
      body.appendChild(toggleAll);

      const rows = [];
      for (const lec of lectures) {
        const row = document.createElement("label");
        row.className = "lecture-row";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = state.selection.has(lec.file);
        cb.addEventListener("change", () => {
          if (cb.checked) state.selection.add(lec.file);
          else state.selection.delete(lec.file);
          saveSelection();
          updateCourseUI();
          updateSelectionSummary();
        });

        const name = document.createElement("span");
        name.className = "lecture-name";
        name.textContent = lec.name;

        const qcount = document.createElement("span");
        qcount.className = "lecture-qcount";
        qcount.dataset.file = lec.file;
        qcount.textContent = "…";

        row.append(cb, name, qcount);
        body.appendChild(row);
        rows.push({ cb, lec });
      }

      function updateCourseUI() {
        const sel = lectures.filter(l => state.selection.has(l.file)).length;
        count.textContent = sel > 0 ? sel + " / " + lectures.length : lectures.length + " VL";
        toggleAll.textContent = sel === lectures.length ? "Alle abwählen" : "Alle auswählen";
      }

      toggleAll.addEventListener("click", () => {
        const allSelected = lectures.every(l => state.selection.has(l.file));
        for (const { cb, lec } of rows) {
          cb.checked = !allSelected;
          if (allSelected) state.selection.delete(lec.file);
          else state.selection.add(lec.file);
        }
        saveSelection();
        updateCourseUI();
        updateSelectionSummary();
      });

      updateCourseUI();
      details.appendChild(body);
      root.appendChild(details);
    }
  }
}

function updateSelectionSummary() {
  const files = [...state.selection];
  if (files.length === 0) {
    els.selectionSummary.textContent = "Keine Vorlesung ausgewählt";
    els.btnStart.disabled = true;
    return;
  }
  let qTotal = 0;
  let pending = false;
  for (const f of files) {
    const entry = state.lectures.get(f);
    if (entry && !entry.error) qTotal += entry.questions.length;
    else if (!entry) pending = true;
  }
  const lecPart = files.length + (files.length === 1 ? " Vorlesung" : " Vorlesungen");
  const qPart = pending ? "Fragen werden geladen …" : qTotal + " Fragen";
  els.selectionSummary.textContent = lecPart + " · " + qPart;
  els.btnStart.disabled = false;
}

async function prefetchAllLectures() {
  const all = flattenLectures();
  await Promise.all(all.map(async meta => {
    const entry = await loadLecture(meta);
    const tag = els.libraryContent.querySelector('.lecture-qcount[data-file="' + CSS.escape(meta.file) + '"]');
    if (tag) {
      tag.textContent = entry.error ? "Fehler" : entry.questions.length + " Fragen";
      if (entry.error) tag.style.color = "var(--wrong)";
    }
  }));
  updateSelectionSummary();
}

/* ───────────────────────── Quiz ───────────────────────── */

async function startQuiz(questionPool) {
  let pool = questionPool;

  if (!pool) {
    const files = [...state.selection];
    const entries = await Promise.all(
      flattenLectures().filter(m => files.includes(m.file)).map(loadLecture)
    );
    pool = [];
    for (const entry of entries) {
      if (entry.error) {
        showToast("„" + entry.meta.name + "“ übersprungen: " + entry.error);
        continue;
      }
      for (const q of entry.questions) {
        pool.push({ ...q, source: entry.meta.course + " · " + entry.meta.name });
      }
    }
  }

  if (!pool.length) {
    showToast("Keine Fragen in der Auswahl gefunden.");
    return;
  }

  let questions = els.optShuffleQ.checked ? shuffle(pool) : pool.slice();
  questions = questions.map(q => ({
    ...q,
    options: els.optShuffleA.checked ? shuffle(q.options) : q.options.slice(),
  }));

  state.quiz = {
    questions,
    current: 0,
    correct: 0,
    wrong: [],            // { question, source, correctTexts }
    phase: "hidden",      // "hidden" → "answering" → "solved"
    selected: new Set(),  // Indizes der gewählten Optionen
  };

  showView(els.viewQuiz);
  renderQuestion();
}

function renderQuestion() {
  const quiz = state.quiz;
  const q = quiz.questions[quiz.current];
  quiz.phase = "hidden";
  quiz.selected = new Set();

  // Karte neu animieren
  els.questionCard.style.animation = "none";
  void els.questionCard.offsetWidth;
  els.questionCard.style.animation = "";

  els.counterText.textContent = "Frage " + (quiz.current + 1) + " / " + quiz.questions.length;
  els.progressFill.style.width = (quiz.current / quiz.questions.length) * 100 + "%";
  els.quizScore.textContent = quiz.correct + " ✓";

  els.questionMeta.textContent = q.source || "";
  els.questionType.textContent = q.multiple ? "Multiple Choice" : "Single Choice";
  els.questionText.textContent = q.question;

  els.answersHidden.hidden = false;
  els.answerList.hidden = true;
  els.answerList.innerHTML = "";
  els.explanation.hidden = true;

  els.btnQuizAction.textContent = "Antworten einblenden";
  els.btnQuizAction.disabled = false;
}

function revealAnswers() {
  const quiz = state.quiz;
  const q = quiz.questions[quiz.current];
  quiz.phase = "answering";

  els.answersHidden.hidden = true;
  els.answerList.hidden = false;
  els.answerList.innerHTML = "";

  q.options.forEach((opt, i) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "answer";
    btn.dataset.index = i;

    const letter = document.createElement("span");
    letter.className = "answer-letter";
    letter.textContent = String.fromCharCode(65 + i); // A, B, C …

    const text = document.createElement("span");
    text.textContent = opt.text;

    btn.append(letter, text);
    btn.addEventListener("click", () => toggleAnswer(i));
    li.appendChild(btn);
    els.answerList.appendChild(li);
  });

  if (q.multiple) {
    const hint = document.createElement("li");
    hint.className = "multi-hint";
    hint.textContent = "Mehrere Antworten möglich";
    els.answerList.appendChild(hint);
  }

  els.btnQuizAction.textContent = "Auflösen";
  els.btnQuizAction.disabled = true;
}

function toggleAnswer(i) {
  const quiz = state.quiz;
  if (quiz.phase !== "answering") return;
  const q = quiz.questions[quiz.current];

  if (q.multiple) {
    if (quiz.selected.has(i)) quiz.selected.delete(i);
    else quiz.selected.add(i);
  } else {
    quiz.selected = new Set([i]);
  }

  els.answerList.querySelectorAll(".answer").forEach(btn => {
    btn.classList.toggle("selected", quiz.selected.has(Number(btn.dataset.index)));
  });
  els.btnQuizAction.disabled = quiz.selected.size === 0;
}

function solveQuestion() {
  const quiz = state.quiz;
  const q = quiz.questions[quiz.current];
  quiz.phase = "solved";

  const correctSet = new Set(q.options.map((o, i) => o.correct ? i : -1).filter(i => i >= 0));
  const isCorrect =
    quiz.selected.size === correctSet.size &&
    [...quiz.selected].every(i => correctSet.has(i));

  if (isCorrect) {
    quiz.correct++;
  } else {
    quiz.wrong.push({
      ...q,
      correctTexts: q.options.filter(o => o.correct).map(o => o.text),
    });
  }

  els.answerList.querySelectorAll(".answer").forEach(btn => {
    const i = Number(btn.dataset.index);
    btn.classList.add("locked");
    btn.classList.remove("selected");
    btn.disabled = true;
    if (correctSet.has(i)) btn.classList.add("reveal-correct");
    else if (quiz.selected.has(i)) btn.classList.add("reveal-wrong");
    else btn.classList.add("dimmed");
  });

  if (q.explanation) {
    els.explanationText.textContent = q.explanation;
    els.explanation.hidden = false;
  }

  els.quizScore.textContent = quiz.correct + " ✓";
  els.progressFill.style.width = ((quiz.current + 1) / quiz.questions.length) * 100 + "%";

  const last = quiz.current === quiz.questions.length - 1;
  els.btnQuizAction.textContent = last ? "Ergebnis anzeigen" : "Weiter";
  els.btnQuizAction.disabled = false;
}

function nextQuestion() {
  const quiz = state.quiz;
  if (quiz.current === quiz.questions.length - 1) {
    showSummary();
  } else {
    quiz.current++;
    renderQuestion();
  }
}

function handleQuizAction() {
  const quiz = state.quiz;
  if (!quiz) return;
  if (quiz.phase === "hidden") revealAnswers();
  else if (quiz.phase === "answering") solveQuestion();
  else nextQuestion();
}

/* ───────────────────────── Ergebnis ───────────────────────── */

function showSummary() {
  const quiz = state.quiz;
  const total = quiz.questions.length;
  const pct = Math.round((quiz.correct / total) * 100);

  els.summaryCorrect.textContent = quiz.correct;
  els.summaryTotal.textContent = total;
  els.summaryPercent.textContent = pct + " % richtig";

  els.summaryNote.textContent =
    pct === 100 ? "Alles richtig – klausurbereit." :
    pct >= 80  ? "Stark. Die letzten Lücken schließt die Wiederholung." :
    pct >= 50  ? "Solide Basis – die falschen Fragen lohnen einen zweiten Durchgang." :
                 "Noch Luft nach oben. Wiederhole die falschen Fragen direkt.";

  if (quiz.wrong.length) {
    els.wrongSection.hidden = false;
    els.btnRetryWrong.hidden = false;
    els.wrongList.innerHTML = "";
    for (const w of quiz.wrong) {
      const li = document.createElement("li");
      li.className = "wrong-item";

      const meta = document.createElement("div");
      meta.className = "wrong-meta";
      meta.textContent = w.source || "";

      const question = document.createElement("p");
      question.className = "wrong-question";
      question.textContent = w.question;

      const answer = document.createElement("p");
      answer.className = "wrong-answer";
      answer.textContent = "Richtig: " + w.correctTexts.join(" · ");

      li.append(meta, question, answer);
      els.wrongList.appendChild(li);
    }
  } else {
    els.wrongSection.hidden = true;
    els.btnRetryWrong.hidden = true;
  }

  showView(els.viewSummary);
}

/* ───────────────────────── Events ───────────────────────── */

els.btnStart.addEventListener("click", () => startQuiz(null));
els.btnQuizAction.addEventListener("click", handleQuizAction);

els.btnQuit.addEventListener("click", () => {
  const quiz = state.quiz;
  const mid = quiz && (quiz.current > 0 || quiz.phase !== "hidden");
  if (!mid || confirm("Quiz wirklich beenden? Der Fortschritt geht verloren.")) {
    state.quiz = null;
    showView(els.viewLibrary);
  }
});

els.btnBackLibrary.addEventListener("click", () => {
  state.quiz = null;
  showView(els.viewLibrary);
});

els.btnRestart.addEventListener("click", () => startQuiz(null));

els.btnRetryWrong.addEventListener("click", () => {
  const pool = state.quiz.wrong.map(w => ({
    question: w.question,
    options: w.options,
    explanation: w.explanation,
    multiple: w.multiple,
    source: w.source,
  }));
  startQuiz(pool);
});

els.optShuffleQ.addEventListener("change", saveSettings);
els.optShuffleA.addEventListener("change", saveSettings);

// Tastatur: 1–9 wählt Antworten, Enter/Leertaste löst die Hauptaktion aus
document.addEventListener("keydown", e => {
  if (els.viewQuiz.hidden || !state.quiz) return;
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

  if (e.key === "Enter" || e.key === " ") {
    // Fokussierte Buttons lösen nativ schon einen Klick aus – nicht doppeln
    if (document.activeElement && document.activeElement.tagName === "BUTTON") return;
    e.preventDefault();
    if (!els.btnQuizAction.disabled) handleQuizAction();
  } else if (/^[1-9]$/.test(e.key) && state.quiz.phase === "answering") {
    const i = Number(e.key) - 1;
    if (i < state.quiz.questions[state.quiz.current].options.length) toggleAnswer(i);
  }
});

/* ───────────────────────── Start ───────────────────────── */

async function init() {
  loadSettings();
  try {
    state.index = await loadIndex();
    loadSelection();
    // verwaiste Auswahl (gelöschte Dateien) bereinigen
    const valid = new Set(flattenLectures().map(l => l.file));
    for (const f of [...state.selection]) if (!valid.has(f)) state.selection.delete(f);
    renderLibrary();
    updateSelectionSummary();
    prefetchAllLectures();
  } catch (e) {
    els.libraryContent.innerHTML =
      '<p class="loading-note">Konnte <code>data/index.json</code> nicht laden: ' + e.message + "</p>";
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

init();
