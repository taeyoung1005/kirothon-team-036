// 실행 기록을 앱 데이터 폴더에 JSON으로 남긴다.
import fs from 'node:fs';
import path from 'node:path';
import { historyDir, runsDir, assertId } from './paths.js';

function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

export function saveRun(run) {
  assertId(run.id, 'runId');
  fs.mkdirSync(historyDir(), { recursive: true });
  writeAtomic(path.join(historyDir(), `${run.id}.json`), JSON.stringify(run, null, 2));
}

export function loadRun(id) {
  assertId(id, 'runId');
  return JSON.parse(fs.readFileSync(path.join(historyDir(), `${id}.json`), 'utf8'));
}

// 최근 순. 목록에는 사이드바에 필요한 요약만 담는다.
export function listRuns() {
  let names;
  try {
    names = fs.readdirSync(historyDir()).filter((n) => n.endsWith('.json'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const out = [];
  for (const name of names) {
    try {
      const run = JSON.parse(fs.readFileSync(path.join(historyDir(), name), 'utf8'));
      out.push({
        id: run.id,
        url: run.url,
        createdAt: run.createdAt,
        skillCount: run.variants?.length ?? 0,
        running: (run.variants ?? []).some((v) => ['queued', 'generating', 'checking', 'retrying'].includes(v.status)),
      });
    } catch (error) {
      console.error(`기록 파일을 읽지 못했어요: ${name}`, error);
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export function clearRuns() {
  fs.rmSync(historyDir(), { recursive: true, force: true });
  fs.rmSync(runsDir(), { recursive: true, force: true });
}

const UNFINISHED = new Set(['queued', 'generating', 'checking', 'retrying']);

// 앱이 닫히면 Kiro 프로세스도 같이 끝난다. 기록에 "만드는 중"으로 남은 시안은 멈춤으로 바꾼다.
export function markInterrupted() {
  let names;
  try {
    names = fs.readdirSync(historyDir()).filter((n) => n.endsWith('.json'));
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
  let changed = 0;
  for (const name of names) {
    const file = path.join(historyDir(), name);
    let run;
    try {
      run = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      console.error(`기록 파일을 읽지 못했어요: ${name}`, error);
      continue;
    }
    let touched = false;
    for (const v of run.variants ?? []) {
      if (!UNFINISHED.has(v.status)) continue;
      v.status = 'stopped';
      v.endedAt = Date.now();
      v.error = v.error ?? '앱이 닫혀서 멈췄어요';
      touched = true;
      changed += 1;
    }
    if (touched) {
      run.finishedAt = run.finishedAt ?? Date.now();
      writeAtomic(file, JSON.stringify(run, null, 2));
    }
  }
  return changed;
}
