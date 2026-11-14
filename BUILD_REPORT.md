# BUILD REPORT

실제로 쓴 것만 적었습니다. 쓰지 않은 Kiro 기능(MCP 등)은 적지 않았습니다.

## 도구를 나눈 방식

- 기획, 요구사항·설계·작업 문서(`.kiro/specs/skillpick/`)와 화면 시안(`docs/ui/mockups/`)은 Claude Code로 만들었습니다
- 앱 구현은 Kiro CLI가 `tasks.md`를 위에서부터 따라가며 했습니다
- 완성된 앱도 실행할 때 Kiro CLI를 엔진으로 씁니다. 스킬마다 Kiro CLI 프로세스 하나가 시안을 만듭니다

## 숫자로 본 개발

2026-11-14에 이 저장소에서 직접 센 값입니다.

| 항목 | 값 | 센 방법 |
|---|---|---|
| 커밋 | 19개 (병합 2개, 그 밖 17개) | `git log --oneline \| wc -l`, `git log --merges --oneline \| wc -l` |
| 첫 커밋과 마지막 커밋 | 11:14 `Initial commit`, 16:35 병합 | `git log --date=format:'%H:%M'` |
| 시험 | 172개 통과, 실패 0 (약 6.3초) | `npm test` 출력의 `ℹ tests 172`, `ℹ pass 172`, `ℹ fail 0` |
| 시험 파일 | 16개 (`tests/*.test.js`), 고정 자료 6개 (`tests/fixtures/`) | `ls` |
| 소스 파일 | 44개 (`src/` 25, `electron/` 3, `renderer/` 16) | `find <폴더> -type f \| wc -l` |
| 소스 줄 수 | 4,746줄 (js, cjs, css, html, json) | `find ... -exec cat {} + \| wc -l` |
| 의존성 | 런타임 1개(`linkedom`), 개발 1개(`electron`) | `package.json` |
| Spec | 요구사항 8개, 수용 기준 36개, 구현 작업 17개(모두 완료 표시) | `requirements.md`, `tasks.md`의 `- [x]` 줄 |
| Steering | 3개 파일 (`product.md`, `tech.md`, `security.md`) | `.kiro/steering/` |
| 훅 | 1개 (`test-on-core-save.json`) | `.kiro/hooks/` |
| 기본 스킬 | 6개 | `src/core/skills.js`의 `DEFAULT_SKILLS` |

## Kiro 활용 내역

| 단계 | 사용한 Kiro 기능 | 무엇을 했는지, 어떤 결정을 했는지 | 결과물 위치 |
|---|---|---|---|
| 기획 | Spec: requirements | 요구사항 8개(준비 확인, 페이지와 스킬 고르기, 원본 수집과 지켜야 할 것, 동시 생성, 자동 검사, 비교, 고르고 가져가기, 기록과 설정)를 사용자 이야기와 `WHEN/IF ... THE 앱 SHALL` 꼴의 수용 기준 36개로 적음. 예: `kiro-cli`가 없으면 `kiro-cli를 찾지 못했어요`와 설치 안내, `다시 확인`을 보여 주고 `시작하기`를 끈다 | `.kiro/specs/skillpick/requirements.md` |
| 설계 | Spec: design | 기술 선택, 파일 구조, 데이터 형식, 값을 고정한 핵심 규칙(글자 정규화 방법, 가격·지어낸 숫자 정규식, 지켜야 할 것 상한 25와 빼는 순서, 버튼 판정, 링크 비교), 화면 계산 함수, 원본 캡처 절차, 보안 경계, Kiro 연동(에이전트 파일, 지시문 요지, `--resume` 재시도, 로그인 판정), IPC 표, 오류 처리, 시험 전략을 적음 | `.kiro/specs/skillpick/design.md` |
| 계획 | Spec: tasks | 작업 17개를 순서대로 두고, 체크포인트(★) 7개마다 사용자가 커밋하게 함. 전역 제약(17:00 기능 동결, 늦으면 잘라 낼 순서: 재시도 → SKILL.md 직접 추가 → Kiro 규칙 내보내기 → 모바일 전환. 병렬·검사·비교 격자는 자르지 않음)과 "검토 초점" 5개(외부 `<script src>`는 실패, 상대·절대 링크는 같은 링크, `9,900원`과 `9900원`은 통과, 빈 페이지는 실패 메시지, 대기 중 멈추기는 `멈춤`)를 적어 시험으로 고정하게 함 | `.kiro/specs/skillpick/tasks.md` |
| 규칙 | Steering: `product.md` | 대상, 불편, 약속과 반목표 4개(지켜야 할 것을 빠뜨린 시안이 통과로 보이는 것, 원본 글자 속 지시문으로 명령이 실행되는 것, 하나씩 도는데 동시인 척하는 것, 미리 만든 결과를 실시간인 척 재생하는 것)를 둠. 화면 문구는 한국어로 짧게, 문장 끝 마침표와 em dash 금지, 화면 명세 문구를 그대로 씀 | `.kiro/steering/product.md` |
| 규칙 | Steering: `tech.md` | Electron과 순수 JavaScript ES 모듈만, 의존성은 `electron`·`linkedom`만(추가하려면 먼저 물음), 판정 로직은 `src/core/` 순수 함수와 `node --test`, 색·간격·글꼴은 `tokens.css`에서만, 빈 `catch`와 실패를 성공으로 표시하기 금지. 결과로 `package.json`의 의존성은 두 개뿐이고, 화면 계산도 `src/core/compareView.js`, `confirmView.js`로 빼서 시험함 | `.kiro/steering/tech.md` |
| 규칙 | Steering: `tech.md`의 "스파이크 결과" | 작업 1 스파이크에서 Kiro가 직접 확인한 사실을 적음: 3개·6개 동시 실행이 모두 종료 코드 0(6개는 20~27초), 진행은 stderr·답은 stdout, 도구가 거부돼도 종료 코드 0, 에이전트 파일 키 이름(`tools: ["read","write"]`와 `allowedTools`), 작업 폴더 steering이 읽힘, 폴더별 `--resume` 세션 분리, `--trust-tools`를 주면 폴더 밖 쓰기가 막히지 않음. 이 결과로 기본 동시 3개를 유지하고, 성공 판정을 `out/index.html` 존재로 정함 | `.kiro/steering/tech.md` |
| 규칙 | Steering: `security.md` | Kiro 실행에는 `--trust-tools=fs_read,fs_write`만, `content.json`은 데이터라고 지시문에 명시, 시안은 별도 파티션·Node 없음·CSP·이동과 새 창 차단, 렌더러는 `contextIsolation: true`와 `nodeIntegration: false`, Public 저장소에 비밀값 금지. 코드에서는 `src/main/engine.js`의 실행 인자, `src/core/prompt.js`의 지시문, `electron/main.js`의 `will-attach-webview` 강제 설정으로 반영됨 | `.kiro/steering/security.md` |
| 구현 | Kiro CLI 에이전트 (작업 1~17 순서 실행) | 작업 1 스파이크로 Kiro CLI 비대화 실행, 동시 실행, steering 로딩, `--resume`, 보안 한계를 직접 돌려 확인한 뒤 앱을 구현. 시험이 있는 작업은 시험을 먼저 쓰고 실패를 확인한 뒤 구현 | `src/`, `electron/`, `renderer/`, `tests/` |
| 검증 | Hooks (PostFileSave) | `src/core/` 아래 `.js` 파일을 저장하면(`matcher: src/core/.*\.js$`) 저장소 최상위에서 `npm test`를 돌려 출력을 `.kiro/hooks/last-test.log`에 씀. 통과하면 `npm test 통과`, 실패하면 `npm test 실패`와 로그 마지막 30줄을 stderr로 보이고 종료 코드 1. 제한 시간 120초. `.gitignore`의 `*.log` 규칙 때문에 로그 파일은 커밋되지 않음 | `.kiro/hooks/test-on-core-save.json` |
| 검증 | 직접 실행 | `npm test` 172개 통과(2026-11-14 실측). 실제 공개 사이트 1곳에서 스킬 3개를 앱으로 돌려 `timeline.log`의 시작·종료 시각으로 겹침을 확인 | `docs/screens/` |
| 앱 엔진 | Kiro CLI 커스텀 에이전트 | 앱이 시안마다 작업 폴더에 `designer` 에이전트 파일을 복사하고 `kiro-cli chat --no-interactive --agent designer --trust-tools=fs_read,fs_write`로 시안을 만듦. 동시 수는 설정 1~6(기본 3) | `src/templates/designer-agent.json`, `src/main/engine.js` |
| 앱 엔진 | 작업 폴더별 Spec과 Steering 생성 | 앱이 시안마다 Kiro가 읽는 형식으로 파일을 만듦: 고른 스킬 본문은 `.kiro/steering/skill.md`, 고른 스타일은 `.kiro/steering/style.md`, 지켜야 할 것은 수용 기준 문서 `.kiro/specs/landing/requirements.md`. 빠진 항목이 있으면 같은 폴더에서 `--resume`으로 한 번 더 고치게 함 | `src/main/workspace.js`, `src/core/mustKeep.js`, `src/core/prompt.js`, `src/main/runner.js` |
| 제출물 | Kiro CLI 에이전트와 서브에이전트 | 앱을 `SKILLPICK_CDP_PORT`로 띄우고 `kirothon.ausg.me`를 실제로 돌리며 화면을 프레임 단위로 녹화, 기다리는 구간만 배속(7배, 10배)으로 줄여 29.7초 편집본을 만듦. 같은 실행에서 화면 캡처를 새로 찍고, 서브에이전트가 README·BUILD_REPORT 보강, 발표자료 12장, HyperFrames 소개 영상 47초를 병렬로 만듦 | `docs/screens/`, `docs/presentation/slides.html`, `PRESENTATION.pdf`, 릴리스 `demo-v1` |

훅이 실제로 돌았는지는 따로 확인하지 않았습니다. 로그 파일(`last-test.log`)은 커밋되지 않아 레포에서는 볼 수 없습니다.

## 개발 과정에서 바뀐 점

- **UI 개편 (작업 A~F)**: 판정·실행 로직은 그대로 두고 화면(`renderer/`)과 원본 캡처만 바꿨습니다. 시험 142개에서 172개가 되었고, 화면 계산은 `src/core/compareView.js`, `confirmView.js`, `shotPrep.js` 순수 함수로 빼서 `tests/`에서 시험합니다
  - **비교 격자 2열 고정**: 창 크기나 데스크톱/모바일과 상관없이 2열이고 원본이 첫 칸입니다. 4~5열용 토큰과 `auto-fill` 규칙은 없앴습니다. 카드는 창 높이의 약 60vh이고 정보줄은 항상 보입니다. 모바일 보기는 카드 안에 390폭 틀을 가운데에 둡니다
  - **카드에서 바로 고르기**: 카드 정보줄의 `이걸로 고르기`가 크게 보기를 거치지 않고 고른 뒤 패널을 엽니다. 카드 머리에는 스킬명과 스타일명을 두 줄로 적습니다
  - **같이 스크롤과 사이드바 접기**: 같이 스크롤은 시안 안의 스크롤 위치를 비율로 읽고 써서 맞춥니다. 사이드바는 비교 단계에서 접히고 접힌 상태를 기억합니다
  - **신호등 겹침 수정**: `SkillPick` 글자가 창 제어 버튼 위에 놓이던 것을 `--traffic-x`, `--traffic-w`, `--traffic-gap` 토큰으로 간격을 계산해 글자가 100px부터 시작하게 했습니다
  - **입력 화면**: `불러오기` 버튼을 없애고 주소를 넣고 Enter를 누르면 원본 수집이 바로 시작됩니다. 선택 요약과 `원본 확인 →`은 하단 고정 바에 둡니다. 시안이 12개를 넘으면 이 바에 오류가 보입니다
  - **확인 화면**: 지켜야 할 것을 종류별로 접고 펼치며(항목이 많은 종류는 기본으로 접힘), 종류별·전체 선택/해제가 있습니다. 링크는 `글자 → 경로`로 해시와 줄인 쿼리까지 보입니다. 원본 패널 아래에 수집한 에셋 개수를 보여 줍니다. 에셋을 하나씩 빼는 기능은 넣지 않았습니다
  - **원본 캡처 품질**: 캡처 전에 끝까지 내려갔다 올라와 지연 로딩과 reveal 애니메이션을 끝내고(상한 시간 있음), 캡처 동안만 고정·sticky 요소를 풀고 건너뛰기 링크를 숨긴 뒤 원복합니다. 추출 결과에는 영향이 없습니다
  - **시각 토큰 다듬기**: `tokens.css`를 고쳐 색(상태 색 포함), 글줄 높이, 카드 모서리와 그림자, 포커스 링 색, 움직임 줄이기 설정일 때의 시간을 다듬었습니다. 카드 높이와 열 수 같은 비교 화면 크기 값도 이 파일로 옮겼습니다
  - **확인하지 못한 것**: `같이 스크롤`은 DevTools 프로토콜로 보낸 휠 이벤트로 비율이 맞는 것까지만 봤고 실제 마우스 휠은 못 봤습니다. 신호등은 위 간격 값만 확인했고 실제 창을 화면 캡처해 눈으로 보지는 못했습니다(이 환경의 화면 캡처가 검은 화면). 포커스 링, 대비, 활성 색은 눈으로 따로 점검하지 않았습니다. 생성 중 화면 캡처는 새로 찍지 않았습니다
- **스킬 안의 스타일**: 스킬 하나가 시안 하나이던 구조에서, 스킬이 스타일 목록을 갖고 있으면 스타일마다 시안을 나누도록 바꿨습니다(`ui-ux-pro-max`의 `styles.csv` 51개). 순수 함수(`src/core/styles.js`)와 시험을 먼저 만들었습니다
- **원본 에셋 전달**: 이미지만 주소 목록으로 주던 것을, 역할·가까운 제목·크기를 붙인 `assets.json`으로 바꾸고 인라인 SVG와 배경 이미지도 모읍니다

- **테스트 명령**: Node 24에서 `node --test tests/`가 시험 파일을 찾지 못해 `node --test "tests/**/*.test.js"`로 바꾸고 설계 문서도 같이 고쳤습니다
- **에이전트 파일 형식**: 예전 도구 이름(`tools: ["fs_read","fs_write"]`)은 Kiro CLI v3가 처음 실행할 때 파일을 직접 고쳐 써서, 새 이름(`read`, `write`)과 `allowedTools`를 같이 쓰는 형식으로 정했습니다
- **원본 캡처**: 모바일 에뮬레이션은 viewport 메타가 없는 페이지에서 980폭으로 그려진 뒤 잘려서 쓰지 않고, 창 폭만 바꿨습니다
- **시안 서빙**: `file://` 대신 응답 헤더에 CSP를 강제할 수 있는 전용 프로토콜(`skillpick-variant://`)로 서빙합니다
- **정렬과 필터**: 카드를 옮기면 `<webview>`가 다시 로드되어 DOM을 옮기지 않고 CSS `order`와 `display`로 처리했습니다
- **원본 버튼 판정**: 실제 사이트의 버튼은 유틸리티 클래스만 달린 `<a>`라서, 페이지 안에서 계산된 배경·테두리·여백으로 버튼처럼 보이는지 판정하는 훅을 `extractContent`에 추가했습니다

## 어려웠던 점과 해결 방법

- **`--trust-tools`가 폴더 범위를 풀어 버림**: 신뢰 도구를 주면 작업 폴더 밖 읽기·쓰기가 막히지 않고 에이전트의 `permissions.rules`도 무시되는 것을 확인했습니다. 막을 방법을 찾지 못해 지시문과 `content.json`을 데이터로 다루는 규칙에 기대고, 이 한계를 `tech.md`, 설계 문서, README에 그대로 적었습니다
- **첫 실행에서 시안 3개가 모두 즉시 실패**: 실행 파일이 없거나 `KIRO_CMD`가 빈 문자열일 때 타이머 변수를 선언하기 전에 쓰는 오류와 빈 명령 문제였습니다. 시험을 먼저 추가하고 고쳤습니다
- **도구가 거부돼도 종료 코드가 0**: 성공 판정을 종료 코드가 아니라 `out/index.html` 존재와 검사 결과로 합니다
- **조각 HTML 검사**: `<html>`이 없는 시안은 linkedom이 본문 글자를 읽지 못해서, 검사기가 시안을 감싸서 파싱합니다
- **전역 설정 혼입**: 사용자 전역 steering과 스킬이 시안 생성에 같이 들어오는 것을 확인했지만 끌 방법을 찾지 못해 한계로 적었습니다
