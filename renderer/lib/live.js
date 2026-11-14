// 실행 중 이벤트를 받아 화면 상태(state.run)에 합친다. 화면은 subscribe로 다시 그릴 때를 안다.
import { state, refreshRecent } from '../app.js';

const subs = new Set();
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
const notify = () => { for (const fn of [...subs]) fn(); };

async function reloadFinal(runId) {
  try {
    const run = await window.skillpick.loadRun(runId);
    if (state.run?.id === runId) state.run = run;
  } catch (error) {
    console.error('끝난 실행 기록을 읽지 못했어요', error);
  }
  await refreshRecent();
  notify();
}

function apply(e) {
  if (e.type === 'variant') {
    const v = state.run?.id === e.runId ? state.run.variants.find((x) => x.skillId === e.skillId) : null;
    if (v) {
      const changed = v.status !== e.status;
      Object.assign(v, {
        status: e.status, startedAt: e.startedAt, endedAt: e.endedAt, retries: e.retries,
        logTail: e.logTail, check: e.check, consoleErrors: e.consoleErrors, error: e.error,
      });
      if (changed) refreshRecent();
    }
  } else if (e.type === 'run') {
    state.runtime = { running: e.running, queued: e.queued, finished: e.finished, runId: e.runId };
    if (e.finished) { reloadFinal(e.runId); return; }
  }
  notify();
}

export function startLive() { window.skillpick.onRunEvent(apply); }
