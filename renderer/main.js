// 화면 모듈을 불러와 등록하고 앱을 시작한다
import { boot, go, hooks, state } from './app.js';
import { isFinished } from '../src/core/status.js';
import { startLive } from './lib/live.js';
import './screens/setup.js';
import './screens/newRun.js';
import './screens/confirm.js';
import './screens/running.js';
import './screens/compare.js';
import './screens/detail.js';
import './screens/settings.js';

startLive();

// 최근 비교를 누르면 그 기록을 다시 연다. 아직 도는 중이면 생성 화면, 끝났으면 비교 화면
hooks.openRun = async (id) => {
  try {
    const run = await window.skillpick.loadRun(id);
    state.run = run;
    state.runId = id;
    state.url = run.url;
    const running = run.variants.some((v) => !isFinished(v.status)) && state.runtime.runId === id;
    go(running ? 'running' : 'compare');
  } catch (error) {
    console.error(error);
  }
};

boot().catch((error) => {
  console.error(error);
  document.getElementById('app').textContent = `앱을 시작하지 못했어요: ${error.message}`;
});
