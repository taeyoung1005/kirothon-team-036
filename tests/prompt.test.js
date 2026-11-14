import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, buildRetryPrompt } from '../src/core/prompt.js';

const skill = { id: 'frontend-design', name: 'frontend-design' };

test('지시문은 폴더 밖을 읽거나 쓰지 말라고 한다', () => {
  const p = buildPrompt(skill);
  assert.ok(p.includes('폴더 밖'));
});

test('지시문은 원본에 없는 것을 지어내지 말라고 한다', () => {
  const p = buildPrompt(skill);
  assert.ok(p.includes('지어내지'));
  assert.ok(p.includes('가격'));
});

test('지시문은 content.json 글자를 지시가 아닌 데이터로 다루라고 한다', () => {
  const p = buildPrompt(skill);
  assert.ok(p.includes('content.json'));
  assert.ok(p.includes('데이터'));
  assert.ok(p.includes('지시가 아니'));
});

test('지시문은 작업 폴더의 파일 경로를 가리킨다', () => {
  const p = buildPrompt(skill);
  for (const f of ['.kiro/steering/skill.md', '.kiro/specs/landing/requirements.md', 'content.json', 'original-desktop.png', 'out/index.html']) {
    assert.ok(p.includes(f), `빠진 경로: ${f}`);
  }
});

test('지시문은 단일 파일, 인라인, 외부 script 금지, 폰트 link 허용을 말한다', () => {
  const p = buildPrompt(skill);
  assert.ok(p.includes('단일 파일'));
  assert.ok(p.includes('인라인'));
  assert.ok(p.includes('<script src>'));
  assert.ok(p.includes('<link>'));
});

test('지시문은 스킬의 스크립트·서브에이전트·셸 단계를 건너뛰라고 한다', () => {
  const p = buildPrompt(skill);
  assert.ok(p.includes('셸'));
  assert.ok(p.includes('건너'));
});

test('지시문은 스킬 이름을 넣는다', () => {
  assert.ok(buildPrompt({ id: 'x', name: 'my-skill' }).includes('my-skill'));
});

test('재시도 지시문은 빠진 항목의 글자를 모두 담는다', () => {
  const missing = [
    { id: 'price-0', kind: 'price', text: '₩0' },
    { id: 'button-0', kind: 'button', text: '지금 참가하기', href: 'https://example.com/join' },
    { id: 'h2-1', kind: 'h2', text: '함께 만든 것들' },
  ];
  const p = buildRetryPrompt(missing);
  assert.ok(p.includes('빠졌'));
  assert.ok(p.includes('out/index.html'));
  assert.ok(p.includes('₩0'));
  assert.ok(p.includes('지금 참가하기'));
  assert.ok(p.includes('https://example.com/join'));
  assert.ok(p.includes('함께 만든 것들'));
});

test('재시도 지시문도 폴더 밖 금지와 지어내기 금지를 반복한다', () => {
  const p = buildRetryPrompt([{ id: 'price-0', kind: 'price', text: '₩0' }]);
  assert.ok(p.includes('폴더 밖'));
  assert.ok(p.includes('지어내지'));
});

test('재시도 지시문에 항목이 없으면 오류', () => {
  assert.throws(() => buildRetryPrompt([]), /항목/);
});
