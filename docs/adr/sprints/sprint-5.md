# Sprint 5 — Sprint 2 이월 통합 + lint clean-up (ADR-S2-001 baseline 0 달성)

**상태**: 완료 (2026-05-09 단일 세션)
**기간**: 2026-05-09 (단일 세션, 약 30분)
**start_commit → end_commit**: `72abe2a` → (이 커밋 직전 = `7ebf6eb`, 이 commit 포함 시 본 sprint summary 자체 commit)
**선행**: Sprint 4 Phase A 완료 (s4-task-1/2/3-impl 브랜치 origin push, main 통합 보류)

## 목표 vs 결과

| 목표 | 결과 |
|---|---|
| Sprint 1~3 + Sprint 4 Phase A 코드의 main 통합 | ✅ task-1 (`d4136a8` merge → main fast-forward → origin push) |
| ADR-S2-001 baseline lint 15e/2w → 0 정리 | ✅ task-2/3/4 누적 (15→7→3→0) |
| 회귀 0 (vitest 128, playwright 10, build OK) | ✅ 모든 단계에서 baseline 부합 |
| 워커 디스패치 패턴 (Sprint 4 codex 자율 chain) 재사용 | ✅ 4 task / 4 워커 페어, 평균 1.0 라운드 (R2 1건) |
| 구식 task 브랜치 정리 (로컬 + origin) | ✅ task-1..4-impl, s4-task-1..3-impl, s5-task-1..4-impl 전체 삭제 |

## 작업 결과

### task-1 — Sprint 1~3 + Sprint 4 Phase A main 통합
- **commit**: `d4136a8` (s5-task-1-impl 머지 commit, parents: main 72abe2a + s4-task-3-impl e616b59) → main fast-forward → main HEAD `299b962`
- **변경**: 81 files, +3441/-40. Capacitor iOS/Android scaffolding + mobile-launch/trace/mem 스크립트 + src/App.tsx safe-area 8 lines.
- **검증**: lint 15e/2w (baseline 동일, 회귀 0), vitest 14 files / 128 passed, playwright chromium 10/10, build SUCCESS, npm install 411 packages.
- **충돌**: 0건. ort merge clean.
- **Round**: 1.0
- **review**: `.planning/sprint/5/reviews/task-1.md`

### task-2 — Icons.tsx fast-refresh 8e 해결
- **commit**: `d0f40e2` → main merge `367ac7e` → push `92da614`
- **변경**: `src/components/IconsImpl.tsx` 신규 (개별 아이콘 named export 분리), `src/components/Icons.tsx` 호환 namespace 객체 export 만 보유.
- **검증**: 대상 파일 0e/0w, full lint 7e/2w (baseline -8e), vitest 128, playwright 10, build OK. 호출 사이트 (`Icons.Back` 등) unchanged.
- **Round**: 1.0
- **review**: `.planning/sprint/5/reviews/task-2.md`

### task-3 — setState-in-effect 4e + 1w 해결
- **commit**: `44c6ebc` → main merge `5ad…` → push `5cfdecd`
- **변경**:
  - `src/App.tsx`: `useMediaQuery` (useState + useEffect + matchMedia change listener) → `useSyncExternalStore` (subscribe + getSnapshot, SSR fallback false)
  - `src/screens/sheets/AiSheet.tsx`: 본체 분리 + lazy initializer (`useState(() => initial)`) + `key={prefill || '__no_prefill__'}` remount + parent unmount cleanup (abort + ref null)
  - `src/screens/details/ActionGuide.tsx`: render 단계 prevCurrent 비교 패턴 (React 권장)
- **검증**: 3 파일 0e/0w, full lint 11e/1w (baseline -4e/-1w), vitest 128, playwright 10, build OK.
- **동작 회귀**: AiSheet open → context 메시지 초기화 동작, close → in-flight abort 동작 모두 보존 확인 (Codex review).
- **Round**: 1.0
- **review**: `.planning/sprint/5/reviews/task-3.md`

### task-4 — refs/impure/unused-disable 3e + 1w 해결
- **commit**: `b52c9bd` → main merge → push `7ebf6eb`
- **변경**:
  - `src/screens/ScenarioEdit.tsx` (124, 216): `useRef<Draft>` → lazy `useState<Draft>(() => ...)` (mount 시점 스냅샷 의미 보존)
  - `src/components/GoldenSpark.tsx:72`: render 중 `performance.now()` 호출 제거 → RAF callback 첫 `now` 를 animation start
  - `src/ai/hooks/useAdvisor.ts:152`: unused `@typescript-eslint/no-unnecessary-condition` disable 주석 제거
- **검증**: 3 파일 0e/0w, full lint 12e/1w (s5-task-4-impl 단독 기준, baseline -3e/-1w. main 누적 머지 후 0e/0w 달성), vitest 128, playwright 10, build OK.
- **Round**: 2.0 — R1 false reject (moving main base 비교 오류, ADR-S5-001 참조), 오케스트레이터 정정 후 R2 PASS.
- **review**: `.planning/sprint/5/reviews/task-4.md`

## 통합 회귀 (오케스트레이터 직접)

3 task 모두 main 머지 후 (HEAD `7ebf6eb` 직전):
- `npm install` (Capacitor + 의존성 sync)
- `npm run lint` → **0 errors, 0 warnings** ✅
- `npm test` → 14 files / 128 tests passed
- `npx playwright test --project=chromium` → 10 passed
- `npm run build` → tsc + vite SUCCESS

ADR-S2-001 baseline 15e/2w 가 정확히 0 으로 정리됨.

## 운영 인사이트

### 1. moving main 비교 base 의 false reject (ADR-S5-001 채택 동기)
task-4 R1 reject 가 review 의 `git diff main..task` 사용에서 비롯. 병렬 워커가 main 에 순차 머지될 때 main 은 moving target. 해결: review 는 fork point sha 기준 비교, 통합 회귀는 오케스트레이터가 머지 후 별도 실행. 다음 스프린트 부터 dispatch.json + review prompt 템플릿 박제.

### 2. cmux display-message 의 review 워커 도달 보장 부재
task-4 review 가 impl 의 `[IMPL_DONE]` display-message 를 자동 감지 못 하고 idle 유지. 오케스트레이터가 명시적 cmux send nudge 송신해서 진행. **권장**: review 프롬프트에 "주기적 `cmux read-screen` 폴링" 명시 또는 오케스트레이터가 IMPL_DONE monitor 이벤트 수신 시 review 워커에 nudge 자동 송신.

### 3. fast-refresh 분리 패턴 (Icons.tsx)
컴포넌트 + namespace 객체를 한 파일에서 export 하면 fast-refresh 룰 위반. 해결 패턴: namespace 파일 (얇은 호환 레이어) + 실제 컴포넌트 파일 (named export) 분리. 호출 사이트 (`Icons.Back`) 변경 0 으로 마이그레이션 비용 ~0.

### 4. setState-in-effect 룰 회피 패턴 (sample)
- 초기값: `useState(() => fn())` lazy initializer
- prop 변화 동기화: `key` prop 으로 컴포넌트 reset (remount)
- 외부 시스템 sync: `useSyncExternalStore` (browser API subscription)
- cleanup: parent unmount cleanup 으로 in-flight 작업 abort

룰 회피만 위해 동작 깨면 reject. 의미 보존 검증이 review 핵심.

## 누적 검증 요약

| 단계 | lint | vitest | playwright | build |
|---|---|---|---|---|
| start (72abe2a) | (no install) | n/a | n/a | n/a |
| task-1 머지 후 | 15e/2w | 128 | 10 | OK |
| task-2 머지 후 | 7e/2w | 128 | 10 | OK |
| task-3 머지 후 | 3e/1w | 128 | 10 | OK |
| task-4 머지 후 (= sprint end) | **0e/0w** | 128 | 10 | OK |

## 머지된 PR / 커밋

본 sprint 의 main commit (origin push 완료):
- `d4136a8` merge: s4-task-3-impl into s5-task-1-impl — Sprint 1~3 + Sprint 4 Phase A integration
- `299b962` docs(sprint-5): task-1 review pass + dispatch manifest + main 통합 fast-forward
- `367ac7e` merge: s5-task-2 — Icons.tsx fast-refresh 8e 해결
- `92da614` docs(sprint-5): task-2 review pass — Icons fast-refresh 8e 해결
- `05510fe` merge: s5-task-3 — setState-in-effect 4e + 1w 해결
- `5cfdecd` docs(sprint-5): task-3 review pass — setState-in-effect 4e + 1w 해결
- `60741f4` merge: s5-task-4 — refs/impure/unused-disable 3e + 1w 해결
- `7ebf6eb` docs(sprint-5): task-4 review pass — refs/impure/unused-disable 3e + 1w 해결

브랜치 정리: `s5-task-1..4-impl` 로컬 + origin 모두 삭제. (Sprint 4 의 s4-task-* 브랜치도 task-1 통합 시점에 정리 완료.)

## 이월

이번 sprint 에서 명시적 이월 0건. 단, 다음 사항은 다음 sprint 시작 전 반드시 적용:

1. **ADR-S5-001 운용**: dispatch.json `fork_point` 필드 + review prompt diff 명령 fork-point 사용 (1차 적용 대상은 다음 sprint 첫 task 부터)
2. **review 워커 nudge 자동화**: monitor 가 `[IMPL_DONE]` 이벤트 (display-message 또는 review-file mtime) 감지 시 자동 cmux send 권장
3. **Sprint 4 Phase B UAT** 잔류: iPhone/Android 실기기 + 시뮬레이터/에뮬레이터 실측, mediapipe 모델 다운로드 정책, App/Play Store 메타데이터

## ADR

- 본 sprint 의 결정: [docs/adr/ADR-S5-001-review-diff-base.md](../ADR-S5-001-review-diff-base.md)
- 관련 ADR: ADR-S2-001 (lint baseline + 워커 분담), ADR-S3-001 (Capacitor), ADR-S4-001 (모바일 검증 파이프라인)
