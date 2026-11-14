// 입력·확인 화면의 계산. 화면 코드에서 빼서 시험한다.

const ASSET_LABELS = [['image', '이미지'], ['logo', '로고'], ['icon', '아이콘'], ['svg', 'SVG'], ['video', '영상']];

/**
 * 수집한 에셋을 종류별로 센다. 에셋 하나는 한 종류에만 센다.
 * 순서: svg → 로고(logo, partner-logo) → 아이콘 → 영상(kind video) → 나머지는 이미지(배경, 영상 포스터, 공유 이미지 포함)
 */
export function countAssets(assets) {
  const counts = { image: 0, logo: 0, icon: 0, svg: 0, video: 0 };
  for (const a of Array.isArray(assets) ? assets : []) {
    if (!a || typeof a !== 'object') continue;
    if (a.kind === 'svg') counts.svg += 1;
    else if (a.role === 'logo' || a.role === 'partner-logo') counts.logo += 1;
    else if (a.role === 'icon') counts.icon += 1;
    else if (a.kind === 'video') counts.video += 1;
    else counts.image += 1;
  }
  return counts;
}

/** 0이 아닌 종류만 화면 순서대로 */
export function assetSummaryParts(counts) {
  return ASSET_LABELS.filter(([key]) => counts[key] > 0).map(([key, label]) => ({ key, label, n: counts[key] }));
}

// 해시는 #about 같은 이름만 보이고, 값이 실린 것(#access_token=…)은 줄인다
const SAFE_HASH = /^#[\w\-.:%/~]*$/;

/** 화면에 보일 링크. 같은 사이트는 경로, 다른 사이트는 주소. 쿼리는 줄이고 해시는 보인다. 검사에는 원래 주소를 쓴다 */
export function linkLabel(href, base) {
  const text = String(href ?? '');
  let u;
  try { u = new URL(text); } catch { u = null; }
  if (!u) {
    const q = text.indexOf('?');
    return q === -1 ? text : `${text.slice(0, q)}?…`;
  }
  let sameSite = false;
  try { sameSite = u.origin === new URL(base).origin; } catch { sameSite = false; }
  const hash = u.hash ? (SAFE_HASH.test(u.hash) ? u.hash : '#…') : '';
  const query = u.search ? '?…' : '';
  if (sameSite) return `${u.pathname || '/'}${query}${hash}`;
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    const q = text.indexOf('?');
    return q === -1 ? text : `${text.slice(0, q)}?…`;
  }
  return `${u.origin}${u.pathname === '/' && !u.search && !u.hash ? '/' : u.pathname}${query}${hash}`;
}

export const COLLAPSE_OVER = 6;

/** 항목이 많은 종류만 처음부터 접는다 */
export function collapsedByDefault(count) {
  return count > COLLAPSE_OVER;
}

/** 지켜야 할 것을 한꺼번에 켜고 끈다. kind를 주면 그 종류만 */
export function setAllEnabled(items, enabled, kind = null) {
  for (const item of items) if (!kind || item.kind === kind) item.enabled = enabled;
  return items;
}

/** 하단 요약 바 글자와 오류 */
export function selectionSummary({ skills, units, concurrency, max }) {
  const text = `${skills}개 선택 · 시안 ${units}개 · 동시 ${concurrency}개`;
  let error = '';
  if (skills === 0) error = '스킬을 하나 이상 골라 주세요';
  else if (units > max) error = `시안은 한 번에 ${max}개까지예요`;
  return { text, error };
}
