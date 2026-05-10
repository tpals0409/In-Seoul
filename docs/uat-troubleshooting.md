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

## 참고
- 시뮬레이터/에뮬레이터 단계 issue: README — 자동화 스크립트 (Sprint 4) 섹션.
- 측정 결과 첨부 위치: `.planning/sprint/{N}/measurements/{platform}-{label}.json`.
- UAT 체크리스트 (Phase B 전체 흐름): [`.planning/sprint/4/UAT-CHECKLIST.md`](../.planning/sprint/4/UAT-CHECKLIST.md).
