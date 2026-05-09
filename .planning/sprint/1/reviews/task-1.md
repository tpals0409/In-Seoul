---
task: task-1
status: pass
rounds: 2
last_updated: 2026-05-08T22:05:00+09:00
---

# Round 1

## Verdict

reject

## Evidence

- `git log task-1-impl --oneline` shows only the base history:
  - `ab3d3e0 docs(readme): replace mermaid blocks with text/table fallback`
  - `a3f9fad chore: initial commit - InSeoul MVP`
- `git diff main..task-1-impl -- src/ai/hooks/useLLM.ts src/ai/hooks/__tests__/useLLM.test.ts src/types/contracts.ts` is empty.
- The implementation signal reported commit `c1bf635`, but that commit is not reachable from `task-1-impl`. Local `HEAD` contains `c1bf635` plus unrelated task-4 commit `bf281f5`, so the official review branch is not reviewable.

## 6-Dimension Review

### correctness

Fail. The acceptance criteria cannot be satisfied on the official branch because `task-1-impl` contains no task-1 implementation diff. There is no committed change on that branch to enforce non-local Ollama host blocking in `ensureReady` or `generate`, no `remote: true` exposure, and no new task-1 test file.

### regression

Fail / not verifiable. Vitest and Playwright impact cannot be reviewed against `task-1-impl` because the branch has no task-1 changes. The implementation worker also reported `npm run lint` failing on pre-existing files, but this does not rescue the missing official branch diff.

### privacy

Fail. On the official branch, the existing privacy gap remains: non-local Ollama URLs are not blocked by the reviewed diff because there is no reviewed diff.

### on-device LLM guard

Fail / not verifiable. The required preservation of `ollama` / `mediapipe` backend branching cannot be assessed from `task-1-impl`, and the official branch does not include the claimed MediaPipe non-regression test.

### readability

Fail / not applicable. No task-1 code is present on the official branch to review for readability.

### test coverage

Fail. The required 4+ Vitest cases are absent from `task-1-impl`; `src/ai/hooks/__tests__/useLLM.test.ts` is not present in `main..task-1-impl`.

## Required Fix

Move the task-1 commit onto the official `task-1-impl` branch and ensure `git log main..task-1-impl --oneline` contains only task-1 commit(s). `git diff main..task-1-impl -- src/ai/hooks/useLLM.ts src/ai/hooks/__tests__/useLLM.test.ts src/types/contracts.ts` must show the implementation and tests. Do not include task-4 commit `bf281f5` or unrelated files in the task-1 branch history.

# Round 2

## Verdict

pass

## Evidence

- `git log main..task-1-impl --oneline` contains exactly one task-1 commit:
  - `fcd06da feat(ai): block non-local Ollama hosts at call boundary (task-1)`
- `git diff main..task-1-impl --stat` is limited to the task-1 scope:
  - `src/ai/hooks/useLLM.ts`: +78 / -6
  - `src/ai/hooks/__tests__/useLLM.test.ts`: +182 new file
  - `src/types/contracts.ts`: +3
- Scope lint: `npx eslint src/ai/hooks/useLLM.ts src/ai/hooks/__tests__/useLLM.test.ts src/types/contracts.ts` passed.
- Vitest targeted: `npx vitest run src/ai/hooks/__tests__/useLLM.test.ts` passed, 16 tests.
- Vitest full suite: `npm test` passed, 11 files / 96 tests.
- Playwright: full `npm run e2e` could not complete WebKit because local WebKit executable is missing, but Chromium project passed separately with `npx playwright test --project=chromium`, 10 tests.

## 6-Dimension Review

### correctness

Pass. `ensureReady` checks `VITE_OLLAMA_URL` before `client.ping()` and throws before any fetch for non-local hosts unless `VITE_ALLOW_REMOTE_LLM=1`. `generate` repeats the same host check before prompt submission, so direct `generate()` calls and env changes are also guarded. On allowed remote use, `state.remote=true` is preserved through `loading`, `ready`, and `generating` states.

### regression

Pass with environment note. Scope eslint, targeted Vitest, full Vitest, and Chromium Playwright all pass. Full Playwright fails only for WebKit because `/Users/leokim/Library/Caches/ms-playwright/webkit-2272/pw_run.sh` is missing; Chromium e2e behavior is green.

### privacy

Pass. The reviewed diff does not add external send channels. It closes the known privacy gap by preventing non-local Ollama network calls before `ping()` or `generate()` unless the explicit `VITE_ALLOW_REMOTE_LLM=1` opt-in is set.

### on-device LLM guard

Pass. Existing `isOnDeviceLlm()` behavior is preserved: local Ollama remains on-device, remote Ollama is not reported as local, and MediaPipe remains on-device. The new tests include a MediaPipe branch check with a non-local Ollama URL present.

### readability

Pass. The host check is isolated in `checkOllamaHost()`, exported for direct tests, and reused consistently in both call boundaries. The state transitions keep `remote` as `true` only when relevant and avoid leaking a false flag.

### test coverage

Pass. The new test file exceeds the required 4 cases: local host pass, external URL block, explicit opt-in with `remote=true`, generate boundary blocking, strict opt-in token validation, pure helper coverage, and MediaPipe non-regression.
