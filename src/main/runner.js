// 실행 흐름: 스킬마다 작업 폴더 → Kiro로 생성 → 코드로 검사 → (빠지면) 한 번 다시 고치기 → 기록.
// Electron을 직접 import하지 않는다. renderCheck 같은 Electron 의존 기능은 주입받아서 Node 시험에서도 돈다.
import fs from 'node:fs';
import path from 'node:path';
import { runEngine, createPool } from './engine.js';
import { createWorkspace } from './workspace.js';
import { saveRun } from './runStore.js';
import { runDir } from './paths.js';
import { buildPrompt, buildRetryPrompt } from '../core/prompt.js';
import { checkHtml } from '../core/checker.js';
import { logTail } from '../core/logTail.js';
import { nextStatus, canRetry, isFinished, STATUS } from '../core/status.js';

const LOG_EMIT_INTERVAL_MS = 400;
const MIN_RETRY_BUDGET_MS = 60_000;

const pickSkill = (s) => ({
  id: s.id, name: s.name, author: s.author, summary: s.summary, source: s.source,
  tags: s.tags, installCmd: s.installCmd ?? null, license: s.license ?? null,
});

/**
 * @param {object} deps
 * @param {(a:{runId:string, skillId:string, workDir:string}) => Promise<{consoleErrors:number, shots:object}>} deps.renderCheck
 * @param {(skill:object) => Promise<string>} deps.loadSkillBody
 * @param {object} [deps.engineOpts] runEngine에 그대로 넘기는 값(cmd, args, env). 시험에서 가짜 명령을 넣는다
 * @param {{run:Function, stopAll:Function, setLimit:Function}} [deps.pool]
 */
export function createRunner(deps) {
  const pool = deps.pool ?? createPool(3);
  const active = new Map(); // runId -> { run, controller, emit }

  /**
   * @param {{runId:string, skills:object[], items:object[], trimmed:boolean, content:object, shots:object, settings:object}} input
   * @param {(event:object)=>void} emit
   * @returns {{run:object, done:Promise<object>}}
   */
  function startRun(input, emit = () => {}) {
    const { runId, skills, items, content, shots, settings } = input;
    const controller = new AbortController();
    const run = {
      id: runId,
      url: content.url,
      title: content.title,
      createdAt: Date.now(),
      finishedAt: null,
      settings: { concurrency: settings.concurrency, timeoutMs: settings.timeoutMs, retry: settings.retry },
      engine: 'Kiro CLI',
      trimmed: Boolean(input.trimmed),
      items,
      variants: skills.map((skill) => ({
        skillId: skill.id,
        skill: pickSkill(skill),
        status: STATUS.queued,
        startedAt: null,
        endedAt: null,
        engine: null,
        retries: 0,
        check: null,
        consoleErrors: null,
        error: null,
        logTail: [],
        workDir: path.join(runDir(runId), skill.id),
      })),
    };
    pool.setLimit(settings.concurrency);
    const stopQueued = () => { for (const v of run.variants) if (v.status === STATUS.queued) stopVariant(v); };
    active.set(runId, { run, controller, stopQueued });
    const timeline = path.join(runDir(runId), 'timeline.log');
    const mark = (skillId, what) => {
      fs.mkdirSync(runDir(runId), { recursive: true });
      fs.appendFileSync(timeline, `${new Date().toISOString()} ${skillId} ${what}\n`);
    };

    const snapshot = (v) => ({
      type: 'variant', runId, skillId: v.skillId, status: v.status, startedAt: v.startedAt, endedAt: v.endedAt,
      retries: v.retries, logTail: v.logTail, check: v.check, consoleErrors: v.consoleErrors, error: v.error,
    });
    const engineRunning = new Set(); // Kiro 프로세스가 실제로 떠 있는 시안
    const runEvent = () => ({
      type: 'run', runId,
      running: engineRunning.size, // 실제 Kiro 프로세스 수
      queued: run.variants.filter((v) => v.status === STATUS.queued).length,
      finished: run.variants.every((v) => isFinished(v.status)),
    });
    const publish = (v) => { saveRun(run); emit(snapshot(v)); emit(runEvent()); };
    const update = (v, event, ctx) => { v.status = nextStatus(v.status, event, ctx); };

    const stopVariant = (v) => {
      update(v, 'stop');
      v.endedAt = Date.now();
      mark(v.skillId, 'stopped');
      publish(v);
    };

    async function engineStage(v, skill, prompt, signal, { resume }) {
      let lastEmit = 0;
      let recent = '';
      const budget = Math.max(
        resume ? MIN_RETRY_BUDGET_MS : 0,
        settings.timeoutMs - (Date.now() - v.startedAt),
      );
      const logFile = path.join(v.workDir, 'kiro.log');
      mark(v.skillId, resume ? 'retry-engine-start' : 'engine-start');
      engineRunning.add(v.skillId);
      emit(runEvent());
      const result = await runEngine(v.workDir, prompt, {
        ...(deps.engineOpts ?? {}),
        resume,
        timeoutMs: budget,
        signal,
        onLog: (chunk) => {
          fs.appendFileSync(logFile, chunk);
          recent = (recent + chunk).slice(-4000);
          v.logTail = logTail(recent);
          const now = Date.now();
          if (now - lastEmit >= LOG_EMIT_INTERVAL_MS) { lastEmit = now; emit(snapshot(v)); }
        },
      });
      engineRunning.delete(v.skillId);
      emit(runEvent());
      mark(v.skillId, resume ? 'retry-engine-end' : 'engine-end');
      if (!resume) v.engine = { startedAt: result.startedAt, endedAt: result.endedAt };
      v.logTail = logTail(result.log);
      return result;
    }

    async function inspect(v) {
      const outFile = path.join(v.workDir, 'out', 'index.html');
      const html = fs.readFileSync(outFile, 'utf8');
      v.check = checkHtml(html, items, content.fullText, { baseUrl: content.url });
      try {
        const rendered = await deps.renderCheck({ runId, skillId: v.skillId, workDir: v.workDir });
        v.consoleErrors = rendered.consoleErrors;
        v.check.consoleErrors = rendered.consoleErrors;
      } catch (error) {
        v.consoleErrors = null;
        v.error = `시안을 화면에 띄워 확인하지 못했어요: ${error.message}`;
      }
    }

    const missingItems = (v) => {
      const bad = new Set(v.check.items.filter((i) => !i.ok).map((i) => i.id));
      return items.filter((i) => bad.has(i.id));
    };

    async function processVariant(v, skill, signal) {
      if (isFinished(v.status)) return; // 멈추기로 이미 끝난 대기 시안
      if (signal.aborted) { stopVariant(v); return; }
      v.startedAt = Date.now();
      update(v, 'start');
      mark(v.skillId, 'start');
      publish(v);
      try {
        const body = await deps.loadSkillBody(skill);
        v.workDir = createWorkspace(runId, skill, body, items, content, shots);
        const first = await engineStage(v, skill, buildPrompt(skill), signal, { resume: false });
        if (first.stopped) { stopVariant(v); return; }
        if (first.timedOut) {
          v.error = `제한 시간 ${Math.round(settings.timeoutMs / 60000)}분을 넘어서 끝냈어요`;
          update(v, 'timeout');
          return;
        }
        const outFile = path.join(v.workDir, 'out', 'index.html');
        if (!fs.existsSync(outFile)) {
          v.error = first.ok ? 'Kiro가 out/index.html을 만들지 않았어요' : `Kiro가 종료 코드 ${first.code ?? '없음'}로 끝났어요`;
          update(v, first.ok ? 'noOutput' : 'engineFailed');
          return;
        }
        update(v, 'generated');
        publish(v);
        await inspect(v);

        let verdict = v.check.ok === v.check.total ? 'passed' : 'missing';
        if (verdict === 'missing' && canRetry({ retry: settings.retry, retries: v.retries })) {
          update(v, 'missing', { retry: settings.retry, retries: v.retries });
          v.retries += 1;
          publish(v);
          const again = await engineStage(v, skill, buildRetryPrompt(missingItems(v)), signal, { resume: true });
          if (again.stopped) { stopVariant(v); return; }
          if (!again.ok && !again.timedOut && again.code === null) {
            // 다시 고치기를 시작조차 못 했다. 파일은 그대로이니 첫 검사 결과를 유지한다
            v.error = '다시 고치기를 시작하지 못했어요';
            update(v, 'retryAbandoned');
            return;
          }
          if (!again.ok) v.error = again.timedOut ? '다시 고치는 중 시간이 초과됐어요' : `다시 고치는 중 Kiro가 종료 코드 ${again.code}로 끝났어요`;
          if (!fs.existsSync(outFile)) {
            v.error = 'Kiro가 다시 고치다가 out/index.html을 지웠어요';
            update(v, 'noOutput');
            return;
          }
          update(v, 'generated');
          publish(v);
          await inspect(v);
          verdict = v.check.ok === v.check.total ? 'passed' : 'missing';
        }
        update(v, verdict, { retry: false, retries: v.retries });
      } catch (error) {
        console.error(`시안 만들기 실패: ${v.skillId}`, error);
        v.error = v.error ?? error.message;
        update(v, 'crash');
      } finally {
        if (!isFinished(v.status)) update(v, 'crash');
        v.endedAt = Date.now();
        mark(v.skillId, v.status);
        publish(v);
      }
    }

    const jobs = run.variants.map((v, i) => pool.run(async (poolSignal) => {
      const signal = AbortSignal.any([poolSignal, controller.signal]);
      await processVariant(v, skills[i], signal);
    }).then((r) => {
      if (r?.notStarted && !isFinished(v.status)) stopVariant(v);
    }));

    saveRun(run);
    emit(runEvent());
    const done = Promise.allSettled(jobs).then(() => {
      run.finishedAt = Date.now();
      saveRun(run);
      active.delete(runId);
      emit(runEvent());
      return run;
    });
    return { run, done };
  }

  function stopRun(runId) {
    const entry = active.get(runId);
    if (!entry) return false;
    entry.controller.abort(); // 실행 중인 Kiro 프로세스를 끝낸다
    entry.stopQueued(); // 대기 중인 시안은 시작되지 않고 바로 멈춤이 된다
    return true;
  }

  function stopAll() {
    for (const entry of active.values()) { entry.controller.abort(); entry.stopQueued(); }
    pool.stopAll();
  }

  return { startRun, stopRun, stopAll, getRun: (id) => active.get(id)?.run ?? null, get activeCount() { return active.size; } };
}
