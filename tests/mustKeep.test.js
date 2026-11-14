import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseHTML } from 'linkedom';
import { extractContent } from '../src/core/extract.js';
import { buildMustKeep, toRequirementsMd } from '../src/core/mustKeep.js';

const html = fs.readFileSync(new URL('./fixtures/landing.html', import.meta.url), 'utf8');
const content = extractContent(parseHTML(html).document, 'https://example.com/');

function synthetic({ h2 = 4, nav = 3, buttons = 3, prices = 2 } = {}) {
  return {
    url: 'https://example.com/',
    h1: ['제목'],
    h2: Array.from({ length: h2 }, (_, i) => `소제목 ${i}`),
    hero: '히어로 단락은 스무 글자가 넘도록 충분히 길게 씁니다',
    buttons: Array.from({ length: buttons }, (_, i) => ({ text: `버튼 ${i}`, href: `https://example.com/b${i}` })),
    prices: Array.from({ length: prices }, (_, i) => `₩${i}`),
    nav: Array.from({ length: nav }, (_, i) => ({ text: `메뉴 ${i}`, href: `https://example.com/n${i}` })),
  };
}

test('고정 페이지에서 14개, 종류 순서는 h1 h2 hero button price nav', () => {
  const { items, trimmed } = buildMustKeep(content);
  assert.equal(items.length, 14);
  assert.equal(trimmed, false);
  assert.deepEqual(items.map((i) => i.id), [
    'h1-0', 'h2-0', 'h2-1', 'h2-2', 'h2-3', 'hero',
    'button-0', 'button-1', 'button-2', 'price-0', 'price-1', 'nav-0', 'nav-1', 'nav-2',
  ]);
  assert.deepEqual(items.map((i) => i.kind), [
    'h1', 'h2', 'h2', 'h2', 'h2', 'hero', 'button', 'button', 'button', 'price', 'price', 'nav', 'nav', 'nav',
  ]);
});

test('항목은 글자와 href를 담고 모두 켜져 있다', () => {
  const { items } = buildMustKeep(content);
  const join = items.find((i) => i.id === 'button-0');
  assert.equal(join.text, '지금 참가하기');
  assert.equal(join.href, 'https://example.com/join');
  assert.equal(join.enabled, true);
  assert.equal(items.find((i) => i.id === 'button-1').href, undefined);
  assert.equal(items.find((i) => i.id === 'price-1').text, '9,900원');
  assert.equal(items.find((i) => i.id === 'nav-2').href, 'https://example.com/events');
  assert.ok(items.every((i) => i.enabled === true));
});

test('h2 30개 페이지는 25개로 줄고 trimmed가 켜지며 내비가 먼저 빠진다', () => {
  const { items, trimmed } = buildMustKeep(synthetic({ h2: 30 }));
  assert.equal(items.length, 25);
  assert.equal(trimmed, true);
  assert.equal(items.filter((i) => i.kind === 'nav').length, 0);
  const h2 = items.filter((i) => i.kind === 'h2');
  assert.equal(h2.length, 18);
  assert.equal(h2.at(-1).id, 'h2-17');
});

test('초과가 2개뿐이면 내비만 뒤에서 2개 빠진다', () => {
  const { items, trimmed } = buildMustKeep(synthetic({ h2: 20 })); // 1+20+1+3+2+3 = 30 -> 5 초과
  assert.equal(items.length, 25);
  assert.equal(trimmed, true);
  const small = buildMustKeep(synthetic({ h2: 17 })); // 27 -> 2 초과
  assert.equal(small.items.length, 25);
  assert.deepEqual(small.items.filter((i) => i.kind === 'nav').map((i) => i.id), ['nav-0']);
  assert.equal(small.items.filter((i) => i.kind === 'h2').length, 17);
});

test('25개 이하면 줄이지 않는다', () => {
  const { items, trimmed } = buildMustKeep(synthetic({ h2: 15 })); // 1+15+1+3+2+3 = 25
  assert.equal(items.length, 25);
  assert.equal(trimmed, false);
});

test('toRequirementsMd: WHEN·SHALL과 각 항목 글자, 버튼은 링크까지', () => {
  const { items } = buildMustKeep(content);
  const md = toRequirementsMd(items, 'https://example.com/');
  assert.ok(md.includes('WHEN'));
  assert.ok(md.includes('SHALL'));
  assert.ok(md.includes('https://example.com/'));
  for (const item of items) assert.ok(md.includes(item.text), `빠진 글자: ${item.text}`);
  assert.ok(md.includes('https://example.com/join'));
});

test('toRequirementsMd: 꺼진 항목은 들어가지 않는다', () => {
  const { items } = buildMustKeep(content);
  items.find((i) => i.id === 'nav-0').enabled = false;
  const md = toRequirementsMd(items, 'https://example.com/');
  assert.ok(!md.includes('"홈"'));
  assert.ok(md.includes('"소개"'));
});
