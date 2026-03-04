const els = {
  bankName: document.getElementById("bankName"),
  bankDesc: document.getElementById("bankDesc"),
  newBankBtn: document.getElementById("newBankBtn"),
  bindFileBtn: document.getElementById("bindFileBtn"),
  saveBtn: document.getElementById("saveBtn"),
  exportBtn: document.getElementById("exportBtn"),
  importBtn: document.getElementById("importBtn"),
  importInput: document.getElementById("importInput"),
  statusText: document.getElementById("statusText"),
  addQuestionBtn: document.getElementById("addQuestionBtn"),
  questionList: document.getElementById("questionList"),
  emptyHint: document.getElementById("emptyHint"),
  editorContent: document.getElementById("editorContent"),
  questionType: document.getElementById("questionType"),
  deleteQuestionBtn: document.getElementById("deleteQuestionBtn"),
  stemEditor: document.getElementById("stemEditor"),
  optionSection: document.getElementById("optionSection"),
  optionList: document.getElementById("optionList"),
  addOptionBtn: document.getElementById("addOptionBtn"),
  answerSection: document.getElementById("answerSection"),
  answerEditor: document.getElementById("answerEditor"),
  editorPanel: document.getElementById("editorPanel"),
  imageInput: document.getElementById("imageInput"),
};

let state = {
  bank: createEmptyBank(),
  selectedQuestionId: null,
  dirty: false,
  imageInsertTargetId: null,
  fileHandle: null,
  fileName: "",
  autoSaveTimer: null,
  writeInProgress: false,
};

init();

function init() {
  bindEvents();
  renderAll();
  setStatus("未绑定同步文件");
}

function bindEvents() {
  els.bankName.addEventListener("input", () => {
    state.bank.name = els.bankName.value;
    markDirty();
    renderQuestionList();
  });

  els.bankDesc.addEventListener("input", () => {
    state.bank.description = els.bankDesc.value;
    markDirty();
  });

  els.newBankBtn.addEventListener("click", () => {
    const ok = confirm("确定新建题库吗？当前未保存内容会丢失。");
    if (!ok) {
      return;
    }
    state.bank = createEmptyBank();
    state.selectedQuestionId = null;
    markDirty();
    renderAll();
    setStatus("已新建空题库");
  });

  els.bindFileBtn.addEventListener("click", async () => {
    await pickSyncFile();
  });

  els.saveBtn.addEventListener("click", () => {
    saveToFile({ forcePick: true });
  });

  els.exportBtn.addEventListener("click", () => {
    exportBank();
  });

  els.importBtn.addEventListener("click", () => {
    els.importInput.click();
  });

  els.importInput.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const { bank, repaired } = parseImportedBankText(text);
      const normalized = normalizeBank(bank);
      state.bank = normalized;
      state.selectedQuestionId = normalized.questions[0]?.id || null;
      markDirty();
      renderAll();
      setStatus(repaired ? "导入成功（已自动修复部分格式问题）" : "导入成功");
    } catch (err) {
      alert(`导入失败：${err.message || "JSON 格式错误或字段不合法"}`);
    } finally {
      e.target.value = "";
    }
  });

  els.addQuestionBtn.addEventListener("click", () => {
    const q = createQuestion("single");
    state.bank.questions.push(q);
    state.selectedQuestionId = q.id;
    markDirty();
    renderAll();
  });

  els.questionType.addEventListener("change", () => {
    const q = getSelectedQuestion();
    if (!q) {
      return;
    }
    const nextType = els.questionType.value;
    migrateQuestionType(q, nextType);
    markDirty();
    renderEditor();
    renderQuestionList();
  });

  els.deleteQuestionBtn.addEventListener("click", () => {
    const q = getSelectedQuestion();
    if (!q) {
      return;
    }
    const ok = confirm("确定删除当前题目？");
    if (!ok) {
      return;
    }
    state.bank.questions = state.bank.questions.filter((item) => item.id !== q.id);
    state.selectedQuestionId = state.bank.questions[0]?.id || null;
    markDirty();
    renderAll();
  });

  els.questionList.addEventListener("click", (e) => {
    const item = e.target.closest(".question-item");
    if (!item) {
      return;
    }
    state.selectedQuestionId = item.dataset.id;
    renderAll();
  });

  els.stemEditor.addEventListener("input", () => {
    const q = getSelectedQuestion();
    if (!q) {
      return;
    }
    q.stemHtml = els.stemEditor.innerHTML;
    markDirty();
    renderQuestionList();
  });

  els.optionList.addEventListener("input", (e) => {
    const editor = e.target.closest(".option-editor");
    if (!editor) {
      return;
    }
    const q = getSelectedQuestion();
    if (!q) {
      return;
    }
    const option = q.options.find((op) => op.id === editor.dataset.optionId);
    if (!option) {
      return;
    }
    option.textHtml = editor.innerHTML;
    markDirty();
    renderQuestionList();
  });

  els.optionList.addEventListener("click", (e) => {
    const deleteBtn = e.target.closest("[data-delete-option]");
    if (deleteBtn) {
      const optionId = deleteBtn.dataset.deleteOption;
      const q = getSelectedQuestion();
      if (!q) {
        return;
      }
      if (q.options.length <= 2) {
        alert("单选/多选至少保留 2 个选项");
        return;
      }
      q.options = q.options.filter((op) => op.id !== optionId);
      if (q.type === "single" && !q.options.some((op) => op.isCorrect)) {
        q.options[0].isCorrect = true;
      }
      markDirty();
      renderEditor();
      renderQuestionList();
      return;
    }

    const imageBtn = e.target.closest("[data-insert-image-option]");
    if (imageBtn) {
      state.imageInsertTargetId = `option-editor-${imageBtn.dataset.insertImageOption}`;
      els.imageInput.click();
    }
  });

  els.addOptionBtn.addEventListener("click", () => {
    const q = getSelectedQuestion();
    if (!q || !["single", "multiple"].includes(q.type)) {
      return;
    }
    q.options.push(createOption());
    markDirty();
    renderEditor();
  });

  els.answerEditor.addEventListener("change", (e) => {
    const q = getSelectedQuestion();
    if (!q) {
      return;
    }

    if (q.type === "single") {
      const selected = els.answerEditor.querySelector("input[name='singleAnswer']:checked");
      const selectedId = selected ? selected.value : null;
      q.options.forEach((op) => {
        op.isCorrect = op.id === selectedId;
      });
    }

    if (q.type === "multiple") {
      const checkedIds = new Set(
        Array.from(els.answerEditor.querySelectorAll("input[name='multiAnswer']:checked")).map((item) => item.value)
      );
      q.options.forEach((op) => {
        op.isCorrect = checkedIds.has(op.id);
      });
    }

    if (q.type === "judge") {
      const v = els.answerEditor.querySelector("input[name='judgeAnswer']:checked")?.value;
      q.answer = v === "true" ? true : v === "false" ? false : null;
    }

    if (q.type === "fill") {
      q.answers = Array.from(els.answerEditor.querySelectorAll("input[data-fill-answer]"))
        .map((input) => input.value.trim())
        .filter(Boolean);
    }

    if (q.type === "short") {
      const ta = els.answerEditor.querySelector("textarea[data-short-answer]");
      q.answerText = ta ? ta.value : "";
    }

    markDirty();
  });

  els.answerEditor.addEventListener("input", (e) => {
    const q = getSelectedQuestion();
    if (!q) {
      return;
    }

    if (q.type === "fill") {
      q.answers = Array.from(els.answerEditor.querySelectorAll("input[data-fill-answer]"))
        .map((input) => input.value.trim())
        .filter(Boolean);
      markDirty();
    }

    if (q.type === "short") {
      const ta = e.target.closest("textarea[data-short-answer]");
      if (ta) {
        q.answerText = ta.value;
        markDirty();
      }
    }
  });

  els.answerEditor.addEventListener("click", (e) => {
    const q = getSelectedQuestion();
    if (!q || q.type !== "fill") {
      return;
    }

    const addBtn = e.target.closest("[data-add-fill]");
    if (addBtn) {
      q.answers.push("");
      markDirty();
      renderAnswerEditor();
      return;
    }

    const removeBtn = e.target.closest("[data-remove-fill]");
    if (removeBtn) {
      const idx = Number(removeBtn.dataset.removeFill);
      if (q.answers.length <= 1) {
        alert("至少保留一个填空答案项");
        return;
      }
      q.answers.splice(idx, 1);
      markDirty();
      renderAnswerEditor();
    }
  });

  els.editorPanel.addEventListener("click", (e) => {
    const button = e.target.closest("[data-insert-image='stem']");
    if (!button) {
      return;
    }
    state.imageInsertTargetId = "stemEditor";
    els.imageInput.click();
  });

  els.editorPanel.addEventListener("paste", async (e) => {
    const target = e.target.closest(".rich-editor");
    if (!target) {
      return;
    }
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (imageItems.length === 0) {
      return;
    }
    e.preventDefault();
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (!file) {
        continue;
      }
      const dataUrl = await readFileAsDataUrl(file);
      insertImageAtCursor(target, dataUrl);
    }
    syncEditorToState(target);
  });

  els.imageInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) {
      return;
    }
    const target = document.getElementById(state.imageInsertTargetId || "");
    if (!target) {
      e.target.value = "";
      return;
    }
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        continue;
      }
      const dataUrl = await readFileAsDataUrl(file);
      insertImageAtCursor(target, dataUrl);
    }
    syncEditorToState(target);
    e.target.value = "";
  });
}

function renderAll() {
  els.bankName.value = state.bank.name;
  els.bankDesc.value = state.bank.description;
  renderQuestionList();
  renderEditor();
  renderStatus();
}

function renderQuestionList() {
  els.questionList.innerHTML = "";

  state.bank.questions.forEach((q, index) => {
    const item = document.createElement("div");
    item.className = `question-item ${q.id === state.selectedQuestionId ? "active" : ""}`;
    item.dataset.id = q.id;

    const title = stripHtml(q.stemHtml).slice(0, 36) || "未填写题干";

    item.innerHTML = `
      <div class="q-title">${index + 1}. ${escapeHtml(title)}</div>
      <div class="q-meta">${typeText(q.type)} | ${q.options?.length || 0} 选项</div>
    `;

    els.questionList.appendChild(item);
  });
}

function renderEditor() {
  const q = getSelectedQuestion();
  const hasQuestion = Boolean(q);

  els.emptyHint.classList.toggle("hidden", hasQuestion);
  els.editorContent.classList.toggle("hidden", !hasQuestion);

  if (!q) {
    return;
  }

  els.questionType.value = q.type;
  els.stemEditor.innerHTML = q.stemHtml || "";

  const showOptionSection = ["single", "multiple"].includes(q.type);
  els.optionSection.classList.toggle("hidden", !showOptionSection);

  if (showOptionSection) {
    renderOptionList(q);
  }

  renderAnswerEditor();
}

function renderOptionList(q) {
  els.optionList.innerHTML = "";

  q.options.forEach((op, idx) => {
    const wrapper = document.createElement("div");
    wrapper.className = "option-item";
    wrapper.innerHTML = `
      <div class="option-head">
        <strong>选项 ${String.fromCharCode(65 + idx)}</strong>
        <div class="mini-actions">
          <button data-insert-image-option="${op.id}">插入图片</button>
          <button data-delete-option="${op.id}" class="danger">删除</button>
        </div>
      </div>
      <div id="option-editor-${op.id}" class="rich-editor option-editor" data-option-id="${op.id}" contenteditable="true">${op.textHtml || ""}</div>
    `;
    els.optionList.appendChild(wrapper);
  });
}

function renderAnswerEditor() {
  const q = getSelectedQuestion();
  if (!q) {
    return;
  }

  if (q.type === "single") {
    els.answerEditor.innerHTML = q.options
      .map((op, idx) => {
        const checked = op.isCorrect ? "checked" : "";
        return `<div class="answer-row"><label><input type="radio" name="singleAnswer" value="${op.id}" ${checked} /> ${String.fromCharCode(65 + idx)}</label></div>`;
      })
      .join("");
    return;
  }

  if (q.type === "multiple") {
    els.answerEditor.innerHTML = q.options
      .map((op, idx) => {
        const checked = op.isCorrect ? "checked" : "";
        return `<div class="answer-row"><label><input type="checkbox" name="multiAnswer" value="${op.id}" ${checked} /> ${String.fromCharCode(65 + idx)}</label></div>`;
      })
      .join("");
    return;
  }

  if (q.type === "judge") {
    els.answerEditor.innerHTML = `
      <div class="answer-row"><label><input type="radio" name="judgeAnswer" value="true" ${q.answer === true ? "checked" : ""} /> 正确</label></div>
      <div class="answer-row"><label><input type="radio" name="judgeAnswer" value="false" ${q.answer === false ? "checked" : ""} /> 错误</label></div>
    `;
    return;
  }

  if (q.type === "fill") {
    if (!Array.isArray(q.answers) || q.answers.length === 0) {
      q.answers = [""];
    }
    els.answerEditor.innerHTML = `
      ${q.answers
        .map((ans, idx) => {
          return `<div class="answer-row"><label>填空 ${idx + 1}</label><input data-fill-answer type="text" value="${escapeAttr(ans)}" /><button data-remove-fill="${idx}" class="danger">删除</button></div>`;
        })
        .join("")}
      <button data-add-fill>+ 添加填空答案</button>
    `;
    return;
  }

  els.answerEditor.innerHTML = `<textarea data-short-answer rows="5" placeholder="请输入参考答案">${escapeHtml(
    q.answerText || ""
  )}</textarea>`;
}

function migrateQuestionType(q, type) {
  const previousType = q.type;
  q.type = type;

  if (type === "single") {
    if (!Array.isArray(q.options) || q.options.length < 2) {
      q.options = [createOption(), createOption(), createOption(), createOption()];
    }
    if (previousType !== "multiple" && previousType !== "single") {
      q.options.forEach((op, idx) => {
        op.isCorrect = idx === 0;
      });
    }
    const firstCorrect = q.options.find((op) => op.isCorrect);
    q.options.forEach((op) => {
      op.isCorrect = firstCorrect ? op.id === firstCorrect.id : false;
    });
    if (!q.options.some((op) => op.isCorrect)) {
      q.options[0].isCorrect = true;
    }
    q.answers = [];
  }

  if (type === "multiple") {
    if (!Array.isArray(q.options) || q.options.length < 2) {
      q.options = [createOption(), createOption(), createOption(), createOption()];
    }
    if (previousType !== "single" && previousType !== "multiple") {
      q.options.forEach((op) => {
        op.isCorrect = false;
      });
    }
    q.answers = [];
  }

  if (type === "judge") {
    q.options = [];
    q.answers = [];
    if (typeof q.answer !== "boolean") {
      q.answer = null;
    }
  }

  if (type === "fill") {
    q.options = [];
    if (!Array.isArray(q.answers) || q.answers.length === 0) {
      q.answers = [""];
    }
    q.answerText = "";
    q.answer = null;
  }

  if (type === "short") {
    q.options = [];
    q.answers = [];
    q.answer = null;
    if (typeof q.answerText !== "string") {
      q.answerText = "";
    }
  }
}

function syncEditorToState(editorEl) {
  const q = getSelectedQuestion();
  if (!q) {
    return;
  }

  if (editorEl.id === "stemEditor") {
    q.stemHtml = editorEl.innerHTML;
    markDirty();
    renderQuestionList();
    return;
  }

  if (editorEl.classList.contains("option-editor")) {
    const optionId = editorEl.dataset.optionId;
    const option = q.options.find((op) => op.id === optionId);
    if (!option) {
      return;
    }
    option.textHtml = editorEl.innerHTML;
    markDirty();
    renderQuestionList();
  }
}

async function pickSyncFile() {
  if (!("showSaveFilePicker" in window)) {
    alert("当前浏览器不支持文件同步写入。请使用 Edge/Chrome 并通过 http(s) 打开页面。");
    return false;
  }
  try {
    const suggestedName = `${(state.bank.name || "题库").replace(/[\\/:*?\"<>|]/g, "_")}.json`;
    const handle = await window.showSaveFilePicker({
      suggestedName,
      types: [
        {
          description: "JSON 文件",
          accept: { "application/json": [".json"] },
        },
      ],
    });
    state.fileHandle = handle;
    state.fileName = handle.name || suggestedName;
    setStatus(`已绑定同步文件：${state.fileName}`);
    await saveToFile({ silentIfNoHandle: false });
    return true;
  } catch (err) {
    if (err && err.name === "AbortError") {
      return false;
    }
    console.error(err);
    alert("绑定同步文件失败，请重试。");
    return false;
  }
}

function buildSyncPayload() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    bank: state.bank,
  };
}

function scheduleAutoSave() {
  if (!state.fileHandle) {
    return;
  }
  if (state.autoSaveTimer) {
    clearTimeout(state.autoSaveTimer);
  }
  state.autoSaveTimer = setTimeout(() => {
    saveToFile({ silentIfNoHandle: true });
  }, 800);
}

async function saveToFile({ forcePick = false, silentIfNoHandle = false } = {}) {
  if (!state.fileHandle) {
    if (forcePick) {
      const picked = await pickSyncFile();
      if (!picked) {
        return;
      }
    } else if (!silentIfNoHandle) {
      setStatus("未绑定同步文件");
    }
    if (!state.fileHandle) {
      return;
    }
  }

  if (state.writeInProgress) {
    return;
  }
  state.writeInProgress = true;
  try {
    const writable = await state.fileHandle.createWritable();
    await writable.write(JSON.stringify(buildSyncPayload(), null, 2));
    await writable.close();
    state.dirty = false;
    setStatus(`已同步：${state.fileName || "题库.json"} (${new Date().toLocaleTimeString()})`);
    renderStatus();
  } catch (err) {
    console.error(err);
    if (err && err.name === "AbortError") {
      setStatus("同步已取消");
      return;
    }
    setStatus("同步失败");
    alert("同步到文件失败，请重新绑定同步文件后重试。");
  } finally {
    state.writeInProgress = false;
  }
}

function exportBank() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    bank: state.bank,
  };
  exportPayloadAsJson(payload);
  setStatus("已导出 JSON 文件");
}

function exportPayloadAsJson(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const filename = `${(state.bank.name || "题库").replace(/[\\/:*?"<>|]/g, "_")}.json`;
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function createEmptyBank() {
  return {
    id: uid(),
    name: "",
    description: "",
    questions: [],
  };
}

function createQuestion(type = "single") {
  const q = {
    id: uid(),
    type,
    stemHtml: "",
    options: [],
    answers: [],
    answer: null,
    answerText: "",
  };
  migrateQuestionType(q, type);
  return q;
}

function createOption() {
  return {
    id: uid(),
    textHtml: "",
    isCorrect: false,
  };
}

function getSelectedQuestion() {
  return state.bank.questions.find((q) => q.id === state.selectedQuestionId) || null;
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

function markDirty() {
  state.dirty = true;
  renderStatus();
  scheduleAutoSave();
}

function renderStatus() {
  if (state.dirty) {
    if (state.fileHandle) {
      els.statusText.textContent = `有未同步修改（文件：${state.fileName || "未命名.json"}）`;
    } else {
      els.statusText.textContent = "有未保存修改（未绑定同步文件）";
    }
    return;
  }
  if (!els.statusText.textContent || els.statusText.textContent === "未保存") {
    els.statusText.textContent = state.fileHandle ? `已同步到 ${state.fileName}` : "未绑定同步文件";
  }
}

function setStatus(msg) {
  els.statusText.textContent = msg;
}

function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  return (div.textContent || "").replace(/\s+/g, " ").trim();
}

function escapeHtml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/`/g, "&#96;");
}

function normalizeBank(input) {
  const bank = createEmptyBank();
  if (!input || typeof input !== "object") {
    return bank;
  }

  bank.id = typeof input.id === "string" ? input.id : uid();
  bank.name = typeof input.name === "string" ? input.name : "";
  bank.description = typeof input.description === "string" ? input.description : "";

  const qs = Array.isArray(input.questions) ? input.questions : [];
  bank.questions = qs
    .map((raw) => {
      if (!raw || typeof raw !== "object") {
        return null;
      }
      const type = ["single", "multiple", "fill", "short", "judge"].includes(raw.type) ? raw.type : "single";
      const q = createQuestion(type);
      q.id = typeof raw.id === "string" ? raw.id : uid();
      q.stemHtml = typeof raw.stemHtml === "string" ? raw.stemHtml : "";

      if (Array.isArray(raw.options)) {
        q.options = raw.options
          .filter((op) => op && typeof op === "object")
          .map((op) => ({
            id: typeof op.id === "string" ? op.id : uid(),
            textHtml: typeof op.textHtml === "string" ? op.textHtml : "",
            isCorrect: Boolean(op.isCorrect),
          }));
      }

      if (Array.isArray(raw.answers)) {
        q.answers = raw.answers.filter((x) => typeof x === "string");
      }

      q.answer = typeof raw.answer === "boolean" ? raw.answer : null;
      q.answerText = typeof raw.answerText === "string" ? raw.answerText : "";
      migrateQuestionType(q, type);

      if (["single", "multiple"].includes(type)) {
        const optionIds = new Set(q.options.map((op) => op.id));
        const rawAnswers = Array.isArray(raw.answers) ? raw.answers.filter((x) => typeof x === "string") : [];
        const legacyMatchedIds = rawAnswers
          .map((ans) => legacyAnswerToOptionId(ans, q.options))
          .filter((id) => id && optionIds.has(id));

        if (!q.options.some((op) => op.isCorrect) && legacyMatchedIds.length > 0) {
          q.options.forEach((op) => {
            op.isCorrect = legacyMatchedIds.includes(op.id);
          });
        }

        if (type === "single") {
          const firstCorrect = q.options.find((op) => op.isCorrect);
          q.options.forEach((op) => {
            op.isCorrect = firstCorrect ? op.id === firstCorrect.id : false;
          });
          if (!q.options.some((op) => op.isCorrect)) {
            q.options[0].isCorrect = true;
          }
        }
      }

      if (type === "fill") {
        q.answers = q.answers.length ? q.answers : [""];
      }

      return q;
    })
    .filter(Boolean);

  return bank;
}

function parseImportedBankText(text) {
  try {
    const parsed = JSON.parse(text);
    return { bank: parsed.bank || parsed, repaired: false };
  } catch (firstErr) {
    const repairedText = repairBrokenJsonText(text);
    try {
      const parsed = JSON.parse(repairedText);
      return { bank: parsed.bank || parsed, repaired: true };
    } catch (secondErr) {
      throw new Error("文件不是合法 JSON（常见原因：内容中有缺失引号或多余逗号）");
    }
  }
}

function repairBrokenJsonText(text) {
  const lines = text.split(/\r?\n/);
  const repaired = lines.map((line) => {
    if (!line.includes("\"stemHtml\"") && !line.includes("\"textHtml\"")) {
      return line;
    }
    if (!line.trimEnd().endsWith(",")) {
      return line;
    }
    const quoteCount = (line.match(/"/g) || []).length;
    if (quoteCount % 2 === 1) {
      return line.replace(/,\s*$/, "\",");
    }
    return line;
  });
  return repaired.join("\n");
}

function insertImageAtCursor(editorEl, src) {
  const img = document.createElement("img");
  img.src = src;
  img.alt = "插入图片";

  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    if (editorEl.contains(range.commonAncestorContainer)) {
      range.collapse(false);
      range.insertNode(img);
      range.setStartAfter(img);
      range.setEndAfter(img);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
  }

  editorEl.appendChild(img);
}

function legacyAnswerToOptionId(answer, options) {
  if (options.some((op) => op.id === answer)) {
    return answer;
  }
  const normalized = answer.trim().toUpperCase();
  const code = normalized.charCodeAt(0);
  if (normalized.length === 1 && code >= 65 && code <= 90) {
    const idx = code - 65;
    if (idx >= 0 && idx < options.length) {
      return options[idx].id;
    }
  }
  return null;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("file read error"));
    reader.readAsDataURL(file);
  });
}



