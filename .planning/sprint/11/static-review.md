---
sprint: 11
task: task-3
kind: static-analysis
status: review-only
verdict: no-change-needed
created: 2026-05-10
---

# Sprint 11 task-3 — AdvisorContext / AiSheet ensureReady race window 정적 재점검

## TL;DR
**변경 불필요.** Sprint 10 시도 3-4 의 ref guard 패턴은 정확하다. React 18 StrictMode dev double-invoke, `[advisor]` deps re-trigger, sheet open/close cycle 등 모든 *알려진* race window 에서 가드가 의도대로 동작한다. 진짜 mount/unmount/remount 시 ref 는 새로 생성되지만, 이는 의도된 동작이며 `useLLM.ensureReady` 의 idempotency (`status==='ready'` early-return + `initPromiseRef.current` in-flight dedup) 가 본질적 race 방패다.

핸드오프 (sprint/10/llm-debug-handoff.md) 의 "ensureReady 3 회 호출" 은 race 가 아니라 sheet 의 정상 mount/unmount/remount 카운트며, 본질적 root cause 는 worker bootstrap 층 (mediapipe wasm/cdn) 이지 React lifecycle 층이 아니다.

## 분석 범위
- `src/ai/AdvisorContext.tsx`:30-40 (`eagerInitRef` + `useEffect([ensureReady])`)
- `src/screens/sheets/AiSheet.tsx`:228-238 (`ensureReadyOnceRef` + `useEffect([advisor])`)
- `src/screens/sheets/AiSheet.tsx`:194 (`<AiSheetBody key={prefill || '__no_prefill__'}/>`)
- `src/ai/hooks/useLLM.ts`:404-432 (`useMediapipeBackend.ensureReady` 의 idempotency 보호)
- `src/main.tsx`:18-20 (`<StrictMode>`)
- `src/App.tsx`:181-214 (두 분기 모두 root 가 `<AdvisorProvider>`)

## 함수별 race window 표

| # | 함수 / 위치 | 트리거 | ref 생존 범위 | StrictMode 안전? | 진짜 mount/unmount 시 | 결론 |
|---|---|---|---|---|---|---|
| 1 | `AdvisorProvider` `eagerInitRef` (`AdvisorContext.tsx:29-40`) | `useEffect([ensureReady])` | Provider fiber 1개 인스턴스 | ✅ 안전. 첫 invoke 가 `current=true` 세팅 → 두 번째 invoke 는 즉시 return. ref 는 dev double-invoke 사이에 보존됨 (React 가 fiber 를 destroy 하지 않음, 효과만 cleanup→re-run) | ref 새로 생성. eager init 다시 호출 — 단 새 worker 이므로 의도된 동작 | 변경 불필요 |
| 2 | `AdvisorProvider` `[ensureReady]` deps re-trigger | `useLLM` 의 `state.status` 전이 (idle→downloading→loading→ready→generating) 가 `useCallback([state.status])` identity 변경 → AdvisorProvider 의 `value` `useMemo` 도 재계산되며 `ensureReady` reference 변경 | 동일 Provider mount 내 | ✅ 안전. `eagerInitRef.current` 가 첫 invoke 후 true → 모든 후속 invoke 는 short-circuit | ref 새로 생성. eager init 한 번 호출 (의도) | 변경 불필요 |
| 3 | `AiSheetBody` `ensureReadyOnceRef` (`AiSheet.tsx:228-238`) | `useEffect([advisor])` | `<AiSheetBody>` fiber 1개 인스턴스. `<AiSheet>` 의 `key={prefill}` 가 prefill 변경 시 진짜 remount 강제 (React key-based reconciliation) | ✅ 안전. ref 는 StrictMode 의 effect double-invoke 사이 보존 | ⚠️ ref 새로 생성됨. 진짜 race 가능성 — 다음 행 참고 | useLLM idempotency 가 차단 (4행) → 변경 불필요 |
| 4 | `useMediapipeBackend.ensureReady` (`useLLM.ts:404-432`) idempotency 가드 | 어디서든 호출 | hook fiber 1개 인스턴스 (= AdvisorProvider mount 1개) | ✅ 안전 | ✅ 안전. 다중 진입 시 (a) `state.status==='ready'` → 즉시 return (b) `initPromiseRef.current` 존재 → 동일 promise 반환 → 모든 caller 가 같은 init 을 await. **3행의 fresh ref 가 풀려도 여기서 dedup** | 변경 불필요 — 이 층이 진짜 race 방패 |
| 5 | `useMediapipeBackend` worker effect (`useLLM.ts:271-402`) | `useEffect([enabled])` | hook 인스턴스 | ✅ 안전. `enabled` 는 `backend === 'mediapipe'` 평가 결과로 mount 동안 불변 → effect 한 번만 실행 | hook 자체가 새로 mount → 새 worker. 옛 worker terminate cleanup 정상 | 변경 불필요 |
| 6 | `AiSheet` `key={prefill || '__no_prefill__'}` (`AiSheet.tsx:194`) | `prefill` 변경 | n/a (key 는 reconciler 입력) | n/a | 의도된 동작 — `msgs/input` 재초기화를 위해 명시적으로 새 인스턴스 mount. ensureReady 재호출은 useLLM 4행이 dedup | 변경 불필요 |
| 7 | App 의 두 `<AdvisorProvider>` 분기 (`App.tsx:181-214`) | `useMediaQuery` breakpoint 플립 | n/a | n/a | 둘 다 root 가 `<AdvisorProvider>` → React reconciler 가 동일 type/위치로 보존 → AdvisorProvider 자체는 unmount 안 됨. 하위 `<AppShell>`/`<IOSDevice>` 만 위치 변동으로 remount → AiSheetBody 도 remount → 3행 → 4행 dedup | 변경 불필요 |

## React 18 StrictMode dev double-invoke 동작 정확성 검증

React 18 StrictMode 가 효과를 두 번 부르는 정확한 시퀀스:
1. component mount → render → effect 실행 (1차)
2. effect cleanup 호출 (의도적)
3. effect 다시 실행 (2차)
4. component 는 **언마운트되지 않음** — fiber, refs, state 모두 보존

`useRef` 가 반환하는 `MutableRefObject` 는 fiber 에 저장되며 1↔3 사이에 동일 객체. → `eagerInitRef.current = true` 가 1차에서 세팅되면 3차 시점에도 true → guard 작동 ✓.

이는 React 공식 문서가 권장하는 ref guard 패턴이며, 코드의 패턴은 정석에 부합한다.

## 진짜 mount → unmount → remount 시나리오 점검

| 컴포넌트 | 실제로 unmount/remount 되는가? | 트리거 | 영향 |
|---|---|---|---|
| `AdvisorProvider` | ❌ 사실상 발생 안 함 | App.tsx 두 분기 모두 root JSX 가 `<AdvisorProvider>` 이므로 reconciler 가 보존. 단 Vite HMR 동안에는 발생 가능 (개발 한정) | 발생 시 새 worker, 새 ref → 의도된 cold-start. race 아님 |
| `AiSheetBody` | ✅ 발생 가능 | (a) sheet open/close cycle (open=false → AiSheet 가 null 반환), (b) `prefill` 변경 시 `key` 변경, (c) 상위 fiber 재배치 (breakpoint 플립) | `ensureReadyOnceRef` 새로 생성. 그러나 `useLLM.ensureReady` 가 `status==='ready'` 또는 `initPromiseRef.current` 검사로 dedup → 새 init 발사 안 함. **이게 핸드오프 doc 의 "3회 호출" 의 정체다 — 3회 sheet mount, 매 mount 마다 한 번씩, useLLM 내부에서 idempotent 하게 처리됨** |

핸드오프 doc 의 다음 문장은 정확하다:
> "무한 루프는 200회 → 3회로 감소 (ref guard 부분 작동, mount/unmount 시 재발)"

여기서 "mount/unmount 시 재발" 은 race 가 아니라 정상 컴포넌트 lifecycle 의 결과다. 200→3 으로 감소했다는 것은 ref guard 가 의도대로 작동한 증거.

## "ref guard 우회" 가설 — 반증

핸드오프가 우려한 시나리오: "mount/unmount cycle 에서 ref guard 우회".

정적 분석 결과: **우회되지 않는다.** 두 가지 경우만 존재한다.

- **Case A: 같은 mount 내 다중 invoke** (StrictMode double-invoke, deps 재계산) — ref 보존 → guard 작동 ✓
- **Case B: 다른 mount 인스턴스** — ref 가 새로 생성되어 "guard reset" 됨. 그러나 이는 **의도적**이며, 새 mount 는 새 컴포넌트이므로 ensureReady 를 한 번 호출해야 함이 합당함. 다중 mount 가 같은 worker 를 공유하는 경우 (= Provider 보존되고 sheet 만 remount), `useLLM.ensureReady` 의 idempotency 가 실제 init 재발사를 차단함.

따라서 "ref guard 우회" 는 fictitious 한 race 다. 진짜 보호선은 `useLLM.ensureReady` 의 status/in-flight 검사 두 줄이며, 그 줄이 정확하다.

## ensureReady idempotency 의 정확성 (`useLLM.ts:404-409`)

```typescript
const ensureReady = useCallback(async (): Promise<void> => {
  if (state.status === 'ready') return                              // ① ready 면 noop
  if (state.status === 'unsupported') {
    throw new Error('WebGPU is not supported on this device')       // ② 영구 거부
  }
  if (initPromiseRef.current) return initPromiseRef.current         // ③ in-flight dedup
  // ...post init message...
}, [state.status])
```

세 가드의 합집합이 모든 race 를 커버:
- **다중 caller 가 동일 mount 내**: ③ 으로 dedup (같은 promise 반환, 모두 같은 init 결과 await)
- **다중 caller 가 다중 mount (sheet remount)**: 첫 call 이 ① 또는 ③ 에 들어갈 시점이면 dedup. ready 도달 후 호출되면 ① 으로 즉시 return
- **error/idle 상태에서 재시도**: 가드 통과 → 새 init 시도. 이는 의도된 retry 경로 (sheet 재오픈으로 모델 재시도)

## 잔존 위험 (race 외 — 참고용, 본 task 범위 아님)

다음은 race window 가 아니지만 정적 분석 중 발견한 별도 우려. **이번 task 범위가 아니므로 패치하지 않음**. 후속 task 에서 다룰 가치 있음.

1. **`useCallback` deps 의 `state.status` 가 stale 클로저 위험** (`useLLM.ts:432`): `[state.status]` 가 deps 이지만 idle→ready 전이 사이에 호출되면 stale 'idle' 으로 판단 가능. 단 `useCallback` 은 deps 변동마다 새 함수 binding 하므로 React 의 batched render 보장 하에 안전. **현 코드 안전** — 단지 패턴 자체에 미묘한 함정 있음. (task-2 의 useLLM 영역, 침범 금지.)
2. **eagerInit 실패 시 retry 부재** (`AdvisorContext.tsx:34-39`): `.catch(...)` 가 단순 로그만. Provider 한 lifetime 동안 한 번만 시도. 다만 sheet 재오픈으로 implicit retry 가능 → 사용자 액션 필요. UX 결정 사안.
3. **worker 재구성 시 pending request 처리** (`useLLM.ts:381-401`): cleanup 에서 모든 pending reject. 정확. 다만 user-facing 에러 메시지 "worker disposed" 가 노출될 수 있음 (advisor.ask 가 try/catch 로 감싸 폴백 처리 → 안전). UX 결정 사안.

## 결론
- ref guard 패턴은 정확하다.
- 진짜 race 방패는 `useLLM.ensureReady` 의 idempotency 가드 (`useLLM.ts:404-409`) 이며, 그 코드는 정확하다.
- Sprint 10 의 200→3 감소는 가드가 의도대로 작동한 증거이며, 남은 3 회는 race 가 아니라 sheet의 정상 mount cycle 의 결과다.
- 본질적 root cause 는 worker bootstrap 층 (mediapipe wasm 버전/CDN 미스매치) 으로, 핸드오프 doc 의 후보 A (wasm 자체 호스팅) 가 결정적 다음 step 일 가능성 높음. 본 task 범위 아님.

**액션: src 변경 없음.** 이 분석 보고서만 commit.
