import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setDataDir, historyDir } from '../src/main/paths.js';
import { saveRun, loadRun, listRuns, clearRuns, markInterrupted } from '../src/main/runStore.js';

before(() => setDataDir(fs.mkdtempSync(path.join(os.tmpdir(), 'skillpick-store-'))));

const variant = (skillId, status) => ({ skillId, status, startedAt: 1, endedAt: null, check: null, error: null });
const run = (id, createdAt, variants) => ({ id, url: 'https://example.com/', createdAt, variants });

test('saveRun/loadRun: 저장한 그대로 읽힌다', () => {
  saveRun(run('ra1', 100, [variant('a', 'done')]));
  assert.equal(loadRun('ra1').variants[0].skillId, 'a');
});

test('listRuns: 최근 순, 실행 중 표시', () => {
  saveRun(run('rb1', 200, [variant('a', 'generating')]));
  saveRun(run('rb2', 300, [variant('a', 'done'), variant('b', 'done')]));
  const list = listRuns();
  const ids = list.map((r) => r.id);
  assert.ok(ids.indexOf('rb2') < ids.indexOf('rb1'));
  assert.equal(list.find((r) => r.id === 'rb1').running, true);
  assert.equal(list.find((r) => r.id === 'rb2').running, false);
  assert.equal(list.find((r) => r.id === 'rb2').skillCount, 2);
});

test('markInterrupted: 앱이 닫혀서 끝나지 못한 시안은 멈춤으로 바꾸고 이유를 남긴다', () => {
  saveRun(run('rc1', 400, [variant('a', 'generating'), variant('b', 'queued'), variant('c', 'done'), variant('d', 'retrying'), variant('e', 'checking')]));
  const changed = markInterrupted();
  assert.ok(changed >= 4);
  const r = loadRun('rc1');
  assert.deepEqual(r.variants.map((v) => v.status), ['stopped', 'stopped', 'done', 'stopped', 'stopped']);
  assert.ok(r.variants[0].error.includes('앱'));
  assert.ok(r.variants[0].endedAt > 0);
  assert.equal(r.variants[2].error, null, '끝난 시안은 건드리지 않는다');
  assert.ok(r.finishedAt > 0);
  assert.equal(markInterrupted(), 0, '두 번째 호출은 바꿀 것이 없다');
});

test('id에 경로 문자가 있으면 거부한다', () => {
  assert.throws(() => loadRun('../x'), /형식/);
  assert.throws(() => saveRun({ id: '../x', variants: [] }), /형식/);
});

test('clearRuns: 기록이 모두 지워진다', () => {
  clearRuns();
  assert.deepEqual(listRuns(), []);
  assert.ok(!fs.existsSync(historyDir()));
});
