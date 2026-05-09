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

**옵션 B 채택**. 자동화 가능한 두 영역만 스크립트화:

### 1. `scripts/mobile-launch.sh ios|android`
- 시뮬레이터/에뮬레이터 부팅 → `cap sync` → 네이티브 빌드 → install → launch 일괄.
- 사용자가 `npm run mobile:ios` 한 번에 실행.
- 실기기 (USB) 는 본 스크립트 대상이 아님 — Xcode/Android Studio Run 또는 별도 `adb install`.

### 2. `scripts/mobile-trace.sh ios|android`
- console / logcat 스트림 캡처 → `.planning/sprint/4/runs/{platform}-{ts}.log`.
- mediapipe 모델 다운로드 / 추론 흔적 추적용.

### 3. `scripts/mobile-mem-measure.sh ios|android`
- 시뮬레이터/에뮬레이터의 앱 PID 메모리 샘플링 → JSON.
- 실기기 측정 (Xcode Instruments / chrome://inspect) 은 사용자 UAT.

### Phase B 사용자 UAT 영역 (자동화 안 함)
- 실기기 USB 연결 + signing + install
- mediapipe 응답 품질 평가 (사람 눈)
- 실기기 메모리 GUI 캡처 (Instruments / Chrome DevTools)
- 결과 기록 (양식은 `.planning/sprint/4/UAT-CHECKLIST.md`)

## 근거

- **호스트 GUI 의존**: Xcode signing wizard, 디바이스 trust 다이얼로그, 자동화 매우 어려움.
- **mediapipe 응답 품질**: 정량 메트릭 없음 (RAG 답변의 사실 정확도 + 자연성). 사람 평가 필요.
- **시뮬레이터 한계**: host RAM 공유로 메모리 측정값이 실기기와 다름. 시뮬레이터 측정은 회귀 가드, 실기기 측정은 사실 데이터.
- **사용자 시간 vs 워커 시간**: 시뮬레이터 자동화는 5~10 회 반복 측정 시 가치, 실기기는 첫 검증 후 빈도 낮음.

## 결과 (UAT 완료 후 채움)

### 시뮬레이터/에뮬레이터 측정 결과
- (TBD)

### 실기기 측정 결과 (Phase B)
- iOS: (TBD)
- Android: (TBD)

### 발견된 한계 / 개선 사항
- (TBD)

## 영향

- Sprint 5+ 에서도 동일 패턴 — 실기기 의존 작업은 UAT 분리.
- mediapipe 모델 다운로드 정책 (강제 vs lazy) 은 UAT 결과 보고 별도 ADR 결정.
