// 원본 페이지에서 지켜야 할 재료를 뽑는다.
// 이 파일은 import가 없는 자기 완결 파일이다. 같은 소스를 원본 페이지 안에 주입해서도 돌리고(실제 DOM),
// 시험에서는 linkedom 문서로 돌린다. 그래서 DOM 표준 API만 쓴다.

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'TITLE', 'META', 'LINK', 'SVG', 'IFRAME']);
const INLINE_TAGS = new Set(['A', 'SPAN', 'STRONG', 'EM', 'B', 'I', 'U', 'SMALL', 'CODE', 'MARK', 'SUB', 'SUP', 'ABBR', 'LABEL', 'FONT', 'S', 'DEL', 'INS', 'TIME']);
const PRICE_RE = /(₩\s?\d[\d,]*|\d[\d,]*\s?원|\$\s?\d[\d,.]*|€\s?\d[\d,.]*)/g;
const BUTTON_CLASS_RE = /btn|button|cta/i;
const MAX_IMAGES = 30;

function collapse(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

function hiddenByAttributes(el) {
  if (el.hasAttribute && el.hasAttribute('hidden')) return true;
  const style = (el.getAttribute && el.getAttribute('style')) || '';
  return /display\s*:\s*none|visibility\s*:\s*hidden/i.test(style);
}

function makeVisibility(opts) {
  if (opts && typeof opts.isVisible === 'function') return (el) => opts.isVisible(el);
  return (el) => {
    for (let cur = el; cur && cur.nodeType === 1; cur = cur.parentElement) {
      if (SKIP_TAGS.has(cur.tagName.toUpperCase()) && cur.tagName.toUpperCase() !== 'HEAD') return false;
      if (hiddenByAttributes(cur)) return false;
    }
    return true;
  };
}

function textOf(node, visible) {
  const parts = [];
  const walk = (n) => {
    for (const child of Array.from(n.childNodes)) {
      if (child.nodeType === 3) {
        parts.push(child.data);
      } else if (child.nodeType === 1) {
        const tag = child.tagName.toUpperCase();
        if (SKIP_TAGS.has(tag)) continue;
        if (hiddenByAttributes(child)) continue;
        if (tag === 'BR') { parts.push(' '); continue; }
        const block = !INLINE_TAGS.has(tag);
        if (block) parts.push(' ');
        walk(child);
        if (block) parts.push(' ');
      }
    }
  };
  walk(node);
  return collapse(parts.join(''));
}

function absolute(href, baseUrl) {
  const raw = String(href ?? '').trim();
  if (!raw || /^javascript:/i.test(raw)) return null;
  try {
    return new URL(raw, baseUrl).href;
  } catch {
    return null; // 해석할 수 없는 주소는 항목에서 뺀다
  }
}

function uniqueBy(list, key) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

export function visibleText(document, opts = {}) {
  const visible = makeVisibility(opts);
  return document.body ? textOf(document.body, visible) : '';
}

export function extractContent(document, baseUrl, opts = {}) {
  const visible = makeVisibility(opts);
  const all = (selector) => Array.from(document.querySelectorAll(selector));
  const shownText = (el) => (visible(el) ? textOf(el, visible) : '');

  const title = collapse(document.querySelector('title')?.textContent ?? '');
  const description = collapse(
    document.querySelector('meta[name="description"]')?.getAttribute('content')
      ?? document.querySelector('meta[property="og:description"]')?.getAttribute('content')
      ?? '',
  );

  const h1 = all('h1').map(shownText).filter(Boolean);
  const h2 = all('h2').map(shownText).filter(Boolean);

  // 히어로 첫 단락: 첫 h1 다음에 오는 첫 p (20자 이상)
  let hero = null;
  const flow = all('h1, p');
  const firstH1 = flow.findIndex((el) => el.tagName.toUpperCase() === 'H1' && shownText(el));
  if (firstH1 >= 0) {
    for (const el of flow.slice(firstH1 + 1)) {
      if (el.tagName.toUpperCase() !== 'P') continue;
      const t = shownText(el);
      if (t.length >= 20) { hero = t; break; }
    }
  }

  // 내비: nav 안 링크. nav가 없으면 header 안 링크
  const inNav = (el) => Boolean(el.closest('nav, [role="navigation"]'));
  const linkInfo = (a) => ({ text: shownText(a), href: absolute(a.getAttribute('href'), baseUrl) });
  // 버튼처럼 생긴 <a>: 클래스 이름이 btn·button·cta이거나, 호출한 쪽이 넘긴 판정(looksLikeButton)이 참
  // (페이지 안에서는 계산된 배경·테두리·여백으로 판정한다. 유틸리티 클래스만 쓰는 사이트 대응)
  const isBtnClass = (el) => BUTTON_CLASS_RE.test(el.getAttribute('class') ?? '')
    || (typeof opts.looksLikeButton === 'function' && Boolean(opts.looksLikeButton(el)));
  let navAnchors = all('a[href]').filter((a) => inNav(a) && !isBtnClass(a));
  if (!navAnchors.length) navAnchors = all('header a[href]').filter((a) => !isBtnClass(a));
  const navSet = new Set(navAnchors);
  const nav = uniqueBy(
    navAnchors.map(linkInfo).filter((l) => l.text && l.text.length <= 30 && l.href),
    (l) => `${l.text}|${l.href}`,
  );

  // 버튼: <button>, role=button, 버튼처럼 생긴 <a>
  const firstSection = document.querySelector('section');
  const buttonLike = [];
  for (const el of all('button, [role="button"], a[href]')) {
    if (!visible(el)) continue;
    const tag = el.tagName.toUpperCase();
    if (tag === 'A') {
      if (navSet.has(el)) continue;
      const parent = el.parentElement;
      const parentOk = parent && (parent.tagName.toUpperCase() === 'HEADER' || parent === firstSection);
      if (!isBtnClass(el) && !parentOk) continue;
      if (!isBtnClass(el) && inNav(el)) continue;
      const info = linkInfo(el);
      buttonLike.push({ text: info.text, href: info.href ?? '' });
    } else {
      if (el.closest('a[href]')) continue;
      buttonLike.push({ text: shownText(el), href: '' });
    }
  }
  const buttons = uniqueBy(
    buttonLike.filter((b) => b.text.length >= 1 && b.text.length <= 30),
    (b) => `${b.text}|${b.href}`,
  );

  const body = document.body;
  const fullText = body ? textOf(body, visible) : '';

  const prices = uniqueBy(
    (fullText.match(PRICE_RE) ?? []).map((p) => p.replace(/[.,]+$/, '').trim()),
    (p) => p,
  );

  const images = uniqueBy(
    all('img').filter(visible).map((img) => absolute(img.getAttribute('src') ?? img.getAttribute('data-src'), baseUrl))
      .filter((u) => u && /^https?:/i.test(u))
      .map((u) => ({ u })),
    (o) => o.u,
  ).map((o) => o.u).slice(0, MAX_IMAGES);

  return { url: baseUrl, title, description, h1, h2, hero, buttons, prices, nav, images, fullText };
}
