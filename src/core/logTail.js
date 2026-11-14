// 화면에 보이는 "Kiro 출력 마지막 줄들". 내부 디버그 줄(`[INFO]` 등)과 도구 상태 줄(`[tool] status: ...`)은 거른다.
// 전체 로그(kiro.log)에는 모두 남는다. 거르고 나면 아무것도 안 남을 때는 원래 마지막 줄을 그대로 보여 준다.
const NOISE = /^\[(INFO|DEBUG|TRACE)\]|^\[tool\] status:/;

export function logTail(text, n = 2, maxLen = 160) {
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const meaningful = lines.filter((l) => !NOISE.test(l));
  const pick = (meaningful.length ? meaningful : lines).slice(-n);
  return pick.map((l) => (l.length > maxLen ? `${l.slice(0, maxLen - 1)}…` : l));
}
