// 비교 화면에서 쓰는 계산. 화면 코드에서 빼서 시험할 수 있게 순수 함수로 둔다.
import { isFinished } from './status.js';

export const DESKTOP_W = 1440;
export const MOBILE_W = 390;

export const SCROLL_PREFIX = '__sp_scroll:';

/** 카드 머리에 쓰는 이름 두 줄: 스킬 id와 스타일 이름. 스타일이 없으면 둘째 줄은 비운다 */
export function cardTitle(skill) {
  return { main: skill.baseId ?? skill.name, sub: skill.style?.name ?? '' };
}

/**
 * 미리보기를 그릴 가상 화면 크기와 줄이는 비율.
 * 데스크톱은 1440폭을 카드 폭에 맞춰 줄이고, 모바일은 390폭을 그대로(카드가 더 좁을 때만 줄여) 가운데에 둔다.
 * @returns {{scale:number, width:number, height:number, left:number} | null}
 */
export function fitView(mode, holderW, holderH) {
  if (!(holderW > 0) || !(holderH > 0)) return null;
  const width = mode === 'mobile' ? MOBILE_W : DESKTOP_W;
  const scale = Math.min(1, holderW / width);
  return { scale, width, height: holderH / scale, left: mode === 'mobile' ? (holderW - width * scale) / 2 : 0 };
}

/** 완료 순은 끝난 시각 순(미완료는 뒤), 이름 순은 이름 글자 순. 같으면 들어온 순서를 지킨다 */
export function sortVariants(variants, mode) {
  const rank = (v) => (isFinished(v.status) ? v.endedAt ?? 0 : Number.POSITIVE_INFINITY);
  const indexed = variants.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => {
    let d = 0;
    if (mode === 'name') d = a.v.skill.name.localeCompare(b.v.skill.name);
    else {
      const ra = rank(a.v);
      const rb = rank(b.v);
      d = ra === rb ? 0 : ra < rb ? -1 : 1;
    }
    return d || a.i - b.i;
  });
  return indexed.map((x) => x.v);
}

/** `통과한 것만` 필터: 완료이고 검사를 통과한 시안 */
export function isPassedVariant(v) {
  return v.status === 'done' && v.check?.passed === true;
}

/** 스크롤 위치를 0~1 비율로. 넘칠 길이가 없으면 0 */
export function scrollRatio(top, max) {
  if (!(max > 0) || !Number.isFinite(top)) return 0;
  return Math.min(1, Math.max(0, top / max));
}

/** 비율을 다른 카드의 스크롤 길이에 적용한 위치 */
export function scrollTarget(ratio, max) {
  if (!(max > 0) || !Number.isFinite(ratio)) return 0;
  return Math.round(Math.min(1, Math.max(0, ratio)) * max);
}

/** 시안 안에서 호스트로 스크롤 비율을 알릴 때 쓰는 글자 */
export function scrollMessage(ratio) {
  return `${SCROLL_PREFIX}${ratio}`;
}

/** 시안이 보낸 글자에서 비율만 읽는다. 형식이 다르거나 0~1 밖이면 null (시안은 믿지 않는 글자를 보낼 수 있다) */
export function parseScrollMessage(text) {
  const m = /^__sp_scroll:(\d+(?:\.\d+)?)$/.exec(String(text ?? ''));
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 0 && n <= 1 ? n : null;
}

/** 사이드바 접힘을 같이 기억하는 화면 묶음: 비교 단계(비교, 크게 보기)와 그 밖 */
export function sidebarGroup(screen) {
  return screen === 'compare' || screen === 'detail' ? 'compare' : 'other';
}
