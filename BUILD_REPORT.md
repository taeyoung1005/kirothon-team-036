# BUILD REPORT

실제로 쓴 것만 적었습니다. 쓰지 않은 Kiro 기능(MCP 등)은 적지 않았습니다.

## 도구를 나눈 방식

- 기획, 요구사항·설계·작업 문서(`.kiro/specs/skillpick/`)와 화면 시안(`docs/ui/mockups/`)은 Claude Code로 만들었습니다
- 앱 구현은 Kiro CLI가 `tasks.md`를 위에서부터 따라가며 했습니다
- 완성된 앱도 실행할 때 Kiro CLI를 엔진으로 씁니다. 스킬마다 Kiro CLI 프로세스 하나가 시안을 만듭니다

## Kiro 활용 내역

| 단계 | 사용한 Kiro 기능 | 무엇을 했는지 | 결과물 위치 |
|---|---|---|---|
| 기획 | Spec (requirements, design, tasks) | 요구사항, 설계, 구현 작업 목록을 Spec 형식으로 둠. 작성은 Claude Code, 구현 때 Kiro가 읽고 따름 | `.kiro/specs/skillpick/requirements.md`, `design.md`, `tasks.md` |
| 설계 | Steering | 제품·기술·보안 규칙을 항상 포함되는 steering으로 둠. 구현 중 Kiro가 이 규칙을 따랐고, 스파이크로 확인한 사실은 `tech.md`에 Kiro가 적음 | `.kiro/steering/product.md`, `tech.md`, `security.md` |
| 구현 | Kiro CLI 에이전트 (작업 1~17 순서 실행) | 작업 1 스파이크로 Kiro CLI 비대화 실행, 동시 실행, steering 로딩, `--resume`, 보안 한계를 직접 돌려 확인한 뒤 앱을 구현. 시험이 있는 작업은 시험을 먼저 쓰고 실패를 확인한 뒤 구현 | `src/`, `electron/`, `renderer/`, `tests/` |
| 검증 | Hooks (PostFileSave) | `src/core/` 저장 시 `npm test`를 돌리는 훅을 만듦 | `.kiro/hooks/test-on-core-save.json` |
| 검증 | 직접 실행 | `npm test` 121개 통과. 실제 공개 사이트 1곳에서 스킬 3개를 앱으로 돌려 `timeline.log`의 시작·종료 시각으로 겹침을 확인 | `docs/screens/` |
| 앱 엔진 | Kiro CLI 커스텀 에이전트 | 앱이 작업 폴더마다 `designer` 에이전트 파일을 복사하고 `kiro-cli chat --no-interactive --agent designer --trust-tools=fs_read,fs_write`로 시안을 만듦 | `src/templates/designer-agent.json`, `src/main/engine.js`, `src/main/workspace.js` |

`last-test.log`가 훅 설정 시각 이후에 쓰인 기록이 있어 훅이 돈 것으로 보이지만, 훅이 돌았다는 것을 따로 확인하지는 않았습니다.

## 개발 과정에서 바뀐 점

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
