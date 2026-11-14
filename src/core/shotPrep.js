// 전체 페이지 캡처 직전에 원본 페이지를 "한 번만 그려지는 상태"로 만드는 규칙.
// 이 파일은 import가 없는 자기 완결 파일이다. 같은 소스를 원본 페이지 안에 주입해서 돌리고(실제 DOM),
// 시험에서는 linkedom 문서와 가짜 훅으로 돌린다. 캡처 뒤 restore()로 되돌리므로 추출 결과에는 영향이 없다.

const SKIP_TEXT_RE = /건너\s?뛰기|본문(으로|바로)|skip\s*(to|navigation|nav|main|content|link)|jump\s+to\s+(main|content)/i;
const SHIFT_EPSILON_PX = 0.5;
const SCROLL_STEP_RATIO = 0.5;

/** 전체 캡처 동안 바꿔 둘 position 값. 바꿀 필요가 없으면 null */
export function flattenedPosition(position) {
  const p = String(position ?? '').trim().toLowerCase();
  if (p === 'fixed') return 'absolute';
  if (p === 'sticky' || p === '-webkit-sticky') return 'static';
  return null;
}

/** position을 바꾸기 전과 뒤의 사각형 차이를 되돌릴 이동량으로 돌려준다. 차이가 없으면 null */
export function shiftFor(before, after) {
  const dx = before.left - after.left;
  const dy = before.top - after.top;
  if (Math.abs(dx) < SHIFT_EPSILON_PX && Math.abs(dy) < SHIFT_EPSILON_PX) return null;
  return { dx, dy };
}

/**
 * 화면 밖에 숨겨 둔 건너뛰기 링크인지 판정한다. 맨 위(스크롤 0)에서 잰 사각형을 받는다.
 * 글자가 건너뛰기 꼴이어야 하고, 고정·절대 위치이거나 화면 밖이거나 1px로 줄어 있어야 한다.
 * 일부러 화면에 보이게 둔 평범한 링크는 건드리지 않는다.
 */
export function isSkipLink({ tag, text, position, rect, viewport }) {
  if (String(tag).toUpperCase() !== 'A') return false;
  if (!SKIP_TEXT_RE.test(String(text ?? ''))) return false;
  const pos = String(position ?? '').toLowerCase();
  const offscreen = rect.top + rect.height <= 0 || rect.left + rect.width <= 0 || rect.left >= viewport.width || rect.top >= viewport.height * 4;
  const tiny = rect.width <= 1 || rect.height <= 1;
  return pos === 'fixed' || pos === 'absolute' || offscreen || tiny;
}

/** 한 걸음 내려갈 위치. 한 화면의 절반씩 내려가고 바닥에 닿으면 done */
export function nextScrollStep({ y, scrollHeight, viewportHeight }) {
  const next = y + Math.max(200, Math.round(viewportHeight * SCROLL_STEP_RATIO));
  return { y: next, done: next + viewportHeight >= scrollHeight };
}

/**
 * 스크롤 0 상태의 문서를 캡처용으로 바꾼다.
 * - 건너뛰기 링크: visibility hidden
 * - position fixed → absolute (자리가 달라지면 translate로 맞춤), sticky → static
 * @param {Document} doc
 * @param {{positionOf:(el:Element)=>string, rectOf:(el:Element)=>{left:number,top:number,width:number,height:number}, viewport:()=>{width:number,height:number}}} hooks
 * @returns {{flattened:number, hiddenSkipLinks:number, restore:()=>void}}
 */
export function applyShotPrep(doc, hooks) {
  const saved = []; // { el, style }  style은 처음 style 속성 문자열(없으면 null)
  const remember = (el) => saved.push({ el, style: el.getAttribute('style') });
  const put = (el, name, value) => el.style.setProperty(name, value, 'important');
  const viewport = hooks.viewport();
  let flattened = 0;
  let hiddenSkipLinks = 0;

  for (const el of Array.from(doc.querySelectorAll('body *'))) {
    const position = hooks.positionOf(el);
    const target = flattenedPosition(position);
    // 글자와 사각형을 읽는 일은 링크에만 한다. 요소가 많은 페이지에서 textContent를 매번 읽으면 느리다
    const skip = el.tagName === 'A' && isSkipLink({
      tag: el.tagName,
      text: el.textContent || el.getAttribute('aria-label') || '',
      position,
      rect: hooks.rectOf(el),
      viewport,
    });
    if (!skip && !target) continue;
    remember(el);
    if (skip) {
      put(el, 'visibility', 'hidden');
      hiddenSkipLinks += 1;
      continue;
    }
    const before = hooks.rectOf(el);
    put(el, 'position', target);
    flattened += 1;
    if (target === 'absolute') {
      const shift = shiftFor(before, hooks.rectOf(el));
      if (shift) put(el, 'translate', `${shift.dx}px ${shift.dy}px`);
    }
  }

  const restore = () => {
    for (const { el, style } of saved) {
      if (style === null) el.removeAttribute('style');
      else el.setAttribute('style', style);
    }
    saved.length = 0;
  };
  return { flattened, hiddenSkipLinks, restore };
}
