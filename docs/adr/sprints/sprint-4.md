# Sprint 4 — 실기기 빌드 + on-device LLM 검증 (Phase A 자동화 종료, Phase B 이월)

**상태**: Phase A 종료 (2026-05-09 단일 세션). Phase B (실기기 UAT) 는 사용자 follow-up 으로 이월.
**기간**: 2026-05-09 (단일 세션)
**start_commit → end_commit**: `b27f24d` → (이 커밋)
**선행**: Sprint 3 (Capacitor 환경 구축, 5/5 task pass)

## 목표 vs 결과

| 목표 | Phase | 결과 |
|---|---|---|
| Sprint 3 4 task-impl 브랜치 main 통합 | A | ✅ task-1 (`c0091af`) — 4 ort clean merge, 충돌 0 |
| 시뮬레이터/에뮬레이터 자동화 스크립트 | A | ✅ task-2 (`6ab298f`) — Round 2 fix 후 PASS |
| on-device LLM 메모리 측정 스크립트 | A | ✅ task-3 (`e616b59`) — Round 1 PASS |
| iPhone 실기기 검증 | B | ⏸ deferred (실기기/Apple ID/시간 의존) |
| Android 실기기 검증 | B | ⏸ deferred (실기기/USB 디버깅 의존) |
| 결과 문서화 | A | ✅ 본 ADR + ADR-S4-001 + README 모바일 섹션 |

## 작업 결과 (Phase A)

### task-1 — Sprint 3 main 통합
- **commit**: `c0091af` (HEAD of `s4-task-1-impl`)
- **머지**: `224f134` (s3-task-1) → `a7d360b` (s3-task-2) → `b493008` (s3-task-3) → `c0091af` (s3-task-4)
- **검증**: lint 15e/2w (main baseline 동일), vitest 128/128 pass, playwright chromium 10/10 pass.
- **충돌**: 0건 — 4 brnach 모두 ort 4-way clean merge. `package.json` 의존성 union 자동 보존 (`@capacitor/core`, `@capacitor/ios`, `@capacitor/android`, `@capacitor/cli`).
- **Round**: 1.0
- **review**: `.planning/sprint/4/reviews/task-1.md` (Codex)

### task-2 — 시뮬레이터/에뮬레이터 자동화 + console log 캡처
- **commit**: `6ab298f` (Round 2 fix)
- **변경**: `scripts/mobile-launch.sh` (260 라인) + `scripts/mobile-trace.sh` (164 라인) + `package.json` (npm scripts).
- **Round 1 reject 사유**: iOS 시뮬레이터 boot readiness polling/timeout 누락 (`xcrun simctl boot ... || true` 후 install/launch 가 boot 완료 전 실패 가능). Android 는 `sys.boot_completed` 120초 timeout 있어 충족.
- **Round 2 fix**: `xcrun simctl bootstatus` 폴링 + bounded timeout 추가. dry-run 도 wait step echo.
- **검증**: `bash -n` 통과, `npm run mobile:dry:ios`/`mobile:dry:android` exit 0 + 명령 echo, vitest 128 pass.
- **Round**: 2.0
- **review**: `.planning/sprint/4/reviews/task-2.md` (Codex)

### task-3 — on-device LLM 메모리 측정 스크립트
- **commit**: `e616b59`
- **변경**: `scripts/mobile-mem-measure.sh` (410 라인) + `README.md` (+20) + `package.json` (npm scripts).
- **기능**: ios → `xcrun simctl spawn booted vmmap`/`footprint` 파싱, android → `adb shell dumpsys meminfo` 파싱. JSON 출력 (samples + peak_rss_mb + mediapipe_loaded).
- **검증**: `bash -n` 통과, `--help` 0 exit. 실측은 Phase B UAT.
- **Round**: 1.0
- **review**: `.planning/sprint/4/reviews/task-3.md` (Codex)

## Phase B 이월 (사용자 UAT)

자동화 스크립트가 모두 준비됐으므로 사용자가 실기기 검증을 진행할 수 있다. 가이드: [`.planning/sprint/4/UAT-CHECKLIST.md`](.planning/sprint/4/UAT-CHECKLIST.md).

남은 작업:
- iPhone 실기기 빌드 + signing + install + mediapipe 모델 다운로드 + RAG 응답 + Xcode Instruments 메모리 캡처
- Android 실기기 빌드 + USB 디버깅 + install + mediapipe 모델 + RAG + dumpsys meminfo / chrome://inspect
- 시뮬레이터/에뮬레이터에서 자동화 스크립트 실측 1회 (회귀 가드)
- 결과를 `docs/adr/sprints/sprint-4.md` 의 "측정 결과" 표 (아래) 에 채움

### 측정 결과 (UAT 후 채움)

| platform | env | peak_rss_mb | mediapipe_loaded | RAG 응답 품질 | note |
|---|---|---|---|---|---|
| iOS | 시뮬레이터 | TBD | TBD | TBD | scripts/mobile-mem-measure.sh ios |
| iOS | 실기기 | TBD | TBD | TBD | Xcode Instruments |
| Android | 에뮬레이터 | TBD | TBD | TBD | scripts/mobile-mem-measure.sh android |
| Android | 실기기 | TBD | TBD | TBD | dumpsys meminfo / chrome://inspect |

## 머지된 PR / 브랜치

main 에 push 된 커밋 (오케스트레이터 직접):
- `e5e8bb9` ~ `b27f24d` 직후
- task-1 review pass + ADR-S4-001 + UAT-CHECKLIST + sprint-4.md draft
- task-2 review pass round 2
- task-3 review pass round 1 + Phase A done milestone
- (이 커밋) Phase A 결과 문서화 finalize

작업 브랜치 (origin push 완료, main 통합은 사용자 결정 보류 — Sprint 2~3 패턴 유지):
- `s4-task-1-impl` (Sprint 3 4-way merge 통합본)
- `s4-task-2-impl` (자동화 스크립트)
- `s4-task-3-impl` (메모리 측정)

## 검증 요약
- Phase A: 3/3 task pass, 평균 1.33 라운드 (1+2+1)/3, escalation 0건.
- 회귀: vitest 128/128 (Sprint 1~3 동일), playwright chromium 10/10, lint 15e/2w (ADR-S2-001 baseline).
- privacy: 외부 송신 채널 신설 0건 (스크립트는 모두 로컬 시뮬레이터/에뮬레이터 대상).

## 운영 인사이트

- **`task-2` Round 2 — Codex review 의 가치**: iOS boot readiness polling 누락은 dry-run 으로는 검출 불가능한 결함. Codex 가 review prompt 의 "추가 체크" 항목을 진지하게 적용해 정확히 잡았다. 이 패턴은 향후 sprint review prompt 의 "추가 체크" 섹션을 실용적 무기로 활용할 수 있음을 보여줌.
- **워크트리 review 파일 SSOT 위치**: codex review 워커가 워크트리 안에서 review 파일을 생성. 메인 트리의 background watch 가 못 잡음. 오케스트레이터가 수동 sync. 향후: review 워커 prompt 에 "메인 워킹트리 경로의 .planning/sprint/N/reviews/ 가 SSOT, 워크트리 file 은 작업 후 메인으로 복사 안내" 보강 가능.
- **cmux 워크스페이스 안정성**: Sprint 3 의 surface detach 이슈 재현 안 됨. 새 워크스페이스 생성 직후 8초 sleep + read-screen 으로 surface attach 확인하는 패턴이 효과적.
- **사용자 트리거 + 자율 워커의 균형**: 사용자가 "오케스트레이터 판단으로 모든 작업 완료" 라고 했을 때 Phase B (실기기 UAT) 를 별도 follow-up 으로 미루는 결정은 Sprint 3 과 일관된 패턴. 사용자 시간을 기다리지 않고 sprint 종료 가능.
- **codex 영구 허가 (sandbox confirm) — review 워커 자율 폴링 가능**: opt 2 한 번으로 review 워커가 cmux read-screen 폴링을 자율 진행. impl IMPL_DONE 시그널을 코덱스가 직접 감지 → 자동 round 2 검증 시작. cmux 워커 자율 chain 의 좋은 예.

## 이월
- **Phase B (UAT)**: 실기기 검증 + 시뮬레이터 실측 1회 (위 표 채움)
- **mediapipe 모델 다운로드 정책**: 강제 다운로드 vs lazy (사용자 선택)
- **App Store / Play Store 메타데이터** (Sprint 3 부터 이월)
- **네이티브 권한 세부** (카메라 / 위치 / 푸시 — 현 시점 불요)
- **Sprint 2 이월**: Sprint 1~3 task-N-impl 브랜치 main fast-forward 통합 (Sprint 4 의 task-1 이 Sprint 3 만 처리)

## ADR 링크
- `docs/adr/ADR-S4-001-mobile-validation-pipeline.md`
- `docs/adr/sprints/sprint-3.md` (선행)
- `docs/adr/ADR-S3-001-cross-platform-capacitor.md` (선행)
