import { h, formatDuration, formatDurationKo } from '../lib/dom.js';
import { go, registerScreen, state } from '../app.js';
import { subscribe } from '../lib/live.js';
import { STATUS_LABEL, isFinished } from '../../src/core/status.js';

const DESKTOP_W = 1440;
const MOBILE_W = 390;
const PARTITION = 'skillpick-variants';
const MISSING_LABEL = { h1: '제목 누락', h2: '소제목 누락', hero: '첫 단락 누락', button: '버튼 누락', price: '가격 누락', nav: '내비 누락' };

const hostOf = (url) => { try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; } };

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
  const run = state.run;
  const ui = { mode: state.viewMode ?? 'desktop', onlyPassed: false, sort: 'finish' };
  const cards = new Map(); // skillId -> { el, bodyHolder, footHolder, sig, bodyKey, scaler }

  const grid = h('div', { class: `card-grid ${ui.mode === 'mobile' ? 'mobile' : ''}` });
  const wrap = h('div', { class: 'grid-wrap' }, grid);
  const note = h('p', { class: 'compare-note' });
  const dBtn = h('button', { type: 'button' }, '데스크톱');
  const mBtn = h('button', { type: 'button' }, '모바일');
  const onlyBox = h('input', { type: 'checkbox' });
  const sortSel = h('select', { class: 'select', 'aria-label': '정렬' },
    h('option', { value: 'finish' }, '정렬: 완료 순'), h('option', { value: 'name' }, '정렬: 이름 순'));

  // ----- 원본 카드 (점선, 맨 앞). 실제 렌더 대신 수집 때 찍은 전체 캡처를 쓴다
  const origImg = h('img', { alt: '원본 캡처' });
  const original = h('article', { class: 'vcard original', 'aria-label': '원본' },
    h('div', { class: 'vcard-head' }, h('span', { class: 'name' }, '원본')),
    h('div', { class: 'vcard-body' }, h('div', { class: 'shot' }, origImg)),
    h('div', { class: 'vcard-foot' }, h('span', { class: 'dim' }, '원본')));
  const setOriginalImg = () => { origImg.src = window.skillpick.assetUrl(run.id, 'original', ui.mode); };

  // ----- 크기 맞추기: 시안은 1440(또는 390)폭으로 그린 뒤 카드 폭에 맞게 줄인다
  const viewportW = () => (ui.mode === 'mobile' ? MOBILE_W : DESKTOP_W);
  const fit = (holder) => {
    const wv = holder.querySelector('webview');
    if (!wv) return;
    const rect = holder.getBoundingClientRect();
    if (!rect.width) return;
    const scale = rect.width / viewportW();
    wv.style.width = `${viewportW()}px`;
    wv.style.height = `${rect.height / scale}px`;
    wv.style.transform = `scale(${scale})`;
  };
  const ro = new ResizeObserver(() => { for (const c of cards.values()) fit(c.bodyHolder); });

  // ----- 카드 하나 만들기/갱신
  const footFor = (v) => {
    const elapsed = v.startedAt ? (v.endedAt ?? Date.now()) - v.startedAt : 0;
    if (v.status === 'done' && v.check) {
      const good = v.check.passed;
      const tags = warningTags(v);
      return [
        h('span', { class: `badge ${good ? 'ok' : 'warn'}` }, `${good ? '✓' : '⚠'} ${v.check.ok}/${v.check.total}`),
        ...tags.map((t) => h('span', { class: 'badge warn' }, t)),
        h('span', { class: 'time mono' }, formatDurationKo(elapsed)),
      ];
    }
    if (isFinished(v.status)) {
      const kind = v.status === 'stopped' ? '' : 'bad';
      const logBox = h('pre', { class: 'logbox mono hidden' });
      return [
        h('span', { class: `badge ${kind}` }, STATUS_LABEL[v.status]),
        v.startedAt ? h('span', { class: 'time mono' }, formatDurationKo(elapsed)) : null,
        v.error ? h('p', { class: 'reason' }, v.error) : null,
        h('button', {
          class: 'link-btn', type: 'button',
          onclick: async (e) => {
            if (logBox.classList.contains('hidden')) logBox.textContent = (await window.skillpick.readLog(run.id, v.skillId)) || '아직 로그가 없어요';
            logBox.classList.toggle('hidden');
            e.currentTarget.textContent = logBox.classList.contains('hidden') ? '로그 보기' : '로그 닫기';
          },
        }, '로그 보기'),
        h('div', { style: { flexBasis: '100%' } }, logBox),
      ];
    }
    return [
      h('span', { class: `badge ${v.status === 'retrying' ? 'warn' : v.status === 'queued' ? '' : 'accent'}` }, STATUS_LABEL[v.status]),
      h('span', { class: 'time mono', dataset: { elapsed: v.skillId } }, formatDuration(elapsed)),
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

  const ensureCard = (v) => {
    let c = cards.get(v.skillId);
    if (!c) {
      const bodyHolder = h('div', { class: 'vcard-body' });
      const footHolder = h('div', { class: 'vcard-foot' });
      const head = h('button', {
        type: 'button', class: 'vcard-head', title: `${v.skill.name} 크게 보기`, 'aria-label': `${v.skill.name} 크게 보기`,
        onclick: () => go('detail', { skillId: v.skillId }),
      }, h('span', { class: 'name' }, v.skill.name), h('span', { class: 'open' }, '크게 보기 ↗'));
      const el = h('article', { class: 'vcard', 'aria-label': v.skill.name }, head, bodyHolder, footHolder);
      c = { el, bodyHolder, footHolder, sig: '', bodyKey: '' };
      cards.set(v.skillId, c);
      ro.observe(bodyHolder);
      grid.append(el);
    }
    const sig = JSON.stringify([v.status, v.endedAt, v.check && v.check.ok, v.check && v.check.total, v.consoleErrors, v.error]);
    if (sig !== c.sig) {
      c.sig = sig;
      c.footHolder.replaceChildren(...footFor(v).filter(Boolean));
    }
    const body = bodyFor(v);
    if (body.key !== c.bodyKey) {
      c.bodyKey = body.key;
      c.bodyHolder.className = `vcard-body ${body.node ? '' : 'state'}`;
      if (body.node) { c.bodyHolder.replaceChildren(body.node); requestAnimationFrame(() => fit(c.bodyHolder)); }
      else c.bodyHolder.replaceChildren(body.spin ? h('span', { class: 'spinner', 'aria-hidden': 'true' }) : null, body.text);
    }
    return c;
  };

  // ----- 정렬·필터는 DOM을 옮기지 않고 CSS order/display로 한다 (옮기면 <webview>가 다시 로드된다)
  const arrange = () => {
    const list = [...run.variants];
    if (ui.sort === 'name') list.sort((a, b) => a.skill.name.localeCompare(b.skill.name));
    else list.sort((a, b) => (isFinished(a.status) ? a.endedAt ?? 0 : Infinity) - (isFinished(b.status) ? b.endedAt ?? 0 : Infinity));
    let shown = 0;
    list.forEach((v, i) => {
      const c = cards.get(v.skillId);
      c.el.style.order = String(i);
      const hide = ui.onlyPassed && !(v.status === 'done' && v.check?.passed);
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

  const liveNote = h('span', { class: 'dim' });
  const goRunning = h('button', { class: 'btn', type: 'button', onclick: () => go('running') }, '생성 상태 보기');
  const updateLive = () => {
    const n = run.variants.filter((v) => !isFinished(v.status)).length;
    liveNote.textContent = n ? `${n}개 만드는 중` : '';
    goRunning.classList.toggle('hidden', n === 0);
  };

  root.append(
    h('div', { class: 'compare-bar' },
      h('div', { class: 'domain-box mono', title: run.url }, hostOf(run.url)),
      h('div', { class: 'seg', role: 'group', 'aria-label': '보기 폭' }, dBtn, mBtn),
      h('label', { class: 'check' }, onlyBox, '통과한 것만'),
      h('span', { class: 'spacer' }),
      liveNote, goRunning, sortSel),
    note,
    wrap);
  grid.append(original);

  setOriginalImg();
  dBtn.classList.toggle('on', ui.mode === 'desktop');
  mBtn.classList.toggle('on', ui.mode === 'mobile');
  refresh();
  updateLive();

  const tick = setInterval(() => {
    if (!root.isConnected) { clearInterval(tick); off(); ro.disconnect(); return; }
    for (const v of run.variants) {
      const el = root.querySelector(`[data-elapsed="${v.skillId}"]`);
      if (el && v.startedAt) el.textContent = formatDuration((v.endedAt ?? Date.now()) - v.startedAt);
    }
  }, 1000);
  const off = subscribe(() => {
    if (!root.isConnected) { off(); return; }
    if (state.screen !== 'compare' || state.run !== run) return;
    refresh();
    updateLive();
  });
  return root;
}

registerScreen('compare', render);
