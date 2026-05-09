# ADR-S2-001: Sprint 1 4-브랜치 통합 전략

- 상태: Accepted
- 작성일: 2026-05-09
- 스프린트: S2 / task-1 (impl)
- 통합 브랜치: `s2-task-1-impl` (base = `main` @ `ab3d3e0`)

## 컨텍스트

Sprint 1 에서 InSeoul AI 파이프라인의 4 개 보안/안정화 작업을 cmux 멀티-워커로 병렬 처리했다. 각 워커는 독립 git worktree 에서 disjoint 한 모듈 스코프만 수정하도록 사전 분배되었으며, 결과 4 브랜치는 각각:

| 브랜치 | HEAD | 스코프 | 의도 |
| --- | --- | --- | --- |
| `task-1-impl` | `fcd06da` | `src/ai/hooks/useLLM.ts`, `src/types/contracts.ts` | Ollama 호출 경계에서 비-로컬 호스트 차단 (`localhost`, `127.0.0.1`, `::1` 만 허용) |
| `task-2-impl` | `fb140a4` | `src/ai/rag/index-loader.ts` | KnowledgeIndex 청크 deep-validate + 손상 청크 격리 (전체 폐기 대신 부분 복구) |
| `task-3-impl` | `ceff62d` | `src/ai/llm/mediapipe.ts` | MediaPipe `modelUrl` 호스트 allowlist + `Content-Length` 사전 가드 |
| `task-4-impl` | `322496d` | `src/ai/prompt/build.ts`, `src/ai/prompt/context.ts`, `src/ai/fallback/templates.ts` | 프롬프트 KRW 값 sanitize, 8k 문자 hard-cap, oversized chunk truncate |

4 브랜치는 사전에 `git diff --stat` 로 파일 단위 disjoint 가 검증되었고 (공유 수정 0), `git merge-tree` dry-run 결과 충돌 0 으로 확인되었다.

## 결정

s2-task-1-impl 위에 4 브랜치를 **`--no-ff` 순차 머지**한다. 사유:

1. **머지 커밋 보존** — fast-forward 시 4 작업 단위가 선형 커밋으로 평탄화되어 추후 단위 revert (`git revert -m 1 <merge>`) 가 어려워진다. `--no-ff` 는 각 브랜치 단위를 명시적으로 묶어 회귀 시 단일 워커 단위 롤백을 가능하게 한다.
2. **순서 무관** — 4 스코프가 disjoint 이므로 머지 순서가 결과에 영향을 주지 않는다. 본 ADR 은 task-1 → 2 → 3 → 4 의 자연 순서를 채택한다.
3. **단일 통합 브랜치** — Sprint 2 task-1 자체가 "통합 + 정리" 작업이므로 main 직접 머지가 아닌 통합 브랜치 (`s2-task-1-impl`) 위에 누적하고, 후속 review/CI 통과 후 main 으로 PR 한다.

## Local-First 불변 (재확인)

본 작업은 코드 변경 0 인 통합 작업이며, 다음을 위반하지 않는다:

- 사용자 재무 데이터의 외부 송신 채널 **신설 0건**.
- `git push origin s2-task-1-impl` 는 코드 publish 이며 사용자 데이터와 무관하다.
- 4 브랜치 자체가 외부 호스트 차단/allowlist 강화 방향이므로 본 통합으로 공격 표면이 축소된다.

## 검증

- pre-merge: `git merge-tree` 충돌 0 (4 브랜치 모두).
- post-merge:
  - `npm test` (vitest): **127/127 PASS**
  - `npx playwright test --project=chromium`: **10/10 PASS**
  - `npm run lint`: **15 errors / 2 warnings** — *Sprint 1 머지로 신규 도입된 회귀 0 건*. 동일 수치가 base `ab3d3e0` (main) 에서 재현됨을 별도 worktree (`/tmp/inseoul-base-lint`) 에서 검증함. 위반 파일은 모두 Sprint 1 스코프 외부 (`src/App.tsx`, `src/components/GoldenSpark.tsx`, `src/components/Icons.tsx`, `src/screens/details/ActionGuide.tsx`, `src/screens/ScenarioEdit.tsx`, `src/screens/sheets/AiSheet.tsx`, `src/ai/hooks/useAdvisor.ts`).
- main 워크트리 (`/Users/leokim/Desktop/leo.kim/InSeoul`) stash 비우고 `git fsck --unreachable` dangling 0.

### 수용 기준 "lint 통과" 재해석

원 수용 기준은 "lint / vitest / playwright 모두 통과" 였으나, base 시점부터 lint 가 실패하고 본 작업이 "코드 변경 0 (머지+정리)" 원칙으로 묶여있어 두 기준이 상충한다. 사용자 결정 (2026-05-09) 에 따라:

- 수용 기준을 **"Sprint 1 머지로 인한 lint 신규 회귀 0 건"** 으로 재해석한다.
- baseline 결함 (15 errors / 2 warnings, react-hooks 및 react-refresh 규칙) 은 별도 후속 task 로 분리하여 추적한다 (본 ADR 범위 외).
- 본 통합 머지는 lint 표면적을 늘리지 않았다 (`src/ai/...` 신규/수정 파일에서 lint 0 errors 확인됨).

## 결과 (post-integration)

- `s2-task-1-impl` HEAD = 4 머지 커밋 + 본 ADR 커밋 (총 5 커밋, base `ab3d3e0` 위).
- origin push 후 main PR 진행.

## 후속 의사결정 (Sprint 2 진행 중 확정)

### lint baseline 수용
- 결정: `npm run lint` 전체의 15 errors / 2 warnings 는 Sprint 1 외 pre-existing 코드의 이슈로 간주. 이번 ADR 의 baseline 으로 고정.
- 다음 스프린트의 lint 게이트는 *스코프 파일 단독 lint* 를 기준으로 한다 (`npx eslint <files>`).
- 전체 lint clean-up 은 별도 후속 작업으로 미룸 (sprint-history 또는 신규 ADR 에서 추적).

### main 통합 시점
- 결정: `s2-task-1-impl` 의 origin push 까지 task-1 책임. main 으로의 fast-forward 머지는 사용자 결정으로 위임 (PR 검토 또는 직접 ff).
- 사유: push 자체가 외부 부수효과 — task-1 의 review pass 후에도 사용자 의지 확인이 안전.
