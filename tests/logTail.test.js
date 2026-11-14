import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logTail } from '../src/core/logTail.js';

const sample = [
  '[INFO] [KRS] <-- GenerateAssistantResponseCommand done totalEvents=9',
  '[tool] Read File',
  '[tool] status: InProgress',
  '[tool] status: Completed',
  '[tool] Write File',
  '[tool] status: Pending',
  '[tool] status: Completed',
  '`out/index.html`을 만들었습니다.',
].join('\n');

test('내부 디버그 줄과 도구 상태 줄은 꼬리에서 뺀다', () => {
  assert.deepEqual(logTail(sample, 2), ['[tool] Write File', '`out/index.html`을 만들었습니다.']);
});

test('줄 수만큼만 뒤에서 돌려준다', () => {
  assert.deepEqual(logTail(sample, 3), ['[tool] Read File', '[tool] Write File', '`out/index.html`을 만들었습니다.']);
});

test('거를 줄만 있으면 빈 배열이 아니라 원래 마지막 줄을 보여 준다(출력이 있는데 비어 보이지 않게)', () => {
  assert.deepEqual(logTail('[INFO] a\n[INFO] b', 2), ['[INFO] a', '[INFO] b']);
});

test('빈 입력, 빈 줄', () => {
  assert.deepEqual(logTail('', 2), []);
  assert.deepEqual(logTail('\n\n  \n', 2), []);
});

test('긴 줄은 잘라 말줄임표를 붙인다', () => {
  const [line] = logTail('x'.repeat(500), 1, 40);
  assert.equal(line.length, 40);
  assert.ok(line.endsWith('…'));
});

test('도구 이름 줄(Write File)은 꼬리표 없이 그대로', () => {
  assert.deepEqual(logTail('[tool] Write File', 2), ['[tool] Write File']);
});
