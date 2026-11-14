// 시안을 숨은 창에 띄워 콘솔 오류 수를 세고 1440·390 캡처를 남긴다.
import { BrowserWindow, session } from 'electron';
import path from 'node:path';
import { VARIANT_PARTITION, variantUrl } from './variantProtocol.js';
import { shoot, sleep, DESKTOP_W, MOBILE_W, VIEW_H } from './shoot.js';

const LOAD_LIMIT_MS = 20000;
const SETTLE_MS = 1200;

/** @returns {Promise<{consoleErrors:number, shots:{desktop:object, mobile:object}}>} */
export async function renderCheck({ runId, skillId, workDir }) {
  const win = new BrowserWindow({
    show: false,
    width: DESKTOP_W,
    height: VIEW_H,
    useContentSize: true,
    webPreferences: {
      session: session.fromPartition(VARIANT_PARTITION),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  const wc = win.webContents;
  let consoleErrors = 0;
  wc.on('console-message', (event, levelArg) => {
    const level = event?.level ?? levelArg;
    if (level === 'error' || level === 3) consoleErrors += 1;
  });
  wc.on('render-process-gone', () => { consoleErrors += 1; });
  wc.on('will-navigate', (event) => event.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.setAudioMuted(true);

  try {
    let timer;
    const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('시안을 여는 데 시간이 너무 걸렸어요')), LOAD_LIMIT_MS); });
    try {
      await Promise.race([wc.loadURL(variantUrl(runId, skillId)), limit]);
    } finally {
      clearTimeout(timer);
    }
    await sleep(SETTLE_MS);
    wc.debugger.attach('1.3');
    const desktop = await shoot(wc, DESKTOP_W, path.join(workDir, 'variant-desktop.png'));
    const mobile = await shoot(wc, MOBILE_W, path.join(workDir, 'variant-mobile.png'));
    await sleep(300);
    return { consoleErrors, shots: { desktop, mobile } };
  } finally {
    try { if (wc.debugger.isAttached()) wc.debugger.detach(); } catch (error) { console.error('디버거 해제 실패', error); }
    win.destroy();
  }
}
