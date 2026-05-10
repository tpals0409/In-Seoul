# Task-1 impl 워커 (Claude) — wasm 자체 호스팅

## 정체
당신은 InSeoul Sprint 11 task-1 구현 워커입니다.

## 첫 단계 (필수, 한 번만)
```bash
cd /Users/leokim/Desktop/leo.kim/InSeoul
git worktree add ../inseoul-worktrees/task-1-impl sprint-10-llm-debug -b task-1-impl
cd ../inseoul-worktrees/task-1-impl
git status   # clean 확인
```
이후 모든 Edit/Write/Bash 는 `../inseoul-worktrees/task-1-impl` 안에서 수행.

## 작업
**mediapipe wasm 을 jsdelivr CDN 의존에서 자체 호스팅으로 전환.** Sprint 10 핸드오프 (`/Users/leokim/Desktop/leo.kim/InSeoul/.planning/sprint/10/llm-debug-handoff.md`) 의 fix 후보 A 를 적용.

### 배경
- 현재 `src/ai/llm/mediapipe.ts:8-9` 에서 `MEDIAPIPE_WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm'` 로 하드코딩.
- WKWebView 가 cross-origin wasm streaming 정책 또는 jsdelivr cache 변동으로 `ModuleFactory not set.` 무한 루프 추정.
- `node_modules/@mediapipe/tasks-genai/wasm/` 에 6 파일 (~75MB) 이 이미 존재. dist 에 inline 하면 cdn 의존 제거.

### 구현 절차
1. **prebuild 스크립트**: `scripts/copy-mediapipe-wasm.sh` 신규.
   - `node_modules/@mediapipe/tasks-genai/wasm/` 6 파일 (genai_wasm_internal.{js,wasm}, genai_wasm_module_internal.{js,wasm}, genai_wasm_nosimd_internal.{js,wasm}) 을 `public/wasm/` 로 복사.
   - 멱등 (이미 존재해도 덮어쓰기), shellcheck 깨끗.
2. **package.json**: `prebuild` script 에 `bash scripts/copy-mediapipe-wasm.sh` 추가. (기존 prebuild 있으면 chain.)
3. **mediapipe.ts:8-9**: `MEDIAPIPE_WASM_BASE` 를 `'/wasm'` 로 변경. (Vite 가 절대 경로로 dist root 의 wasm/ 으로 매핑.)
4. **public/wasm/.gitignore**: 복사된 파일 vendor 표시. 추적할지 결정 — vite 가 dist 에 inline 한다면 .gitignore 로 추적 제외하고 prebuild 시 매번 복사가 정공법. `.gitignore` 안에 `*.wasm` `*.js` `!.gitignore` 같은 패턴.
5. **vite.config.ts**: 변경 필요 시만 (publicDir 가 디폴트 `public/` 이면 자동 inline. 검증.).

### 수용 기준
- [ ] `bash scripts/copy-mediapipe-wasm.sh` 실행 → public/wasm/ 6 파일 존재
- [ ] `npm run build` 성공 → `dist/wasm/` 또는 동등 위치에 6 파일 inline (또는 dist 가 wasm 6 파일 포함 검증)
- [ ] `grep -r "jsdelivr" src/ai/` → 0 건
- [ ] `grep "MEDIAPIPE_WASM_BASE" src/ai/llm/mediapipe.ts` → `'/wasm'` 또는 build-time 상수
- [ ] `npm run lint` pass
- [ ] `npm test` pass (기존 70 단위 + 10 e2e)
- [ ] commit (브랜치: `task-1-impl`), 메시지 `feat(sprint-11/task-1): self-host mediapipe wasm — remove jsdelivr CDN dependency`

### 완료 시그널 (정확히 출력 필수)
```
[IMPL_DONE] task-1 commit=<short_sha> ready_for_review
```
그리고 `cmux display-message -p "[IMPL_DONE] task-1"` 발신 시도. cmux IPC 안 잡히면 출력만 OK (review 워커 SSOT 는 review 파일 frontmatter).

## 중요
- review pass 전까지 main 머지 금지.
- 다른 task 영역 (task-2: llm.worker.ts/useLLM.ts/capacitor.config.ts, task-3: AdvisorContext.tsx/AiSheet.tsx) 침범 금지.
- review 파일 (`.planning/sprint/11/reviews/task-1.md`) 은 read-only (Codex 만 씀).
- review reject 시 같은 페인에서 라운드 진행. 핵심 지적 반영 → 같은 브랜치에 추가 commit → `[IMPL_DONE] task-1 round=R` 재발신.
