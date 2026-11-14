import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runEngine, createPool, buildKiroArgs, DEFAULT_KIRO_CMD } from '../src/main/engine.js';

const FAKE = new URL('./fixtures/fake-kiro.js', import.meta.url).pathname;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'skillpick-engine-'));

// 가짜 명령은 node로 돌린다. 첫 인자 = 자는 시간(초)
const fakeOpts = (seconds, extra = {}) => ({ cmd: process.execPath, args: [FAKE, String(seconds)], ...extra });

test('buildKiroArgs: 보안 규칙대로 신뢰 도구는 fs_read,fs_write만', () => {
  const args = buildKiroArgs('지시문');
  assert.deepEqual(args, ['chat', '--no-interactive', '--agent', 'designer', '--trust-tools=fs_read,fs_write', '지시문']);
  assert.ok(!args.join(' ').includes('trust-all'));
  assert.ok(!args.includes('-a'));
  assert.equal(DEFAULT_KIRO_CMD, 'kiro-cli');
});

test('buildKiroArgs: 재시도는 --resume을 붙인다', () => {
  const args = buildKiroArgs('다시', { resume: true });
  assert.deepEqual(args, ['chat', '--no-interactive', '--resume', '--agent', 'designer', '--trust-tools=fs_read,fs_write', '다시']);
});

test('runEngine: 정상 종료하면 ok와 로그, 시작·종료 시각', async () => {
  const dir = tmp();
  const r = await runEngine(dir, '지시', fakeOpts(0.2));
  assert.equal(r.ok, true);
  assert.equal(r.code, 0);
  assert.equal(r.timedOut, false);
  assert.equal(r.stopped, false);
  assert.ok(r.log.includes('끝냈습니다'));
  assert.ok(r.log.includes('[tool] Write File'), 'stderr도 로그에 합쳐진다');
  assert.ok(r.endedAt >= r.startedAt);
  assert.ok(fs.existsSync(path.join(dir, 'out', 'index.html')));
});

test('runEngine: 작업 폴더가 cwd다', async () => {
  const dir = tmp();
  await runEngine(dir, '지시', fakeOpts(0.1));
  assert.ok(fs.existsSync(path.join(dir, 'fake-kiro.times.json')));
});

test('runEngine: 종료 코드가 0이 아니면 ok가 false', async () => {
  const r = await runEngine(tmp(), '지시', fakeOpts(0.1, { env: { FAKE_KIRO_EXIT: '3' } }));
  assert.equal(r.ok, false);
  assert.equal(r.code, 3);
  assert.equal(r.timedOut, false);
});

test('runEngine: 시간 제한 1초, 가짜 3초면 timedOut', async () => {
  const t0 = Date.now();
  const r = await runEngine(tmp(), '지시', fakeOpts(3, { timeoutMs: 1000 }));
  assert.equal(r.timedOut, true);
  assert.equal(r.ok, false);
  assert.ok(Date.now() - t0 < 2800, '시간 초과 시 프로세스를 바로 끝내야 한다');
});

test('runEngine: 없는 명령은 오류를 로그에 남기고 ok false', async () => {
  const r = await runEngine(tmp(), '지시', { cmd: 'skillpick-no-such-command', args: [] });
  assert.equal(r.ok, false);
  assert.equal(r.code, null);
  assert.match(r.log, /ENOENT|실행하지 못했어요/);
});

test('runEngine: onLog로 출력이 오는 대로 받는다', async () => {
  const chunks = [];
  await runEngine(tmp(), '지시', fakeOpts(0.1, { onLog: (c) => chunks.push(c) }));
  assert.ok(chunks.join('').includes('끝냈습니다'));
});

// 시작·종료 시각으로 한 순간에 동시에 돌고 있던 최대 개수를 센다 (시간순으로 훑기)
function peakConcurrency(spans) {
  const events = spans.flatMap((s) => [{ t: s.start, d: 1 }, { t: s.end, d: -1 }]);
  events.sort((a, b) => a.t - b.t || a.d - b.d); // 같은 시각이면 끝남을 먼저 센다
  let now = 0;
  let peak = 0;
  for (const e of events) {
    now += e.d;
    peak = Math.max(peak, now);
  }
  return peak;
}

test('풀: 작업 5개, 한도 2면 동시에 도는 수가 2를 넘지 않는다', async () => {
  const pool = createPool(2);
  const spans = [];
  const tasks = Array.from({ length: 5 }, (_, i) => pool.run(async () => {
    const r = await runEngine(tmp(), '지시', fakeOpts(0.4));
    spans.push({ i, start: r.startedAt, end: r.endedAt });
    return r;
  }));
  const results = await Promise.all(tasks);
  assert.ok(results.every((r) => r.ok));
  assert.equal(spans.length, 5);
  assert.equal(peakConcurrency(spans), 2, '정확히 2개까지는 겹쳐서 돌아야 하고 3개 이상은 안 된다');
});

test('풀: 한도 3이면 3개가 실제로 겹쳐 돈다', async () => {
  const pool = createPool(3);
  const spans = [];
  await Promise.all(Array.from({ length: 3 }, () => pool.run(async () => {
    const r = await runEngine(tmp(), '지시', fakeOpts(0.5));
    spans.push(r);
  })));
  const latestStart = Math.max(...spans.map((s) => s.startedAt));
  const earliestEnd = Math.min(...spans.map((s) => s.endedAt));
  assert.ok(latestStart < earliestEnd, '모든 작업이 한 순간 같이 돌고 있어야 한다');
});

test('풀: active와 queued를 실제 상태로 알려 준다', async () => {
  const pool = createPool(1);
  assert.equal(pool.active, 0);
  const first = pool.run(() => new Promise((r) => setTimeout(r, 200)));
  const second = pool.run(() => new Promise((r) => setTimeout(r, 10)));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(pool.active, 1);
  assert.equal(pool.queued, 1);
  await Promise.all([first, second]);
  assert.equal(pool.active, 0);
  assert.equal(pool.queued, 0);
});

test('풀: stopAll()하면 실행 중은 stopped, 대기 중은 시작되지 않는다', async () => {
  const pool = createPool(2);
  const started = [];
  const make = (i) => pool.run(async (signal) => {
    started.push(i);
    return runEngine(tmp(), '지시', fakeOpts(3, { signal }));
  });
  const jobs = [0, 1, 2, 3, 4].map(make);
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(pool.active, 2);
  assert.equal(pool.queued, 3);
  const t0 = Date.now();
  pool.stopAll();
  const results = await Promise.allSettled(jobs);
  assert.ok(Date.now() - t0 < 2500, '멈추면 바로 끝나야 한다');
  assert.deepEqual(started.sort(), [0, 1], '대기 중이던 3개는 시작되지 않아야 한다');
  const running = results.slice(0, 2).map((r) => r.value);
  assert.ok(running.every((r) => r.stopped === true && r.ok === false));
  const waiting = results.slice(2);
  assert.ok(waiting.every((r) => r.status === 'fulfilled' && r.value && r.value.notStarted === true));
  assert.equal(pool.active, 0);
  assert.equal(pool.queued, 0);
});

test('풀: stopAll() 뒤에 새로 넣은 작업은 다시 돈다', async () => {
  const pool = createPool(1);
  pool.stopAll();
  const r = await pool.run(async () => 'ok');
  assert.equal(r, 'ok');
});

test('풀: 한도는 바꿀 수 있고 1 미만은 1로 본다', async () => {
  const pool = createPool(0);
  assert.equal(pool.limit, 1);
  pool.setLimit(4);
  assert.equal(pool.limit, 4);
});

test('풀: 작업이 예외를 던져도 자리를 돌려주고 호출자에게 예외가 간다', async () => {
  const pool = createPool(1);
  await assert.rejects(pool.run(async () => { throw new Error('터짐'); }), /터짐/);
  assert.equal(pool.active, 0);
  assert.equal(await pool.run(async () => 7), 7);
});

test('runEngine: 명령이 없어서 spawn이 바로 실패해도 예외 없이 결과를 돌려준다 (시간 제한이 있어도)', async () => {
  const r = await runEngine(tmp(), '지시', { cmd: 'skillpick-no-such-command', args: [], timeoutMs: 5000 });
  assert.equal(r.ok, false);
  assert.equal(r.code, null);
  assert.equal(r.timedOut, false);
  assert.match(r.log, /ENOENT|실행하지 못했어요/);
});

test('runEngine: 이미 중단된 signal로 시작하면 바로 stopped', async () => {
  const controller = new AbortController();
  controller.abort();
  const r = await runEngine(tmp(), '지시', fakeOpts(3, { signal: controller.signal }));
  assert.equal(r.stopped, true);
  assert.equal(r.ok, false);
});

test('runEngine: 빈 KIRO_CMD 환경변수는 설정하지 않은 것으로 보고 기본 명령을 쓴다', async () => {
  const before = process.env.KIRO_CMD;
  process.env.KIRO_CMD = '';
  try {
    const { resolveKiroCmd } = await import('../src/main/engine.js');
    assert.equal(resolveKiroCmd(), 'kiro-cli');
    assert.equal(resolveKiroCmd('   '), 'kiro-cli');
    assert.equal(resolveKiroCmd('/opt/x/kiro'), '/opt/x/kiro');
  } finally {
    if (before === undefined) delete process.env.KIRO_CMD; else process.env.KIRO_CMD = before;
  }
});

test('runEngine: spawn이 동기로 예외를 던지는 경우(빈 명령 이름)도 예외 없이 실패 결과를 돌려준다', async () => {
  const r = await runEngine(tmp(), '지시', { cmd: '', args: [], timeoutMs: 5000 });
  assert.equal(r.ok, false);
  assert.equal(r.code, null);
  assert.match(r.log, /실행하지 못했어요/);
});
