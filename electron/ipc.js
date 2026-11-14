// 렌더러가 부를 수 있는 기능을 모두 여기서 등록한다. preload가 이 목록과 같은 이름만 노출한다.
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { checkKiro, INSTALL_CMD, LOGIN_CMD } from '../src/main/preflight.js';
import { captureUrl, CaptureError, validateUrl } from '../src/main/capture.js';
import { buildMustKeep } from '../src/core/mustKeep.js';
import { stripFrontMatter } from '../src/core/skills.js';
import { addSkill, listSkills, loadSkillBody, previewSkill } from '../src/main/skillFetch.js';
import { createRunner } from '../src/main/runner.js';
import { renderCheck } from '../src/main/renderCheck.js';
import { clearRuns, listRuns, loadRun } from '../src/main/runStore.js';
import { getSettings, setSettings } from '../src/main/settings.js';
import { assertId, dataDir, historyDir, newRunId, originalDir, workDirOf } from '../src/main/paths.js';
import { createPool } from '../src/main/engine.js';

export const runner = createRunner({
  pool: createPool(3),
  loadSkillBody,
  renderCheck,
});

const captures = new Map(); // runId -> { content, shots, items, trimmed }

function asError(error) {
  if (error instanceof CaptureError) return { ok: false, code: error.code, message: error.message, detail: error.detail };
  return { ok: false, code: 'error', message: error.message, detail: '' };
}

const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, '') || 'page'; } catch { return 'page'; } };

function assertHttpUrl(url) {
  const u = new URL(String(url));
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('http 또는 https 주소만 열 수 있어요');
  return u.href;
}

export function registerIpc(getWindow) {
  const send = (channel, payload) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };
  const handle = (name, fn) => ipcMain.handle(`skillpick:${name}`, async (_event, ...args) => fn(...args));
  const safe = (fn) => async (...args) => { try { return await fn(...args); } catch (error) { console.error(error); return asError(error); } };

  handle('preflight', async () => ({ ...(await checkKiro()), installCmd: INSTALL_CMD, loginCmd: LOGIN_CMD }));
  handle('listSkills', () => listSkills());
  handle('previewSkill', safe(async (url) => ({ ok: true, skill: await previewSkill(url) })));
  handle('addSkill', safe(async (url) => ({ ok: true, skill: await addSkill(url) })));

  handle('capture', safe(async (url) => {
    const normalized = validateUrl(url);
    const runId = newRunId();
    const outDir = originalDir(runId);
    const { content, shots, elapsedMs } = await captureUrl(normalized, outDir);
    const { items, trimmed } = buildMustKeep(content);
    captures.set(runId, { content, shots, items, trimmed });
    return { ok: true, runId, content, items, trimmed, elapsedMs, shots: { desktop: { height: shots.desktop.height }, mobile: { height: shots.mobile.height } } };
  }));

  handle('startRun', safe(async ({ runId, skillIds, items }) => {
    assertId(runId, 'runId');
    const cap = captures.get(runId);
    if (!cap) throw new Error('원본을 다시 불러온 뒤에 시작해 주세요');
    const all = listSkills();
    const skills = skillIds.map((id) => {
      const skill = all.find((s) => s.id === id);
      if (!skill) throw new Error(`알 수 없는 스킬이에요: ${id}`);
      return skill;
    });
    if (!skills.length) throw new Error('스킬을 하나 이상 골라 주세요');
    const enabled = new Map(items.map((i) => [i.id, i.enabled !== false]));
    const merged = cap.items.map((i) => ({ ...i, enabled: enabled.get(i.id) ?? i.enabled }));
    const settings = getSettings();
    runner.startRun({ runId, skills, items: merged, trimmed: cap.trimmed, content: cap.content, shots: cap.shots, settings }, (event) => send('skillpick:run-event', event));
    return { ok: true };
  }));
  handle('stopRun', (runId) => runner.stopRun(assertId(runId, 'runId')));

  handle('readLog', (runId, skillId) => {
    const file = path.join(workDirOf(runId, skillId), 'kiro.log');
    try {
      const text = fs.readFileSync(file, 'utf8');
      return text.length > 30000 ? `…\n${text.slice(-30000)}` : text;
    } catch (error) {
      if (error.code === 'ENOENT') return '';
      throw error;
    }
  });
  handle('listRuns', () => listRuns());
  handle('loadRun', (id) => loadRun(id));
  handle('clearRuns', () => { runner.stopAll(); clearRuns(); return true; });
  handle('getSettings', () => getSettings());
  handle('setSettings', (patch) => setSettings(patch));

  handle('copyText', (text) => { clipboard.writeText(String(text)); return true; });
  handle('openExternal', safe(async (url) => { await shell.openExternal(assertHttpUrl(url)); return { ok: true }; }));
  handle('openHistoryFolder', async () => { fs.mkdirSync(historyDir(), { recursive: true }); await shell.openPath(dataDir()); return true; });
  handle('openFolder', (runId, skillId) => {
    shell.showItemInFolder(path.join(workDirOf(runId, skillId), 'out', 'index.html'));
    return true;
  });

  handle('saveHtml', safe(async (runId, skillId) => {
    const src = path.join(workDirOf(runId, skillId), 'out', 'index.html');
    const run = loadRun(runId);
    const name = `${hostOf(run.url)}-${assertId(skillId, 'skillId')}.html`;
    const res = await dialog.showSaveDialog(getWindow(), { defaultPath: name, filters: [{ name: 'HTML', extensions: ['html'] }] });
    if (res.canceled || !res.filePath) return { ok: true, canceled: true };
    fs.copyFileSync(src, res.filePath);
    return { ok: true, path: res.filePath };
  }));

  handle('exportSteering', safe(async (runId, skillId) => {
    const run = loadRun(runId);
    const variant = run.variants.find((v) => v.skillId === skillId);
    if (!variant) throw new Error('이 비교에 없는 스킬이에요');
    const picked = await dialog.showOpenDialog(getWindow(), { properties: ['openDirectory', 'createDirectory'], title: '내 프로젝트 폴더를 골라 주세요' });
    if (picked.canceled || !picked.filePaths[0]) return { ok: true, canceled: true };
    const target = path.join(picked.filePaths[0], '.kiro', 'steering', `design-${assertId(skillId, 'skillId')}.md`);
    if (fs.existsSync(target)) {
      const ask = await dialog.showMessageBox(getWindow(), { type: 'question', buttons: ['덮어쓰기', '취소'], defaultId: 1, cancelId: 1, message: '덮어쓸까요?', detail: target });
      if (ask.response !== 0) return { ok: true, canceled: true };
    }
    const skill = { ...variant.skill };
    const body = await loadSkillBody(listSkills().find((s) => s.id === skillId) ?? skill);
    const text = `# 디자인 스킬: ${skill.name}\n\n출처: ${skill.source}\n\n${stripFrontMatter(body).trim()}\n`;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
    return { ok: true, path: target };
  }));
}

export function stopEverything() {
  runner.stopAll();
}

export { BrowserWindow, app };
