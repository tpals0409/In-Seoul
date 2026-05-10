# Sprint 12 / task-1 — 빌드 체인 hardening

당신은 Sprint 12 task-1 구현 워커 (Claude) 입니다. 다음 사항을 엄수해 주세요.

## 0. 작업 환경 (worktree 분리 필수 — `feedback_cmux_worktree.md`)

이 cmux 워크스페이스는 메인 워킹트리와 **분리된 worktree** 에서 작업해야 합니다. 부팅 직후 다음을 실행:

```bash
cd /Users/leokim/Desktop/leo.kim/InSeoul

# 잔재 정리 (멱등)
git branch -D task-1-impl 2>/dev/null
git worktree prune

# 메인 트리 working state 안 건드리도록 별도 worktree 에서 작업
mkdir -p ../inseoul-worktrees
git worktree add -b task-1-impl ../inseoul-worktrees/task-1-impl main

cd ../inseoul-worktrees/task-1-impl
pwd  # 반드시 ../inseoul-worktrees/task-1-impl 이어야 함
```

이후 모든 명령은 worktree 내부 (`../inseoul-worktrees/task-1-impl`) 에서 실행. 메인 트리로 cd 절대 금지.

## 1. 트리거 / 컨텍스트

iOS UAT 도중 발견 — 사용자 시뮬레이터에 설치된 앱 번들의 `assets/mediapipe-*.js` 가 Sprint 11 task-1 적용 *이전* 상태였음. 즉:

- 소스 코드: `src/ai/llm/mediapipe.ts:16` 의 `MEDIAPIPE_WASM_BASE = '/wasm'` ✅
- 그러나 `public/wasm/` 는 `.gitignore` 만 존재 — `prebuild` (= `bash scripts/copy-mediapipe-wasm.sh`) 가 한 번도 실행 안 됨
- `dist/wasm/` 도 미생성 → `npx cap sync ios` 로 ios 번들에 wasm 0개
- 사용자가 `vite build` 직접 호출했거나 lifecycle hook 이 우회됐을 가능성

**결과**: stale 번들이 `https://cdn.jsdelivr.net/...` 에서 wasm 로드 시도 → Sprint 10 의 `ModuleFactory not set.` 회귀 가능. silent fail.

## 2. 수용 기준 (정확히 충족되어야 합니다)

1. **명시적 chain**: `package.json` 의 `"build"` 스크립트가 `bash scripts/copy-mediapipe-wasm.sh && tsc -b && vite build` 로 변경 (또는 동급 명시 sequence). 기존 `"prebuild"` 는 보존(npm lifecycle 백업)하되, `build` 자체가 prebuild 명령을 직접 호출해야 lifecycle hook 우회 시에도 안전.
2. **vite plugin fail-fast assertion**: `vite.config.ts` 에 새 plugin `assertWasmCopied` 추가. `closeBundle` (또는 `writeBundle`) hook 에서 다음 6 파일이 `dist/wasm/` 에 존재함을 검증, 없으면 `this.error()` 로 빌드 실패:
   - `genai_wasm_internal.js` / `.wasm`
   - `genai_wasm_module_internal.js` / `.wasm`
   - `genai_wasm_nosimd_internal.js` / `.wasm`
3. **단위 테스트** — vite plugin 의 검증 로직 자체에 대한 단위 테스트 1건 (mock dist 디렉터리 + plugin 의 closeBundle 호출 → throw 검증). 위치: `src/__tests__/vite-assert-wasm-copied.test.ts` 또는 `vite.config.test.ts`.
4. **scripts/check-bundle.sh** 갱신 (이미 존재) — `dist/wasm/` 6 파일 존재 검증 step 추가. 누락 시 `exit 1` + 진단 메시지 ("`/wasm` 자체 호스팅 누락 — `npm run build` 또는 `bash scripts/copy-mediapipe-wasm.sh` 재실행").
5. **검증**:
   - `npm run lint` 통과 (0e/0w 유지)
   - `npm test` 통과 (기존 134 + 새 1 ≥ 135 tests pass)
   - `rm -rf dist public/wasm/*` 후 `npm run build` 실행 → `dist/wasm/` 에 6 파일 + 빌드 성공
   - `rm -rf public/wasm/genai_*` 후 `vite build` 직접 호출 → vite plugin 이 `closeBundle` 에서 fail (회귀 방지 검증)

## 3. 스코프 파일 (이 외 수정 금지)

- `package.json` (`scripts.build` 갱신)
- `vite.config.ts` (assertWasmCopied plugin 추가, 기존 `assertLlmBackend` 옆에 등록)
- `scripts/check-bundle.sh` (검증 step 추가)
- 새 파일: `src/__tests__/vite-assert-wasm-copied.test.ts` (또는 vite.config.test.ts)

**NEVER**: `scripts/copy-mediapipe-wasm.sh` 본문 변경 금지 (이미 정상). `src/ai/llm/*` 변경 금지 (task-2 의 영역). `docs/*` 변경 금지 (task-3 의 영역).

## 4. 워크플로우

1. 작업 수행 (Edit / Write / 테스트)
2. `npm run lint && npm test` 통과 확인
3. **회귀 검증**:
   ```bash
   rm -rf dist public/wasm/genai_*
   npm run build && ls dist/wasm/ | wc -l   # 7 (.gitignore 보존 시) 또는 6
   ```
4. commit (브랜치 = `task-1-impl`)
5. 완료 시 정확히 출력:
   ```
   [IMPL_DONE] task-1 commit=<short_sha> ready_for_review
   ```
   그리고 `cmux display-message -p "[IMPL_DONE] task-1"` 발신

## 5. 중요 주의사항

- review pass 전까지 main 머지 금지
- task-2 / task-3 영역 침범 금지 (`src/ai/llm/*`, `src/ai/worker/*`, `docs/*` 건드리지 마세요)
- review 파일 (`/Users/leokim/Desktop/leo.kim/InSeoul/.planning/sprint/12/reviews/task-1.md`) 은 read-only — Codex 만 씀
- review reject 시 같은 페인에서 라운드 진행
- 메인 트리 (`/Users/leokim/Desktop/leo.kim/InSeoul`) 의 working state 절대 변경 금지 — 모든 작업은 `../inseoul-worktrees/task-1-impl` 안에서만
