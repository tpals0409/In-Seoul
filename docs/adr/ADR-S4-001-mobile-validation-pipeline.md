# ADR-S4-001: 모바일 검증 파이프라인 — 자동화 스크립트 + UAT 분담

**상태**: 채택 (Sprint 4)
**날짜**: 2026-05-09
**대체**: 없음
**관련**: ADR-S3-001 (Capacitor 채택)

## 컨텍스트

Sprint 3 에서 Capacitor 8.3.3 으로 iOS/Android 패키징 환경을 구축했으나, 실제 검증 (빌드 → install → 실행 → mediapipe LLM 추론 → 메모리 측정) 이 이월됨. 이 검증을 어떻게 수행할지 — 어디까지 자동화하고 어디부터 사용자 손에 맡길지 — 결정 필요.

## 옵션 비교

| 옵션 | 자동화 범위 | 사용자 부담 | cmux 워커 적합도 |
|---|---|---|---|
| A. 풀 자동화 (실기기 OTA 포함) | 100% | 거의 없음 | **불가** — 워커가 USB/signing/사람 눈 평가 불가 |
| B. 시뮬레이터/에뮬레이터만 자동화 | ~70% | 실기기 검증 + 결과 기록 | **적합** — 스크립트화 가능 |
| C. 0 자동화 (사용자 매뉴얼) | 0% | 전체 | 워커 불요, 사용자 시간 큼 |

## 결정

**옵션 B 채택**. 자동화 가능한 세 영역을 스크립트화:

### 1. `scripts/mobile-launch.sh ios|android [--device <name>] [--dry-run]`
- 시뮬레이터/에뮬레이터 부팅 → `cap sync` → 네이티브 빌드 → install → launch 일괄.
- iOS: `xcrun simctl bootstatus` polling + bounded timeout (Round 2 fix), `xcodebuild -workspace App.xcworkspace`, `simctl install`, `simctl launch`.
- Android: AVD 부팅 + `sys.boot_completed` polling (120초 timeout), `gradlew assembleDebug`, `adb install -r`, `adb shell monkey`.
- 사용자가 `npm run mobile:ios` 한 번에 실행.
- 실기기 (USB) 는 본 스크립트 대상이 아님 — Xcode/Android Studio Run 또는 별도 `adb install`.
- npm scripts: `mobile:ios`, `mobile:android`, `mobile:dry:ios`, `mobile:dry:android`.

### 2. `scripts/mobile-trace.sh ios|android [--duration <sec>] [--filter <regex>]`
- console / logcat 스트림 캡처 → `.planning/sprint/4/runs/{platform}-{ts}.log`.
- iOS: `xcrun simctl spawn booted log stream --predicate ...`.
- Android: `adb logcat -v time | grep -E '(Capacitor|Console|chromium|MediaPipe)'`.
- mediapipe 모델 다운로드 / 추론 흔적 추적용.
- npm scripts: `mobile:trace:ios`, `mobile:trace:android`.

### 3. `scripts/mobile-mem-measure.sh ios|android [--samples N] [--interval S] [--label TAG]`
- 시뮬레이터/에뮬레이터의 앱 PID 메모리 샘플링 → JSON.
- iOS: `xcrun simctl spawn booted vmmap`/`footprint` 파싱.
- Android: `adb shell dumpsys meminfo {package}` 파싱 (`TOTAL PSS`, `Native Heap`, `EGL mtrack`).
- 결과 스키마: `{platform, app_id, label, samples: [{ts, rss_mb, dirty_mb}], peak_rss_mb, mediapipe_loaded, host}`.
- 출력: `.planning/sprint/4/measurements/{platform}-{label or ts}.json`.
- npm scripts: `mobile:mem:ios`, `mobile:mem:android`.
- 실기기 측정 (Xcode Instruments / chrome://inspect) 은 사용자 UAT.

### Phase B 사용자 UAT 영역 (자동화 안 함)
- 실기기 USB 연결 + signing + install
- mediapipe 응답 품질 평가 (사람 눈)
- 실기기 메모리 GUI 캡처 (Instruments / Chrome DevTools)
- 결과 기록 (양식은 [`.planning/sprint/4/UAT-CHECKLIST.md`](../../.planning/sprint/4/UAT-CHECKLIST.md))

## 근거

- **호스트 GUI 의존**: Xcode signing wizard, 디바이스 trust 다이얼로그, 자동화 매우 어려움.
- **mediapipe 응답 품질**: 정량 메트릭 없음 (RAG 답변의 사실 정확도 + 자연성). 사람 평가 필요.
- **시뮬레이터 한계**: host RAM 공유로 메모리 측정값이 실기기와 다름. 시뮬레이터 측정은 회귀 가드, 실기기 측정은 사실 데이터.
- **사용자 시간 vs 워커 시간**: 시뮬레이터 자동화는 5~10 회 반복 측정 시 가치, 실기기는 첫 검증 후 빈도 낮음.

## 검증 (Sprint 4 Phase A 종료 시점)

- ✅ `scripts/mobile-launch.sh` 작성 + `bash -n` 통과 + `npm run mobile:dry:{ios,android}` exit 0 + 명령 echo.
- ✅ `scripts/mobile-trace.sh` 작성 + dry 검증.
- ✅ `scripts/mobile-mem-measure.sh` 작성 + `--help` 작동.
- ✅ npm scripts 등록 (`mobile:*`).
- ✅ Codex review 가 iOS boot readiness 결함 검출 (Round 1 reject) → fix (Round 2 pass). dry-run 만으로는 검출 어려운 결함을 review prompt 의 "추가 체크" 항목으로 잡음.

## 결과 (UAT 완료 후 채움)

### 시뮬레이터/에뮬레이터 측정 결과
- (TBD — Phase B UAT)

### 실기기 측정 결과 (Phase B)
- iOS: (TBD)
- Android: (TBD)

### 발견된 한계 / 개선 사항
- (TBD)

## 영향

- Sprint 5+ 에서도 동일 패턴 — 실기기 의존 작업은 UAT 분리.
- mediapipe 모델 다운로드 정책 (강제 vs lazy) 은 UAT 결과 보고 별도 ADR 결정.
- review 워커의 "추가 체크" 항목을 sprint 마다 진지하게 작성할 가치 입증 — 향후 review prompt 템플릿에 명시.
