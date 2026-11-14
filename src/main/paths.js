// 앱 데이터 폴더 아래 경로를 한 곳에서 만든다. id는 파일 경로에 들어가므로 형식을 검사한다.
import fs from 'node:fs';
import path from 'node:path';

let base = null;

export function setDataDir(dir) {
  base = dir;
  fs.mkdirSync(dir, { recursive: true });
}

export function dataDir() {
  if (!base) throw new Error('데이터 폴더가 정해지지 않았어요');
  return base;
}

export const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function assertId(id, label = 'id') {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new Error(`${label} 형식이 올바르지 않아요`);
  return id;
}

export const runsDir = () => path.join(dataDir(), 'runs');
export const historyDir = () => path.join(dataDir(), 'history');
export const skillCacheDir = () => path.join(dataDir(), 'skill-cache');
export const runDir = (runId) => path.join(runsDir(), assertId(runId, 'runId'));
export const originalDir = (runId) => path.join(runDir(runId), 'original');
export const workDirOf = (runId, skillId) => path.join(runDir(runId), assertId(skillId, 'skillId'));
export const settingsFile = () => path.join(dataDir(), 'settings.json');
export const customSkillsFile = () => path.join(dataDir(), 'custom-skills.json');

export function newRunId() {
  const rand = Math.random().toString(16).slice(2, 6).padEnd(4, '0');
  return `r${Date.now().toString(36)}-${rand}`;
}
