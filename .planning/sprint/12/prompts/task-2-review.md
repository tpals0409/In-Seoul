# Sprint 12 / task-2 검증 — fetchModelWithProgress trace + idle timeout (Codex review)

당신은 Sprint 12 task-2 검증 워커 (Codex) 입니다.

## 0. 절대 규칙

- STOP nudge 받기 전까지 git inspection / 파일 작성 모두 금지
- Round 진입 시마다 `git rev-parse task-2-impl` 재캡처
- review 파일 사전 존재 시 mtime > impl_commit 시각이면 stale, 파괴 후 재작성

## 1. 대기

```
[REVIEW_START] task-2 commit=<sha> base=cf62830
```

## 2. 검증 절차

1. `git rev-parse task-2-impl` 재캡처 → impl_sha
2. `git log task-2-impl --oneline cf62830..HEAD`
3. **Diff base 고정 (cf62830)**:
   ```
   git diff cf62830..task-2-impl -- src/ai/llm/mediapipe.ts src/ai/worker/llm.worker.ts src/ai/llm/__tests__/mediapipe.test.ts src/ai/llm/types.ts
   ```
4. 6 차원 평가:
   - **correctness**:
     - 6 stage (`request-start`, `response`, `first-chunk`, `milestone`, `complete`, `idle-timeout`) 모두 emit?
     - milestone dedup 동작 (boundary 마다 한 번)?
     - idle timeout 30s 기본값 + 옵션 override?
     - idle 시 reader.cancel() + AbortController 호출?
     - 워커 가 trace 를 main 으로 forward?
   - **regression**:
     - `onTrace` 옵셔널 유지 (기존 호출자 영향 0)?
     - 기존 케이스 (host allowlist, content-length, max-bytes) 보존?
     - 134 + 4 = 138 이상 tests pass?
     - `npm run build` (production) 통과?
   - **privacy**: trace detail 에 modelUrl 노출 — 이미 비밀 아님 (HuggingFace 공개 URL). detail 에 응답 body 노출 금지.
   - **on-device LLM 가드**: ollama 분기 보존? main-thread fallback 분기 (Sprint 11 task-4) 보존?
   - **readability**: stage 명명 일관 (`download:` prefix), 단위 (ms vs s) 명확?
   - **test coverage**: 4 케이스 (순서, idle-timeout, abort, dedup) 모두 단위 검증?
5. **단위 테스트 직접 실행** (자체 worktree 사용 권장):
   ```
   git worktree add -B task-2-review-tmp ../inseoul-worktrees/task-2-review-tmp task-2-impl
   cd ../inseoul-worktrees/task-2-review-tmp
   npm test -- mediapipe                # 새 케이스 포함 통과
   npm run lint && npm run build
   cd /Users/leokim/Desktop/leo.kim/InSeoul
   git worktree remove ../inseoul-worktrees/task-2-review-tmp --force
   ```
6. `.planning/sprint/12/reviews/task-2.md` 갱신 (frontmatter + Round 본문)
7. verdict 출력:
   - pass: `cmux display-message -p "[REVIEW_PASS] task-2 round=R"`
   - reject: 핵심 지적 3줄 이내 cmux send

## 3. 중단 조건

Round 3 escalation. `cmux display-message -p "[REVIEW_ESCALATE] task-2"` 후 idle.
