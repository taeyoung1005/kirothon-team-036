# 구현 작업: SkillPick

> Kiro가 위에서부터 차례로 실행한다. 각 작업은 `requirements.md`의 번호와 `design.md`의 이름·형식을 따른다.
> 화면은 `docs/superpowers/specs/2026-11-14-skillpick-ui.md`가 정본이고 `docs/ui/mockups/*.png`는 분위기 참고다(이미지 속 글자·스킬 이름을 그대로 옮기지 않는다).
> 커밋은 사용자가 체크포인트(★)마다 한다.

## 전역 제약

- 마감 18:00. **17:00 기능 동결.** 늦으면 잘라 내는 순서: 재시도(5.4) → SKILL.md 직접 추가(2.3) → Kiro 규칙 내보내기(7.2) → 모바일 전환(6.2). 병렬·검사·비교 격자는 자르지 않는다.
- 순수 JS ES 모듈, 의존성은 `electron`(개발), `linkedom`(런타임)만.
- Kiro 엔진 실행에 셸 도구 신뢰 금지: `--trust-tools=fs_read,fs_write` 고정.
- 비밀값·`.env`·개인 경로를 커밋하지 않는다. 저장소는 Public.
- 문구는 화면 명세 그대로. 문장 끝 마침표·em dash 금지. `word-break: keep-all`.
- 색·간격은 `renderer/styles/tokens.css`에서만 정의.
- 하지 않는 일을 화면·README에 쓰지 않는다. 가짜 진행률·미리 만든 결과 재생 금지.

## 검토 초점 (명세가 말하지 않았지만 실제로 터지기 쉬운 것)

1. 시안이 Tailwind CDN 같은 외부 `<script src>`를 넣는다 → 검사 실패로 표시되어야 한다 (작업 5 시험).
2. 원본 버튼 href는 상대경로(`/join`), 시안은 절대경로(`https://site/join/`) → 같은 링크로 판정되어야 한다 (작업 5 시험).
3. 원본 `월 9,900원`, 시안 `월 9900원` 또는 대소문자·띄어쓰기만 다름 → 통과해야 한다 (작업 3 시험).
4. 자바스크립트로 그리는 페이지라 처음 HTML이 비어 있다 → 수집이 기다렸다가 읽거나, 읽을 게 없으면 `이 페이지에서 읽을 내용을 찾지 못했어요`로 실패해야 한다 (작업 7).
5. 스킬 6개 선택·동시 3개에서 `전부 멈추기` → 대기 중이던 것은 시작되지 않고 `멈춤`이 되어야 한다 (작업 8 시험).

---

- [x] 1. 스파이크: Kiro CLI 실제 동작 확인 (13:40까지)
  - 빈 폴더 3개에서 `kiro-cli chat --no-interactive --agent designer --trust-tools=fs_read,fs_write "out/index.html에 hello 페이지를 만들어"`를 **동시에** 실행해 셋 다 끝나는지, 걸린 시간을 잰다.
  - 커스텀 에이전트 파일의 정확한 위치와 키 이름(`.kiro/agents/designer.json`, `tools`/`allowedTools`/`resources`)을 `kiro-cli` 도움말·공식 문서로 확인한다.
  - 에이전트가 `.kiro/steering/*.md`를 읽는지 확인한다(스티어링에 "제목은 반드시 BANANA" 같은 표식을 넣고 결과 확인).
  - 로그인 확인 명령(`kiro-cli whoami` 등)을 찾는다. 폴더별 `--resume`이 다른 폴더 세션과 섞이지 않는지 확인한다.
  - 결과를 `.kiro/steering/tech.md`의 "스파이크 결과" 절에 적는다.
  - 분기: 비대화 실행이 안 되거나 시안 1개가 10분을 넘으면 사용자에게 알리고 멈춘다(예비 엔진 전환은 사용자 결정). 동시 실행만 막히면 기본 동시 수를 1~2로 낮추고 진행.
  - _요구사항: 4.1, 4.2_

- [x] 2. 앱 뼈대와 개발 훅 ★
  - `package.json`(`"type":"module"`, `start: electron .`, `test: node --test tests/`), `electron/main.js`(1440×900, 최소 1200×760, `titleBarStyle: 'hiddenInset'`), `electron/preload.cjs`(`contextIsolation: true`, `nodeIntegration: false`).
  - `renderer/`: 툴바(단계 표시 입력 › 확인 › 생성 › 비교, ⚙), 사이드바(`+ 새 비교`, `최근 비교`), 본문 자리. `tokens.css`에 화면 명세 0절 색·글꼴·간격 토큰.
  - `.kiro/hooks/`에 개발용 훅: `src/core/**` 저장 시 `npm test` 실행해 실패를 보고.
  - 확인: `npm start`로 빈 껍데기 창이 뜬다.
  - _요구사항: 화면 명세 0절_

- [x] 3. `normalizeText`와 `extractContent`
  - 시험 먼저: `tests/extract.test.js` — `tests/fixtures/landing.html`(h1 1, h2 4, 히어로 단락, 버튼 3(그중 상대경로 `/join`), 가격 `₩0`·`월 9,900원`, 내비 3)에서 각 필드가 리터럴과 같다. `normalizeText('월 9,900원') === normalizeText('월9900 원')`, `normalizeText('Join Now!') === normalizeText('join now')`.
  - 구현: `src/core/normalize.js`, `src/core/extract.js` (design.md 규칙). `extractContent`는 DOM `document`만 받는 순수 함수라 페이지 안과 linkedom 양쪽에서 돈다.
  - _요구사항: 3.1_

- [x] 4. 지켜야 할 것 만들기
  - 시험 먼저: `tests/mustKeep.test.js` — 위 고정 페이지에서 14개, 종류 순서 h1→h2→hero→button→price→nav, id 형식 `h2-3`. h2 30개짜리 페이지에서 25개로 줄고 `trimmed: true`, 내비가 먼저 빠짐. `toRequirementsMd` 결과에 `WHEN`·`SHALL`과 각 항목 글자가 들어 있음.
  - 구현: `buildMustKeep(content)`, `toRequirementsMd(items, url)`.
  - _요구사항: 3.2_

- [x] 5. 검사기 ★
  - 시험 먼저: `tests/checker.test.js`
    - 모든 항목 있음 → `passed: true`, `ok === total`.
    - `₩0` 없음 → `passed: false`, `missingKinds` 에 `price`.
    - 원본 `/join` vs 시안 `https://example.com/join/` → 버튼 통과 (검토 초점 2).
    - `<script src="https://cdn.tailwindcss.com">` → `externalScripts.length === 1`, `passed: false` (검토 초점 1).
    - `<form action="https://evil.example/collect">` → `externalForms.length === 1`.
    - 시안에 `만족도 98%`, 원본엔 없음 → `inventedNumbers` 에 포함. 원본에 있는 `월 9,900원`은 미포함.
    - `enabled: false` 항목은 `total`에서 빠짐.
  - 구현: `checkHtml(html, items, originalText)` (linkedom, 보이는 글자는 `script`·`style` 제외 텍스트).
  - _요구사항: 5.1, 5.2_

- [x] 6. 스킬 목록
  - 공개 GitHub에서 디자인 스킬 후보를 실제로 열어 **글 지침만으로 동작하는 것** 6개 이상을 고르고 출처·고정 커밋·라이선스를 `src/core/skills.js`의 `DEFAULT_SKILLS`에 적는다. `k-style-ui-ux`(https://github.com/vmc-inner-circle/k-style-ui-ux)는 필수. `frontend-design`(anthropics), `web-design-guidelines`(vercel), `ui-ux-pro-max`는 후보. 존재를 확인하지 못한 스킬은 넣지 않는다. 시안 이미지의 `minimalist-ui`·`brutalist-web`·`design-critic`은 지어낸 이름이다.
  - 스킬 본문은 저장소에 복사하지 않는다. `fetchSkill`이 raw URL에서 받아 앱 데이터 폴더에 캐시한다.
  - 시험: `tests/skills.test.js` — `parseSkillMd`가 앞머리(`name`, `description`)를 읽고, 없으면 첫 제목을 이름으로 쓴다. `DEFAULT_SKILLS`에 `k-style-ui-ux`가 있다.
  - _요구사항: 2.2, 2.3_

- [x] 7. 원본 수집 (메인)
  - `captureUrl(url, outDir)`: `show: false` 창, 로드 후 네트워크가 잠잠해질 때까지 최대 20초 대기, `extract.js`를 페이지에 주입해 `Content` 획득, 1440·390 전체 캡처 저장. 폼 제출·다운로드·새 창 차단.
  - `h1`도 버튼도 없으면 `이 페이지에서 읽을 내용을 찾지 못했어요` 오류 (검토 초점 4). 시간 초과·차단·주소 오류를 구분한 오류 코드.
  - 확인: 고정 페이지(`file://tests/fixtures/landing.html`)와 실제 사이트 1곳에서 `content.json`과 PNG 2장이 생긴다.
  - _요구사항: 3.1, 3.4, 3.5_

- [x] 8. 엔진과 동시 실행 풀 ★
  - 시험 먼저: `tests/engine.test.js` — 가짜 명령 `tests/fixtures/fake-kiro.js`(인자로 받은 초만큼 자고 `out/index.html` 생성).
    - 작업 5개, 한도 2 → 동시에 도는 수가 2를 넘지 않음(시작·종료 시각 기록으로 검사).
    - 시간 제한 1초, 가짜 3초 → `timedOut: true`.
    - 풀에서 `stopAll()` → 실행 중은 `stopped: true`, 대기 중은 시작되지 않음 (검토 초점 5).
  - 구현: `runEngine(workDir, prompt, {cmd, args, timeoutMs, signal})`, `createPool(limit)` → `{run(task), stopAll(), active, queued}`. 명령은 설정 `KIRO_CMD`(기본 `kiro-cli`).
  - _요구사항: 4.1, 4.2, 4.4, 4.5, 4.6_

- [x] 9. 실행 흐름 묶기
  - `createWorkspace`(design.md 폴더 구조, `designer-agent.json` 복사, 스킬 본문을 `.kiro/steering/skill.md`로, `requirements.md`·`must-keep.json`·`content.json`·캡처 복사).
  - `buildPrompt`/`buildRetryPrompt`, `status.js` 전이, `renderCheck`(숨은 창에서 콘솔 오류 수·캡처 2장), `runStore`(JSON 파일).
  - `startRun`: 풀로 생성 → 검사 → 빠지면 재시도 1회 → 상태 이벤트 `emit`. 시험: `tests/status.test.js`(허용 전이만), `tests/prompt.test.js`(지시문에 "폴더 밖", "지어내지", 빠진 항목 글자 포함).
  - _요구사항: 4.3, 5.3, 5.4, 5.5, 8.1_

- [x] 10. 화면 1 준비 확인, 화면 2 새 비교 ★
  - `checkKiro()`(작업 1에서 찾은 명령), 화면 1 상태 3줄·해결 안내·`다시 확인`, 통과 기록 후 건너뛰기.
  - 화면 2: URL 검증 문구, 스킬 카드 3열(체크·이름·제작처·설명·꼬리표·↗), 선택 수 안내, `+ SKILL.md 주소로 추가` 대화상자, 다음 버튼.
  - _요구사항: 1.1~1.4, 2.1~2.4_

- [x] 11. 화면 3 원본 확인
  - 왼쪽 원본 캡처(데스크톱/모바일), 오른쪽 종류별 지켜야 할 것(체크 해제 가능, `글자 → href`), 줄였을 때 안내, 수집 중 스켈레톤, 실패 화면, `시안 n개 만들기`.
  - _요구사항: 3.2, 3.3, 3.4_

- [x] 12. 화면 4 생성 중
  - 레인마다 상태 배지·단계 3칸·경과 시간·로그 꼬리 2줄(눌러 펼치기), 상단 실제 실행/대기 수, `완료된 것부터 보기`, `전부 멈추기`, 끝나면 `비교하기 →`.
  - _요구사항: 4.2, 4.3, 4.5_

- [x] 13. 화면 5 비교 격자 ★
  - 원본 카드(점선) + 시안 카드, 실제 렌더 축소(`<webview>` 또는 `WebContentsView`, 별도 `partition`, Node 없음, CSP 주입, 이동·새 창 차단), 데스크톱 1440/모바일 390 전환, 카드 정보줄(배지·시간·경고 꼬리표), `통과한 것만`, 정렬. 미완료 카드는 상태만.
  - _요구사항: 6.1~6.5_

- [x] 14. 화면 6 크게 보기, 화면 7 가져가기
  - 화면 6: 전체 렌더 + 오른쪽 320 검사 패널(요약·항목별 ✗ 먼저·스킬 정보·`원본과 나란히`), 좌우 화살표.
  - 화면 7: 출처 복사, `HTML 저장`, `폴더 열기`, `내 프로젝트에 내보내기`(덮어쓰기 확인), 확인된 설치 명령만 표시.
  - _요구사항: 6.6, 7.1~7.3_

- [x] 15. 설정과 최근 비교
  - ⚙: 동시 실행 수 1~6, 시간 제한, 재시도, 엔진 이름 `Kiro CLI`, 기록 폴더 열기, 기록 지우기(확인). 사이드바 최근 비교 클릭 시 비교 화면 복원.
  - _요구사항: 8.1~8.3_

- [x] 16. 실제 확인 (17:00 전) ★
  - `npm test` 전부 통과.
  - 앱에서 실제 공개 사이트 1곳에 스킬 3개(`k-style-ui-ux` 포함)를 돌려 비교 화면까지 간다. 로그의 시작·종료 시각으로 실제로 겹쳐 돌았는지 확인한다.
  - 각 화면을 캡처해 `docs/screens/`에 저장(README·발표용).
  - _요구사항: 전체_

- [x] 17. 제출물 (17:40까지) ★
  - `README.md`: 템플릿 모든 섹션 채우기. 팀 `태지로` / `박태영` / 1인 개발. 숫자 근거는 실제로 잰 것만(예: 스킬 3개 비교에 걸린 실제 시간). Demo 줄에 영상 링크.
  - `BUILD_REPORT.md`: 단계별로 실제로 쓴 Kiro 기능만 적는다(Spec 3종, Steering, Hooks, 앱 엔진으로서의 Kiro CLI 커스텀 에이전트). 기획·시안은 Claude Code로 했다는 사실도 그대로 적는다.
  - `PRESENTATION.pdf` 6~8장: 문제·대상·데모 캡처·구조·Kiro 활용·기대 효과.
  - 데모 영상 녹화(실시간 생성 그대로). 로그아웃 창에서 저장소가 열리는지 확인.
