(function () {
  "use strict";

  const WORD_LENGTH = 5;
  const MAX_GUESSES = 6;
  const DICTIONARY = new Set([...ANSWERS, ...VALID_GUESSES]);
  const DAILY_EPOCH = new Date("2024-01-01T00:00:00");

  // ---------- DOM refs ----------
  const boardEl = document.getElementById("board");
  const keyboardEl = document.getElementById("keyboard");
  const toastContainer = document.getElementById("toast-container");
  const scoreValueEl = document.getElementById("score-value");
  const guessCountEl = document.getElementById("guess-count");
  const modeDailyBtn = document.getElementById("mode-daily");
  const modePracticeBtn = document.getElementById("mode-practice");
  const themeBtn = document.getElementById("theme-btn");
  const rulesBtn = document.getElementById("rules-btn");
  const statsBtn = document.getElementById("stats-btn");
  const endModal = document.getElementById("end-modal");
  const endTitle = document.getElementById("end-title");
  const endWord = document.getElementById("end-word");
  const finalScoreValue = document.getElementById("final-score-value");
  const shareBtn = document.getElementById("share-btn");
  const playAgainBtn = document.getElementById("play-again-btn");
  const settingsBtn = document.getElementById("settings-btn");
  const hardModeToggle = document.getElementById("hardmode-toggle");
  const hardBadge = document.getElementById("hard-badge");

  const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th"];

  // ---------- Utilities ----------
  function todayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function dayNumber() {
    const d = new Date();
    const localMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffMs = localMidnight - DAILY_EPOCH;
    return Math.max(1, Math.floor(diffMs / 86400000) + 1);
  }

  function dailyAnswer() {
    const idx = (dayNumber() - 1) % ANSWERS.length;
    return ANSWERS[idx];
  }

  function randomAnswer(exclude) {
    let word;
    do {
      word = ANSWERS[Math.floor(Math.random() * ANSWERS.length)];
    } while (word === exclude && ANSWERS.length > 1);
    return word;
  }

  function showToast(message, duration = 1500) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    toastContainer.appendChild(el);
    setTimeout(() => el.remove(), duration);
  }

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* storage unavailable; game still works in-memory */
    }
  }

  // ---------- Theme ----------
  function initTheme() {
    const saved = localStorage.getItem("scordle-theme");
    if (saved) document.documentElement.setAttribute("data-theme", saved);
  }

  themeBtn.addEventListener("click", () => {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const current = document.documentElement.getAttribute("data-theme") || (prefersDark ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("scordle-theme", next);
  });

  initTheme();

  // ---------- Stats ----------
  function defaultStats() {
    return {
      played: 0,
      won: 0,
      currentStreak: 0,
      maxStreak: 0,
      scores: [],
      bestScore: 0,
      guessDistribution: [0, 0, 0, 0, 0, 0],
      lastCompletedDay: null,
    };
  }

  let stats = loadJSON("scordle-stats", defaultStats());

  function recordStatsResult(won, guessesUsed, score) {
    stats.played += 1;
    stats.scores.push(score);
    stats.bestScore = Math.max(stats.bestScore, score);
    if (won) {
      stats.won += 1;
      stats.currentStreak += 1;
      stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
      stats.guessDistribution[guessesUsed - 1] += 1;
    } else {
      stats.currentStreak = 0;
    }
    saveJSON("scordle-stats", stats);
  }

  // ---------- Game state ----------
  let state = null; // set by startGame

  function preferredHardMode() {
    return localStorage.getItem("scordle-hardmode") === "true";
  }

  function freshState(mode) {
    const answer = mode === "daily" ? dailyAnswer() : randomAnswer();
    return {
      mode,
      answer,
      guesses: [],
      statusesHistory: [],
      currentGuess: "",
      currentRow: 0,
      score: 0,
      scoredGreens: [],
      gameOver: false,
      won: false,
      hardMode: preferredHardMode(),
      dateKey: todayKey(),
      submitting: false,
    };
  }

  function saveDailyState() {
    if (state.mode !== "daily") return;
    saveJSON("scordle-daily-state", state);
  }

  function isValidDailyState(saved) {
    return (
      Array.isArray(saved.guesses) &&
      Array.isArray(saved.statusesHistory) &&
      saved.guesses.length === saved.statusesHistory.length &&
      saved.currentRow === saved.guesses.length &&
      saved.guesses.every((g) => typeof g === "string" && g.length === WORD_LENGTH)
    );
  }

  function loadDailyStateIfValid() {
    const saved = loadJSON("scordle-daily-state", null);
    if (
      saved &&
      saved.dateKey === todayKey() &&
      saved.answer === dailyAnswer() &&
      isValidDailyState(saved)
    ) {
      saved.submitting = false;
      return saved;
    }
    return null;
  }

  function startGame(mode) {
    if (mode === "daily") {
      state = loadDailyStateIfValid() || freshState("daily");
    } else {
      state = freshState("practice");
    }
    renderAll();
  }

  // ---------- Guess evaluation ----------
  function evaluateGuess(guess, answer) {
    const result = new Array(WORD_LENGTH).fill("absent");
    const answerLetters = answer.split("");
    const guessLetters = guess.split("");
    const used = new Array(WORD_LENGTH).fill(false);

    for (let i = 0; i < WORD_LENGTH; i++) {
      if (guessLetters[i] === answerLetters[i]) {
        result[i] = "correct";
        used[i] = true;
      }
    }
    for (let i = 0; i < WORD_LENGTH; i++) {
      if (result[i] === "correct") continue;
      const idx = answerLetters.findIndex(
        (letter, j) => !used[j] && letter === guessLetters[i]
      );
      if (idx !== -1) {
        result[i] = "present";
        used[idx] = true;
      }
    }
    return result;
  }

  function scoreGuess(guess, statuses) {
    const points = new Array(WORD_LENGTH).fill(0);
    for (let i = 0; i < WORD_LENGTH; i++) {
      if (statuses[i] === "correct") {
        const key = i + ":" + guess[i];
        if (!state.scoredGreens.includes(key)) {
          points[i] = 10;
          state.scoredGreens.push(key);
        } else {
          points[i] = 0;
        }
      } else if (statuses[i] === "present") {
        points[i] = 5;
      }
    }
    return points;
  }

  // ---------- Hard mode ----------
  function computeHardModeConstraints() {
    const greenReq = {}; // position -> required letter
    const minCounts = {}; // letter -> minimum required occurrences in the guess

    state.guesses.forEach((guess, r) => {
      const statuses = state.statusesHistory[r];
      const countsThisGuess = {};
      for (let i = 0; i < WORD_LENGTH; i++) {
        const letter = guess[i];
        const st = statuses[i];
        if (st === "correct") {
          greenReq[i] = letter;
          countsThisGuess[letter] = (countsThisGuess[letter] || 0) + 1;
        } else if (st === "present") {
          countsThisGuess[letter] = (countsThisGuess[letter] || 0) + 1;
        }
      }
      Object.keys(countsThisGuess).forEach((letter) => {
        minCounts[letter] = Math.max(minCounts[letter] || 0, countsThisGuess[letter]);
      });
    });

    return { greenReq, minCounts };
  }

  function checkHardMode(guess) {
    if (!state.hardMode || state.guesses.length === 0) return null;
    const { greenReq, minCounts } = computeHardModeConstraints();

    for (const posKey of Object.keys(greenReq)) {
      const pos = Number(posKey);
      if (guess[pos] !== greenReq[pos]) {
        return `${ORDINALS[pos]} letter must be ${greenReq[pos].toUpperCase()}`;
      }
    }

    const guessCounts = {};
    guess.split("").forEach((c) => {
      guessCounts[c] = (guessCounts[c] || 0) + 1;
    });
    for (const letter of Object.keys(minCounts)) {
      if ((guessCounts[letter] || 0) < minCounts[letter]) {
        return `Guess must contain ${letter.toUpperCase()}`;
      }
    }

    return null;
  }

  // ---------- Board rendering ----------
  function buildBoard() {
    boardEl.innerHTML = "";
    for (let r = 0; r < MAX_GUESSES; r++) {
      const row = document.createElement("div");
      row.className = "board-row";
      row.id = `row-${r}`;
      for (let c = 0; c < WORD_LENGTH; c++) {
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.id = `tile-${r}-${c}`;
        row.appendChild(tile);
      }
      boardEl.appendChild(row);
    }
  }

  function renderCurrentRow() {
    const row = document.getElementById(`row-${state.currentRow}`);
    if (!row) return;
    for (let c = 0; c < WORD_LENGTH; c++) {
      const tile = document.getElementById(`tile-${state.currentRow}-${c}`);
      const letter = state.currentGuess[c] || "";
      tile.textContent = letter;
      tile.classList.toggle("filled", !!letter);
    }
  }

  function renderCompletedRows() {
    state.guesses.forEach((guess, r) => {
      const statuses = state.statusesHistory[r];
      for (let c = 0; c < WORD_LENGTH; c++) {
        const tile = document.getElementById(`tile-${r}-${c}`);
        if (!tile) continue;
        tile.textContent = guess[c];
        tile.classList.add("revealed", statuses[c]);
      }
    });
  }

  function renderKeyboardStatuses() {
    const priority = { absent: 0, present: 1, correct: 2 };
    const best = {};
    state.guesses.forEach((guess, r) => {
      const statuses = state.statusesHistory[r];
      guess.split("").forEach((letter, i) => {
        const st = statuses[i];
        if (!(letter in best) || priority[st] > priority[best[letter]]) {
          best[letter] = st;
        }
      });
    });
    document.querySelectorAll(".key[data-key]").forEach((keyEl) => {
      const letter = keyEl.dataset.key;
      keyEl.classList.remove("correct", "present", "absent");
      if (best[letter]) keyEl.classList.add(best[letter]);
    });
  }

  function renderScore(animate) {
    scoreValueEl.textContent = state.score;
    if (animate) {
      scoreValueEl.classList.remove("bump");
      void scoreValueEl.offsetWidth;
      scoreValueEl.classList.add("bump");
    }
    guessCountEl.innerHTML = `${Math.min(state.currentRow + 1, MAX_GUESSES)}<span class="of6">/${MAX_GUESSES}</span>`;
  }

  function updateModeUI() {
    modeDailyBtn.classList.toggle("active", state.mode === "daily");
    modeDailyBtn.setAttribute("aria-selected", state.mode === "daily");
    modePracticeBtn.classList.toggle("active", state.mode === "practice");
    modePracticeBtn.setAttribute("aria-selected", state.mode === "practice");
  }

  function renderHardBadge() {
    hardBadge.hidden = !state.hardMode;
  }

  function renderAll() {
    buildBoard();
    renderCompletedRows();
    renderCurrentRow();
    renderKeyboardStatuses();
    renderScore(false);
    updateModeUI();
    renderHardBadge();
    if (state.gameOver) {
      // reflect final state without popping the modal automatically on reload
    }
  }

  // ---------- Score pop-ups ----------
  function spawnScorePops(row, points, statuses) {
    for (let c = 0; c < WORD_LENGTH; c++) {
      if (points[c] <= 0) continue;
      const tile = document.getElementById(`tile-${row}-${c}`);
      const pop = document.createElement("div");
      pop.className = "score-pop " + (statuses[c] === "correct" ? "gold" : "yellow");
      pop.textContent = "+" + points[c];
      pop.style.animationDelay = c * 0.15 + 0.35 + "s";
      tile.appendChild(pop);
      setTimeout(() => pop.remove(), 1400 + c * 150);
    }
  }

  // ---------- Keyboard ----------
  const KEY_ROWS = [
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["enter", "z", "x", "c", "v", "b", "n", "m", "backspace"],
  ];

  function buildKeyboard() {
    keyboardEl.innerHTML = "";
    KEY_ROWS.forEach((rowKeys) => {
      const row = document.createElement("div");
      row.className = "keyboard-row";
      rowKeys.forEach((k) => {
        const btn = document.createElement("button");
        btn.className = "key";
        if (k === "enter" || k === "backspace") btn.classList.add("wide");
        if (k === "backspace") {
          btn.innerHTML = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2.59 12.59L18 17l-4-4-4 4-1.41-1.41L12.59 12 8.59 8 10 6.59l4 4 4-4L19.41 8 15.41 12l4 3.59z"/></svg>';
          btn.setAttribute("aria-label", "Backspace");
        } else {
          btn.textContent = k === "enter" ? "Enter" : k;
        }
        btn.dataset.key = k;
        btn.addEventListener("click", () => handleKey(k));
        row.appendChild(btn);
      });
      keyboardEl.appendChild(row);
    });
  }

  function handleKey(key) {
    if (!state || state.gameOver) return;
    if (key === "enter") {
      submitGuess();
    } else if (key === "backspace") {
      state.currentGuess = state.currentGuess.slice(0, -1);
      renderCurrentRow();
    } else if (/^[a-z]$/.test(key) && state.currentGuess.length < WORD_LENGTH) {
      state.currentGuess += key;
      renderCurrentRow();
    }
  }

  window.addEventListener("keydown", (e) => {
    if (isAnyModalOpen()) return;
    const key = e.key.toLowerCase();
    if (key === "enter") handleKey("enter");
    else if (key === "backspace") handleKey("backspace");
    else if (/^[a-z]$/.test(key)) handleKey(key);
  });

  // ---------- Guess submission ----------
  function shakeRow(row) {
    const rowEl = document.getElementById(`row-${row}`);
    rowEl.classList.remove("shake");
    void rowEl.offsetWidth;
    rowEl.classList.add("shake");
  }

  function submitGuess() {
    if (state.submitting || state.gameOver) return;
    if (state.currentGuess.length < WORD_LENGTH) {
      showToast("Not enough letters");
      shakeRow(state.currentRow);
      return;
    }
    if (!DICTIONARY.has(state.currentGuess)) {
      showToast("Not in word list");
      shakeRow(state.currentRow);
      return;
    }
    const hardModeError = checkHardMode(state.currentGuess);
    if (hardModeError) {
      showToast(hardModeError);
      shakeRow(state.currentRow);
      return;
    }

    const guess = state.currentGuess;
    const statuses = evaluateGuess(guess, state.answer);
    const points = scoreGuess(guess, statuses);
    const gained = points.reduce((a, b) => a + b, 0);

    // Advance the data model synchronously so a second Enter press (e.g. a
    // mobile double-tap) can't resubmit this guess while the reveal animation
    // for it is still running.
    const row = state.currentRow;
    state.guesses.push(guess);
    state.statusesHistory.push(statuses);
    state.currentGuess = "";
    state.currentRow += 1;

    const won = guess === state.answer;
    if (won) {
      state.gameOver = true;
      state.won = true;
    } else if (state.currentRow >= MAX_GUESSES) {
      state.gameOver = true;
      state.won = false;
    }

    saveDailyState();
    renderScore(false);
    if (!state.gameOver) renderCurrentRow();

    state.submitting = true;
    flipRow(row, guess, statuses, () => {
      state.submitting = false;
      state.score += gained;
      renderScore(true);
      spawnScorePops(row, points, statuses);
      renderKeyboardStatuses();
      saveDailyState();

      if (state.gameOver) {
        finishGame();
      }
    });
  }

  function flipRow(row, guess, statuses, onDone) {
    const tiles = [];
    for (let c = 0; c < WORD_LENGTH; c++) {
      tiles.push(document.getElementById(`tile-${row}-${c}`));
    }
    tiles.forEach((tile, c) => {
      setTimeout(() => {
        tile.classList.add("flip");
        setTimeout(() => {
          tile.textContent = guess[c];
          tile.classList.add("revealed", statuses[c]);
        }, 250);
      }, c * 300);
    });
    setTimeout(onDone, tiles.length * 300 + 300);
  }

  // ---------- End of game ----------
  function finishGame() {
    if (state.mode === "daily" && stats.lastCompletedDay !== state.dateKey) {
      recordStatsResult(state.won, state.guesses.length, state.score);
      stats.lastCompletedDay = state.dateKey;
      saveJSON("scordle-stats", stats);
    }

    const rowEl = document.getElementById(`row-${state.guesses.length - 1}`);
    if (rowEl && state.won) {
      rowEl.classList.add("bounce");
    }

    setTimeout(() => openEndModal(), 500);
  }

  function openEndModal() {
    endTitle.textContent = state.won ? "You win!" : "So close!";
    endWord.textContent = state.won
      ? `Solved in ${state.guesses.length}/${MAX_GUESSES}`
      : `The word was ${state.answer.toUpperCase()}`;
    finalScoreValue.textContent = state.score;
    playAgainBtn.hidden = state.mode !== "practice";
    openModal("end-modal");
  }

  playAgainBtn.addEventListener("click", () => {
    closeModal("end-modal");
    startGame("practice");
  });

  // ---------- Share ----------
  function buildShareText() {
    const grid = state.statusesHistory
      .map((statuses) =>
        statuses
          .map((s) => (s === "correct" ? "\u{1F7E9}" : s === "present" ? "\u{1F7E8}" : "⬛"))
          .join("")
      )
      .join("\n");
    const attempts = state.won ? `${state.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
    const heading =
      state.mode === "daily"
        ? `Scordle #${dayNumber()} ${attempts} — Score: ${state.score}`
        : `Scordle (Practice) ${attempts} — Score: ${state.score}`;
    return `${heading}\n${grid}`;
  }

  shareBtn.addEventListener("click", async () => {
    const text = buildShareText();
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied results to clipboard");
    } catch (e) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        showToast("Copied results to clipboard");
      } catch (err) {
        showToast("Could not copy — long press to copy manually");
      }
      textarea.remove();
    }
  });

  // ---------- Modals ----------
  function openModal(id) {
    document.getElementById(id).classList.add("open");
  }
  function closeModal(id) {
    document.getElementById(id).classList.remove("open");
  }
  function isAnyModalOpen() {
    return !!document.querySelector(".modal-overlay.open");
  }

  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-overlay.open").forEach((m) => closeModal(m.id));
    }
  });

  rulesBtn.addEventListener("click", () => openModal("rules-modal"));
  statsBtn.addEventListener("click", () => {
    renderStats();
    openModal("stats-modal");
  });
  settingsBtn.addEventListener("click", () => {
    hardModeToggle.checked = state.hardMode;
    openModal("settings-modal");
  });
  hardModeToggle.addEventListener("change", () => {
    state.hardMode = hardModeToggle.checked;
    localStorage.setItem("scordle-hardmode", String(hardModeToggle.checked));
    renderHardBadge();
    saveDailyState();
  });

  // ---------- Stats rendering ----------
  const distChart = document.getElementById("dist-chart");
  const nextDailyWrap = document.getElementById("next-daily-wrap");
  const countdownEl = document.getElementById("countdown");
  let countdownTimer = null;

  function renderStats() {
    document.getElementById("stat-played").textContent = stats.played;
    document.getElementById("stat-winpct").textContent = stats.played
      ? Math.round((stats.won / stats.played) * 100)
      : 0;
    document.getElementById("stat-streak").textContent = stats.currentStreak;
    document.getElementById("stat-maxstreak").textContent = stats.maxStreak;
    document.getElementById("stat-avgscore").textContent = stats.scores.length
      ? Math.round(stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length)
      : 0;
    document.getElementById("stat-bestscore").textContent = stats.bestScore;

    distChart.innerHTML = "";
    const max = Math.max(1, ...stats.guessDistribution);
    stats.guessDistribution.forEach((count, i) => {
      const isCurrentWin =
        state.mode === "daily" && state.gameOver && state.won && state.guesses.length === i + 1;
      const row = document.createElement("div");
      row.className = "dist-row";
      row.innerHTML = `<span>${i + 1}</span>
        <div class="dist-bar-wrap">
          <div class="dist-bar${isCurrentWin ? " highlight" : ""}" style="width:${Math.max(
        8,
        (count / max) * 100
      )}%">${count}</div>
        </div>`;
      distChart.appendChild(row);
    });

    nextDailyWrap.hidden = false;
    startCountdown();
  }

  function startCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    function tick() {
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const diff = nextMidnight - now;
      const h = String(Math.floor(diff / 3600000)).padStart(2, "0");
      const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
      const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
      countdownEl.textContent = `${h}:${m}:${s}`;
    }
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  // ---------- Mode switching ----------
  modeDailyBtn.addEventListener("click", () => {
    if (state.mode === "daily") return;
    startGame("daily");
  });
  modePracticeBtn.addEventListener("click", () => {
    if (state.mode === "practice") return;
    startGame("practice");
  });

  // ---------- Init ----------
  buildKeyboard();
  startGame("daily");

  if (state.gameOver) {
    renderScore(false);
  }
})();
