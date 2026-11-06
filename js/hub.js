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
const BG_PHOTO_KEY = "hub-bg-photo";
const BG_PHOTO_COLOR_KEY = "hub-bg-photo-color";
/** 처음 쓰는 사람에게 깔리는 기본 배경 (Herry Sutanto, Unsplash 라이선스). color는 preparePhoto와 같은 방식으로 미리 뽑은 값 */
const DEFAULT_PHOTO = { path: "assets/bg-evening-library.jpg", color: "#973a0c" };

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
  BG_PHOTO_KEY,
  BG_PHOTO_COLOR_KEY,
];

const BASE_BG = { light: [241, 240, 236], dark: [20, 22, 21] };

function luminance([r, g, b]) {
  const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map((n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))));
}

function rgbToHsl([r, g, b]) {
  [r, g, b] = [r / 255, g / 255, b / 255];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

/**
 * 고른 색과 같은 색상(hue)으로, 배경 위에서 글자로 읽히는(대비 4.5 이상) 대표색을 만든다.
 * 라이트는 어둡게, 다크는 밝게 밝기만 옮긴다.
 * @param {number[]} rgb 고른 색 @param {number[]} bg 실제 배경 @param {boolean} dark
 */
export function accentFor(rgb, bg, dark) {
  const [h, s0, l0] = rgbToHsl(rgb);
  const s = s0 < 0.08 ? s0 : Math.max(s0, 0.38); // 회색은 회색으로 둔다
  // 먼저 테마 쪽(라이트는 어둡게, 다크는 밝게)으로, 안 되면 반대로 찾는다
  for (const step of dark ? [0.02, -0.02] : [-0.02, 0.02]) {
    for (let l = step < 0 ? Math.min(l0, 0.42) : Math.max(l0, 0.55); l > 0 && l < 1; l += step) {
      const out = hslToRgb(h, s, l);
      if (contrast(out, bg) >= 4.5) return out;
    }
  }
  return contrast([0, 0, 0], bg) > contrast([255, 255, 255], bg) ? [0, 0, 0] : [255, 255, 255];
}

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
  // 사진: 직접 고른 사진 > (아무것도 고른 적 없으면) 기본 저녁 도서관 사진 > 없음("none" 또는 색을 고른 경우)
  const stored = localStorage.getItem(BG_PHOTO_KEY);
  const usingDefault = stored === null && strengthPct === 0;
  const photo = stored && stored !== "none" ? stored : usingDefault ? new URL(DEFAULT_PHOTO.path, document.baseURI).href : null;
  root.toggleAttribute("data-photo", Boolean(photo));
  document.getElementById("btn-bg-photo-default")?.toggleAttribute("hidden", usingDefault);
  if (photo) root.style.setProperty("--photo", `url("${photo}")`);
  else root.style.removeProperty("--photo");
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

  // 대표색: 사진이 있으면 사진 색, 기본(진하기 0)이면 테마 기본 녹색, 아니면 고른 색에서 계산
  const savedColor = localStorage.getItem(BG_PHOTO_COLOR_KEY) || "";
  const photoColor = usingDefault ? DEFAULT_PHOTO.color
    : photo && /^#[0-9a-f]{6}$/i.test(savedColor) ? savedColor : null;
  if (photoColor) {
    const src = [1, 3, 5].map((i) => parseInt(photoColor.slice(i, i + 2), 16));
    // 사진 위 막(테마 바탕 55%)을 지난 실제 배경을 기준으로 대비를 맞춘다
    const base = BASE_BG[isDark ? "dark" : "light"];
    const bg = base.map((c, i) => Math.round(c + (src[i] - c) * 0.45));
    const accent = accentFor(src, bg, isDark);
    root.style.setProperty("--green", `rgb(${accent.join(" ")})`);
    const ink = [12, 26, 19];
    root.style.setProperty("--green-ink", contrast(accent, [255, 255, 255]) >= contrast(accent, ink) ? "#ffffff" : "#0c1a13");
  } else if (strengthPct === 0) {
    root.style.removeProperty("--green");
    root.style.removeProperty("--green-ink");
  } else {
    const base = BASE_BG[isDark ? "dark" : "light"];
    const bg = base.map((c, i) => Math.round(c + ([r, g, b][i] - c) * (mix / 100)));
    const accent = accentFor([r, g, b], bg, isDark);
    root.style.setProperty("--green", `rgb(${accent.join(" ")})`);
    const ink = [12, 26, 19];
    root.style.setProperty("--green-ink", contrast(accent, [255, 255, 255]) >= contrast(accent, ink) ? "#ffffff" : "#0c1a13");
  }
  syncTintSwatches(hex, strengthPct, Boolean(photo));
}

/** 고른 사진을 줄여 JPEG로 만들고, 채도가 높은 픽셀에 무게를 둔 평균색을 뽑는다 */
async function preparePhoto(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.8);

  const tiny = document.createElement("canvas");
  tiny.width = tiny.height = 32;
  const ctx = tiny.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, 32, 32);
  const px = ctx.getImageData(0, 0, 32, 32).data;
  // 색상(hue)을 12구간으로 나눠, 선명한 픽셀이 가장 많이 모인 구간의 평균색을 고른다.
  // 그냥 평균내면 파랑+주황처럼 반대 색이 섞여 회색이 되기 때문.
  const bins = Array.from({ length: 12 }, () => [0, 0, 0, 0]);
  for (let i = 0; i < px.length; i += 4) {
    const [hue, sat, light] = rgbToHsl([px[i], px[i + 1], px[i + 2]]);
    const w = sat * (1 - Math.abs(2 * light - 1));
    const bin = bins[Math.floor(hue / 30) % 12];
    bin[0] += px[i] * w; bin[1] += px[i + 1] * w; bin[2] += px[i + 2] * w; bin[3] += w;
  }
  const best = bins.reduce((a, b) => (b[3] > a[3] ? b : a));
  const color = best[3] > 0
    ? "#" + best.slice(0, 3).map((v) => Math.round(v / best[3]).toString(16).padStart(2, "0")).join("")
    : "#808080";
  return { dataUrl, color };
}

/** 사진 끄기: 기본 사진도 다시 깔리지 않게 "none"으로 남긴다 */
function clearPhoto() {
  localStorage.setItem(BG_PHOTO_KEY, "none");
  localStorage.removeItem(BG_PHOTO_COLOR_KEY);
}

/** 처음 상태로: 기본 저녁 도서관 사진이 다시 깔린다 */
function resetPhoto() {
  localStorage.removeItem(BG_PHOTO_KEY);
  localStorage.removeItem(BG_PHOTO_COLOR_KEY);
}

/** 설정의 색 버튼 중 지금 적용된 것을 눌린 상태로 */
function syncTintSwatches(hex, strength, photo = false) {
  document.getElementById("btn-bg-photo-clear")?.toggleAttribute("hidden", !photo);
  if (photo) {
    document.querySelectorAll("[data-tint], .swatch--custom").forEach((sw) => sw.setAttribute("aria-pressed", "false"));
    return;
  }
  const none = strength === 0;
  let matched = none;
  document.querySelectorAll("[data-tint]").forEach((sw) => {
    const on = none ? sw.dataset.tint === "" : (sw.dataset.tint || "").toLowerCase() === hex.toLowerCase();
    if (on) matched = true;
    sw.setAttribute("aria-pressed", String(on));
  });
  document.querySelector(".swatch--custom")?.setAttribute("aria-pressed", String(!matched));
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
  el.setAttribute("aria-label", `남은 시간 ${h ? `${h}시간 ` : ""}${m}분 ${rs}초`);
  renderFlip(el, h > 0 ? `${h}:${pad2(m)}:${pad2(rs)}` : `${pad2(m)}:${pad2(rs)}`);
}

/**
 * 플립 시계: 바뀐 자리만 새 카드로 갈아 끼운다.
 * 카드 한 장 = 고정된 위·아래 반쪽 + 넘어가는 위·아래 날개(이전 숫자가 아래로 접히고, 새 숫자가 펼쳐짐).
 */
function renderFlip(el, text) {
  const prev = el.dataset.text || "";
  if (prev === text) return;
  el.dataset.text = text;
  const animate = prev.length === text.length && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prev.length !== text.length) {
    el.replaceChildren(...[...text].map((ch) => flipCell(ch, ch, false)));
    return;
  }
  [...text].forEach((ch, i) => {
    if (ch !== prev[i]) el.children[i].replaceWith(flipCell(prev[i], ch, animate));
  });
}

function flipCell(oldCh, newCh, animate) {
  if (newCh === ":") {
    const colon = document.createElement("span");
    colon.className = "flip-colon";
    colon.setAttribute("aria-hidden", "true");
    return colon;
  }
  const cell = document.createElement("span");
  cell.className = "flip";
  cell.setAttribute("aria-hidden", "true");
  const part = (cls, t) => {
    const b = document.createElement("b");
    b.className = cls;
    b.textContent = t;
    return b;
  };
  cell.append(part("flip__half flip__half--top", newCh), part("flip__half flip__half--bottom", animate ? oldCh : newCh));
  if (animate) {
    const bottomFlap = part("flip__flap flip__flap--bottom", newCh);
    cell.append(part("flip__flap flip__flap--top", oldCh), bottomFlap);
    // 다 넘어가면 밑에 남은 이전 숫자를 새 숫자로 바꾸고 날개를 치운다 (반투명 배경에서 비치지 않게)
    bottomFlap.addEventListener("animationend", () => {
      cell.querySelector(".flip__half--bottom").textContent = newCh;
      cell.querySelectorAll(".flip__flap").forEach((f) => f.remove());
    }, { once: true });
  }
  return cell;
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
  resetPhoto();
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
  resetPhoto();
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
  const summary = document.getElementById("focus-log-summary");
  if (summary) {
    const today = loadFocusLogs().filter((L) => (L.kind || "work") === "work" && todayYMD(new Date(L.at)) === todayYMD());
    summary.textContent = today.length
      ? `오늘 ${today.length}번 · ${today.reduce((sum, L) => sum + L.minutes, 0)}분`
      : "오늘은 아직 없어요";
  }
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

  /** 미리 고른 색: 누르면 바로 적용, 진하기가 0이면 보이게 기본 진하기로 올린다 */
  document.querySelectorAll("[data-tint]").forEach((sw) =>
    sw.addEventListener("click", () => {
      if (!(tintColor instanceof HTMLInputElement) || !(tintAlpha instanceof HTMLInputElement)) return;
      const hex = sw.dataset.tint || "";
      clearPhoto();
      if (hex) {
        tintColor.value = hex;
        if (tintAlpha.value === "0") tintAlpha.value = "22";
      } else tintAlpha.value = "0";
      localStorage.setItem(BG_TINT_HEX_KEY, tintColor.value);
      localStorage.setItem(BG_TINT_ALPHA_KEY, tintAlpha.value);
      applyBackgroundTint();
    }),
  );
  tintColor?.addEventListener("input", () => {
    clearPhoto();
    if (tintAlpha instanceof HTMLInputElement && tintAlpha.value === "0") {
      tintAlpha.value = "22";
      localStorage.setItem(BG_TINT_ALPHA_KEY, "22");
    }
    applyBackgroundTint();
  });

  const photoInput = document.getElementById("input-bg-photo");
  photoInput?.addEventListener("change", async () => {
    const file = photoInput instanceof HTMLInputElement ? photoInput.files?.[0] : null;
    if (photoInput instanceof HTMLInputElement) photoInput.value = "";
    if (!file) return;
    try {
      const { dataUrl, color } = await preparePhoto(file);
      localStorage.setItem(BG_PHOTO_KEY, dataUrl);
      localStorage.setItem(BG_PHOTO_COLOR_KEY, color);
    } catch {
      clearPhoto();
      alert("사진을 저장하지 못했어요. 다른 사진으로 해보거나, 크기가 작은 사진을 골라주세요.");
    }
    applyBackgroundTint();
  });
  document.getElementById("btn-bg-photo-clear")?.addEventListener("click", () => {
    clearPhoto();
    applyBackgroundTint();
  });
  document.getElementById("btn-bg-photo-default")?.addEventListener("click", () => {
    resetPhoto();
    localStorage.setItem(BG_TINT_ALPHA_KEY, "0");
    if (tintAlpha instanceof HTMLInputElement) tintAlpha.value = "0";
    applyBackgroundTint();
  });

  document.getElementById("form-review-add")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const titleIn = document.getElementById("input-review-title");
    const title = titleIn instanceof HTMLInputElement ? titleIn.value.trim() : "";
    if (!title) return;
    const daysIn = document.getElementById("input-review-first-days");
    // 0(오늘 보기)도 유효한 값이라 `|| 1`로 기본값을 주면 안 된다
    const n = daysIn instanceof HTMLInputElement ? parseInt(daysIn.value, 10) : NaN;
    const d = Number.isNaN(n) ? 1 : Math.max(0, n);
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

  // hidden 대신 클래스로 열고 닫아야 오른쪽에서 밀려 나오는 전환이 보인다.
  // 닫혀 있을 땐 inert라 키보드·스크린리더가 들어가지 않는다.
  const isOpen = () => panel.classList.contains("is-open");
  /** @param {boolean} open */
  function setOpen(open) {
    panel.classList.toggle("is-open", open);
    panel.inert = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) closeBtn?.focus({ preventScroll: true });
    else if (panel.contains(document.activeElement)) toggle.focus({ preventScroll: true });
  }

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(!isOpen());
  });
  closeBtn?.addEventListener("click", () => setOpen(false));

  document.addEventListener("click", (e) => {
    if (!isOpen() || !(e.target instanceof Node)) return;
    if (!root.contains(e.target)) setOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) setOpen(false);
  });
}
