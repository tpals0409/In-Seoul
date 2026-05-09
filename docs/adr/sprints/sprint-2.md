# Sprint 2 — Sprint 1 머지 + 후속 안정화

## 기간
2026-05-09 ~ 2026-05-09

## start_commit → end_commit
`322496d` → `7d0c981` (task-4 head; origin/s2-task-4-impl)

## 목표
Sprint 1 의 4 task 브랜치를 통합 브랜치(`s2-task-1-impl`)로 묶어 신규 GitHub origin (`tpals0409/In-Seoul`) 에 publish. 통합 회귀 smoke + GitHub Actions CI 도입으로 후속 스프린트의 안정성 기반을 마련하고, ADR + MEMORY 갱신으로 결정 추적을 매듭.

## 작업 결과

| Task | 제목 | verdict | rounds | commit | 브랜치 |
|---|---|---|---|---|---|
| 1 | Sprint 1 4 브랜치 main 통합 + 잔재 정리 + origin push | pass | 2 | `992ed8e` | s2-task-1-impl |
| 2 | 통합 회귀 smoke (Vitest 통합 테스트) | pass | 1 | `427dd17` | s2-task-2-impl |
| 3 | GitHub Actions CI 도입 | pass | 1 | `07b7b15` | s2-task-3-impl |
| 4 | ADR + MEMORY 갱신 (Sprint 1 머지 결과 + Sprint 2 결정 반영) | pass | 1 | `7d0c981` | s2-task-4-impl |

## 검증 요약 (Codex Review)
- 총 task: 4
- 1라운드 통과율: 3/4 (75%)
- 평균 라운드: 1.25
- escalation: 0건
- review 파일 인덱스:
  - `.planning/sprint/2/reviews/task-1.md`
  - `.planning/sprint/2/reviews/task-2.md`
  - `.planning/sprint/2/reviews/task-3.md`
  - `.planning/sprint/2/reviews/task-4.md`
- 통과 게이트:
  - lint baseline: ADR-S2-001 의 baseline (15 errors / 2 warnings, Sprint 1 외 pre-existing) 수용. *스코프 파일 단독* lint clean 기준.
  - Vitest: 14 files / 128 tests pass (127 base + 1 신규 통합 smoke)
  - Playwright Chromium: 10/10 pass

## 신규 결정 / 패턴 / 교훈

### 결정 (ADR 본문 참고)
- **lint baseline 수용** (ADR-S2-001 후속): 전체 lint 의 pre-existing 이슈를 baseline 으로 고정. 다음 스프린트의 lint 게이트는 *스코프 파일 단독* 기준 (`npx eslint <files>`).
- **main 통합 시점 위임**: `s2-task-1-impl` 의 origin push 까지 task-1 의 책임. main fast-forward 는 사용자 결정으로 위임 (PR 검토 또는 직접 ff). 사유: push 자체가 외부 부수효과.
- **통합 회귀 smoke 패턴** (ADR-S2-002): 단일 `it` 안에서 4 가드(Ollama remote boundary, RAG chunk validation, MediaPipe URL allowlist, prompt 8K cap + KRW quantization) 공존 검증. 단위 테스트와 중복 금지 — *공존* 만 본다.
- **GitHub Actions CI** (ADR-S2-002): ubuntu-latest, node 22, lint non-blocking (set +e + tee + exit 0), vitest, chromium e2e, playwright-report artifact, ref-keyed concurrency cancel. WebKit 은 본 CI 범위 외.
- **cmux send Error 400 우회** (ADR-S2-002): 큰 prompt 본문은 `/tmp/inseoul-s2-task-N-{impl,review}-prompt.md` 파일로 저장하고 워커에는 짧은 안내(~200자)만 send. Sprint 2 Wave 2/3 부트스트랩의 표준 패턴으로 채택.

### 패턴
- **Wave 기반 부트스트랩**: 의존이 있는 task 는 base 브랜치 변경을 기다린 뒤 다음 wave 에서 *동시* 부트스트랩. Sprint 2 의 Wave 1(task-1) → Wave 2(task-2/3 동시) → Wave 3(task-4) 흐름이 worktree 분리 + race-free 진행을 보장.
- **review-first-then-track**: 진행 중 스프린트의 review 파일 자체가 task scope 의 일부가 되는 경우 (Sprint 2 task-1 R2), R1 review 본문은 task scope 에서 추적하고 R2 본문은 의도적으로 추적 보류 → 다음 task 또는 /end 에서 일괄 추적. 무한 self-reference 회피.
- **prompt 파일 외부화**: cmux send 의 stdin 한도 우회 + 큰 작업 지시의 가독성 보존. `.cmux-prompts/` 또는 `/tmp/` 모두 가능. 본 스프린트는 `/tmp/` 사용.

### 교훈
- **review 가 6 차원 평가에서 *내가 명시한* 차원도 놓칠 수 있다**: Sprint 2 task-1 R1 에서 review 가 readability 차원 ("ADR 추적 커밋이 docs/adr + .planning/sprint/1 모두 포함") 을 검증했지만 실제로는 ADR-S2-001 만 보고 pass 발급. 오케스트레이터가 직접 `git ls-files` 로 검증한 뒤 R2 보강 라운드 트리거. → review 프롬프트에 *직접 grep / ls-files 명령*을 명시해 회피.
- **prompt 파일 외부화는 부산효과로 진단성 향상**: prompt 가 파일에 있으면 디버깅, 라운드 재진행 시 워커 재인지가 쉬움. 인라인 send 는 cmux read-screen 에서 잘림.
- **lint clean-up 누적 비용**: Sprint 1 단계에서 baseline 을 수립하지 않아 통합 후 전체 lint fail 직면. 신규 프로젝트 초기에 `npm run lint` 의 *그린 시작점* 을 만드는 것이 최저비용.

## 이월 항목
- **main 통합** (모든 4 task 브랜치 → main): 사용자 결정 보류. fast-forward 또는 PR 머지 후 origin/main 갱신 필요.
- **전체 lint clean-up**: ADR-S2-001 baseline (15 errors / 2 warnings) 해소. 별도 스프린트 또는 후속 task 후보.
- **Sprint 2 task-1 R2 review 본문** (`task-1.md` Round 2 섹션): review 워커가 의도적으로 추적 보류. main 통합 시 자동 동기화 또는 차기 스프린트의 정리 작업으로 흡수.

## 부산물 (정리 완료)
- 모든 워커 워크스페이스 close (8 ws): workspace:11, 12, 13, 14, 15, 16, 17, 18.
- 8 prompt 파일 (`/tmp/inseoul-s2-task-{1..4}-{impl,review}-prompt.md`) 은 일회용 — `/tmp` 자동 정리에 위임.
- `.planning/sprint/2/dispatch.json` 영구 보존 (post-mortem 용).
- worktree 5개 (`InSeoul-s2-task-{1..4}` + `/private/tmp/inseoul-task2-review`) 는 main 통합 결정 시점에 사용자 판단으로 정리 (`git worktree remove ../InSeoul-s2-task-N`).
