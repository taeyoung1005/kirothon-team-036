import { app, BrowserWindow, session } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIpc, runner, stopEverything } from './ipc.js';
import { setDataDir } from '../src/main/paths.js';
import { markInterrupted } from '../src/main/runStore.js';
import { extendPath } from '../src/main/preflight.js';
import { registerHandlers, registerSchemes, VARIANT_PARTITION, VARIANT_SCHEME } from '../src/main/variantProtocol.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

app.setName('SkillPick');
registerSchemes(); // app ready 전에 해야 한다

// 개발 확인용: 화면을 코드로 조작·캡처할 때만 켠다 (SKILLPICK_CDP_PORT=9333 npm start)
if (process.env.SKILLPICK_CDP_PORT) app.commandLine.appendSwitch('remote-debugging-port', process.env.SKILLPICK_CDP_PORT);

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: '#0e0f11',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 18 }, // x는 renderer/styles/tokens.css의 --traffic-x와 같아야 한다
    title: 'SkillPick',
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true, // 시안 뷰(<webview>)용. will-attach-webview에서 설정을 다시 강제한다
    },
  });
  mainWindow.loadFile(path.join(root, 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

// 시안 뷰 보안: 별도 세션 파티션, Node 접근 없음, 전용 프로토콜만 허용, 이동·새 창 차단
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    const allowed = String(params.src).startsWith(`${VARIANT_SCHEME}://`) && params.partition === VARIANT_PARTITION;
    if (!allowed) { event.preventDefault(); return; }
    delete webPreferences.preload;
    delete webPreferences.preloadURL;
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
  });
  contents.on('will-navigate', (event, url) => {
    // 앱 창은 처음 불러온 renderer/index.html 밖으로 못 나가고, 시안 뷰는 어디로도 이동하지 못한다
    if (contents.getType() === 'webview') { event.preventDefault(); return; }
    if (!url.startsWith('file://')) event.preventDefault();
  });
});

async function startApp() {
  extendPath();
  setDataDir(path.join(app.getPath('userData'), 'data'));
  markInterrupted();
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
  registerHandlers();
  registerIpc(() => mainWindow);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}

// 개발 확인용: 창 없이 원본 수집만 실행해 결과를 출력한다. (electron . --capture <주소> <폴더> [--allow-file])
async function devCapture(url, outDir) {
  const { captureUrl } = await import('../src/main/capture.js');
  try {
    const r = await captureUrl(url, outDir, { allowFile: process.argv.includes('--allow-file') });
    const c = r.content;
    console.log(JSON.stringify({
      ok: true, elapsedMs: r.elapsedMs, title: c.title, h1: c.h1, h2: c.h2.length, hero: Boolean(c.hero),
      buttons: c.buttons.length, prices: c.prices, nav: c.nav.length, images: c.images.length, shots: r.shots,
    }, null, 2));
    app.exit(0);
  } catch (error) {
    console.log(JSON.stringify({ ok: false, code: error.code ?? 'unknown', message: error.message, detail: error.detail }));
    app.exit(1);
  }
}

app.whenReady().then(async () => {
  const capIdx = process.argv.indexOf('--capture');
  if (capIdx >= 0) { await devCapture(process.argv[capIdx + 1], process.argv[capIdx + 2]); return; }
  await startApp();
});

app.on('window-all-closed', () => { app.quit(); });

// 앱을 닫으면 모든 자식 프로세스를 끝낸다. SIGTERM 뒤 2초 안에 안 끝나면 SIGKILL이 나가므로 그만큼 기다렸다가 종료한다.
let quitting = false;
app.on('before-quit', (event) => {
  if (quitting || runner.activeCount === 0) return;
  event.preventDefault();
  quitting = true;
  stopEverything();
  setTimeout(() => app.quit(), 2300);
});
