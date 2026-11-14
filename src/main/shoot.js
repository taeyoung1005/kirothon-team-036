// 숨은 창의 전체 페이지 캡처. CDP를 쓴다. (원본 수집과 시안 렌더 확인이 같이 쓴다)
import fs from 'node:fs';

export const DESKTOP_W = 1440;
export const MOBILE_W = 390;
export const VIEW_H = 900;
export const MAX_SHOT_HEIGHT = 10000;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 캡처 전 준비에 쓰는 시간 상한(ms). 끝내 잠잠해지지 않는 페이지도 이 안에서 넘어간다
const SCROLL_CAP_MS = 8000; // 끝까지 천천히 내려가는 시간
const SCROLL_STEP_MS = 200; // 한 걸음마다 쉬는 시간. 지연 로딩과 reveal이 반응할 틈
const SETTLE_CAP_MS = 2500; // 맨 위로 돌아온 뒤 이미지와 애니메이션이 끝나길 기다리는 시간
const PREP_GUARD_MS = SCROLL_CAP_MS + SETTLE_CAP_MS + 3000; // 페이지가 응답하지 않을 때 기다리는 최대 시간

// 순수 규칙(nextScrollStep, applyShotPrep)은 src/core/shotPrep.js에 있다. 같은 소스를 페이지 안에 주입해 쓴다.
const PREP_SOURCE = fs
  .readFileSync(new URL('../core/shotPrep.js', import.meta.url), 'utf8')
  .replace(/^export /gm, '');

// 끝까지 천천히 내려갔다가 맨 위로 돌아온다. 지연 로딩 이미지와 한 번 재생되는 애니메이션이 끝나길 기다린다.
const SCROLL_SCRIPT = `(async () => {
  ${PREP_SOURCE}
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // html에 scroll-behavior: smooth가 있어도 바로 이동한다. 부드러운 이동은 맨 위에 닿기 전에 캡처되기 때문이다
  const jump = (top) => window.scrollTo({ top, left: 0, behavior: 'instant' });
  const t0 = performance.now();
  const vh = window.innerHeight;
  let y = 0, steps = 0, reachedEnd = false;
  while (performance.now() - t0 < ${SCROLL_CAP_MS}) {
    const next = nextScrollStep({ y, scrollHeight: document.documentElement.scrollHeight, viewportHeight: vh });
    y = next.y; steps += 1;
    jump(y);
    await wait(${SCROLL_STEP_MS});
    if (next.done || y >= ${MAX_SHOT_HEIGHT}) { reachedEnd = true; break; }
  }
  jump(0);
  await wait(300);
  const pendingImages = () => Array.from(document.images).filter((i) => !i.complete && i.getClientRects().length > 0).length;
  const finiteRunning = () => document.getAnimations().filter((a) => {
    if (a.playState !== 'running') return false;
    const t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
    return t ? Number.isFinite(t.endTime) : false; // 끝없이 도는 마키·로더는 기다리지 않는다
  }).length;
  const t1 = performance.now();
  while (performance.now() - t1 < ${SETTLE_CAP_MS} && (pendingImages() > 0 || finiteRunning() > 0)) await wait(100);
  await wait(150);
  return { steps, reachedEnd, scrollMs: Math.round(t1 - t0), settleMs: Math.round(performance.now() - t1),
    pendingImages: pendingImages(), runningAnimations: finiteRunning(), scrollHeight: document.documentElement.scrollHeight };
})()`;

// fixed·sticky 요소와 건너뛰기 링크를 캡처용으로 바꾼다. 되돌리는 함수는 창에 남긴다.
const FLATTEN_SCRIPT = `(() => {
  ${PREP_SOURCE}
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  // 맨 위가 아니면 fixed 요소의 자리를 잘못 맞추게 된다. 바꾸지 않고 알린다
  if (window.scrollY !== 0) throw new Error('맨 위로 돌아가지 못했어요 (scrollY ' + window.scrollY + ')');
  const r = applyShotPrep(document, {
    positionOf: (el) => getComputedStyle(el).position,
    rectOf: (el) => { const b = el.getBoundingClientRect(); return { left: b.left + scrollX, top: b.top + scrollY, width: b.width, height: b.height }; },
    viewport: () => ({ width: innerWidth, height: innerHeight }),
  });
  window.__skillpickShotRestore = r.restore;
  return { flattened: r.flattened, hiddenSkipLinks: r.hiddenSkipLinks };
})()`;

const RESTORE_SCRIPT = `(() => {
  const restore = window.__skillpickShotRestore;
  if (typeof restore !== 'function') return false;
  restore(); delete window.__skillpickShotRestore; return true;
})()`;

// 페이지가 멈춰도 캡처가 끝없이 기다리지 않도록 상한을 건다
async function withGuard(promise, ms, label) {
  let timer;
  const guard = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label}: ${ms}ms 안에 끝나지 않았어요`)), ms); });
  try {
    return await Promise.race([promise, guard]);
  } finally {
    clearTimeout(timer);
  }
}

// 준비 단계의 실패는 캡처를 막지 않되 숨기지 않는다. 로그에 남기고 결과의 warnings로 돌려준다
function warn(prep, step, error) {
  const message = `${step} 실패: ${error?.message ?? error}`;
  console.error(`[shoot] ${message}`);
  prep.warnings.push(message);
}

// mobile 에뮬레이션은 쓰지 않는다. viewport 메타가 없는 페이지를 980폭으로 그린 뒤 잘라 내기 때문이다.
// 시안 뷰도 창 폭만 바꾸는 방식이라 같은 기준이 된다.
export async function shoot(wc, width, file) {
  const send = (method, params = {}) => wc.debugger.sendCommand(method, params);
  const prep = { scroll: null, flattened: 0, hiddenSkipLinks: 0, warnings: [] };
  await send('Emulation.setDeviceMetricsOverride', { width, height: VIEW_H, deviceScaleFactor: 1, mobile: false });
  await sleep(700);
  try {
    prep.scroll = await withGuard(wc.executeJavaScript(SCROLL_SCRIPT, true), PREP_GUARD_MS, '끝까지 스크롤');
  } catch (error) {
    warn(prep, '끝까지 스크롤', error);
    // 스크롤이 멈췄어도 맨 위에서 찍는다
    await wc.executeJavaScript("window.scrollTo({ top: 0, left: 0, behavior: 'instant' })", true).catch((e) => warn(prep, '맨 위로 돌아가기', e));
  }
  try {
    const r = await withGuard(wc.executeJavaScript(FLATTEN_SCRIPT, true), 5000, '고정 요소 정리');
    prep.flattened = r.flattened;
    prep.hiddenSkipLinks = r.hiddenSkipLinks;
  } catch (error) {
    warn(prep, '고정 요소 정리', error);
  }
  try {
    const { cssContentSize } = await send('Page.getLayoutMetrics');
    const height = Math.max(VIEW_H, Math.min(MAX_SHOT_HEIGHT, Math.ceil(cssContentSize.height)));
    const { data } = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    return { file, width, height, truncated: cssContentSize.height > MAX_SHOT_HEIGHT, prep };
  } finally {
    // 캡처가 실패해도 페이지는 원래대로 돌려 놓는다
    try {
      await withGuard(wc.executeJavaScript(RESTORE_SCRIPT, true), 5000, '원복');
    } catch (error) {
      warn(prep, '원복', error);
    }
  }
}
