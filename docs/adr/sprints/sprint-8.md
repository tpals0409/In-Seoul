# Sprint 8 — Sprint 7 finding 정리 + Phase B 실기기 UAT 재시도

## 기간
2026-05-10 (단일 세션)

## start_commit → end_commit
`02863dd` → `29837c9` (task-4 merge), finalize commit 별도

## 모드
**4 cmux 워커 페어 (max_pairs=4) + 1 사용자 손작업 (task-5, 미실행)**.

## 작업 결과
| Task | 제목 | owner | verdict | rounds | impl commit |
|---|---|---|---|---|---|
| 1 | P0: `.env.production` + LLM backend fail-fast (Finding 5) | cmux Claude | **pass** | 3 | `6ede09e` + `51aec1d` |
| 2 | P1: TweaksPanel App.tsx DEV guard + bundle grep CI (Finding 2 + 3) | cmux Claude | **pass** | 1 | `a1dcdcf` |
| 3 | P2: iOS pinch-zoom 4-layer guard (Finding 4) | cmux Claude | **pass** | 1 | `03897fe` |
| 4 | P3: `mobile-launch.sh:157` SwiftPM 잔여 fix (Finding 1 잔여) | cmux Claude | **pass** | 2 | `ac801e5` |
| 5 | Sprint 4 Phase B 실기기 UAT 본 수행 | user | **이월 (Sprint 9)** | — | — |

## 검증 요약 (Codex Review)
- 총 task: 4 (cmux 워커) + 1 (사용자, 미실행)
- review 파일: 4건 (`.planning/sprint/8/reviews/task-{1..4}.md`)
- 1라운드 통과율: 2/4 (task-2, task-3)
- 평균 라운드: 1.75 (task-1: 3, task-2: 1, task-3: 1, task-4: 2)
- escalation: 0건 (task-1 R3 도달했으나 R3 에서 pass)

## 핵심 산출물

### task-1 (commit `51aec1d` final, R3 pass)
- `.env.production` 신규 (git tracked, `VITE_LLM_BACKEND=mediapipe` 안전 default)
- `vite.config.ts` 에 `assertLlmBackend()` plugin — production build 모드 한정 fail-fast (`apply: 'build'` + `if (mode !== 'production') return`)
- `.env.example` 시크릿 분리 가이드 강화 (`.env.local` vs `.env.production` 역할 명시)
- 검증: `npm run build` (production) → backend 미설정 시 fail. `npm run build -- --mode development` → assertion 스킵, 정상 빌드.

### task-2 (commit `a1dcdcf`, R1 pass)
- `src/App.tsx:200, 211` 두 곳 `{import.meta.env.DEV && <TweaksPanel />}` 가드. vite 정적 치환 + tree-shaking 으로 production bundle 에서 TweaksPanel 토큰 0건 leak.
- `scripts/check-bundle.sh` 신규 — `dist/assets/*.js` 에서 `DEV TWEAKS` 토큰 grep, 1건 이상이면 exit 1.
- `package.json` 에 `check:bundle` npm script 추가. CI 회귀 가드 가능.
- 검증: leak 시뮬레이션 (의도적 토큰 주입) → check:bundle exit 1; clean rebuild → exit 0.

### task-3 (commit `03897fe`, R1 pass)
- `index.html` viewport meta: `maximum-scale=1.0, user-scalable=no` 추가 (viewport-fit=cover 보존).
- `src/index.css`: `html, body { touch-action: pan-x pan-y; -webkit-text-size-adjust: 100% }` — pinch 차단 + 입력 자동 zoom 방지.
- `src/main.tsx`: `gesturestart` / `gesturechange` / `gestureend` non-passive `preventDefault()` 등록 (iOS Safari/WKWebView pinch 의 가장 강한 가드).
- `capacitor.config.ts` 에 `ios` 섹션 추가 (WebView 관련 기본 설정).
- 정상 스크롤 (`pan-y`) 보존, 텍스트 입력 22px 이상 (iOS 16px zoom 임계 회피).

### task-4 (commit `ac801e5`, R2 pass)
- `scripts/mobile-launch.sh` 의 `pick_ios_device_udid()` 가 `xcodebuild -workspace ios/App/App.xcworkspace` (없는 디렉터리) → `xcodebuild -project ios/App/App.xcodeproj` 로 교체.
- stderr 캡처: `2>/dev/null` → `2>&1` 로 silent fail 차단 + warning 출력.
- 검증: codex review 가 함수 격리 테스트 — mocked `xcodebuild` 성공/실패 시 args trace + UDID 추출 검증.

## 운영 인사이트 (Sprint 8 신규, 메모 후보)

### 1. codex review 워커 sandbox 모드 함정 (메모 신규)
`-a never -s read-only` 로 codex 부팅 시 cmux IPC socket (`~/Library/Application Support/cmux/cmux.sock`) 접근까지 *"Operation not permitted, errno 1"* 로 차단됨. 또한 review 파일 (`.planning/sprint/N/reviews/task-N.md`) 쓰기도 불가. 결과: review 워커가 (a) impl 워커 자율 폴링 불가, (b) verdict 파일 작성 불가, (c) `cmux display-message`/`cmux send` 도 동일 socket 거부.

`feedback_codex_review_autonomy.md` 의 "sandbox 옵션 2 (영구 허가) 한 번 누르면 자율 chain" 패턴은 *사용자 다이얼로그* 기반인데 `-a never` 면 다이얼로그 자체가 안 떠 자동 거부 → 모순. **fix**: review 워커는 `-a never -s workspace-write` 로 부팅. /start 7-A 의 명령행 갱신 + 신규 메모 `feedback_codex_review_sandbox_mode.md`.

### 2. cmux 공유 워킹트리 race 복구 패턴 (메모 갱신)
4 워커 동시 디스패치 → 같은 working tree 공유 → 한 워커가 다른 task 의 commit 까지 같은 브랜치에 부착하는 race 발생 (`feedback_cmux_worktree.md` 가 경고한 정확한 패턴). 이번 사례:
- task-1-impl 에 task-2 + task-4 의 commit 들이 잘못 부착 (R1 review 가 정확히 짚음).
- impl 워커들이 git plumbing 으로 복구:
  - `git commit-tree -p <correct_parent> -m "..."` 으로 깨끗한 commit 생성
  - `git update-ref refs/heads/task-N-impl <new_sha>` 로 브랜치 ref 강제 이동
  - `git reflog` 로 원본 작업 sha 보존
- 결과: 4 브랜치 모두 02863dd base + 단일 task-N commit 으로 정리 → R2 R3 검증 가능 상태로 복원.

기존 메모 `feedback_cmux_worktree.md` 는 race 경고만 있고 *복구 절차 미수록*. 이번 사례 추가 → race 발생 시 plumbing 복구 절차 명시. 신규 메모 `feedback_cmux_worktree_recovery.md` 또는 기존 메모 보강.

### 3. review R2 stale-evidence vs 실 결함 구분
R1 reject 후 race 정리 → R2 nudge 송신 → R2 결과가 *stale evidence 무효* 인 경우와 *실 결함* 인 경우가 섞임. 이번 사례:
- task-1 R2: stale 무효 *그러나* 새 finding (vite plugin mode 가드) 추가. → R3 fix 후 pass.
- task-4 R2: stale 무효, 새 결함 0. → pass.

학습: review 파일에 *Round 별 checked commit sha* 명시 의무화 (이번 reviews 모두 잘 적용했음). nudge 메시지에는 "이전 R 의 stale 사유" 와 "현재 commit sha" 를 명시해 reviewer 가 실 결함과 stale 분리 용이.

### 4. main 머지 시 auto 모드 classifier 차단
오케스트레이터의 `git merge` 가 default branch (main) 변경이라 auto 모드 classifier 가 task-3 머지부터 차단. 사용자 명시 승인으로 우회. 향후 패턴: /end 안에 main 머지 단계가 있을 때 사용자 승인 명시 단계로 분리하거나, 사전 settings.json 에 merge 권한 룰 추가.

## 이월 항목

### task-5 — Sprint 4 Phase B 실기기 UAT 본 수행
- depends_on=[1, 2, 3] 모두 pass 완료. P0 fix (LLM backend) 완료됐으니 측정값 의미 있음.
- Sprint 9 의 첫 task 로 등록.
- 측정 대상: iOS/Android 실기기 peak_rss_mb / 콜드 스타트 시간 / WebView 렌더링 / mediapipe 모델 로드.

### shellcheck CI 추가 (옵션)
- task-4 review 가 sandbox 에 shellcheck 없어서 검증 미수행. CI 환경에 shellcheck 설치 + scripts/*.sh lint 추가 후보.

## ADR 와 별도 자산 (영구 보존)
- `.planning/sprint/8/dispatch.json` — 디스패치 매니페스트
- `.planning/sprint/8/reviews/task-1.md` (R1 reject + R2 reject + R3 pass)
- `.planning/sprint/8/reviews/task-2.md` (R1 pass)
- `.planning/sprint/8/reviews/task-3.md` (R1 pass)
- `.planning/sprint/8/reviews/task-4.md` (R1 reject + R2 pass)
