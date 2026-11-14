import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkKiro, maskEmail } from '../src/main/preflight.js';

function fakeKiro({ version = 'kiro-cli 9.8.7', whoamiCode = 0, whoamiOut = '{"email":"someone@example.com"}' } = {}) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'skillpick-pf-')), 'kiro');
  fs.writeFileSync(file, `#!/bin/sh
case "$1" in
  --version) echo '${version}';;
  whoami) echo '${whoamiOut}'; exit ${whoamiCode};;
esac
`);
  fs.chmodSync(file, 0o755);
  return file;
}

test('checkKiro: 없는 명령은 설치 안 됨 (예외를 던지지 않는다)', async () => {
  const r = await checkKiro('/no/such/kiro-cli');
  assert.equal(r.installed, false);
  assert.equal(r.loggedIn, false);
  assert.equal(r.error, 'not-found');
});

test('checkKiro: 로그인된 경우 버전과 가려진 계정', async () => {
  const r = await checkKiro(fakeKiro());
  assert.equal(r.installed, true);
  assert.equal(r.version, '9.8.7');
  assert.equal(r.loggedIn, true);
  assert.equal(r.account, 'som…@…');
  assert.ok(!JSON.stringify(r).includes('example.com'), '이메일 원문이 새어 나가면 안 된다');
});

test('checkKiro: whoami가 종료 코드 1이면 로그인 안 됨', async () => {
  const r = await checkKiro(fakeKiro({ whoamiCode: 1, whoamiOut: 'Not logged in' }));
  assert.equal(r.installed, true);
  assert.equal(r.loggedIn, false);
  assert.equal(r.account, '');
});

test('maskEmail', () => {
  assert.equal(maskEmail('tae@example.com'), 'tae…@…');
  assert.equal(maskEmail('ab@x.com'), 'ab…@…');
  assert.equal(maskEmail('no-at-sign'), '');
  assert.equal(maskEmail(undefined), '');
});

test('checkKiro: 빈 명령 이름도 예외 없이 설치 안 됨으로 본다', async () => {
  const r = await checkKiro('');
  assert.equal(r.installed, false);
});
