---
host: <측정 머신 호스트명 또는 사용자>
run_at: <YYYY-MM-DD HH:MM TZ>
sprint: 10
---

# Sprint 10 — Sprint 4 Phase B 실기기 UAT 결과 (Sprint 8 LLM fail-fast 반영 후 첫 본 측정)

> Sprint 4 §기록양식 + Sprint 6 인프라 (`mobile:ios:device` / `mobile:android:device` /
> `mobile:mem:* --device`) 활용. Sprint 7 템플릿 (`.planning/sprint/7/uat-results.md`)
> 과 동일 형식 — collate 스크립트 (`scripts/collate-uat.mjs`) 와 호환.
> iOS / Android 각 섹션을 채운 뒤
> `npm run uat:collate < .planning/sprint/10/uat-results.md` 로 표 생성.
>
> - 누락 필드는 비워두면 collate 출력에서 `—` 로 표기됩니다.
> - `key: value` 라인 정확히 유지 (스크립트 정규식 대상).
> - 절차: `.planning/sprint/4/UAT-CHECKLIST.md` task-4 (iPhone) / task-5 (Android).
> - 문제 발생 시: `docs/uat-troubleshooting.md` 참조.
>
> **Sprint 9 → Sprint 10 이월 사유**: Sprint 8 P0 fix
> (`feat(sprint-8/task-1) 6ede09e` + `fix(sprint-8/task-1) 51aec1d`,
> `vite.config.ts` 의 `assertLlmBackend` 도입) 머지 후 첫 정식 측정.
> Sprint 7 측정값은 LLM backend 미설정 상태로 template fallback 만 검증된 한계 있음
> (Sprint 7 Finding 5). 이번 sprint 측정값이 실제 on-device LLM 응답 기준의 첫 baseline.

---

## iOS

> **사전 점검** (빌드 시작 전 반드시 통과 — Sprint 8 P0 fix 반영. Android 빌드도
> 동일하게 적용되지만 iOS 측정이 보통 먼저라 이 섹션 상단에 둠)
>
> - [ ] **`.env.production` 의 `VITE_LLM_BACKEND` 가 `mediapipe` 또는 `ollama` 로 명시**
>       되어 있어야 함. 미설정 시 `npm run build` 가 `vite.config.ts` 의
>       `assertLlmBackend` 에서 즉시 throw → production bundle 자체가 생성되지 않음
>       (fail-fast). 측정 시작 전 `cat .env.production | grep VITE_LLM_BACKEND` 로
>       라인 한 줄이라도 존재하는지 확인. 미설정 / 빈 값일 경우 측정 보류 후
>       `docs/uat-troubleshooting.md` §5 참고.
> - [ ] **mediapipe weights URL** (`VITE_GEMMA_MODEL_URL`) 가 빌드 환경에 주입돼 있는지.
>       비어 있으면 init 단계 throw → AiSheet 가 "템플릿 모드" 라벨 노출.
>       template fallback 만 측정하고 싶으면 의도적으로 비워두되 issues 에 명기.
> - [ ] **Xcode 26.x 사용** (Sprint 7 기준 26.4.1, iOS 18+ SDK 필요). 26.x 미만은
>       Capacitor 7 / Swift 6 toolchain 미스매치 가능. `xcodebuild -version` 으로 확인.
>       Free Apple ID (personal team) 서명 시 7일마다 cert 만료 → 재설치 필요
>       (`docs/uat-troubleshooting.md` §1).
> - [ ] 실기기 잔여 storage ≥ 2 GB (mediapipe weight 다운로드 여유분).

```
host:           iPhone <model> / iOS <version>
xcode_version:  <26.x — Sprint 7 기준 26.4.1>
build_time:     <분>:<초>
install_size:   <MB>
model_download: <MB> in <초>
peak_rss_mb:    <숫자>
peak_dirty_mb:  <숫자>
rag_response_quality: pass|partial|fail (1줄 메모)
issues:         <발견된 문제, 또는 없음>
```

---

## Android

> **사전 점검** (iOS 의 사전 점검 모두 적용 — `.env.production`, `VITE_LLM_BACKEND`,
> `VITE_GEMMA_MODEL_URL` — 추가로 아래 두 항목 확인)
>
> - [ ] Android Studio + Android SDK 36 설치, `adb devices` 에 단말이 `device`
>       (not `unauthorized`) 로 등록 (`docs/uat-troubleshooting.md` §2).
> - [ ] 실기기 잔여 storage ≥ 2 GB (`adb shell df /data` 로 host 에서도 확인 가능).

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
