import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { isSkipLink, flattenedPosition, shiftFor, nextScrollStep, applyShotPrep } from '../src/core/shotPrep.js';

const VIEW = { width: 1440, height: 900 };
const rect = (left, top, width, height) => ({ left, top, width, height });

test('flattenedPosition: fixed는 absolute, sticky는 static, 나머지는 그대로 둔다', () => {
  assert.equal(flattenedPosition('fixed'), 'absolute');
  assert.equal(flattenedPosition('sticky'), 'static');
  assert.equal(flattenedPosition('-webkit-sticky'), 'static');
  assert.equal(flattenedPosition('absolute'), null);
  assert.equal(flattenedPosition('relative'), null);
  assert.equal(flattenedPosition('static'), null);
  assert.equal(flattenedPosition(''), null);
});

test('shiftFor: 0.5px 안쪽 차이는 무시하고 아니면 되돌릴 만큼 돌려준다', () => {
  assert.equal(shiftFor(rect(0, 0, 10, 10), rect(0.2, 0.4, 10, 10)), null);
  assert.deepEqual(shiftFor(rect(12, 100, 50, 50), rect(0, 40, 50, 50)), { dx: 12, dy: 60 });
  assert.deepEqual(shiftFor(rect(0, 800, 50, 50), rect(0, 900, 50, 50)), { dx: 0, dy: -100 });
});

test('isSkipLink: 화면 밖에 숨긴 건너뛰기 링크를 찾는다', () => {
  const base = { tag: 'A', text: '본문으로 건너뛰기', href: '#main', position: 'fixed', rect: rect(12, -65, 152, 48), viewport: VIEW };
  assert.equal(isSkipLink(base), true);
  assert.equal(isSkipLink({ ...base, text: 'Skip to main content', position: 'absolute', rect: rect(-9999, 0, 100, 20) }), true);
  assert.equal(isSkipLink({ ...base, text: 'Skip to content', position: 'static', rect: rect(0, 0, 1, 1) }), true);
});

test('isSkipLink: 평범한 링크와 버튼, 화면 안에 정상 배치된 링크는 건드리지 않는다', () => {
  const base = { tag: 'A', text: '본문으로 건너뛰기', href: '#main', position: 'static', rect: rect(12, 12, 152, 48), viewport: VIEW };
  assert.equal(isSkipLink(base), false); // 일부러 보이게 둔 링크는 그대로
  assert.equal(isSkipLink({ ...base, text: '가격 보기', position: 'fixed', rect: rect(0, -80, 100, 40) }), false);
  assert.equal(isSkipLink({ ...base, tag: 'BUTTON', position: 'fixed', rect: rect(0, -80, 100, 40) }), false);
  assert.equal(isSkipLink({ ...base, text: '', position: 'fixed', rect: rect(0, -80, 100, 40) }), false);
});

test('nextScrollStep: 한 화면의 절반씩 내려가고 끝에 닿으면 끝낸다', () => {
  assert.deepEqual(nextScrollStep({ y: 0, scrollHeight: 3000, viewportHeight: 900 }), { y: 450, done: false });
  assert.deepEqual(nextScrollStep({ y: 2000, scrollHeight: 3000, viewportHeight: 900 }), { y: 2450, done: true });
  assert.deepEqual(nextScrollStep({ y: 0, scrollHeight: 500, viewportHeight: 900 }), { y: 450, done: true });
});

// 작은 문서로 applyShotPrep을 돈다. 위치와 사각형은 data 속성으로 흉내 낸다.
function fakeDoc() {
  const { document } = parseHTML(`<html><body>
    <a id="skip" href="#main" data-pos="fixed" data-rect="12,-65,152,48">본문으로 건너뛰기</a>
    <nav id="nav" data-pos="fixed" data-rect="0,0,1440,64" data-rect-after="0,0,1440,64">메뉴</nav>
    <div id="bar" data-pos="fixed" data-rect="0,836,1440,64" data-rect-after="0,700,1440,64">띠</div>
    <div id="head" data-pos="sticky" data-rect="0,200,400,100" data-rect-after="0,200,400,100">머리</div>
    <p id="plain" data-pos="static" data-rect="0,300,400,20">본문</p>
  </body></html>`);
  const parse = (s) => { const [left, top, width, height] = s.split(',').map(Number); return { left, top, width, height }; };
  const hooks = {
    viewport: () => VIEW,
    positionOf: (el) => el.style.getPropertyValue('position') || el.getAttribute('data-pos') || 'static',
    rectOf: (el) => {
      const moved = el.style.getPropertyValue('position') === 'absolute' && el.hasAttribute('data-rect-after');
      return parse(el.getAttribute(moved ? 'data-rect-after' : 'data-rect'));
    },
  };
  return { document, hooks };
}

test('applyShotPrep: fixed·sticky를 바꾸고 건너뛰기 링크를 숨긴다', () => {
  const { document, hooks } = fakeDoc();
  const r = applyShotPrep(document, hooks);
  assert.equal(r.hiddenSkipLinks, 1);
  assert.equal(r.flattened, 3); // nav, bar, head. 건너뛰기 링크는 숨기기만 한다
  assert.equal(document.getElementById('skip').style.getPropertyValue('visibility'), 'hidden');
  assert.equal(document.getElementById('nav').style.getPropertyValue('position'), 'absolute');
  assert.equal(document.getElementById('head').style.getPropertyValue('position'), 'static');
  assert.equal(document.getElementById('plain').getAttribute('style'), null);
  // 자리가 바뀐 요소는 원래 자리로 되돌리는 translate를 받는다
  assert.equal(document.getElementById('bar').style.getPropertyValue('translate'), '0px 136px');
  assert.equal(document.getElementById('nav').style.getPropertyValue('translate'), '');
});

test('applyShotPrep: restore가 인라인 스타일을 처음 모양으로 되돌린다', () => {
  const { document, hooks } = fakeDoc();
  document.getElementById('nav').setAttribute('style', 'color: red; position: fixed');
  const before = document.documentElement.outerHTML;
  const r = applyShotPrep(document, hooks);
  assert.notEqual(document.documentElement.outerHTML, before);
  r.restore();
  assert.equal(document.getElementById('nav').style.getPropertyValue('position'), 'fixed');
  assert.equal(document.getElementById('nav').style.getPropertyValue('color'), 'red');
  assert.equal(document.getElementById('skip').style.getPropertyValue('visibility'), '');
  assert.equal(document.getElementById('bar').style.getPropertyValue('translate'), '');
  assert.equal(document.getElementById('head').style.getPropertyValue('position'), '');
});

test('applyShotPrep: 텍스트와 링크는 건드리지 않는다', () => {
  const { document, hooks } = fakeDoc();
  const textBefore = document.body.textContent;
  const hrefs = Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'));
  const r = applyShotPrep(document, hooks);
  assert.equal(document.body.textContent, textBefore);
  assert.deepEqual(Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href')), hrefs);
  r.restore();
  assert.equal(document.body.textContent, textBefore);
});
