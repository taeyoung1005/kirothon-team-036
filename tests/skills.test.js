import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SKILLS, parseSkillMd, toRawUrl, skillIdFrom, stripFrontMatter } from '../src/core/skills.js';

test('DEFAULT_SKILLS에 k-style-ui-ux가 있고 출처가 지정한 주소다', () => {
  const k = DEFAULT_SKILLS.find((s) => s.id === 'k-style-ui-ux');
  assert.ok(k, 'k-style-ui-ux 없음');
  assert.equal(k.source, 'https://github.com/vmc-inner-circle/k-style-ui-ux');
});

test('DEFAULT_SKILLS는 6개 이상이고 id가 겹치지 않는다', () => {
  assert.ok(DEFAULT_SKILLS.length >= 6);
  assert.equal(new Set(DEFAULT_SKILLS.map((s) => s.id)).size, DEFAULT_SKILLS.length);
});

test('기본 스킬마다 고정 커밋 raw 주소와 라이선스가 있다', () => {
  for (const s of DEFAULT_SKILLS) {
    assert.match(s.id, /^[a-z0-9][a-z0-9-]{0,63}$/, `id 형식: ${s.id}`);
    assert.match(s.commit, /^[0-9a-f]{40}$/, `커밋: ${s.id}`);
    assert.ok(s.rawUrl.startsWith(`https://raw.githubusercontent.com/`), `rawUrl: ${s.id}`);
    assert.ok(s.rawUrl.includes(s.commit), `rawUrl에 커밋이 들어가야 함: ${s.id}`);
    assert.ok(s.rawUrl.endsWith('SKILL.md'));
    assert.ok(s.source.startsWith('https://github.com/'));
    assert.ok(s.license, `라이선스: ${s.id}`);
    assert.ok(s.name && s.author && s.summary);
    assert.ok(Array.isArray(s.tags));
  }
});

test('시안 이미지에 나온 지어낸 스킬 이름은 목록에 없다', () => {
  const ids = DEFAULT_SKILLS.map((s) => s.id);
  for (const fake of ['minimalist-ui', 'brutalist-web', 'design-critic']) assert.ok(!ids.includes(fake));
});

test('기본 스킬은 직접 추가 꼬리표가 없다', () => {
  assert.ok(DEFAULT_SKILLS.every((s) => !s.tags.includes('직접 추가')));
});

test('설치 명령은 확인된 것만 문자열이고 나머지는 null', () => {
  for (const s of DEFAULT_SKILLS) assert.ok(s.installCmd === null || typeof s.installCmd === 'string');
});

test('parseSkillMd: 앞머리의 name과 description을 읽는다', () => {
  const md = '---\nname: my-skill\ndescription: 짧은 설명입니다\n---\n\n# 제목\n본문';
  const s = parseSkillMd(md, 'https://example.com/a/SKILL.md');
  assert.equal(s.id, 'my-skill');
  assert.equal(s.name, 'my-skill');
  assert.equal(s.summary, '짧은 설명입니다');
  assert.deepEqual(s.tags, ['직접 추가']);
  assert.equal(s.source, 'https://example.com/a/SKILL.md');
  assert.ok(s.body.includes('본문'));
});

test('parseSkillMd: 앞머리가 없으면 첫 제목을 이름으로 쓴다', () => {
  const s = parseSkillMd('# Cool Design Rules\n\n본문 첫 줄\n', 'https://example.com/x.md');
  assert.equal(s.name, 'Cool Design Rules');
  assert.equal(s.id, 'cool-design-rules');
});

test('parseSkillMd: 따옴표와 여러 줄(>-) 설명을 읽는다', () => {
  const quoted = parseSkillMd('---\nname: q\ndescription: "따옴표 설명"\n---\n본문', 'https://example.com/q.md');
  assert.equal(quoted.summary, '따옴표 설명');
  const folded = parseSkillMd('---\nname: f\ndescription: >-\n  첫째 줄\n  둘째 줄\n---\n본문', 'https://example.com/f.md');
  assert.equal(folded.summary, '첫째 줄 둘째 줄');
});

test('parseSkillMd: 긴 설명은 잘라 한 줄 요약으로 만든다', () => {
  const long = 'a'.repeat(400);
  const s = parseSkillMd(`---\nname: l\ndescription: ${long}\n---\n본문`, 'https://example.com/l.md');
  assert.ok(s.summary.length <= 140);
});

test('parseSkillMd: 이름도 제목도 없으면 오류', () => {
  assert.throws(() => parseSkillMd('그냥 글', 'https://example.com/n.md'), /SKILL\.md/);
  assert.throws(() => parseSkillMd('', 'https://example.com/n.md'), /SKILL\.md/);
});

test('skillIdFrom: 파일 경로에 쓰여도 안전한 id만 만든다', () => {
  assert.equal(skillIdFrom('../../etc/passwd', 'https://example.com/a'), 'etc-passwd');
  assert.equal(skillIdFrom('My Skill_v2!', 'https://example.com/a'), 'my-skill-v2');
  const korean = skillIdFrom('한글만', 'https://example.com/a');
  assert.match(korean, /^custom-[0-9a-f]{8}$/);
  assert.equal(korean, skillIdFrom('한글만', 'https://example.com/a'));
});

test('toRawUrl: GitHub blob 주소를 raw 주소로 바꾼다', () => {
  assert.equal(
    toRawUrl('https://github.com/o/r/blob/main/skills/x/SKILL.md'),
    'https://raw.githubusercontent.com/o/r/main/skills/x/SKILL.md',
  );
  assert.equal(
    toRawUrl('https://raw.githubusercontent.com/o/r/abc/SKILL.md'),
    'https://raw.githubusercontent.com/o/r/abc/SKILL.md',
  );
  assert.equal(toRawUrl('https://example.com/SKILL.md'), 'https://example.com/SKILL.md');
});

test('toRawUrl: https가 아니면 거부한다', () => {
  assert.throws(() => toRawUrl('http://example.com/SKILL.md'), /https/);
  assert.throws(() => toRawUrl('file:///etc/passwd'), /https/);
  assert.throws(() => toRawUrl('not a url'), /https/);
});

test('stripFrontMatter: 앞머리(hooks 같은 설정 키 포함)를 떼고 본문만 남긴다', () => {
  const md = '---\nname: x\nhooks:\n  - command: "rm -rf /"\n---\n\n# 본문 제목\n내용';
  const body = stripFrontMatter(md);
  assert.ok(!body.includes('rm -rf'));
  assert.ok(!body.includes('hooks'));
  assert.ok(body.includes('# 본문 제목'));
  assert.equal(stripFrontMatter('앞머리 없는 글'), '앞머리 없는 글');
});
