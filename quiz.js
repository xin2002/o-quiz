const els = {
  repoSelect: document.getElementById("repoSelect"),
  loadRepoBtn: document.getElementById("loadRepoBtn"),
  fileInput: document.getElementById("fileInput"),
  startPanel: document.getElementById("startPanel"),
  bankTitle: document.getElementById("bankTitle"),
  bankDesc: document.getElementById("bankDesc"),
  bankMeta: document.getElementById("bankMeta"),
  startBtn: document.getElementById("startBtn"),
  quizPanel: document.getElementById("quizPanel"),
  progressText: document.getElementById("progressText"),
  typeText: document.getElementById("typeText"),
  stem: document.getElementById("stem"),
  answerForm: document.getElementById("answerForm"),
  answerArea: document.getElementById("answerArea"),
  submitBtn: document.getElementById("submitBtn"),
  nextBtn: document.getElementById("nextBtn"),
  feedback: document.getElementById("feedback"),
  resultPanel: document.getElementById("resultPanel"),
  scoreText: document.getElementById("scoreText"),
  detailList: document.getElementById("detailList"),
  restartBtn: document.getElementById("restartBtn"),
};

const state = {
  bank: null,
  questions: [],
  index: 0,
  submitted: false,
  results: [],
  repoBanks: [],
};

init();

function init() {
  bindEvents();
  loadRepoManifest();
}

function bindEvents() {
  els.fileInput.addEventListener("change", onFileChange);
  els.loadRepoBtn.addEventListener("click", onLoadRepoBank);
  els.startBtn.addEventListener("click", startQuiz);
  els.answerForm.addEventListener("submit", onSubmitQuestion);
  els.nextBtn.addEventListener("click", goNext);
  els.restartBtn.addEventListener("click", resetQuiz);
}

async function loadRepoManifest() {
  try {
    const resp = await fetch("./banks.json", { cache: "no-store" });
    if (!resp.ok) {
      throw new Error("manifest not found");
    }
    const data = await resp.json();
    const list = Array.isArray(data) ? data : data.banks;
    state.repoBanks = Array.isArray(list) ? list : [];
  } catch (err) {
    state.repoBanks = [
      { label: "定向运动题库", file: "定向运动题库.json" },
    ];
  }
  renderRepoOptions();
}

function renderRepoOptions() {
  els.repoSelect.innerHTML = "";
  state.repoBanks.forEach((item, idx) => {
    if (!item || typeof item.file !== "string") {
      return;
    }
    const opt = document.createElement("option");
    opt.value = item.file;
    opt.textContent = item.label || item.file;
    if (idx === 0) {
      opt.selected = true;
    }
    els.repoSelect.appendChild(opt);
  });
  els.loadRepoBtn.disabled = els.repoSelect.options.length === 0;
}

async function onLoadRepoBank() {
  const file = els.repoSelect.value;
  if (!file) {
    return;
  }
  try {
    const resp = await fetch(encodeURI(file), { cache: "no-store" });
    if (!resp.ok) {
      throw new Error(`无法加载文件：${file}`);
    }
    const text = await resp.text();
    const parsed = safeParseBank(text);
    const bank = normalizeBank(parsed);
    applyBank(bank, `仓库文件：${file}`);
  } catch (err) {
    alert(`加载失败：${err.message || "未知错误"}`);
  }
}

async function onFileChange(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) {
    return;
  }
  try {
    const text = await file.text();
    const parsed = safeParseBank(text);
    const bank = normalizeBank(parsed);
    applyBank(bank, `本地文件：${file.name}`);
  } catch (err) {
    alert(`导入失败：${err.message || "格式错误"}`);
  } finally {
    e.target.value = "";
  }
}

function applyBank(bank, sourceText) {
  state.bank = bank;
  state.questions = [];
  state.index = 0;
  state.results = [];
  state.submitted = false;

  els.bankTitle.textContent = bank.name || "未命名题库";
  els.bankDesc.textContent = `${bank.description || "无描述"} | ${sourceText}`;
  els.bankMeta.textContent = `题目数：${bank.questions.length}（开始时将随机题序与选项顺序）`;
  els.startBtn.disabled = bank.questions.length === 0;
}

function startQuiz() {
  if (!state.bank || state.bank.questions.length === 0) {
    return;
  }
  state.questions = buildShuffledQuestions(state.bank.questions);
  state.index = 0;
  state.results = [];
  state.submitted = false;

  els.startPanel.classList.add("hidden");
  els.resultPanel.classList.add("hidden");
  els.quizPanel.classList.remove("hidden");
  renderQuestion();
}

function buildShuffledQuestions(source) {
  const cloned = source.map((q) => cloneQuestion(q));
  cloned.forEach((q) => {
    if (q.type === "single" || q.type === "multiple") {
      shuffleInPlace(q.options);
    }
  });
  shuffleInPlace(cloned);
  return cloned;
}

function cloneQuestion(q) {
  return {
    id: q.id,
    type: q.type,
    stemHtml: q.stemHtml,
    options: Array.isArray(q.options)
      ? q.options.map((op) => ({
          id: op.id,
          textHtml: op.textHtml,
          isCorrect: Boolean(op.isCorrect),
        }))
      : [],
    answers: Array.isArray(q.answers) ? [...q.answers] : [],
    answer: typeof q.answer === "boolean" ? q.answer : null,
    answerText: typeof q.answerText === "string" ? q.answerText : "",
  };
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function renderQuestion() {
  const q = state.questions[state.index];
  if (!q) {
    showResult();
    return;
  }

  state.submitted = false;
  els.progressText.textContent = `第 ${state.index + 1} / ${state.questions.length} 题`;
  els.typeText.textContent = typeText(q.type);
  els.stem.innerHTML = q.stemHtml || "(未设置题干)";
  els.answerArea.innerHTML = "";
  els.feedback.className = "feedback hidden";
  els.feedback.innerHTML = "";
  els.submitBtn.classList.remove("hidden");
  els.nextBtn.classList.add("hidden");

  if (q.type === "single") {
    q.options.forEach((op, idx) => {
      const row = document.createElement("label");
      row.className = "option-row";
      row.innerHTML = `<input type="radio" name="singleAnswer" value="${op.id}" /><div class="option-html"><strong>${String.fromCharCode(65 + idx)}.</strong> ${op.textHtml || ""}</div>`;
      els.answerArea.appendChild(row);
    });
  }

  if (q.type === "multiple") {
    q.options.forEach((op, idx) => {
      const row = document.createElement("label");
      row.className = "option-row";
      row.innerHTML = `<input type="checkbox" name="multiAnswer" value="${op.id}" /><div class="option-html"><strong>${String.fromCharCode(65 + idx)}.</strong> ${op.textHtml || ""}</div>`;
      els.answerArea.appendChild(row);
    });
  }

  if (q.type === "judge") {
    [
      { v: "true", t: "正确" },
      { v: "false", t: "错误" },
    ].forEach((item) => {
      const row = document.createElement("label");
      row.className = "option-row";
      row.innerHTML = `<input type="radio" name="judgeAnswer" value="${item.v}" /><div class="option-html">${item.t}</div>`;
      els.answerArea.appendChild(row);
    });
  }

  if (q.type === "fill") {
    const count = Math.max(1, Array.isArray(q.answers) ? q.answers.length : 1);
    for (let i = 0; i < count; i += 1) {
      const wrap = document.createElement("div");
      wrap.innerHTML = `<label>填空 ${i + 1}</label><input data-fill-input type="text" />`;
      els.answerArea.appendChild(wrap);
    }
  }

  if (q.type === "short") {
    const wrap = document.createElement("div");
    wrap.innerHTML = `<label>请输入你的答案</label><textarea data-short-input rows="6"></textarea>`;
    els.answerArea.appendChild(wrap);
  }
}

function onSubmitQuestion(e) {
  e.preventDefault();
  if (state.submitted) {
    return;
  }

  const q = state.questions[state.index];
  const result = evaluateQuestion(q);
  state.results.push(result);
  state.submitted = true;

  setInputsDisabled(true);
  els.submitBtn.classList.add("hidden");
  els.nextBtn.classList.remove("hidden");

  const fb = renderFeedback(q, result);
  els.feedback.className = `feedback ${fb.level}`;
  els.feedback.innerHTML = fb.html;
}

function evaluateQuestion(q) {
  if (q.type === "single") {
    const selected = document.querySelector("input[name='singleAnswer']:checked")?.value || null;
    const correct = q.options.find((op) => op.isCorrect)?.id || null;
    return {
      correct: selected !== null && selected === correct,
      scorable: true,
      userAnswer: selected,
      correctAnswer: correct,
    };
  }

  if (q.type === "multiple") {
    const selected = new Set(Array.from(document.querySelectorAll("input[name='multiAnswer']:checked")).map((x) => x.value));
    const correct = new Set(q.options.filter((op) => op.isCorrect).map((op) => op.id));
    const ok = selected.size === correct.size && Array.from(selected).every((id) => correct.has(id));
    return {
      correct: ok,
      scorable: true,
      userAnswer: Array.from(selected),
      correctAnswer: Array.from(correct),
    };
  }

  if (q.type === "judge") {
    const selected = document.querySelector("input[name='judgeAnswer']:checked")?.value;
    const user = selected === "true" ? true : selected === "false" ? false : null;
    return {
      correct: user !== null && user === q.answer,
      scorable: true,
      userAnswer: user,
      correctAnswer: q.answer,
    };
  }

  if (q.type === "fill") {
    const userAnswers = Array.from(document.querySelectorAll("input[data-fill-input]")).map((i) => normalizeText(i.value));
    const correctAnswers = (q.answers || []).map((x) => normalizeText(x));
    const sameLength = userAnswers.length === correctAnswers.length;
    const ok = sameLength && userAnswers.every((v, idx) => v === correctAnswers[idx]);
    return {
      correct: ok,
      scorable: true,
      userAnswer: userAnswers,
      correctAnswer: correctAnswers,
    };
  }

  const userText = normalizeText(document.querySelector("textarea[data-short-input]")?.value || "");
  return {
    correct: null,
    scorable: false,
    userAnswer: userText,
    correctAnswer: q.answerText || "",
  };
}

function renderFeedback(q, result) {
  if (!result.scorable) {
    return {
      level: "neutral",
      html: `已提交（简答题不自动计分）<br/>参考答案：${escapeHtml(result.correctAnswer || "无")}`,
    };
  }

  if (result.correct) {
    return {
      level: "ok",
      html: `回答正确。<br/>正确答案：${formatCorrectAnswer(q)}`,
    };
  }

  return {
    level: "bad",
    html: `回答错误。<br/>正确答案：${formatCorrectAnswer(q)}`,
  };
}

function formatCorrectAnswer(q) {
  if (q.type === "single" || q.type === "multiple") {
    const labels = q.options
      .map((op, idx) => ({ op, label: String.fromCharCode(65 + idx) }))
      .filter((item) => item.op.isCorrect)
      .map((item) => item.label);
    return labels.join("、") || "无";
  }

  if (q.type === "judge") {
    return q.answer === true ? "正确" : q.answer === false ? "错误" : "无";
  }

  if (q.type === "fill") {
    return (q.answers || []).map((x) => escapeHtml(x)).join(" / ") || "无";
  }

  return escapeHtml(q.answerText || "无");
}

function goNext() {
  state.index += 1;
  if (state.index >= state.questions.length) {
    showResult();
    return;
  }
  renderQuestion();
}

function showResult() {
  els.quizPanel.classList.add("hidden");
  els.resultPanel.classList.remove("hidden");

  const scored = state.results.filter((r) => r && r.scorable);
  const correct = scored.filter((r) => r.correct).length;
  const total = scored.length;
  const percent = total > 0 ? ((correct / total) * 100).toFixed(1) : "0.0";

  els.scoreText.textContent = `成绩：${correct} / ${total}（${percent}%）`;

  els.detailList.innerHTML = "";
  state.questions.forEach((q, idx) => {
    const r = state.results[idx];
    const item = document.createElement("div");
    item.className = "detail-item";
    const status = !r ? "未作答" : !r.scorable ? "未计分" : r.correct ? "正确" : "错误";
    item.innerHTML = `第 ${idx + 1} 题（${typeText(q.type)}）：${status}`;
    els.detailList.appendChild(item);
  });
}

function resetQuiz() {
  els.resultPanel.classList.add("hidden");
  els.startPanel.classList.remove("hidden");
}

function setInputsDisabled(disabled) {
  els.answerArea.querySelectorAll("input,textarea").forEach((el) => {
    el.disabled = disabled;
  });
}

function safeParseBank(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed.bank || parsed;
  } catch (err) {
    const repaired = repairBrokenJsonText(text);
    const parsed = JSON.parse(repaired);
    return parsed.bank || parsed;
  }
}

function normalizeBank(input) {
  const bank = {
    name: typeof input?.name === "string" ? input.name : "",
    description: typeof input?.description === "string" ? input.description : "",
    questions: [],
  };

  const list = Array.isArray(input?.questions) ? input.questions : [];
  bank.questions = list
    .filter((q) => q && typeof q === "object")
    .map((q) => {
      const type = ["single", "multiple", "fill", "short", "judge"].includes(q.type) ? q.type : "single";
      const options = Array.isArray(q.options)
        ? q.options.map((op) => ({
            id: typeof op.id === "string" ? op.id : uid(),
            textHtml: typeof op.textHtml === "string" ? op.textHtml : "",
            isCorrect: Boolean(op.isCorrect),
          }))
        : [];

      const answers = Array.isArray(q.answers) ? q.answers.filter((x) => typeof x === "string") : [];

      return {
        id: typeof q.id === "string" ? q.id : uid(),
        type,
        stemHtml: typeof q.stemHtml === "string" ? q.stemHtml : "",
        options,
        answers,
        answer: typeof q.answer === "boolean" ? q.answer : null,
        answerText: typeof q.answerText === "string" ? q.answerText : "",
      };
    });

  return bank;
}

function repairBrokenJsonText(text) {
  const lines = text.split(/\r?\n/);
  const repaired = lines.map((line) => {
    if (!line.includes('"stemHtml"') && !line.includes('"textHtml"')) {
      return line;
    }
    if (!line.trimEnd().endsWith(",")) {
      return line;
    }
    const quoteCount = (line.match(/"/g) || []).length;
    if (quoteCount % 2 === 1) {
      return line.replace(/,\s*$/, '\",');
    }
    return line;
  });
  return repaired.join("\n");
}

function normalizeText(str) {
  return String(str || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function typeText(type) {
  return {
    single: "单选题",
    multiple: "多选题",
    fill: "填空题",
    short: "简答题",
    judge: "判断题",
  }[type] || type;
}

function uid() {
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
