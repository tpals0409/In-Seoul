---
task: 1
sprint: 8
status: pass
rounds: 3
last_updated: 2026-05-10T16:04:46+09:00
diff_base: 02863ddc0c82cd34009d75be9b7b70de5f3ee9ca
---

# Round 1

Verdict: reject

Checked commit: `46cd58c14dfe328f84d36b7747fc7bcfd544d040`

The required task-1 review diff is empty:

```bash
git diff 02863ddc0c82cd34009d75be9b7b70de5f3ee9ca..task-1-impl -- .env.example .env.production vite.config.ts scripts/assert-env.ts src/ai/hooks/useLLM.ts
```

The `task-1-impl` branch currently contains unrelated Sprint 8 task-2/task-4 changes instead:

```text
46cd58c feat(sprint-8/task-2): TweaksPanel DEV guard + bundle grep CI
ac801e5 fix(sprint-8/task-4): mobile-launch SwiftPM coverage in pick_ios_device_udid
```

Changed files from the fixed diff base are `package.json`, `scripts/check-bundle.sh`, `scripts/mobile-launch.sh`, `src/App.tsx`, and `src/dev/TweaksPanel.tsx`. None of the required task-1 files are changed on `task-1-impl`, so the production LLM backend fail-fast behavior, `.env.production` safety, `VITE_OLLAMA_URL` localhost default, `none` fallback compatibility, and test coverage cannot be validated.

Required fix: move or recreate the actual task-1 implementation on `task-1-impl`, limited to the expected env/Vite/useLLM surface, then resend `[IMPL_DONE] task-1 commit=<sha>`.

Note: `cmux read-screen --workspace workspace:11` failed in this reviewer sandbox with `Operation not permitted` against the cmux socket, so this review used the branch state after `task-1-impl` advanced from the fixed merge base.

# Round 2

Verdict: reject

Checked commit: `6ede09ee1f708427b933111d11d10041b88a36c3`

R1 evidence is stale as noted by the nudge. The current `task-1-impl` branch is now a clean single task-1 commit on top of the fixed diff base:

```text
6ede09e feat(sprint-8/task-1): LLM backend fail-fast + .env.production
02863dd fix(mobile): launch_ios 의 xcodebuild 가 SwiftPM 구조 따르도록
```

The task-1 diff is limited to `.env.example`, `.env.production`, and `vite.config.ts`.

## Findings

1. `vite.config.ts` applies `assertLlmBackend()` to every Vite build mode, not just production.

   The plugin uses `apply: 'build'` and then validates `loadEnv(mode, process.cwd(), '')` unconditionally in `config(_, { mode })`. That means `vite build --mode development` or any non-production build mode without `VITE_LLM_BACKEND` will fail, because `.env.production` is not loaded for those modes. This violates the Sprint 7/8 mandatory checklist item: "production bundle leak 회귀 가드: assert 가 dev 빌드에서도 fail 하지 않는지 확인 (DEV mode 분기)."

   Expected fix: gate the assertion to production mode, for example `if (mode !== 'production') return`, or otherwise explicitly document and test the intended non-production behavior.

## 6-Dimension Review

- Correctness: production default is safe enough (`VITE_LLM_BACKEND=mediapipe` in `.env.production`), and invalid/missing production backend would fail fast. However, the implementation over-applies the assertion outside production build mode.
- Regression: `vitest.config.ts` does not load this Vite plugin, so `vi.stubEnv`-based unit tests should remain compatible. Dev server is also unaffected by `apply: 'build'`. The unguarded build-mode assertion is still a regression risk for dev-mode builds.
- Privacy: no new external send channel is introduced. `VITE_OLLAMA_URL` remains documented as `http://localhost:11434`; no remote host is forced.
- On-device LLM guard: `useLLM.ts` is unchanged; `ollama`, `mediapipe`, and `none` paths remain present. The `none` fallback path is still alive for CI/test/env-pinned contexts.
- Secret leak: `.env.production` contains only `VITE_LLM_BACKEND=mediapipe`; `DATA_GO_KR_KEY` appears only in comments. A history grep over env files found no key-like value added for this task.
- Readability + test coverage: the error message clearly names `VITE_LLM_BACKEND` and allowed values. There is no new automated coverage for `assertLlmBackend`, especially the required production-vs-dev mode boundary.

## Verification Notes

- `git diff --check 02863ddc0c82cd34009d75be9b7b70de5f3ee9ca..task-1-impl -- .env.example .env.production vite.config.ts scripts/assert-env.ts src/ai/hooks/useLLM.ts` passed.
- `npm test -- src/ai/hooks/__tests__/useLLM.test.ts` could not run in the archive snapshot because dependencies are not installed: `vitest: command not found`.
- `npm run build` and `npm run build -- --mode development` could not reach Vite because dependencies are not installed: `tsc: command not found`.
- `npm exec vite -- --mode development --host 127.0.0.1` attempted a network fetch for `vite` and failed under restricted network (`ENOTFOUND registry.npmjs.org`).

# Round 3

Verdict: pass

Checked commit: `51aec1d`

Round 2 reject 사유였던 Vite plugin mode guard 문제가 해결됐다.

```diff
config(_, { mode }) {
+  if (mode !== 'production') return
  const env = loadEnv(mode, process.cwd(), '')
```

The assertion still applies only to Vite build commands (`apply: 'build'`), and now only validates production mode. Non-production build modes such as `vite build --mode development` skip the assertion, so dev/preview-style builds are no longer blocked by missing `VITE_LLM_BACKEND`.

## Verification

- `git diff 6ede09e..task-1-impl -- vite.config.ts` shows only the production-mode guard and explanatory comment update.
- `git diff --check 02863ddc0c82cd34009d75be9b7b70de5f3ee9ca..task-1-impl -- .env.example .env.production vite.config.ts scripts/assert-env.ts src/ai/hooks/useLLM.ts` passed.
- `npm run build` passed. Vite built production output successfully with `.env.production` default `VITE_LLM_BACKEND=mediapipe`.
- `npm run build -- --mode development` passed. This directly verifies the R2 rejection case is fixed.

Residual notes: build output includes existing bundle-size and direct-eval warnings from dependencies, unrelated to task-1.
