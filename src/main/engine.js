// Kiro CLI 실행부와 동시 실행 풀.
// 앱의 나머지 부분은 runEngine(workDir, prompt) 하나만 안다. 엔진을 바꿔야 할 때 이 함수 뒤만 바꾼다.
import { spawn } from 'node:child_process';

export const DEFAULT_KIRO_CMD = 'kiro-cli';
export const AGENT_NAME = 'designer';
// 셸 실행 도구는 절대 신뢰 목록에 넣지 않는다. (보안 규칙)
export const TRUST_TOOLS = 'fs_read,fs_write';

const KILL_GRACE_MS = 2000;
const LOG_LIMIT = 1_000_000;
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

// 빈 문자열(KIRO_CMD=)은 설정하지 않은 것으로 본다
export function resolveKiroCmd(value = process.env.KIRO_CMD) {
  const v = typeof value === 'string' ? value.trim() : '';
  return v || DEFAULT_KIRO_CMD;
}

export function buildKiroArgs(prompt, { resume = false } = {}) {
  return [
    'chat',
    '--no-interactive',
    ...(resume ? ['--resume'] : []),
    '--agent', AGENT_NAME,
    `--trust-tools=${TRUST_TOOLS}`,
    prompt,
  ];
}

function killTree(child) {
  const send = (signal) => {
    try {
      process.kill(-child.pid, signal); // 프로세스 그룹 전체
    } catch (error) {
      if (error.code !== 'ESRCH') throw error; // 이미 끝난 프로세스는 정상
    }
  };
  send('SIGTERM');
  const timer = setTimeout(() => send('SIGKILL'), KILL_GRACE_MS);
  timer.unref();
  return timer;
}

/**
 * @returns {Promise<{ok:boolean, code:number|null, timedOut:boolean, stopped:boolean, log:string, startedAt:number, endedAt:number}>}
 */
export function runEngine(workDir, prompt, opts = {}) {
  const cmd = opts.cmd !== undefined ? opts.cmd : resolveKiroCmd();
  const args = opts.args ? [...opts.args, prompt] : buildKiroArgs(prompt, { resume: opts.resume });
  const startedAt = Date.now();

  return new Promise((resolve) => {
    let log = '';
    let timedOut = false;
    let stopped = false;
    let settled = false;
    let killTimer = null;
    let timeoutTimer = null; // finish()가 spawn 직후(타이머를 만들기 전)에 불려도 안전하도록 먼저 선언한다

    const append = (chunk) => {
      const text = String(chunk).replace(ANSI_RE, '');
      log += text;
      if (log.length > LOG_LIMIT) log = log.slice(-LOG_LIMIT);
      if (opts.onLog) opts.onLog(text);
    };
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(killTimer);
      opts.signal?.removeEventListener('abort', onAbort);
      resolve({ ok: code === 0 && !timedOut && !stopped, code, timedOut, stopped, log, startedAt, endedAt: Date.now() });
    };

    let child;
    try {
      child = spawn(cmd, args, {
        cwd: workDir,
        env: { ...process.env, NO_COLOR: '1', ...(opts.env ?? {}) },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true, // 자식과 손자 프로세스를 그룹으로 한 번에 끝내기 위해
      });
    } catch (error) {
      append(`${cmd}를 실행하지 못했어요: ${error.message}\n`);
      finish(null);
      return;
    }

    const stop = () => { killTimer = killTree(child); };
    const onAbort = () => { if (!settled) { stopped = true; stop(); } };
    if (opts.timeoutMs) timeoutTimer = setTimeout(() => { if (!settled) { timedOut = true; stop(); } }, opts.timeoutMs);

    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.on('error', (error) => {
      append(`${cmd}를 실행하지 못했어요: ${error.code ?? ''} ${error.message}\n`);
      finish(null);
    });
    child.on('close', (code) => finish(code));

    if (opts.signal?.aborted) onAbort();
    else opts.signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * 동시 실행 풀. 한도를 넘는 작업은 대기열에서 순서를 기다린다.
 * run(task): task는 AbortSignal을 받는다. stopAll()하면 실행 중인 작업의 signal이 중단되고
 * 대기 중인 작업은 시작되지 않은 채 {notStarted: true}로 끝난다.
 */
export function createPool(initialLimit) {
  let limit = Math.max(1, Math.floor(initialLimit) || 1);
  let active = 0;
  let controller = new AbortController();
  let queue = [];

  const pump = () => {
    while (active < limit && queue.length) {
      const entry = queue.shift();
      active += 1;
      Promise.resolve()
        .then(() => entry.task(entry.signal))
        .then(entry.resolve, entry.reject)
        .finally(() => { active -= 1; pump(); });
    }
  };

  return {
    run(task) {
      return new Promise((resolve, reject) => {
        queue.push({ task, resolve, reject, signal: controller.signal });
        pump();
      });
    },
    stopAll() {
      const waiting = queue;
      queue = [];
      controller.abort();
      controller = new AbortController();
      for (const entry of waiting) entry.resolve({ notStarted: true });
    },
    setLimit(n) {
      limit = Math.max(1, Math.floor(n) || 1);
      pump();
    },
    get limit() { return limit; },
    get active() { return active; },
    get queued() { return queue.length; },
  };
}
