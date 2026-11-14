// 스킬 안에 들어 있는 스타일 목록 읽기, 스킬×스타일을 시안 단위로 펼치기. 순수 함수만 둔다.

export const MAX_UNITS = 12;

const ID_MAX = 64;
// 스타일 본문(steering)에 넣을 열. 파일에 없는 열은 건너뛴다
const DETAIL_COLUMNS = [
  'Style Category', 'Type', 'Keywords', 'Primary Colors', 'Secondary Colors', 'Effects & Animation',
  'Best For', 'Do Not Use For', 'Era/Origin', 'Complexity', 'AI Prompt Keywords', 'CSS/Technical Keywords',
  'Implementation Checklist', 'Design System Variables',
];
const CELL_LIMIT = 1500;

/** RFC 4180 방식 CSV 읽기: 따옴표 안의 쉼표·줄바꿈·큰따옴표 두 개를 처리한다 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * 스타일 CSV에서 쓸 수 있는 스타일 목록을 만든다.
 * @param {string} text
 * @param {{id:string, name:string, status?:string, active?:string, summary?:string}} spec 열 이름
 * @returns {{id:string, name:string, summary:string, detail:string}[]}
 */
export function stylesFromCsv(text, spec) {
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new Error('스타일 목록이 비어 있어요');
  const col = (name) => header.indexOf(name);
  for (const key of [spec.id, spec.name]) {
    if (col(key) === -1) throw new Error(`스타일 목록에 "${key}" 열이 없어요`);
  }
  const statusCol = spec.status ? col(spec.status) : -1;
  const out = [];
  for (const r of rows) {
    if (r.length < 2 || r.every((c) => c === '')) continue;
    if (statusCol !== -1 && r[statusCol] !== spec.active) continue;
    const id = slug(r[col(spec.id)]);
    const name = (r[col(spec.name)] ?? '').trim();
    if (!id || !name) continue;
    const detail = DETAIL_COLUMNS
      .map((c) => [c, col(c) === -1 ? '' : (r[col(c)] ?? '').trim()])
      .filter(([, v]) => v)
      .map(([c, v]) => `- ${c}: ${v.length > CELL_LIMIT ? `${v.slice(0, CELL_LIMIT)}…` : v}`)
      .join('\n');
    const summary = spec.summary && col(spec.summary) !== -1 ? (r[col(spec.summary)] ?? '').trim() : '';
    out.push({ id, name, summary, detail });
  }
  return out;
}

/** 시안 단위 id: 스킬 id + 스타일 id. 규칙(소문자·숫자·하이픈, 64자 이내)을 지키고 서로 겹치지 않게 한다 */
function unitId(baseId, styleId, taken) {
  const s = slug(styleId) || 'style';
  const make = (suffix) => {
    const tail = suffix ? `-${suffix}` : '';
    return `${baseId}-${s}`.slice(0, ID_MAX - tail.length).replace(/-+$/, '') + tail;
  };
  let id = make('');
  for (let n = 2; taken.has(id); n += 1) id = make(String(n));
  taken.add(id);
  return id;
}

/**
 * 고른 스킬과 스킬별로 고른 스타일을 시안 단위로 펼친다. 스타일을 안 고른 스킬은 한 개로 둔다.
 * @param {object[]} skills
 * @param {Record<string, {id:string,name:string,detail:string}[]>} stylesBySkill
 */
export function expandUnits(skills, stylesBySkill = {}) {
  const taken = new Set(skills.map((s) => s.id));
  const units = [];
  for (const skill of skills) {
    const picked = stylesBySkill[skill.id] ?? [];
    if (!picked.length) { units.push(skill); continue; }
    for (const style of picked) {
      units.push({
        ...skill,
        id: unitId(skill.id, style.id, taken),
        baseId: skill.id,
        name: `${skill.name} · ${style.name}`,
        style: { id: style.id, name: style.name, detail: style.detail ?? '' },
      });
    }
    taken.delete(skill.id); // 스타일로 나뉜 스킬의 원래 id는 쓰지 않는다
  }
  if (units.length > MAX_UNITS) throw new Error(`시안은 한 번에 최대 ${MAX_UNITS}개까지 만들 수 있어요`);
  return units;
}

/** 시안 작업 폴더의 `.kiro/steering/style.md` 내용 */
export function styleSteering(style) {
  return `# 이번 시안의 스타일: ${style.name}\n\n디자인 스킬 안의 여러 스타일 중 이번 시안은 이 스타일로 만든다. 다른 스타일로 바꾸지 않는다.\n\n${style.detail}\n`;
}
