import { h, toast } from '../lib/dom.js';
import { go, refreshRecent, registerScreen, state } from '../app.js';

const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY = 6;

function field(label, hint, control) {
  return h('div', { class: 'setting-row' },
    h('div', { class: 'setting-text' }, h('span', { class: 'setting-label' }, label), hint ? h('span', { class: 'hint' }, hint) : null),
    control);
}

function render() {
  const api = window.skillpick;
  const s = state.settings;
  const save = async (patch, okText = '저장했어요') => {
    try {
      state.settings = await api.setSettings(patch);
      toast(okText);
    } catch (error) {
      console.error(error);
      toast(`저장하지 못했어요 · ${error.message}`);
    }
  };

  const concurrency = h('select', { class: 'select', 'aria-label': '동시 실행 수' },
    Array.from({ length: MAX_CONCURRENCY - MIN_CONCURRENCY + 1 }, (_, i) => {
      const n = MIN_CONCURRENCY + i;
      return h('option', { value: String(n), selected: n === s.concurrency }, `${n}개`);
    }));
  concurrency.addEventListener('change', () => save({ concurrency: Number(concurrency.value) }));

  const minutes = h('input', { class: 'input narrow', type: 'number', min: '1', max: '30', step: '1', value: String(Math.round(s.timeoutMs / 60000)), 'aria-label': '시안당 시간 제한(분)' });
  minutes.addEventListener('change', () => {
    const n = Math.min(30, Math.max(1, Math.round(Number(minutes.value) || 8)));
    minutes.value = String(n);
    save({ timeoutMs: n * 60000 });
  });

  const retry = h('input', { type: 'checkbox', checked: s.retry, 'aria-label': '빠진 항목이 있으면 한 번 다시 고치기' });
  retry.addEventListener('change', () => save({ retry: retry.checked }));

  // 기록 지우기는 한 번 더 눌러야 실행된다
  const clearBtn = h('button', { class: 'btn danger', type: 'button' }, '기록 전부 지우기');
  const confirmRow = h('div', { class: 'row hidden' },
    h('span', { class: 'dim' }, '비교 기록과 시안 파일이 모두 지워져요'),
    h('button', { class: 'btn', type: 'button', onclick: () => { confirmRow.classList.add('hidden'); clearBtn.classList.remove('hidden'); } }, '취소'),
    h('button', {
      class: 'btn danger', type: 'button',
      onclick: async () => {
        try {
          await api.clearRuns();
          state.run = null;
          state.runId = null;
          await refreshRecent();
          toast('기록을 지웠어요');
        } catch (error) {
          console.error(error);
          toast(`지우지 못했어요 · ${error.message}`);
        }
        confirmRow.classList.add('hidden');
        clearBtn.classList.remove('hidden');
      },
    }, '지우기'));
  clearBtn.addEventListener('click', () => { clearBtn.classList.add('hidden'); confirmRow.classList.remove('hidden'); });

  return h('div', { class: 'settings' },
    h('div', { class: 'row between' }, h('h1', null, '설정'), h('button', { class: 'btn', type: 'button', onclick: () => go(state.run ? 'compare' : 'newRun') }, '닫기')),
    h('div', { class: 'panel' },
      field('동시 실행 수', '한 번에 돌리는 Kiro CLI 수예요. 1에서 6까지', concurrency),
      field('시안당 시간 제한', '넘기면 그 시안만 끝내요 (분 단위)', minutes),
      field('빠진 항목 다시 고치기', '지켜야 할 것이 빠지면 한 번 더 고치게 해요', retry),
      field('엔진', null, h('span', { class: 'mono' }, state.engineName))),
    h('div', { class: 'panel' },
      field('실행 기록', '시안 파일과 비교 기록이 저장된 폴더예요', h('button', { class: 'btn', type: 'button', onclick: () => api.openHistoryFolder() }, '폴더 열기')),
      h('div', { class: 'setting-row' }, h('span', { class: 'setting-label' }, '기록 지우기'), clearBtn, confirmRow)));
}

registerScreen('settings', render);
