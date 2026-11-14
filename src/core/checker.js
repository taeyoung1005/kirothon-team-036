// 시안 HTML 결정론 검사. AI를 쓰지 않는다.
import { parseHTML } from 'linkedom';
import { normalizeText } from './normalize.js';
import { visibleText } from './extract.js';

export const MAX_BYTES = 2 * 1024 * 1024;
const INVENTED_RE = /\d[\d,.]*\s?(%|명|원|만|천|\+|개|배)|[₩$€]\s?\d[\d,.]*/g;
const PLACEHOLDER_BASE = 'http://relative.invalid/';

function isAbsoluteUrl(href) {
  return /^[a-z][a-z0-9+.-]*:/i.test(String(href).trim());
}

function trimSlash(path) {
  return path.replace(/\/+$/, '') || '/';
}

// origin + pathname만 비교한다 (끝 / 무시, 쿼리·해시 무시).
// 기준 주소가 없고 둘 중 하나가 상대 경로면 경로만 비교한다.
export function sameLink(a, b, baseUrl) {
  let ua;
  let ub;
  try {
    ua = new URL(String(a), baseUrl || PLACEHOLDER_BASE);
    ub = new URL(String(b), baseUrl || PLACEHOLDER_BASE);
  } catch {
    return false; // 해석할 수 없는 주소는 같은 링크로 보지 않는다
  }
  const relative = !baseUrl && (!isAbsoluteUrl(a) || !isAbsoluteUrl(b));
  if (relative) return trimSlash(ua.pathname) === trimSlash(ub.pathname);
  return ua.origin === ub.origin && trimSlash(ua.pathname) === trimSlash(ub.pathname);
}

function findExternalForms(document) {
  const found = [];
  for (const form of Array.from(document.querySelectorAll('form[action]'))) {
    const action = (form.getAttribute('action') ?? '').trim();
    if (/^(https?:)?\/\//i.test(action)) found.push(action);
  }
  return found;
}

function findInvented(shown, originalText) {
  const originalNorm = normalizeText(originalText);
  const found = [];
  for (const raw of shown.match(INVENTED_RE) ?? []) {
    const m = raw.replace(/[.,]+$/, '').trim();
    if (!normalizeText(m)) continue;
    if (originalNorm.includes(normalizeText(m))) continue;
    if (!found.includes(m)) found.push(m);
  }
  return found;
}

// 시안이 <html>이나 <body>를 빠뜨려도 읽을 수 있게 감싼 뒤 파싱한다.
// (linkedom은 <html> 없는 입력에서 body를 문서 루트로 만들어 안의 글자를 못 읽는다)
function parseVariant(source) {
  let text = source.replace(/^\s*<!doctype[^>]*>/i, '');
  if (!/<html[\s>]/i.test(text)) {
    text = /<body[\s>]/i.test(text) ? `<html>${text}</html>` : `<html><body>${text}</body></html>`;
  }
  return parseHTML(text).document;
}

/**
 * @param {string} html 시안 out/index.html 내용
 * @param {Array} items MustKeepItem[]
 * @param {string} originalText 원본 fullText (지어낸 숫자 판정 기준)
 * @param {{baseUrl?: string}} opts baseUrl: 원본 주소. 상대 href를 풀 때 쓴다
 */
export function checkHtml(html, items, originalText, opts = {}) {
  const source = String(html ?? '');
  const baseUrl = opts.baseUrl;
  const document = parseVariant(source);

  const shown = visibleText(document);
  const shownNorm = normalizeText(shown);
  const anchors = Array.from(document.querySelectorAll('a[href]')).map((a) => a.getAttribute('href'));

  const enabled = items.filter((i) => i.enabled !== false);
  const results = enabled.map((item) => {
    const textOk = shownNorm.includes(normalizeText(item.text));
    let ok = textOk;
    if (ok && item.href && (item.kind === 'button' || item.kind === 'nav')) {
      ok = anchors.some((href) => sameLink(item.href, href, baseUrl));
    }
    return { id: item.id, kind: item.kind, ok };
  });

  const missingKinds = [];
  for (const r of results) {
    if (!r.ok && !missingKinds.includes(r.kind)) missingKinds.push(r.kind);
  }

  const externalScripts = Array.from(document.querySelectorAll('script[src]')).map((s) => s.getAttribute('src'));
  const externalForms = findExternalForms(document);
  const inventedNumbers = findInvented(shown, originalText ?? '');
  const sizeOk = Buffer.byteLength(source, 'utf8') <= MAX_BYTES;
  const okCount = results.filter((r) => r.ok).length;

  return {
    ok: okCount,
    total: results.length,
    passed:
      okCount === results.length
      && externalScripts.length === 0
      && externalForms.length === 0
      && inventedNumbers.length === 0
      && sizeOk,
    items: results.map(({ id, ok }) => ({ id, ok })),
    missingKinds,
    externalScripts,
    externalForms,
    inventedNumbers,
    sizeOk,
  };
}
