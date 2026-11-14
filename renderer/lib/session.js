// 원본 수집 같은 "화면 사이에 이어지는 일"을 한 곳에서 다룬다.
import { state } from '../app.js';

export function parseHttpUrl(input) {
  const text = String(input ?? '').trim();
  if (!text) return null;
  try {
    const u = new URL(text);
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !u.hostname) return null;
    return u.href;
  } catch {
    return null;
  }
}

export const URL_ERROR = 'http 또는 https 주소만 넣을 수 있어요';

const CAPTURE_REASON = {
  timeout: '시간 초과',
  blocked: '차단',
  address: '주소 오류',
  empty: '이 페이지에서 읽을 내용을 찾지 못했어요',
};
export function captureReason(error) {
  return CAPTURE_REASON[error?.code] ?? error?.message ?? '알 수 없는 오류';
}

const listeners = new Set();
export function onCaptureChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const notify = () => { for (const fn of [...listeners]) fn(); };

// 같은 주소를 이미 수집 중이거나 수집했으면 그대로 쓰고, 아니면 새로 시작한다
export function ensureCapture(url, { force = false } = {}) {
  const same = state.capturing && state.capturing.url === url;
  if (same && !force) return state.capturing.promise;
  state.capture = null;
  state.captureError = null;
  const token = {};
  const promise = window.skillpick.capture(url).then((r) => {
    if (state.capturing?.token !== token) return r; // 그 사이 다른 주소로 바뀌었다
    if (r.ok) { state.capture = r; state.captureError = null; } else { state.capture = null; state.captureError = r; }
    state.capturing.done = true;
    notify();
    return r;
  });
  state.capturing = { url, token, promise, startedAt: Date.now(), done: false };
  notify();
  return promise;
}

/** 만들 시안 수: 스타일을 고른 스킬은 스타일 수만큼, 아니면 하나 */
export function unitCount() {
  return (state.selectedSkillIds ?? []).reduce((n, id) => n + Math.max(1, (state.selectedStyles[id] ?? []).length), 0);
}

/** 선택한 스킬의 스타일 id만 뽑아 startRun에 넘긴다 */
export function pickedStyleIds() {
  const out = {};
  for (const id of state.selectedSkillIds ?? []) {
    const list = state.selectedStyles[id] ?? [];
    if (list.length) out[id] = list.map((x) => x.id);
  }
  return out;
}
