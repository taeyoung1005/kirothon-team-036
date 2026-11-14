import { h, displayHref, formatDurationKo } from '../lib/dom.js';
import { pickedPanel } from '../lib/picked.js';
import { cardTitle } from '../../src/core/compareView.js';
import { go, registerScreen, state } from '../app.js';
import { warningTags } from './compare.js';

const PARTITION = 'skillpick-variants';
const KIND_LABEL = { h1: '제목', h2: '소제목', hero: '첫 단락', button: '버튼', price: '가격', nav: '내비' };

const hostOf = (url) => { try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; } };

function itemLabel(item) {
  return item.href ? `${item.text} → ${displayHref(item.href)}` : item.text;
}

// 항목별 결과. 못 찾은 것(✗)을 맨 위로 올린다
export function itemRows(run, v) {
  const byId = new Map(run.items.map((i) => [i.id, i]));
  const rows = (v.check?.items ?? []).map((r) => ({ ok: r.ok, item: byId.get(r.id) })).filter((r) => r.item);
  return [...rows.filter((r) => !r.ok), ...rows.filter((r) => r.ok)];
}

function flag(ok, text) {
  return h('li', { class: `flag ${ok ? 'ok' : 'bad'}` }, h('span', { class: 'mark', 'aria-hidden': 'true' }, ok ? '✓' : '✗'), h('span', null, text));
}

function checkPanel(run, v, onSideBySide, sideOn) {
  const c = v.check;
  const rows = c ? itemRows(run, v) : [];
  const elapsed = v.startedAt && v.endedAt ? v.endedAt - v.startedAt : 0;
  return h('aside', { class: 'detail-panel', 'aria-label': '검사 결과' },
    h('h2', null, '검사 결과'),
    c ? h('ul', { class: 'flags' },
      flag(c.passed, `${c.ok}/${c.total} 지켜야 할 것`),
      flag(!c.externalScripts?.length, c.externalScripts?.length ? `외부 스크립트 ${c.externalScripts.length}개` : '외부 스크립트 없음'),
      flag(!c.externalForms?.length, c.externalForms?.length ? `외부로 보내는 폼 ${c.externalForms.length}개` : '외부로 보내는 폼 없음'),
      flag(!(v.consoleErrors > 0), `콘솔 오류 ${v.consoleErrors ?? 0}`),
      flag(!c.inventedNumbers?.length, c.inventedNumbers?.length ? `지어낸 숫자 ${c.inventedNumbers.join(', ')}` : '지어낸 숫자 없음'))
      : h('p', { class: 'hint' }, '검사 결과가 없어요'),
    h('hr', { class: 'sep' }),
    h('h3', null, '항목별'),
    rows.length
      ? h('ul', { class: 'flags items' }, rows.map((r) => h('li', { class: `flag ${r.ok ? 'ok' : 'bad'}` },
        h('span', { class: 'mark', 'aria-hidden': 'true' }, r.ok ? '✓' : '✗'),
        h('span', null, h('span', { class: 'dim' }, `${KIND_LABEL[r.item.kind] ?? r.item.kind} `), itemLabel(r.item), r.ok ? null : h('span', { class: 'dim' }, '  (못 찾음)')))))
      : h('p', { class: 'hint' }, '검사한 항목이 없어요'),
    h('hr', { class: 'sep' }),
    h('h3', null, '스킬 정보'),
    h('p', { class: 'row-line' }, v.skill.author ? `${v.skill.author} · ` : '',
      v.skill.source ? h('button', { class: 'link-btn', type: 'button', onclick: () => window.skillpick.openExternal(v.skill.source) }, '↗ 출처') : null),
    elapsed ? h('p', { class: 'row-line dim' }, `걸린 시간 ${formatDurationKo(elapsed)}`) : null,
    h('button', { class: `btn block ${sideOn ? 'on' : ''}`, type: 'button', onclick: onSideBySide }, sideOn ? '시안만 보기' : '원본과 나란히'));
}

function render(params) {
  const run = state.run;
  const skillId = params.skillId;
  const v = run?.variants.find((x) => x.skillId === skillId);
  if (!run || !v) {
    return h('div', { class: 'center-msg' }, h('p', { class: 'dim' }, '불러올 시안이 없어요'),
      h('button', { class: 'btn', onclick: () => go('compare') }, '← 비교로'));
  }
  const ui = { mode: state.viewMode ?? 'desktop', side: false, picked: false };
  const doneList = run.variants.filter((x) => x.status === 'done');
  const idx = doneList.findIndex((x) => x.skillId === skillId);
  const step = (d) => {
    if (doneList.length < 2 || idx < 0) return;
    go('detail', { skillId: doneList[(idx + d + doneList.length) % doneList.length].skillId });
  };

  const dBtn = h('button', { type: 'button' }, '데스크톱');
  const mBtn = h('button', { type: 'button' }, '모바일');
  const stage = h('div', { class: 'detail-stage' });
  const side = h('div', { class: 'detail-side' });
  const panelSlot = h('div', { class: 'detail-slot' });
  const pickedSlot = h('div', { class: 'picked-slot hidden' });

  const buildStage = () => {
    stage.className = `detail-stage ${ui.side ? 'split' : ''} ${ui.mode}`;
    const parts = [];
    if (v.status === 'done') {
      const wv = h('webview', { class: 'detail-wv', src: window.skillpick.variantUrl(run.id, v.skillId), partition: PARTITION });
      const frame = h('div', { class: 'frame' }, wv);
      if (ui.side) {
        const img = h('img', { alt: '원본 캡처', src: window.skillpick.assetUrl(run.id, 'original', ui.mode) });
        parts.push(h('div', { class: 'half original', 'aria-label': '원본' }, h('div', { class: 'half-tag' }, '원본'), h('div', { class: 'shot-scroll' }, img)));
        parts.push(h('div', { class: 'half' }, h('div', { class: 'half-tag' }, v.skill.name), frame));
      } else {
        parts.push(frame);
      }
    } else {
      parts.push(h('div', { class: 'center-msg' }, h('p', { class: 'dim' }, v.error ?? '이 시안은 아직 볼 수 없어요')));
    }
    stage.replaceChildren(...parts);
  };
  const buildPanel = () => {
    panelSlot.replaceChildren(checkPanel(run, v, () => { ui.side = !ui.side; buildStage(); buildPanel(); }, ui.side));
  };
  const setMode = (mode) => {
    ui.mode = mode;
    state.viewMode = mode;
    dBtn.classList.toggle('on', mode === 'desktop');
    mBtn.classList.toggle('on', mode === 'mobile');
    buildStage();
  };
  dBtn.addEventListener('click', () => setMode('desktop'));
  mBtn.addEventListener('click', () => setMode('mobile'));

  const closePicked = () => { ui.picked = false; pickedSlot.classList.add('hidden'); pickedSlot.replaceChildren(); };
  const pickBtn = h('button', {
    class: 'btn primary', type: 'button', disabled: v.status !== 'done',
    onclick: () => { ui.picked = true; pickedSlot.classList.remove('hidden'); pickedSlot.replaceChildren(pickedPanel(run, v, closePicked)); },
  }, '이 스킬로 고르기');

  const warn = warningTags(v);
  const title = cardTitle(v.skill);
  const root = h('div', { class: 'detail' },
    h('div', { class: 'detail-bar' },
      h('button', { class: 'btn', type: 'button', onclick: () => go('compare') }, '← 비교로'),
      h('span', { class: 'detail-titles' }, h('span', { class: 'mono detail-name' }, title.main), title.sub ? h('span', { class: 'dim detail-sub' }, title.sub) : null),
      v.check ? h('span', { class: `badge ${v.check.passed ? 'ok' : 'warn'}` }, `${v.check.passed ? '✓' : '⚠'} ${v.check.ok}/${v.check.total}`) : null,
      ...warn.map((t) => h('span', { class: 'badge warn' }, t)),
      h('span', { class: 'dim' }, hostOf(run.url)),
      h('div', { class: 'seg', role: 'group', 'aria-label': '보기 폭' }, dBtn, mBtn),
      h('span', { class: 'spacer' }),
      doneList.length > 1 ? h('span', { class: 'dim' }, '← → 키로 다음 시안') : null,
      pickBtn),
    h('div', { class: 'detail-main' }, stage, panelSlot, pickedSlot));

  const onKey = (e) => {
    if (!root.isConnected) { document.removeEventListener('keydown', onKey); return; }
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'Escape' && ui.picked) closePicked();
  };
  document.addEventListener('keydown', onKey);

  setMode(ui.mode);
  buildPanel();
  return root;
}

registerScreen('detail', render);
