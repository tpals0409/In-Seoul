---
task: 4
status: pass
rounds: 2
last_updated: 2026-05-08T22:25:22+09:00
branch: task-4-impl
commit: 322496d
---

# Round 1

## Verdict

reject

## Scope Reviewed

- `git log task-4-impl --oneline`: `bf281f5 feat(prompt): sanitize KRW values + cap prompt at 8k chars`
- `git diff main..task-4-impl -- src/ai/prompt/build.ts src/ai/prompt/context.ts src/ai/fallback/templates.ts src/ai/prompt/__tests__/build.test.ts`

## Findings

1. `src/ai/prompt/build.ts:75-113` does not enforce the 8,000 char hard cap on the final prompt. `mandatorySize` includes the raw `question.length`, then the implementation always appends `[사용자 질문] ${question}` and returns `sections.join('\n')` without final trimming. A long user question, or any future growth in mandatory sections, can produce a prompt over `MAX_PROMPT_CHARS`, violating accept criteria (b) "프롬프트 총 길이 8000 char cap."

2. `src/ai/prompt/build.ts:35-47` drops an oversized first chunk entirely instead of preserving chunk content before cutting `recentChat`. If the first RAG chunk is larger than the remaining budget, `renderChunks` breaks before pushing anything. The requirement says overflow should preserve chunks first, then cut recent chat; this implementation can preserve zero chunks while still keeping mandatory sections.

3. `src/ai/prompt/__tests__/build.test.ts` covers normal cap cases but misses the two failing boundaries above: extremely long `question` and single oversized chunk truncation/preservation. The current tests pass because they only assert length for giant chunks and do not assert that any chunk content survives.

## 6-Dimension Evaluation

- correctness: Partial. Sanitization helpers and fallback template alignment are present, but the 8,000 character cap is not a true hard cap and chunk priority is not honored for oversized chunks.
- regression: Vitest passed. Playwright Chromium passed; WebKit failed because the local Playwright WebKit executable is missing, not due to observed app behavior.
- privacy: No new external send channel found in the reviewed diff. Financial amount labels are introduced for prompt context and fallback templates.
- on-device LLM guard: No ollama/mediapipe backend branching was changed in the task-4 scope.
- readability: The helper names and comments are understandable, but the "hard cap" comment is misleading until final output is actually capped.
- test coverage: Good baseline coverage for quantization and fallback consistency, but insufficient boundary coverage for the cap and chunk-priority requirements.

## Verification

- `npm run test -- src/ai/prompt/__tests__/build.test.ts`: pass, 10 tests.
- `npm run test`: pass, 12 files / 117 tests.
- `npm run e2e`: fail overall because WebKit browser is not installed. Chromium project passed 10/10; WebKit 10/10 failed before test execution with missing executable at `/Users/leokim/Library/Caches/ms-playwright/webkit-2272/pw_run.sh`.

## Required Fix

- Enforce `buildPrompt(...).length <= MAX_PROMPT_CHARS` for all inputs, including very long user questions.
- Truncate oversized chunks within budget instead of dropping the first chunk wholesale; chunks must be preserved before recent chat.
- Add Vitest cases for long-question cap and oversized-single-chunk preservation.

# Round 2

## Verdict

pass

## Scope Reviewed

- `git log task-4-impl --oneline`: `322496d fix(prompt): hard-cap final output + truncate oversized chunks`, `bf281f5 feat(prompt): sanitize KRW values + cap prompt at 8k chars`
- `git diff main..task-4-impl -- src/ai/prompt/build.ts src/ai/prompt/context.ts src/ai/fallback/templates.ts src/ai/prompt/__tests__/build.test.ts`

## Findings

No blocking findings.

Round 1 issues were addressed:

- `buildPrompt` now applies a final `MAX_PROMPT_CHARS` hard cap, covering long user question and future mandatory-section growth.
- Oversized first chunks are partially preserved with source header plus content instead of being dropped wholesale.
- Tests now include long-question cap and single-oversized-chunk preservation boundaries.

## 6-Dimension Evaluation

- correctness: Pass. Acceptance criteria (a)-(d) are met: financial 만원 values are quantized, prompt output is hard-capped at 8,000 chars, chunks are prioritized over recent chat, fallback templates share the sanitize policy, and required tests are present.
- regression: Pass for available checks. Scope ESLint, target Vitest, full Vitest, and Chromium Playwright passed. Full Playwright previously failed only because local WebKit executable is not installed.
- privacy: Pass. Reviewed diff adds no external send channel and reduces raw financial amount exposure in prompt/fallback paths.
- on-device LLM guard: Pass. No ollama/mediapipe backend branch was changed in the task-4 scope.
- readability: Pass. Helpers are named clearly and the cap/chunk behavior is understandable.
- test coverage: Pass. Coverage includes quantization, prompt sanitize, 8,000 char cap, priority truncation, long question boundary, oversized chunk preservation, and fallback consistency.

## Verification

- `npm run test -- src/ai/prompt/__tests__/build.test.ts`: pass, 12 tests.
- `npm run test`: pass, 10 files / 82 tests.
- `npx eslint src/ai/prompt/build.ts src/ai/prompt/context.ts src/ai/fallback/templates.ts src/ai/prompt/__tests__/build.test.ts`: pass.
- `npx playwright test --project=chromium`: pass, 10 tests.
- Full `npm run e2e` was attempted in Round 1 and failed for WebKit only because `/Users/leokim/Library/Caches/ms-playwright/webkit-2272/pw_run.sh` is missing.
