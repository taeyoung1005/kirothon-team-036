// 시험용 가짜 kiro-cli. 진짜 kiro-cli의 실행 모양을 흉내 낸다.
// 사용: node fake-kiro.js <초> [옵션...] "<지시>"   (작업 폴더가 cwd)
// - 인자로 받은 초만큼 자고 out/index.html을 만든다
// - 시작·종료 시각을 cwd의 fake-kiro.times.json 에 남긴다
// - 환경변수 FAKE_KIRO_EXIT=1 이면 파일을 만들지 않고 종료 코드 1
import fs from 'node:fs';
import path from 'node:path';

const seconds = Number(process.argv[2] ?? '0.2');
const startedAt = Date.now();
process.stderr.write('[tool] Write File\n');
process.stdout.write(`시작 pid=${process.pid}\n`);

let stopped = false;
process.on('SIGTERM', () => { stopped = true; process.stderr.write('SIGTERM 받음\n'); process.exit(143); });

await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
if (stopped) process.exit(143);

if (process.env.FAKE_KIRO_EXIT) {
  process.stderr.write('실패를 흉내 냄\n');
  process.exit(Number(process.env.FAKE_KIRO_EXIT));
}
fs.mkdirSync('out', { recursive: true });
fs.writeFileSync(path.join('out', 'index.html'), '<!doctype html><html><body><h1>가짜 시안</h1></body></html>');
fs.writeFileSync('fake-kiro.times.json', JSON.stringify({ startedAt, endedAt: Date.now(), pid: process.pid }));
process.stdout.write('끝냈습니다\n');
