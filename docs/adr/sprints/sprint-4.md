# Sprint 4 — 실기기 빌드 + on-device LLM 검증 (Sprint 3 이월)

**상태**: 진행 중 (2026-05-09 시작)
**기간**: 2026-05-09 ~ (UAT 완료까지)
**start_commit**: `b27f24d`
**선행**: Sprint 3 (Capacitor 환경 구축, 5/5 task pass)

## 동기

Sprint 3 가 Capacitor 환경 구축까지만 끝내고 다음을 이월:
- 실기기 (iPhone + Android) 빌드/install/run 검증
- mediapipe on-device LLM 모델 다운로드 + RAG 응답 작동 확인
- on-device LLM 메모리 측정 (WKWebView / Chrome WebView)

또한 Sprint 3 의 4 개 `task-N-impl` 브랜치가 main 통합 보류 (사용자 결정 대기) 상태였으므로, Sprint 4 의 첫 작업은 통합.

## 작업 분할 (Phase A 자동화 + Phase B UAT)

| # | 제목 | 담당 | 의존 | 상태 |
|---|---|---|---|---|
| 1 | Sprint 3 main 통합 (task-1→2→3→4 순차 머지) | cmux 워커 (Claude impl + Codex review) | — | (진행 중) |
| 2 | 시뮬레이터/에뮬레이터 자동화 + console log 캡처 스크립트 | cmux 워커 | [1] | 대기 |
| 3 | on-device LLM 메모리 측정 스크립트 | cmux 워커 | [2] | 대기 |
| 4 | [UAT] iPhone 실기기 검증 | 사용자 | [3] | 대기 |
| 5 | [UAT] Android 실기기 검증 | 사용자 | [3] | 대기 |
| 6 | 본 ADR + ADR-S4-001 + README 갱신 | 오케스트레이터 직접 | [4,5] | 대기 |

## 결정

- **자동화/UAT 분담**: 시뮬레이터/에뮬레이터에서 검증 가능한 부분 (스크립트화) 은 워커, 실기기 USB/signing/사람 눈 평가는 사용자. 이유: cmux 워커는 호스트 GUI/물리 기기 제어 불가, 사용자 시간 소모 균형.
- **branch_prefix `s4-`**: Sprint 3 의 `task-N-impl` 와 충돌 회피. Sprint 5 부터도 동일 패턴.
- **Sprint 3 통합을 Sprint 4 task-1 로 흡수**: 별도 스프린트 만들기보단 Sprint 4 흐름의 자연스러운 선결 조건. main fast-forward 는 사용자 승인 후 (Sprint 2~3 패턴 유지 — origin push 까지만).

## 결과 (UAT 완료 후 채움)

### Phase A 자동화
- task-1: (대기)
- task-2: (대기)
- task-3: (대기)

### Phase B UAT
- task-4 (iPhone): (대기 — 사용자 보고)
- task-5 (Android): (대기 — 사용자 보고)

### 메모리 측정 (시뮬레이터 vs 실기기)
| platform | env | peak_rss_mb | mediapipe_loaded | note |
|---|---|---|---|---|
| iOS | 시뮬레이터 | TBD | TBD | scripts/mobile-mem-measure.sh ios |
| iOS | 실기기 | TBD | TBD | Xcode Instruments |
| Android | 에뮬레이터 | TBD | TBD | scripts/mobile-mem-measure.sh android |
| Android | 실기기 | TBD | TBD | dumpsys meminfo / chrome://inspect |

## 운영 인사이트 (스프린트 종료 시 채움)
- (TBD)

## 이월 (스프린트 종료 시 채움)
- (TBD)

## ADR 링크
- `docs/adr/ADR-S4-001-mobile-validation-pipeline.md` (자동화 스크립트 + UAT 분담 결정)
