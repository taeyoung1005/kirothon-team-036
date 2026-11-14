import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { extractContent } from '../src/core/extract.js';
import { buildMustKeep } from '../src/core/mustKeep.js';
import { createPool } from '../src/main/engine.js';
import { createRunner } from '../src/main/runner.js';
import { setDataDir, originalDir } from '../src/main/paths.js';
import { loadRun } from '../src/main/runStore.js';

const FAKE = new URL('./fixtures/fake-kiro.js', import.meta.url).pathname;
const BASE = 'https://example.com/';
const html = fs.readFileSync(new URL('./fixtures/landing.html', import.meta.url), 'utf8');
const content = extractContent(parseHTML(html).document, BASE);
const { items } = buildMustKeep(content);

before(() => setDataDir(fs.mkdtempSync(path.join(os.tmpdir(), 'skillpick-runner-'))));

const skill = (id) => ({ id, name: id, author: 'test', summary: '시험용', source: `https://example.com/${id}`, tags: [], installCmd: null });
const png = (name) => { const f = path.join(os.tmpdir(), `${name}.png`); fs.writeFileSync(f, 'png'); return { file: f }; };
const shots = { desktop: png('d'), mobile: png('m') };

function makeRunner({ seconds = 0.2, env = {}, renderCheck } = {}) {
  return createRunner({
    pool: createPool(3),
    loadSkillBody: async (s) => `---\nname: ${s.id}\n---\n# ${s.id}\n본문`,
    renderCheck: renderCheck ?? (async () => ({ consoleErrors: 0, shots: {} })),
    engineOpts: { cmd: process.execPath, args: [FAKE, String(seconds)], env },
  });
}

let counter = 0;
const input = (ids, settings = {}) => ({
  runId: `rtest${++counter}`,
  skills: ids.map(skill),
  items: structuredClone(items),
  trimmed: false,
  content,
  shots,
  settings: { concurrency: 3, timeoutMs: 60_000, retry: true, ...settings },
});

function prepareOriginal(runId) {
  fs.mkdirSync(originalDir(runId), { recursive: true });
}

test('시안 하나: 만들기 → 검사 → 빠진 항목이 있어 다시 고치기 1번 → 완료, ⚠ n/m', async () => {
  const runner = makeRunner();
  const inp = input(['alpha']);
  prepareOriginal(inp.runId);
  const events = [];
  const { done } = runner.startRun(inp, (e) => events.push(e));
  const run = await done;
  const v = run.variants[0];
  // 같은 상태가 연달아 나오는 것(로그 갱신)만 합치고 순서는 그대로 비교한다
  const seen = events.filter((e) => e.type === 'variant').map((e) => e.status).filter((s, i, a) => s !== a[i - 1]);
  assert.deepEqual(seen, ['generating', 'checking', 'retrying', 'checking', 'done']);
  assert.equal(v.status, 'done');
  assert.equal(v.retries, 1);
  assert.ok(v.check.total === 14 && v.check.ok < 14, '가짜 시안은 지켜야 할 것을 못 담는다');
  assert.equal(v.check.passed, false);
  assert.ok(v.endedAt >= v.startedAt);
  assert.ok(fs.existsSync(path.join(v.workDir, 'out', 'index.html')));
});

test('작업 폴더에는 설계 6.4절의 파일이 모두 생긴다', async () => {
  const runner = makeRunner();
  const inp = input(['beta']);
  prepareOriginal(inp.runId);
  const { run, done } = runner.startRun(inp);
  await done;
  const w = run.variants[0].workDir;
  for (const f of [
    '.kiro/agents/designer.json', '.kiro/steering/skill.md', '.kiro/specs/landing/requirements.md',
    'content.json', 'must-keep.json', 'original-desktop.png', 'original-mobile.png', 'out/index.html',
  ]) assert.ok(fs.existsSync(path.join(w, f)), `없음: ${f}`);
  const steering = fs.readFileSync(path.join(w, '.kiro/steering/skill.md'), 'utf8');
  assert.ok(steering.includes('본문'));
  assert.ok(!steering.includes('name: beta'), '스킬 앞머리는 떼고 넣는다');
  const agent = JSON.parse(fs.readFileSync(path.join(w, '.kiro/agents/designer.json'), 'utf8'));
  assert.deepEqual(agent.tools, ['read', 'write']);
  assert.ok(!JSON.stringify(agent).includes('shell'), '셸 도구가 에이전트에 없어야 한다');
  const sentToKiro = JSON.parse(fs.readFileSync(path.join(w, 'content.json'), 'utf8'));
  assert.equal(sentToKiro.fullText, undefined);
  assert.ok(sentToKiro.bodyText.includes('AI 빌더'));
});

test('재시도를 끄면 다시 고치지 않고 바로 완료', async () => {
  const runner = makeRunner();
  const inp = input(['gamma'], { retry: false });
  prepareOriginal(inp.runId);
  const events = [];
  const { done } = runner.startRun(inp, (e) => events.push(e));
  const run = await done;
  assert.equal(run.variants[0].retries, 0);
  assert.ok(!events.some((e) => e.status === 'retrying'));
  assert.equal(run.variants[0].status, 'done');
});

test('스킬 3개, 동시 3개: 실제로 겹쳐서 돌고 시작·종료 시각이 기록된다', async () => {
  const runner = makeRunner({ seconds: 0.6 });
  const inp = input(['s1', 's2', 's3'], { retry: false });
  prepareOriginal(inp.runId);
  const runningMax = { n: 0 };
  const { done } = runner.startRun(inp, (e) => { if (e.type === 'run') runningMax.n = Math.max(runningMax.n, e.running); });
  const run = await done;
  const spans = run.variants.map((v) => v.engine);
  assert.ok(spans.every((s) => s.startedAt && s.endedAt));
  const latestStart = Math.max(...spans.map((s) => s.startedAt));
  const earliestEnd = Math.min(...spans.map((s) => s.endedAt));
  assert.ok(latestStart < earliestEnd, '3개가 한 순간 같이 돌았어야 한다');
  assert.equal(runningMax.n, 3, '화면에 보이는 실행 중 수도 실제 3개');
  const timeline = fs.readFileSync(path.join(path.dirname(run.variants[0].workDir), 'timeline.log'), 'utf8');
  assert.equal((timeline.match(/engine-start/g) ?? []).length, 3);
});

test('동시 1개면 순서대로 돌고 겹치지 않는다', async () => {
  const runner = makeRunner({ seconds: 0.3 });
  const inp = input(['q1', 'q2', 'q3'], { retry: false, concurrency: 1 });
  prepareOriginal(inp.runId);
  const queuedSeen = [];
  const { done } = runner.startRun(inp, (e) => { if (e.type === 'run') queuedSeen.push(e.queued); });
  const run = await done;
  const spans = run.variants.map((v) => v.engine).sort((a, b) => a.startedAt - b.startedAt);
  assert.ok(spans[1].startedAt >= spans[0].endedAt && spans[2].startedAt >= spans[1].endedAt);
  assert.ok(queuedSeen.includes(2), '대기 수가 실제로 보고된다');
});

test('전부 멈추기: 실행 중은 멈춤, 대기 중이던 것은 시작되지 않고 멈춤', async () => {
  const runner = makeRunner({ seconds: 5 });
  const inp = input(['a', 'b', 'c', 'd', 'e'], { concurrency: 2 });
  prepareOriginal(inp.runId);
  const { done } = runner.startRun(inp);
  await new Promise((r) => setTimeout(r, 900));
  const t0 = Date.now();
  assert.equal(runner.stopRun(inp.runId), true);
  const run = await done;
  assert.ok(Date.now() - t0 < 3500, '바로 끝나야 한다');
  assert.deepEqual(run.variants.map((v) => v.status), ['stopped', 'stopped', 'stopped', 'stopped', 'stopped']);
  const started = run.variants.filter((v) => v.engine);
  assert.equal(started.length, 2, '대기 중이던 3개는 Kiro가 시작되지 않아야 한다');
});

test('시간 초과: 시안이 제한을 넘기면 timeout으로 표시하고 이유를 남긴다', async () => {
  const runner = makeRunner({ seconds: 5 });
  const inp = input(['slow'], { timeoutMs: 1000 });
  inp.settings.timeoutMs = 1000;
  prepareOriginal(inp.runId);
  const { done } = runner.startRun(inp);
  const run = await done;
  assert.equal(run.variants[0].status, 'timeout');
  assert.ok(run.variants[0].error.includes('제한 시간'));
});

test('엔진이 파일을 만들지 못하고 실패하면 failed, 이유와 로그가 남는다', async () => {
  const runner = makeRunner({ seconds: 0.1, env: { FAKE_KIRO_EXIT: '7' } });
  const inp = input(['bad']);
  prepareOriginal(inp.runId);
  const { done } = runner.startRun(inp);
  const run = await done;
  assert.equal(run.variants[0].status, 'failed');
  assert.ok(run.variants[0].error.includes('7'));
  assert.ok(fs.existsSync(path.join(run.variants[0].workDir, 'kiro.log')));
});

test('스킬 본문을 못 받으면 그 시안만 실패하고 나머지는 계속된다', async () => {
  const runner = createRunner({
    pool: createPool(3),
    loadSkillBody: async (s) => { if (s.id === 'broken') throw new Error('응답 코드 404'); return '# 본문'; },
    renderCheck: async () => ({ consoleErrors: 0, shots: {} }),
    engineOpts: { cmd: process.execPath, args: [FAKE, '0.2'] },
  });
  const inp = input(['broken', 'fine'], { retry: false });
  prepareOriginal(inp.runId);
  const { done } = runner.startRun(inp);
  const run = await done;
  assert.equal(run.variants[0].status, 'failed');
  assert.ok(run.variants[0].error.includes('404'));
  assert.equal(run.variants[1].status, 'done');
});

test('실행 기록이 JSON으로 저장되고 다시 읽힌다', async () => {
  const runner = makeRunner();
  const inp = input(['saved'], { retry: false });
  prepareOriginal(inp.runId);
  const { done } = runner.startRun(inp);
  await done;
  const loaded = loadRun(inp.runId);
  assert.equal(loaded.id, inp.runId);
  assert.equal(loaded.url, BASE);
  assert.equal(loaded.variants[0].skillId, 'saved');
  assert.equal(loaded.variants[0].status, 'done');
  assert.equal(loaded.items.length, 14);
  assert.ok(loaded.finishedAt >= loaded.createdAt);
});

test('렌더 확인이 실패해도 시안은 완료로 남고 이유가 기록된다', async () => {
  const runner = makeRunner({ renderCheck: async () => { throw new Error('창을 못 열었어요'); } });
  const inp = input(['norender'], { retry: false });
  prepareOriginal(inp.runId);
  const { done } = runner.startRun(inp);
  const run = await done;
  assert.equal(run.variants[0].status, 'done');
  assert.equal(run.variants[0].consoleErrors, null);
  assert.ok(run.variants[0].error.includes('창을 못 열었어요'));
});
