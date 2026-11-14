// 아주 작은 DOM 도우미. innerHTML을 쓰지 않아 글자가 코드로 해석되지 않는다.
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function mount(el, ...children) {
  clear(el);
  append(el, children);
  return el;
}

export function toast(message, ms = 3200) {
  const el = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export function formatDurationKo(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}초`;
  return `${Math.floor(total / 60)}분 ${String(total % 60).padStart(2, '0')}초`;
}

export function relativeTime(ts, now = Date.now()) {
  const diff = Math.max(0, now - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return '지금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  return day === 1 ? '어제' : `${day}일 전`;
}

// 화면에 보이는 링크에서 쿼리 문자열을 줄인다. 긴 토큰이 화면과 캡처에 그대로 남지 않게 하려는 표시용이고, 검사에는 원래 주소를 쓴다
export function displayHref(href) {
  const text = String(href ?? '');
  const i = text.indexOf('?');
  return i === -1 ? text : `${text.slice(0, i)}?…`;
}
