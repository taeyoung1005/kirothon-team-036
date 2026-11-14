import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUS, STATUS_LABEL, nextStatus, isFinished, isActive, canRetry } from '../src/core/status.js';

test('상태 값은 설계와 같다', () => {
  assert.deepEqual(Object.values(STATUS).sort(), ['checking', 'done', 'failed', 'generating', 'queued', 'retrying', 'stopped', 'timeout'].sort());
});

test('화면 표시 이름', () => {
  assert.equal(STATUS_LABEL.queued, '대기');
  assert.equal(STATUS_LABEL.generating, '만드는 중');
  assert.equal(STATUS_LABEL.checking, '검사 중');
  assert.equal(STATUS_LABEL.retrying, '다시 고치는 중 (1/1)');
  assert.equal(STATUS_LABEL.done, '완료');
  assert.equal(STATUS_LABEL.failed, '실패');
  assert.equal(STATUS_LABEL.timeout, '시간 초과');
  assert.equal(STATUS_LABEL.stopped, '멈춤');
});

test('정상 흐름: 대기 → 만드는 중 → 검사 중 → 완료', () => {
  let s = STATUS.queued;
  s = nextStatus(s, 'start'); assert.equal(s, 'generating');
  s = nextStatus(s, 'generated'); assert.equal(s, 'checking');
  s = nextStatus(s, 'passed'); assert.equal(s, 'done');
});

test('빠진 항목이 있고 재시도가 켜져 있으면 다시 고치는 중, 그다음 다시 검사', () => {
  let s = nextStatus('checking', 'missing', { retry: true, retries: 0 });
  assert.equal(s, 'retrying');
  s = nextStatus(s, 'generated');
  assert.equal(s, 'checking');
});

test('재시도는 한 번만: 이미 한 번 했으면 부족해도 완료(⚠ 표시는 검사 결과가 한다)', () => {
  assert.equal(nextStatus('checking', 'missing', { retry: true, retries: 1 }), 'done');
});

test('재시도를 끄면 바로 완료', () => {
  assert.equal(nextStatus('checking', 'missing', { retry: false, retries: 0 }), 'done');
});

test('out/index.html이 없으면 실패', () => {
  assert.equal(nextStatus('generating', 'noOutput'), 'failed');
  assert.equal(nextStatus('retrying', 'noOutput'), 'failed');
});

test('엔진 실패, 시간 초과, 멈춤은 어느 진행 상태에서도 그 상태로 간다', () => {
  for (const from of ['queued', 'generating', 'checking', 'retrying']) {
    assert.equal(nextStatus(from, 'stop'), 'stopped', `${from} stop`);
  }
  for (const from of ['generating', 'retrying']) {
    assert.equal(nextStatus(from, 'timeout'), 'timeout', `${from} timeout`);
    assert.equal(nextStatus(from, 'engineFailed'), 'failed', `${from} engineFailed`);
  }
});

test('허용되지 않은 전이는 오류를 던진다', () => {
  assert.throws(() => nextStatus('done', 'start'), /전이/);
  assert.throws(() => nextStatus('queued', 'passed'), /전이/);
  assert.throws(() => nextStatus('failed', 'generated'), /전이/);
  assert.throws(() => nextStatus('queued', 'noSuchEvent'), /전이/);
});

test('끝난 상태는 stop 이벤트도 무시하지 않고 그대로 둔다', () => {
  for (const done of ['done', 'failed', 'timeout', 'stopped']) {
    assert.equal(nextStatus(done, 'stop'), done);
  }
});

test('isFinished / isActive / canRetry', () => {
  for (const s of ['done', 'failed', 'timeout', 'stopped']) assert.equal(isFinished(s), true);
  for (const s of ['queued', 'generating', 'checking', 'retrying']) assert.equal(isFinished(s), false);
  for (const s of ['generating', 'checking', 'retrying']) assert.equal(isActive(s), true);
  assert.equal(isActive('queued'), false);
  assert.equal(canRetry({ retry: true, retries: 0 }), true);
  assert.equal(canRetry({ retry: true, retries: 1 }), false);
  assert.equal(canRetry({ retry: false, retries: 0 }), false);
});

test('다시 고치기가 실패해도 첫 결과가 있으면 완료로 남긴다 (retryAbandoned)', () => {
  assert.equal(nextStatus('retrying', 'retryAbandoned'), 'done');
  assert.throws(() => nextStatus('generating', 'retryAbandoned'), /전이/);
  assert.throws(() => nextStatus('done', 'retryAbandoned'), /전이/);
});

test('예상 못 한 오류(crash)는 끝나지 않은 어느 상태에서든 실패', () => {
  for (const from of ['queued', 'generating', 'checking', 'retrying']) assert.equal(nextStatus(from, 'crash'), 'failed');
  assert.throws(() => nextStatus('done', 'crash'), /전이/);
});
