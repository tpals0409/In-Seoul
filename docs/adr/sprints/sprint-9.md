# Sprint 9 — 실기기 UAT 본 수행 + 잔여 인프라 보강

## 기간
2026-05-10 (단일 세션, 약 30분 — task-2 만 cmux 디스패치)

## start_commit → end_commit
6d6784f → 28a4bac (task-2 merge commit)

## 작업 결과
| Task | 제목 | verdict | rounds | commit |
|---|---|---|---|---|
| 1 | Sprint 4 Phase B 실기기 UAT 본 수행 (iOS/Android peak_rss_mb / 콜드 스타트 / mediapipe / WebView) | **이월** | — | (사용자 손작업, 미실행) |
| 2 | shellcheck CI 추가 + scripts/*.sh lint 정리 | pass | 2 | b0f16f1 → merge 28a4bac |
| 3 | cmux 워커 worktree 분리 (/start skill 갱신) | **이월** | — | (메타 작업, 별도 세션) |

## 검증 요약 (Codex Review)
- 총 cmux task: 1 (task-2)
- 1라운드 통과율: **0/1** (R1 stale reject — `a1dcdcf` 잘못 검증)
- 평균 라운드: 2
- escalation: 0건
- 총 task (사용자 손작업 포함): 3 — pass 1, 이월 2
- review 파일 인덱스:
  - `.planning/sprint/9/reviews/task-2.md` (R1 reject stale + R2 pass)

## 신규 결정 / 패턴 / 교훈

### 1. Codex review 워커는 cmux IPC socket 도 차단됨 (신규 메모)
Sprint 8 메모 `feedback_codex_review_sandbox_mode.md` 가 `-a never -s read-only` → `-s workspace-write` 로 처방했지만, Sprint 9 task-2 R1 에서 `workspace-write` 모드도 `~/Library/Application Support/cmux/cmux.sock` 접근을 거부함 (`Operation not permitted`). 원인: cmux socket 이 macOS `~/Library/Application Support/` 하위라 Codex 의 workspace 격리 영역 밖. `-s workspace-write` 는 *디스크 쓰기* 만 풀어주지 *외부 socket* 은 못 뚫음.

**처방**: review 워커가 `cmux display-message` / `cmux send` 송신 자체를 못 하므로 verdict 시그널은 *review 파일 frontmatter SSOT 만* 신뢰. 오케스트레이터가 IMPL_DONE / 라운드 nudge 도 직접 송신. 신규 메모 `feedback_codex_review_socket_block.md`.

후속 조사: `CMUX_SOCKET_PATH` 환경변수를 workspace 내부 경로로 redirect 가능한지.

### 2. review 워커 stale commit lookup 패턴 (신규 메모)
review 워커가 부팅 시점 branch HEAD 를 캡처해 검증을 시작하면 이후 impl 워커의 commit / rebase / git plumbing 으로 ref 가 이동해도 새 sha 를 추적 못 함 → *stale commit* (다른 sprint 의 commit 일 수도) 검증 후 무효 reject.

이번 사례: review 가 `a1dcdcf` (Sprint 8 task-2 의 TweaksPanel commit) 를 검증함. 실제 task-2-impl HEAD 는 `b0f16f1` (CI shellcheck step). a1dcdcf 시점엔 ① shellcheck step 미존재 ② Sprint 8 task-4 SwiftPM fix 미적용 → 둘 다 R1 reject 사유로 보고됐는데 *둘 다 stale*. R2 nudge 로 정상 verify 후 pass.

**처방**:
- review prompt 에 "Round 진입 *매번* `git fetch && git rev-parse task-N-impl` 로 최신 HEAD 재캡처" 명시
- review 파일 Round R 본문 첫 줄 `Checked commit: <full_sha>` 의무 (이미 Sprint 5+ 패턴, 이번에도 잘 작동)
- 오케스트레이터가 review 파일 폴링 시 *Checked commit* 과 `git rev-parse` 결과 교차 검증, 불일치면 즉시 nudge
- 신규 sprint /start 시 이전 task-N-impl 브랜치 잔존 여부 확인 + 충돌 시 삭제 후 재생성 권장

신규 메모 `feedback_review_stale_commit_lookup.md`.

### 3. 사용자 손작업 + 메타 작업 분리는 정합 (재확인)
Sprint 9 의 3 task 중 cmux 워커가 분담한 건 task-2 만. task-1 (UAT) 은 측정 자체가 사람 손, task-3 (`/start` skill 자체 수정) 은 메타 작업으로 별도 세션이 안전. 이 분리 원칙은 Sprint 8 의 task-5 분리 패턴과 동일 — 정합.

## 이월 항목

### task-1 — Sprint 4 Phase B 실기기 UAT 본 수행 (Sprint 10)
- Sprint 8 → Sprint 9 → Sprint 10 으로 두 번째 이월. Sprint 8 P0 (LLM backend) fix 완료 상태이므로 측정값 의미 있음.
- 측정 대상: iOS / Android 실기기 peak_rss_mb / 콜드 스타트 시간 / WebView 렌더링 / mediapipe 모델 로드.
- 결과 적재: `.planning/sprint/10/uat-results/`.

### task-3 — cmux 워커 worktree 분리 (Sprint 10 또는 별도 세션)
- `/start` skill 자체를 수정하는 메타 작업. 자기 자신을 수정하면서 cmux 워커 띄우면 위험.
- 별도 세션에서 진행 권장. Sprint 9 에서 cmux 공유 working tree race 흔적이 또 한 번 발견됨 (impl 워커가 "scripts/ 누락 → git checkout HEAD -- scripts/ 복구" 보고). 우선순위 올림 검토.

### shellcheck CI 본 적용 (자동 후속)
- 다음 푸시부터 GitHub Actions `Shellcheck (scripts/*.sh)` 단계가 실제 CI 에서 실행됨. 첫 실패 시 `feedback_codex_review_sandbox_mode.md` 처방으로 fix.

## ADR 와 별도 자산 (영구 보존)
- `.planning/sprint/9/dispatch.json` — 디스패치 매니페스트
- `.planning/sprint/9/reviews/task-2.md` (R1 reject stale + R2 pass)
- 머지 commit: `28a4bac` (--no-ff, parents: `6d6784f` + `b0f16f1`)
- push: origin/main 동기화 완료
