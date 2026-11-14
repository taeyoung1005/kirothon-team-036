import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countAssets, assetSummaryParts, linkLabel, collapsedByDefault, setAllEnabled, selectionSummary } from '../src/core/confirmView.js';

const a = (kind, role, extra = {}) => ({ id: `x-${Math.random()}`, kind, role, url: 'https://e.com/a', ...extra });

test('에셋 세기: 종류마다 한 곳에만 센다', () => {
  const counts = countAssets([
    a('image', 'photo'), a('image', 'photo'), a('image', 'avatar'), a('background', 'background'), a('social', 'social'), a('video-poster', 'video'),
    a('image', 'logo'), a('image', 'partner-logo'),
    a('favicon', 'icon'), a('image', 'icon'),
    a('svg', 'icon', { url: undefined }), a('svg', 'logo', { url: undefined }), a('svg', 'graphic', { url: undefined }),
    a('video', 'video'),
  ]);
  assert.deepEqual(counts, { image: 6, logo: 2, icon: 2, svg: 3, video: 1 });
});

test('에셋 세기: 없거나 이상한 값은 0', () => {
  assert.deepEqual(countAssets([]), { image: 0, logo: 0, icon: 0, svg: 0, video: 0 });
  assert.deepEqual(countAssets(undefined), { image: 0, logo: 0, icon: 0, svg: 0, video: 0 });
  assert.deepEqual(countAssets([null, {}]), { image: 1, logo: 0, icon: 0, svg: 0, video: 0 });
});

test('에셋 요약 조각: 0인 종류는 뺀다', () => {
  assert.deepEqual(assetSummaryParts({ image: 12, logo: 0, icon: 3, svg: 0, video: 1 }), [
    { key: 'image', label: '이미지', n: 12 }, { key: 'icon', label: '아이콘', n: 3 }, { key: 'video', label: '영상', n: 1 },
  ]);
  assert.deepEqual(assetSummaryParts({ image: 0, logo: 0, icon: 0, svg: 0, video: 0 }), []);
});

test('링크 표시: 같은 사이트는 경로, 해시는 보이고 쿼리는 줄인다', () => {
  const base = 'https://kirothon.ausg.me/';
  assert.equal(linkLabel('https://kirothon.ausg.me/', base), '/');
  assert.equal(linkLabel('https://kirothon.ausg.me/#about', base), '/#about');
  assert.equal(linkLabel('https://kirothon.ausg.me/join?ref=abc&token=zzz', base), '/join?…');
  assert.equal(linkLabel('https://kirothon.ausg.me/join?ref=abc#faq', base), '/join?…#faq');
});

test('링크 표시: 다른 사이트는 주소를 보이고, 해시에 값이 실리면 줄인다', () => {
  const base = 'https://a.com/';
  assert.equal(linkLabel('https://b.com/x', base), 'https://b.com/x');
  assert.equal(linkLabel('https://b.com/x?invitation_token=sec', base), 'https://b.com/x?…');
  assert.equal(linkLabel('https://a.com/cb#access_token=sec', base), '/cb#…');
});

test('링크 표시: 주소가 아니면 쿼리만 줄여 그대로', () => {
  assert.equal(linkLabel('mailto:a@b.com', 'https://a.com/'), 'mailto:a@b.com');
  assert.equal(linkLabel('/x?y=1', 'https://a.com/'), '/x?…');
});

test('종류 접기: 긴 종류만 처음부터 접는다', () => {
  assert.equal(collapsedByDefault(3), false);
  assert.equal(collapsedByDefault(6), false);
  assert.equal(collapsedByDefault(7), true);
});

test('선택 일괄: 종류별·전체로 켜고 끈다', () => {
  const items = [{ id: 'a', kind: 'h2', enabled: true }, { id: 'b', kind: 'nav', enabled: true }, { id: 'c', kind: 'nav', enabled: true }];
  setAllEnabled(items, false, 'nav');
  assert.deepEqual(items.map((i) => i.enabled), [true, false, false]);
  setAllEnabled(items, false);
  assert.deepEqual(items.map((i) => i.enabled), [false, false, false]);
  setAllEnabled(items, true, 'h2');
  assert.deepEqual(items.map((i) => i.enabled), [true, false, false]);
});

test('요약 바: 선택 수, 시안 수, 동시 수와 오류', () => {
  assert.deepEqual(selectionSummary({ skills: 3, units: 3, concurrency: 3, max: 12 }), { text: '3개 선택 · 시안 3개 · 동시 3개', error: '' });
  assert.deepEqual(selectionSummary({ skills: 3, units: 4, concurrency: 3, max: 12 }), { text: '3개 선택 · 시안 4개 · 동시 3개', error: '' });
  assert.deepEqual(selectionSummary({ skills: 0, units: 0, concurrency: 3, max: 12 }), { text: '0개 선택 · 시안 0개 · 동시 3개', error: '스킬을 하나 이상 골라 주세요' });
  assert.deepEqual(selectionSummary({ skills: 2, units: 13, concurrency: 3, max: 12 }), { text: '2개 선택 · 시안 13개 · 동시 3개', error: '시안은 한 번에 12개까지예요' });
});
