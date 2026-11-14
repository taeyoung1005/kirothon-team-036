import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseCsv, stylesFromCsv, expandUnits, styleSteering, MAX_UNITS } from '../src/core/styles.js';

const sample = fs.readFileSync(new URL('./fixtures/styles-sample.csv', import.meta.url), 'utf8');
const spec = { id: 'Style ID', name: 'Style Category', status: 'Status', active: 'active', summary: 'Best For' };

test('parseCsv는 따옴표 안의 쉼표, 큰따옴표, 줄바꿈을 한 칸으로 읽는다', () => {
  const rows = parseCsv(sample);
  assert.equal(rows.length, 6); // 머리글 + 5행
  assert.equal(rows[1][3], 'Clean, simple, "quoted", spacious');
  assert.equal(rows[1][6], 'Design a minimalist landing page.\nUse: white space, grid');
  assert.equal(rows[4][1], 'Bauhaus (包豪斯)');
});

test('parseCsv는 CRLF와 끝 줄바꿈 없는 파일도 읽는다', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2'), [['a', 'b'], ['1', '2']]);
});

test('stylesFromCsv는 active만 남기고 id, 이름, 요약, 본문을 만든다', () => {
  const styles = stylesFromCsv(sample, spec);
  assert.deepEqual(styles.map((s) => s.id), ['minimalism-and-swiss-style', 'glassmorphism', 'bauhaus']);
  assert.equal(styles[0].name, 'Minimalism & Swiss Style');
  assert.equal(styles[0].summary, 'Enterprise apps, dashboards');
  assert.match(styles[0].detail, /Keywords: Clean, simple, "quoted", spacious/);
  assert.match(styles[0].detail, /AI Prompt Keywords|Style Category: Minimalism/);
});

test('stylesFromCsv는 필요한 열이 없으면 오류를 던진다', () => {
  assert.throws(() => stylesFromCsv('a,b\n1,2', spec), /Style ID/);
});

test('expandUnits: 스타일을 고르지 않은 스킬은 한 개로, 고른 스킬은 스타일 수만큼 나뉜다', () => {
  const skills = [{ id: 'frontend-design', name: 'frontend-design' }, { id: 'ui-ux-pro-max', name: 'ui-ux-pro-max' }];
  const styles = { 'ui-ux-pro-max': [{ id: 'glassmorphism', name: 'Glassmorphism', detail: 'd1' }, { id: 'bauhaus', name: 'Bauhaus', detail: 'd2' }] };
  const units = expandUnits(skills, styles);
  assert.deepEqual(units.map((u) => u.id), ['frontend-design', 'ui-ux-pro-max-glassmorphism', 'ui-ux-pro-max-bauhaus']);
  assert.equal(units[0].style, undefined);
  assert.equal(units[1].name, 'ui-ux-pro-max · Glassmorphism');
  assert.equal(units[1].baseId, 'ui-ux-pro-max');
  assert.equal(units[1].style.detail, 'd1');
});

test('expandUnits: 변형 id는 항상 id 규칙(소문자·숫자·하이픈, 64자 이내)을 지키고 겹치지 않는다', () => {
  const long = 'x'.repeat(80);
  const units = expandUnits(
    [{ id: 'skill-a', name: 'a' }],
    { 'skill-a': [{ id: long, name: 'L1', detail: '' }, { id: `${long}y`, name: 'L2', detail: '' }, { id: 'Weird_ID!', name: 'W', detail: '' }] },
  );
  const ids = units.map((u) => u.id);
  assert.equal(new Set(ids).size, 3);
  for (const id of ids) assert.match(id, /^[a-z0-9][a-z0-9-]{0,63}$/);
});

test('expandUnits: 합계가 MAX_UNITS를 넘으면 오류', () => {
  const many = Array.from({ length: MAX_UNITS + 1 }, (_, i) => ({ id: `s${i}`, name: `S${i}`, detail: '' }));
  assert.throws(() => expandUnits([{ id: 'a', name: 'a' }], { a: many }), /최대/);
});

test('styleSteering은 이름과 본문을 담는다', () => {
  const text = styleSteering({ id: 'glassmorphism', name: 'Glassmorphism', detail: 'Keywords: Frosted glass' });
  assert.match(text, /Glassmorphism/);
  assert.match(text, /Frosted glass/);
});
