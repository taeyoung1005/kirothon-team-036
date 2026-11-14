import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DESKTOP_W, MOBILE_W, cardTitle, fitView, sortVariants, isPassedVariant,
  scrollRatio, scrollTarget, scrollMessage, parseScrollMessage, sidebarGroup,
} from '../src/core/compareView.js';

test('카드 머리: 스타일이 있으면 스킬 id와 스타일 이름을 나눈다', () => {
  assert.deepEqual(
    cardTitle({ id: 'ui-ux-pro-max-glassmorphism', name: 'ui-ux-pro-max · Glassmorphism', baseId: 'ui-ux-pro-max', style: { id: 'glassmorphism', name: 'Glassmorphism' } }),
    { main: 'ui-ux-pro-max', sub: 'Glassmorphism' });
});

test('카드 머리: 스타일이 없으면 이름만 쓰고 둘째 줄은 비운다', () => {
  assert.deepEqual(cardTitle({ id: 'frontend-design', name: 'frontend-design' }), { main: 'frontend-design', sub: '' });
});

test('미리보기 크기: 데스크톱은 1440폭을 카드 폭에 맞춰 줄인다', () => {
  const v = fitView('desktop', 720, 432);
  assert.equal(v.scale, 0.5);
  assert.equal(v.width, DESKTOP_W);
  assert.equal(v.height, 864); // 보이는 높이 432를 줄인 비율로 나눈 값
  assert.equal(v.left, 0);
});

test('미리보기 크기: 모바일은 390폭을 줄이지 않고 가운데에 둔다', () => {
  const v = fitView('mobile', 650, 400);
  assert.equal(v.scale, 1);
  assert.equal(v.width, MOBILE_W);
  assert.equal(v.height, 400);
  assert.equal(v.left, 130);
});

test('미리보기 크기: 카드가 390보다 좁으면 모바일도 줄인다', () => {
  const v = fitView('mobile', 195, 400);
  assert.equal(v.scale, 0.5);
  assert.equal(v.left, 0);
});

test('미리보기 크기: 폭이 0이면 null', () => {
  assert.equal(fitView('desktop', 0, 300), null);
});

const mk = (id, status, endedAt, passed) => ({ skillId: id, skill: { name: id }, status, endedAt, check: passed === undefined ? null : { passed } });

test('정렬: 완료 순은 끝난 시각 순이고 미완료는 뒤, 같으면 원래 순서', () => {
  const list = [mk('c', 'generating'), mk('b', 'done', 200), mk('a', 'done', 100), mk('d', 'queued')];
  assert.deepEqual(sortVariants(list, 'finish').map((v) => v.skillId), ['a', 'b', 'c', 'd']);
  assert.deepEqual(list.map((v) => v.skillId), ['c', 'b', 'a', 'd'], '원본 배열은 그대로');
});

test('정렬: 이름 순', () => {
  const list = [mk('b', 'done', 1), mk('a', 'done', 2)];
  assert.deepEqual(sortVariants(list, 'name').map((v) => v.skillId), ['a', 'b']);
});

test('통과 판정: 완료이고 검사를 통과한 것만', () => {
  assert.equal(isPassedVariant(mk('a', 'done', 1, true)), true);
  assert.equal(isPassedVariant(mk('a', 'done', 1, false)), false);
  assert.equal(isPassedVariant(mk('a', 'failed', 1, true)), false);
  assert.equal(isPassedVariant(mk('a', 'done', 1)), false);
});

test('스크롤 비율: 0~1로 맞추고 넘칠 길이가 없으면 0', () => {
  assert.equal(scrollRatio(300, 600), 0.5);
  assert.equal(scrollRatio(900, 600), 1);
  assert.equal(scrollRatio(-5, 600), 0);
  assert.equal(scrollRatio(10, 0), 0);
  assert.equal(scrollRatio(Number.NaN, 600), 0);
});

test('스크롤 위치: 비율을 다른 카드의 길이에 적용한다', () => {
  assert.equal(scrollTarget(0.5, 1000), 500);
  assert.equal(scrollTarget(2, 1000), 1000);
  assert.equal(scrollTarget(0.25, 0), 0);
});

test('스크롤 메시지: 만든 것을 다시 읽을 수 있고 다른 글자는 거른다', () => {
  assert.equal(parseScrollMessage(scrollMessage(0.4375)), 0.4375);
  assert.equal(parseScrollMessage('__sp_scroll:1'), 1);
  assert.equal(parseScrollMessage('__sp_scroll:2'), null);
  assert.equal(parseScrollMessage('__sp_scroll:abc'), null);
  assert.equal(parseScrollMessage('hello __sp_scroll:0.5'), null);
  assert.equal(parseScrollMessage(undefined), null);
});

test('사이드바 접힘 묶음: 비교와 크게 보기는 같은 묶음', () => {
  assert.equal(sidebarGroup('compare'), 'compare');
  assert.equal(sidebarGroup('detail'), 'compare');
  assert.equal(sidebarGroup('newRun'), 'other');
  assert.equal(sidebarGroup('running'), 'other');
});
