---
task: 3
title: setState-in-effect 4e + 1w 해결
status: pass
rounds: 1
last_updated: 2026-05-09T23:15:36+09:00
verdict_history:
  - round: 1
    verdict: pass
    sha: 44c6ebc
---

# Round 1
## Verdict: PASS
## 변경 요약
- `44c6ebc`는 `src/App.tsx`, `src/screens/sheets/AiSheet.tsx`, `src/screens/details/ActionGuide.tsx`의 setState-in-effect 및 refs lint 지적을 제거한 구현 commit입니다.
- `main..s5-task-3-impl` 변경 파일은 대상 3개와 task-3 검증 산출물 5개뿐입니다. `Icons.tsx`, `ScenarioEdit.tsx`, `GoldenSpark.tsx`, `useAdvisor.ts` 변경은 없습니다.
- target lint 산출물은 `exit=0`으로 3개 파일 0 errors, 0 warnings입니다. full lint는 `11 errors, 1 warning`으로 baseline `15 errors, 2 warnings`에서 task-3 범위 `4 errors, 1 warning`이 제거된 상태입니다.

## 동작 회귀 검증
- `AiSheet.tsx` 시나리오 A: `AiSheet`가 `open=false`이면 `null`을 반환하고, `open=false -> true` 전환 시 `AiSheetBody`가 새로 mount됩니다. `msgs` lazy initializer가 `{ role: 'context' }`와 greeting AI 메시지를 생성하고 `input`은 `prefill || ''`로 초기화하므로 기존 open 시 reset 의미가 보존됩니다. 열린 상태에서 `prefill`이 바뀌면 `key={prefill || '__no_prefill__'}`로 body를 remount하여 기존 `[open, prefill]` reset 경로도 보존됩니다.
- `AiSheet.tsx` 시나리오 B: close 시 parent가 `AiSheetBody`를 unmount하고 cleanup에서 `askInFlightRef.current?.abort()`와 ref null 정리를 수행합니다. abort된 요청은 `finally`에서 `setStreaming(false)`를 생략하지만 컴포넌트가 unmount되므로 streaming UI/state는 사라집니다. 기존 close cleanup의 abort 의도는 유지됩니다.
- `App.tsx`: `useMediaQuery`의 `useState + useEffect + matchMedia change listener`를 `useSyncExternalStore`로 치환했습니다. subscribe/getSnapshot 모두 `query` 기준이며 viewport change 구독 의미와 SSR fallback false 의미가 보존됩니다.
- `ActionGuide.tsx`: `cfg.current` 변경 시 `prevCurrent`와 비교해 render 단계에서 같은 컴포넌트 state(`prevCurrent`, `val`)를 갱신하는 React 권장 패턴입니다. ref 접근 회피용 우회가 아니라 외부 data 변경에 따른 슬라이더 기준값 동기화 의미를 유지합니다.

## 6 차원 평가
- correctness: PASS. task 대상 3개 파일 lint가 0 errors, 0 warnings이며 full lint가 11 errors, 1 warning으로 기대치와 일치합니다.
- regression: PASS. AiSheet open 초기화와 close abort/streaming 종료 의미를 diff 정독으로 확인했습니다. Vitest 14 files / 128 tests passed, Playwright chromium 10 passed, build 성공입니다.
- privacy (Local-First): PASS. 외부 송신 경로 추가는 없습니다. 기존 Playwright privacy smoke도 통과했습니다.
- on-device LLM 가드: PASS. AiSheet의 in-flight abort 경로가 unmount cleanup으로 유지되어 LLM 스트림 중단 불변식을 해치지 않습니다.
- readability: PASS. `useSyncExternalStore`, lazy initializer/remount, render-time previous value 비교 모두 lint 회피만을 위한 불명확한 코드가 아니라 React 패턴으로 읽힙니다.
- test coverage: PASS with recommendation. 회귀 산출물은 통과했고 AI 시트 E2E는 기본 open/send 경로를 포함합니다. 다만 close 중 in-flight abort 및 prefill 변경 remount는 명시 테스트가 없으므로 후속 보강을 권고합니다.
