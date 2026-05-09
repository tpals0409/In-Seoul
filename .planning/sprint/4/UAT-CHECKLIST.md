# Sprint 4 — Phase B UAT 체크리스트

> **사용자 작업** — 자동화 불가능. 진행 후 결과를 메인 세션에 알려주시면 ADR-S4-001 + sprint-4.md 에 정리합니다.
>
> Phase A (cmux 워커, task-1~3) 가 모두 `pass` 된 후 진행하세요.

## 사전 준비

- [ ] `s4-task-1-impl` (또는 main 통합본) 워킹 트리에서 작업.
- [ ] `npm install` 완료, `npx cap sync` 완료.
- [ ] iPhone + Android 실기기 + USB 케이블 + 충전.
- [ ] 인터넷 (mediapipe 모델 1~2GB 다운로드 필요).
- [ ] 측정용 메모장 또는 `.planning/sprint/4/uat-results.md` 새 파일 준비.

---

## task-4 — iPhone 실기기 검증

### 단계
- [ ] **1. signing**: Xcode > `ios/App/App.xcworkspace` 열고, App target > Signing & Capabilities > Team 을 개인 Apple ID 로 설정 (무료 dev cert).
- [ ] **2. 디바이스 trust**: iPhone 처음 USB 연결 시 "이 컴퓨터를 신뢰하시겠습니까?" 승인. 설정 > 일반 > VPN 및 기기 관리 > 개발자 앱 신뢰.
- [ ] **3. install + run**: Xcode 좌상단 디바이스 선택 > Run (▶). 빌드 + install 성공 + 앱 자동 실행 확인.
- [ ] **4. mediapipe 모델 다운로드**: 앱 내 첫 사용 시점에 모델 다운로드 진행 (예상 1~2GB, 수 분 소요). 진행률 또는 "준비 완료" 확인.
- [ ] **5. RAG 응답 검증**: 1건 이상 질의 (예: "용산구청 외국인 등록 방법") → 응답 생성 정상.
- [ ] **6. 메모리 측정**: Xcode 상단 Debug > Memory Graph 또는 Instruments > Allocations. mediapipe 추론 직후 peak RSS / dirty 기록.

### 기록 양식
```
host:           iPhone <model> / iOS <version>
xcode_version:  26.4.1
build_time:     <분>:<초>
install_size:   <MB>
model_download: <MB> in <초>
peak_rss_mb:    <숫자>
peak_dirty_mb:  <숫자>
rag_response_quality: pass|partial|fail (1줄 메모)
issues:         <발견된 문제, 또는 없음>
```

---

## task-5 — Android 실기기 검증

### 단계
- [ ] **1. USB 디버깅**: 디바이스 설정 > 개발자 옵션 > USB 디버깅 ON. (개발자 옵션이 안 보이면 빌드 번호 7회 탭).
- [ ] **2. adb 인증**: 첫 USB 연결 시 "이 컴퓨터에서 USB 디버깅 허용" 승인. `adb devices` 에서 `device` (not `unauthorized`) 확인.
- [ ] **3. 빌드 + install**:
  ```bash
  npm run build
  npx cap sync android
  cd android && ./gradlew assembleDebug && cd ..
  adb install -r android/app/build/outputs/apk/debug/app-debug.apk
  adb shell monkey -p kr.go.seoul.foreigner -c android.intent.category.LAUNCHER 1
  ```
- [ ] **4. mediapipe 모델 다운로드**: 앱 첫 사용 시 모델 다운로드 진행 + 완료.
- [ ] **5. RAG 응답 검증**: 1건 이상 질의 → 응답 정상.
- [ ] **6. 메모리 측정**:
  - 옵션 A: `adb shell dumpsys meminfo kr.go.seoul.foreigner` (mediapipe 추론 도중) → `TOTAL PSS`, `Native Heap`, `EGL mtrack` 기록.
  - 옵션 B: chrome://inspect (Chrome 데스크톱) → 디바이스의 WebView 선택 > Performance / Memory.

### 기록 양식
```
host:           <model> / Android <version>
android_sdk:    36
gradle_version: <확인>
build_time:     <분>:<초>
install_size:   <MB>
model_download: <MB> in <초>
peak_pss_mb:    <숫자>
native_heap_mb: <숫자>
egl_mtrack_mb:  <숫자>
rag_response_quality: pass|partial|fail (1줄 메모)
issues:         <발견된 문제, 또는 없음>
```

---

## task-6 — 결과 보고

위 두 task 결과를 메인 세션에 알려주세요. 형식 자유:
- "iPhone OK / Android OK + 위 두 양식 데이터"
- 또는 partial / fail 시 발견된 문제 요약

오케스트레이터가:
- `docs/adr/ADR-S4-001-mobile-validation-pipeline.md` (자동화 스크립트 + UAT 분담 결정 + 측정 결과)
- `docs/adr/sprints/sprint-4.md` (스프린트 요약)
- `README.md` (모바일 빌드/측정 섹션 보강)
- `sprint-window.md` (Sprint 4 → [1] 완료, [2] 다음 미정)

을 갱신하고 `/end` 안내합니다.
