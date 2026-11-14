import fs from 'node:fs';
import { settingsFile } from './paths.js';

export const DEFAULT_SETTINGS = Object.freeze({
  concurrency: 3,
  timeoutMs: 8 * 60 * 1000,
  retry: true,
  setupDone: false,
});

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function sanitizeSettings(input = {}) {
  const out = { ...DEFAULT_SETTINGS };
  if (Number.isFinite(Number(input.concurrency))) out.concurrency = clamp(Math.round(Number(input.concurrency)), 1, 6);
  if (Number.isFinite(Number(input.timeoutMs))) out.timeoutMs = clamp(Math.round(Number(input.timeoutMs)), 60_000, 30 * 60_000);
  if (typeof input.retry === 'boolean') out.retry = input.retry;
  if (typeof input.setupDone === 'boolean') out.setupDone = input.setupDone;
  return out;
}

export function getSettings() {
  let raw;
  try {
    raw = fs.readFileSync(settingsFile(), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { ...DEFAULT_SETTINGS };
    throw error;
  }
  try {
    return sanitizeSettings(JSON.parse(raw));
  } catch (error) {
    console.error('설정 파일을 읽지 못해 기본값을 씁니다', error);
    return { ...DEFAULT_SETTINGS };
  }
}

export function setSettings(patch) {
  const next = sanitizeSettings({ ...getSettings(), ...patch });
  fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2));
  return next;
}
