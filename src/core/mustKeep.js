// 지켜야 할 것 선정과 요구사항 문서 만들기. 모두 AI 없이 코드로 정한다.

export const MAX_ITEMS = 25;

// 상한을 넘으면 이 순서로 뒤에서부터 뺀다 (내비 → 소제목 → 버튼 → 가격). 제목과 히어로 단락은 빼지 않는다.
const TRIM_ORDER = ['nav', 'h2', 'button', 'price'];

export function buildMustKeep(content) {
  const items = [];
  (content.h1 ?? []).forEach((text, i) => items.push({ id: `h1-${i}`, kind: 'h1', text, enabled: true }));
  (content.h2 ?? []).forEach((text, i) => items.push({ id: `h2-${i}`, kind: 'h2', text, enabled: true }));
  if (content.hero) items.push({ id: 'hero', kind: 'hero', text: content.hero, enabled: true });
  (content.buttons ?? []).forEach((b, i) => items.push(link(`button-${i}`, 'button', b)));
  (content.prices ?? []).forEach((text, i) => items.push({ id: `price-${i}`, kind: 'price', text, enabled: true }));
  (content.nav ?? []).forEach((n, i) => items.push(link(`nav-${i}`, 'nav', n)));

  let trimmed = false;
  for (const kind of TRIM_ORDER) {
    for (let i = items.length - 1; i >= 0 && items.length > MAX_ITEMS; i--) {
      if (items[i].kind === kind) {
        items.splice(i, 1);
        trimmed = true;
      }
    }
  }
  return { items, trimmed };
}

function link(id, kind, { text, href }) {
  const item = { id, kind, text, enabled: true };
  if (href) item.href = href;
  return item;
}

const SECTION_TITLES = {
  h1: '대표 제목',
  h2: '소제목',
  hero: '첫 단락',
  button: '버튼',
  price: '가격',
  nav: '내비게이션',
};

function ears(item) {
  const q = `"${item.text}"`;
  switch (item.kind) {
    case 'h1': return `WHEN 방문자가 첫 화면을 볼 때 THE 페이지 SHALL 대표 제목 ${q}을 그대로 보여 준다`;
    case 'h2': return `WHEN 방문자가 페이지를 읽을 때 THE 페이지 SHALL 소제목 ${q}을 그대로 보여 준다`;
    case 'hero': return `WHEN 방문자가 첫 화면을 볼 때 THE 페이지 SHALL 첫 단락 ${q}을 그대로 보여 준다`;
    case 'button':
      return item.href
        ? `WHEN 방문자가 첫 화면을 볼 때 THE 페이지 SHALL ${q} 버튼을 보여 주고 그 링크는 ${item.href} 이어야 한다`
        : `WHEN 방문자가 페이지를 볼 때 THE 페이지 SHALL ${q} 버튼을 보여 준다`;
    case 'price': return `WHEN 방문자가 요금을 볼 때 THE 페이지 SHALL 가격 ${q}을 그대로 보여 준다`;
    case 'nav':
      return item.href
        ? `WHEN 방문자가 내비게이션을 볼 때 THE 페이지 SHALL ${q} 링크를 보여 주고 그 링크는 ${item.href} 이어야 한다`
        : `WHEN 방문자가 내비게이션을 볼 때 THE 페이지 SHALL ${q} 링크를 보여 준다`;
    default: return `THE 페이지 SHALL ${q}을 그대로 보여 준다`;
  }
}

export function toRequirementsMd(items, url) {
  const enabled = items.filter((i) => i.enabled !== false);
  const lines = [
    '# 요구사항: 원본 내용 유지',
    '',
    `원본 페이지: ${url}`,
    '',
    '아래 항목은 원본의 내용이다. 레이아웃, 색, 글꼴, 섹션 순서, 이미지 배치는 자유지만 이 글자와 링크는 바꾸지 않고 그대로 보이게 넣는다.',
    '원본에 없는 가격, 숫자 통계, 후기, 로고는 만들지 않는다.',
    '',
  ];
  let n = 0;
  for (const kind of Object.keys(SECTION_TITLES)) {
    const group = enabled.filter((i) => i.kind === kind);
    if (!group.length) continue;
    n += 1;
    lines.push(`## 요구사항 ${n}: ${SECTION_TITLES[kind]}`, '', '### 수용 기준');
    group.forEach((item, i) => lines.push(`${i + 1}. ${ears(item)}`));
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}
