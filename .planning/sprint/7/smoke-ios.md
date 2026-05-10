---
host: macOS (Xcode 26.4.1)
sprint: 7
target: iOS Simulator (iPhone 17 Pro, UDID 287CD5EA-DA22-4E18-9482-D09411EFDD56)
run_at: 2026-05-10
note: Sprint 7 의 사용자 결정 = no_workers + simulator-only smoke. uat-results.md#iOS 의 측정 필드는 의도적으로 비어있음 (실기기 측정 보류, Sprint 8 후보).
---

# Sprint 7 — iOS 시뮬레이터 smoke 결과

> 실기기 UAT 와 분리된 동작-검증-only 결과. Sprint 4 결과표 양식 (peak_rss_mb 등) 에는 입력하지 않음.

## 환경
- Xcode 26.4.1 (Build 17E202)
- Simulator: iPhone 17 Pro
- Device UDID: 287CD5EA-DA22-4E18-9482-D09411EFDD56
- App ID: `com.inseoul.app`
- 빌드 모드: `npm run build` = `tsc -b && vite build` (production)

## 실행 흐름 결과
- `npm run build` (vite production): SUCCESS — 169ms
- `npx cap sync ios`: SUCCESS — 44ms
- `xcodebuild -sdk iphonesimulator`: **BUILD SUCCEEDED** (배경 task `btolpker3`, exit 0)
- `xcrun simctl install booted` + `simctl launch booted com.inseoul.app`: launched (PID 97686)
- `simctl listapps`: `com.inseoul.app` 등록 확인 (ApplicationType=User)

## 사용자 점검 (앱 진입 후)
- 시뮬 화면에 **DEV TWEAKS 패널 노출** ← 사용자 발견. 정상 production UI 가 아님.
- mediapipe 모델 다운로드 / RAG 응답: 미수집 (TweaksPanel finding 후 fix 결정 보류 → Sprint 8 이월 합의)

---

## Findings (Sprint 8 후보 task)

### Finding 1 — `mobile-launch.sh` sim 분기 SwiftPM 회귀 (resolved this sprint)
- **현상**: `npm run mobile:ios` 가 `xcodebuild: error: 'ios/App/App.xcworkspace' does not exist` 로 실패. Capacitor SwiftPM 통합 (`ios/App/CapApp-SPM`) 프로젝트에는 `.xcworkspace` 가 없고 `.xcodeproj` 만 있음.
- **원인**: Sprint 6 task-1 review 가 `ios-device` 분기는 검증했으나 `ios` (시뮬) 분기는 미검증. sim 코드 경로의 `xcodebuild -workspace ios/App/App.xcworkspace` 가 파일 부재로 즉시 fail.
- **해결**: `scripts/mobile-launch.sh:234` `-workspace ios/App/App.xcworkspace` → `-project ios/App/App.xcodeproj`. atomic commit `02863dd`.
- **잔여 의심점**: `scripts/mobile-launch.sh:157` 의 `pick_ios_device_udid()` 가 동일하게 `-workspace ios/App/App.xcworkspace` 사용. `2>/dev/null | grep` 로 stderr 가 가려져 *조용히 빈 UDID 리턴* 가능. devicectl fallback 이 가렸을 수도. **Sprint 8 추가 점검 필요**.
- **메타 학습**: Sprint 6 review 체크리스트가 *시뮬 + 실기기 양쪽 분기* 를 강제 검증하도록 보강해야 함.

### Finding 2 — `TweaksPanel` production bundle leak (deferred to Sprint 8)
- **현상**: production 빌드 (`vite build`) 시뮬에서 우하단에 "DEV TWEAKS" 인스펙터 패널 노출. persona/scenario/screen 전환 컨트롤 그대로 작동.
- **원인**: `src/dev/TweaksPanel.tsx` 자체는 가드 없이 항상 렌더 (의도적, 패널 본체 책임 분리). 마운트 가드를 `App.tsx` 에 두기로 약속됨 — 패널 파일 주석 명시: *"프로덕션 빌드(import.meta.env.DEV === false)에서는 App.tsx 가 마운트하지 않는다."* 그러나 `src/App.tsx:200, 211` 둘 다 무조건 `<TweaksPanel />` 마운트. **계약 위반**.
- **번들 영향 검증**: `grep -c "DEV TWEAKS" dist/assets/index-*.js` → `1`. 즉 production bundle 에 dev 코드 + 의존하는 zustand setter 들 leak.
- **사용자 결정**: fix 보류, **Sprint 8 task 로 이월**.
- **Sprint 8 fix 후보 (작은 → 큰 순)**:
  1. `App.tsx` 200/211 두 곳에 `{import.meta.env.DEV && <TweaksPanel />}` 가드. vite 의 정적 치환 + tree-shaking 으로 production bundle 에서 제거.
  2. (옵션) `import { TweaksPanel }` 도 conditional dynamic import 로 전환해 import 그래프에서도 완전 제거.
  3. 회귀 가드: bundle grep 테스트 (`grep -c "DEV TWEAKS" dist/...` 가 0 이어야 production CI pass).
- **실기기 UAT 영향**: 동일 leak 가 실기기에도 노출될 것. **Sprint 8 의 실기기 UAT 전제 조건**.

### Finding 3 — `import.meta.env.DEV` 가드 메커니즘 부재 (deferred to Sprint 8)
- **현상**: 코드베이스 전체에서 `import.meta.env.DEV` / `import.meta.env.PROD` / `import.meta.env.MODE` 사용처 = **0건** (TweaksPanel.tsx 의 주석에서만 언급).
- **함의**: dev/prod 분기 인프라가 사실상 미구축. Finding 2 (TweaksPanel leak) 가 그 결과의 1번째 사례. 향후 dev 도구를 추가할 때마다 동일 패턴 leak 재발 가능성 높음.
- **Sprint 8 fix 후보**:
  1. App.tsx 가드 추가 (Finding 2 와 통합 처리).
  2. ESLint 규칙: `src/dev/*` 가 production 코드에서 import 되면 경고 (예: `no-restricted-imports` + `eslint-plugin-boundaries`).
  3. CI 회귀 가드: `dist/assets/*.js` 에 `DEV TWEAKS`, `__DEV__`, `dev/` 같은 dev 토큰이 1건이라도 들어가면 fail 하는 grep 테스트.

### Finding 4 — iOS WebView pinch-zoom 가능 (앱답지 않음, deferred to Sprint 8)
- **현상**: 사용자 시뮬 발견. 두 손가락 pinch 로 화면 확대/축소 가능. 네이티브 앱 UX 와 어긋남.
- **다층 원인**:
  - `index.html:5` viewport meta: `width=device-width, initial-scale=1.0, viewport-fit=cover` — **`maximum-scale=1.0` 와 `user-scalable=no` 누락**.
  - `capacitor.config.ts`: ios 섹션 자체 없음 (`appId` / `appName` / `webDir` 만 정의).
  - CSS `touch-action` 사용처 = 0건 (전역 가드 부재).
  - JS `gesturestart` / `gesturechange` `preventDefault()` 사용처 = 0건.
- **참고**: iOS 10+ 의 Safari 는 viewport meta 의 `user-scalable=no` 를 *접근성 이유로 무시* 하는 경우 있음. 따라서 viewport 만으로는 부족할 수 있고, Capacitor WKWebView 의 native 설정 또는 JS gesturestart 가드 병행 필요.
- **Sprint 8 fix 후보 (작은 → 큰)**:
  1. `index.html` viewport meta: `..., maximum-scale=1.0, minimum-scale=1.0, user-scalable=no` 추가. `viewport-fit=cover` 유지.
  2. 전역 CSS: `html, body { touch-action: pan-x pan-y; -webkit-text-size-adjust: 100%; }` (입력 포커스 시 자동 zoom 도 동시 차단).
  3. JS gesture 가드: `document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false })` (iOS Safari/WKWebView pinch 차단의 가장 강한 가드).
  4. `capacitor.config.ts` 에 ios 섹션 명시 — 필요 시 `ios: { contentInset: 'always', scrollEnabled: true, allowsLinkPreview: false }` 등.
  5. 회귀 가드: e2e 시뮬 (Playwright iOS device emulation) 에서 `page.evaluate(() => window.visualViewport.scale)` 로 zoom 시도 후 1.0 유지 검증.
- **실기기 UAT 영향**: iOS 실기기에서도 동일 결함. Sprint 8 실기기 UAT 전 fix 권장.

### Finding 5 — LLM backend 미설정 → AI 가 항상 template fallback (deferred to Sprint 8, **highest impact**)
- **현상**: 사용자 시뮬 발견 — "AI 가 템플릿 모드". UI 가 `AiSheet.tsx:122` 에서 정직하게 "이 기기는 템플릿 모드" 라벨을 노출한 결과 사용자가 즉시 알아챔 (라벨 시스템은 정상 작동 중).
- **원인 체인**:
  - `.env` / `.env.production` 부재 — git tracked 는 `.env.example` 뿐.
  - 빌드 시 `VITE_LLM_BACKEND`, `VITE_GEMMA_MODEL_URL`, `VITE_OLLAMA_URL` 모두 undefined.
  - `useLLM.ts:38 envBackend()` 가 'none' 리턴 (호환 fallback 인 `VITE_GEMMA_MODEL_URL` 도 undefined).
  - 'none' backend → `useLLM.ts:473` ensureReady throw 또는 status 가 'ready' 로 전이 못 함.
  - `useAdvisor.ts:160` 의 `if (llmState.status !== 'ready' || errored)` 분기 매번 진입 → `templateAnswerFor()` + 22ms 간격 simulated streaming → LLM 처럼 보이는 정형 응답.
- **번들 검증**: `dist/.../index-*.js` 에 `"template"` 토큰 2회 (template 응답 코드/문구 포함), `"ollama"` / `"mediapipe"` / `"WebGPU"` 각 1회 (코드 포함은 됨 — 런타임에 'none' 으로 가서 미실행).
- **사용자 인상**: AI 핵심 기능이 사실상 정형 답변기로만 동작. 모드 라벨이 보이긴 하지만, 본 시나리오에선 production 의도와 어긋남.
- **Sprint 8 fix 후보 (작은 → 큰)**:
  1. `.env.production` 신규 작성 (mediapipe 디폴트 + Gemma3 model URL):
     ```
     VITE_LLM_BACKEND=mediapipe
     VITE_GEMMA_MODEL_URL=https://storage.googleapis.com/.../gemma3-1b-it-int4.task
     ```
  2. mobile 전용 vite mode (`.env.mobile.production`) 분리 검토 — capacitor 빌드만 model URL 다르게 / on-device 가드 다르게 가능.
  3. `envBackend()` 가 빈 값일 때 *미설정 경고* console.error + UI 에 "환경 변수 미설정" 라벨 명확히 (현재는 조용히 'none' → "이 기기는 템플릿 모드" 라벨로만 떠서 *환경 미설정* vs *지원 불가* 구분 어려움).
  4. CI 회귀: production bundle 빌드 시 `VITE_LLM_BACKEND` 필수 환경 변수 assert (vite plugin 또는 빌드 사전 스크립트).
  5. UAT-CHECKLIST.md 사전 준비에 `.env.production` 존재 확인 단계 추가.
- **실기기 UAT 영향**: **Sprint 8 의 우선순위 1번 fix**. 이 항목이 fix 안 되면 실기기 UAT 의 mediapipe 다운로드 / RAG 응답 품질 / peak_rss_mb 측정 모두 *template fallback 측정* 이 되어 무의미.

---

## /end 시 처리
- 이 파일을 ADR-S7-001 의 핵심 산출물로 인용.
- `uat-results.md#iOS` / `#Android` 측정 필드: 시뮬 결과로 채우지 않음 (의도적 미수집, ADR 에 명시).
- Sprint 8 backlog 항목 (우선순위 순):
  1. **[P0]** `.env.production` + LLM backend 환경변수 설정 (Finding 5) — 실기기 UAT 의 *전제 조건*.
  2. **[P1]** TweaksPanel App.tsx 가드 + `import.meta.env.DEV` 가드 메커니즘 + bundle grep CI 회귀 가드 (Finding 2 + 3 통합).
  3. **[P2]** iOS pinch-zoom 4중 fix (viewport meta + CSS touch-action + JS gesturestart + capacitor.config ios 섹션) (Finding 4).
  4. **[P3]** `mobile-launch.sh:157` `pick_ios_device_udid()` 의 `-workspace` 잔존 점검 (Finding 1 잔여 의심점).
- sprint-window [2] 또는 별도 backlog (ROADMAP / 999.x phase) 에 등록.
