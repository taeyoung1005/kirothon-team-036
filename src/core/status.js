// 시안 하나의 상태와 허용되는 전이. 허용되지 않은 전이는 오류로 터뜨린다(조용히 넘기지 않는다).
export const STATUS = Object.freeze({
  queued: 'queued',
  generating: 'generating',
  checking: 'checking',
  retrying: 'retrying',
  done: 'done',
  failed: 'failed',
  timeout: 'timeout',
  stopped: 'stopped',
});

export const STATUS_LABEL = Object.freeze({
  queued: '대기',
  generating: '만드는 중',
  checking: '검사 중',
  retrying: '다시 고치는 중 (1/1)',
  done: '완료',
  failed: '실패',
  timeout: '시간 초과',
  stopped: '멈춤',
});

const FINISHED = new Set(['done', 'failed', 'timeout', 'stopped']);
const ACTIVE = new Set(['generating', 'checking', 'retrying']);

export const isFinished = (s) => FINISHED.has(s);
export const isActive = (s) => ACTIVE.has(s);
export const canRetry = ({ retry, retries }) => Boolean(retry) && (retries ?? 0) < 1;

/**
 * @param {string} cur 현재 상태
 * @param {string} event start | generated | passed | missing | noOutput | engineFailed | timeout | retryAbandoned | crash | stop
 * @param {{retry?: boolean, retries?: number}} ctx missing 이벤트에서 재시도 가능 여부를 정하는 값
 */
export function nextStatus(cur, event, ctx = {}) {
  if (event === 'stop') {
    if (FINISHED.has(cur)) return cur;
    if (cur in STATUS) return STATUS.stopped;
  }
  const generatingLike = cur === 'generating' || cur === 'retrying';
  switch (event) {
    case 'start':
      if (cur === 'queued') return STATUS.generating;
      break;
    case 'generated':
      if (generatingLike) return STATUS.checking;
      break;
    case 'passed':
      if (cur === 'checking') return STATUS.done;
      break;
    case 'missing':
      if (cur === 'checking') return canRetry(ctx) ? STATUS.retrying : STATUS.done;
      break;
    case 'noOutput':
    case 'engineFailed':
      if (generatingLike) return STATUS.failed;
      break;
    case 'timeout':
      if (generatingLike) return STATUS.timeout;
      break;
    case 'retryAbandoned': // 다시 고치기가 실패해도 첫 결과가 남아 있으면 그 결과로 완료한다
      if (cur === 'retrying') return STATUS.done;
      break;
    case 'crash': // 예상 못 한 오류
      if (!FINISHED.has(cur) && cur in STATUS) return STATUS.failed;
      break;
    default:
      break;
  }
  throw new Error(`허용되지 않는 전이: ${cur} + ${event}`);
}
