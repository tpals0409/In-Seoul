# UAT Troubleshooting — 실기기 설치 / 실행 막힘 해결

> Sprint 6 / Phase B UAT 대상. 첫 사용자가 iPhone / Android 실기기에서 InSeoul 을 install + 실행하다 자주 마주치는 에러 카탈로그. 시뮬레이터/에뮬레이터 (`npm run mobile:ios` / `mobile:android`) 단계는 [README — 모바일 빌드](../README.md#모바일-빌드-capacitor--sprint-3) 참조.
>
> 항목별 포맷: **증상** → **원인** → **해결책**.

---

## 1. iOS — "신뢰할 수 없는 개발자" 차단 (cert untrusted)

**증상**
- `npx cap run ios --target <UDID>` 또는 Xcode Run 으로 install 직후 단말에 앱 아이콘은 깔리지만, 실행 시 "신뢰할 수 없는 개발자" 또는 "엔터프라이즈 앱을 신뢰할 수 없습니다" 다이얼로그가 뜨고 즉시 종료.
- Xcode console: `The operation couldn't be completed. Unable to launch <bundle id> because it has an invalid code signature, inadequate entitlements, or its profile has not been explicitly trusted by the user.`

**원인**
- Free Apple ID (personal team) 로 서명한 앱은 iOS 가 첫 실행 시 자동 신뢰하지 않는다. 사용자가 단말 설정에서 명시적으로 신뢰해야 한다.
- 7일 후 personal team cert 자체가 만료되어 같은 다이얼로그가 다시 뜬다 (재서명 + 재설치 필요). Xcode 26.x 기준 personal team 의 provisioning profile 유효기간은 여전히 **7일** 로 고정 (paid Apple Developer Program 만 1년). 따라서 UAT 가 일주일 이상 늘어지면 *주 단위* 로 Xcode Run 재install 이 필요하다.

**해결책**
1. iPhone `설정 > 일반 > VPN 및 기기 관리` (구버전: `프로필 및 기기 관리`) 진입.
2. `개발자 앱` 섹션에서 본인 Apple ID 선택 → **신뢰** → 다시 한 번 확인 다이얼로그 → **신뢰**.
3. 홈 화면으로 돌아와 앱 재실행. 7일 만료 후 같은 증상이면 Xcode (또는 `npx cap run ios --target <UDID>`) 로 재빌드 + 재install — cert 가 갱신되면서 트러스트 단계도 다시 거쳐야 한다.

---

## 2. Android — `adb devices` 에 unauthorized 표시 (USB unauthorized)

**증상**
- `adb devices` 결과:
  ```
  List of devices attached
  R5CT12345ABC    unauthorized
  ```
- `npx cap run android --target <serial>` 실행 시 `error: device unauthorized. This adb server's $ADB_VENDOR_KEYS is not set` 또는 `INSTALL_FAILED_USER_RESTRICTED`.

**원인**
- 단말에서 USB 디버깅 권한 팝업을 아직 허용하지 않았다 (또는 케이블만 꽂고 화면을 안 봤다).
- `adb` 호스트 키가 단말의 신뢰 목록에 없는 상태.

**해결책**
1. 케이블 분리 후 재연결 → 단말 화면에 뜨는 "USB 디버깅을 허용하시겠습니까?" 팝업에서 **이 PC 에서 항상 허용** 체크 → **허용**.
2. 팝업이 안 뜨면 `설정 > 개발자 옵션 > USB 디버깅` 토글을 OFF → ON 으로 다시 켜고 재연결.
3. 그래도 unauthorized 면 호스트에서 `adb kill-server && adb start-server` 후 `adb devices` 재확인 (`device` 표시 필요).

---

## 3. mediapipe 모델 다운로드 실패 (네트워크 / 디스크 부족)

**증상**
- 앱은 실행되지만 채팅/추론 시 "모델 로딩 실패" 토스트 또는 무한 로딩.
- logcat (`npm run mobile:trace:android`) / iOS unified log (`npm run mobile:trace:ios`) 에:
  - `MediaPipe: failed to download model` / `HTTP 403` / `HTTP 0 (timeout)`
  - 또는 `No space left on device` / `ENOSPC` / `disk full`.

**원인**
- 첫 실행에서 mediapipe (`tasks-genai`) 가 `gemma-2b-it-cpu-int4` 같은 weight 파일 (수백 MB) 을 단말 storage 로 다운로드하는데, 네트워크 차단 (회사 Wi-Fi / VPN 의 GFE 차단) 또는 단말 잔여 storage 부족 (보통 1~2 GB 이상 필요) 으로 실패.
- iOS 의 경우 sandbox 한도, Android 의 경우 `/data/data/<pkg>/files` 파티션 제약.

**해결책**
1. **네트워크 점검**: 단말을 VPN/사내망에서 분리 후 일반 셀룰러 또는 가정 Wi-Fi 로 재시도. mediapipe 는 호스트 두 곳을 사용하며, *어느 한 쪽만 차단돼도* 실패하므로 두 호스트를 분리해서 점검:
   - **`huggingface.co` 차단** (사내 정책에서 가장 흔함): 셀룰러 핫스팟 또는 가정 Wi-Fi 로 우회. 회사 VPN 의 SSL inspection 이 HuggingFace 의 LFS redirect 를 깨는 케이스가 있어 VPN 자체 분리도 시도. logcat / iOS log 의 `failed to download model` 직전 줄에 `huggingface.co` host 가 찍히면 이쪽.
   - **`storage.googleapis.com` 차단** (GFE / Google CDN 차단 환경): mediapipe 의 일부 weight shard 는 Google CDN 에서 받는다. HuggingFace 가 풀려도 이쪽이 막히면 `HTTP 0 (timeout)` 이 다발한다. 회사 방화벽 allowlist 에 `*.googleapis.com` 추가 또는 셀룰러로 우회. timeout 자체가 짧다고 의심되면 `VITE_MEDIAPIPE_FETCH_TIMEOUT_MS` (또는 빌드 환경의 fetch timeout 설정) 를 평소의 2~3배로 올려 재빌드 후 재시도 — 모바일 셀룰러에서 수백 MB 다운로드는 5분 이상 걸릴 수 있다.
2. **storage 확보**: 단말 `설정 > 저장공간` 에서 잔여 공간 ≥ 2 GB 확보 (사진/영상 정리, 다른 앱 캐시 삭제). Android 는 `adb shell df /data` 로 host 에서도 확인 가능.
3. 둘 다 OK 인데 실패하면 앱을 완전히 삭제 후 재설치 (iOS: Xcode Run 또는 `npx cap run ios --target <UDID>` / Android: `npx cap run android --target <serial>`) — 부분 다운로드 캐시가 corrupt 일 수 있음.

---

## 4. OOM / 앱 강제 종료 (실기기 RAM 한계)

**증상**
- 첫 추론 시작 직후 또는 두 번째 메시지에서 앱이 통보 없이 종료 (홈 화면으로 튕김).
- `npm run mobile:mem:ios` / `mobile:mem:android` 측정값에서 `pss_mb` 또는 `rss_mb` 가 단말 총 RAM 의 약 60% 를 넘어가는 시점에 종료.
- iOS unified log: `Jetsam` / `memory pressure` / `Killed by jetsam`. Android logcat: `lowmemorykiller` / `Background concurrent copying GC freed ... LOS objects` 직후 프로세스 종료.

**원인**
- mediapipe LLM (gemma-2b int4) 자체가 cold load + 첫 추론 peak 에서 1.5~2 GB RSS 를 쓴다. RAM 4 GB 이하 단말 (구형 iPhone SE, 저가 Android) 은 OS 가 메모리 압박을 감지하고 강제 종료.
- 백그라운드에서 다른 무거운 앱 (카메라, 게임) 이 떠 있을 때 더 빨리 트리거.

**해결책**
1. **백그라운드 앱 정리**: 단말의 멀티태스커에서 InSeoul 외 모든 앱을 swipe-out 한 뒤 재시도.
2. **단말 재부팅**: 메모리 단편화/리크가 누적된 경우 효과적.
3. **단말 사양이 부족**한 경우 (RAM ≤ 4 GB): 현재 sprint 에서는 회피책 없음 — Sprint 7+ 의 양자화/모델 경량화 (2B → 1B int4, 또는 distill) 트랙에서 다룬다. UAT 결과에 단말 모델 + RAM + 종료 시점 (`mobile:mem:*` JSON) 을 첨부하면 다음 sprint 우선순위에 반영.

---

## 5. LLM backend 미설정으로 production build 즉시 실패 (Sprint 8 P0 fix 후 동작)

**증상**
- `npm run build` (또는 `npx cap sync` 직전 build 단계) 가 다음 에러로 즉시 종료:
  ```
  [vite] assertLlmBackend: VITE_LLM_BACKEND is required for production builds
  ```
- 또는 더 일반적으로 `Error: VITE_LLM_BACKEND must be one of "mediapipe" | "ollama"` 가 vite.config.ts 호출 시 throw.
- Capacitor sync 이전 단계에서 멈추므로 `ios/` / `android/` 의 `public/` 이 갱신되지 않고, Xcode / Android Studio 에서 띄워도 *이전 build* 가 잡혀 혼란.

**원인**
- Sprint 8 P0 fix (`feat(sprint-8/task-1) 6ede09e` + `fix(sprint-8/task-1) 51aec1d`) 로 `vite.config.ts` 의 `assertLlmBackend` 가 production 빌드에서 `VITE_LLM_BACKEND` 환경변수 존재를 fail-fast 로 강제. Sprint 7 Finding 5 (백엔드 미설정 → 모든 응답이 template fallback 으로 귀결됐는데 빌드는 성공해서 문제를 못 잡음) 회귀 방지용.
- `.env.production` 가 누락됐거나, 변수 라인이 주석 처리됐거나, CI/빌드 환경에서 `VITE_LLM_BACKEND` 가 export 되지 않은 상태.

**해결책**
1. **`.env.production` 라인 한 줄 확인**: 저장소 루트에서
   ```
   cat .env.production | grep VITE_LLM_BACKEND
   ```
   결과가 `VITE_LLM_BACKEND=mediapipe` 또는 `VITE_LLM_BACKEND=ollama` 인지 확인. 없으면 한 줄 추가 후 다시 빌드.
2. **빌드 환경 override**: CI / 호스팅 dashboard 에서 빌드를 돌릴 때는 `.env.production` 의 기본값 (`mediapipe`) 을 그대로 두고, 실제 모델 weight URL (`VITE_GEMMA_MODEL_URL`) 만 secret 으로 주입하는 패턴이 표준. ollama 로 override 하려면 빌드 명령 앞에 `VITE_LLM_BACKEND=ollama npm run build`.
3. **template fallback 만 측정하고 싶을 때**: `VITE_LLM_BACKEND=mediapipe` 는 두되 `VITE_GEMMA_MODEL_URL` 은 비워두면 init 단계에서 throw → AiSheet 가 "템플릿 모드" 라벨 노출. 이 경우는 *의도적 fallback* 이므로 build 는 성공해야 정상 — `assertLlmBackend` 가 throw 하면 그건 backend 변수 자체가 없는 것이므로 1번부터 다시 점검.

> 회귀 회피: UAT 측정 시작 전 항상 `.planning/sprint/<N>/uat-results.md` 의 *사전 점검* 블록을 먼저 통과시킨 뒤 측정에 들어간다.

---

## 6. iOS 모델 다운로드 "0%" stall 진단 (Sprint 12)

> Sprint 12 트리거. iOS 26.4 시뮬레이터에서 AiSheet 진입 시 배지가 "모델 다운로드 0%" (주황) 에서 멈추고, `simctl log` 의 `[INSEOUL_LLM]` 항목이 0건이거나 `download:` 단계에서 멈추는 silent-death 패턴. 동일 증상의 진단 트리.

**증상**
- AiSheet 배지가 "모델 다운로드 0%" 에서 stall, progress bar 미증가.
- `xcrun simctl spawn booted log show ... INSEOUL_LLM` 출력이 0건이거나 `download:request-start` / `download:response` 등 특정 단계에서 멈춘 채 다음 stage 가 도달하지 않음.
- Capacitor reload 무한 루프 (`WebProcessProxy::didClose`) 가 같이 보이면 메모리 한도 초과 가능성 (섹션 4 참조).

### 6-A. 진단 명령

#### 1) simctl log filter — main thread console.warn forward 추적

```bash
xcrun simctl spawn booted log show --last 10m \
  --predicate 'composedMessage CONTAINS "INSEOUL_LLM"' \
  --style compact
```

기대 출력 (정상 경로): `worker:constructing` … `init:fileset-ok` … `download:request-start` … `download:response` … `download:first-chunk` … `download:milestone(0.10)` … `download:complete` … `init:fetch-ok` … `init:gpu-ok` → `ready`.

**어느 단계에서 멈췄는지가 root cause 의 1차 단서.** stage 매핑은 6-B 참조.

#### 2) stale 번들 식별 — Sprint 11 task-1 (wasm self-host) 가 ios 번들에 들어갔는지

```bash
grep -oE "MEDIAPIPE_WASM_BASE|/wasm|jsdelivr" \
  ios/App/App/public/assets/mediapipe-*.js | sort -u
```

기대: `/wasm` 만 출력. `jsdelivr` 가 출력되면 *stale 빌드* — `npm run build` 이후 `npx cap sync ios` 가 빠진 상태. 6-C 의 빌드 체인 명령으로 재동기화.

#### 3) prebuild 실행 검증 — wasm 6 파일이 `public/wasm/` 에 복사됐는지

```bash
ls public/wasm/ | grep '^genai_' | wc -l
```

기대: `6`. 0 이면 `prebuild` 가 한 번도 안 돌아간 상태 — 다음 명령으로 복구:

```bash
npm run prebuild        # 또는
bash scripts/copy-mediapipe-wasm.sh
```

`public/wasm/` 는 `.gitignore` 로 제외되므로 fresh clone / CI 환경마다 재실행 필요.

#### 4) 번들 검증 스크립트 — task-1 의 `check-bundle.sh` 강화 활용

```bash
bash scripts/check-bundle.sh
```

`dist/wasm/` 에 6 wasm 파일 (`genai_wasm_internal.{js,wasm}`, `genai_wasm_module_internal.{js,wasm}`, `genai_wasm_nosimd_internal.{js,wasm}`) 이 모두 존재하는지 fail-fast 로 검증. 누락 시 exit 1 + 진단 메시지 (`해결: npm run build 또는 bash scripts/copy-mediapipe-wasm.sh 재실행`) 출력.

#### 5) idle timeout 확인 — task-2 의 watchdog 동작

`fetchModelWithProgress` 가 첫 chunk 도달 후 30 초 동안 다음 chunk 미수신 시 자동으로 `[INSEOUL_LLM] download:idle-timeout` trace + worker error `init-failed: download stalled (no chunk for 30000ms)` 로 종료시킨다.

배지가 "모델 다운로드 0%" 에서 정확히 30 초 후 "오류 — 템플릿 답변 사용 중" 으로 전환되면 watchdog 정상 동작 = root cause 가 *서버/네트워크 stream stall*. simctl log 의 `download:idle-timeout` detail 의 `lastByte` 로 어디까지 받았는지 확인.

### 6-B. stage 별 root cause 매핑 표

`@mediapipe/tasks-genai` init 흐름의 각 trace stage 에서 다음 stage 로 넘어가지 못하면 그 사이에서 죽은 것. 표의 stage 명은 task-2 의 실제 emit 명 (`mediapipe.ts` `fetchModelWithProgress` + `MediaPipeLLM.init`).

| 마지막 trace stage | 다음에 와야 했던 stage | 의심 root cause | 확인 방법 |
|---|---|---|---|
| `init:fileset-ok` | `download:request-start` | fetch 도달 전 throw — `assertAllowedModelHost` 거부 등 | error.message 에 `init-failed` prefix |
| `download:request-start` | `download:response` | TCP/TLS handshake stall, DNS, ATS 차단 | `curl -v <modelUrl>` 로 호스트 도달성 확인 |
| `download:response` | `download:first-chunk` | 헤더 후 body stream 미도달 (서버 buffer hold) | `download:response` detail 의 `contentLength` + `status` |
| `download:first-chunk` | `download:milestone(0.10)` | 첫 chunk 후 stall — WKWebView Worker fetch streaming 결함 의심 | 30 초 후 `download:idle-timeout` 발생 여부 |
| `download:milestone(0.50)` | `download:milestone(0.75)` | 진행 중 stall — 네트워크 끊김 | 시뮬레이터 호스트 Mac 네트워크 / `download:idle-timeout` 의 `lastByte` |
| `download:complete` | `init:fetch-ok` | concat / `Uint8Array` 할당 throw — drop | error.message 에 `init-failed` |
| `init:fetch-ok` | `init:gpu-ok` | `LlmInference.createFromOptions` throw — wasm 파일 누락 또는 메모리 부족 | `dist/wasm/` 6 파일 + 실기기 메모리 한도 (~1.5GB, 섹션 4) |

> milestone boundaries 는 `[0.10, 0.25, 0.50, 0.75, 0.90]` (`mediapipe.ts:MILESTONE_BOUNDARIES`). 각 boundary 통과 시 한 번씩 emit.

### 6-C. 빌드 체인 검증 명령 (task-1 출력 활용)

stale 번들 / wasm 누락이 0% stall 의 가장 흔한 원인이므로, UAT 사이클 시작 전에 다음 5단계를 한 번 흘려 회귀를 차단한다. **항상 `npm run build` 사용 — `vite build` 직접 호출 금지** (task-1 의 prebuild fail-fast 우회).

```bash
# 1. 항상 npm run build 사용 (vite build 직접 호출 금지)
npm run build

# 2. 빌드 직후 dist/wasm 검증
ls dist/wasm/ | grep '^genai_' | wc -l   # 기대: 6

# 3. iOS 번들 동기화
npx cap sync ios

# 4. 동기화 후 ios 번들 검증
grep -oE "/wasm|jsdelivr" ios/App/App/public/assets/mediapipe-*.js | sort -u
# 기대: /wasm 만. jsdelivr 가 보이면 stale.

# 5. 모든 검증 한 번에
bash scripts/check-bundle.sh
```

`check-bundle.sh` 는 `dist/wasm/` 6 파일 누락을 fail-fast 하므로 4-5번이 실패하면 1-2번부터 재실행.

---

## 7. 시뮬레이터 vs 실기기 매트릭스

LLM 다운로드/추론 흐름의 환경별 차이. UAT 결과 해석 시 어느 환경의 데이터인지 명시 + 실기기 검증 누락 항목 식별용.

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

**해석 메모**
- 시뮬레이터에서는 WKWebView 메모리 한도가 사실상 풀려 있어 *메모리 초과로 죽는 케이스 (섹션 4 / Sprint 10 Gemma-4 1.86GB) 를 재현할 수 없다.* 실기기 UAT 가 필수이며, 시뮬레이터 통과를 "갑판 오른" 신호로 오해하면 안 된다.
- 시뮬레이터에서 네트워크 stall (`download:first-chunk` 후 idle-timeout 등) 이 재현되면 실기기는 더 심하게 나타난다 (TLS handshake 비용, cellular packet loss). 시뮬레이터에서 한 번이라도 보이면 실기기 회귀 가능성을 높게 잡는다.
- Sprint 12 트리거였던 "모델 다운로드 0% stall" 은 시뮬레이터에서 *stale 번들* 이 진짜 원인이었으며, 실기기 경험은 미검증 — 다음 UAT 사이클에서 재현 여부를 확인해야 한다 (시뮬레이터 5-10 분 smoke 가 실기기 1-2 시간 헛수고를 막는 패턴은 Sprint 7 finding 5건에서 확인됨).

---

## 참고
- 시뮬레이터/에뮬레이터 단계 issue: README — 자동화 스크립트 (Sprint 4) 섹션.
- 측정 결과 첨부 위치: `.planning/sprint/{N}/measurements/{platform}-{label}.json`.
- UAT 체크리스트 (Phase B 전체 흐름): [`.planning/sprint/4/UAT-CHECKLIST.md`](../.planning/sprint/4/UAT-CHECKLIST.md).
