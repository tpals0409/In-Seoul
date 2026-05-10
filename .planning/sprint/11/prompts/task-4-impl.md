# Task-4 impl 워커 (Claude) — main thread mediapipe fallback 분기

## 정체
당신은 InSeoul Sprint 11 task-4 구현 워커입니다. **Wave 2** (task-1/2/3 의존 — 모두 main 머지 완료, R1 pass).

## 첫 단계 (필수, 한 번만)
```bash
cd /Users/leokim/Desktop/leo.kim/InSeoul
git worktree add ../inseoul-worktrees/task-4-impl main -b task-4-impl
cd ../inseoul-worktrees/task-4-impl
git status   # clean
git log --oneline -10   # 최신 main = 09db997 (task-1/2/3 머지 흡수)
```

## 작업
**main thread mediapipe fallback 분기 (off-by-default)** — 핸드오프 fix 후보 B. worker 우회 옵션 박아두되, 활성 시만 동작.

### 배경
- task-1 (wasm self-host) + task-2 (silent death traces) 가 main 머지 완료. wasm 호스팅과 worker 트레이스가 정상화되면 main thread fallback 은 불필요할 수도.
- 그러나 worker 자체가 죽는 케이스 (silent death after task-2 traces) 가 잔존하면 main thread 가 마지막 fallback.
- 현재 main 의 `src/ai/hooks/useLLM.ts` 는 worker 분기. 옵션 키 `VITE_LLM_RUN_MAIN_THREAD=1` 일 때 worker 우회.

### 구현 절차
1. **`src/ai/hooks/useLLM.ts`**:
   - `VITE_LLM_RUN_MAIN_THREAD === '1'` 체크 → main thread 분기 진입.
   - main thread 분기에서 mediapipe.ts 의 init / generate 직접 호출 (worker 우회).
   - 기본값 (env 미지정 또는 '0') 은 worker path 그대로.
2. **`src/ai/llm/mediapipe.ts`**:
   - 필요 시 main thread 호출용 export (이미 export 돼있다면 변경 불필요).
   - main thread 분기 활성 시 UI freeze 위험 코드 주석 1줄.
3. **`src/ai/AdvisorContext.tsx`**:
   - 변경 최소화. useLLM 가 분기를 흡수하면 AdvisorContext 변경 0건이 이상적.
   - 변경 시: 옵션 키 import 후 useLLM 으로 전달 또는 useLLM 내부 처리.
4. **`.env.local.example`** 신규 또는 갱신:
   ```
   # Main thread mediapipe fallback (worker 우회). UI freeze 위험. 디폴트 off.
   # VITE_LLM_RUN_MAIN_THREAD=1
   ```
5. **단위 테스트** `src/ai/__tests__/useLLM.main-thread-fallback.test.ts` 신규:
   - VITE_LLM_RUN_MAIN_THREAD='1' 시 worker constructor 미호출 검증
   - VITE_LLM_RUN_MAIN_THREAD 미지정 시 기존 worker path 회귀 검증

### 수용 기준
- [ ] VITE_LLM_RUN_MAIN_THREAD=1 → main thread mediapipe 직접 호출
- [ ] 기본값 off → worker path 회귀 0건
- [ ] `.env.local.example` 옵션 키 + 주석
- [ ] Vitest 단위 테스트 1건 (분기 검증)
- [ ] `npm run lint` pass
- [ ] `npm test` pass
- [ ] commit (브랜치: `task-4-impl`), 메시지 `feat(sprint-11/task-4): main-thread mediapipe fallback (off-by-default, VITE_LLM_RUN_MAIN_THREAD)`

### 완료 시그널
```
[IMPL_DONE] task-4 commit=<short_sha> ready_for_review
```
+ `cmux display-message -p "[IMPL_DONE] task-4"` 시도.

## 중요
- 다른 task 의 변경 (wasm self-host, silent death traces, static review) 회귀 0건.
- review 파일 (`.planning/sprint/11/reviews/task-4.md`) 은 read-only.
- review reject 시 같은 페인에서 라운드 진행.
