import { h, toast } from '../lib/dom.js';
import { go, registerScreen, state } from '../app.js';
import { URL_ERROR, ensureCapture, onCaptureChange, parseHttpUrl, unitCount } from '../lib/session.js';
import { MAX_UNITS } from '../../src/core/styles.js';

const DEFAULT_PICK = 3;

function selectedIds() {
  if (!state.selectedSkillIds) state.selectedSkillIds = state.skills.slice(0, DEFAULT_PICK).map((s) => s.id);
  return state.selectedSkillIds;
}

function skillCard(skill, onToggle, onPickStyles) {
  const checked = selectedIds().includes(skill.id);
  const input = h('input', { type: 'checkbox', class: 'sr-only', checked: checked ? true : null, onchange: () => onToggle(skill.id) });
  input.checked = checked;
  return h('label', { class: `skill-card ${checked ? 'selected' : ''}` },
    input,
    h('span', { class: 'box', 'aria-hidden': 'true' }, checked ? '✓' : ''),
    h('span', { class: 'skill-head' },
      h('span', { class: 'skill-name mono' }, skill.name),
      h('button', {
        type: 'button', class: 'skill-link', title: '출처 열기', 'aria-label': `${skill.name} 출처 열기`,
        onclick: (e) => { e.preventDefault(); e.stopPropagation(); window.skillpick.openExternal(skill.source); },
      }, '↗')),
    h('span', { class: 'skill-author mono dim' }, skill.author),
    h('span', { class: 'skill-summary' }, skill.summary),
    skill.tags?.length ? h('span', { class: 'tags' }, skill.tags.map((t) => h('span', { class: `tag ${t === '지침만 적용' ? 'warn' : ''}` }, t))) : null,
    skill.hasStyles ? h('span', { class: 'skill-styles' },
      h('button', {
        type: 'button', class: 'link-btn',
        onclick: (e) => { e.preventDefault(); e.stopPropagation(); onPickStyles(skill); },
      }, (state.selectedStyles[skill.id] ?? []).length ? `스타일 ${state.selectedStyles[skill.id].length}개 고름 · 바꾸기` : '스타일 고르기'),
      (state.selectedStyles[skill.id] ?? []).length ? null : h('span', { class: 'dim' }, ' 안 고르면 스킬이 알아서 정해요')) : null);
}

// 스킬 안에 들어 있는 스타일을 골라 시안으로 나눈다. 목록은 스킬 저장소의 파일에서 읽어 온다
function styleDialog(skill, onDone) {
  const picked = new Map((state.selectedStyles[skill.id] ?? []).map((x) => [x.id, x]));
  const filter = h('input', { class: 'input', placeholder: '스타일 이름 찾기', 'aria-label': '스타일 이름 찾기' });
  const list = h('div', { class: 'style-list', role: 'group', 'aria-label': '스타일' });
  const status = h('p', { class: 'hint' }, '스타일 목록을 불러오는 중이에요');
  const doneBtn = h('button', { class: 'btn primary' }, '고르기');
  const overlay = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${skill.name} 스타일 고르기` });
  const close = () => overlay.remove();
  let styles = [];

  const draw = () => {
    const q = filter.value.trim().toLowerCase();
    list.replaceChildren(...styles.filter((x) => !q || x.name.toLowerCase().includes(q)).map((x) => {
      const input = h('input', { type: 'checkbox', 'aria-label': x.name });
      input.checked = picked.has(x.id);
      input.addEventListener('change', () => { if (input.checked) picked.set(x.id, { id: x.id, name: x.name }); else picked.delete(x.id); update(); });
      return h('label', { class: 'style-row' }, input,
        h('span', { class: 'style-text' }, h('span', { class: 'style-name' }, x.name), x.summary ? h('span', { class: 'dim style-sum' }, x.summary) : null));
    }));
  };
  const update = () => {
    status.className = 'hint';
    status.textContent = `${picked.size}개 고름 · 고른 스타일마다 시안이 하나씩 만들어져요`;
    doneBtn.disabled = false;
  };
  filter.addEventListener('input', draw);
  doneBtn.addEventListener('click', () => { close(); onDone([...picked.values()]); });
  filter.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  overlay.append(h('div', { class: 'dialog panel style-dialog' },
    h('h2', null, `${skill.name} 스타일 고르기`),
    filter, status, list,
    h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: close }, '닫기'), h('button', { class: 'btn', onclick: () => { picked.clear(); draw(); update(); } }, '모두 해제'), doneBtn)));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.body.append(overlay);
  filter.focus();
  doneBtn.disabled = true;
  window.skillpick.listStyles(skill.id).then((r) => {
    if (!r.ok) { status.className = 'err'; status.textContent = '스타일 목록을 읽지 못했어요'; return; }
    styles = r.styles;
    draw();
    update();
  }).catch((error) => { console.error(error); status.className = 'err'; status.textContent = '스타일 목록을 읽지 못했어요'; });
}

function addDialog(onAdded) {
  const input = h('input', { class: 'input mono', placeholder: 'https://github.com/…/SKILL.md', 'aria-label': 'SKILL.md 주소' });
  const status = h('p', { class: 'hint' }, 'GitHub 화면 주소나 raw 주소를 넣을 수 있어요');
  const preview = h('div', { class: 'preview hidden' });
  const fetchBtn = h('button', { class: 'btn primary' }, '가져오기');
  const addBtn = h('button', { class: 'btn primary hidden' }, '추가');
  const overlay = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'SKILL.md 주소로 추가' });
  const close = () => overlay.remove();
  let url = '';

  const fetchIt = async () => {
    url = input.value.trim();
    preview.classList.add('hidden');
    addBtn.classList.add('hidden');
    fetchBtn.disabled = true;
    status.className = 'hint';
    status.textContent = '가져오는 중…';
    let r;
    try { r = await window.skillpick.previewSkill(url); } catch (error) { r = { ok: false, message: error.message }; }
    fetchBtn.disabled = false;
    if (!r.ok) {
      status.className = 'err';
      status.textContent = '이 주소에서 SKILL.md를 읽지 못했어요';
      return;
    }
    status.textContent = '';
    preview.replaceChildren(h('strong', { class: 'mono' }, r.skill.name), ...r.skill.preview.map((l) => h('p', { class: 'dim preview-line' }, l)));
    preview.classList.remove('hidden');
    addBtn.classList.remove('hidden');
  };
  fetchBtn.addEventListener('click', fetchIt);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') fetchIt(); if (e.key === 'Escape') close(); });
  addBtn.addEventListener('click', async () => {
    addBtn.disabled = true;
    const r = await window.skillpick.addSkill(url);
    addBtn.disabled = false;
    if (!r.ok) { status.className = 'err'; status.textContent = '이 주소에서 SKILL.md를 읽지 못했어요'; return; }
    close();
    onAdded(r.skill);
  });
  overlay.append(h('div', { class: 'dialog panel' },
    h('h2', null, 'SKILL.md 주소로 추가'),
    input, status, preview,
    h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: close }, '닫기'), fetchBtn, addBtn)));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.body.append(overlay);
  input.focus();
}

function render() {
  const root = h('div', { class: 'newrun' });
  const urlInput = h('input', {
    class: 'input mono', type: 'text', value: state.url, placeholder: 'https://', 'aria-label': '바꿔 볼 페이지 주소',
    spellcheck: 'false', autocomplete: 'off',
  });
  const urlMsg = h('p', { class: 'hint' }, '공개 페이지나 localhost 주소를 넣으세요');
  const loadBtn = h('button', { class: 'btn primary lg' }, '불러오기');
  const grid = h('div', { class: 'skill-grid' });
  const count = h('span', { class: 'dim' });
  const nextBtn = h('button', { class: 'btn primary lg' }, '다음: 원본 확인 →');
  const nextMsg = h('p', { class: 'err' });

  const showUrlStatus = () => {
    const cap = state.capturing;
    if (!cap || cap.url !== parseHttpUrl(urlInput.value)) return;
    if (!cap.done) { urlMsg.className = 'hint'; urlMsg.textContent = '페이지를 불러오는 중이에요'; return; }
    if (state.capture) { urlMsg.className = 'hint'; urlMsg.textContent = `불러왔어요 · 지켜야 할 것 ${state.capture.items.length}개`; }
    else { urlMsg.className = 'err'; urlMsg.textContent = '이 페이지를 열지 못했어요'; }
  };

  const validate = () => {
    const url = parseHttpUrl(urlInput.value);
    if (!url) { urlMsg.className = 'err'; urlMsg.textContent = URL_ERROR; return null; }
    urlMsg.className = 'hint';
    urlMsg.textContent = '공개 페이지나 localhost 주소를 넣으세요';
    return url;
  };

  const drawSkills = () => {
    const ids = selectedIds();
    grid.replaceChildren(...state.skills.map((s) => skillCard(s, (id) => {
      state.selectedSkillIds = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
      if (!state.selectedSkillIds.includes(id)) delete state.selectedStyles[id];
      drawSkills();
    }, (skill) => styleDialog(skill, (list) => {
      if (list.length) {
        state.selectedStyles[skill.id] = list;
        if (!selectedIds().includes(skill.id)) state.selectedSkillIds = [...selectedIds(), skill.id];
      } else delete state.selectedStyles[skill.id];
      drawSkills();
    }))));
    const units = unitCount();
    const unitsText = units !== ids.length ? ` · 시안 ${units}개` : '';
    count.textContent = `${ids.length}개 선택${unitsText} · 동시에 ${state.settings.concurrency}개씩 만들어요`;
    const tooMany = units > MAX_UNITS;
    nextBtn.disabled = ids.length === 0 || tooMany;
    nextMsg.textContent = ids.length === 0 ? '스킬을 하나 이상 골라 주세요' : tooMany ? `시안은 한 번에 ${MAX_UNITS}개까지예요` : '';
  };

  const load = () => {
    const url = validate();
    if (!url) return;
    state.url = url;
    urlInput.value = url;
    ensureCapture(url);
    showUrlStatus();
  };
  loadBtn.addEventListener('click', load);
  urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });
  urlInput.addEventListener('input', () => { state.url = urlInput.value; });
  nextBtn.addEventListener('click', () => {
    const url = validate();
    if (!url || selectedIds().length === 0 || unitCount() > MAX_UNITS) return;
    state.url = url;
    urlInput.value = url;
    ensureCapture(url); // 이미 같은 주소를 불러오는 중이면 그대로 이어서 쓴다
    go('confirm');
  });

  const off = onCaptureChange(() => { if (!root.isConnected) { off(); return; } showUrlStatus(); });
  drawSkills();
  root.append(
    h('section', { class: 'panel' },
      h('h2', null, '어떤 페이지를 바꿔 볼까요'),
      h('div', { class: 'row' }, urlInput, loadBtn),
      urlMsg),
    h('section', { class: 'panel' },
      h('div', { class: 'row between' }, h('h2', null, '어떤 스킬로 돌려 볼까요'), count),
      grid,
      h('div', { class: 'row end' },
        h('button', { class: 'link-btn', onclick: () => addDialog((skill) => {
          if (!state.skills.some((s) => s.id === skill.id)) state.skills = [...state.skills, skill];
          state.selectedSkillIds = [...selectedIds(), skill.id];
          drawSkills();
          toast(`${skill.name} 스킬을 추가했어요`);
        }) }, '+ SKILL.md 주소로 추가')),
      h('div', { class: 'row between footer-row' }, nextMsg, nextBtn)));
  return root;
}

registerScreen('newRun', render);
