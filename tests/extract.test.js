import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseHTML } from 'linkedom';
import { normalizeText } from '../src/core/normalize.js';
import { extractContent } from '../src/core/extract.js';

const html = fs.readFileSync(new URL('./fixtures/landing.html', import.meta.url), 'utf8');
const { document } = parseHTML(html);
const content = extractContent(document, 'https://example.com/');

test('normalizeText: 쉼표·띄어쓰기만 다른 가격은 같다', () => {
  assert.equal(normalizeText('월 9,900원'), normalizeText('월9900 원'));
  assert.equal(normalizeText('월 9,900원'), '월9900원');
});

test('normalizeText: 대소문자와 문장부호는 무시한다', () => {
  assert.equal(normalizeText('Join Now!'), normalizeText('join now'));
  assert.equal(normalizeText('Join Now!'), 'joinnow');
});

test('normalizeText: 통화 기호와 퍼센트는 남긴다', () => {
  assert.equal(normalizeText('₩ 0'), '₩0');
  assert.equal(normalizeText('$9.99'), '$999');
  assert.equal(normalizeText('98 %'), '98%');
});

test('normalizeText: NFC로 맞춘다', () => {
  assert.equal(normalizeText('\u1112\u1161\u11ab'), normalizeText('한'));
});

test('extractContent: 제목·메타 설명', () => {
  assert.equal(content.url, 'https://example.com/');
  assert.equal(content.title, 'AI 빌더 커뮤니티');
  assert.equal(content.description, 'AI로 만드는 사람들이 모이는 곳');
});

test('extractContent: h1과 h2', () => {
  assert.deepEqual(content.h1, ['AI 빌더를 위한 커뮤니티']);
  assert.deepEqual(content.h2, ['이번 주 행사', '함께 만든 것들', '요금', '자주 묻는 질문']);
});

test('extractContent: 히어로 첫 단락은 첫 h1 다음의 20자 이상 p', () => {
  assert.equal(content.hero, '매주 모여 만든 것을 나누고 서로의 서비스를 함께 키워 가는 모임입니다.');
});

test('extractContent: 버튼 3개, 상대 경로는 절대 URL로', () => {
  assert.deepEqual(content.buttons, [
    { text: '지금 참가하기', href: 'https://example.com/join' },
    { text: '더 알아보기', href: '' },
    { text: '후원하기', href: '' },
  ]);
});

test('extractContent: 가격', () => {
  assert.deepEqual(content.prices, ['₩0', '9,900원']);
});

test('extractContent: 내비는 nav 안 링크이고 버튼에 섞이지 않는다', () => {
  assert.deepEqual(content.nav, [
    { text: '홈', href: 'https://example.com/' },
    { text: '소개', href: 'https://example.com/about' },
    { text: '행사', href: 'https://example.com/events' },
  ]);
  assert.ok(!content.buttons.some((b) => b.text === '홈'));
});

test('extractContent: 이미지는 절대 URL만, data URI 제외', () => {
  assert.deepEqual(content.images, ['https://example.com/img/hero.png', 'https://cdn.example.com/team.jpg']);
});

test('extractContent: fullText에는 보이는 글자만', () => {
  assert.ok(content.fullText.includes('AI 빌더 밋업'));
  assert.ok(content.fullText.includes('₩0'));
  assert.ok(!content.fullText.includes('숨은 스크립트 글자'));
  assert.ok(!content.fullText.includes('보이지 않는 글자'));
});

test('extractContent: 푸터 링크는 버튼도 내비도 아니다', () => {
  assert.ok(!content.buttons.some((b) => b.text.includes('개인정보')));
  assert.ok(!content.nav.some((n) => n.text.includes('개인정보')));
});

// 실제 사이트의 CTA는 유틸리티 클래스만 달린 <a>다. 페이지 안에서는 계산된 스타일로 판정한다.
const utilityHtml = `<html><body>
  <nav><a href="/in" class="pill">로그인</a><a href="/docs">문서</a></nav>
  <main><div><a href="/join" class="px-8 py-3 bg-white">지금 참가하기</a> <a href="/more">그냥 링크</a></div></main></body></html>`;

test('extractContent: 클래스 이름으로 못 알아보는 <a>는 기본으로는 버튼이 아니다', () => {
  const c = extractContent(parseHTML(utilityHtml).document, 'https://example.com/');
  assert.deepEqual(c.buttons, []);
});

test('extractContent: looksLikeButton 훅이 참이면 버튼으로 세고 내비에서는 뺀다', () => {
  const looksLikeButton = (el) => /pill|bg-white/.test(el.getAttribute('class') ?? '');
  const c = extractContent(parseHTML(utilityHtml).document, 'https://example.com/', { looksLikeButton });
  assert.deepEqual(c.buttons.map((b) => b.text), ['로그인', '지금 참가하기']);
  assert.deepEqual(c.buttons.map((b) => b.href), ['https://example.com/in', 'https://example.com/join']);
  assert.deepEqual(c.nav.map((n) => n.text), ['문서']);
});

const assetsDoc = parseHTML(fs.readFileSync(new URL('./fixtures/assets.html', import.meta.url), 'utf8')).document;
const assetContent = extractContent(assetsDoc, 'https://example.com/');
const byUrl = (u) => assetContent.assets.find((a) => a.url === `https://example.com${u}`);

test('assets: 이미지에 역할, 알트, 크기, 가까운 제목을 붙이고 같은 주소는 한 번만 센다', () => {
  const logo = byUrl('/img/logo.svg');
  assert.equal(logo.kind, 'image');
  assert.equal(logo.role, 'logo');
  assert.equal(logo.alt, 'Acme 로고');
  assert.equal(logo.width, 120);
  assert.equal(logo.inHeader, true);
  assert.equal(logo.uses, 2);
  const hero = byUrl('/img/hero.png');
  assert.equal(hero.role, 'photo');
  assert.equal(hero.section, 'Hello world');
  assert.equal(hero.height, 800);
});

test('assets: 본문에 있는 로고는 partner-logo로 구분한다', () => {
  assert.equal(byUrl('/img/partner-logo.png').role, 'partner-logo');
});

test('assets: data-src와 srcset만 있는 이미지도 모은다', () => {
  assert.ok(byUrl('/img/lazy.jpg'));
  assert.ok(byUrl('/img/only-2x.png'), 'srcset에서는 가장 큰 후보를 쓴다');
});

test('assets: CSS 배경, 영상, 포스터, 아이콘, 파비콘, 공유 이미지를 종류별로 모은다', () => {
  assert.deepEqual([byUrl('/img/bg.jpg').kind, byUrl('/img/bg.jpg').role, byUrl('/img/bg.jpg').section], ['background', 'background', 'Features']);
  assert.equal(byUrl('/img/icon-a.png').role, 'icon');
  assert.equal(byUrl('/img/poster.jpg').kind, 'video-poster');
  assert.equal(byUrl('/vid/demo.mp4').kind, 'video');
  assert.equal(byUrl('/favicon.ico').kind, 'favicon');
  assert.equal(byUrl('/og.png').kind, 'social');
});

test('assets: 인라인 SVG는 마크업째로 담는다', () => {
  const svg = assetContent.assets.find((a) => a.kind === 'svg');
  assert.match(svg.markup, /<circle/);
  assert.equal(svg.role, 'icon');
  assert.equal(svg.url, undefined);
});

test('assets: data: 주소와 숨겨진 이미지는 뺀다', () => {
  assert.equal(assetContent.assets.some((a) => String(a.url).startsWith('data:')), false);
  assert.equal(byUrl('/img/hidden.png'), undefined);
});

test('assets: 렌더된 크기와 계산된 배경을 넘겨 주는 훅을 쓴다', () => {
  const withHooks = extractContent(assetsDoc, 'https://example.com/', {
    sizeOf: (el) => (el.getAttribute('src') === '/img/hero.png' ? { width: 1000, height: 500 } : null),
    backgroundImageOf: (el) => (el.tagName === 'SECTION' && el.querySelector('h1') ? 'url("https://cdn.example.com/hero-bg.webp")' : ''),
  });
  assert.equal(withHooks.assets.find((a) => a.url === 'https://example.com/img/hero.png').height, 500);
  const bg = withHooks.assets.find((a) => a.url === 'https://cdn.example.com/hero-bg.webp');
  assert.equal(bg.kind, 'background');
  assert.equal(bg.section, 'Hello world');
});

test('assets: 기존 images 목록(보이는 img 주소)은 그대로다', () => {
  assert.deepEqual(content.images, ['https://example.com/img/hero.png', 'https://cdn.example.com/team.jpg']);
});
