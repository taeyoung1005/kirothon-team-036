// kiro-cli 설치·버전·로그인 확인. 스파이크로 확인한 명령을 쓴다:
//   kiro-cli --version  → "kiro-cli 3.3.0"
//   kiro-cli whoami     → 로그인이면 종료 코드 0, 아니면 "Not logged in"과 종료 코드 1
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { resolveKiroCmd } from './engine.js';

export const INSTALL_CMD = 'curl -fsSL https://cli.kiro.dev/install | bash';
export const LOGIN_CMD = 'kiro-cli login';

// Finder에서 연 앱은 PATH가 짧아서 kiro-cli를 못 찾는다. 흔한 설치 위치를 PATH 앞에 붙인다.
export function extendPath(env = process.env) {
  const extra = [path.join(os.homedir(), '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin'];
  const current = (env.PATH ?? '').split(path.delimiter).filter(Boolean);
  env.PATH = [...extra.filter((p) => !current.includes(p)), ...current].join(path.delimiter);
  return env.PATH;
}

function exec(cmd, args, timeoutMs = 10000) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let finished = false;
    let timer = null; // done()이 타이머를 만들기 전에 불려도 안전하도록 먼저 선언한다
    const done = (result) => { if (!finished) { finished = true; clearTimeout(timer); resolve(result); } };
    let child;
    try {
      child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } });
    } catch (error) {
      done({ code: null, stdout, stderr, error });
      return;
    }
    timer = setTimeout(() => { child.kill('SIGKILL'); done({ code: null, stdout, stderr, error: new Error('시간 초과') }); }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (error) => done({ code: null, stdout, stderr, error }));
    child.on('close', (code) => done({ code, stdout, stderr, error: null }));
  });
}

export function maskEmail(email) {
  const s = String(email ?? '');
  const at = s.indexOf('@');
  if (at < 1) return '';
  return `${s.slice(0, Math.min(3, at))}…@…`;
}

/** @returns {Promise<{installed:boolean, version:string|null, loggedIn:boolean, account:string, error:string|null}>} */
export async function checkKiro(cmd = resolveKiroCmd()) {
  const v = await exec(cmd, ['--version']);
  if (v.error) {
    const missing = v.error.code === 'ENOENT';
    return { installed: false, version: null, loggedIn: false, account: '', error: missing ? 'not-found' : v.error.message };
  }
  const version = (v.stdout.match(/(\d+\.\d+\.\d+)/) ?? [])[1] ?? null;
  const who = await exec(cmd, ['whoami', '--format', 'json']);
  if (who.error) return { installed: true, version, loggedIn: false, account: '', error: who.error.message };
  if (who.code !== 0) return { installed: true, version, loggedIn: false, account: '', error: null };
  let account = '';
  try {
    account = maskEmail(JSON.parse(who.stdout).email);
  } catch (error) {
    console.error('whoami 출력을 읽지 못했어요', error); // 로그인 판정은 종료 코드로 이미 끝났다
  }
  return { installed: true, version, loggedIn: true, account, error: null };
}
