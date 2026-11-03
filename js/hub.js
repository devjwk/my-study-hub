/** @typedef {{ last: string | null, count: number }} StreakState */

const REVIEW_KEY = "learning-review-v1";
const FOCUS_KEY = "learning-focus-v1";
const REFLECT_KEY = "learning-reflect-v1";
const CARDS_KEY = "learning-cards-v1";
const STREAK_KEY = "learning-streak-v1";
export const USER_NAME_KEY = "hub-user-name";
const BG_TINT_HEX_KEY = "hub-bg-tint-hex";
const BG_TINT_ALPHA_KEY = "hub-bg-tint-alpha";
const DAILY_GOAL_KEY = "hub-daily-goal";
const ACTIVITY_KEY = "learning-activity-v1";

/** Netlify 등 배포 후 전체 백업·복원(app.js)에서 사용 */
export const HUB_STORAGE_KEYS = [
  REVIEW_KEY,
  FOCUS_KEY,
  REFLECT_KEY,
  CARDS_KEY,
  STREAK_KEY,
  USER_NAME_KEY,
  BG_TINT_HEX_KEY,
  BG_TINT_ALPHA_KEY,
  DAILY_GOAL_KEY,
  ACTIVITY_KEY,
];

/** 슬라이더·색 저장값으로 베이스 배경과 원색을 color-mix (불투명) */
export function applyBackgroundTint() {
  const colorEl = document.getElementById("input-bg-tint-color");
  const rangeEl = document.getElementById("input-bg-tint-alpha");
  let hex =
    colorEl instanceof HTMLInputElement ? colorEl.value : localStorage.getItem(BG_TINT_HEX_KEY) || "#0f7d56";
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) hex = "#0f7d56";
  let strengthPct = 0;
  if (rangeEl instanceof HTMLInputElement) strengthPct = parseInt(rangeEl.value, 10) || 0;
  else {
    const s = localStorage.getItem(BG_TINT_ALPHA_KEY);
    if (s !== null) strengthPct = Math.min(40, Math.max(0, parseInt(s, 10) || 0));
  }
  const h = hex.slice(1);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((x) => Number.isNaN(x))) return;
  const root = document.documentElement;
  let mix = Math.min(42, Math.max(0, strengthPct * 0.95));
  const isDark = root.getAttribute("data-theme") === "dark";
  if (isDark) mix = Math.min(48, mix * 1.1);
  const strong = Math.min(52, mix + 11);
  const soft = Math.max(3, mix - 7);
  const corner = Math.max(2, soft - 5);
  root.style.setProperty("--bg-tint-r", String(r));
  root.style.setProperty("--bg-tint-g", String(g));
  root.style.setProperty("--bg-tint-b", String(b));
  root.style.setProperty("--bg-tint-mix", `${mix.toFixed(1)}%`);
  root.style.setProperty("--bg-tint-mix-strong", `${strong.toFixed(1)}%`);
  root.style.setProperty("--bg-tint-mix-soft", `${soft.toFixed(1)}%`);
  root.style.setProperty("--bg-tint-mix-corner", `${corner.toFixed(1)}%`);
}

/** @typedef {{ id: string, title: string, nextReview: string }} ReviewItem */
/** @typedef {{ at: string, minutes: number, kind?: string }} FocusLog */
/** @typedef {{ id: string, at: string, level: string, note: string }} ReflectEntry */
/** @typedef {{ id: string, front: string, back: string }} CardItem */

let hubOptions = {
  onShowOrganize: () => {},
  getMilestoneCount: () => 0,
  /** @returns {{ active: number, overdue: number }} */
  getTaskSnapshot: () => ({ active: 0, overdue: 0 }),
  /** 할 일 목록 전체 비우기 (마일스톤 누적은 별도) */
  onClearAllTasks: () => {},
  /** 완료 누적(마일스톤 카운트) 0으로 */
  onResetLifetimeProgress: () => {},
  /** localStorage 테마 키 제거 후 UI 반영 */
  onResetTheme: () => {},
};

/** 홈 지표: 시계와 함께 가끔만 갱신 (체류 중에도 대략 최신) */
let lastHomeStatsAt = 0;

function dailyGoal() {
  return clampInt(10, 900, localStorage.getItem(DAILY_GOAL_KEY) || 120);
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function todayYMD(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function yesterdayYMD() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function loadStreak() {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (!raw) return { last: null, count: 0 };
    const o = JSON.parse(raw);
    return {
      last: typeof o.last === "string" ? o.last : null,
      count: typeof o.count === "number" && o.count >= 0 ? o.count : 0,
    };
  } catch {
    return { last: null, count: 0 };
  }
}

function saveStreak(s) {
  localStorage.setItem(STREAK_KEY, JSON.stringify(s));
}

/** @returns {Record<string, number>} 날짜(YYYY-MM-DD)별 활동 횟수 */
function loadActivity() {
  try {
    const o = JSON.parse(localStorage.getItem(ACTIVITY_KEY) || "{}");
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

/** 오늘 활동 +1, 오늘 첫 활동이면 연속일 +1 */
export function recordStudyDay() {
  const t = todayYMD();
  const activity = loadActivity();
  activity[t] = (Number(activity[t]) || 0) + 1;
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activity));
  const s = loadStreak();
  if (s.last === t) return;
  const y = yesterdayYMD();
  if (s.last === y) s.count += 1;
  else s.count = 1;
  s.last = t;
  saveStreak(s);
  renderHabitView();
  if (document.getElementById("view-home")?.classList.contains("view--active")) renderHomeStats();
}

function loadReview() {
  try {
    const raw = localStorage.getItem(REVIEW_KEY);
    if (!raw) return [];
    const d = JSON.parse(raw);
    return Array.isArray(d.items) ? d.items : [];
  } catch {
    return [];
  }
}

function saveReview(items) {
  localStorage.setItem(REVIEW_KEY, JSON.stringify({ items }));
}

function clampInt(min, max, v) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function createDefaultFocusStore() {
  return {
    logs: [],
    settings: { work: 25, shortBreak: 5, longBreak: 15, interval: 4 },
    prefs: { autoStart: false, sound: true },
  };
}

/** @param {unknown} x */
function normalizeFocusLog(x) {
  if (!x || typeof x !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (x);
  const at = typeof o.at === "string" ? o.at : new Date().toISOString();
  const minutes = Math.max(0, Math.floor(Number(o.minutes) || 0));
  const kind = o.kind === "short" || o.kind === "long" ? o.kind : "work";
  return { at, minutes, kind, taskId: o.taskId, taskTitle: o.taskTitle, sessionId: o.sessionId };
}

function loadFocusStore() {
  try {
    const raw = localStorage.getItem(FOCUS_KEY);
    if (!raw) return createDefaultFocusStore();
    const d = JSON.parse(raw);
    if (Array.isArray(d)) return { ...createDefaultFocusStore(), logs: d.map(normalizeFocusLog).filter(Boolean) };
    const logs = Array.isArray(d.logs) ? d.logs.map(normalizeFocusLog).filter(Boolean) : [];
    const defs = createDefaultFocusStore();
    const settings = {
      work: clampInt(1, 180, d.settings?.work ?? defs.settings.work),
      shortBreak: clampInt(1, 60, d.settings?.shortBreak ?? defs.settings.shortBreak),
      longBreak: clampInt(1, 60, d.settings?.longBreak ?? defs.settings.longBreak),
      interval: clampInt(1, 12, d.settings?.interval ?? defs.settings.interval),
    };
    const prefs = {
      autoStart: Boolean(d.prefs?.autoStart),
      sound: d.prefs?.sound !== false,
    };
    return { logs, settings, prefs, session: d.session, scene: d.scene === "studio" ? "studio" : "library" };
  } catch {
    return createDefaultFocusStore();
  }
}

function saveFocusStore(store) {
  localStorage.setItem(FOCUS_KEY, JSON.stringify(store));
}

function loadFocusLogs() {
  return loadFocusStore().logs;
}

function loadReflect() {
  try {
    const raw = localStorage.getItem(REFLECT_KEY);
    if (!raw) return [];
    const d = JSON.parse(raw);
    return Array.isArray(d.entries) ? d.entries : [];
  } catch {
    return [];
  }
}

function saveReflect(entries) {
  localStorage.setItem(REFLECT_KEY, JSON.stringify({ entries }));
}

function loadCards() {
  try {
    const raw = localStorage.getItem(CARDS_KEY);
    if (!raw) return [];
    const d = JSON.parse(raw);
    return Array.isArray(d.cards) ? d.cards : [];
  } catch {
    return [];
  }
}

function saveCards(cards) {
  localStorage.setItem(CARDS_KEY, JSON.stringify({ cards }));
}

function addDaysIso(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function renderReview() {
  const ul = document.getElementById("list-review");
  if (!ul) return;
  let items = loadReview();
  const now = Date.now();
  items = [...items].sort((a, b) => new Date(a.nextReview).getTime() - new Date(b.nextReview).getTime());
  ul.innerHTML = "";
  for (const it of items) {
    const due = new Date(it.nextReview).getTime() <= now;
    const li = document.createElement("li");
    li.className = "learning-row" + (due ? " learning-row--due" : "");
    const when = new Date(it.nextReview).toLocaleString("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    li.innerHTML = `
      <div class="learning-row__main">
        <strong class="learning-row__title"></strong>
        <span class="learning-row__meta">${due ? "오늘 볼 차례" : `${when}에 다시 봐요`}</span>
      </div>
      <div class="learning-row__actions"></div>
    `;
    li.querySelector(".learning-row__title").textContent = it.title;
    const actions = li.querySelector(".learning-row__actions");
    [["easy", "쉬웠어요 · 7일 뒤", 7], ["good", "그럭저럭 · 3일 뒤", 3], ["hard", "어려웠어요 · 내일", 1]].forEach(([key, label, days]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn--sm";
      b.dataset.grade = key;
      b.textContent = label;
      b.addEventListener("click", () => {
        const next = addDaysIso(new Date().toISOString(), days);
        const list = loadReview().map((x) => (x.id === it.id ? { ...x, nextReview: next } : x));
        saveReview(list);
        recordStudyDay();
        renderReview();
      });
      actions.appendChild(b);
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn--ghost btn--sm";
    del.textContent = "지우기";
    del.addEventListener("click", () => {
      saveReview(loadReview().filter((x) => x.id !== it.id));
      renderReview();
    });
    actions.appendChild(del);
    ul.appendChild(li);
  }
  if (!items.length) {
    ul.innerHTML = `<li class="learning-empty">복습할 게 아직 없어요. 위에서 하나 추가해 보세요.</li>`;
  }
}

/** @typedef {"work" | "short" | "long"} PomoPhase */

const ONE_MINUTE = 60;

let focusTimerId = /** @type {ReturnType<typeof setInterval> | null} */ (null);
let focusSecondsLeft = 0;
/** 현재 단계 길이(초) — 링·로그 분 계산용 */
let focusChunkTotalSeconds = 25 * ONE_MINUTE;
/** @type {PomoPhase} */
let pomoPhase = "work";
/** 긴 휴식 주기 안에서 완료한 집중 횟수 */
let pomoCompletedWorkInSet = 0;
/** @type {ReturnType<typeof setTimeout> | null} */
let pomoToastTimerId = null;

let sessionId = uid();
let deadline = 0;
let focusTask = null;

function snapshot() {
  return { id: sessionId, phase: pomoPhase, total: focusChunkTotalSeconds, left: focusSecondsLeft,
    deadline, rounds: pomoCompletedWorkInSet, task: focusTask };
}

function saveSession() {
  const store = loadFocusStore();
  store.session = snapshot();
  saveFocusStore(store);
}

function restoreSession() {
  const store = loadFocusStore();
  const state = store.session;
  stopFocusTimer();
  const valid = state && ["work", "short", "long"].includes(state.phase) &&
    Number.isFinite(state.total) && state.total > 0 && Number.isFinite(state.left);
  sessionId = valid ? state.id : uid();
  pomoPhase = valid ? state.phase : "work";
  focusChunkTotalSeconds = valid ? state.total : durationForPhase("work");
  focusSecondsLeft = valid ? state.left : focusChunkTotalSeconds;
  deadline = valid && Number.isFinite(state.deadline) ? state.deadline : 0;
  focusTask = valid ? state.task : null;
  pomoCompletedWorkInSet = valid ? state.rounds || 0 : 0;
  document.body.dataset.room = store.scene || "library";
  pomodoroEl("room-choice").value = document.body.dataset.room;
  if (deadline) {
    focusTimerId = setInterval(tick, 500);
    tick();
  }
  setFocusDisplayTime(focusSecondsLeft);
  syncPomodoroChrome();
}

function setRoom(open) {
  pomodoroEl("view-focus").classList.toggle("immersed", open);
  pomodoroEl("room-toggle").textContent = open ? "원래대로 보기" : "화면 가득 보기";
  pomodoroEl("room-toggle").setAttribute("aria-pressed", String(open));
}

export function startTaskFocus(task) {
  const changing = focusTask?.id !== task?.id;
  if (changing && (deadline || focusSecondsLeft < focusChunkTotalSeconds) &&
      !confirm("지금 타이머를 멈추고 다른 일로 바꿀까요?")) return;
  showView("focus");
  if (changing) {
    stopFocusTimer();
    deadline = 0;
    focusTask = task ? { id: task.id, title: task.title } : null;
    applyPhase("work");
  }
  if (!focusTimerId) startPomodoroTick();
  setRoom(true);
}

export function taskProgress(task, logs = loadFocusLogs()) {
  const entries = logs.filter(log => log.kind === "work" && log.taskId === task.id);
  const minutes = entries.reduce((sum, log) => sum + log.minutes, 0);
  return `집중 ${entries.length}/${task.goal}번` + (minutes ? ` · ${minutes}분` : "");
}

function pomodoroEl(id) {
  return document.getElementById(id);
}

function setFocusDisplayTime(totalSec) {
  const el = pomodoroEl("focus-display");
  if (!el) return;
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rs = s % 60;
  el.textContent = h > 0 ? `${h}:${pad2(m)}:${pad2(rs)}` : `${m}:${pad2(rs)}`;
}

function stopFocusTimer() {
  if (focusTimerId) clearInterval(focusTimerId);
  focusTimerId = null;
}

function getPomodoroDurationsSec() {
  const st = loadFocusStore().settings;
  return {
    work: st.work * ONE_MINUTE,
    short: st.shortBreak * ONE_MINUTE,
    long: st.longBreak * ONE_MINUTE,
    interval: st.interval,
  };
}

function durationForPhase(phase) {
  const d = getPomodoroDurationsSec();
  if (phase === "work") return d.work;
  if (phase === "short") return d.short;
  return d.long;
}

function pomoToast(message, kind = "neutral") {
  const el = pomodoroEl("pomo-toast");
  if (!el) return;
  if (pomoToastTimerId) clearTimeout(pomoToastTimerId);
  el.textContent = message;
  el.hidden = false;
  el.dataset.kind = kind;
  pomoToastTimerId = setTimeout(() => {
    el.hidden = true;
    pomoToastTimerId = null;
  }, 2800);
}

function playPomodoroBeep() {
  if (!loadFocusStore().prefs.sound) return;
  try {
    const AC = window.AudioContext || /** @type {typeof window} */ (window).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.4);
    setTimeout(() => ctx.close(), 500);
  } catch {
    /* ignore */
  }
}

function syncPomodoroChrome() {
  pomodoroEl("room-task").textContent = focusTask?.title || "자유롭게 집중";
  pomodoroEl("unlink-task").hidden = !focusTask;
  const phaseEl = pomodoroEl("pomo-phase-label");
  const roundEl = pomodoroEl("pomo-round-label");
  const hintEl = pomodoroEl("pomo-hint");
  const store = loadFocusStore();
  const interval = store.settings.interval;

  if (phaseEl) {
    if (pomoPhase === "work") phaseEl.textContent = "집중";
    else if (pomoPhase === "short") phaseEl.textContent = "짧게 쉬는 중";
    else phaseEl.textContent = "길게 쉬는 중";
  }

  if (roundEl) {
    if (pomoPhase === "work") {
      const untilLong = interval - (pomoCompletedWorkInSet % interval);
      roundEl.textContent = `${pomoCompletedWorkInSet % interval + 1}번째 · 길게 쉬기까지 ${untilLong}번 남음`;
    } else if (pomoPhase === "short") {
      roundEl.textContent = "쉬고 나면 다시 집중해요";
    } else {
      roundEl.textContent = `${interval}번 집중했으니 푹 쉬어요`;
    }
  }

  if (hintEl) {
    hintEl.textContent = "Space 시작·멈춤 · S 넘기기 · R 처음부터";
  }

  const bar = pomodoroEl("pomo-bar");
  if (bar) {
    const total = Math.max(1, focusChunkTotalSeconds);
    bar.style.width = `${100 * (1 - Math.max(0, focusSecondsLeft) / total)}%`;
  }

  document.querySelectorAll("[data-pomo-mode]").forEach((btn) => {
    const m = /** @type {HTMLElement} */ (btn).dataset.pomoMode;
    const on = m === pomoPhase;
    btn.classList.toggle("is-active", on);
    if (btn instanceof HTMLElement && "disabled" in btn) {
      /** @type {HTMLButtonElement} */ (btn).disabled = focusTimerId !== null;
    }
    if (btn.getAttribute("role") === "tab") btn.setAttribute("aria-selected", on ? "true" : "false");
  });

  const startBtn = pomodoroEl("btn-pomo-start");
  const pauseBtn = pomodoroEl("btn-pomo-pause");
  if (startBtn) startBtn.hidden = focusTimerId !== null;
  if (pauseBtn) pauseBtn.hidden = focusTimerId === null;
}

function applyPhase(phase, persist = true) {
  deadline = 0;
  sessionId = uid();
  pomoPhase = phase;
  focusChunkTotalSeconds = durationForPhase(phase);
  focusSecondsLeft = focusChunkTotalSeconds;
  if (persist) saveSession();
  setFocusDisplayTime(focusSecondsLeft);
  syncPomodoroChrome();
}

function scheduleAutoStartNext() {
  const { autoStart } = loadFocusStore().prefs;
  if (!autoStart) {
    syncPomodoroChrome();
    return;
  }
  const nextId = sessionId;
  setTimeout(() => {
    if (sessionId !== nextId) return;
    const view = pomodoroEl("view-focus");
    if (view?.classList.contains("view--active") && focusTimerId === null) startPomodoroTick();
  }, 1000);
}

function startPomodoroTick() {
  if (focusTimerId) return;
  deadline = Date.now() + focusSecondsLeft * 1000;
  saveSession();
  focusTimerId = setInterval(tick, 500);
  if (pomodoroEl("view-focus").classList.contains("view--active")) setRoom(true);
  syncPomodoroChrome();
}

function tick() {
  focusSecondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  setFocusDisplayTime(focusSecondsLeft);
  syncPomodoroChrome();
  if (focusSecondsLeft > 0) return;
  stopFocusTimer();
  const endedId = sessionId;
  const finish = () => {
    const store = loadFocusStore();
    if (store.session?.id !== endedId || !store.session.deadline || store.session.deadline > Date.now()) {
      restoreSession();
      return;
    }
    const work = pomoPhase === "work";
    const at = new Date(store.session.deadline).toISOString();
    store.logs.push({ at, minutes: Math.round(focusChunkTotalSeconds / ONE_MINUTE),
      kind: pomoPhase, sessionId: endedId, taskId: work ? focusTask?.id : null,
      taskTitle: work ? focusTask?.title : null });
    if (work) pomoCompletedWorkInSet++;
    if (pomoPhase === "long") pomoCompletedWorkInSet = 0;
    const next = !work ? "work" : pomoCompletedWorkInSet % store.settings.interval === 0 ? "long" : "short";
    applyPhase(next, false);
    store.session = snapshot();
    saveFocusStore(store);
    if (work) recordStudyDay();
    renderFocusLog();
    renderHabitView();
    renderHomeStats();
    if (pomodoroEl("view-organize").classList.contains("view--active")) hubOptions.onShowOrganize();
    playPomodoroBeep();
    pomoToast(work ? "수고했어요. 잠깐 쉬어요." : "다 쉬었어요. 다시 집중해 볼까요?", "good");
    scheduleAutoStartNext();
  };
  if (navigator.locks) navigator.locks.request("study-hub-focus-completion", finish);
  else finish();
}

function pausePomodoro() {
  if (deadline <= Date.now()) { tick(); return; }
  focusSecondsLeft = Math.ceil((deadline - Date.now()) / 1000);
  deadline = 0;
  stopFocusTimer();
  saveSession();
  setFocusDisplayTime(focusSecondsLeft);
  syncPomodoroChrome();
}

function skipPomodoroPhase() {
  stopFocusTimer();
  if (pomoPhase === "work") {
    pomoToast("이번 집중은 넘겼어요. 잠깐 쉬어요.", "neutral");
    applyPhase("short");
  } else if (pomoPhase === "long") {
    pomoCompletedWorkInSet = 0;
    pomoToast("쉬는 시간을 넘겼어요.", "neutral");
    applyPhase("work");
  } else {
    pomoToast("쉬는 시간을 넘겼어요.", "neutral");
    applyPhase("work");
  }
  scheduleAutoStartNext();
}

function resetPomodoroPhase() {
  stopFocusTimer();
  applyPhase(pomoPhase);
}

function togglePomodoroRun() {
  if (focusTimerId) pausePomodoro();
  else startPomodoroTick();
}

function hydratePomodoroForm() {
  const store = loadFocusStore();
  const w = pomodoroEl("pomo-set-work");
  const sh = pomodoroEl("pomo-set-short");
  const lo = pomodoroEl("pomo-set-long");
  const iv = pomodoroEl("pomo-set-interval");
  const a = pomodoroEl("pomo-pref-autostart");
  const snd = pomodoroEl("pomo-pref-sound");
  if (w instanceof HTMLInputElement) w.value = String(store.settings.work);
  if (sh instanceof HTMLInputElement) sh.value = String(store.settings.shortBreak);
  if (lo instanceof HTMLInputElement) lo.value = String(store.settings.longBreak);
  if (iv instanceof HTMLInputElement) iv.value = String(store.settings.interval);
  if (a instanceof HTMLInputElement) a.checked = store.prefs.autoStart;
  if (snd instanceof HTMLInputElement) snd.checked = store.prefs.sound;
}

function persistPomodoroSettingsFromInputs() {
  const store = loadFocusStore();
  const w = pomodoroEl("pomo-set-work");
  const sh = pomodoroEl("pomo-set-short");
  const lo = pomodoroEl("pomo-set-long");
  const iv = pomodoroEl("pomo-set-interval");
  store.settings.work = w instanceof HTMLInputElement ? clampInt(1, 180, w.value) : store.settings.work;
  store.settings.shortBreak = sh instanceof HTMLInputElement ? clampInt(1, 60, sh.value) : store.settings.shortBreak;
  store.settings.longBreak = lo instanceof HTMLInputElement ? clampInt(1, 60, lo.value) : store.settings.longBreak;
  store.settings.interval = iv instanceof HTMLInputElement ? clampInt(1, 12, iv.value) : store.settings.interval;
  saveFocusStore(store);
  if (!focusTimerId && focusSecondsLeft === focusChunkTotalSeconds) applyPhase(pomoPhase);
  syncPomodoroChrome();
}

function persistPomodoroPrefsFromInputs() {
  const store = loadFocusStore();
  const a = pomodoroEl("pomo-pref-autostart");
  const snd = pomodoroEl("pomo-pref-sound");
  store.prefs.autoStart = a instanceof HTMLInputElement && a.checked;
  store.prefs.sound = !(snd instanceof HTMLInputElement) || snd.checked;
  saveFocusStore(store);
}

/** localStorage 포모도로 저장값을 반영해 타이머·폼을 집중 기본값으로 맞춤 */
function hardResetPomodoroFromDisk() {
  hydratePomodoroForm();
  restoreSession();
  setRoom(false);
}

function resetReviewData() {
  if (!confirm("복습 목록을 전부 지울까요? 되돌릴 수 없어요.")) return;
  saveReview([]);
  renderReview();
  renderHomeStats();
}

function resetFocusData() {
  if (
    !confirm(
      "집중 기록과 시간·알림 설정을 처음 상태로 돌릴까요?\n돌아가던 타이머도 멈춰요.",
    )
  ) {
    return;
  }
  saveFocusStore(createDefaultFocusStore());
  hardResetPomodoroFromDisk();
  renderFocusLog();
  renderHomeStats();
}

function resetReflectData() {
  if (!confirm("회고를 전부 지울까요?")) return;
  saveReflect([]);
  renderReflect();
}

function resetCardsData() {
  if (!confirm("카드를 전부 지울까요?")) return;
  saveCards([]);
  renderCards();
  renderHomeStats();
}

function resetStreakData() {
  if (!confirm("연속 기록을 0일로 돌릴까요?")) return;
  saveStreak({ last: null, count: 0 });
  renderHabitView();
  renderHomeStats();
}

function resetHubAppearance() {
  if (!confirm("이름과 배경 색을 처음 상태로 돌릴까요?")) return;
  localStorage.removeItem(USER_NAME_KEY);
  localStorage.setItem(BG_TINT_HEX_KEY, "#0f7d56");
  localStorage.setItem(BG_TINT_ALPHA_KEY, "0");
  const nameInput = document.getElementById("input-user-name");
  if (nameInput instanceof HTMLInputElement) nameInput.value = "";
  const tintColor = document.getElementById("input-bg-tint-color");
  const tintAlpha = document.getElementById("input-bg-tint-alpha");
  if (tintColor instanceof HTMLInputElement) tintColor.value = "#0f7d56";
  if (tintAlpha instanceof HTMLInputElement) tintAlpha.value = "0";
  applyBackgroundTint();
  renderHomeStats();
}

function resetThemePreference() {
  if (!confirm("밝게·어둡게 선택을 지우고 기기 설정을 따라갈까요?")) return;
  hubOptions.onResetTheme?.();
}

function resetEntireWorkspace() {
  if (
    !confirm(
      "이 브라우저에 저장된 걸 전부 지울까요?\n\n할 일, 집중 기록, 복습, 카드, 회고, 연속 기록, 이름과 배경 설정이 모두 사라지고 되돌릴 수 없어요.\n필요하면 먼저 백업 파일을 받아두세요.",
    )
  ) {
    return;
  }
  saveReview([]);
  saveFocusStore(createDefaultFocusStore());
  hardResetPomodoroFromDisk();
  saveReflect([]);
  saveCards([]);
  saveStreak({ last: null, count: 0 });
  localStorage.removeItem(ACTIVITY_KEY);
  localStorage.removeItem(USER_NAME_KEY);
  localStorage.setItem(BG_TINT_HEX_KEY, "#0f7d56");
  localStorage.setItem(BG_TINT_ALPHA_KEY, "0");
  const nameInput = document.getElementById("input-user-name");
  if (nameInput instanceof HTMLInputElement) nameInput.value = "";
  const tintColor = document.getElementById("input-bg-tint-color");
  const tintAlpha = document.getElementById("input-bg-tint-alpha");
  if (tintColor instanceof HTMLInputElement) tintColor.value = "#0f7d56";
  if (tintAlpha instanceof HTMLInputElement) tintAlpha.value = "0";
  hubOptions.onClearAllTasks?.();
  hubOptions.onResetLifetimeProgress?.();
  hubOptions.onResetTheme?.();
  applyBackgroundTint();
  renderReview();
  renderReflect();
  renderCards();
  renderFocusLog();
  hydratePomodoroForm();
  syncPomodoroChrome();
  renderHabitView();
  renderHomeStats();
}

function clearAllTasksOnly() {
  if (
    !confirm(
      "할 일을 전부 지울까요?\n지금까지 끝낸 일 숫자는 그대로 남아요.",
    )
  ) {
    return;
  }
  hubOptions.onClearAllTasks?.();
  renderHomeStats();
}

function initDataResetControls() {
  document.getElementById("btn-reset-review-data")?.addEventListener("click", resetReviewData);
  document.getElementById("btn-reset-focus-data")?.addEventListener("click", resetFocusData);
  document.getElementById("btn-reset-reflect-data")?.addEventListener("click", resetReflectData);
  document.getElementById("btn-reset-cards-data")?.addEventListener("click", resetCardsData);
  document.getElementById("btn-reset-streak-data")?.addEventListener("click", resetStreakData);
  document.getElementById("btn-reset-hub-appearance")?.addEventListener("click", resetHubAppearance);
  document.getElementById("btn-reset-theme-stored")?.addEventListener("click", resetThemePreference);
  document.getElementById("btn-reset-all-local")?.addEventListener("click", resetEntireWorkspace);
  document.getElementById("btn-clear-all-tasks")?.addEventListener("click", clearAllTasksOnly);
}

let pomodoroListenersBound = false;

function initPomodoroUI() {
  hydratePomodoroForm();
  restoreSession();
  if (pomodoroListenersBound) return;
  pomodoroListenersBound = true;
  pomodoroEl("unlink-task").onclick = () => startTaskFocus(null);
  pomodoroEl("room-choice").onchange = e => {
    const store = loadFocusStore();
    store.scene = e.target.value;
    saveFocusStore(store);
    document.body.dataset.room = store.scene;
  };
  pomodoroEl("room-toggle").onclick = () => setRoom(!pomodoroEl("view-focus").classList.contains("immersed"));
  window.addEventListener("storage", e => {
    if (e.key !== FOCUS_KEY) return;
    restoreSession();
    hydratePomodoroForm();
    renderFocusLog();
    renderHomeStats();
  });
  pomodoroEl("resume-study").onclick = () => {
    if (loadFocusStore().session) {
      showView("focus");
      if (!focusTimerId) startPomodoroTick();
      setRoom(true);
    } else startTaskFocus(agendaTasks()[0] || null);
  };

  pomodoroEl("btn-pomo-start")?.addEventListener("click", () => startPomodoroTick());
  pomodoroEl("btn-pomo-pause")?.addEventListener("click", () => pausePomodoro());
  pomodoroEl("btn-pomo-skip")?.addEventListener("click", () => skipPomodoroPhase());
  pomodoroEl("btn-pomo-reset")?.addEventListener("click", () => resetPomodoroPhase());

  document.querySelectorAll("[data-pomo-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (focusTimerId) return;
      const m = /** @type {HTMLElement} */ (btn).dataset.pomoMode;
      if (m === "work" || m === "short" || m === "long") applyPhase(m);
    });
  });

  for (const id of ["pomo-set-work", "pomo-set-short", "pomo-set-long", "pomo-set-interval"]) {
    pomodoroEl(id)?.addEventListener("change", () => persistPomodoroSettingsFromInputs());
  }
  pomodoroEl("pomo-pref-autostart")?.addEventListener("change", () => persistPomodoroPrefsFromInputs());
  pomodoroEl("pomo-pref-sound")?.addEventListener("change", () => persistPomodoroPrefsFromInputs());

  document.addEventListener("keydown", (e) => {
    const view = pomodoroEl("view-focus");
    if (!view?.classList.contains("view--active")) return;
    const t = /** @type {HTMLElement | null} */ (e.target);
    if (t) {
      const tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") return;
      if (t.isContentEditable) return;
    }
    if (e.code === "Space") {
      e.preventDefault();
      togglePomodoroRun();
    } else if (e.key === "s" || e.key === "S") {
      if (!e.metaKey && !e.ctrlKey && !e.altKey) skipPomodoroPhase();
    } else if (e.key === "r" || e.key === "R") {
      if (!e.metaKey && !e.ctrlKey && !e.altKey) resetPomodoroPhase();
    }
  });
}

function renderFocusLog() {
  const ul = document.getElementById("list-focus-log");
  if (!ul) return;
  const logs = loadFocusLogs().slice(-20).reverse();
  ul.innerHTML = "";
  const kindLabel = (k) => {
    if (k === "short") return "짧게 쉬기";
    if (k === "long") return "길게 쉬기";
    return "집중";
  };
  for (const L of logs) {
    const li = document.createElement("li");
    li.className = "learning-log-item";
    const kind = L.kind === "short" || L.kind === "long" ? L.kind : "work";
    const when = new Date(L.at).toLocaleString("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    li.textContent = `${when} · ${L.taskTitle || kindLabel(kind)} · ${L.minutes}분`;
    ul.appendChild(li);
  }
  if (!logs.length) ul.innerHTML = `<li class="learning-empty">아직 기록이 없어요. 첫 집중을 시작해 보세요.</li>`;
}

function renderReflect() {
  const ul = document.getElementById("list-reflect");
  if (!ul) return;
  const entries = loadReflect().slice(-20).reverse();
  ul.innerHTML = "";
  for (const e of entries) {
    const li = document.createElement("li");
    li.className = "learning-panel";
    const lv = e.level === "ok" ? "잘 이해했어요" : e.level === "mid" ? "조금 헷갈려요" : "어려웠어요";
    li.innerHTML = `<p class="learning-panel__meta"><b></b><span></span></p><p class="learning-panel__body"></p>`;
    const levelEl = li.querySelector(".learning-panel__meta b");
    levelEl.textContent = lv;
    levelEl.className = `lv-${e.level}`;
    li.querySelector(".learning-panel__meta span").textContent = new Date(e.at).toLocaleString("ko-KR", {
      month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit",
    });
    li.querySelector(".learning-panel__body").textContent = e.note || "메모 없이 남겼어요.";
    ul.appendChild(li);
  }
  if (!entries.length) ul.innerHTML = `<li class="learning-empty">남긴 회고가 여기에 쌓여요.</li>`;
}

function renderCards() {
  const grid = document.getElementById("grid-cards");
  if (!grid) return;
  const cards = loadCards();
  grid.innerHTML = "";
  for (const c of cards) {
    const wrap = document.createElement("div");
    wrap.className = "flash-card";
    wrap.tabIndex = 0;
    wrap.innerHTML = `
      <div class="flash-card__inner">
        <div class="flash-card__face flash-card__front"></div>
        <div class="flash-card__face flash-card__back"></div>
      </div>
      <button type="button" class="btn btn--ghost btn--sm flash-card__del">지우기</button>
    `;
    wrap.querySelector(".flash-card__front").textContent = c.front;
    wrap.querySelector(".flash-card__back").textContent = c.back;
    wrap.addEventListener("click", (e) => {
      if ((/** @type {HTMLElement} */ (e.target)).closest(".flash-card__del")) return;
      wrap.classList.toggle("flash-card--flipped");
    });
    wrap.querySelector(".flash-card__del").addEventListener("click", (e) => {
      e.stopPropagation();
      saveCards(loadCards().filter((x) => x.id !== c.id));
      renderCards();
    });
    grid.appendChild(wrap);
  }
  if (!cards.length) {
    grid.innerHTML = `<p class="learning-empty learning-empty--block">아직 카드가 없어요. 질문과 답을 적어서 하나 만들어 보세요.</p>`;
  }
}

function todayWorkMinutes() {
  const logs = loadFocusLogs();
  const t = todayYMD();
  let min = 0;
  for (const L of logs) {
    if (todayYMD(new Date(L.at)) !== t) continue;
    const kind = L.kind === "short" || L.kind === "long" ? L.kind : "work";
    if (kind === "work") min += L.minutes;
  }
  return min;
}

function dueReviewCount() {
  const now = Date.now();
  return loadReview().filter((x) => new Date(x.nextReview).getTime() <= now).length;
}

function agendaTasks() {
  const today = todayYMD();
  return hubOptions.getTasks().filter(t => !t.done && (!t.due || todayYMD(new Date(t.due)) <= today))
    .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || b.createdAt - a.createdAt);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value);
}

function homeGuide(today, goal, session, next) {
  const name = (localStorage.getItem(USER_NAME_KEY) || "").trim();
  const safe = name.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const hi = safe ? `${safe}님, ` : "";
  const work = loadFocusStore().settings.work;
  if (session) {
    const left = Math.ceil(focusSecondsLeft / 60);
    const what = session.task?.title ? `<em></em> ` : "";
    return { html: `${hi}${what}${session.phase === "work" ? "집중" : "쉬는 시간"}이 ${left}분 남았어요.`, task: session.task?.title };
  }
  const remain = goal - today;
  const nextPart = next ? ` 다음은 <em></em>예요.` : "";
  if (today === 0) return { html: `${hi}오늘은 아직 시작 전이에요. ${work}분만 해볼까요?${nextPart}`, task: next?.title };
  if (remain <= 0) return { html: `${hi}오늘 목표를 채웠어요. 더 해도 좋고, 여기서 쉬어도 좋아요.`, task: null };
  const rounds = Math.ceil(remain / work);
  return { html: `${hi}${remain}분만 더 하면 오늘 목표예요. ${work}분씩 ${rounds}번이면 돼요.${nextPart}`, task: next?.title };
}

function renderDesk() {
  const agenda = agendaTasks();
  const store = loadFocusStore();
  const session = store.session;
  const today = todayWorkMinutes();
  const goal = dailyGoal();

  setText("home-stat-focus", today);
  setText("home-goal", goal);
  const goalBar = document.getElementById("home-goal-bar");
  if (goalBar) goalBar.style.width = `${Math.min(100, (100 * today) / goal)}%`;

  // 문구 안의 할 일 이름은 textContent로 넣는다 (사용자 입력이라 innerHTML 금지)
  const guide = homeGuide(today, goal, session, agenda[0]);
  const guideEl = pomodoroEl("home-guide");
  if (guideEl) {
    guideEl.innerHTML = guide.html;
    const em = guideEl.querySelector("em");
    if (em) em.textContent = guide.task || "";
  }
  const nextTitle = session ? session.task?.title : agenda[0]?.title;
  pomodoroEl("resume-study").textContent = session
    ? "이어서 하기 →"
    : nextTitle ? `${nextTitle} 시작하기 →` : "집중 시작 →";

  const list = pomodoroEl("desk-tasks");
  list.replaceChildren();
  for (const task of agenda.slice(0, 5)) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "agenda-row";
    const title = document.createElement("strong");
    title.textContent = task.title;
    const progress = document.createElement("span");
    progress.textContent = taskProgress(task, store.logs);
    row.append(title, progress);
    row.setAttribute("aria-label", `${task.title} 집중 시작`);
    row.onclick = () => startTaskFocus(task);
    list.append(row);
  }
  if (!agenda.length) list.textContent = "오늘까지 할 일이 없어요. 여유로운 날이네요.";

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    const minutes = store.logs.reduce((sum, log) =>
      sum + (log.kind === "work" && todayYMD(new Date(log.at)) === todayYMD(d) ? log.minutes : 0), 0);
    return { day: i === 6 ? "오늘" : d.toLocaleDateString("ko-KR", { weekday: "short" }), minutes };
  });
  const total = days.reduce((sum, d) => sum + d.minutes, 0);
  pomodoroEl("week-total").textContent = total
    ? `${Math.floor(total / 60) ? Math.floor(total / 60) + "시간 " : ""}${total % 60}분`
    : "아직 기록 없음";
  const bars = pomodoroEl("week-bars");
  bars.replaceChildren();
  const max = Math.max(1, ...days.map((d) => d.minutes));
  for (const d of days) {
    const col = document.createElement("div");
    const bar = document.createElement("i");
    bar.style.height = Math.max(2, (124 * d.minutes) / max) + "px";
    col.append(d.minutes ? d.minutes + "분" : "–", bar, d.day);
    bars.append(col);
  }
}

function reflectThisWeek() {
  const since = new Date();
  since.setDate(since.getDate() - 6);
  const from = todayYMD(since);
  return loadReflect().filter((e) => todayYMD(new Date(e.at)) >= from).length;
}

export function renderHomeStats() {
  renderDesk();
  renderContrib("home-contrib", 53, { monthsId: "home-contrib-months", summaryId: "home-contrib-summary" });
  const store = loadFocusStore();
  setText("home-stat-streak", loadStreak().count);
  setText("home-stat-milestones", hubOptions.getMilestoneCount());
  setText("home-stat-cards", loadCards().length);
  setText("tile-reflect-num", reflectThisWeek());
  setText("tile-focus-sub", store.session
    ? `${Math.ceil(focusSecondsLeft / 60)}분 남았어요 · 이어서 하기`
    : `한 번에 ${store.settings.work}분씩`);

  const due = dueReviewCount();
  setText("home-stat-review-due", due);
  document.getElementById("home-stat-review-wrap")?.classList.toggle("stat--accent", due > 0);

  const { active, overdue } = hubOptions.getTaskSnapshot();
  setText("home-stat-tasks", active);
  document.getElementById("home-stat-tasks-wrap")?.classList.toggle("stat--accent", overdue > 0);
  const hint = document.getElementById("home-stat-tasks-hint");
  if (hint) {
    hint.hidden = overdue === 0;
    hint.textContent = overdue ? `· 마감 지남 ${overdue}` : "";
  }
}

function renderHabitView() {
  const s = loadStreak();
  setText("habit-streak", s.count);
  const extraEl = document.getElementById("habit-extra");
  if (!extraEl) return;
  const min = todayWorkMinutes();
  const done = hubOptions.getMilestoneCount();
  const lead = s.last === todayYMD()
    ? "오늘도 체크됐어요."
    : s.count ? "오늘은 아직이에요. 하나만 해도 이어져요." : "오늘부터 시작해 볼까요?";
  extraEl.innerHTML = `${lead} 오늘 <strong>${min}분</strong> 집중했고, 지금까지 할 일을 <strong>${done}개</strong> 끝냈어요.`;
  renderContrib("habit-heat", 26);
}

/** 날짜별 활동 횟수. 과거 날짜는 집중·회고 기록으로 채운다 (중복 없이 큰 쪽) */
function activityByDay() {
  const derived = new Map();
  const minutes = new Map();
  const bump = (map, key, n) => map.set(key, (map.get(key) || 0) + n);
  for (const log of loadFocusLogs()) {
    if (log.kind && log.kind !== "work") continue;
    const key = todayYMD(new Date(log.at));
    bump(derived, key, 1);
    bump(minutes, key, log.minutes);
  }
  for (const e of loadReflect()) bump(derived, todayYMD(new Date(e.at)), 1);
  const days = new Map(derived);
  for (const [key, n] of Object.entries(loadActivity())) days.set(key, Math.max(n, derived.get(key) || 0));
  return { days, minutes };
}

/**
 * GitHub 잔디처럼 최근 n주를 칠한다 (열 = 주, 일요일 시작).
 * @param {string} gridId @param {number} weeks @param {{ monthsId?: string, summaryId?: string }} [opts]
 */
function renderContrib(gridId, weeks, opts = {}) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  const { days, minutes } = activityByDay();
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - (weeks - 1) * 7);
  start.setDate(start.getDate() - start.getDay());

  const months = opts.monthsId ? document.getElementById(opts.monthsId) : null;
  if (months) {
    months.replaceChildren();
    months.style.gridTemplateColumns = `repeat(${weeks}, var(--cell))`;
  }
  grid.style.gridTemplateColumns = `repeat(${weeks}, var(--cell))`;
  grid.replaceChildren();

  let active = 0, run = 0, best = 0, col = 0, lastMonth = -1;
  for (const d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0) {
      col += 1;
      if (months && d.getMonth() !== lastMonth && col < weeks - 1) {
        const label = document.createElement("span");
        label.textContent = `${d.getMonth() + 1}월`;
        label.style.gridColumn = `${col} / span 3`;
        months.append(label);
      }
      lastMonth = d.getMonth();
    }
    const key = todayYMD(d);
    const n = days.get(key) || 0;
    const m = minutes.get(key) || 0;
    if (n) { active += 1; run += 1; best = Math.max(best, run); } else run = 0;
    const cell = document.createElement("i");
    cell.dataset.lv = n === 0 ? "0" : n === 1 ? "1" : n <= 3 ? "2" : n <= 5 ? "3" : "4";
    if (key === todayYMD()) cell.classList.add("is-today");
    const when = d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
    cell.title = n ? `${when} · ${n}번 공부${m ? ` · 집중 ${m}분` : ""}` : `${when} · 쉰 날`;
    grid.append(cell);
  }

  const summary = opts.summaryId ? document.getElementById(opts.summaryId) : null;
  if (summary) {
    summary.textContent = active
      ? `지난 1년 동안 ${active}일 공부했어요 · 가장 길게 이어간 건 ${best}일`
      : "공부한 날이 여기에 초록색으로 쌓여요.";
  }
}

function updateClock() {
  const clock = document.getElementById("home-clock");
  const dateEl = document.getElementById("home-date");
  const now = new Date();
  if (clock) {
    clock.textContent = now.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",

      hour12: false,
    });
  }
  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString("ko-KR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  const home = document.getElementById("view-home");
  if (home?.classList.contains("view--active")) {
    const t = now.getTime();
    if (t - lastHomeStatsAt >= 30_000) {
      lastHomeStatsAt = t;
      renderHomeStats();
    }
  }
}

export function showView(name) {
  document.querySelectorAll(".view").forEach((v) => {
    v.classList.toggle("view--active", v.id === `view-${name}`);
  });
  const back = document.getElementById("btn-hub-back");
  if (back) back.hidden = name === "home";
  const brand = document.getElementById("hub-brand");
  if (brand) brand.style.display = name === "home" ? "" : "none";
  if (name === "organize") hubOptions.onShowOrganize();
  if (name === "habit") renderHabitView();
  if (name === "review") renderReview();
  if (name === "focus") {
    if (!focusTimerId) hydratePomodoroForm();
    renderFocusLog();
    syncPomodoroChrome();
  }
  if (name === "reflect") renderReflect();
  if (name === "cards") renderCards();
  if (name === "home") {
    lastHomeStatsAt = Date.now();
    renderHomeStats();
  }
}

/**
 * @param {{
 *   onShowOrganize: () => void,
 *   getMilestoneCount: () => number,
 *   getTaskSnapshot?: () => { active: number, overdue: number },
 *   onClearAllTasks?: () => void,
 *   onResetLifetimeProgress?: () => void,
 *   onResetTheme?: () => void,
 * }} options
 */
export function initHub(options) {
  hubOptions = {
    getTaskSnapshot: () => ({ active: 0, overdue: 0 }),
    onClearAllTasks: () => {},
    onResetLifetimeProgress: () => {},
    onResetTheme: () => {},
    ...options,
  };

  document.querySelectorAll("[data-hub-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = btn.getAttribute("data-hub-view");
      if (v) showView(v);
    });
  });

  document.getElementById("btn-hub-back")?.addEventListener("click", () => showView("home"));

  const nameInput = document.getElementById("input-user-name");
  if (nameInput instanceof HTMLInputElement) {
    nameInput.value = localStorage.getItem(USER_NAME_KEY) || "";
    nameInput.addEventListener("input", () => {
      localStorage.setItem(USER_NAME_KEY, nameInput.value.trim().slice(0, 40));
    });
  }

  const goalInput = document.getElementById("input-daily-goal");
  if (goalInput instanceof HTMLInputElement) {
    goalInput.value = String(dailyGoal());
    goalInput.addEventListener("change", () => {
      goalInput.value = String(clampInt(10, 900, goalInput.value));
      localStorage.setItem(DAILY_GOAL_KEY, goalInput.value);
      renderHomeStats();
    });
  }

  updateClock();
  setInterval(updateClock, 1000);

  const tintColor = document.getElementById("input-bg-tint-color");
  const tintAlpha = document.getElementById("input-bg-tint-alpha");
  if (tintColor instanceof HTMLInputElement) {
    const savedHex = localStorage.getItem(BG_TINT_HEX_KEY);
    if (savedHex && /^#[0-9A-Fa-f]{6}$/.test(savedHex)) tintColor.value = savedHex;
  }
  if (tintAlpha instanceof HTMLInputElement) {
    const savedA = localStorage.getItem(BG_TINT_ALPHA_KEY);
    if (savedA !== null) {
      const n = Math.min(40, Math.max(0, parseInt(savedA, 10) || 0));
      tintAlpha.value = String(n);
    }
  }
  applyBackgroundTint();
  tintColor?.addEventListener("input", () => {
    if (tintColor instanceof HTMLInputElement) localStorage.setItem(BG_TINT_HEX_KEY, tintColor.value);
    applyBackgroundTint();
  });
  tintAlpha?.addEventListener("input", () => {
    if (tintAlpha instanceof HTMLInputElement) localStorage.setItem(BG_TINT_ALPHA_KEY, tintAlpha.value);
    applyBackgroundTint();
  });

  document.getElementById("form-review-add")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const titleIn = document.getElementById("input-review-title");
    const title = titleIn instanceof HTMLInputElement ? titleIn.value.trim() : "";
    if (!title) return;
    const daysIn = document.getElementById("input-review-first-days");
    const d =
      daysIn instanceof HTMLInputElement ? Math.max(0, parseInt(daysIn.value, 10) || 1) : 1;
    const next = addDaysIso(new Date().toISOString(), d);
    const items = loadReview();
    items.push({ id: uid(), title, nextReview: next });
    saveReview(items);
    if (titleIn instanceof HTMLInputElement) titleIn.value = "";
    renderReview();
  });

  initPomodoroUI();

  document.getElementById("form-reflect")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const noteEl = document.getElementById("input-reflect-note");
    const note = noteEl instanceof HTMLTextAreaElement ? noteEl.value.trim() : "";
    const level =
      /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="reflect-level"]:checked'))
        ?.value || "mid";
    const entries = loadReflect();
    entries.push({ id: uid(), at: new Date().toISOString(), level, note });
    saveReflect(entries);
    if (noteEl instanceof HTMLTextAreaElement) noteEl.value = "";
    renderReflect();
    recordStudyDay();
  });

  document.getElementById("form-card-add")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = document.getElementById("input-card-front");
    const b = document.getElementById("input-card-back");
    const front = f instanceof HTMLInputElement ? f.value.trim() : "";
    const back = b instanceof HTMLInputElement ? b.value.trim() : "";
    if (!front || !back) return;
    const cards = loadCards();
    cards.push({ id: uid(), front, back });
    saveCards(cards);
    if (f instanceof HTMLInputElement) f.value = "";
    if (b instanceof HTMLInputElement) b.value = "";
    renderCards();
  });

  document.getElementById("btn-habit-checkin")?.addEventListener("click", () => {
    recordStudyDay();
    alert("오늘 공부한 걸로 체크했어요.");
    renderHabitView();
  });

  initDataResetControls();
  initHubSettingsDock();
}

function initHubSettingsDock() {
  const root = document.getElementById("hub-settings-root");
  const panel = document.getElementById("hub-settings-panel");
  const toggle = document.getElementById("btn-hub-settings-toggle");
  const closeBtn = document.getElementById("btn-hub-settings-close");
  if (!root || !panel || !toggle) return;

  /** @param {boolean} open */
  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(panel.hidden);
  });
  closeBtn?.addEventListener("click", () => setOpen(false));
  document.querySelectorAll("[data-open-settings]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      setOpen(true);
    }),
  );

  document.addEventListener("click", (e) => {
    if (panel.hidden || !(e.target instanceof Node)) return;
    if (!root.contains(e.target)) setOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) setOpen(false);
  });
}
