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
- post-merge: `npm run lint`, `npm test` (vitest), `npx playwright test --project=chromium` 모두 통과.
- main 워크트리 (`/Users/leokim/Desktop/leo.kim/InSeoul`) stash 비우고 `git fsck --unreachable` dangling 0.

## 결과 (post-integration)

- `s2-task-1-impl` HEAD = 4 머지 커밋 + 본 ADR 커밋 (총 5 커밋, base `ab3d3e0` 위).
- origin push 후 main PR 진행.
