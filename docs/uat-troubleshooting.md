# UAT Troubleshooting — 실기기 설치 / 실행 막힘 해결

> Sprint 6 / Phase B UAT 대상. 첫 사용자가 iPhone / Android 실기기에서 InSeoul 을 install + 실행하다 자주 마주치는 에러 카탈로그. 시뮬레이터/에뮬레이터 (`npm run mobile:ios` / `mobile:android`) 단계는 [README — 모바일 빌드](../README.md#모바일-빌드-capacitor--sprint-3) 참조.
>
> 항목별 포맷: **증상** → **원인** → **해결책**.

---

## 1. iOS — "신뢰할 수 없는 개발자" 차단 (cert untrusted)

**증상**
- `npm run mobile:ios:device` 후 단말에 앱 아이콘은 깔리지만, 실행 시 "신뢰할 수 없는 개발자" 또는 "엔터프라이즈 앱을 신뢰할 수 없습니다" 다이얼로그가 뜨고 즉시 종료.
- Xcode console: `The operation couldn't be completed. Unable to launch <bundle id> because it has an invalid code signature, inadequate entitlements, or its profile has not been explicitly trusted by the user.`

**원인**
- Free Apple ID (personal team) 로 서명한 앱은 iOS 가 첫 실행 시 자동 신뢰하지 않는다. 사용자가 단말 설정에서 명시적으로 신뢰해야 한다.
- 7일 후 personal team cert 자체가 만료되어 같은 다이얼로그가 다시 뜬다 (재서명 + 재설치 필요).

**해결책**
1. iPhone `설정 > 일반 > VPN 및 기기 관리` (구버전: `프로필 및 기기 관리`) 진입.
2. `개발자 앱` 섹션에서 본인 Apple ID 선택 → **신뢰** → 다시 한 번 확인 다이얼로그 → **신뢰**.
3. 홈 화면으로 돌아와 앱 재실행. 7일 만료 후 같은 증상이면 Xcode 에서 다시 빌드/install (`npm run mobile:ios:device`).

---

## 2. Android — `adb devices` 에 unauthorized 표시 (USB unauthorized)

**증상**
- `adb devices` 결과:
  ```
  List of devices attached
  R5CT12345ABC    unauthorized
  ```
- `npm run mobile:android:device` 실행 시 `error: device unauthorized. This adb server's $ADB_VENDOR_KEYS is not set` 또는 `INSTALL_FAILED_USER_RESTRICTED`.

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
1. **네트워크 점검**: 단말을 VPN/사내망에서 분리 후 일반 셀룰러 또는 가정 Wi-Fi 로 재시도. `huggingface.co` / `storage.googleapis.com` 접근 가능해야 한다.
2. **storage 확보**: 단말 `설정 > 저장공간` 에서 잔여 공간 ≥ 2 GB 확보 (사진/영상 정리, 다른 앱 캐시 삭제). Android 는 `adb shell df /data` 로 host 에서도 확인 가능.
3. 둘 다 OK 인데 실패하면 앱을 완전히 삭제 후 재설치 (`npm run mobile:ios:device` / `mobile:android:device`) — 부분 다운로드 캐시가 corrupt 일 수 있음.

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

## 참고
- 시뮬레이터/에뮬레이터 단계 issue: README — 자동화 스크립트 (Sprint 4) 섹션.
- 측정 결과 첨부 위치: `.planning/sprint/{N}/measurements/{platform}-{label}.json`.
- UAT 체크리스트 (Phase B 전체 흐름): [`.planning/sprint/4/UAT-CHECKLIST.md`](../.planning/sprint/4/UAT-CHECKLIST.md).
