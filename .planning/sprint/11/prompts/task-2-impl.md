# Task-2 impl 워커 (Claude) — silent death 진단 강화

## 정체
당신은 InSeoul Sprint 11 task-2 구현 워커입니다.

## 첫 단계 (필수, 한 번만)
```bash
cd /Users/leokim/Desktop/leo.kim/InSeoul
git worktree add ../inseoul-worktrees/task-2-impl sprint-10-llm-debug -b task-2-impl
cd ../inseoul-worktrees/task-2-impl
git status
```
이후 모든 Edit/Write/Bash 는 `../inseoul-worktrees/task-2-impl` 안에서 수행.

## 작업
**LLM worker 의 silent death 를 진단할 수 있게 main thread / Capacitor 까지 trace 가 forward 되도록 강화.** Sprint 10 핸드오프 fix 후보 E + worker.onerror 점검.

### 배경
- Sprint 10 시도 4 (eager init + worker 부트스트랩 trace) 후에도 worker bootstrap-start 가 도달 안 함. main thread `worker.onerror` 가 동작하는지, Capacitor console plugin 이 worker console 을 forward 하는지 미검증.
- 핸드오프 (`/Users/leokim/Desktop/leo.kim/InSeoul/.planning/sprint/10/llm-debug-handoff.md`) 의 fix 후보 E 그대로.

### 구현 절차
1. **`src/ai/hooks/useLLM.ts`**:
   - `worker.onerror = (e) => { console.error('[INSEOUL_LLM] worker.onerror', { message, filename, lineno }); ... }` 강화. ErrorEvent 의 모든 필드 (message, filename, lineno, colno, error.stack) 를 trace 로 main thread console 에 + postMessage 보조.
   - `worker.onmessageerror = (e) => { console.error('[INSEOUL_LLM] worker.onmessageerror', e); }` 추가.
2. **`src/ai/worker/llm.worker.ts`**:
   - 이미 박혀있는 `self.addEventListener('error')` / `'unhandledrejection'` 핸들러 점검 + 강화. error.stack 까지 postMessage 로 main 에 전송.
   - top-level dynamic import 의 catch 에서 `phase: 'import-fail'` trace + filename 추정 (e.g. `@mediapipe/tasks-genai`) 명시.
3. **`capacitor.config.ts`**: `CapacitorConsole` 또는 `CapConsole` plugin 활성 점검. 비활성이면 활성. console.log/warn/error 가 native log 에 forward 되도록.
4. **`docs/llm-debugging.md` 신규**:
   - trace map (mermaid 또는 ascii):
     ```
     ensureReady → worker:constructing → worker:constructed
       └ bootstrap-start → before-import → after-import → llm-instantiated
           └ init:enter → host-ok → webgpu-ok → fileset-ok → fetch-ok → gpu-ok
                                                                       └ gpu-fail
     ```
   - 각 trace 가 안 도달할 때 의심 root cause 표.
5. **단위 테스트**:
   - `src/ai/__tests__/useLLM.error-forward.test.ts` (신규) — Vitest 로 mock Worker 의 onerror 트리거 → useLLM 이 trace 메시지를 forward 하는지 검증.

### 수용 기준
- [ ] `useLLM.ts` 의 worker.onerror 가 ErrorEvent 모든 필드 trace
- [ ] `useLLM.ts` 의 worker.onmessageerror 핸들러 추가
- [ ] `llm.worker.ts` 의 self.onerror 가 error.stack 까지 postMessage
- [ ] `capacitor.config.ts` console plugin 활성 (또는 정적 검증 후 변경 불필요 명시)
- [ ] `docs/llm-debugging.md` 신규 — trace map + 의심 root cause 표
- [ ] Vitest 단위 테스트 1건 추가 — worker.onerror 트리거 시 trace forward 검증
- [ ] `npm run lint` pass
- [ ] `npm test` pass
- [ ] commit (브랜치: `task-2-impl`), 메시지 `feat(sprint-11/task-2): forward worker silent-death traces to main thread + Capacitor console`

### 완료 시그널
```
[IMPL_DONE] task-2 commit=<short_sha> ready_for_review
```
+ `cmux display-message -p "[IMPL_DONE] task-2"` 시도.

## 중요
- task-1 영역 (mediapipe.ts, vite.config.ts, package.json) 침범 금지.
- task-3 영역 (AdvisorContext.tsx, AiSheet.tsx) 침범 금지.
- review 파일은 read-only (Codex 만 씀).
