import { h, mount } from '../lib/dom.js';
import { go, registerScreen, state } from '../app.js';
import { captureReason, ensureCapture, onCaptureChange, pickedStyleIds, unitCount } from '../lib/session.js';
import { assetSummaryParts, collapsedByDefault, countAssets, linkLabel, setAllEnabled } from '../../src/core/confirmView.js';

const GROUPS = [
  ['h1', '제목'], ['h2', '소제목'], ['hero', '첫 단락'], ['button', '버튼'], ['price', '가격'], ['nav', '내비'],
];

function hostOf(url) {
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; }
}

function backBar(...extra) {
  return h('div', { class: 'action-bar' },
    h('button', { class: 'btn', onclick: () => go('newRun') }, '← 스킬 다시 고르기'),
    ...extra);
}

function loadingView() {
  return h('div', { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', null, '원본')),
    h('div', { class: 'skeleton', style: { flex: '1' }, 'aria-hidden': 'true' }),
    h('p', { class: 'hint', role: 'status' }, h('span', { class: 'spinner' }), ' 페이지를 열고 있어요'));
}

function skeletonList() {
  return h('div', { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', null, '지켜야 할 것')),
    ...Array.from({ length: 7 }, () => h('div', { class: 'skeleton', style: { height: 'var(--s-6)' }, 'aria-hidden': 'true' })));
}

function failureView(error) {
  return h('div', { class: 'center-msg' },
    h('h2', null, '이 페이지를 열지 못했어요'),
    h('p', { class: 'dim' }, captureReason(error)),
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: () => go('newRun') }, '← 스킬 다시 고르기'),
      h('button', { class: 'btn primary', onclick: () => { ensureCapture(state.url, { force: true }); go('confirm'); } }, '다시 시도')));
}

function assetStrip(cap) {
  const parts = assetSummaryParts(countAssets(cap.content.assets));
  return h('p', { class: 'asset-strip', title: '시안에 쓸 수 있게 원본에서 모은 에셋이에요' },
    h('span', { class: 'dim' }, '수집한 에셋'),
    parts.length
      ? parts.map((p) => h('span', { class: 'asset-chip', 'data-kind': p.key }, `${p.label} ${p.n}`))
      : h('span', { class: 'dim' }, '없어요'));
}

function readyView(cap) {
  let mode = 'desktop';
  const img = h('img', { alt: '원본 페이지 캡처', src: window.skillpick.assetUrl(cap.runId, 'original', 'desktop') });
  const box = h('div', { class: 'shot-box', tabindex: '0', 'aria-label': '원본 캡처, 세로로 스크롤' }, img);
  const dBtn = h('button', { class: 'on', type: 'button' }, '데스크톱');
  const mBtn = h('button', { type: 'button' }, '모바일');
  const setMode = (m) => {
    mode = m;
    img.src = window.skillpick.assetUrl(cap.runId, 'original', m);
    box.classList.toggle('mobile', m === 'mobile');
    dBtn.classList.toggle('on', m === 'desktop');
    mBtn.classList.toggle('on', m === 'mobile');
  };
  dBtn.addEventListener('click', () => setMode('desktop'));
  mBtn.addEventListener('click', () => setMode('mobile'));

  const countEl = h('span', { class: 'dim' });
  const allBtn = h('button', { class: 'link-btn', type: 'button' });
  const startBtn = h('button', { class: 'btn primary lg' });
  const sections = []; // 종류마다 {kind, rows, update}

  const updateCounts = () => {
    const enabled = cap.items.filter((i) => i.enabled).length;
    countEl.textContent = `${enabled}/${cap.items.length}개`;
    allBtn.textContent = enabled === cap.items.length ? '모두 해제' : '모두 선택';
    for (const sec of sections) sec.update();
    const n = unitCount();
    startBtn.textContent = `시안 ${n}개 만들기 →`;
    startBtn.disabled = enabled === 0 || n === 0;
  };
  const syncRows = () => { for (const sec of sections) for (const r of sec.rows) { r.input.checked = r.item.enabled; r.row.classList.toggle('off', !r.item.enabled); } };

  allBtn.addEventListener('click', () => {
    setAllEnabled(cap.items, cap.items.some((i) => !i.enabled));
    syncRows();
    updateCounts();
  });

  const groups = GROUPS.map(([kind, title]) => {
    const items = cap.items.filter((i) => i.kind === kind);
    if (!items.length) return null;
    let open = !collapsedByDefault(items.length);
    const rows = items.map((item) => {
      const input = h('input', { type: 'checkbox', 'aria-label': item.text });
      input.checked = item.enabled;
      const row = h('label', { class: `must-item ${item.enabled ? '' : 'off'}` },
        input,
        h('span', null, h('span', { class: 't' }, item.text), item.href ? [' → ', h('span', { class: 'href' }, linkLabel(item.href, cap.content.url))] : null));
      input.addEventListener('change', () => { item.enabled = input.checked; row.classList.toggle('off', !item.enabled); updateCounts(); });
      return { item, input, row };
    });
    const list = h('div', { class: 'must-rows' }, rows.map((r) => r.row));
    const caret = h('span', { class: 'caret', 'aria-hidden': 'true' });
    const label = h('span', { class: 'group-label' });
    const toggle = h('button', { class: 'group-toggle', type: 'button', 'aria-expanded': String(open) }, caret, label);
    const kindBtn = h('button', { class: 'link-btn', type: 'button' });
    const paint = () => {
      list.classList.toggle('hidden', !open);
      toggle.setAttribute('aria-expanded', String(open));
      caret.textContent = open ? '▾' : '▸';
    };
    toggle.addEventListener('click', () => { open = !open; paint(); });
    kindBtn.addEventListener('click', () => {
      setAllEnabled(cap.items, items.some((i) => !i.enabled), kind);
      syncRows();
      updateCounts();
    });
    sections.push({
      kind, rows,
      update: () => {
        const on = items.filter((i) => i.enabled).length;
        label.textContent = on === items.length ? `${title} (${items.length})` : `${title} (${on}/${items.length})`;
        kindBtn.textContent = on === items.length ? '모두 해제' : '모두 선택';
        kindBtn.setAttribute('aria-label', `${title} ${kindBtn.textContent}`);
      },
    });
    paint();
    return h('section', { class: 'must-group' }, h('div', { class: 'group-head' }, toggle, kindBtn), list);
  });

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    const r = await window.skillpick.startRun({
      runId: cap.runId,
      skillIds: state.selectedSkillIds,
      styles: pickedStyleIds(),
      items: cap.items.map(({ id, enabled }) => ({ id, enabled })),
    });
    if (!r.ok) { startBtn.disabled = false; startBtn.textContent = '시작하지 못했어요 · 다시 눌러 주세요'; console.error(r); return; }
    state.runId = cap.runId;
    state.run = null;
    state.live = null;
    go('running');
  });
  updateCounts();

  return [
    h('div', { class: 'confirm-body' },
      h('div', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('h2', null, '원본'), h('div', { class: 'seg', role: 'group', 'aria-label': '보기 폭' }, dBtn, mBtn)),
        box,
        h('p', { class: 'shot-foot mono dim' }, `${hostOf(cap.content.url)} · ${(cap.elapsedMs / 1000).toFixed(1)}초`),
        assetStrip(cap)),
      h('div', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('h2', null, '지켜야 할 것 ', countEl), allBtn),
        h('p', { class: 'hint', style: { margin: 0 } }, '모든 시안이 이 항목을 그대로 담아야 통과해요'),
        cap.trimmed ? h('p', { class: 'notice', role: 'status' }, '⚠ 항목이 많아 소제목과 내비 일부를 뺐어요') : null,
        h('div', { class: 'must-list' }, groups))),
    backBar(startBtn),
  ];
}

function render() {
  const root = h('div', { class: 'confirm' });
  const draw = () => {
    const cap = state.capture;
    if (cap) { mount(root, readyView(cap)); return; }
    if (state.captureError) { mount(root, h('div', { class: 'confirm-body single' }, failureView(state.captureError))); return; }
    if (!state.capturing) { go('newRun'); return; }
    mount(root, h('div', { class: 'confirm-body' }, loadingView(), skeletonList()), backBar());
  };
  const off = onCaptureChange(() => { if (!root.isConnected) { off(); return; } if (state.screen === 'confirm') draw(); });
  draw();
  return root;
}

registerScreen('confirm', render);
