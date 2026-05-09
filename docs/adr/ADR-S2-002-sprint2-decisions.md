# ADR-S2-002 — Sprint 2 결정 (통합 회귀 smoke + GitHub Actions CI + cmux send 우회)

## 배경
Sprint 2 의 후속 안정화 범위에서 task-2 / task-3 / 운영 인프라 결정이 확정됐다.

## 결정

### 1) 통합 회귀 smoke 패턴 (task-2)
- 위치: `src/ai/__tests__/sprint1-integration.test.ts`
- 패턴: 단일 `it` 안에서 4 가드 (Ollama remote boundary, RAG chunk validation, MediaPipe URL allowlist, prompt 8K cap + KRW quantization) 를 *공존 시나리오* 로 검증.
- 의도: 각 가드의 단위 테스트는 Sprint 1 에서 이미 통과 (127 unit). 통합 smoke 는 *동일 시나리오에서 모두 active 임* 만 빠르게 확인. 중복 단위 검증 금지.
- 외부 호출 정책: `vi.mock` / `vi.stubGlobal` 만 사용. 실제 fetch / network 0건.

### 2) GitHub Actions CI (task-3)
- 위치: `.github/workflows/ci.yml`
- triggers: 모든 push + main 대상 PR
- runner: ubuntu-latest, node 22, npm cache
- steps: `npm ci` → playwright chromium install → lint baseline (non-blocking, `set +e; tee lint.log; exit 0`) → vitest → playwright chromium → playwright-report artifact (failure 시)
- timeout-minutes: 20, concurrency cancel-in-progress (ref-keyed)
- WebKit 은 본 CI 범위 외 (Sprint 1 ADR baseline 수용).

### 3) cmux send Error 400 우회 (운영 패턴)
- 사고: Sprint 2 Wave 2 부트스트랩 시 큰 prompt 본문(>3KB 추정)을 `cmux send` 로 한 번에 보내자 Error 400 / timeout.
- 해결: prompt 본문을 `/tmp/inseoul-s2-task-N-{impl,review}-prompt.md` 파일로 저장하고, `cmux send` 에는 짧은 안내 (~200자, "cat <경로> 로 읽고 시작") 만 보낸다.
- 적용: Sprint 2 task-2/3/4 모두 이 패턴으로 부트스트랩 — 0 errors.
- 다음 스프린트의 `/start` 또는 wave 부트스트랩 표준으로 채택.

## 트레이드오프
- 통합 smoke 는 단위 커버리지를 *대체* 하지 않는다. 새 가드 추가 시 단위 + 통합 모두 갱신 필요.
- CI 의 lint non-blocking 은 의도적. 다음 스프린트가 lint clean-up 을 끝내면 baseline 해제 + blocking 으로 전환 가능.
- prompt 파일 외부화는 cmux 의 stdin 한계가 풀리면 다시 inline 으로 회귀 가능.
