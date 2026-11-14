---
inclusion: always
---
# 기술 규칙

- Electron + 순수 JavaScript ES 모듈. TypeScript·번들러·UI 프레임워크를 들이지 않는다
- 의존성은 `electron`(개발), `linkedom`(런타임)만. 추가하려면 먼저 사용자에게 묻는다
- 판정 로직(지켜야 할 것 선정, 검사)은 `src/core/`의 순수 함수로 두고 `node --test`로 고정한다. 정답이 있는 계산에 AI를 쓰지 않는다
- 색·간격·글꼴은 `renderer/styles/tokens.css`에서만 정의한다
- 빈 `catch`, 실패를 성공으로 표시하기 금지. 실패는 상태와 로그로 보인다
- 이름·형식은 `.kiro/specs/skillpick/design.md`를 따른다

## 스파이크 결과

2026-11-14 13:20~13:30, 이 맥에서 `kiro-cli`를 실제로 돌려 확인한 것만 적었다. 임시 폴더에서 시험했고 사용자 계정 정보는 적지 않았다.
버전은 시험 중 3.1.0에서 3.3.0으로 바뀌었다(실행 파일 수정 시각이 13:24, 원인은 확인하지 않음). 앞쪽 시험은 3.1.0, 6개 동시 실행과 보안 재시험은 3.3.0이다.

**동시 실행**
- 빈 폴더 3개에서 같은 초에 시작해 모두 종료 코드 0. hello 페이지 18~22초.
- 실제 랜딩(제목·소제목·버튼·가격·내비를 `content.json`으로 주고 완성도 있는 페이지 요구) 6개를 같은 초에 시작해 20~27초에 모두 종료 코드 0. 6개 결과 모두 `content.json`의 글자와 `href`를 담았고 `<script>`는 0개.
- 그래서 기본 동시 3개, 설정 범위 1~6을 그대로 둔다. 시안 1개가 10분을 넘지 않아 예비 엔진 전환 조건은 해당 없음.

**비대화 실행 모양**
- `kiro-cli chat --no-interactive --agent designer --trust-tools=fs_read,fs_write "<지시>"`를 작업 폴더에서 실행하면 된다.
- 도구 진행(`[tool] Write File`, `[tool] status: Completed` 같은 줄)은 stderr, 마지막 답변은 stdout. 로그 꼬리는 둘을 합쳐 읽는다.
- 도구가 거부되어도 종료 코드는 0이다. 성공 판정은 종료 코드가 아니라 `out/index.html` 존재로 한다.
- 엔진은 v2/v3 둘이 있고(`--v2`, `--v3`, 설정 `chat.agentEngine`), 같은 에이전트 파일이 둘 다에서 돌았다. 앱은 엔진 플래그를 고정하지 않고 사용자 설정을 따른다.

**에이전트 파일**
- 위치: 작업 폴더의 `.kiro/agents/designer.json`. `kiro-cli agent list`에 `designer`가 `Workspace`로 잡힌다.
- 키: `tools: ["read","write"]`, `permissions.rules`(`fs_write`를 `out/**`로 제한), `resources: ["file://.kiro/steering/**/*.md"]`. `allowedTools: ["fs_read","fs_write"]`를 같이 두면 v2·v3 모두에서 돌았다.
- 예전 이름 `tools: ["fs_read","fs_write"]`로 쓰면 v3가 처음 실행할 때 파일을 직접 고쳐 쓴다(`kiroUpgrade` 키 추가). 새 이름(`read`,`write`)으로 쓰면 고쳐 쓰지 않았다.

**steering 로딩**
- 작업 폴더의 `.kiro/steering/skill.md`는 읽힌다. 표식(`BANANA-n`, `MANGO-k2/k3`)이 각 폴더 결과에 맞게 들어갔다. v2와 v3 모두 확인.
- 이 맥에서는 전역 steering(`~/.kiro/steering`)과 전역 스킬도 같이 들어온다. 작업 폴더의 `chat.disableInheritingDefaultResources`는 효과가 없었다. 시안 결과가 사용자 전역 규칙의 영향을 받을 수 있다.

**로그인·버전 확인**
- `kiro-cli whoami`: 로그인되어 있으면 종료 코드 0, 아니면 `Not logged in`과 종료 코드 1. `--format json`도 있다. 출력에 이메일이 있으므로 화면·로그에는 가려서 쓴다.
- `kiro-cli --version`: `kiro-cli 3.3.0` 꼴.
- 설치 여부는 실행 파일이 없을 때 실행 오류(`ENOENT`)로 판정한다.

**`--resume`**
- 폴더별로 세션이 분리된다. 폴더 2개에서 각자 `--resume`으로 이어 가자 각자의 표식만 답했고 섞이지 않았다. 재시도는 같은 작업 폴더에서 `--resume`으로 한다.

**보안 한계 (중요, 확인한 사실)**
- `--trust-tools=fs_read,fs_write`를 주면 작업 폴더 밖 파일을 읽고 쓰는 것이 막히지 않는다(3.1.0·3.3.0 모두, v2·v3 모두 폴더 밖 쓰기 성공). 에이전트의 `permissions.rules` deny도 이때는 적용되지 않았다.
- 반대로 `--trust-tools` 없이 에이전트에 `permissions.rules`만 주면 폴더 밖 쓰기가 거부됐다(비대화 모드라 승인 요청이 거부로 처리됨).
- 셸 실행 도구는 어느 경우에도 신뢰 목록에 없으므로 명령 실행은 막혀 있다. 남는 위험은 폴더 밖 파일 읽기와 쓰기다.
- 현재 방어: 지시문과 에이전트 설정에 폴더 범위를 적고, `content.json` 글자는 데이터라고 명시하고, 결과는 `out/index.html`만 읽는다. 강제 장치는 아니다.
