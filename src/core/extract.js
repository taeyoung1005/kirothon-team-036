// 원본 페이지에서 지켜야 할 재료를 뽑는다.
// 이 파일은 import가 없는 자기 완결 파일이다. 같은 소스를 원본 페이지 안에 주입해서도 돌리고(실제 DOM),
// 시험에서는 linkedom 문서로 돌린다. 그래서 DOM 표준 API만 쓴다.

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'TITLE', 'META', 'LINK', 'SVG', 'IFRAME']);
const INLINE_TAGS = new Set(['A', 'SPAN', 'STRONG', 'EM', 'B', 'I', 'U', 'SMALL', 'CODE', 'MARK', 'SUB', 'SUP', 'ABBR', 'LABEL', 'FONT', 'S', 'DEL', 'INS', 'TIME']);
const PRICE_RE = /(₩\s?\d[\d,]*|\d[\d,]*\s?원|\$\s?\d[\d,.]*|€\s?\d[\d,.]*)/g;
const BUTTON_CLASS_RE = /btn|button|cta/i;
const MAX_IMAGES = 30;
const MAX_ASSETS = 80;
const MAX_SVG_CHARS = 3000;
const ICON_MAX_PX = 64;

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


// ----- 에셋 수집: 이미지, 배경, 영상, 인라인 SVG, 파비콘, 공유 이미지를 역할과 자리(가까운 제목)와 함께 모은다.
// 시안을 만드는 에이전트가 원본의 에셋을 알맞은 자리에 쓰게 하려는 목록이다. data: 주소는 너무 커서 뺀다.

function pickSrcset(srcset) {
  const candidates = String(srcset ?? '').split(',').map((c) => c.trim().split(/\s+/)).filter((c) => c[0]);
  if (!candidates.length) return '';
  const weight = (c) => parseFloat(c[1] ?? '1') || 1;
  return candidates.reduce((best, c) => (weight(c) >= weight(best) ? c : best))[0];
}

function backgroundUrls(value) {
  const urls = [];
  for (const m of String(value ?? '').matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)) if (m[2]) urls.push(m[2]);
  return urls;
}

function roleFor({ kind, el, alt, url, width, height, inHeader }) {
  if (kind === 'favicon') return 'icon';
  if (kind === 'social') return 'social';
  if (kind === 'video' || kind === 'video-poster') return 'video';
  if (kind === 'background') return 'background';
  const hint = `${alt} ${url ?? ''} ${(el.getAttribute && el.getAttribute('class')) || ''} ${(el.getAttribute && el.getAttribute('id')) || ''}`;
  const big = Math.max(width || 0, height || 0);
  // 헤더 안의 로고는 이 사이트의 로고. 본문에 있는 로고는 파트너·고객 로고 줄일 가능성이 커서 따로 구분한다
  const logoLike = /logo|brand|wordmark/i.test(hint);
  if (inHeader && (logoLike || (big > 0 && big <= 240 && kind === 'image'))) return 'logo';
  if (logoLike) return 'partner-logo';
  if (kind === 'svg') return big && big > ICON_MAX_PX ? 'graphic' : 'icon';
  if (/icon/i.test(hint) || (big > 0 && big <= ICON_MAX_PX)) return 'icon';
  if (/avatar|profile|portrait/i.test(hint)) return 'avatar';
  return 'photo';
}

export function collectAssets(document, baseUrl, opts = {}) {
  const shown = (el) => {
    if (typeof opts.isVisible === 'function') return opts.isVisible(el);
    for (let cur = el; cur && cur.nodeType === 1; cur = cur.parentElement) if (hiddenByAttributes(cur)) return false;
    return true;
  };
  const sizeOf = (el) => {
    const hooked = typeof opts.sizeOf === 'function' ? opts.sizeOf(el) : null;
    if (hooked && hooked.width) return { width: Math.round(hooked.width), height: Math.round(hooked.height) };
    return { width: parseInt(el.getAttribute('width'), 10) || 0, height: parseInt(el.getAttribute('height'), 10) || 0 };
  };
  const headingText = (el) => collapse(el.textContent ?? '').slice(0, 80);
  const found = [];
  const add = (record) => { if (record) found.push(record); };
  const isHeading = (el) => /^H[1-3]$/.test(el.tagName.toUpperCase());

  let lastHeading = '';
  const root = document.body ?? document.documentElement;
  const elements = Array.from(root.querySelectorAll('*'));
  for (const el of elements) {
    const tag = el.tagName.toUpperCase();
    if (isHeading(el) && shown(el)) { lastHeading = headingText(el); continue; }
    const inHeader = Boolean(el.closest('header, nav, [role="banner"]'));
    const base = (kind, url, extra = {}) => {
      const { width, height } = sizeOf(el);
      const alt = collapse(el.getAttribute('alt') ?? el.getAttribute('aria-label') ?? '');
      return { kind, url, alt, width, height, inHeader, section: lastHeading, ...extra, role: roleFor({ kind, el, alt, url, width, height, inHeader }) };
    };
    const okUrl = (u) => { const a = absolute(u, baseUrl); return a && /^https?:/i.test(a) ? a : null; };

    if (tag === 'IMG' && shown(el)) {
      const src = el.getAttribute('src') || el.getAttribute('data-src') || pickSrcset(el.getAttribute('srcset') || el.getAttribute('data-srcset'));
      // src(또는 data-src)가 없고 srcset만 있으면 가장 큰 후보를 쓴다
      const url = okUrl(src);
      if (url) add(base('image', url));
    } else if (tag === 'VIDEO' && shown(el)) {
      const poster = okUrl(el.getAttribute('poster'));
      if (poster) add(base('video-poster', poster));
      const src = okUrl(el.getAttribute('src') || el.querySelector('source[src]')?.getAttribute('src'));
      if (src) add(base('video', src));
    } else if (tag === 'SVG' && shown(el) && !el.closest('button, a[href] svg svg')) {
      const markup = String(el.outerHTML ?? '');
      const { width, height } = sizeOf(el);
      if (markup && markup.length <= MAX_SVG_CHARS && (!width || width >= 12)) add(base('svg', undefined, { markup }));
    }
    // CSS 배경: 페이지 안에서는 계산된 스타일을, 그 밖에서는 인라인 style 속성을 읽는다
    const bgValue = typeof opts.backgroundImageOf === 'function' ? opts.backgroundImageOf(el) : (el.getAttribute('style') ?? '').match(/background(?:-image)?\s*:[^;]*/i)?.[0];
    if (bgValue && /url\(/i.test(bgValue) && shown(el) && tag !== 'HTML') {
      const inner = Array.from(el.querySelectorAll('h1, h2, h3')).find((h) => shown(h));
      for (const raw of backgroundUrls(bgValue)) {
        const url = okUrl(raw);
        if (url) add(base('background', url, { section: inner ? headingText(inner) : lastHeading }));
      }
    }
  }
  const head = document.head ?? document.documentElement;
  for (const link of Array.from(head.querySelectorAll('link[rel*="icon"]'))) {
    const url = absolute(link.getAttribute('href'), baseUrl);
    if (url && /^https?:/i.test(url)) add({ kind: 'favicon', role: 'icon', url, alt: '', width: 0, height: 0, inHeader: false, section: '' });
  }
  const og = head.querySelector('meta[property="og:image"]')?.getAttribute('content');
  const ogUrl = og ? absolute(og, baseUrl) : null;
  if (ogUrl && /^https?:/i.test(ogUrl)) add({ kind: 'social', role: 'social', url: ogUrl, alt: '', width: 0, height: 0, inHeader: false, section: '' });

  // 같은 에셋(주소 또는 SVG 마크업)은 한 번만 두고 쓰인 횟수를 센다
  const merged = new Map();
  for (const a of found) {
    const key = `${a.kind}|${a.url ?? a.markup}`;
    const prev = merged.get(key);
    if (prev) prev.uses += 1; else merged.set(key, { ...a, uses: 1 });
  }
  return Array.from(merged.values()).slice(0, MAX_ASSETS).map((a, i) => ({ id: `asset-${i + 1}`, ...a }));
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

  const assets = collectAssets(document, baseUrl, opts);

  return { url: baseUrl, title, description, h1, h2, hero, buttons, prices, nav, images, assets, fullText };
}
