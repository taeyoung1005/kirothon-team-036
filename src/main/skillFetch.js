// 스킬 본문을 받아 앱 데이터 폴더에 캐시한다. 저장소에는 본문을 복사하지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DEFAULT_SKILLS, parseSkillMd, toRawUrl } from '../core/skills.js';
import { stylesFromCsv } from '../core/styles.js';
import { skillCacheDir, customSkillsFile } from './paths.js';

const MAX_BYTES = 500_000;
const FETCH_TIMEOUT_MS = 15_000;

async function download(rawUrl) {
  const res = await fetch(rawUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'follow' });
  if (!res.ok) throw new Error(`응답 코드 ${res.status}`);
  const text = await res.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) throw new Error('파일이 너무 커요');
  return text;
}

const cacheFile = (rawUrl) => path.join(skillCacheDir(), `${createHash('sha1').update(rawUrl).digest('hex')}.md`);

/** 스킬 본문. 고정 커밋 주소는 캐시를 쓰고, 없으면 받아서 저장한다. */
export async function loadSkillBody(skill) {
  if (skill.body) return skill.body;
  const file = cacheFile(skill.rawUrl);
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  const text = await download(skill.rawUrl);
  fs.mkdirSync(skillCacheDir(), { recursive: true });
  fs.writeFileSync(file, text);
  return text;
}

/** 스킬 안에 들어 있는 스타일 목록(본문 포함). 고정 커밋 주소라 한 번 받으면 캐시를 쓴다. 스타일이 없는 스킬은 빈 배열 */
export async function loadSkillStyles(skill) {
  const source = skill.stylesSource;
  if (!source) return [];
  const file = cacheFile(source.url);
  let text;
  if (fs.existsSync(file)) text = fs.readFileSync(file, 'utf8');
  else {
    text = await download(source.url);
    fs.mkdirSync(skillCacheDir(), { recursive: true });
    fs.writeFileSync(file, text);
  }
  return stylesFromCsv(text, source);
}

function readCustom() {
  try {
    return JSON.parse(fs.readFileSync(customSkillsFile(), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    console.error('직접 추가한 스킬 목록을 읽지 못했어요', error);
    return [];
  }
}

export function listSkills() {
  return [...DEFAULT_SKILLS, ...readCustom()].map((s) => ({ ...s, hasStyles: Boolean(s.stylesSource) }));
}

/** 사용자가 넣은 SKILL.md 주소를 받아 미리보기용 스킬을 만든다. 저장은 하지 않는다. */
export async function previewSkill(inputUrl) {
  const rawUrl = toRawUrl(inputUrl);
  const text = await download(rawUrl);
  const skill = parseSkillMd(text, String(inputUrl).trim());
  skill.rawUrl = rawUrl;
  return { ...skill, preview: text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 3) };
}

/** 미리보기한 스킬을 목록에 넣는다. 이름이 겹치면 숫자를 붙인다. */
export async function addSkill(inputUrl) {
  const skill = await previewSkill(inputUrl);
  delete skill.preview;
  const customs = readCustom();
  const taken = new Set([...DEFAULT_SKILLS, ...customs].map((s) => s.id));
  const same = customs.find((s) => s.source === skill.source);
  if (same) return same;
  let id = skill.id;
  for (let n = 2; taken.has(id); n += 1) id = `${skill.id}-${n}`;
  const saved = { ...skill, id };
  const { body, ...withoutBody } = saved;
  fs.mkdirSync(skillCacheDir(), { recursive: true });
  fs.writeFileSync(cacheFile(saved.rawUrl), body);
  fs.writeFileSync(customSkillsFile(), JSON.stringify([...customs, withoutBody], null, 2));
  return withoutBody;
}
