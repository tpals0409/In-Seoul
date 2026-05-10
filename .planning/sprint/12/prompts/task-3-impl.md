# Sprint 12 / task-3 — UAT 트러블슈팅 갱신 (다운로드 0% stuck + stale bundle + sim/실기기 매트릭스)

당신은 Sprint 12 task-3 구현 워커 (Claude) 입니다.

## 0. 작업 환경 (worktree 분리 필수)

```bash
cd /Users/leokim/Desktop/leo.kim/InSeoul
git branch -D task-3-impl 2>/dev/null
git worktree prune
mkdir -p ../inseoul-worktrees
git worktree add -b task-3-impl ../inseoul-worktrees/task-3-impl main
cd ../inseoul-worktrees/task-3-impl
pwd  # 반드시 ../inseoul-worktrees/task-3-impl
```

이후 모든 작업은 worktree 내부에서. 메인 트리 cd 금지.

## 1. 트리거 / 컨텍스트

이 task 는 Wave 1 (task-1, task-2) 가 main 에 머지된 *후* 시작됩니다. 기준 base = `579a63c` (Wave 1 머지 후 HEAD).

Sprint 12 트리거:
- iOS 26.4 시뮬레이터에서 AI 시트 진입 시 배지 "모델 다운로드 0%" 에서 stall
- 진단으로 발견:
  1. `ios/App/App/public/assets/mediapipe-*.js` 가 jsdelivr URL 사용 — Sprint 11 task-1 (wasm self-host) 미반영 stale 번들
  2. `public/wasm/` 가 `.gitignore` 만 — `prebuild` (`scripts/copy-mediapipe-wasm.sh`) 한 번도 실행 안 됨
  3. `simctl log` 에 `[INSEOUL_LLM]` trace 0건 — silent death

task-1 가 빌드 체인 fail-fast 추가, task-2 가 `download:*` stage trace + idle timeout 추가. 이제 docs 가 진단 워크플로우를 코드화해야 함.

## 2. 수용 기준

`docs/uat-troubleshooting.md` 갱신. 다음 섹션 추가/보강:

### 2-A. 신규 섹션: "iOS 모델 다운로드 stall 진단"

이미 존재하는 트러블슈팅 문서에 새 섹션 (또는 기존 LLM 섹션 안 하위) 추가. 다음을 포함:

- **증상**: AiSheet 배지가 "모델 다운로드 0%" (주황) 에서 멈춤. simctl log 의 `[INSEOUL_LLM]` 항목 부재 또는 `download:` stage 가 일정 단계에서 멈춤.
- **진단 명령** (각각 명시적 출력 형태 포함):

  1. **simctl log filter** — main thread console.warn forward 추적:
     ```bash
     xcrun simctl spawn booted log show --last 10m \
       --predicate 'composedMessage CONTAINS "INSEOUL_LLM"' \
       --style compact
     ```
     기대 출력: `[INSEOUL_LLM] worker:constructing` ... `download:request-start` ... `download:first-chunk` ... `download:complete`. 어느 단계에서 멈췄는지 = root cause 단서.

  2. **stale 번들 식별** — Sprint 11 task-1 fix (wasm self-host) 가 ios 번들에 들어갔는지 검증:
     ```bash
     grep -oE "MEDIAPIPE_WASM_BASE|/wasm|jsdelivr" \
       ios/App/App/public/assets/mediapipe-*.js | sort -u
     ```
     기대: `/wasm` 만 출력. `jsdelivr` 가 출력되면 stale 빌드.

  3. **prebuild 실행 검증** — wasm 6 파일이 public/wasm 에 있는지:
     ```bash
     ls public/wasm/ | grep '^genai_' | wc -l
     ```
     기대: `6` (없으면 `npm run prebuild` 또는 `bash scripts/copy-mediapipe-wasm.sh` 실행).

  4. **번들 검증 스크립트** — task-1 의 `check-bundle.sh` 강화 활용:
     ```bash
     bash scripts/check-bundle.sh
     ```
     6 wasm 파일 누락 시 exit 1 + 진단 메시지.

  5. **idle timeout 확인** — task-2 의 watchdog 동작:
     30초 동안 chunk 미도달 시 자동 `[INSEOUL_LLM] download:idle-timeout` + worker error `init-failed: download stalled (no chunk for 30000ms)`. 배지가 stuck 인 채 30초 후 "오류 — 템플릿 답변 사용 중" 으로 전환되면 watchdog 정상 동작.

- **stage 별 root cause 매핑** — task-2 의 `download:*` trace 와 매핑한 표:

  | 마지막 trace stage | 다음에 와야 했던 stage | 의심 root cause | 확인 방법 |
  |---|---|---|---|
  | `init:fileset-ok` | `download:request-start` | fetch 도달 전 throw (host allowlist 등) | error.message 에 init-failed prefix |
  | `download:request-start` | `download:response` | TCP/TLS handshake stall, DNS, ATS | curl -v modelUrl |
  | `download:response` | `download:first-chunk` | 헤더 후 body stream 미도달 (서버 buffer hold) | response detail 의 contentLength + status |
  | `download:first-chunk` | `download:milestone(0.10)` | 첫 chunk 후 stall — WKWebView Worker fetch streaming 결함 의심 | 30초 후 `download:idle-timeout` 발생 여부 |
  | `download:milestone(0.50)` | `download:milestone(0.75)` | 진행 중 stall — 네트워크 끊김 | 시뮬레이터 호스트 Mac 네트워크 |
  | `download:complete` | `init:fetch-ok` | concat / Uint8Array 할당 throw — drop | error.message 에 'init-failed' |
  | `init:fetch-ok` | `init:gpu-ok` | LlmInference.createFromOptions throw — wasm 누락 또는 메모리 부족 | dist/wasm/ 6 파일 + 실기기 메모리 한도 (~1.5GB) |

### 2-B. 신규 섹션: "시뮬레이터 vs 실기기 매트릭스"

매트릭스 표 + 해설:

| 항목 | iOS 시뮬레이터 (iOS 26+) | 실기기 (iPhone) |
|---|---|---|
| WebGPU 가용성 | 있음 (Apple Silicon Mac 기준) — `navigator.gpu.requestAdapter()` resolves | 있음 (iOS 17+) |
| 메모리 한도 | Mac 호스트 시스템 RAM (실질 무제한) | WKWebView 1.4-1.5GB jetsam (iOS 16+) |
| 네트워크 | Mac NAT — 호스트와 동등 | cellular / wifi (CDN 지연 / TLS resumption 차이) |
| 콘솔 접근 | `xcrun simctl spawn booted log` | Xcode > Window > Devices and Simulators > Console |
| Worker 콘솔 | postMessage trace 만 (Capacitor bridge 동일) | postMessage trace 만 |
| WebGPU adapter | discrete or integrated GPU | A-series GPU |
| ATS (Info.plist) | 동일 | 동일 |
| 모델 다운로드 528MB | 빠름 (Mac 회선) | wifi/cellular 의존 |

해설 강조:
- 시뮬레이터에서 메모리 한도 때문에 죽는 케이스 *재현 불가* — 실기기 UAT 필수.
- 시뮬레이터에서 네트워크 stall 재현 시 → 실기기는 더 심함 (TLS handshake 비용 등).
- Sprint 12 트리거였던 "모델 다운로드 0%" 는 시뮬레이터에서 *stale 번들* 이 진짜 원인이었으며, 실기기 경험은 미검증 — 다음 UAT 사이클에서 확인 필요.

### 2-C. 빌드 체인 검증 명령 (task-1 출력 활용)

기존 트러블슈팅에 다음 명령 추가:

```bash
# 1. 항상 npm run build 사용 (vite build 직접 호출 금지)
npm run build

# 2. 빌드 직후 dist/wasm 검증
ls dist/wasm/ | grep '^genai_' | wc -l  # 6

# 3. iOS 번들 동기화
npx cap sync ios

# 4. 동기화 후 ios 번들 검증
grep -oE "/wasm|jsdelivr" ios/App/App/public/assets/mediapipe-*.js | sort -u  # /wasm

# 5. 모든 검증 한 번에
bash scripts/check-bundle.sh
```

## 3. 스코프 파일 (이 외 수정 금지)

- `docs/uat-troubleshooting.md` — 신규 섹션 추가 + 기존 섹션 보강
- (선택) `docs/llm-debugging.md` — task-2 의 새 `download:*` stage 매핑 정도. 단, 본 task 의 *주* 산출물은 uat-troubleshooting.md. llm-debugging.md 는 이미 trace 표가 있으므로 신규 stage 한 줄만 추가하는 정도가 적정.

**NEVER**: 코드 변경 (`src/`, `scripts/`, `vite.config.ts`, `package.json`) 절대 금지. test 추가 금지.

## 4. 수용 검증

- 신규 섹션 markdown 정상 렌더링 (heading 계층, 표 구문, 코드 블록 fence)
- 진단 명령 실제 실행 가능 (호환 syntax — bash + macOS xcrun)
- stage 별 root cause 표가 task-2 의 실제 emit 단계와 일치
- sim/실기기 매트릭스가 메모리 (`feedback_ios_wkwebview_memory_limit.md`) 등 기존 메모리 처방과 모순 없음
- `npm run lint` 가 docs 만 변경이라 영향 없음 (lint 통과 = no-op)
- `npm test` 가 docs 변경에 영향 없음 (134+6 = 140 그대로 통과)

## 5. 워크플로우

1. `docs/uat-troubleshooting.md` 읽기 → 기존 구조 파악 → 적절한 섹션 위치 결정
2. 신규/보강 섹션 작성
3. (선택) `docs/llm-debugging.md` 의 trace 표에 `download:*` stage 한 줄 추가
4. lint / test pass 확인 (docs 만이라 no-op 통과)
5. commit (브랜치 = `task-3-impl`, base = `579a63c`)
6. 완료 시:
   ```
   [IMPL_DONE] task-3 commit=<short_sha> ready_for_review
   ```
   `cmux display-message -p "[IMPL_DONE] task-3"`

## 6. 주의사항

- review pass 전까지 main 머지 금지
- 코드 변경 절대 금지 (다른 task 영역)
- review 파일 read-only
- 모든 작업은 `../inseoul-worktrees/task-3-impl` 안에서만
