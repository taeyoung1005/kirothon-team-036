import { h, mount, toast } from '../lib/dom.js';
import { go, registerScreen, state } from '../app.js';

function copyButton(text) {
  return h('button', {
    class: 'btn',
    onclick: async () => { await window.skillpick.copyText(text); toast('복사했어요'); },
  }, '복사');
}

function row(status, label, value, extra) {
  const mark = status === 'checking'
    ? h('span', { class: 'spinner', role: 'status', 'aria-label': '확인 중' })
    : h('span', { class: `mark ${status}`, 'aria-hidden': 'true' }, status === 'ok' ? '✓' : status === 'bad' ? '✗' : '–');
  return h('div', { class: 'check-row' },
    h('div', { class: 'check-main' }, mark, h('span', { class: 'check-label' }, label), h('span', { class: 'mono dim check-value' }, value ?? '')),
    extra ?? null);
}

function render(params) {
  const box = h('div', { class: 'setup' });
  const pf = state.preflight;
  const draw = (p, checking) => {
    const installOk = Boolean(p?.installed);
    const loginOk = Boolean(p?.loggedIn);
    const rows = [];
    if (checking) {
      rows.push(row('checking', 'kiro-cli 확인 중'), row('checking', 'Kiro 로그인 확인 중'));
    } else {
      rows.push(installOk
        ? row('ok', 'kiro-cli 설치됨', p.version ?? '')
        : row('bad', 'kiro-cli를 찾지 못했어요', '', h('div', { class: 'fix' },
          h('p', { class: 'hint' }, '터미널에서 아래 명령을 실행해 설치하세요'),
          h('div', { class: 'cmd' }, h('code', { class: 'mono' }, p?.installCmd ?? 'curl -fsSL https://cli.kiro.dev/install | bash'), copyButton(p?.installCmd ?? 'curl -fsSL https://cli.kiro.dev/install | bash')))));
      if (installOk) {
        rows.push(loginOk
          ? row('ok', 'Kiro 로그인됨', p.account || '')
          : row('bad', '로그인이 필요해요', '', h('div', { class: 'fix' },
            h('p', { class: 'hint' }, '터미널에서 아래 명령을 실행해 로그인하세요'),
            h('div', { class: 'cmd' }, h('code', { class: 'mono' }, p?.loginCmd ?? 'kiro-cli login'), copyButton(p?.loginCmd ?? 'kiro-cli login')))));
      } else {
        rows.push(row('idle', 'Kiro 로그인', '확인 대기'));
      }
    }
    rows.push(row(installOk || checking ? 'ok' : 'idle', '동시 실행 설정', `${state.settings.concurrency}개`));
    const ready = !checking && installOk && loginOk;
    mount(box,
      h('div', { class: 'logo', 'aria-hidden': 'true' }, '✓≡'),
      h('h1', { class: 'setup-title' }, 'SkillPick'),
      h('p', { class: 'setup-sub' }, '내 페이지에 디자인 스킬을 한 번에 돌려 보고 결과로 고르세요'),
      h('section', { class: 'panel setup-panel', 'aria-label': '준비 상태' },
        h('h2', null, '준비 상태'),
        ...rows,
        ready ? h('p', { class: 'hint' }, '다음 실행부터는 이 화면을 건너뛰어요') : null),
      h('div', { class: 'setup-actions' },
        !checking && !ready ? h('button', { class: 'btn', onclick: () => run() }, '다시 확인') : null,
        h('button', {
          class: 'btn primary lg grow',
          disabled: !ready,
          onclick: async () => {
            state.settings = await window.skillpick.setSettings({ setupDone: true });
            go('newRun');
          },
        }, '시작하기')),
      !checking && p?.installed ? h('p', { class: 'setup-foot mono dim' }, `SkillPick · ${state.engineName} ${p.version ?? ''}`) : null);
  };
  const run = async () => {
    draw(null, true);
    try {
      state.preflight = await window.skillpick.preflight();
    } catch (error) {
      state.preflight = { installed: false, version: null, loggedIn: false, account: '', error: error.message };
    }
    draw(state.preflight, false);
  };
  if (pf && params.problem) draw(pf, false); else run();
  return box;
}

registerScreen('setup', render);
