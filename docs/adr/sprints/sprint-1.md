# Sprint 1 — AI 시트 안정화 (LLM/RAG 가드 강화)

## 기간
2026-05-08 ~ 2026-05-08

## start_commit → end_commit
`ab3d3e0` → `fcd06da` (task-1-impl HEAD; main 머지는 본 ADR 발행 시점에 미완)

## 목표
사용자 재무 데이터의 외부 유출 가능성을 차단하고 AI 어드바이저 경로(LLM 백엔드 + RAG 인덱스 + 프롬프트 빌드 + 폴백)를 신뢰성 있는 상태로 끌어올린다. Local-First 원칙 위반 여지를 코드/테스트 양쪽에서 제거한다.

## 작업 결과

| Task | 제목 | verdict | rounds | commit | 브랜치 |
|---|---|---|---|---|---|
| 1 | Ollama 호스트 화이트리스트 가드를 실제 호출 차단으로 승격 | pass | 2 | `fcd06da` | task-1-impl |
| 2 | RAG 인덱스 깊은 검증 + 손상 청크 폴백 | pass | 1 | `fb281f5`→`fb140a4` | task-2-impl |
| 3 | MediaPipe 모델 URL 출처 + 응답 메타 가드 | pass | 1 | `ceff62d` | task-3-impl |
| 4 | 프롬프트 입력 sanitize + 길이 cap | pass | 2 | `bf281f5`→`322496d` | task-4-impl |

## 검증 요약 (Codex Review)
- 총 task: 4
- 1라운드 통과율: 2/4 (50%)
- 평균 라운드: 1.5
- escalation: 0건
- review 파일 인덱스:
  - `.planning/sprint/1/reviews/task-1.md`
  - `.planning/sprint/1/reviews/task-2.md`
  - `.planning/sprint/1/reviews/task-3.md`
  - `.planning/sprint/1/reviews/task-4.md`
- 통과 조건: scope ESLint clean + Vitest 단위 통과 + Playwright Chromium 10/10 통과 (WebKit 은 로컬 실행파일 미설치로 건너뜀, 환경 이슈로 verdict 영향 없음)

## 신규 결정 / 패턴 / 교훈

### 결정
- **호스트 화이트리스트는 호출 boundary 에서 차단** — `isLocalLlmHost` / `isOnDeviceLlm` 같은 가드 헬퍼는 export 만 해서는 안 되고, `ensureReady` / `generate` 같은 외부 통신 진입점에서 *실제 호출을 throw 로 막아야* 의미가 있다. (task-1 round 1 reject 가 이를 강제)
- **명시 동의 escape hatch**: 비-로컬 LLM 사용을 막되, 운영자가 환경변수(`VITE_ALLOW_REMOTE_LLM=1`)로 동의했을 때만 통과 + UI 가 인지할 수 있도록 `LLMState.remote: true` 플래그 노출.
- **사용자 재무 PII 양자화 정책** — 만원 단위 raw 값을 프롬프트에 직접 넣지 않고 1억 단위(자산/저축/목표가) 또는 50만 단위(월 저축/상환액) 라벨로 양자화. 폴백 템플릿도 동일 정책.
- **프롬프트 길이 제어**: hard cap 8000자 + 우선순위 절단 (mandatory system/ctx/question > RAG chunks > recentChat). 단일 chunk 가 잔여 예산 초과 시 *truncate* (drop 금지).

### 패턴
- 외부 입력(인덱스/모델/URL)에 대한 검증은 top-level 필드만으로 부족하며 chunk/byte 레벨까지 깊게 가야 한다 (task-2 KnowledgeIndex chunk 검증, task-3 MediaPipe content-length 가드).
- 단일 손상 항목으로 인덱스 전체를 폐기하지 말고 *해당 항목만 스킵 + 콘솔 경고 1회* (task-2 손상 chunk 폴백 패턴).

### 교훈
- **단일 working tree 에 4 impl Claude 워커를 동시 부트스트랩하면 git index race 발생** — task-1 의 커밋 `c1bf635` 가 task-1-impl 가 아닌 task-4-impl 위에 올라가는 사고로 task-1 round 1 review 가 무고하게 reject 됐고, 사용자 재무 데이터 경로와 무관한 정리 라운드에 1회 분량의 시간을 소진했다.
- 다음 스프린트부터 워커마다 `git worktree add` 로 worktree 분리 필수 (memory: `feedback_cmux_worktree.md`).
- `.planning/sprint/N/` 가 untracked 상태이면 race 회복 stash 에 흡수돼 review 파일이 사라진다 → main 추적 또는 worktree 외부 백업 필요.

## 이월 항목
없음. (4/4 pass, escalation 0)

## 부산물 정리 결과 (Sprint 2 task-1 에서 처리)
- stash 3개 (`task1-race-recovery`, `task1-temp`, `isolate-other-tasks-during-task4-verify`) — 모두 drop 완료 (Sprint 2 task-1 R2 에서 검증).
- 4 task 브랜치 main 통합 진행 상황: Sprint 2 의 `s2-task-1-impl` 브랜치 (HEAD `992ed8e`) 에 `--no-ff` 4회 머지 누적:
  - `bbb0ebb merge(s2): integrate task-1-impl` ← 원본 fcd06da
  - `5678d72 merge(s2): integrate task-2-impl` ← 원본 fb140a4
  - `2e52ef7 merge(s2): integrate task-3-impl` ← 원본 ceff62d
  - `c2f18ef merge(s2): integrate task-4-impl` ← 원본 322496d
- main 자체로의 fast-forward 머지는 **사용자 결정 보류** — origin/s2-task-1-impl 에 push 됨, main 추가 작업은 별도 단계.
