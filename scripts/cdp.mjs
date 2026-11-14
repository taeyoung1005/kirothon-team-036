// 개발 확인용 도우미: 켜져 있는 앱(SKILLPICK_CDP_PORT)을 코드로 조작하고 캡처한다. 새 패키지 없이 Node 내장 WebSocket을 쓴다.
//   import { connect } from './scripts/cdp.mjs'
//   const page = await connect(9333);  await page.eval('document.title');  await page.shot('/tmp/a.png');
import fs from 'node:fs';

export async function connect(port = 9333, match = 'renderer/index.html') {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = list.find((t) => t.type === 'page' && t.url.includes(match));
  if (!target) throw new Error(`열린 창을 찾지 못했어요: ${match}`);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('디버거에 연결하지 못했어요')); });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    id += 1;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const page = {
    send,
    sleep,
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    async shot(file) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      return file;
    },
    async click(selector) {
      const ok = await page.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return false; e.click(); return true; })()`);
      if (!ok) throw new Error(`찾지 못했어요: ${selector}`);
    },
    async clickText(text, tag = 'button') {
      const ok = await page.eval(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(tag)})].find((x) => x.textContent.trim().includes(${JSON.stringify(text)})); if (!e) return false; e.click(); return true; })()`);
      if (!ok) throw new Error(`글자를 가진 ${tag}를 찾지 못했어요: ${text}`);
    },
    async type(selector, value) {
      await page.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.focus(); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    },
    async waitFor(expr, timeoutMs = 30000) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        if (await page.eval(expr)) return true;
        await sleep(300);
      }
      throw new Error(`기다리던 조건이 안 됐어요: ${expr}`);
    },
    close() { ws.close(); },
  };
  return page;
}
