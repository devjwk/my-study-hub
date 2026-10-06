import {
  initHub,
  showView,
  recordStudyDay,
  applyBackgroundTint,
  HUB_STORAGE_KEYS,
} from "./hub.js";

const STORAGE_KEY = "my-todo-v1";
const PROGRESS_KEY = "my-todo-progress-v1";
const THEME_KEY = "my-todo-theme";

const FULL_BACKUP_KEY_SET = new Set([STORAGE_KEY, PROGRESS_KEY, THEME_KEY, ...HUB_STORAGE_KEYS]);

/** 누적 완료 횟수 목표 (할 일을 완료로 체크할 때마다 +1, 일괄 삭제해도 유지) */
const MILESTONES = [1, 5, 10, 25, 50, 100];

/** @typedef {'low'|'medium'|'high'} Priority */
/** @typedef {{ id: string, title: string, done: boolean, priority: Priority, due: string | null, tags: string[], createdAt: number }} Task */

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/** @returns {Task[]} */
function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.map(normalizeTask).filter(Boolean);
  } catch {
    return [];
  }
}

/** @param {unknown} t */
function normalizeTask(t) {
  if (!t || typeof t !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (t);
  const id = typeof o.id === "string" ? o.id : uid();
  const title = typeof o.title === "string" ? o.title.trim() : "";
  if (!title) return null;
  const done = Boolean(o.done);
  const priority =
    o.priority === "low" || o.priority === "high" || o.priority === "medium"
      ? o.priority
      : "medium";
  let due = null;
  if (typeof o.due === "string" && o.due) due = o.due;
  else if (o.due === null) due = null;
  const tags = Array.isArray(o.tags)
    ? o.tags.map(String).map((s) => s.trim()).filter(Boolean)
    : [];
  const createdAt =
    typeof o.createdAt === "number" && Number.isFinite(o.createdAt)
      ? o.createdAt
      : Date.now();
  return { id, title, done, priority, due, tags, createdAt };
}

/** @param {Task[]} tasks */
function saveTasks(tasks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return 0;
    const data = JSON.parse(raw);
    const n = data.lifetimeCompleted;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return 0;
    return Math.min(Math.floor(n), 1_000_000);
  } catch {
    return 0;
  }
}

function saveProgress() {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify({ lifetimeCompleted }));
}

/** 누적 완료 처리 횟수 (localStorage) */
let lifetimeCompleted = loadProgress();

/** @param {string} s */
function parseTags(s) {
  return s
    .split(/[,，]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** @param {Priority} p */
function priorityLabel(p) {
  if (p === "high") return "높음";
  if (p === "low") return "낮음";
  return "보통";
}

/** @param {string | null} dueIso */
function dueInfo(dueIso) {
  if (!dueIso) return { text: "", overdue: false, today: false };
  const d = new Date(dueIso);
  if (Number.isNaN(d.getTime())) return { text: "", overdue: false, today: false };
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const overdue = !Number.isNaN(d.getTime()) && d.getTime() < now.getTime();
  const today = startOfDue.getTime() === startOfToday.getTime();
  const text = d.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return { text, overdue, today };
}

/** @type {Task[]} */
let tasks = loadTasks();

/** @type {'all'|'active'|'completed'|'today'|'overdue'} */
let filterMode = "all";
let searchQuery = "";
/** @type {'created-desc'|'created-asc'|'due-asc'|'due-desc'|'priority-desc'} */
let sortMode = "created-desc";

const el = {
  formAdd: /** @type {HTMLFormElement} */ (document.getElementById("form-add")),
  inputTitle: /** @type {HTMLInputElement} */ (document.getElementById("input-title")),
  selectPriority: /** @type {HTMLSelectElement} */ (document.getElementById("select-priority")),
  inputDue: /** @type {HTMLInputElement} */ (document.getElementById("input-due")),
  inputTags: /** @type {HTMLInputElement} */ (document.getElementById("input-tags")),
  inputSearch: /** @type {HTMLInputElement} */ (document.getElementById("input-search")),
  selectSort: /** @type {HTMLSelectElement} */ (document.getElementById("select-sort")),
  taskList: /** @type {HTMLUListElement} */ (document.getElementById("task-list")),
  emptyState: /** @type {HTMLParagraphElement} */ (document.getElementById("empty-state")),
  bulkHint: /** @type {HTMLParagraphElement} */ (document.getElementById("bulk-hint")),
  btnClearDone: /** @type {HTMLButtonElement} */ (document.getElementById("btn-clear-done")),
  statTotal: document.getElementById("stat-total"),
  statActive: document.getElementById("stat-active"),
  statDone: document.getElementById("stat-done"),
  statOverdue: document.getElementById("stat-overdue"),
  btnTheme: /** @type {HTMLButtonElement} */ (document.getElementById("btn-theme")),
  btnExport: /** @type {HTMLButtonElement} */ (document.getElementById("btn-export")),
  inputImport: /** @type {HTMLInputElement} */ (document.getElementById("input-import")),
  modalEdit: /** @type {HTMLDialogElement} */ (document.getElementById("modal-edit")),
  formEdit: /** @type {HTMLFormElement} */ (document.getElementById("form-edit")),
  editId: /** @type {HTMLInputElement} */ (document.getElementById("edit-id")),
  editTitle: /** @type {HTMLInputElement} */ (document.getElementById("edit-title")),
  editPriority: /** @type {HTMLSelectElement} */ (document.getElementById("edit-priority")),
  editDue: /** @type {HTMLInputElement} */ (document.getElementById("edit-due")),
  editTags: /** @type {HTMLInputElement} */ (document.getElementById("edit-tags")),
  btnEditCancel: /** @type {HTMLButtonElement} */ (document.getElementById("btn-edit-cancel")),
  milestoneSummary: /** @type {HTMLParagraphElement | null} */ (document.getElementById("milestone-summary")),
  milestoneCount: /** @type {HTMLSpanElement | null} */ (document.getElementById("milestone-count")),
  milestoneNext: /** @type {HTMLParagraphElement | null} */ (document.getElementById("milestone-next")),
  milestoneSteps: /** @type {HTMLOListElement | null} */ (document.getElementById("milestone-steps")),
  btnMilestoneReset: /** @type {HTMLButtonElement | null} */ (document.getElementById("btn-milestone-reset")),
};

function applyTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = stored === "dark" || (stored !== "light" && prefersDark);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  document.querySelector("[data-theme-light]")?.classList.toggle("hidden", dark);
  document.querySelector("[data-theme-dark]")?.classList.toggle("hidden", !dark);
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme();
  applyBackgroundTint();
}

/** @param {Task} task */
function matchesSearch(task) {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return true;
  if (task.title.toLowerCase().includes(q)) return true;
  return task.tags.some((t) => t.toLowerCase().includes(q));
}

/** @param {Task} task */
function matchesFilter(task) {
  const info = dueInfo(task.due);
  switch (filterMode) {
    case "active":
      return !task.done;
    case "completed":
      return task.done;
    case "today":
      return info.today && !task.done;
    case "overdue":
      return info.overdue && !task.done;
    default:
      return true;
  }
}

/** @param {Task[]} list */
function sortTasks(list) {
  const copy = [...list];
  const prioVal = (/** @type {Priority} */ p) =>
    p === "high" ? 3 : p === "medium" ? 2 : 1;
  copy.sort((a, b) => {
    switch (sortMode) {
      case "created-asc":
        return a.createdAt - b.createdAt;
      case "due-asc":
        return compareDue(a, b, true);
      case "due-desc":
        return compareDue(a, b, false);
      case "priority-desc":
        return prioVal(b.priority) - prioVal(a.priority) || b.createdAt - a.createdAt;
      case "created-desc":
      default:
        return b.createdAt - a.createdAt;
    }
  });
  return copy;
}

/** @param {Task} a @param {Task} b @param {boolean} asc */
function compareDue(a, b, asc) {
  const ta = a.due ? new Date(a.due).getTime() : Infinity;
  const tb = b.due ? new Date(b.due).getTime() : Infinity;
  const va = Number.isNaN(ta) ? Infinity : ta;
  const vb = Number.isNaN(tb) ? Infinity : tb;
  const cmp = asc ? va - vb : vb - va;
  return cmp !== 0 ? cmp : b.createdAt - a.createdAt;
}

function getVisibleTasks() {
  return sortTasks(tasks.filter((t) => matchesSearch(t) && matchesFilter(t)));
}

/**
 * 별자리 선·별 상태 (마일스톤 구간 k→k+1 채움 비율)
 * @param {number} count
 * @param {number | null} next
 */
function updateConstellation(count, next) {
  const wrap = document.getElementById("milestone-constellation");
  if (wrap) {
    wrap.setAttribute(
      "aria-label",
      next != null
        ? `완료 마일스톤 별자리. 누적 ${count}개, 다음 목표 ${next}개.`
        : `완료 마일스톤 별자리. 누적 ${count}개, 기준 마일스톤을 모두 채웠습니다.`,
    );
  }

  for (let i = 0; i < MILESTONES.length; i++) {
    const node = document.getElementById(`const-star-${i}`);
    if (!node) continue;
    const m = MILESTONES[i];
    const lit = count >= m;
    const isNext = next === m;
    node.classList.toggle("constellation__node--lit", lit);
    node.classList.toggle("constellation__node--next", isNext);
    node.classList.toggle("constellation__node--pulse", isNext && !lit);
  }

  for (let k = 0; k < MILESTONES.length - 1; k++) {
    const line = document.getElementById(`const-line-${k}`);
    if (!line || !(line instanceof SVGGeometryElement)) continue;
    const len = line.getTotalLength();
    const lo = MILESTONES[k];
    const hi = MILESTONES[k + 1];
    let r = 0;
    if (count < lo) r = 0;
    else if (count >= hi) r = 1;
    else r = (count - lo) / (hi - lo);
    line.style.strokeDasharray = `${len}`;
    line.style.strokeDashoffset = `${len * (1 - r)}`;
  }
}

function updateStats() {
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const active = total - done;
  const overdue = tasks.filter((t) => !t.done && dueInfo(t.due).overdue).length;
  if (el.statTotal) el.statTotal.textContent = String(total);
  if (el.statActive) el.statActive.textContent = String(active);
  if (el.statDone) el.statDone.textContent = String(done);
  if (el.statOverdue) el.statOverdue.textContent = String(overdue);
}

function renderMilestoneTrack() {
  const count = lifetimeCompleted;
  if (el.milestoneCount) el.milestoneCount.textContent = String(count);
  if (el.btnMilestoneReset) el.btnMilestoneReset.disabled = count === 0;
  if (el.milestoneSummary) {
    el.milestoneSummary.textContent =
      count === 0
        ? "완료 체크 시 누적되고, 같은 항목에서 완료를 해제하면 누적에서 1이 줄어듭니다. 아래 별자리에 진행이 표시됩니다."
        : `지금까지 누적 완료 ${count}번입니다. 별·선은 그 진행을 따라갑니다. (완료 해제 시 1 감소)`;
  }

  const lastTarget = MILESTONES[MILESTONES.length - 1];
  const next = MILESTONES.find((m) => count < m) ?? null;

  if (next === null) {
    if (el.milestoneNext) {
      el.milestoneNext.textContent =
        count >= lastTarget
          ? `기준 마일스톤 ${lastTarget}개까지 모두 달성했습니다. 누적 ${count}개 — 별자리가 모두 빛난 상태입니다.`
          : "";
    }
  } else {
    const remain = next - count;
    if (el.milestoneNext) {
      el.milestoneNext.textContent =
        remain > 0
          ? `다음 마일스톤: ${next}개 달성까지 ${remain}번만 더 완료하면 됩니다.`
          : `다음 마일스톤: ${next}개 달성 직전입니다.`;
    }
  }

  updateConstellation(count, next);

  if (!el.milestoneSteps) return;
  el.milestoneSteps.innerHTML = "";
  for (let i = 0; i < MILESTONES.length; i++) {
    const m = MILESTONES[i];
    const li = document.createElement("li");
    li.className = "milestone-step";
    if (count >= m) li.classList.add("milestone-step--done");
    if (next !== null && m === next) li.classList.add("milestone-step--current");

    const box = document.createElement("span");
    box.className = "milestone-step__box";
    box.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "milestone-step__label";
    label.textContent = `${m}개`;

    li.appendChild(box);
    li.appendChild(label);
    li.setAttribute(
      "aria-label",
      count >= m ? `${m}개 마일스톤 달성됨` : m === next ? `현재 목표 ${m}개 마일스톤` : `${m}개 마일스톤`,
    );

    el.milestoneSteps.appendChild(li);
  }
}

function render() {
  updateStats();
  renderMilestoneTrack();
  const visible = getVisibleTasks();
  const hasCompleted = tasks.some((t) => t.done);
  el.bulkHint.hidden = !hasCompleted;
  el.emptyState.hidden = visible.length > 0;
  el.taskList.innerHTML = "";

  for (const task of visible) {
    const li = document.createElement("li");
    li.className = "task";
    if (task.done) li.classList.add("task--done");
    const info = dueInfo(task.due);
    if (info.overdue && !task.done) li.classList.add("task--overdue");

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "task__check";
    cb.checked = task.done;
    cb.setAttribute("aria-label", task.done ? "완료 취소" : "완료로 표시");
    cb.addEventListener("change", () => {
      const wasDone = task.done;
      task.done = cb.checked;
      if (task.done && !wasDone) {
        lifetimeCompleted += 1;
        saveProgress();
        recordStudyDay();
      } else if (!task.done && wasDone) {
        lifetimeCompleted = Math.max(0, lifetimeCompleted - 1);
        saveProgress();
      }
      saveTasks(tasks);
      render();
    });

    const body = document.createElement("div");
    body.className = "task__body";
    const title = document.createElement("p");
    title.className = "task__title";
    title.textContent = task.title;

    const meta = document.createElement("div");
    meta.className = "task__meta";
    const pr = document.createElement("span");
    pr.className = `badge badge--${task.priority}`;
    pr.textContent = priorityLabel(task.priority);
    meta.appendChild(pr);
    if (info.text) {
      const dueEl = document.createElement("span");
      dueEl.textContent = `마감 ${info.text}`;
      if (info.overdue && !task.done) dueEl.classList.add("task__due--overdue");
      meta.appendChild(dueEl);
    }
    for (const tag of task.tags) {
      const te = document.createElement("span");
      te.className = "tag";
      te.textContent = tag;
      meta.appendChild(te);
    }

    body.appendChild(title);
    body.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "task__actions";
    const btnEdit = document.createElement("button");
    btnEdit.type = "button";
    btnEdit.className = "btn btn--ghost";
    btnEdit.textContent = "편집";
    btnEdit.addEventListener("click", () => openEdit(task));
    const btnDel = document.createElement("button");
    btnDel.type = "button";
    btnDel.className = "btn btn--ghost";
    btnDel.textContent = "삭제";
    btnDel.addEventListener("click", () => {
      if (confirm("이 항목을 삭제할까요?")) {
        tasks = tasks.filter((x) => x.id !== task.id);
        saveTasks(tasks);
        render();
      }
    });
    actions.appendChild(btnEdit);
    actions.appendChild(btnDel);

    li.appendChild(cb);
    li.appendChild(body);
    li.appendChild(actions);
    el.taskList.appendChild(li);
  }
}

/** @param {Task} task */
function openEdit(task) {
  el.editId.value = task.id;
  el.editTitle.value = task.title;
  el.editPriority.value = task.priority;
  if (task.due) {
    el.editDue.value = toDatetimeLocalValue(task.due);
  } else {
    el.editDue.value = "";
  }
  el.editTags.value = task.tags.join(", ");
  el.modalEdit.showModal();
  el.editTitle.focus();
}

/** @param {string} iso */
function toDatetimeLocalValue(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${y}-${m}-${day}T${h}:${min}`;
}

/** @param {string} localVal */
function fromDatetimeLocal(localVal) {
  if (!localVal) return null;
  const d = new Date(localVal);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

el.formAdd.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = el.inputTitle.value.trim();
  if (!title) return;
  const task = {
    id: uid(),
    title,
    done: false,
    priority: /** @type {Priority} */ (el.selectPriority.value),
    due: fromDatetimeLocal(el.inputDue.value),
    tags: parseTags(el.inputTags.value),
    createdAt: Date.now(),
  };
  tasks.unshift(task);
  saveTasks(tasks);
  el.formAdd.reset();
  el.selectPriority.value = "medium";
  render();
  el.inputTitle.focus();
});

el.inputSearch.addEventListener("input", () => {
  searchQuery = el.inputSearch.value;
  render();
});

el.selectSort.addEventListener("change", () => {
  sortMode = /** @type {typeof sortMode} */ (el.selectSort.value);
  render();
});

document.querySelectorAll("[data-filter]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-filter]").forEach((b) => b.classList.remove("chip--active"));
    btn.classList.add("chip--active");
    filterMode = /** @type {typeof filterMode} */ (btn.getAttribute("data-filter"));
    render();
  });
});

el.btnClearDone.addEventListener("click", () => {
  if (!tasks.some((t) => t.done)) return;
  if (!confirm("완료된 항목을 모두 삭제할까요?")) return;
  tasks = tasks.filter((t) => !t.done);
  saveTasks(tasks);
  render();
});

el.formEdit.addEventListener("submit", (e) => {
  e.preventDefault();
  const id = el.editId.value;
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.title = el.editTitle.value.trim();
  task.priority = /** @type {Priority} */ (el.editPriority.value);
  task.due = fromDatetimeLocal(el.editDue.value);
  task.tags = parseTags(el.editTags.value);
  saveTasks(tasks);
  el.modalEdit.close();
  render();
});

el.btnEditCancel.addEventListener("click", () => el.modalEdit.close());

el.btnTheme.addEventListener("click", toggleTheme);

function collectStorageSlots() {
  /** @type {Record<string, string>} */
  const slots = {};
  for (const k of FULL_BACKUP_KEY_SET) {
    const v = localStorage.getItem(k);
    if (v !== null) slots[k] = v;
  }
  return slots;
}

el.btnExport.addEventListener("click", () => {
  const payload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    slots: collectStorageSlots(),
    tasks,
    lifetimeCompleted,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `study-hub-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

el.inputImport.addEventListener("change", async () => {
  const file = el.inputImport.files?.[0];
  el.inputImport.value = "";
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (data && typeof data === "object" && data.version === 2 && data.slots && typeof data.slots === "object") {
      if (
        !confirm(
          "백업 파일의 전체 데이터(이름·배경·테마·할 일·학습 탭 등)로 이 브라우저 저장소를 덮어씁니다. 계속할까요?",
        )
      ) {
        return;
      }
      for (const k of FULL_BACKUP_KEY_SET) localStorage.removeItem(k);
      for (const [k, v] of Object.entries(data.slots)) {
        if (!FULL_BACKUP_KEY_SET.has(k)) continue;
        if (v === null) localStorage.removeItem(k);
        else if (typeof v === "string") localStorage.setItem(k, v);
      }
      location.reload();
      return;
    }

    const arr = Array.isArray(data) ? data : data.tasks;
    if (!Array.isArray(arr)) throw new Error("형식 오류");
    const merged = arr.map(normalizeTask).filter(Boolean);
    if (!merged.length) {
      alert("가져올 유효한 항목이 없습니다.");
      return;
    }
    let importedLifetime = 0;
    if (!Array.isArray(data) && typeof data.lifetimeCompleted === "number" && data.lifetimeCompleted >= 0) {
      importedLifetime = Math.floor(data.lifetimeCompleted);
    }
    if (!confirm(`${merged.length}개 항목을 가져옵니다. 기존 목록과 합칠까요? (취소 시 덮어쓰기)`)) {
      tasks = merged;
      lifetimeCompleted = importedLifetime;
      saveProgress();
    } else {
      const ids = new Set(tasks.map((t) => t.id));
      for (const t of merged) {
        if (!ids.has(t.id)) {
          tasks.push(t);
          ids.add(t.id);
        }
      }
      lifetimeCompleted = Math.max(lifetimeCompleted, importedLifetime);
      saveProgress();
    }
    saveTasks(tasks);
    render();
  } catch {
    alert("파일을 읽을 수 없습니다. JSON 백업 파일인지 확인해 주세요.");
  }
});

el.btnMilestoneReset?.addEventListener("click", () => {
  if (lifetimeCompleted === 0) return;
  if (
    !confirm(
      "완료 마일스톤 누적을 0으로 초기화할까요?\n\n할 일 목록의 완료 체크는 그대로이며, 위쪽 숫자·막대·단계만 처음 상태로 돌아갑니다.",
    )
  ) {
    return;
  }
  lifetimeCompleted = 0;
  saveProgress();
  render();
});

applyTheme();
initHub({
  onShowOrganize: () => render(),
  getMilestoneCount: () => lifetimeCompleted,
  getTaskSnapshot: () => {
    const now = Date.now();
    let active = 0;
    let overdue = 0;
    for (const t of tasks) {
      if (t.done) continue;
      active += 1;
      if (t.due && new Date(t.due).getTime() < now) overdue += 1;
    }
    return { active, overdue };
  },
  onClearAllTasks: () => {
    tasks = [];
    saveTasks(tasks);
    render();
  },
  onResetLifetimeProgress: () => {
    lifetimeCompleted = 0;
    saveProgress();
    render();
  },
  onResetTheme: () => {
    localStorage.removeItem(THEME_KEY);
    applyTheme();
    applyBackgroundTint();
  },
});
showView("home");
render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
