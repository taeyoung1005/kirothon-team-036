import { h, formatDuration, formatDurationKo } from '../lib/dom.js';
import { go, registerScreen, state, toggleSidebar } from '../app.js';
import { subscribe } from '../lib/live.js';
import { pickedPanel } from '../lib/picked.js';
import { STATUS_LABEL, isFinished } from '../../src/core/status.js';
import {
  SCROLL_PREFIX, cardTitle, fitView, sortVariants, isPassedVariant,
  scrollRatio, scrollTarget, parseScrollMessage,
} from '../../src/core/compareView.js';

const PARTITION = 'skillpick-variants';
const MISSING_LABEL = { h1: '제목 누락', h2: '소제목 누락', hero: '첫 단락 누락', button: '버튼 누락', price: '가격 누락', nav: '내비 누락' };
// 같이 스크롤: 한 카드를 스크롤하면 다른 카드를 옮기고, 그 카드가 다시 알리는 스크롤은 이 시간 동안 무시한다
const SYNC_QUIET_MS = 250;
const SYNC_MIN_DELTA = 0.001;

const hostOf = (url) => { try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; } };

// 시안(<webview>) 안에 넣는 코드. 스크롤 비율만 콘솔 글자로 알린다. 호스트는 형식이 맞는 숫자만 읽는다
const SYNC_ON = `(() => {
  if (window.__spSync) return;
  let raf = 0;
  const send = () => {
    raf = 0;
    const e = document.scrollingElement || document.documentElement;
    const max = e.scrollHeight - e.clientHeight;
    console.log('${SCROLL_PREFIX}' + (max > 0 ? Math.min(1, Math.max(0, e.scrollTop / max)) : 0));
  };
  window.__spSync = () => { if (!raf) raf = requestAnimationFrame(send); };
  window.addEventListener('scroll', window.__spSync, { passive: true });
})()`;
const SYNC_OFF = `(() => {
  if (!window.__spSync) return;
  window.removeEventListener('scroll', window.__spSync);
  delete window.__spSync;
})()`;
const syncSet = (ratio) => `(() => {
  const e = document.scrollingElement || document.documentElement;
  e.scrollTo({ top: Math.round((e.scrollHeight - e.clientHeight) * ${Number(ratio)}), behavior: 'instant' });
})()`;

// 경고 꼬리표: 빠진 종류, 지어낸 숫자, 콘솔 오류 등. 하나도 없으면 빈 배열
export function warningTags(v) {
  const c = v.check;
  if (!c) return [];
  const tags = [];
  for (const kind of c.missingKinds ?? []) tags.push(MISSING_LABEL[kind] ?? `${kind} 누락`);
  if (c.inventedNumbers?.length) tags.push(`지어낸 숫자 ${c.inventedNumbers.length}`);
  if (c.externalScripts?.length) tags.push(`외부 스크립트 ${c.externalScripts.length}`);
  if (c.externalForms?.length) tags.push(`외부 전송 폼 ${c.externalForms.length}`);
  if (c.sizeOk === false) tags.push('파일이 너무 커요');
  if ((v.consoleErrors ?? 0) > 0) tags.push(`콘솔 오류 ${v.consoleErrors}`);
  return tags;
}

function render() {
  const root = h('div', { class: 'compare' });
  if (!state.run) { root.append(h('p', { class: 'hint' }, '불러올 비교가 없어요')); return root; }
  let run = state.run;
  const ui = { mode: state.viewMode ?? 'desktop', onlyPassed: false, sort: 'finish', sync: false };
  const cards = new Map(); // skillId -> { el, bodyHolder, footHolder, sig, bodyKey, wv, ready }
  const syncs = new Map(); // 카드 키('original' 또는 skillId) -> { last, quietUntil, apply }

  const grid = h('div', { class: `card-grid ${ui.mode === 'mobile' ? 'mobile' : ''}` });
  const wrap = h('div', { class: 'grid-wrap' }, grid);
  const note = h('p', { class: 'compare-note' });
  const dBtn = h('button', { type: 'button' }, '데스크톱');
  const mBtn = h('button', { type: 'button' }, '모바일');
  const onlyBox = h('input', { type: 'checkbox' });
  const sortSel = h('select', { class: 'select', 'aria-label': '정렬' },
    h('option', { value: 'finish' }, '정렬: 완료 순'), h('option', { value: 'name' }, '정렬: 이름 순'));
  const pickedSlot = h('div', { class: 'picked-slot hidden' });

  // ----- 같이 스크롤
  const logFail = (what) => (error) => console.error(`${what}: ${error.message}`);
  const propagate = (fromKey, ratio) => {
    if (!ui.sync) return;
    const now = Date.now();
    const src = syncs.get(fromKey);
    if (!src || now < src.quietUntil || Math.abs(ratio - src.last) < SYNC_MIN_DELTA) return;
    src.last = ratio;
    for (const [key, t] of syncs) {
      if (key === fromKey || cards.get(key)?.el.classList.contains('hidden')) continue;
      t.quietUntil = now + SYNC_QUIET_MS;
      t.last = ratio;
      t.apply(ratio);
    }
  };
  const syncCode = (c, on) => {
    if (!c.ready) return;
    c.wv.executeJavaScript(on ? SYNC_ON : SYNC_OFF).catch(logFail('같이 스크롤 설정에 실패했어요'));
  };

  // ----- 원본 카드 (점선, 맨 앞). 실제 렌더 대신 수집 때 찍은 전체 캡처를 쓴다
  const origImg = h('img', { alt: '원본 캡처' });
  const origShot = h('div', { class: 'shot' }, origImg);
  const original = h('article', { class: 'vcard original', 'aria-label': '원본' },
    h('div', { class: 'vcard-head' }, h('span', { class: 'titles' }, h('span', { class: 'name' }, '원본'), h('span', { class: 'sub' }, hostOf(run.url)))),
    h('div', { class: 'vcard-body' }, origShot),
    h('div', { class: 'vcard-foot' }, h('span', { class: 'time' }, '수집할 때 찍은 화면')));
  const setOriginalImg = () => { origImg.src = window.skillpick.assetUrl(run.id, 'original', ui.mode); };
  syncs.set('original', {
    last: 0, quietUntil: 0,
    apply: (ratio) => { origShot.scrollTop = scrollTarget(ratio, origShot.scrollHeight - origShot.clientHeight); },
  });
  origShot.addEventListener('scroll', () => propagate('original', scrollRatio(origShot.scrollTop, origShot.scrollHeight - origShot.clientHeight)), { passive: true });

  // ----- 크기 맞추기: 시안은 1440(모바일은 390)폭으로 그린 뒤 카드 폭에 맞게 줄인다
  const fit = (holder) => {
    const wv = holder.querySelector('webview');
    if (!wv) return;
    const rect = holder.getBoundingClientRect();
    const f = fitView(ui.mode, rect.width, rect.height);
    if (!f) return;
    Object.assign(wv.style, { width: `${f.width}px`, height: `${f.height}px`, left: `${f.left}px`, transform: `scale(${f.scale})` });
  };
  const ro = new ResizeObserver(() => { for (const c of cards.values()) fit(c.bodyHolder); });

  // ----- 고르기: 크게 보기를 거치지 않고 화면 7 패널을 바로 연다
  const closePicked = () => { pickedSlot.classList.add('hidden'); pickedSlot.replaceChildren(); };
  const openPicked = (skillId) => {
    const v = run.variants.find((x) => x.skillId === skillId);
    if (!v) return;
    pickedSlot.classList.remove('hidden');
    pickedSlot.replaceChildren(pickedPanel(run, v, closePicked));
  };

  // ----- 카드 하나 만들기/갱신
  const footFor = (v) => {
    const elapsed = v.startedAt ? (v.endedAt ?? Date.now()) - v.startedAt : 0;
    if (v.status === 'done' && v.check) {
      const good = v.check.passed;
      return [
        h('div', { class: 'info' },
          h('span', { class: `badge ${good ? 'ok' : 'warn'}` }, `${good ? '✓' : '⚠'} ${v.check.ok}/${v.check.total}`),
          ...warningTags(v).map((t) => h('span', { class: 'badge warn' }, t)),
          h('span', { class: 'time mono' }, formatDurationKo(elapsed))),
        h('button', { class: 'btn primary pick-btn', type: 'button', onclick: () => openPicked(v.skillId) }, '이걸로 고르기'),
      ];
    }
    if (v.status === 'done') {
      return [
        h('div', { class: 'info' }, h('span', { class: 'badge' }, STATUS_LABEL.done), h('span', { class: 'time mono' }, formatDurationKo(elapsed))),
        h('button', { class: 'btn primary pick-btn', type: 'button', onclick: () => openPicked(v.skillId) }, '이걸로 고르기'),
      ];
    }
    if (isFinished(v.status)) {
      const kind = v.status === 'stopped' ? '' : 'bad';
      const logBox = h('pre', { class: 'logbox mono hidden' });
      return [
        h('div', { class: 'info' },
          h('span', { class: `badge ${kind}` }, STATUS_LABEL[v.status]),
          v.startedAt ? h('span', { class: 'time mono' }, formatDurationKo(elapsed)) : null,
          h('button', {
            class: 'link-btn', type: 'button',
            onclick: async (e) => {
              if (logBox.classList.contains('hidden')) logBox.textContent = (await window.skillpick.readLog(run.id, v.skillId)) || '아직 로그가 없어요';
              logBox.classList.toggle('hidden');
              e.currentTarget.textContent = logBox.classList.contains('hidden') ? '로그 보기' : '로그 닫기';
            },
          }, '로그 보기')),
        v.error ? h('p', { class: 'reason' }, v.error) : null,
        logBox,
      ];
    }
    return [
      h('div', { class: 'info' },
        h('span', { class: `badge ${v.status === 'retrying' ? 'warn' : v.status === 'queued' ? '' : 'accent'}` }, STATUS_LABEL[v.status]),
        v.startedAt ? h('span', { class: 'time mono', dataset: { elapsed: v.skillId } }, formatDuration(elapsed)) : null),
    ];
  };

  const bodyFor = (v) => {
    if (v.status === 'done') {
      const wv = h('webview', { src: window.skillpick.variantUrl(run.id, v.skillId), partition: PARTITION });
      return { key: `done-${v.endedAt}`, node: wv };
    }
    if (isFinished(v.status)) return { key: `end-${v.status}`, node: null, text: v.status === 'stopped' ? '멈췄어요' : '이 시안은 만들어지지 않았어요' };
    return { key: `wait-${v.status}`, node: null, text: `${STATUS_LABEL[v.status]}`, spin: v.status !== 'queued' };
  };

  const attachWebview = (c, skillId, wv) => {
    c.wv = wv;
    c.ready = false;
    wv.addEventListener('dom-ready', () => { c.ready = true; if (ui.sync) syncCode(c, true); });
    wv.addEventListener('console-message', (e) => {
      const ratio = parseScrollMessage(e.message);
      if (ratio !== null) propagate(skillId, ratio);
    });
    syncs.set(skillId, {
      last: 0, quietUntil: 0,
      apply: (ratio) => { if (c.ready) c.wv.executeJavaScript(syncSet(ratio)).catch(logFail('같이 스크롤 이동에 실패했어요')); },
    });
  };

  const ensureCard = (v) => {
    let c = cards.get(v.skillId);
    if (!c) {
      const title = cardTitle(v.skill);
      const bodyHolder = h('div', { class: 'vcard-body' });
      const footHolder = h('div', { class: 'vcard-foot' });
      const head = h('button', {
        type: 'button', class: 'vcard-head', title: `${v.skill.name} 크게 보기`, 'aria-label': `${v.skill.name} 크게 보기`,
        onclick: () => go('detail', { skillId: v.skillId }),
      }, h('span', { class: 'titles' }, h('span', { class: 'name' }, title.main), h('span', { class: 'sub' }, title.sub)), h('span', { class: 'open' }, '크게 보기 ↗'));
      const el = h('article', { class: 'vcard', 'aria-label': v.skill.name }, head, bodyHolder, footHolder);
      c = { el, bodyHolder, footHolder, sig: '', bodyKey: '', wv: null, ready: false };
      cards.set(v.skillId, c);
      ro.observe(bodyHolder);
      grid.append(el);
    }
    const sig = JSON.stringify([v.status, v.endedAt, v.check && v.check.ok, v.check && v.check.total, v.consoleErrors, v.error]);
    if (sig !== c.sig) {
      c.sig = sig;
      c.footHolder.replaceChildren(...footFor(v).filter(Boolean));
    }
    // 이미 그려진 시안 뷰(done-...)는 키가 같으면 건드리지 않는다. 다시 만들면 시안이 처음부터 다시 불러와진다
    const body = bodyFor(v);
    if (body.key !== c.bodyKey) {
      c.bodyKey = body.key;
      c.bodyHolder.className = `vcard-body ${body.node ? '' : 'state'}`;
      if (body.node) {
        attachWebview(c, v.skillId, body.node);
        c.bodyHolder.replaceChildren(body.node);
        requestAnimationFrame(() => fit(c.bodyHolder));
      } else {
        c.wv = null; c.ready = false; syncs.delete(v.skillId);
        c.bodyHolder.replaceChildren(body.spin ? h('span', { class: 'spinner', 'aria-hidden': 'true' }) : null, body.text);
      }
    }
    return c;
  };

  // ----- 정렬·필터는 DOM을 옮기지 않고 CSS order/display로 한다 (옮기면 <webview>가 다시 로드된다)
  const arrange = () => {
    let shown = 0;
    sortVariants(run.variants, ui.sort).forEach((v, i) => {
      const c = cards.get(v.skillId);
      c.el.style.order = String(i);
      const hide = ui.onlyPassed && !isPassedVariant(v);
      c.el.classList.toggle('hidden', hide);
      if (!hide) shown += 1;
    });
    note.textContent = ui.onlyPassed ? `통과한 시안 ${shown}개 · 전체 ${run.variants.length}개` : '';
  };

  const refresh = () => {
    for (const v of run.variants) ensureCard(v);
    arrange();
  };

  const setMode = (mode) => {
    ui.mode = mode;
    state.viewMode = mode;
    grid.classList.toggle('mobile', mode === 'mobile');
    dBtn.classList.toggle('on', mode === 'desktop');
    mBtn.classList.toggle('on', mode === 'mobile');
    setOriginalImg();
    requestAnimationFrame(() => { for (const c of cards.values()) fit(c.bodyHolder); });
  };
  dBtn.addEventListener('click', () => setMode('desktop'));
  mBtn.addEventListener('click', () => setMode('mobile'));
  onlyBox.addEventListener('change', () => { ui.onlyPassed = onlyBox.checked; arrange(); });
  sortSel.addEventListener('change', () => { ui.sort = sortSel.value; arrange(); });

  const syncBtn = h('button', { class: 'toggle-btn', type: 'button', 'aria-pressed': 'false', title: '한 카드를 스크롤하면 다른 카드도 같은 비율로 움직여요' }, '↕ 같이 스크롤');
  syncBtn.addEventListener('click', () => {
    ui.sync = !ui.sync;
    syncBtn.setAttribute('aria-pressed', String(ui.sync));
    for (const c of cards.values()) syncCode(c, ui.sync);
  });
  const sideBtn = h('button', { class: 'toggle-btn', type: 'button', title: '최근 비교 목록 펴기·접기' }, '☰ 최근 비교');
  const markSide = () => sideBtn.setAttribute('aria-pressed', String(!state.sidebarCollapsed.compare));
  sideBtn.addEventListener('click', () => { toggleSidebar(); markSide(); });
  markSide();

  const liveNote = h('span', { class: 'dim' });
  const goRunning = h('button', { class: 'btn', type: 'button', onclick: () => go('running') }, '생성 상태 보기');
  const chipCount = h('span', { class: 'dim' });
  const updateLive = () => {
    const n = run.variants.filter((v) => !isFinished(v.status)).length;
    liveNote.textContent = n ? `${n}개 만드는 중` : '';
    goRunning.classList.toggle('hidden', n === 0);
    chipCount.textContent = `시안 ${run.variants.length}개`;
  };

  root.append(
    h('div', { class: 'compare-bar' },
      sideBtn,
      h('span', { class: 'chip', title: run.url }, h('span', { class: 'host' }, hostOf(run.url)), chipCount),
      h('div', { class: 'seg', role: 'group', 'aria-label': '보기 폭' }, dBtn, mBtn),
      h('label', { class: 'check' }, onlyBox, '통과한 것만'),
      syncBtn,
      h('span', { class: 'spacer' }),
      liveNote, goRunning, sortSel),
    note,
    wrap,
    pickedSlot);
  grid.append(original);

  setOriginalImg();
  dBtn.classList.toggle('on', ui.mode === 'desktop');
  mBtn.classList.toggle('on', ui.mode === 'mobile');
  refresh();
  updateLive();

  const onKey = (e) => {
    if (!root.isConnected) { document.removeEventListener('keydown', onKey); return; }
    if (e.key === 'Escape') closePicked();
  };
  document.addEventListener('keydown', onKey);

  const tick = setInterval(() => {
    if (!root.isConnected) { clearInterval(tick); off(); ro.disconnect(); return; }
    for (const v of run.variants) {
      const el = root.querySelector(`[data-elapsed="${v.skillId}"]`);
      if (el && v.startedAt) el.textContent = formatDuration((v.endedAt ?? Date.now()) - v.startedAt);
    }
  }, 1000);
  const off = subscribe(() => {
    if (!root.isConnected) { off(); return; }
    if (state.screen !== 'compare') return;
    // 실행이 끝나면 기록을 다시 읽어 state.run이 새 객체로 바뀐다. 같은 실행이면 따라가되 시안 뷰는 다시 만들지 않는다
    if (state.run !== run) {
      if (state.run?.id !== run.id) return;
      run = state.run;
    }
    refresh();
    updateLive();
  });
  return root;
}

registerScreen('compare', render);
