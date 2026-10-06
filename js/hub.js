/** @typedef {{ last: string | null, count: number }} StreakState */

const REVIEW_KEY = "learning-review-v1";
const FOCUS_KEY = "learning-focus-v1";
const REFLECT_KEY = "learning-reflect-v1";
const CARDS_KEY = "learning-cards-v1";
const STREAK_KEY = "learning-streak-v1";
export const USER_NAME_KEY = "hub-user-name";
const BG_TINT_HEX_KEY = "hub-bg-tint-hex";
const BG_TINT_ALPHA_KEY = "hub-bg-tint-alpha";

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
];

/** 슬라이더·색 저장값으로 베이스 배경과 원색을 color-mix (불투명) */
export function applyBackgroundTint() {
  const colorEl = document.getElementById("input-bg-tint-color");
  const rangeEl = document.getElementById("input-bg-tint-alpha");
  let hex =
    colorEl instanceof HTMLInputElement ? colorEl.value : localStorage.getItem(BG_TINT_HEX_KEY) || "#2563eb";
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) hex = "#2563eb";
  let strengthPct = 14;
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

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function todayYMD() {
  const d = new Date();
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

/** 오늘 첫 학습 활동 시 연속일 +1 (같은 날 중복 호출 무시) */
export function recordStudyDay() {
  const t = todayYMD();
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
  return { at, minutes, kind };
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
    return { logs, settings, prefs };
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

/** @param {{ at: string, minutes: number, kind: string }} entry */
function appendFocusLog(entry) {
  const store = loadFocusStore();
  store.logs.push(entry);
  if (store.logs.length > 200) store.logs = store.logs.slice(-200);
  saveFocusStore(store);
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
        <span class="learning-row__meta">${due ? "복습 시점 도래 · " : "다음 복습 · "}${when}</span>
      </div>
      <div class="learning-row__actions"></div>
    `;
    li.querySelector(".learning-row__title").textContent = it.title;
    const actions = li.querySelector(".learning-row__actions");
    [["easy", "쉬움 +7일", 7], ["good", "보통 +3일", 3], ["hard", "어려움 +1일", 1]].forEach(([key, label, days]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn--ghost btn--sm";
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
    del.textContent = "삭제";
    del.addEventListener("click", () => {
      saveReview(loadReview().filter((x) => x.id !== it.id));
      renderReview();
    });
    actions.appendChild(del);
    ul.appendChild(li);
  }
  if (!items.length) {
    ul.innerHTML = `<li class="learning-empty">복습 항목이 없습니다. 아래에서 추가해 보세요.</li>`;
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
  const phaseEl = pomodoroEl("pomo-phase-label");
  const roundEl = pomodoroEl("pomo-round-label");
  const hintEl = pomodoroEl("pomo-hint");
  const store = loadFocusStore();
  const interval = store.settings.interval;

  if (phaseEl) {
    if (pomoPhase === "work") phaseEl.textContent = "집중";
    else if (pomoPhase === "short") phaseEl.textContent = "짧은 휴식";
    else phaseEl.textContent = "긴 휴식";
  }

  if (roundEl) {
    if (pomoPhase === "work") {
      const untilLong = interval - (pomoCompletedWorkInSet % interval);
      roundEl.textContent = `이번 주기 · ${pomoCompletedWorkInSet + 1}번째 집중 · 긴 휴식까지 ${untilLong}회`;
    } else if (pomoPhase === "short") {
      roundEl.textContent = "짧은 휴식 후 집중으로 돌아갑니다";
    } else {
      roundEl.textContent = `${interval}회 집중 후 긴 휴식`;
    }
  }

  if (hintEl) {
    if (focusTimerId) hintEl.textContent = "진행 중…";
    else if (pomoPhase === "work") hintEl.textContent = "Space — 시작/일시 정지 · S — 건너뛰기 · R — 이 단계 리셋";
    else hintEl.textContent = "휴식 — Space — 시작/일시 정지";
  }

  const ring = /** @type {SVGCircleElement | null} */ (pomodoroEl("pomo-ring-progress"));
  if (ring) {
    const total = Math.max(1, focusChunkTotalSeconds);
    const left = Math.max(0, focusSecondsLeft);
    const rem = left / total;
    const dash = 100 * (1 - rem);
    ring.style.strokeDasharray = "100";
    ring.style.strokeDashoffset = String(dash);
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

function applyPhase(phase) {
  pomoPhase = phase;
  focusChunkTotalSeconds = durationForPhase(phase);
  focusSecondsLeft = focusChunkTotalSeconds;
  setFocusDisplayTime(focusSecondsLeft);
  syncPomodoroChrome();
}

function scheduleAutoStartNext() {
  const { autoStart } = loadFocusStore().prefs;
  if (!autoStart) {
    syncPomodoroChrome();
    return;
  }
  setTimeout(() => {
    const view = pomodoroEl("view-focus");
    if (view?.classList.contains("view--active") && focusTimerId === null) startPomodoroTick();
  }, 1000);
}

function startPomodoroTick() {
  stopFocusTimer();
  if (focusSecondsLeft <= 0) focusSecondsLeft = focusChunkTotalSeconds;
  syncPomodoroChrome();

  focusTimerId = setInterval(() => {
    focusSecondsLeft -= 1;
    setFocusDisplayTime(focusSecondsLeft);
    syncPomodoroChrome();

    if (focusSecondsLeft > 0) return;

    stopFocusTimer();
    const store = loadFocusStore();
    const chunkMin = Math.max(1, Math.round(focusChunkTotalSeconds / ONE_MINUTE));

    if (pomoPhase === "work") {
      appendFocusLog({ at: new Date().toISOString(), minutes: chunkMin, kind: "work" });
      renderFocusLog();
      renderHabitView();
      if (document.getElementById("view-home")?.classList.contains("view--active")) renderHomeStats();
      recordStudyDay();
      pomoToast("집중 완료. 휴식으로 이동합니다.", "good");
      playPomodoroBeep();
      pomoCompletedWorkInSet += 1;
      const nextLong = pomoCompletedWorkInSet % store.settings.interval === 0;
      applyPhase(nextLong ? "long" : "short");
      scheduleAutoStartNext();
      return;
    }

    appendFocusLog({
      at: new Date().toISOString(),
      minutes: chunkMin,
      kind: pomoPhase === "short" ? "short" : "long",
    });
    renderFocusLog();
    playPomodoroBeep();
    pomoToast(pomoPhase === "short" ? "짧은 휴식 끝." : "긴 휴식 끝.", "good");

    if (pomoPhase === "long") pomoCompletedWorkInSet = 0;
    applyPhase("work");
    scheduleAutoStartNext();
  }, 1000);
}

function pausePomodoro() {
  stopFocusTimer();
  syncPomodoroChrome();
}

function skipPomodoroPhase() {
  stopFocusTimer();
  if (pomoPhase === "work") {
    pomoToast("집중을 건너뛰었습니다. 짧은 휴식으로 이동합니다.", "neutral");
    applyPhase("short");
  } else if (pomoPhase === "long") {
    pomoCompletedWorkInSet = 0;
    pomoToast("긴 휴식을 건너뛰었습니다.", "neutral");
    applyPhase("work");
  } else {
    pomoToast("휴식을 건너뛰었습니다.", "neutral");
    applyPhase("work");
  }
  scheduleAutoStartNext();
}

function resetPomodoroPhase() {
  stopFocusTimer();
  focusChunkTotalSeconds = durationForPhase(pomoPhase);
  focusSecondsLeft = focusChunkTotalSeconds;
  setFocusDisplayTime(focusSecondsLeft);
  syncPomodoroChrome();
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
  if (!focusTimerId) {
    focusChunkTotalSeconds = durationForPhase(pomoPhase);
    focusSecondsLeft = focusChunkTotalSeconds;
    setFocusDisplayTime(focusSecondsLeft);
  }
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
  stopFocusTimer();
  pomoPhase = "work";
  pomoCompletedWorkInSet = 0;
  hydratePomodoroForm();
  focusChunkTotalSeconds = durationForPhase("work");
  focusSecondsLeft = focusChunkTotalSeconds;
  setFocusDisplayTime(focusSecondsLeft);
  syncPomodoroChrome();
}

function resetReviewData() {
  if (!confirm("복습 항목을 모두 삭제할까요? 되돌릴 수 없습니다.")) return;
  saveReview([]);
  renderReview();
  renderHomeStats();
}

function resetFocusData() {
  if (
    !confirm(
      "포모도로 집중 기록·시간·긴 휴식 주기·자동 시작·알림 설정을 기본값으로 초기화할까요?\n진행 중인 타이머도 멈춥니다.",
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
  if (!confirm("저장된 회고를 모두 삭제할까요?")) return;
  saveReflect([]);
  renderReflect();
}

function resetCardsData() {
  if (!confirm("플래시 카드를 모두 삭제할까요?")) return;
  saveCards([]);
  renderCards();
  renderHomeStats();
}

function resetStreakData() {
  if (!confirm("연속 학습일 기록을 초기화할까요? (0일부터 다시 셉니다.)")) return;
  saveStreak({ last: null, count: 0 });
  renderHabitView();
  renderHomeStats();
}

function resetHubAppearance() {
  if (!confirm("홈 이름·배경 색(색상·강도)을 기본값으로 되돌릴까요?")) return;
  localStorage.removeItem(USER_NAME_KEY);
  localStorage.setItem(BG_TINT_HEX_KEY, "#2563eb");
  localStorage.setItem(BG_TINT_ALPHA_KEY, "14");
  const nameInput = document.getElementById("input-user-name");
  if (nameInput instanceof HTMLInputElement) nameInput.value = "";
  const tintColor = document.getElementById("input-bg-tint-color");
  const tintAlpha = document.getElementById("input-bg-tint-alpha");
  if (tintColor instanceof HTMLInputElement) tintColor.value = "#2563eb";
  if (tintAlpha instanceof HTMLInputElement) tintAlpha.value = "14";
  applyBackgroundTint();
  renderHomeStats();
}

function resetThemePreference() {
  if (!confirm("화면 테마(라이트/다크)에 저장한 선택을 지웁니다.\n시스템 설정을 따르게 됩니다. 계속할까요?")) return;
  hubOptions.onResetTheme?.();
}

function resetEntireWorkspace() {
  if (
    !confirm(
      "이 브라우저에 저장된 데이터를 모두 지울까요?\n\n· 복습·포모도로(기록·설정)·회고·카드·연속 학습일\n· 할 일·완료 누적·마일스톤 별자리\n· 홈 이름·배경 색·테마 저장값\n\n복구할 수 없습니다.",
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
  localStorage.removeItem(USER_NAME_KEY);
  localStorage.setItem(BG_TINT_HEX_KEY, "#2563eb");
  localStorage.setItem(BG_TINT_ALPHA_KEY, "14");
  const nameInput = document.getElementById("input-user-name");
  if (nameInput instanceof HTMLInputElement) nameInput.value = "";
  const tintColor = document.getElementById("input-bg-tint-color");
  const tintAlpha = document.getElementById("input-bg-tint-alpha");
  if (tintColor instanceof HTMLInputElement) tintColor.value = "#2563eb";
  if (tintAlpha instanceof HTMLInputElement) tintAlpha.value = "14";
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
      "진행 중·완료된 할 일을 모두 삭제합니다.\n마일스톤 누적 숫자는 유지됩니다. (초기화는 상단「누적 리셋」)\n계속할까요?",
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
  focusChunkTotalSeconds = durationForPhase(pomoPhase);
  if (!focusTimerId) {
    focusSecondsLeft = focusChunkTotalSeconds;
    setFocusDisplayTime(focusSecondsLeft);
  }
  syncPomodoroChrome();

  if (pomodoroListenersBound) return;
  pomodoroListenersBound = true;

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
    if (k === "short") return "짧은 휴식";
    if (k === "long") return "긴 휴식";
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
    li.textContent = `${when} · ${kindLabel(kind)} ${L.minutes}분`;
    ul.appendChild(li);
  }
  if (!logs.length) ul.innerHTML = `<li class="learning-empty">아직 세션 기록이 없습니다.</li>`;
}

function renderReflect() {
  const ul = document.getElementById("list-reflect");
  if (!ul) return;
  const entries = loadReflect().slice(-20).reverse();
  ul.innerHTML = "";
  for (const e of entries) {
    const li = document.createElement("li");
    li.className = "learning-panel";
    const lv = e.level === "ok" ? "잘 이해함" : e.level === "mid" ? "애매함" : "어려움";
    li.innerHTML = `<p class="learning-panel__meta"></p><p class="learning-panel__body"></p>`;
    li.querySelector(".learning-panel__meta").textContent = `${new Date(e.at).toLocaleString("ko-KR")} · ${lv}`;
    li.querySelector(".learning-panel__body").textContent = e.note || "(메모 없음)";
    ul.appendChild(li);
  }
  if (!entries.length) ul.innerHTML = `<li class="learning-empty">회고를 남기면 여기에 쌓입니다.</li>`;
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
      <button type="button" class="btn btn--ghost btn--sm flash-card__del">삭제</button>
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
    grid.innerHTML = `<p class="learning-empty learning-empty--block">앞·뒤를 입력해 카드를 추가하세요. 카드를 눌러 뒤집을 수 있습니다.</p>`;
  }
}

function todayWorkMinutes() {
  const logs = loadFocusLogs();
  const t = todayYMD();
  let min = 0;
  for (const L of logs) {
    if (L.at.slice(0, 10) !== t) continue;
    const kind = L.kind === "short" || L.kind === "long" ? L.kind : "work";
    if (kind === "work") min += L.minutes;
  }
  return min;
}

function dueReviewCount() {
  const now = Date.now();
  return loadReview().filter((x) => new Date(x.nextReview).getTime() <= now).length;
}

export function renderHomeStats() {
  const streakEl = document.getElementById("home-stat-streak");
  const focusEl = document.getElementById("home-stat-focus");
  const reviewEl = document.getElementById("home-stat-review-due");
  const reviewWrap = document.getElementById("home-stat-review-wrap");
  const tasksEl = document.getElementById("home-stat-tasks");
  const tasksWrap = document.getElementById("home-stat-tasks-wrap");
  const tasksHint = document.getElementById("home-stat-tasks-hint");
  const msEl = document.getElementById("home-stat-milestones");
  const cardsEl = document.getElementById("home-stat-cards");

  if (streakEl) streakEl.textContent = String(loadStreak().count);
  if (focusEl) focusEl.textContent = String(todayWorkMinutes());

  const due = dueReviewCount();
  if (reviewEl) reviewEl.textContent = String(due);
  if (reviewWrap) reviewWrap.classList.toggle("stat--accent", due > 0);

  const { active, overdue } = hubOptions.getTaskSnapshot();
  if (tasksEl) tasksEl.textContent = String(active);
  if (tasksWrap) tasksWrap.classList.toggle("stat--accent", overdue > 0);
  if (tasksHint) {
    if (overdue > 0) {
      tasksHint.hidden = false;
      tasksHint.textContent = `기한 지남 ${overdue}건`;
    } else {
      tasksHint.hidden = true;
      tasksHint.textContent = "";
    }
  }

  if (msEl) msEl.textContent = String(hubOptions.getMilestoneCount());
  if (cardsEl) cardsEl.textContent = String(loadCards().length);
}

function renderHabitView() {
  const streakEl = document.getElementById("habit-streak");
  const extraEl = document.getElementById("habit-extra");
  if (streakEl) {
    const s = loadStreak();
    streakEl.textContent = String(s.count);
  }
  if (extraEl) {
    const min = todayWorkMinutes();
    const ms = hubOptions.getMilestoneCount();
    extraEl.innerHTML = `오늘 집중 합계: <strong>${min}분</strong> · 마일스톤 누적 완료: <strong>${ms}</strong>회`;
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
      second: "2-digit",
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
    alert("오늘 학습을 인증했습니다. 연속 기록이 갱신되었습니다.");
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

  document.addEventListener("click", (e) => {
    if (panel.hidden || !(e.target instanceof Node)) return;
    if (!root.contains(e.target)) setOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) setOpen(false);
  });
}
