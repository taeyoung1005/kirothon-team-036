// 스킬 목록과 SKILL.md 읽기. 스킬 본문은 저장소에 복사하지 않는다.
// 아래 6개는 2026-11-14에 공개 GitHub에서 SKILL.md를 실제로 열어 확인했다(고정 커밋의 raw 주소가 200으로 응답함).
// 설치 명령은 각 저장소 README에 적힌 것만 넣었다. 확인하지 못한 것은 null.
import { createHash } from 'node:crypto';

const RAW = 'https://raw.githubusercontent.com';

export const DEFAULT_SKILLS = [
  {
    id: 'frontend-design',
    name: 'frontend-design',
    author: 'Anthropic',
    summary: '뻔한 템플릿 느낌을 피하고 과감한 미감 방향을 잡는 디자인 지침',
    source: 'https://github.com/anthropics/skills/tree/main/skills/frontend-design',
    commit: '2c5958ecac7cee2b583967a2c4981d0f4a75c579',
    rawUrl: `${RAW}/anthropics/skills/2c5958ecac7cee2b583967a2c4981d0f4a75c579/skills/frontend-design/SKILL.md`,
    license: 'Apache-2.0',
    tags: [],
    installCmd: '/plugin marketplace add anthropics/skills\n/plugin install example-skills@anthropic-agent-skills',
  },
  {
    id: 'k-style-ui-ux',
    name: 'k-style-ui-ux',
    author: 'vmc-inner-circle',
    summary: '한국 앱 스타일의 화면 기준과 점검표로 디자인하는 하네스',
    source: 'https://github.com/vmc-inner-circle/k-style-ui-ux',
    commit: '68afa2ea125d0db6b378e5f7ba03b0e4dd010d8e',
    rawUrl: `${RAW}/vmc-inner-circle/k-style-ui-ux/68afa2ea125d0db6b378e5f7ba03b0e4dd010d8e/plugins/k-style-ui-ux/skills/go/SKILL.md`,
    license: 'MIT',
    tags: ['지침만 적용'],
    installCmd: '/plugin marketplace add vmc-inner-circle/k-style-ui-ux\n/plugin install k-style-ui-ux@k-style-ui-ux',
  },
  {
    id: 'ui-ux-pro-max',
    name: 'ui-ux-pro-max',
    author: 'nextlevelbuilder',
    summary: '스타일, 색, 글꼴 조합 자료를 바탕으로 UI와 UX를 정하는 지침',
    source: 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/main/.claude/skills/ui-ux-pro-max',
    commit: '6ae86f61f520d6ca229d2f40e070410638c908c5',
    rawUrl: `${RAW}/nextlevelbuilder/ui-ux-pro-max-skill/6ae86f61f520d6ca229d2f40e070410638c908c5/.claude/skills/ui-ux-pro-max/SKILL.md`,
    license: 'MIT',
    tags: ['지침만 적용'],
    installCmd: '/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill\n/plugin install ui-ux-pro-max@ui-ux-pro-max-skill',
  },
  {
    id: 'impeccable',
    name: 'impeccable',
    author: 'pbakaus',
    summary: '방향 잡기부터 다듬기까지 프런트엔드 디자인 판단을 돕는 지침',
    source: 'https://github.com/pbakaus/impeccable/tree/main/.claude/skills/impeccable',
    commit: '1d13fcb20341f0fa320477c44c37f338b8294c74',
    rawUrl: `${RAW}/pbakaus/impeccable/1d13fcb20341f0fa320477c44c37f338b8294c74/.claude/skills/impeccable/SKILL.md`,
    license: 'Apache-2.0',
    tags: ['지침만 적용'],
    installCmd: 'npx impeccable install',
  },
  {
    id: 'design-taste-frontend',
    name: 'design-taste-frontend',
    author: 'Leonxlnx',
    summary: '뻔한 AI 느낌을 줄이고 회사 사이트 수준으로 맞추는 지침',
    source: 'https://github.com/Leonxlnx/taste-skill/tree/main/skills/taste-skill',
    commit: 'f6b76575f949707b4e3c37cd86cb44b0b98643e8',
    rawUrl: `${RAW}/Leonxlnx/taste-skill/f6b76575f949707b4e3c37cd86cb44b0b98643e8/skills/taste-skill/SKILL.md`,
    license: 'MIT',
    tags: ['지침만 적용'],
    installCmd: 'npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"',
  },
  {
    id: 'antislop-ui',
    name: 'antislop-ui',
    author: 'miqdadbadjuber',
    summary: 'AI가 만든 티가 나는 색, 레이아웃, 장식을 막는 규칙',
    source: 'https://github.com/miqdadbadjuber/anti-slop/tree/main/skills/antislop-ui',
    commit: '35b54dc660aa7d11428ee62c5788ad36bc18ac3c',
    rawUrl: `${RAW}/miqdadbadjuber/anti-slop/35b54dc660aa7d11428ee62c5788ad36bc18ac3c/skills/antislop-ui/SKILL.md`,
    license: 'MIT',
    tags: ['지침만 적용'],
    installCmd: 'npx skills add miqdadbadjuber/anti-slop',
  },
];

const SUMMARY_MAX = 140;

export function skillIdFrom(name, source) {
  const slug = String(name ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  if (slug) return slug;
  return `custom-${createHash('sha1').update(`${name}|${source}`).digest('hex').slice(0, 8)}`;
}

// GitHub 화면 주소(blob)는 raw 주소로 바꾼다. https만 받는다.
export function toRawUrl(input) {
  let url;
  try {
    url = new URL(String(input).trim());
  } catch {
    throw new Error('https 주소만 넣을 수 있어요');
  }
  if (url.protocol !== 'https:') throw new Error('https 주소만 넣을 수 있어요');
  if (url.hostname === 'github.com') {
    const m = url.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
    if (m) return `${RAW}/${m[1]}/${m[2]}/${m[3]}`;
  }
  return url.href;
}

function authorFrom(source) {
  try {
    const u = new URL(source);
    if (u.hostname === 'github.com' || u.hostname === 'raw.githubusercontent.com') {
      return u.pathname.split('/').filter(Boolean)[0] ?? u.hostname;
    }
    return u.hostname;
  } catch {
    return '';
  }
}

function parseFrontMatter(text) {
  const m = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!m) return { data: {}, body: text };
  const data = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const [, key, rawValue] = kv;
    let value = rawValue.trim();
    if (/^[>|][+-]?$/.test(value)) {
      const parts = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) parts.push(lines[++i].trim());
      value = parts.join(' ');
    } else if (/^(["']).*\1$/.test(value)) {
      value = value.slice(1, -1);
    }
    if (!(key in data)) data[key] = value;
  }
  return { data, body: text.slice(m[0].length) };
}

export function stripFrontMatter(text) {
  return parseFrontMatter(String(text ?? '')).body;
}

function shorten(s) {
  const one = String(s ?? '').replace(/\s+/g, ' ').trim();
  return one.length <= SUMMARY_MAX ? one : `${one.slice(0, SUMMARY_MAX - 1)}…`;
}

// 사용자가 SKILL.md 주소를 붙여 넣어 추가한 스킬을 만든다. 본문은 데이터로만 다룬다.
export function parseSkillMd(text, source) {
  const raw = String(text ?? '');
  const { data, body } = parseFrontMatter(raw);
  let name = (data.name ?? '').trim();
  if (!name) {
    const heading = body.match(/^\s*#\s+(.+?)\s*$/m);
    name = heading ? heading[1].trim() : '';
  }
  if (!name) throw new Error('SKILL.md에서 이름을 찾지 못했어요');
  const firstLine = body.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith('#'));
  return {
    id: skillIdFrom(name, source),
    name,
    author: authorFrom(source),
    summary: shorten(data.description || firstLine || ''),
    source,
    rawUrl: toRawUrl(source),
    tags: ['직접 추가'],
    installCmd: null,
    body: raw,
  };
}
