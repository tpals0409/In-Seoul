# Sprint 3 — 크로스 플랫폼 전환 (Capacitor 환경 구축)

- **기간**: 2026-05-09 (단일 세션)
- **start_commit → end_commit**: `d149a74` → `<sprint-3 main HEAD>`
- **결정 ADR**: ADR-S3-001 (Capacitor 채택)

## 목표

현 Vite + React 19 웹앱 (`IOSDevice` 컴포넌트로 데스크톱 브라우저에서 모바일 흉내) 을 Capacitor 로 iOS/Android 네이티브 패키징. 본 스프린트 범위는 **환경 구축 + sync 통과 + 회귀 0** 까지. 시뮬레이터/에뮬레이터 BUILD 검증과 실기기 테스트는 Sprint 4 이월.

## 작업 결과

| Task | 제목 | 브랜치 | Commit | Verdict |
|------|------|--------|--------|---------|
| task-1 | Capacitor 코어 + ios/android deps + capacitor.config.ts | `task-1-impl` | `65e7575` | pass (R1) |
| task-2 | iOS 플랫폼 추가 + sync | `task-2-impl` | (push) | pass (R1, caveat) |
| task-3 | Android 플랫폼 추가 + sync | `task-3-impl` | (push) | pass (R1, caveat) |
| task-4 | `Capacitor.isNativePlatform()` 분기 + safe-area-inset | `task-4-impl` | `5f8ce65` | pass (R1) |
| task-5 | ADR-S3-001 + sprint-3 summary + README 갱신 | (main 직접) | this | — |

## 검증 요약

- **회귀**: vitest 14 files / 128 tests 모든 task pass, lint main baseline 보존 (신규 0)
- **Capacitor sync**: ios/android 양쪽 통과 (sync time < 0.1s)
- **시뮬레이터/에뮬레이터 빌드**: Xcode/JDK 미설치로 Sprint 4 이월 (caveat 명시)
- **머지된 PR / 커밋**: 4 작업 브랜치 origin push 완료, main 통합 보류 (Sprint 2 ADR-S2-001 패턴 유지)

## 운영 인사이트 (이번 스프린트에서 배운 것)

### cmux 멀티 워커 — surface detach 문제 발견

Wave 2 부트스트랩에서 task-2/3 impl + review 4 워커를 띄웠으나, `cmux surface-health` 가 `in_window=false` 응답 — 워크스페이스가 idle 진입 후 surface detach. `cmux send` 응답은 OK 지만 prompt 가 워커에 전달 안 됨. 10분 후 worktree HEAD 변화 0, review 파일 미생성으로 진단.

**Fallback 적용**: 오케스트레이터 (Opus 4.7) 가 직접 task-2/3/4 진행. worktree 분리는 그대로 유지. background bash 로 npm/cap 명령 병렬 실행.

운영 메모리 등록: `~/.claude/projects/.../memory/feedback_cmux_surface_detached.md`

### Codex sandbox confirm 차단

task-1 review 워커 (Codex) 가 cmux read-screen 폴링 명령에서 sandbox 권한 차단. 이후 npm install 도 confirm 요구. 옵션 2 (영구 허가) 한 번 누르면 같은 prefix 자동화. 단 build/test/lint 는 prefix 가 다르므로 추가 confirm 가능 — Wave 1 은 영구 허가 후 통과, Wave 2 부터는 워커 미사용 fallback 적용.

### 호스트 환경 의존성이 자동 검증의 천장

빌드 검증 단계에서 Xcode (App Store 10GB 다운로드) / JDK 둘 다 미설치 발견. 사용자 머신에 자동 설치할 수 없는 영역 (Xcode) 이 있어 Sprint 3 범위를 환경 구축까지로 명시 축소. ADR 의 "이월" 섹션에 구체적 명령 (`xcodebuild ...`, `./gradlew assembleDebug`) 까지 기록 → Sprint 4 인수인계 부담 최소.

## 다음 스프린트 후보 (Sprint 4)

1. **빌드 검증 마무리** (블로커):
   - 사용자가 Xcode (App Store) + JDK 17+ (`brew install --cask temurin`) 설치
   - `xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator build` → BUILD SUCCEEDED 확인
   - `cd android && ./gradlew assembleDebug` → BUILD SUCCESSFUL 확인
2. **실기기 테스트**: iPhone + Android 디바이스에서 앱 설치 + AI 흐름 (mediapipe 로드, RAG 응답) 작동 검증
3. **on-device LLM 모바일 메모리 측정**: WebView RAM 사용량, 첫 로드 시간 (KPI)
4. **App Store / Play Store 메타데이터**: 아이콘, 스플래시, 개인정보처리방침
5. **이월 from Sprint 1/2**: main 통합 (현재 4+4 브랜치 origin push 만, main 머지 보류), 전체 lint clean-up (ADR-S2-001 baseline 15 errors 해소)

## 메타

- 평균 라운드: 1.0 (4 task 모두 R1 pass)
- escalation 0 건
- 워커 부트스트랩 패턴 변경: cmux 멀티 워커 → 오케스트레이터 직접 진행 (surface detach 이슈로)
- start_commit: `d149a74` (Sprint 2 종료 시점)
