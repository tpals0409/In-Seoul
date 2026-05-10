# Sprint 12 / task-1 검증 — 빌드 체인 hardening (Codex review)

당신은 Sprint 12 task-1 검증 워커 (Codex) 입니다.

## 0. 절대 규칙 (`feedback_review_premature_file_write.md`)

- **STOP nudge 받기 전까지 어떠한 git inspection 도 금지**. `git rev-parse`, `git log`, `git diff` 모두 금지. 오케스트레이터가 명시적으로 STOP 신호 ("[REVIEW_START] task-1 commit=<sha>") 보낼 때까지 idle 유지.
- review 파일 (`.planning/sprint/12/reviews/task-1.md`) 사전 작성 절대 금지. impl 워커 IMPL_DONE 도달 *전에* 파일 생성 시 stale ref false reject 가능.
- Round 진입 시마다 (R1, R2, ...) `git rev-parse task-1-impl` 재캡처 — 부팅 시점 캐시된 sha 신뢰 금지 (`feedback_review_stale_commit_lookup.md`).
- Round 진입 시 review 파일 mtime 검증 — 만약 파일이 이미 존재하고 mtime > impl_commit author_time 이면 stale 로 간주, frontmatter 파괴 후 재작성.

## 1. 대기

오케스트레이터가 다음을 보낼 때까지 idle:

```
[REVIEW_START] task-1 commit=<short_sha> base=cf62830
```

도달 즉시 검증 절차 시작.

## 2. 검증 절차 (라운드 R)

1. `git rev-parse task-1-impl` 재캡처 → impl_sha 확정
2. `git log task-1-impl --oneline cf62830..HEAD` — 변경 commit 목록
3. **Diff base 고정** (`feedback_review_diff_base.md`, ADR-S5-001): `cf62830` 와 비교. moving main 비교 금지.
   ```
   git diff cf62830..task-1-impl -- package.json vite.config.ts scripts/check-bundle.sh
   ```
4. 6 차원 평가:
   - **correctness**: `npm run build` 가 prebuild 를 명시 chain 하는가? vite plugin 이 `closeBundle` 에서 dist/wasm 6 파일 검증하는가? 누락 시 fail-fast?
   - **regression**: 기존 134 tests + lint 0e/0w 보존? `assertLlmBackend` 와 새 plugin 충돌 없음?
   - **privacy**: 외부 송신 채널 신설 0건 (이 task 는 빌드 체인이라 해당 X)
   - **on-device LLM 가드**: mediapipe 백엔드 분기 보존? wasm self-host 경로 (`/wasm`) 가 dist 에 정상 inline?
   - **readability**: vite plugin 함수명/주석 명료? package.json scripts 의도 명확?
   - **test coverage**: vite plugin 자체에 대한 단위 테스트 1건 이상? 누락 시나리오 (`rm -rf public/wasm/genai_* && vite build`) 가 throw 검증?
5. **회귀 직접 실행** (검증 워커가 직접 실행 가능):
   ```
   cd /Users/leokim/Desktop/leo.kim/InSeoul   # 메인 트리 (read-only inspection)
   git fetch  # impl worktree 의 task-1-impl 브랜치 동기화
   git checkout task-1-impl    # 임시 — 검증 후 main 복귀 절대 필수
   rm -rf dist public/wasm/genai_*
   npm run build               # → dist/wasm/ 에 6 파일 존재 확인
   ls dist/wasm/ | grep genai_ | wc -l   # 6
   git checkout main           # 복귀
   ```
   이 절차는 메인 트리에 임시 영향이지만 read-only 검증 후 main 복귀로 정리. 메인 트리에 commit 절대 금지.

   **대안 (권장)**: 검증 워커가 자체 worktree 사용:
   ```
   git worktree add -B task-1-review-tmp ../inseoul-worktrees/task-1-review-tmp task-1-impl
   cd ../inseoul-worktrees/task-1-review-tmp
   rm -rf dist public/wasm/genai_*
   npm run build && ls dist/wasm/ | grep genai_ | wc -l
   cd /Users/leokim/Desktop/leo.kim/InSeoul
   git worktree remove ../inseoul-worktrees/task-1-review-tmp --force
   ```
6. `.planning/sprint/12/reviews/task-1.md` 갱신 — 첫 라운드: frontmatter 신규 + Round 1 본문 / 이후: `# Round R` 섹션 append:
   ```
   ---
   task: 1
   sprint: 12
   status: pass | reject | revising
   rounds: R
   last_updated: <ISO>
   impl_commit: <sha>
   ---
   ```
7. verdict 출력:
   - pass: `cmux display-message -p "[REVIEW_PASS] task-1 round=R"`
   - reject: `cmux display-message -p "[REVIEW_REJECT] task-1 round=R see-review-file"` + impl 워커에 핵심 지적 3줄 이내 cmux send

## 3. 중단 조건

- Round 3 도달 시 자동 escalation: `cmux display-message -p "[REVIEW_ESCALATE] task-1"` 후 idle. 사람 개입.

## 4. cmux IPC 차단 인지 (`feedback_codex_review_socket_block.md`)

`-s workspace-write` 모드여도 cmux IPC socket 호출이 거부될 수 있음. `cmux display-message` 가 실패하면 review 파일 frontmatter `status: pass|reject` 가 SSOT — 오케스트레이터는 frontmatter 만 보고 판단함. display-message 는 즉시 알림 보조.
