// 화면 7: 고른 뒤 패널(가져가기). 비교 화면 카드와 크게 보기 화면이 같이 쓴다
import { h, toast } from './dom.js';

const sourceShort = (url) => String(url ?? '').replace(/^https?:\/\//, '');

export function pickedPanel(run, v, close) {
  const api = window.skillpick;
  const hasHtml = v.status === 'done';
  const tip = (r, okText) => {
    if (!r || r.canceled) return;
    if (r.ok === false) toast(`저장하지 못했어요 · ${r.message}`);
    else toast(`${okText} · ${r.path}`);
  };
  const step = (n, title, ...body) => h('section', { class: 'pick-step' }, h('span', { class: 'num' }, n), h('div', { class: 'pick-body' }, h('h3', null, title), ...body));
  return h('aside', { class: 'picked-panel', 'aria-label': `${v.skill.name} 가져가기` },
    h('div', { class: 'row between' },
      h('h2', null, `${v.skill.name} 을 골랐어요`),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': '닫기', onclick: close }, '✕')),
    step('1', '스킬 설치',
      h('div', { class: 'row-line' }, h('span', { class: 'dim' }, '출처'), h('span', { class: 'mono ellipsis', title: v.skill.source }, sourceShort(v.skill.source)),
        h('button', { class: 'btn', type: 'button', onclick: () => { api.copyText(v.skill.source); toast('출처를 복사했어요'); } }, '복사')),
      h('div', { class: 'row-line' }, h('span', { class: 'dim' }, 'Kiro'), h('span', null, '.kiro/steering 에 넣기'),
        h('button', { class: 'btn', type: 'button', onclick: async () => tip(await api.exportSteering(run.id, v.skillId), '저장했어요') }, '내 프로젝트에 내보내기')),
      v.skill.installCmd
        ? h('div', { class: 'row-line' }, h('span', { class: 'dim' }, '기타'), h('span', null, '설치 명령'),
          h('button', { class: 'btn', type: 'button', onclick: () => { api.copyText(v.skill.installCmd); toast('설치 명령을 복사했어요'); } }, '설치 명령 복사'))
        : null),
    step('2', '시안 코드',
      h('div', { class: 'row-line' }, h('span', { class: 'mono' }, 'index.html'),
        h('button', { class: 'btn', type: 'button', disabled: !hasHtml, onclick: async () => tip(await api.saveHtml(run.id, v.skillId), '저장했어요') }, 'HTML 저장'),
        h('button', { class: 'btn', type: 'button', disabled: !hasHtml, onclick: () => api.openFolder(run.id, v.skillId) }, '폴더 열기'))),
    step('3', '이 비교 기록', h('p', { class: 'dim row-line' }, '최근 비교에 저장돼요')));
}
