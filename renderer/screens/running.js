import { h, mount, formatDuration } from '../lib/dom.js';
import { go, registerScreen, state } from '../app.js';
import { subscribe } from '../lib/live.js';
import { STATUS_LABEL, isFinished } from '../../src/core/status.js';

const KIND_LABEL = { h1: '제목', h2: '소제목', hero: '첫 단락', button: '버튼', price: '가격', nav: '내비' };
const BADGE_CLASS = { queued: '', generating: 'accent', checking: 'accent', retrying: 'warn', done: 'ok', failed: 'bad', timeout: 'bad', stopped: '' };
const STEP_NAMES = ['생성', '검사', '완료'];
const expanded = new Set();   // 로그를 펼친 시안
const logCache = new Map();   // skillId -> 전체 로그

const hostOf = (url) => { try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; } };

function stepIndex(status) {
  if (status === 'generating' || status === 'retrying' || status === 'queued') return status === 'queued' ? -1 : 0;
  if (status === 'checking') return 1;
  return 2;
}

function elapsedMs(v, now = Date.now()) {
  if (!v.startedAt) return 0;
  return (v.endedAt ?? now) - v.startedAt;
}

function missingText(run, v) {
  const bad = new Set((v.check?.items ?? []).filter((i) => !i.ok).map((i) => i.id));
  const items = (run.items ?? []).filter((i) => bad.has(i.id));
  if (!items.length) return '';
  const shown = items.slice(0, 3).map((i) => `${KIND_LABEL[i.kind] ?? i.kind} ${i.text}`);
  return `빠진 항목: ${shown.join(', ')}${items.length > 3 ? ` 외 ${items.length - 3}개` : ''}`;
}

function subLine(run, v) {
  const total = run.items.filter((i) => i.enabled !== false).length;
  switch (v.status) {
    case 'queued': return '자리가 나면 시작해요';
    case 'checking': return v.check ? `지켜야 할 것 ${v.check.ok}/${v.check.total} 확인 중` : `지켜야 할 것 ${total}개 확인 중`;
    case 'retrying': return missingText(run, v);
    case 'done': return v.check ? `지켜야 할 것 ${v.check.ok}/${v.check.total}${v.error ? ` · ${v.error}` : ''}` : '';
    case 'failed': case 'timeout': return v.error ?? '';
    default: return '';
  }
}

function badge(status) {
  const lead = status === 'generating' ? h('span', { class: 'live-dot', 'aria-hidden': 'true' })
    : status === 'checking' ? h('span', { class: 'spinner', 'aria-hidden': 'true' })
      : status === 'retrying' ? '↻ ' : null;
  return h('span', { class: `badge ${BADGE_CLASS[status]}`, role: 'status' }, lead, STATUS_LABEL[status]);
}

function lane(run, v, redraw) {
  const idx = stepIndex(v.status);
  const finished = isFinished(v.status);
  const steps = STEP_NAMES.map((name, i) => {
    let cls = 'step3';
    if (v.status === 'queued') cls += '';
    else if (i < idx || (finished && i < 2)) cls += ' past';
    else if (i === idx) cls += ` active ${v.status === 'retrying' ? 'warn' : ''} ${finished ? (v.status === 'done' ? 'ok' : v.status === 'stopped' ? '' : 'bad') : ''}`;
    return h('li', { class: cls }, name);
  });
  const lines = (v.logTail ?? []).slice(-2);
  const open = expanded.has(v.skillId);
  const tail = h('button', {
    type: 'button', class: 'logtail', 'aria-expanded': String(open), title: '눌러서 전체 로그 보기',
    onclick: async () => {
      if (open) expanded.delete(v.skillId); else { expanded.add(v.skillId); logCache.set(v.skillId, await window.skillpick.readLog(run.id, v.skillId)); }
      redraw();
    },
  }, lines.length ? lines.map((l) => h('span', { class: 'logline mono' }, `> ${l}`)) : h('span', { class: 'logline mono dim' }, v.status === 'queued' ? '' : '> Kiro 출력을 기다리는 중'));
  return h('section', { class: `lane ${v.status}`, 'aria-label': `${v.skill.name} ${STATUS_LABEL[v.status]}` },
    h('div', { class: 'lane-head' },
      h('span', { class: 'lane-name mono' }, v.skill.name), badge(v.status),
      h('span', { class: 'lane-time mono', dataset: { elapsed: v.skillId } }, formatDuration(elapsedMs(v)))),
    subLine(run, v) ? h('p', { class: 'lane-sub' }, subLine(run, v)) : null,
    h('ol', { class: 'steps3' }, steps),
    tail,
    open ? h('pre', { class: 'fulllog mono' }, logCache.get(v.skillId) || '아직 로그가 없어요') : null);
}

function render() {
  const root = h('div', { class: 'running' });
  let timer = null;

  const draw = () => {
    const run = state.run;
    if (!run) { mount(root, h('p', { class: 'hint' }, '불러오는 중…')); return; }
    const all = run.variants;
    const anyDone = all.some((v) => v.status === 'done');
    const allFinished = all.every((v) => isFinished(v.status));
    const rt = state.runtime.runId === run.id ? state.runtime : { running: 0, queued: all.filter((v) => v.status === 'queued').length };
    const summary = allFinished
      ? `${hostOf(run.url)} · 스킬 ${all.length}개 · 모두 끝났어요`
      : `${hostOf(run.url)} · 스킬 ${all.length}개 · 동시 ${rt.running}개 실행 중 · 대기 ${rt.queued}`;
    const end = allFinished ? Math.max(...all.map((v) => v.endedAt ?? 0), run.createdAt) : Date.now();
    mount(root,
      h('div', { class: 'running-head' }, h('h1', null, summary), h('span', { class: 'mono total-time', dataset: { total: '1' } }, formatDuration(end - run.createdAt))),
      h('div', { class: 'lanes' }, all.map((v) => lane(run, v, draw))),
      h('div', { class: 'running-foot' },
        allFinished
          ? h('button', { class: 'btn primary lg', onclick: () => go('compare') }, '비교하기 →')
          : h('button', { class: 'btn lg', disabled: !anyDone, title: anyDone ? '' : '하나라도 완료되면 열려요', onclick: () => go('compare') }, '완료된 것부터 보기'),
        allFinished ? null : h('button', { class: 'btn danger lg', onclick: () => window.skillpick.stopRun(run.id) }, '전부 멈추기')));
  };

  const tick = () => {
    if (!root.isConnected) { clearInterval(timer); off(); return; }
    const run = state.run;
    if (!run) return;
    const now = Date.now();
    for (const el of root.querySelectorAll('[data-elapsed]')) {
      const v = run.variants.find((x) => x.skillId === el.dataset.elapsed);
      if (v) el.textContent = formatDuration(elapsedMs(v, now));
    }
    const total = root.querySelector('[data-total]');
    if (total && !run.variants.every((v) => isFinished(v.status))) total.textContent = formatDuration(now - run.createdAt);
  };
  const off = subscribe(() => { if (!root.isConnected) { off(); return; } if (state.screen === 'running') draw(); });
  timer = setInterval(tick, 1000);

  if (!state.run || state.run.id !== state.runId) {
    window.skillpick.loadRun(state.runId).then((run) => { state.run = run; draw(); }).catch((error) => { console.error(error); mount(root, h('p', { class: 'err' }, '실행 기록을 읽지 못했어요')); });
  }
  draw();
  return root;
}

registerScreen('running', render);
