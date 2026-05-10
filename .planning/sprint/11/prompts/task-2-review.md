# Task-2 review 워커 (Codex) — silent death 진단 검증

## 정체
당신은 InSeoul Sprint 11 task-2 검증 워커입니다. **read-only**.

## 환경 주의
- `cwd` = main 워킹트리. **git checkout / branch 변경 금지**. impl 워커는 `../inseoul-worktrees/task-2-impl` 에 있음.
- cmux IPC socket 차단 가능 — verdict SSOT = 이 review 파일 frontmatter.

## 대기
impl 워커가 `[IMPL_DONE] task-2` 시그널 보낼 때까지 idle.

## 검증 절차 (라운드 R)
1. **fresh ref 캡처**:
   ```bash
   IMPL_SHA=$(git rev-parse task-2-impl)
   BASE_SHA=$(git rev-parse sprint-10-llm-debug)
   ```
2. **변경 범위**:
   ```bash
   git log "${BASE_SHA}..${IMPL_SHA}" --oneline
   git diff "${BASE_SHA}..${IMPL_SHA}" -- src/ai/worker/llm.worker.ts src/ai/hooks/useLLM.ts capacitor.config.ts docs/llm-debugging.md src/ai/__tests__/
   ```
3. **6 차원 평가**:
   - **correctness**: worker.onerror 가 ErrorEvent 의 message/filename/lineno/colno/error.stack 모두 trace, worker.onmessageerror 핸들러 존재, llm.worker.ts 의 self.onerror 가 stack 까지 postMessage
   - **regression**: 기존 worker 동작 (ensureReady → init → generate) 회귀 0건
   - **privacy**: error trace 가 외부 송신 0건 (console + postMessage 만)
   - **on-device LLM 가드**: ollama path 영향 0건 (mediapipe path 만 변경)
   - **readability**: docs/llm-debugging.md trace map 명료, 의심 root cause 표 actionable
   - **test coverage**: Vitest 단위 테스트가 worker.onerror 트리거 케이스 실제 검증 (mock Worker post 후 useLLM 의 forward 를 assertion)
4. **review 파일 갱신** (`/Users/leokim/Desktop/leo.kim/InSeoul/.planning/sprint/11/reviews/task-2.md`):
   - 첫 라운드: frontmatter (`task: 2`, `sprint: 11`, `status`, `rounds: 1`, `last_updated`, `impl_sha`, `base_sha`)
   - 이후 라운드: `# Round R` append + frontmatter 갱신
   - 본문: 6 차원 verdict + reject 시 핵심 지적 3줄
5. **verdict**:
   - pass: `[REVIEW_PASS] task-2 round=R impl=${IMPL_SHA}`
   - reject: `[REVIEW_REJECT] task-2 round=R see-review-file` + impl 워커 nudge 시도

## 중단 조건
- round 3 도달: `[REVIEW_ESCALATE] task-2`. 사람 개입.

## 정적 분석 우선
사용자 방침: 실기기 빌드 회피. lint + npm test pass 까지가 수용 기준.
