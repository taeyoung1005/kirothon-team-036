import { h, mount, relativeTime } from './lib/dom.js';
import { sidebarGroup } from '../src/core/compareView.js';

// 화면 이름 → 단계 표시 위치 (입력 › 확인 › 생성 › 비교)
export const STEPS = ['입력', '확인', '생성', '비교'];
const STEP_OF = { setup: -1, newRun: 0, confirm: 1, running: 2, compare: 3, detail: 3, picked: 3, settings: -1, home: -1 };
const STEP_SCREEN = ['newRun', 'confirm', 'running', 'compare'];
// 창 높이를 꽉 채우고 안쪽에서 스크롤하는 화면
const FILL_SCREENS = new Set(['newRun', 'confirm', 'compare', 'detail']);

// 앱 전체 상태. 화면 모듈이 읽고 고친다.
export const state = {
  screen: 'home',
  params: {},
  url: '',
  skills: [],
  selectedSkillIds: null, // null이면 기본 선택을 쓴다
  selectedStyles: {},     // 스킬 id -> 고른 스타일 [{id, name}]. 고르면 스타일마다 시안 하나가 된다
  capturing: null,        // 원본 수집 Promise
  capture: null,          // {runId, content, items, trimmed, elapsedMs}
  captureError: null,
  runId: null,
  run: null,              // 진행 중이거나 불러온 기록
  recent: [],
  settings: { concurrency: 3, timeoutMs: 480000, retry: true, setupDone: false },
  preflight: null,
  engineName: 'Kiro CLI',
  viewMode: 'desktop',
  // 사이드바 접힘. 비교 단계(비교·크게 보기)는 기본으로 접고, 사용자가 바꾸면 그대로 기억한다
  sidebarCollapsed: { compare: true, other: false },
  runtime: { running: 0, queued: 0 },
};

// 최근 비교를 눌렀을 때 하는 일은 main.js에서 정해 준다 (화면 모듈 순환 참조를 피하려고)
export const hooks = { openRun: null };

const screens = new Map();
export function registerScreen(name, render) { screens.set(name, render); }

let shellEls = null;

export function go(name, params = {}) {
  state.screen = name;
  state.params = params;
  renderShell();
}

export function refreshShell() { renderShell(); }

const isSidebarCollapsed = () => state.sidebarCollapsed[sidebarGroup(state.screen)];

function applySidebar() {
  if (!shellEls) return;
  shellEls.main.classList.toggle('side-collapsed', isSidebarCollapsed());
}

/** 사이드바를 접거나 편다. 화면을 다시 그리지 않아 시안 뷰가 다시 불러와지지 않는다 */
export function toggleSidebar() {
  const group = sidebarGroup(state.screen);
  state.sidebarCollapsed[group] = !state.sidebarCollapsed[group];
  applySidebar();
  return state.sidebarCollapsed[group];
}

export async function refreshRecent() {
  state.recent = await window.skillpick.listRuns();
  if (shellEls) renderSidebar();
}

function stepBar() {
  const current = STEP_OF[state.screen] ?? -1;
  const locked = state.screen === 'running';
  const nodes = [];
  STEPS.forEach((label, i) => {
    const target = STEP_SCREEN[i];
    // 지난 단계는 눌러 돌아갈 수 있고, 생성 중에는 잠긴다. 확인·생성은 돌아갈 자료가 있을 때만 연다
    const reachable = i === 0 || (i === 1 && state.capture) || (i === 3 && state.run);
    const canGo = !locked && i < current && reachable;
    nodes.push(h('button', {
      class: `step ${i === current ? 'current' : ''} ${i < current ? 'done' : ''}`,
      disabled: !canGo && i !== current,
      'aria-current': i === current ? 'step' : null,
      onclick: canGo ? () => go(target) : null,
    }, label));
    if (i < STEPS.length - 1) nodes.push(h('span', { class: 'step-sep', 'aria-hidden': 'true' }, '›'));
  });
  return h('nav', { class: 'steps', 'aria-label': '진행 단계' }, nodes);
}

function hostOf(url) {
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; }
}

function recentList() {
  if (!state.recent.length) return h('p', { class: 'hint' }, '아직 비교한 기록이 없어요');
  return h('ul', { class: 'recent' }, state.recent.slice(0, 12).map((r) => h('li', null,
    h('button', {
      class: state.run?.id === r.id ? 'active' : '',
      title: r.url,
      onclick: () => hooks.openRun?.(r.id),
    },
    h('span', { class: 'domain' }, hostOf(r.url), r.running ? h('span', { class: 'live-dot', 'aria-label': '실행 중' }) : null),
    h('span', { class: 'meta' }, `스킬 ${r.skillCount}개 · ${relativeTime(r.createdAt)}`)))));
}

function renderSidebar() {
  mount(shellEls.sidebar,
    h('button', { class: 'btn primary block lg', onclick: () => { state.capture = null; state.capturing = null; go('newRun'); } }, '+ 새 비교'),
    h('h3', null, '최근 비교'),
    recentList());
}

function renderShell() {
  const root = document.getElementById('app');
  if (!shellEls) {
    shellEls = {
      toolbar: h('header', { class: 'toolbar' }),
      sidebar: h('aside', { class: 'sidebar' }),
      content: h('main', { class: 'content' }),
      main: h('div', { class: 'main' }),
    };
    shellEls.main.append(shellEls.sidebar, shellEls.content);
    mount(root, h('div', { class: 'shell' }, shellEls.toolbar, shellEls.main));
  }
  mount(shellEls.toolbar,
    h('span', { class: 'brand' }, 'SkillPick'),
    stepBar(),
    h('span', { class: 'spacer' }),
    h('button', { class: 'icon-btn', title: '설정', 'aria-label': '설정', onclick: () => go('settings') }, '⚙'));
  renderSidebar();
  applySidebar();
  const render = screens.get(state.screen);
  shellEls.content.classList.toggle('flush', state.screen === 'detail');
  shellEls.content.classList.toggle('fill', FILL_SCREENS.has(state.screen));
  mount(shellEls.content, render ? render(state.params ?? {}) : h('div', { class: 'empty' }, ''));
}

export function setContent(...children) {
  if (shellEls) mount(shellEls.content, ...children);
}

// 첫 실행이거나 Kiro 상태가 나쁠 때만 준비 확인 화면을 보인다
export async function boot() {
  const api = window.skillpick;
  state.settings = await api.getSettings();
  state.skills = await api.listSkills();
  await refreshRecent();
  if (state.settings.setupDone) {
    go('newRun');
    api.preflight().then((p) => {
      state.preflight = p;
      if (!p.installed || !p.loggedIn) go('setup', { problem: true });
    });
  } else {
    go('setup');
  }
}
