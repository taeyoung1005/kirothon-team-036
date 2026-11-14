// 숨은 창의 전체 페이지 캡처. CDP를 쓴다. (원본 수집과 시안 렌더 확인이 같이 쓴다)
import fs from 'node:fs';

export const DESKTOP_W = 1440;
export const MOBILE_W = 390;
export const VIEW_H = 900;
export const MAX_SHOT_HEIGHT = 10000;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function autoScroll(wc) {
  await wc.executeJavaScript(`new Promise((resolve) => {
    const step = Math.max(400, window.innerHeight);
    let y = 0, n = 0;
    const timer = setInterval(() => {
      y += step; n += 1;
      window.scrollTo(0, y);
      if (n >= 12 || y >= document.documentElement.scrollHeight) {
        clearInterval(timer); window.scrollTo(0, 0); setTimeout(resolve, 250);
      }
    }, 120);
  })`, true);
}

// mobile 에뮬레이션은 쓰지 않는다. viewport 메타가 없는 페이지를 980폭으로 그린 뒤 잘라 내기 때문이다.
// 시안 뷰도 창 폭만 바꾸는 방식이라 같은 기준이 된다.
export async function shoot(wc, width, file) {
  const send = (method, params = {}) => wc.debugger.sendCommand(method, params);
  await send('Emulation.setDeviceMetricsOverride', { width, height: VIEW_H, deviceScaleFactor: 1, mobile: false });
  await sleep(700);
  await autoScroll(wc);
  const { cssContentSize } = await send('Page.getLayoutMetrics');
  const height = Math.max(VIEW_H, Math.min(MAX_SHOT_HEIGHT, Math.ceil(cssContentSize.height)));
  const { data } = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width, height, scale: 1 },
  });
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  return { file, width, height, truncated: cssContentSize.height > MAX_SHOT_HEIGHT };
}
