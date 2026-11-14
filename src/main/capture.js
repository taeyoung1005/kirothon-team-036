import { BrowserWindow, session } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { shoot, sleep, DESKTOP_W, MOBILE_W, VIEW_H } from './shoot.js';

const EXTRACT_SOURCE = fs
  .readFileSync(new URL('../core/extract.js', import.meta.url), 'utf8')
  .replace(/^export /gm, '');

// 페이지 안에서 계산된 스타일로 판정하는 훅. 문자열로 주입한다.
const PAGE_HOOKS = `{
  isVisible: (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden',
  looksLikeButton: (el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.height < 24 || r.height > 80 || r.width < 40) return false;
    const m = cs.backgroundColor.match(/rgba?\\(([^)]+)\\)/);
    const alpha = m ? (m[1].split(',').length > 3 ? parseFloat(m[1].split(',')[3]) : 1) : 0;
    const hasFill = alpha > 0.05;
    const hasBorder = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none';
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    return (hasFill || hasBorder) && padX >= 16;
  },
}`;

const LOAD_LIMIT_MS = 20000;
const IDLE_MS = 700;
const SETTLE_MAX_MS = 6000; // 잠잠해짐을 기다리는 최대 시간. 이미지·영상을 계속 받는 사이트는 끝내 잠잠해지지 않는다

export const CAPTURE_MESSAGES = {
  timeout: '시간 초과',
  blocked: '차단',
  address: '주소 오류',
  empty: '이 페이지에서 읽을 내용을 찾지 못했어요',
};

export class CaptureError extends Error {
  constructor(code, detail) {
    super(CAPTURE_MESSAGES[code] ?? code);
    this.name = 'CaptureError';
    this.code = code;
    this.detail = detail ?? '';
  }
}

// Chromium 오류 번호를 사유 세 가지로 묶는다
function reasonFromLoadError(code) {
  if (code === -7 || code === -118) return 'timeout';
  if ([-105, -300, -2, -10].includes(code)) return 'address'; // DNS 실패, 잘못된 주소 등
  return 'blocked';
}

function reasonFromStatus(status) {
  if (status === 404 || status === 410) return 'address';
  if (status >= 400) return 'blocked';
  return null;
}

export function validateUrl(input, { allowFile = false } = {}) {
  let url;
  try {
    url = new URL(String(input).trim());
  } catch {
    throw new CaptureError('address', '주소를 해석할 수 없어요');
  }
  const ok = url.protocol === 'http:' || url.protocol === 'https:' || (allowFile && url.protocol === 'file:');
  if (!ok) throw new CaptureError('address', 'http 또는 https 주소만 넣을 수 있어요');
  return url.href;
}

/**
 * 원본 페이지를 숨은 창에서 열어 내용을 뽑고 1440·390 전체 캡처를 저장한다.
 * 읽기만 한다. 폼 제출, 결제, 다운로드, 새 창은 모두 막는다.
 */
export async function captureUrl(inputUrl, outDir, options = {}) {
  const url = validateUrl(inputUrl, options);
  const limit = options.timeoutMs ?? LOAD_LIMIT_MS;
  fs.mkdirSync(outDir, { recursive: true });

  const ses = session.fromPartition(`skillpick-capture-${randomUUID()}`); // 저장되지 않는 임시 세션
  let inflight = 0;
  let lastActivity = Date.now();
  const touch = (delta) => { inflight = Math.max(0, inflight + delta); lastActivity = Date.now(); };
  ses.webRequest.onBeforeRequest((d, cb) => { if (/^https?:/.test(d.url)) touch(1); cb({}); });
  ses.webRequest.onCompleted(() => touch(-1));
  ses.webRequest.onErrorOccurred(() => touch(-1));
  ses.on('will-download', (event) => event.preventDefault());
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

  const win = new BrowserWindow({
    show: false,
    width: DESKTOP_W,
    height: VIEW_H,
    useContentSize: true,
    webPreferences: {
      session: ses,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      autoplayPolicy: 'document-user-activation-required',
    },
  });
  const wc = win.webContents;
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.setAudioMuted(true);

  const startedAt = Date.now();
  const deadline = startedAt + limit;
  let domReady = false;
  let finished = false;
  let failure = null;
  let status = 0;
  wc.on('dom-ready', () => { domReady = true; });
  wc.on('did-finish-load', () => { finished = true; });
  wc.on('did-fail-load', (_e, code, desc, _u, isMainFrame) => {
    if (isMainFrame && code !== -3) failure = new CaptureError(reasonFromLoadError(code), desc);
  });
  wc.on('did-frame-navigate', (_e, _u, httpResponseCode, _t, isMainFrame) => { if (isMainFrame) status = httpResponseCode; });
  // 읽는 동안 다른 곳으로 이동하는 것을 막는다 (처음 이동은 허용)
  let firstNavigationDone = false;
  wc.on('will-navigate', (event) => { if (firstNavigationDone) event.preventDefault(); });

  try {
    wc.loadURL(url).catch(() => { /* 실패는 did-fail-load 이벤트로 받는다 */ });
    while (!finished && !failure && Date.now() < deadline) await sleep(100);
    if (failure) throw failure;
    if (!finished && !domReady) throw new CaptureError('timeout', `${Math.round(limit / 1000)}초 안에 열리지 않았어요`);
    firstNavigationDone = true;
    const statusReason = reasonFromStatus(status);
    if (statusReason) throw new CaptureError(statusReason, `응답 코드 ${status}`);

    // 네트워크가 잠잠해질 때까지 기다린다
    const tLoaded = Date.now();
    const settleDeadline = Math.min(deadline, tLoaded + SETTLE_MAX_MS);
    while (Date.now() < settleDeadline && !(inflight === 0 && Date.now() - lastActivity >= IDLE_MS)) await sleep(100);
    if (process.env.SKILLPICK_DEBUG) console.log('[capture] 로드', tLoaded - startedAt, 'ms, 잠잠해짐까지', Date.now() - tLoaded, 'ms');

    const run = () => wc.executeJavaScript(`(() => { ${EXTRACT_SOURCE}\n return extractContent(document, location.href, ${PAGE_HOOKS}); })()`, true);
    let content = await run();
    // 스크립트로 그리는 페이지는 읽을 게 나올 때까지 남은 시간 동안 다시 읽는다
    while (!content.h1.length && !content.buttons.length && Date.now() < deadline) {
      await sleep(500);
      content = await run();
    }
    if (!content.h1.length && !content.buttons.length) throw new CaptureError('empty');
    content.url = url;

    wc.debugger.attach('1.3');
    const desktop = await shoot(wc, DESKTOP_W, path.join(outDir, 'original-desktop.png'));
    const mobile = await shoot(wc, MOBILE_W, path.join(outDir, 'original-mobile.png'));
    fs.writeFileSync(path.join(outDir, 'content.json'), JSON.stringify(content, null, 2));
    return { content, shots: { desktop, mobile }, elapsedMs: Date.now() - startedAt };
  } finally {
    try { if (wc.debugger.isAttached()) wc.debugger.detach(); } catch (error) { console.error('디버거 해제 실패', error); }
    win.destroy();
    ses.clearStorageData().catch((error) => console.error('임시 세션 정리 실패', error));
  }
}
