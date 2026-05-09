---
task: 3
title: "MediaPipe 모델 URL 출처 + 응답 메타 가드"
status: pass
rounds: 1
last_updated: "2026-05-08T21:52:27+09:00"
branch: task-3-impl
commit: ceff62d
---

# Round 1

## Verdict

pass

## Scope

- Reviewed `git log task-3-impl --oneline`: `ceff62d feat(ai/llm): MediaPipe modelUrl host allowlist + content-length guard`.
- Reviewed `git diff main..task-3-impl -- src/ai/llm/mediapipe.ts src/ai/llm/__tests__/mediapipe.test.ts`.
- Scope is limited to the approved task-3 files.

## Correctness

Pass. `assertAllowedModelHost` rejects non-allowlisted model hosts with an `init-failed` error unless `VITE_ALLOW_CUSTOM_MODEL_HOST` is explicitly `1` or `true` (`src/ai/llm/mediapipe.ts:57-84`). Allowed hosts cover `jsdelivr.net`, `huggingface.co`, `localhost`, and `127.0.0.1`, with dot-boundary suffix matching for real subdomains and spoof prevention (`src/ai/llm/mediapipe.ts:15-20`, `src/ai/llm/mediapipe.ts:53-54`).

Pass. `assertContentLength` allows absent headers for streaming compatibility, and rejects zero, invalid, negative, and values above 2 GiB (`src/ai/llm/mediapipe.ts:92-102`). The fetch path also caps actual bytes for non-streaming and streaming responses (`src/ai/llm/mediapipe.ts:123-153`), which is stricter than the acceptance criteria and protects against false headers.

## Regression

Pass with one environment note. Verified on detached `task-3-impl` worktree:

- `npx eslint src/ai/llm/mediapipe.ts src/ai/llm/__tests__/mediapipe.test.ts` passed.
- `npx vitest run src/ai/llm/__tests__/mediapipe.test.ts` passed: 21/21.
- `npm test -- --run` passed: 10 files, 91 tests.
- `npm run build` passed.
- `npm run e2e` ran Chromium and WebKit. Chromium tests passed in the full run; WebKit failed because the local Playwright WebKit executable is not installed (`/Users/leokim/Library/Caches/ms-playwright/webkit-2272/pw_run.sh` missing). A follow-up Chromium-only run passed 9/10 and then hit `ERR_CONNECTION_REFUSED` on the last test, consistent with local webServer lifecycle/flakiness rather than this MediaPipe diff; the full run had already passed that Chromium test.

## Privacy

Pass. The patch does not add a new financial-data egress channel. It narrows the existing MediaPipe model download path by blocking unapproved model hosts before `fetch` is called (`src/ai/llm/mediapipe.ts:110-115`; test coverage at `src/ai/llm/__tests__/mediapipe.test.ts:115-125`).

## On-Device LLM Guard

Pass. The change stays inside the MediaPipe backend wrapper and does not modify Ollama or backend selection code. `assertAllowedModelHost` is called before WebGPU checks in `MediaPipeLLM.init`, so non-allowed model URLs fail deterministically as `init-failed` even in environments without WebGPU (`src/ai/llm/mediapipe.ts:173-180`). Existing `unsupported: WebGPU...` behavior remains unchanged for allowed model URLs.

## Readability

Pass. The guard logic is small and named by responsibility: host matching, env override, content-length validation, and fetch progress. Error messages are actionable and preserve the worker's `init-failed` mapping convention.

## Test Coverage

Pass. Tests exceed the requested 3 cases and cover allowlisted hosts, custom-host override, invalid URL, suffix spoofing, zero/invalid/oversized content-length, pre-fetch host blocking, fetch failure, and a successful fetch/progress path (`src/ai/llm/__tests__/mediapipe.test.ts:18-187`).

## Findings

No blocking findings.
