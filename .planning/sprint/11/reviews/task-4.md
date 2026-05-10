---
task: 4
sprint: 11
status: pass
rounds: 1
last_updated: 2026-05-10T20:13:41+0900
impl_sha: dce4cd1b84b5d998ab15d0f688aaf5036b30f94a
base_sha: 09db997fe3c6b124eada6b11827579694eac13ff
---

# Round 1

Verdict: pass

Fresh refs:
- impl: `dce4cd1b84b5d998ab15d0f688aaf5036b30f94a`
- base: `09db997fe3c6b124eada6b11827579694eac13ff`

Change scope reviewed:
- `src/ai/hooks/useLLM.ts`
- `src/ai/llm/mediapipe.ts`
- `src/ai/__tests__/useLLM.main-thread-fallback.test.ts`
- `.env.example`

Note: the prompt names `.env.local.example`, but this repo snapshot has `.env.example` as the tracked env example. The task-4 option is documented there.

## 6-axis Review

1. correctness: pass
   - `envRunMainThread()` is strict opt-in: only `VITE_LLM_RUN_MAIN_THREAD === '1'` enables the path.
   - `useLLM()` routes `mediapipe + mainThread` to `useMediapipeMainThreadBackend`; `0` or unset keeps the existing worker backend.
   - `ollama` and `none` do not observe the main-thread flag.

2. regression: pass
   - Default path remains worker-backed because `mainThread` is false unless the flag is exactly `1`.
   - Worker construction and existing trace/error handling are unchanged.
   - Task-1/2 self-hosted wasm path remains in `mediapipe.ts` with `/wasm`; no CDN wasm regression was introduced.

3. privacy: pass
   - Main-thread mode reuses `MediaPipeLLM.init()` and the existing model URL validation/fetch path.
   - No new external LLM service, remote endpoint, analytics, or fetch boundary was added.

4. on-device LLM guard: pass
   - `ollama` branch is unaffected and keeps its local/remote host guard.
   - Both MediaPipe paths still perform browser-local inference; the only network access remains model download through the existing guarded model URL path.

5. readability: pass
   - UI freeze risk is stated in `useLLM.ts`, `mediapipe.ts`, runtime warning text, and `.env.example`.
   - `.env.example` explains strict opt-in, worker bypass purpose, UI-freeze risk, backend scope, and default-off behavior.

6. test coverage: pass
   - New Vitest coverage asserts:
     - `VITE_LLM_RUN_MAIN_THREAD=1 + mediapipe` does not construct a Worker.
     - unset flag + `mediapipe` constructs a Worker.
     - `VITE_LLM_RUN_MAIN_THREAD=0 + mediapipe` constructs a Worker.
     - `ollama` ignores the flag and does not construct a MediaPipe Worker.

## Verification

- `npm run lint`: pass.
- `npm test`: pass, 16 files / 134 tests.

The impl worktree is outside the writable sandbox, so Vitest initially failed before test execution while creating Vite's `.vite-temp`. I verified the same `dce4cd1` tree from a `/private/tmp` snapshot with writable temp paths; lint and the full test suite passed there.

[REVIEW_PASS] task-4 round=1 impl=dce4cd1b84b5d998ab15d0f688aaf5036b30f94a
