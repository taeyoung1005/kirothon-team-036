import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setDataDir } from '../src/main/paths.js';
import { createWorkspace } from '../src/main/workspace.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skillpick-ws-'));
setDataDir(tmp);
fs.writeFileSync(path.join(tmp, 'shot.png'), 'png');
const shots = { desktop: { file: path.join(tmp, 'shot.png') }, mobile: { file: path.join(tmp, 'shot.png') } };
const content = {
  url: 'https://example.com/', title: 'T', fullText: '본문', h1: ['제목'],
  assets: [{ id: 'asset-1', kind: 'image', role: 'logo', url: 'https://example.com/logo.svg', alt: '로고', section: '' }],
};
const read = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');

test('작업 폴더에 assets.json을 따로 주고 content.json에는 중복해서 넣지 않는다', () => {
  const dir = createWorkspace('run-a', { id: 'frontend-design', name: 'frontend-design', source: 's' }, '본문', [], content, shots);
  assert.deepEqual(JSON.parse(read(dir, 'assets.json')).map((a) => a.role), ['logo']);
  assert.equal('assets' in JSON.parse(read(dir, 'content.json')), false);
  assert.equal(fs.existsSync(path.join(dir, '.kiro', 'steering', 'style.md')), false);
});

test('스타일이 있는 시안은 style.md를 steering에 둔다', () => {
  const skill = { id: 'ui-ux-pro-max-glassmorphism', name: 'ui-ux-pro-max · Glassmorphism', source: 's', style: { id: 'glassmorphism', name: 'Glassmorphism', detail: '- Keywords: Frosted glass' } };
  const dir = createWorkspace('run-a', skill, '본문', [], content, shots);
  assert.match(read(dir, '.kiro/steering/style.md'), /Frosted glass/);
  assert.match(read(dir, '.kiro/steering/skill.md'), /ui-ux-pro-max · Glassmorphism/);
});

test('정리', () => { fs.rmSync(tmp, { recursive: true, force: true }); });
