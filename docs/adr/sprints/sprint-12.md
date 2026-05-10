# Sprint 12 — 모델 다운로드 stall 진단 강화 + 빌드 체인 hardening (UAT 후속)

## 기간
2026-05-10 (단일 세션, 약 1.5시간)

## start_commit → end_commit
`cf62830` → `fd8681c`

## 트리거
사용자가 Sprint 11 fix 검증을 위해 iOS 26.4 시뮬레이터 (iPhone 17 Pro) 에서 AI 시트 진입.
배지가 "모델 다운로드 0%" 에서 stall, simctl 로그에 `[INSEOUL_LLM]` trace 0건 (silent death).

진단 결과:
1. `ios/App/App/public/assets/mediapipe-*.js` 가 `https://cdn.jsdelivr.net/...` URL 사용 — Sprint 11 task-1 (wasm self-host) 미반영 stale 번들
2. `public/wasm/` 가 `.gitignore` 만 존재 — `prebuild` (`scripts/copy-mediapipe-wasm.sh`) 한 번도 실행 안 됨
3. `dist/wasm/` 도 미생성

즉 build chain (npm run build → vite build → cap sync) 의 어느 단계에서 prebuild lifecycle hook 이 우회됐고, 누구도 검증하지 않아 stale 번들이 ios 에 deploy 됐음.

## 모드
cmux 3 task × 2 워커 페어 (max_pairs=4). Wave 1: task-1/task-2 병렬 (2쌍), Wave 2: task-3 의존 (1쌍). 각 task 는 독립 worktree (`../inseoul-worktrees/task-N-impl`) 에서 작업.

## 작업 결과

| Task | 제목 | verdict | rounds | impl_sha | merge_sha |
|---|---|---|---|---|---|
| 1 | 빌드 체인 hardening (명시 chain + vite plugin assertWasmCopied + check-bundle.sh) | pass | 1 | 634d02f | 23300cf |
| 2 | fetchModelWithProgress trace 강화 + idle timeout (download:* stages, 30s watchdog) | pass | 1 | f1b00e6 | 579a63c |
| 3 | docs/uat-troubleshooting.md 갱신 — 0% stall 진단 + sim/실기기 매트릭스 + bundle stale 식별 | pass | 1 | d041171 | fd8681c |

## 머지된 commit / push
- `23300cf` merge: s12-task-1 — build chain hardening (R1 pass, 634d02f)
- `579a63c` merge: s12-task-2 — fetchModelWithProgress trace + idle timeout (R1 pass, f1b00e6)
- `fd8681c` merge: s12-task-3 — UAT 트러블슈팅 갱신 (R1 pass, d041171)

origin/main push: `cf62830..fd8681c` fast-forward, 6 commit (3 impl + 3 merge).

## 검증 요약 (Codex Review)
- 총 task: 3
- 1라운드 통과율: 3/3 (100%)
- 평균 라운드: 1.0
- escalation: 0건
- review 파일 인덱스:
  - `.planning/sprint/12/reviews/task-1.md`
  - `.planning/sprint/12/reviews/task-2.md`
  - `.planning/sprint/12/reviews/task-3.md`
- 누적 테스트: lint 0e/0w 유지, vitest 142 tests pass (Sprint 11 의 134 + task-1 의 2 + task-2 의 6), production build OK

## 신규 결정 / 패턴 / 교훈

### 1. 빌드 체인 명시 chain — npm lifecycle hook 의존 제거 (task-1)
- Sprint 11 task-1 의 `prebuild` 스크립트가 `vite build` 직접 호출 시 우회됨 — Sprint 12 트리거의 직접 원인.
- `package.json scripts.build` 를 `bash scripts/copy-mediapipe-wasm.sh && tsc -b && vite build` 로 명시 chain. 기존 `prebuild` lifecycle hook 도 보존 (ide 통합 등 백업).
- vite plugin `assertWasmCopied` 추가 (`vite.config.ts`) — `closeBundle` hook 에서 `dist/wasm/` 6 파일 검증, 누락 시 `this.error()` fail-fast.
- `scripts/check-bundle.sh` 도 wasm 검증 step 추가.
- 단위 테스트 1건 (`src/__tests__/vite-assert-wasm-copied.test.ts`) — mock dist 디렉터리에 누락 시나리오로 plugin throw 검증.
- **함의**: lifecycle hook 신뢰 금지. critical artifact 는 (a) 빌드 명령 본문 명시 + (b) bundle assertion 의 이중 가드.

### 2. fetchModelWithProgress trace + idle timeout (task-2)
- `download:*` 6 stage 신규 emit:
  - `download:request-start` — `fetch(modelUrl)` 호출 직전 (`{ modelUrl }`)
  - `download:response` — fetch resolve 직후 (`{ status, ok, contentLength, urlAfterRedirect }`)
  - `download:first-chunk` — 첫 chunk 도달 (`{ byteLength, elapsedMs }`)
  - `download:milestone` — 0.10/0.25/0.50/0.75/0.90 경계 통과 시 (Set 으로 dedup)
  - `download:complete` — 마지막 chunk + concat (`{ totalBytes, elapsedMs }`)
  - `download:idle-timeout` — idle threshold 초과 (`{ idleMs, lastByte }`, throw 직전)
- Idle watchdog: `DOWNLOAD_IDLE_TIMEOUT_MS=30_000` 기본, 옵션 `idleTimeoutMs` override. Promise.race + AbortController + `reader.cancel()` 로 정합한 abort.
- `MediaPipeLLM.init` signature 에 `onTrace` callback 통과, `fetchModelWithProgress` 까지 forward. `llm.worker.ts` 의 `handleInit` 가 download trace 도 worker postMessage 로 main 에 전달.
- 단위 테스트 6건 추가 — trace 순서 / idle-timeout / reader.cancel spy / milestone dedup / 회귀 가드 / 상수 검증.
- **함의**: silent stall 진단의 core blocker (어디서 멈췄는지 모름) 해소. 다음 UAT 사이클에서 stage 별 root cause 즉시 식별 가능.

### 3. UAT 트러블슈팅 워크플로우 코드화 (task-3)
- `docs/uat-troubleshooting.md` 갱신:
  - "iOS 모델 다운로드 stall 진단" 섹션 신규 — simctl log filter / stale bundle grep / prebuild 검증 / check-bundle.sh / idle timeout 5단계
  - task-2 의 `download:*` stage 별 root cause 매핑 표
  - "시뮬레이터 vs 실기기 매트릭스" 섹션 — WebGPU / 메모리 한도 / 네트워크 / 콘솔 / Worker / ATS / 모델 다운로드 7항목
  - 빌드 체인 검증 명령 5단계 (npm run build → ls dist/wasm → npx cap sync ios → bundle grep → check-bundle.sh)
- `docs/llm-debugging.md` 의 trace 표에 `download:*` stage 한 줄 추가.
- **함의**: 다음 UAT 에서 stale bundle 같은 *환경 결함* 을 즉시 식별. 사용자 손작업 매뉴얼이 코드 변경 위에 동기화.

### 4. iOS 시뮬레이터에서도 simctl log 로 직접 진단 가능
- 오케스트레이터가 `xcrun simctl spawn booted log show --predicate 'composedMessage CONTAINS "INSEOUL_LLM"'` 로 시뮬레이터 콘솔 직접 grep — 사용자 스크린샷 의존 제거.
- Sprint 12 트리거 진단 단계에서 활용 — `[INSEOUL_LLM]` trace 0건 = stale 빌드 (Sprint 11 코드 미반영) 증거.
- **함의**: 사용자가 "Xcode 로그 보여드리고 싶음" 이라고 답할 때, 오케스트레이터가 직접 `xcrun simctl` 로 잡을 수 있음 (실기기는 IO 권한 한도).

### 5. iOS 시뮬레이터의 stale bundle 가 silent stall 의 진짜 원인 — 시뮬레이터 자체 결함이 아님
- 사용자가 "모델 다운이 되고있지 않아" 라고 보고했을 때 첫 의심 = 네트워크 / WKWebView / WebGPU 등 환경 요인.
- 진단 결과 = 코드 변경이 deploy 되지 않았음 (build chain 결함). Sprint 11 task-1 fix 가 ios 번들에 반영 안 됨.
- **함의**: UAT 의 첫 진단은 "deploy 가 됐는가" — bundle 안의 hash 또는 핵심 문자열 (jsdelivr vs /wasm) 로 직접 검증. 환경 의심은 그 다음.

### 6. cmux 워커 worktree 분리 패턴 정착 (Sprint 12 운용)
- 각 impl 워커가 부팅 직후 `git worktree add -b task-N-impl ../inseoul-worktrees/task-N-impl main` 로 자체 worktree 생성, 모든 작업은 그 안에서. 메인 트리는 read-only.
- 부팅 시 `git branch -D task-N-impl 2>/dev/null && git worktree prune` 로 잔재 사전 정리 (Sprint 11 처방).
- review 워커는 메인 트리 cwd 유지 (review 파일 SSOT 가 메인 트리). 직접 회귀 검증 시 `git worktree add -B task-N-review-tmp ../inseoul-worktrees/task-N-review-tmp task-N-impl` 로 임시 worktree, 검증 후 `--force` 제거.
- **함의**: cross-task 독립성 + main race 회피. Sprint 8 의 worktree race 복구 사례 재발 0건. 다음 스프린트에서 `/start` 7-A 로 자동화 검토 (S9→S13 다섯 번째 이월).

## 운영 인사이트 누적

| 영역 | 처방 | 메모 |
|---|---|---|
| build lifecycle hook 우회 결함 | npm script 본문 명시 chain + vite plugin closeBundle assertion | (Sprint 12 신규) |
| 다운로드 silent stall 진단 부재 | download:* 6 stage trace + 30s idle watchdog | (Sprint 12 신규) |
| UAT 트러블슈팅 코드화 부재 | docs/uat-troubleshooting.md 진단 섹션 + sim/실기기 매트릭스 | (Sprint 12 신규) |
| WKWebView 메모리 한도 ~1.5GB | on-device LLM ≤ 1GB int4 권장 | `feedback_ios_wkwebview_memory_limit.md` (Sprint 10) |
| review 워커 부팅 + stale ref 결합 | STOP nudge 즉시 + 잔재 브랜치 사전 정리 | `feedback_review_premature_file_write.md` (Sprint 11) |
| review SSOT = review 파일 frontmatter | cmux IPC socket 차단 인지 | `feedback_codex_review_socket_block.md` |
| review diff base = branch fork point 고정 | moving main 비교 금지 | ADR-S5-001 |
| cmux 워커 worktree 분리 | impl 워커는 `../inseoul-worktrees/task-N-impl`, review 는 main 트리 read-only | `feedback_cmux_worktree.md` |
| prompt 외부화 (~3KB+ heredoc 회피) | `.planning/sprint/{N}/prompts/*.md` 파일 | `feedback_cmux_send_payload_limit.md` |

## 이월 항목 (Sprint 13)

1. **iOS 실기기 UAT 본 수행** — Sprint 8→9→10→11→12→**13 여섯 번째 이월**. Sprint 12 fix (build chain hardening + download trace) 가 실기기에서 동작하는지 사용자 손작업 트랙 + 시뮬레이터 사이클 후 실기기 단발 검증.
2. **cmux 워커 worktree 분리 자동화** — Sprint 9→10→11→12→**13 다섯 번째 이월**. 현재 prompt 안 지시로 처리 → orchestrator 가 직접 부트스트랩 단계에 박는 정공법으로 전환.
3. **mediapipe init silent death RCA 확정** — Sprint 12 의 download:* trace 로 사용자가 다시 빌드/UAT 후 어디서 멈추는지 식별 → 다음 fix cycle 또는 종결.
4. **Sprint 12 fix 자체의 실기기 검증** — build chain hardening + idle timeout 이 실제 deploy 된 상태에서 동작하는지. 사용자 후속 빌드 결과 (npm run build → cap sync ios → Xcode 빌드 → simctl log + UI 배지 관찰).

## 참고 자료
- `.planning/sprint/12/reviews/task-1.md`, `task-2.md`, `task-3.md` — codex R1 review 본문
- `.planning/sprint/12/dispatch.json` — 워커 매니페스트
- `.planning/sprint/12/prompts/task-{1,2,3}-{impl,review}.md` — 6개 prompt 본문 (영구)
- `docs/uat-troubleshooting.md` (task-3 갱신) — UAT 진단 워크플로우
- `docs/llm-debugging.md` — Sprint 11 + Sprint 12 통합 trace map
- Sprint 11 ADR (`docs/adr/sprints/sprint-11.md`) — wasm self-host fix 가 deploy 안 된 이유 = Sprint 12 의 진단 결과
