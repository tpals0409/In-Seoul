# Sprint 11 — LLM init fix + 실기기 UAT 본 측정 (정적 검토 우선)

## 기간
2026-05-10 (단일 세션, 약 2시간)

## start_commit → end_commit
45ec2c9 → f9820a9 (origin/main push 완료)

## 모드
cmux 4 워커 페어 (max_pairs=4) — Wave 1: task-1/2/3 병렬 3쌍, Wave 2: task-4 의존 1쌍. 사용자 방침: **실기기 빌드 회피, 코드 정적 검토 + 단위 테스트 위주**. 직장 아이폰 안 띄우고 fix 후보 모두 코드/문서로 적용 → 사용자가 후속 빌드.

## 작업 결과

| Task | 제목 | verdict | rounds | impl_sha | merge_sha |
|---|---|---|---|---|---|
| 1 | wasm 자체 호스팅 — jsdelivr CDN 의존 제거 | pass | 1 | ab298c3 | 19c264a |
| 2 | silent death 진단 강화 — worker.onerror + Capacitor console forward | pass | 1 | c86d76e | 1867eee |
| 3 | AdvisorContext / AiSheet race 정적 재점검 + 핸드오프 갱신 | pass | 1 | 9c49303 | 09db997 |
| 4 | main thread mediapipe fallback 분기 (off-by-default) | pass | 1 | dce4cd1 | f9820a9 |

추가 머지: `9a724ae` (sprint-11 base — sprint-10 LLM debug traces carry-over 흡수).

## 머지된 commit / push
- `9a724ae` merge: sprint-11 base — sprint-10 LLM debug traces (carry-over)
- `19c264a` merge: s11-task-1 — self-host mediapipe wasm (R1 pass, ab298c3)
- `1867eee` merge: s11-task-2 — forward worker silent-death traces (R1 pass, c86d76e)
- `09db997` merge: s11-task-3 — static review of AdvisorContext/AiSheet (R1 pass, 9c49303)
- `f9820a9` merge: s11-task-4 — main-thread mediapipe fallback off-by-default (R1 pass, dce4cd1)

origin/main push: `45ec2c9..f9820a9` fast-forward, 10 commit.

## 검증 요약 (Codex Review)
- 총 task: 4
- 1라운드 통과율: 4/4 (100%)
- 평균 라운드: 1.0
- escalation: 0건
- review 파일 인덱스:
  - `.planning/sprint/11/reviews/task-1.md`
  - `.planning/sprint/11/reviews/task-2.md`
  - `.planning/sprint/11/reviews/task-3.md`
  - `.planning/sprint/11/reviews/task-4.md`
- 누적 테스트: lint 0e/0w 유지, vitest 16 files / 134 tests pass (task-4 기준), `VITE_LLM_BACKEND=mediapipe npm run build` pass (task-1 검증)

## 신규 결정 / 패턴 / 교훈

### 1. mediapipe wasm 자체 호스팅 정공법 (task-1)
- `MEDIAPIPE_WASM_BASE = '/wasm'` (relative) + `scripts/copy-mediapipe-wasm.sh` prebuild hook + `public/wasm/.gitignore` (vendor 표시) + `package.json` prebuild chain.
- `node_modules/@mediapipe/tasks-genai/wasm/` 6 파일 (~75MB: simd / non-simd / module 각각 .js+.wasm) 을 `public/wasm/` 으로 복사 → vite 가 dist 에 자동 inline.
- `dist/wasm/` 검증으로 산출물 보장 (jsdelivr 호출 0건). 모델 호스트 allowlist 에서도 jsdelivr 제거.
- **함의**: WKWebView cross-origin wasm streaming 정책 / jsdelivr cache 변동 모두 우회. Sprint 10 의 `ModuleFactory not set.` 무한 루프 fix 후보 A 의 1순위 적용.

### 2. silent death 3중 trace forward (task-2)
- `useLLM.ts` 의 `worker.onerror` 강화 (message/filename/lineno/colno/error.stack) + `worker.onmessageerror` 핸들러 신규.
- `llm.worker.ts` 의 `self.onerror` 가 stack 까지 `postMessage({type:'trace'})` 로 main 에 forward.
- `capacitor.config.ts` Capacitor Console plugin 활성화 → main thread console 이 native log 로 forward.
- `docs/llm-debugging.md` 신규 — trace map (ensureReady → worker:constructing → bootstrap-start → before-import → after-import → llm-instantiated → init:enter → host-ok → webgpu-ok → fileset-ok → fetch-ok → gpu-ok) + 의심 root cause 표.
- Vitest 단위 테스트 1건 (`useLLM.error-forward.test.ts`) — mock Worker `error` / `messageerror` 트리거 시 `[INSEOUL_LLM]` console + state 전파 검증.
- **함의**: worker silent death 시 첫 trace 가 어디서 끊기는지 판별 가능 → 다음 디버깅 cycle 단축.

### 3. 정적 분석 보고서가 정당한 task verdict 대상 (task-3)
- task-3 commit 9c49303 = 코드 변경 0건, `.planning/sprint/11/static-review.md` (104줄) 만 추가.
- AdvisorProvider mount eager init + AiSheetBody ensureReadyOnceRef 의 race window 를 함수별/트리거별 표로 분석. React 18 strict-mode + 진짜 mount/unmount/remount 모두 다룸. 결론 = **변경 불필요** (`useLLM.ensureReady`'s `ready` early return + `initPromiseRef` in-flight dedup 가 lower-level 보호).
- review (codex) 6 차원 모두 PASS — "report-only 면 unit-test 요구 미적용" 명시 + 기존 테스트 14 files / 128 tests pass 확인.
- **함의**: "변경 불필요" 도 합법적 verdict 대상 (근거 명료 시). 모든 task 가 코드 변경을 요구하지 않음.

### 4. main-thread mediapipe fallback 옵트인 (task-4)
- `VITE_LLM_RUN_MAIN_THREAD === '1'` 일 때만 worker 우회. `'0'` / 미지정 / `ollama` 백엔드 = 기존 worker path 그대로.
- `useLLM.ts` 184줄 분기 + `mediapipe.ts` 10줄 main-thread export + `.env.example` 옵트인 키 + 단위 테스트 4 케이스 (95줄) — flag '1', 미지정, '0', `ollama` ignore.
- UI freeze 위험 4곳 명시 (useLLM, mediapipe, runtime warning text, .env.example).
- **함의**: worker 가 silent death 잔존 시 마지막 fallback. 기본 off → task-1/2 의 wasm self-host + worker traces 회귀 0건.

### 5. review 워커 부팅 race + stale ref 결합 함정 (Sprint 11 신규)
- task-3 review (codex ws32) 가 부팅 ~6분 사이 STOP nudge 도달 *전* sprint-8 잔재 ref `03897fe` 봐서 `.planning/sprint/11/reviews/task-3.md` 에 false reject 작성. impl 워커는 commit 0건 상태였는데 stale impl_sha 와 빈 diff 로 reject 박음.
- 처방 (Sprint 12 부터):
  1. **STOP nudge 즉시 송신**: review 워커 부트스트랩 직후 prompt → STOP nudge 순서. prompt 가 idle 안내해도 codex 가 능동 검증 시작 가능 → 명시 STOP 필수.
  2. **부트스트랩 단계에서 잔재 task-N-impl 브랜치 사전 정리**: `git branch -D task-N-impl 2>/dev/null` 을 워크스페이스 생성 직전. Sprint 11 에서 task-4 만 사전 정리 적용 (Wave 2), Wave 1 의 task-1/2/3 은 impl 워커가 worktree create 시 -D 후 재생성 → review 워커가 그 사이 stale ref 봤음.
  3. **review 파일 사전 존재 시 무효화**: 오케스트레이터가 nudge 송신 직후 review 파일 mtime 검증 → impl 워커 commit 시각보다 오래된 파일은 stale.
- 신규 메모 후보: `feedback_review_premature_file_write.md` (기존 `feedback_review_polling_race.md` + `feedback_review_stale_commit_lookup.md` 결합 케이스).

### 6. Wave 1 → main 머지 → Wave 2 부트스트랩 흐름
- Wave 1 의 3 task (1/2/3) 가 base = `sprint-10-llm-debug @ f67f3f1` 위에서 작업, 각 R1 pass 후 main 으로 4단 머지 (base merge `9a724ae` + 3 task merge).
- Wave 2 의 task-4 는 **새 main HEAD = 09db997** (Wave 1 머지 후) 위에서 worktree create. fork_point_override 불필요.
- **함의**: cross-task rebase 회피. ADR-S5-001 의 fork_point_override 패턴 (`feedback_cross_task_rebase.md`) 미사용. Wave 분리 + 머지가 더 단순하고 검증 용이.

## 운영 인사이트 누적

| 영역 | 처방 | 메모 |
|---|---|---|
| WKWebView 메모리 한도 ~1.5GB | on-device LLM ≤ 1GB int4 권장 | `feedback_ios_wkwebview_memory_limit.md` (Sprint 10) |
| review 워커 부팅 + stale ref 결합 | STOP nudge 즉시 + 잔재 브랜치 사전 정리 | (Sprint 11 신규 메모 후보) |
| review SSOT = review 파일 frontmatter | cmux IPC socket 차단 인지 | `feedback_codex_review_socket_block.md` |
| review diff base = branch fork point 고정 | moving main 비교 금지 | ADR-S5-001 (Sprint 5) |
| cmux 워커 worktree 분리 | impl 워커는 `../inseoul-worktrees/task-N-impl`, review 는 main 트리 read-only | `feedback_cmux_worktree.md` |
| prompt 외부화 (~3KB+ heredoc 회피) | `.planning/sprint/{N}/prompts/*.md` 파일 | `feedback_cmux_send_payload_limit.md` |
| codesigning override commit 금지 | `.env.local` 동급 (project.pbxproj sed swap 후 stash) | (Sprint 10 처방) |

## 이월 항목 (Sprint 12)

1. **iOS 실기기 UAT 본 수행** — Sprint 8→9→10→11→**12 다섯 번째 이월**. Sprint 11 fix (wasm self-host + worker traces + main-thread fallback) 가 실제 디바이스에서 동작하는지 사용자 손작업 트랙으로 검증. peak_rss_mb / 콜드 스타트 / mediapipe / WebView 측정.
2. **cmux 워커 worktree 분리 자동화** — Sprint 9→10→11→**12 네 번째 이월**. 현재 `/start` 7-A 가 prompt 안에서 worktree create 시키는 패턴 → orchestrator 가 직접 부트스트랩 단계에 박는 정공법으로 전환.
3. **review 워커 부팅 race 처방 통합** — `/start` 7-A.5 ready-gate 에 STOP nudge 즉시 송신 + 잔재 브랜치 사전 정리 (`git branch -D task-N-impl 2>/dev/null`) 자동화.
4. **mediapipe init silent death root cause 확정** — task-2 의 trace map 으로 디버깅 cycle 진행. 사용자 후속 빌드 + console capture 결과 → 다음 fix cycle (또는 Sprint 11 fix 가 충분하면 종결).

## 참고 자료
- [mediapipe #6270 (gemma-4-E2B web crash)](https://github.com/google-ai-edge/mediapipe/issues/6270)
- [Apple Developer Forums — WKWebView memory budget](https://developer.apple.com/forums/thread/133449)
- [Capacitor #5260 — WKWebView memory pressure](https://github.com/ionic-team/capacitor/discussions/5260)
- `.planning/sprint/10/llm-debug-handoff.md` — Sprint 10 fix 후보 5개 원본
- `.planning/sprint/11/static-review.md` — task-3 정적 분석 보고서 (변경 불필요 결론)
