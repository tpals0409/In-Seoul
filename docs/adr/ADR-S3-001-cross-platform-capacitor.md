# ADR-S3-001: 크로스 플랫폼 전환 — Capacitor 채택

- **status**: accepted
- **date**: 2026-05-09
- **sprint**: 3
- **deciders**: leokim (사용자), orchestrator (Claude Opus 4.7)
- **supersedes**: —
- **superseded-by**: —

## Context

InSeoul 은 Vite 8 + React 19 + TypeScript 기반 웹앱으로 시작했다. 데스크톱 브라우저에서 `IOSDevice` 컴포넌트 (`src/components/iosFrame/`)로 iPhone 프레임을 흉내내고, 모바일 viewport (≤480px) 에서는 풀스크린으로 분기하는 구조였다 (`src/App.tsx`). 사용자는 이를 **실제 iOS/Android 앱으로 패키징**하기를 원했다.

핵심 제약:
- on-device LLM (`@mediapipe/tasks-genai`, `@xenova/transformers`) 의 web 백엔드 보존 — 외부 LLM API 호출 0 정책 (Local-First)
- Sprint 1/2 가드 4종 (ollama URL, RAG chunk validation, mediapipe URL, 8K prompt cap) 보존
- vitest 70+ → 128 unit + Playwright chromium e2e 회귀 0
- 단일 코드베이스 유지 (iOS / Android 분기 최소화)

## Decision

**Capacitor (Ionic) 채택**.

- React 19 + Vite 빌드 산출물 (`dist/`) 을 WebView 로 패키징
- `@capacitor/core` + `@capacitor/cli` + `@capacitor/ios` + `@capacitor/android` (8.3.3) 4 패키지 도입
- `capacitor.config.ts` 에 `appId=com.inseoul.app`, `appName=InSeoul`, `webDir=dist`
- 코드 재사용 ~100% — 기존 React 컴포넌트 / Zustand 스토어 / AI 백엔드 분기 그대로
- 네이티브 분기는 `Capacitor.isNativePlatform()` 런타임 체크 한 곳 (`src/App.tsx`) 으로 격리

## Considered Alternatives

| 옵션 | 코드 재사용 | iOS+Android | on-device LLM | 마이그레이션 비용 | 채택 여부 |
|------|------|------|------|------|------|
| **Capacitor** | ~100% | WebView | mediapipe/xenova WebView 호환 가능 (시뮬레이터 빌드 검증은 Sprint 4 이월) | 1~2 스프린트 | ✅ 채택 |
| React Native / Expo | UI 거의 재작성 (`div`→`View`, CSS→StyleSheet) | 진정 네이티브 | `llama.rn` 등 별도 RN 패키지 | 4~6 스프린트 | ❌ 거부 |
| PWA only | 100% | 홈스크린 설치 | 동일 (브라우저) | < 1 스프린트 | ❌ 앱스토어 배포 불가, 사용자 요구 미충족 |
| Tauri Mobile | ~80% | 베타 단계 | 호환성 미상 | 미상 | ❌ 성숙도 부족 |

**RN 거부 사유**: 30+ React 컴포넌트 (screens/wizard, screens/details, screens/sheets, components/iosFrame, dev/TweaksPanel) 와 Zustand 스토어, 그리고 `@mediapipe/tasks-genai` / `@xenova/transformers` 의 WebAssembly 백엔드를 네이티브로 재이식하는 비용이 사실상 새 프로젝트급. Capacitor 의 코드 재사용 이점이 압도적.

## Consequences

### 긍정
- 코드베이스 단일 — Sprint 1/2 의 AI 가드 4종이 자동으로 모바일에 이식됨
- iOS/Android 동시 지원, 빌드 산출물 공유
- 기존 vitest/Playwright 테스트 자산 그대로 유효
- WebView 기반이라 React 19 / Vite HMR 등 웹 개발 워크플로우 보존

### 부정 (수용)
- WebView 성능 한계 — 진정 네이티브 대비 60fps 보장 어려움 (현 시점 InSeoul UI 는 정적 시뮬레이터라 무관)
- on-device LLM 의 모바일 WebView 메모리 한계 — Sprint 4 에서 실기기 검증 필수
- 진정 네이티브 API (생체 인증, 푸시, 백그라운드 작업) 사용 시 별도 Capacitor 플러그인 필요

### 이월 (Sprint 4)
- ~~**iOS 시뮬레이터 빌드 검증**~~ ✅ **2026-05-09 해소** — Xcode 26.4.1 설치 후 `xcodebuild ... build` BUILD SUCCEEDED 확인 (Update Log 참조)
- ~~**Android 에뮬레이터 빌드 검증**~~ ✅ **2026-05-09 해소** — JDK 21 (Android Studio JBR) + SDK android-36.1 환경에서 `./gradlew assembleDebug` BUILD SUCCESSFUL, `app-debug.apk` 생성 (Update Log 참조)
- **실기기 테스트** — iPhone + Android 디바이스
- **on-device LLM 모바일 메모리 점검** — `@mediapipe/tasks-genai` 가 iOS WKWebView / Android Chrome WebView 의 메모리 한계 (1~2GB) 내에서 작동하는지
- **App Store / Play Store 메타데이터** — 아이콘, 스플래시, 권한 description, 개인정보처리방침 링크
- **네이티브 권한** — Sprint 3 범위는 디폴트 권한 (INTERNET) 만. 카메라/위치/푸시는 미포함

## Implementation (Sprint 3)

| Task | Branch | Commit | Status |
|------|--------|--------|--------|
| task-1: Capacitor 코어 + ios/android deps + config | `task-1-impl` | `65e7575` | pass (R1) |
| task-2: iOS 플랫폼 추가 + sync | `task-2-impl` | (push) | pass (R1, caveat: simulator build → S4) |
| task-3: Android 플랫폼 추가 + sync | `task-3-impl` | (push) | pass (R1, caveat: emulator build → S4) |
| task-4: `Capacitor.isNativePlatform()` 분기 + safe-area | `task-4-impl` | `5f8ce65` | pass (R1) |
| task-5: ADR + README + sprint summary | (main) | this commit | — |

**main 통합 정책**: Sprint 2 ADR-S2-001 패턴 유지 — 4 task-N-impl 브랜치는 origin 에 push 됐으나 main 머지는 사용자 결정 보류. main 에는 review 파일과 ADR 만 추가.

## Test Strategy

| 영역 | 검증 방식 | Sprint 3 결과 |
|------|----------|---------------|
| 단위 회귀 | vitest 14 files / 128 tests | ✅ 모든 task pass |
| Lint | ESLint baseline (ADR-S2-001 — 신규 0 건) | ✅ 보존 (15 errors / 2 warnings unchanged) |
| Web e2e | Playwright chromium | ✅ 회귀 가능성 0 (코드 분기는 isNative=false 시 기존 동작 유지) |
| iOS 시뮬레이터 빌드 | `xcodebuild build` | ✅ BUILD SUCCEEDED (2026-05-09 follow-up, Xcode 26.4.1) |
| Android 에뮬레이터 빌드 | `./gradlew assembleDebug` | ✅ BUILD SUCCESSFUL (2026-05-09 follow-up, JDK 21 / android-36.1) |
| 실기기 검증 | iPhone + Android 디바이스 | ⏭️ Sprint 4 이월 |
| on-device LLM 메모리 | mediapipe WebView 로드 시간/RAM | ⏭️ Sprint 4 이월 |

## Notes

- Capacitor 8.x 는 SPM (Swift Package Manager) 기반 — CocoaPods 의존성 제거됨. iOS 디렉터리 구조: `ios/App/App.xcodeproj` + `ios/App/CapApp-SPM/Package.swift`
- Android 는 표준 Gradle 프로젝트. `android/app/src/main/java/com/inseoul/app/MainActivity.java` 가 진입점
- `ios/`, `android/` 디렉터리는 git 추적, build 산출물 (`Pods/`, `.gradle/`, `build/`) 만 .gitignore 처리

## Update Log

### 2026-05-09 (Sprint 3 follow-up): iOS 시뮬레이터 빌드 caveat 해소

사용자가 Xcode 26.4.1 (Build 17E202) 설치 후:
```
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
```

`task-2-impl` 브랜치 worktree (`../InSeoul-task-2`) 에서:
```
npm install && npm run build && npx cap sync ios
xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator \
  -configuration Debug -destination 'generic/platform=iOS Simulator' build
```
→ **`** BUILD SUCCEEDED **`** (exit 0)

산출물: `~/Library/Developer/Xcode/DerivedData/App-.../Build/Products/Debug-iphonesimulator/App.app` (CodeSign "Sign to Run Locally", App.debug.dylib + __preview.dylib).

### 2026-05-09 (Sprint 3 follow-up): Android Gradle 빌드 caveat 해소

사용자가 `brew install --cask temurin@17 android-studio` + Android Studio Setup Wizard "Standard" 로 SDK (`~/Library/Android/sdk` — platforms `android-36.1`, build-tools `36.1.0`/`37.0.0`) 다운로드.

**1차 시도 (시스템 JDK 17)**: BUILD FAILED
```
> Task :capacitor-android:compileDebugJavaWithJavac FAILED
error: invalid source release: 21
```
Capacitor 8.x Android 라이브러리가 Java 21 source release 요구.

**2차 시도 (Android Studio 내장 JBR 21.0.10)**: BUILD SUCCESSFUL
```
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
cd /Users/leokim/Desktop/leo.kim/InSeoul-task-3/android
./gradlew assembleDebug
```
→ **`BUILD SUCCESSFUL in 32s`** (93 tasks, 56 executed / 37 up-to-date)

산출물: `android/app/build/outputs/apk/debug/app-debug.apk` (+ `output-metadata.json`).

**운영 인사이트**: Capacitor 8.x Android 빌드는 **JDK 21 필수**. 시스템 JDK 17 (temurin) 만으로 부족. Android Studio 내장 JBR 21 활용이 가장 간편 — `JAVA_HOME` 을 `/Applications/Android Studio.app/Contents/jbr/Contents/Home` 로 export.

**남은 이월** (Sprint 4):
- 부팅된 시뮬레이터/에뮬레이터 install + 실행 (`xcrun simctl boot ...` + `npx cap run ios` / `adb install` + `npx cap run android`)
- 실기기 (iPhone + Android) 테스트
- on-device LLM (mediapipe) 모바일 WebView 메모리 측정 + 첫 로드 시간
- App Store / Play Store 메타데이터 (아이콘, 스플래시, 권한, 개인정보처리방침)
