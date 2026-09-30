(() => {
  "use strict";

  const bank = window.PHARMA_QUESTION_BANK;
  if (!bank || !Array.isArray(bank.classes)) {
    document.body.innerHTML = "<p>No se pudo cargar el banco de preguntas.</p>";
    return;
  }

  const STORAGE_PROGRESS = "pharma-uoh-progress-v1";
  const STORAGE_SESSION = "pharma-uoh-session-v1";
  const difficultyLabels = { easy: "Fácil", medium: "Intermedia", hard: "Difícil" };
  const difficultyOrder = { easy: 0, medium: 1, hard: 2 };
  const classMap = new Map(bank.classes.map((item) => [item.id, item]));
  const questionMap = new Map(
    bank.classes.flatMap((classItem) => classItem.questions.map((question) => [question.id, question])),
  );

  const state = {
    mode: "practice",
    order: "class",
    count: 45,
    selectedClasses: new Set(bank.classes.map((item) => item.id)),
    difficulties: new Set(["easy", "medium", "hard"]),
    session: null,
    lastResult: null,
    timerId: null,
    progress: loadProgress(),
  };

  const elements = {
    setup: document.querySelector("#setup-screen"),
    quiz: document.querySelector("#quiz-screen"),
    results: document.querySelector("#results-screen"),
    classGrid: document.querySelector("#class-grid"),
    start: document.querySelector("#start-quiz"),
    reviewErrors: document.querySelector("#review-errors"),
    configSummary: document.querySelector("#configuration-summary"),
    modeHelp: document.querySelector("#mode-help"),
    resumeBanner: document.querySelector("#resume-banner"),
    resumeCopy: document.querySelector("#resume-copy"),
    questionSurface: document.querySelector("#question-surface"),
    answerList: document.querySelector("#answer-list"),
    feedback: document.querySelector("#feedback"),
    feedbackTitle: document.querySelector("#feedback-title"),
    feedbackText: document.querySelector("#feedback-text"),
    position: document.querySelector("#quiz-position"),
    section: document.querySelector("#quiz-section"),
    progressBar: document.querySelector("#quiz-progress-bar"),
    timer: document.querySelector("#timer"),
    timerBox: document.querySelector("#timer-box"),
    questionClass: document.querySelector("#question-class"),
    questionDifficulty: document.querySelector("#question-difficulty"),
    questionText: document.querySelector("#question-text"),
    previous: document.querySelector("#previous-question"),
    next: document.querySelector("#next-question"),
    flag: document.querySelector("#flag-question"),
    progressModal: document.querySelector("#progress-modal"),
    settingsModal: document.querySelector("#settings-modal"),
    exitModal: document.querySelector("#exit-modal"),
    toast: document.querySelector("#toast"),
  };

  function safeParse(value, fallback) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }

  function loadProgress() {
    const saved = safeParse(localStorage.getItem(STORAGE_PROGRESS), null);
    if (!saved || typeof saved !== "object") {
      return { questions: {}, wrongIds: [], completedTests: 0 };
    }
    return {
      questions: saved.questions || {},
      wrongIds: Array.isArray(saved.wrongIds) ? saved.wrongIds.filter((id) => questionMap.has(id)) : [],
      completedTests: Number(saved.completedTests) || 0,
    };
  }

  function saveProgress() {
    localStorage.setItem(STORAGE_PROGRESS, JSON.stringify(state.progress));
  }

  function saveSession() {
    if (state.session && !state.session.completed) {
      localStorage.setItem(STORAGE_SESSION, JSON.stringify(state.session));
    }
  }

  function clearSavedSession() {
    localStorage.removeItem(STORAGE_SESSION);
  }

  function refreshIcons(root = document) {
    if (window.lucide?.createIcons) {
      window.lucide.createIcons({ root });
    }
  }

  function shuffle(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatTime(totalSeconds) {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("visible");
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => elements.toast.classList.remove("visible"), 2200);
  }

  function questionStats(questionId) {
    return state.progress.questions[questionId] || { attempts: 0, correct: 0 };
  }

  function classStats(classId) {
    const questions = classMap.get(classId).questions;
    return questions.reduce(
      (summary, question) => {
        const stats = questionStats(question.id);
        summary.attempts += stats.attempts;
        summary.correct += stats.correct;
        return summary;
      },
      { attempts: 0, correct: 0 },
    );
  }

  function updateHomeStats() {
    const totals = Object.values(state.progress.questions).reduce(
      (summary, item) => {
        summary.attempts += Number(item.attempts) || 0;
        summary.correct += Number(item.correct) || 0;
        return summary;
      },
      { attempts: 0, correct: 0 },
    );
    const accuracy = totals.attempts ? Math.round((totals.correct / totals.attempts) * 100) : 0;
    document.querySelector("#stat-answered").textContent = totals.attempts;
    document.querySelector("#stat-accuracy").textContent = `${accuracy}%`;
    document.querySelector("#stat-pending").textContent = state.progress.wrongIds.length;
    elements.reviewErrors.disabled = state.progress.wrongIds.length === 0;
  }

  function renderClassGrid() {
    elements.classGrid.innerHTML = bank.classes
      .map((classItem) => {
        const stats = classStats(classItem.id);
        const mastery = stats.attempts ? Math.round((stats.correct / stats.attempts) * 100) : 0;
        const label = stats.attempts ? `${mastery}% dominio` : "Sin intentos";
        const checked = state.selectedClasses.has(classItem.id);
        return `
          <label class="class-card ${checked ? "selected" : ""}" style="--class-accent:${classItem.accent}">
            <input type="checkbox" value="${classItem.id}" ${checked ? "checked" : ""} />
            <span class="class-copy">
              <span class="class-number">Clase ${classItem.id}</span>
              <strong>${escapeHtml(classItem.title)}</strong>
              <p>${escapeHtml(classItem.focus)}</p>
              <span class="mastery-row">
                <span class="mini-track"><span style="width:${mastery}%"></span></span>
                <small>${label}</small>
              </span>
            </span>
          </label>`;
      })
      .join("");

    elements.classGrid.querySelectorAll("input").forEach((input) => {
      input.addEventListener("change", () => {
        const id = Number(input.value);
        if (input.checked) state.selectedClasses.add(id);
        else state.selectedClasses.delete(id);
        input.closest(".class-card").classList.toggle("selected", input.checked);
        updateConfigurationSummary();
      });
    });
  }

  function availableQuestions() {
    return bank.classes.flatMap((classItem) =>
      state.selectedClasses.has(classItem.id)
        ? classItem.questions.filter((question) => state.difficulties.has(question.difficulty))
        : [],
    );
  }

  function updateConfigurationSummary() {
    const selectedCount = state.selectedClasses.size;
    const difficultyCount = state.difficulties.size;
    const available = availableQuestions().length;
    const requested = Math.min(state.count, available);
    const duration = state.mode === "exam" ? ` Tiempo: ${requested} min.` : "";

    if (!selectedCount || !difficultyCount) {
      elements.configSummary.textContent = "Selecciona al menos una clase y una dificultad.";
      elements.start.disabled = true;
      return;
    }

    elements.start.disabled = available === 0;
    elements.configSummary.textContent = `${requested} preguntas de ${selectedCount} ${
      selectedCount === 1 ? "clase" : "clases"
    }.${duration}`;
  }

  function bindSegmentedControl(selector, onChange) {
    const control = document.querySelector(selector);
    control.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        control.querySelectorAll("button").forEach((item) => {
          const active = item === button;
          item.classList.toggle("active", active);
          item.setAttribute("aria-pressed", String(active));
        });
        onChange(button.dataset.value);
      });
    });
  }

  function balancedSample(candidates, target) {
    const selectedIds = [...state.selectedClasses].sort((a, b) => a - b);
    const base = Math.floor(target / selectedIds.length);
    let remainder = target % selectedIds.length;
    const remainderOrder = shuffle(selectedIds);
    const quotas = new Map(selectedIds.map((id) => [id, base]));
    for (const classId of remainderOrder) {
      if (!remainder) break;
      quotas.set(classId, quotas.get(classId) + 1);
      remainder -= 1;
    }

    const chosen = [];
    const chosenIds = new Set();
    for (const classId of selectedIds) {
      const classCandidates = candidates.filter((question) => question.classId === classId);
      const buckets = [...state.difficulties].map((difficulty) =>
        shuffle(classCandidates.filter((question) => question.difficulty === difficulty)),
      );
      const difficultyCycle = shuffle(buckets);
      const quota = Math.min(quotas.get(classId), classCandidates.length);
      let cursor = 0;
      while (chosen.filter((question) => question.classId === classId).length < quota) {
        const bucket = difficultyCycle[cursor % difficultyCycle.length];
        const question = bucket.pop();
        if (question && !chosenIds.has(question.id)) {
          chosen.push(question);
          chosenIds.add(question.id);
        }
        cursor += 1;
        if (cursor > classCandidates.length * 4) break;
      }
    }

    if (chosen.length < target) {
      const remaining = shuffle(candidates.filter((question) => !chosenIds.has(question.id)));
      chosen.push(...remaining.slice(0, target - chosen.length));
    }

    if (state.order === "class") {
      return chosen.sort((a, b) => {
        if (a.classId !== b.classId) return a.classId - b.classId;
        return difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty];
      });
    }
    return shuffle(chosen);
  }

  function createSessionFromQuestions(questions, mode = state.mode) {
    const prepared = questions.map((question) => ({
      id: question.id,
      optionOrder: shuffle(question.options.map((_, index) => index)),
    }));
    return {
      version: 1,
      mode,
      order: state.order,
      questions: prepared,
      index: 0,
      answers: {},
      evaluated: [],
      flags: [],
      startedAt: Date.now(),
      durationSeconds: mode === "exam" ? prepared.length * 60 : null,
      completed: false,
    };
  }

  function startConfiguredQuiz() {
    const candidates = availableQuestions();
    const target = Math.min(state.count, candidates.length);
    if (!target) {
      showToast("Selecciona contenido para comenzar.");
      return;
    }
    const questions = balancedSample(candidates, target);
    state.session = createSessionFromQuestions(questions);
    state.lastResult = null;
    saveSession();
    showQuiz();
  }

  function startQuestionsById(ids, mode = "practice") {
    const questions = ids.map((id) => questionMap.get(id)).filter(Boolean);
    if (!questions.length) {
      showToast("No hay preguntas pendientes para repasar.");
      return;
    }
    questions.sort((a, b) => a.classId - b.classId);
    state.session = createSessionFromQuestions(questions, mode);
    state.lastResult = null;
    saveSession();
    showQuiz();
  }

  function showScreen(target) {
    [elements.setup, elements.quiz, elements.results].forEach((screen) => {
      screen.hidden = screen !== target;
    });
    document.querySelector("main").focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showSetup() {
    stopTimer();
    showScreen(elements.setup);
    state.progress = loadProgress();
    updateHomeStats();
    renderClassGrid();
    updateResumeBanner();
    updateConfigurationSummary();
    refreshIcons(elements.setup);
  }

  function showQuiz() {
    if (!state.session?.questions?.length) return;
    showScreen(elements.quiz);
    renderQuestion();
    startTimer();
  }

  function currentSessionQuestion() {
    const entry = state.session.questions[state.session.index];
    return { entry, question: questionMap.get(entry.id) };
  }

  function isEvaluated(questionId) {
    return state.session.evaluated.includes(questionId);
  }

  function renderQuestion() {
    const { entry, question } = currentSessionQuestion();
    const classItem = classMap.get(question.classId);
    const selected = state.session.answers[question.id];
    const evaluated = state.session.mode === "practice" && isEvaluated(question.id);
    const flagged = state.session.flags.includes(question.id);
    const total = state.session.questions.length;
    const number = state.session.index + 1;

    elements.position.textContent = `Pregunta ${number} de ${total}`;
    elements.section.textContent = `Clase ${classItem.id}: ${classItem.short}`;
    elements.progressBar.style.width = `${(number / total) * 100}%`;
    elements.questionSurface.style.setProperty("--question-accent", classItem.accent);
    elements.questionClass.textContent = `Clase ${classItem.id} · ${classItem.short}`;
    elements.questionDifficulty.textContent = difficultyLabels[question.difficulty];
    elements.questionText.textContent = question.prompt;

    elements.answerList.innerHTML = entry.optionOrder
      .map((originalIndex, displayIndex) => {
        const isSelected = selected === originalIndex;
        const isCorrect = originalIndex === question.answer;
        const classes = ["answer-option"];
        let icon = "";
        if (isSelected) classes.push("selected");
        if (evaluated && isCorrect) {
          classes.push("correct");
          icon = '<i data-lucide="check-circle-2"></i>';
        } else if (evaluated && isSelected && !isCorrect) {
          classes.push("incorrect");
          icon = '<i data-lucide="x-circle"></i>';
        }
        return `
          <button class="${classes.join(" ")}" type="button" role="radio"
            aria-checked="${isSelected}" data-original-index="${originalIndex}" ${evaluated ? "disabled" : ""}>
            <span class="answer-letter">${String.fromCharCode(65 + displayIndex)}</span>
            <span class="answer-copy">${escapeHtml(question.options[originalIndex])}</span>
            <span class="answer-status">${icon}</span>
          </button>`;
      })
      .join("");

    elements.answerList.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => selectAnswer(Number(button.dataset.originalIndex)));
    });

    if (evaluated) {
      const correct = selected === question.answer;
      elements.feedback.hidden = false;
      elements.feedback.classList.toggle("incorrect", !correct);
      elements.feedbackTitle.textContent = correct ? "Correcta" : `Incorrecta. Respuesta: ${question.options[question.answer]}`;
      elements.feedbackText.textContent = question.explanation;
    } else {
      elements.feedback.hidden = true;
      elements.feedback.classList.remove("incorrect");
    }

    elements.previous.disabled = state.session.index === 0;
    elements.next.disabled = state.session.mode === "practice" && selected === undefined;
    elements.next.innerHTML =
      state.session.index === total - 1
        ? 'Finalizar <i data-lucide="check"></i>'
        : 'Siguiente <i data-lucide="chevron-right"></i>';
    elements.flag.setAttribute("aria-pressed", String(flagged));
    elements.flag.querySelector("span").textContent = flagged ? "Marcada" : "Marcar";
    refreshIcons(elements.quiz);
  }

  function selectAnswer(originalIndex) {
    const { question } = currentSessionQuestion();
    if (state.session.mode === "practice" && isEvaluated(question.id)) return;
    state.session.answers[question.id] = originalIndex;

    if (state.session.mode === "practice") {
      state.session.evaluated.push(question.id);
      recordAttempt(question.id, originalIndex === question.answer);
    }
    saveSession();
    renderQuestion();
  }

  function recordAttempt(questionId, correct) {
    const current = questionStats(questionId);
    state.progress.questions[questionId] = {
      attempts: current.attempts + 1,
      correct: current.correct + (correct ? 1 : 0),
    };
    const wrong = new Set(state.progress.wrongIds);
    if (correct) wrong.delete(questionId);
    else wrong.add(questionId);
    state.progress.wrongIds = [...wrong];
    saveProgress();
  }

  function moveQuestion(delta) {
    const nextIndex = state.session.index + delta;
    if (nextIndex < 0 || nextIndex >= state.session.questions.length) return;
    state.session.index = nextIndex;
    saveSession();
    renderQuestion();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function nextQuestion() {
    const { question } = currentSessionQuestion();
    if (state.session.mode === "practice" && state.session.answers[question.id] === undefined) {
      showToast("Selecciona una alternativa para continuar.");
      return;
    }
    if (state.session.index === state.session.questions.length - 1) {
      finishSession();
      return;
    }
    moveQuestion(1);
  }

  function toggleFlag() {
    const { question } = currentSessionQuestion();
    const flags = new Set(state.session.flags);
    if (flags.has(question.id)) flags.delete(question.id);
    else flags.add(question.id);
    state.session.flags = [...flags];
    saveSession();
    renderQuestion();
  }

  function elapsedSeconds(session = state.session) {
    return Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000));
  }

  function remainingSeconds() {
    return Math.max(0, state.session.durationSeconds - elapsedSeconds());
  }

  function startTimer() {
    stopTimer();
    updateTimer();
    state.timerId = window.setInterval(updateTimer, 1000);
  }

  function stopTimer() {
    if (state.timerId) window.clearInterval(state.timerId);
    state.timerId = null;
  }

  function updateTimer() {
    if (!state.session || elements.quiz.hidden) return;
    const seconds = state.session.mode === "exam" ? remainingSeconds() : elapsedSeconds();
    elements.timer.textContent = formatTime(seconds);
    elements.timerBox.classList.toggle("urgent", state.session.mode === "exam" && seconds <= 60);
    if (state.session.mode === "exam" && seconds <= 0) {
      showToast("Se terminó el tiempo. Calculando resultado.");
      finishSession();
    }
  }

  function calculateResult() {
    const rows = state.session.questions.map((entry) => {
      const question = questionMap.get(entry.id);
      const selected = state.session.answers[entry.id];
      return {
        question,
        selected,
        correct: selected === question.answer,
        unanswered: selected === undefined,
      };
    });
    const correct = rows.filter((row) => row.correct).length;
    return {
      rows,
      correct,
      wrong: rows.length - correct,
      percent: Math.round((correct / rows.length) * 100),
      elapsed: elapsedSeconds(),
    };
  }

  function finishSession() {
    if (!state.session || state.session.completed) return;
    stopTimer();
    const result = calculateResult();

    if (state.session.mode === "exam") {
      result.rows.forEach((row) => {
        if (!row.unanswered) recordAttempt(row.question.id, row.correct);
        else {
          const wrong = new Set(state.progress.wrongIds);
          wrong.add(row.question.id);
          state.progress.wrongIds = [...wrong];
        }
      });
    }
    state.progress.completedTests += 1;
    saveProgress();
    state.session.completed = true;
    state.lastResult = { ...result, session: state.session };
    clearSavedSession();
    renderResults();
  }

  function renderResults() {
    const result = state.lastResult;
    if (!result) return;
    showScreen(elements.results);
    const title = result.percent >= 80 ? "Buen dominio" : result.percent >= 60 ? "Base sólida, falta afinar" : "Conviene reforzar los fundamentos";
    document.querySelector("#result-title").textContent = title;
    document.querySelector("#result-summary").textContent =
      result.percent >= 80
        ? "Tu rendimiento es consistente. Revisa los errores para cerrar las brechas restantes."
        : "Usa el resultado por clase para priorizar el próximo repaso, empezando por el porcentaje más bajo.";
    document.querySelector("#score-percent").textContent = `${result.percent}%`;
    document.querySelector("#result-correct").textContent = result.correct;
    document.querySelector("#result-wrong").textContent = result.wrong;
    document.querySelector("#result-time").textContent = formatTime(result.elapsed);
    const scoreColor = result.percent >= 80 ? "#23734f" : result.percent >= 60 ? "#b87413" : "#a33f37";
    document.querySelector("#score-ring").style.setProperty("--score-color", scoreColor);

    const grouped = new Map();
    result.rows.forEach((row) => {
      if (!grouped.has(row.question.classId)) grouped.set(row.question.classId, []);
      grouped.get(row.question.classId).push(row);
    });
    document.querySelector("#class-results").innerHTML = [...grouped.entries()]
      .sort(([a], [b]) => a - b)
      .map(([classId, rows]) => {
        const classItem = classMap.get(classId);
        const count = rows.filter((row) => row.correct).length;
        const percent = Math.round((count / rows.length) * 100);
        return `
          <div class="class-result-row" style="--class-accent:${classItem.accent}">
            <span class="class-result-name">Clase ${classId} · ${escapeHtml(classItem.short)}</span>
            <span class="class-result-track"><span style="width:${percent}%"></span></span>
            <span class="class-result-score">${count}/${rows.length}</span>
          </div>`;
      })
      .join("");

    const mistakes = result.rows.filter((row) => !row.correct);
    const mistakeList = document.querySelector("#mistake-list");
    if (!mistakes.length) {
      mistakeList.innerHTML = '<div class="empty-review">No tuviste errores en este intento.</div>';
    } else {
      mistakeList.innerHTML = mistakes
        .map((row) => {
          const classItem = classMap.get(row.question.classId);
          const selectedText = row.unanswered ? "Sin respuesta" : row.question.options[row.selected];
          return `
            <article class="mistake-item">
              <div class="mistake-meta">
                <span>Clase ${classItem.id} · ${escapeHtml(classItem.short)}</span>
                <span>${difficultyLabels[row.question.difficulty]}</span>
                <span>Tu respuesta: ${escapeHtml(selectedText)}</span>
              </div>
              <h3>${escapeHtml(row.question.prompt)}</h3>
              <p class="mistake-answer">Correcta: ${escapeHtml(row.question.options[row.question.answer])}</p>
              <p class="mistake-explanation">${escapeHtml(row.question.explanation)}</p>
            </article>`;
        })
        .join("");
    }
    document.querySelector("#retry-mistakes").disabled = mistakes.length === 0;
    refreshIcons(elements.results);
  }

  function updateResumeBanner() {
    const saved = safeParse(localStorage.getItem(STORAGE_SESSION), null);
    const valid = saved?.questions?.length && !saved.completed && saved.questions.every((item) => questionMap.has(item.id));
    elements.resumeBanner.hidden = !valid;
    if (valid) {
      elements.resumeCopy.textContent = `${saved.index + 1} de ${saved.questions.length} · ${
        saved.mode === "exam" ? "Simulación" : "Práctica"
      }`;
    }
  }

  function resumeSession() {
    const saved = safeParse(localStorage.getItem(STORAGE_SESSION), null);
    if (!saved?.questions?.length) return;
    state.session = saved;
    state.lastResult = null;
    if (saved.mode === "exam" && saved.durationSeconds - elapsedSeconds(saved) <= 0) {
      finishSession();
      return;
    }
    showQuiz();
  }

  function renderProgressModal() {
    document.querySelector("#progress-details").innerHTML = bank.classes
      .map((classItem) => {
        const stats = classStats(classItem.id);
        const percent = stats.attempts ? Math.round((stats.correct / stats.attempts) * 100) : 0;
        return `
          <div class="progress-class" style="--class-accent:${classItem.accent}">
            <div class="progress-class-head">
              <strong>Clase ${classItem.id} · ${escapeHtml(classItem.short)}</strong>
              <span>${stats.attempts ? `${percent}% · ${stats.attempts} intentos` : "Sin intentos"}</span>
            </div>
            <div class="class-result-track"><span style="width:${percent}%"></span></div>
          </div>`;
      })
      .join("");
  }

  function closeDialog(button) {
    const dialog = button.closest("dialog");
    if (dialog?.open) dialog.close();
  }

  document.querySelector("#select-all").addEventListener("click", () => {
    state.selectedClasses = new Set(bank.classes.map((item) => item.id));
    renderClassGrid();
    updateConfigurationSummary();
  });

  document.querySelector("#select-none").addEventListener("click", () => {
    state.selectedClasses.clear();
    renderClassGrid();
    updateConfigurationSummary();
  });

  bindSegmentedControl("#mode-control", (value) => {
    state.mode = value;
    elements.modeHelp.textContent =
      value === "practice"
        ? "Corrección y explicación después de cada respuesta."
        : "Sin corrección inmediata y con un minuto por pregunta.";
    updateConfigurationSummary();
  });

  bindSegmentedControl("#order-control", (value) => {
    state.order = value;
  });

  document.querySelectorAll("#count-control button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("#count-control button").forEach((item) => item.classList.toggle("active", item === button));
      state.count = Number(button.dataset.value);
      updateConfigurationSummary();
    });
  });

  document.querySelectorAll("#difficulty-control input").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) state.difficulties.add(input.value);
      else state.difficulties.delete(input.value);
      updateConfigurationSummary();
    });
  });

  elements.start.addEventListener("click", startConfiguredQuiz);
  elements.reviewErrors.addEventListener("click", () => startQuestionsById(state.progress.wrongIds));
  elements.previous.addEventListener("click", () => moveQuestion(-1));
  elements.next.addEventListener("click", nextQuestion);
  elements.flag.addEventListener("click", toggleFlag);
  document.querySelector("#exit-quiz").addEventListener("click", () => elements.exitModal.showModal());
  document.querySelector("#confirm-exit").addEventListener("click", () => {
    saveSession();
    elements.exitModal.close();
    showSetup();
  });

  document.querySelector("#home-button").addEventListener("click", () => {
    if (!elements.quiz.hidden && state.session && !state.session.completed) elements.exitModal.showModal();
    else showSetup();
  });

  document.querySelector("#open-progress").addEventListener("click", () => {
    state.progress = loadProgress();
    renderProgressModal();
    elements.progressModal.showModal();
  });
  document.querySelector("#open-settings").addEventListener("click", () => elements.settingsModal.showModal());
  document.querySelectorAll(".close-modal").forEach((button) => button.addEventListener("click", () => closeDialog(button)));

  document.querySelector("#reset-progress").addEventListener("click", () => {
    if (!window.confirm("¿Borrar todo el progreso y los errores guardados en este navegador?")) return;
    state.progress = { questions: {}, wrongIds: [], completedTests: 0 };
    saveProgress();
    state.selectedClasses = new Set(bank.classes.map((item) => item.id));
    renderClassGrid();
    updateHomeStats();
    elements.settingsModal.close();
    showToast("Progreso eliminado.");
  });

  document.querySelector("#discard-session").addEventListener("click", () => {
    clearSavedSession();
    state.session = null;
    updateResumeBanner();
  });
  document.querySelector("#resume-session").addEventListener("click", resumeSession);

  document.querySelector("#results-home").addEventListener("click", () => {
    state.session = null;
    state.lastResult = null;
    showSetup();
  });
  document.querySelector("#retry-mistakes").addEventListener("click", () => {
    const ids = state.lastResult?.rows.filter((row) => !row.correct).map((row) => row.question.id) || [];
    startQuestionsById(ids);
  });

  window.addEventListener("beforeunload", () => saveSession());

  renderClassGrid();
  updateHomeStats();
  updateResumeBanner();
  updateConfigurationSummary();
  refreshIcons();
})();
