# Sprint 7 — Sprint 4 Phase B UAT (실기기 검증) → 시뮬레이터 smoke 로 변경

## 기간
2026-05-10 (단일 세션)

## start_commit → end_commit
`72e2ce4` → `02863dd` (1 commit, origin push 보류)

## 모드
**no_workers** (워커 0쌍). 사용자 결정: 실기기 UAT 자체가 손작업이라 cmux 워커 부적합. /start 단계에서 dispatch.json `mode=no_workers` 로 기록.

## 작업 결과
| Task | 제목 | owner | verdict | rounds | commit |
|---|---|---|---|---|---|
| 1 | iPhone 실기기 UAT | user | **변경** → iOS 시뮬 smoke 로 진행 | — | — |
| 2 | Android 실기기 UAT | user | **미수행** | — | — |
| 3 | ADR + sprint-window 갱신 | orchestrator (/end) | done | — | (이 ADR) |

## 모드 변경 사유
사용자가 진행 도중 "실기기 준비 어려움 → 시뮬레이터로 동작만 검증" 으로 방향 전환. 시뮬레이터의 측정값 (peak_rss_mb 등) 은 macOS 호스트 메모리 모델이라 실기기 UAT 결과로 사용 불가 — 별도 `smoke-ios.md` 에 기록, `uat-results.md#iOS/#Android` 측정 필드는 의도적으로 비어있음. 이로 인해 본래 task-1/2 (실기기 UAT) 는 Sprint 8 로 이월.

## 검증 요약 (Codex Review)
- 총 task: 3 (no_workers 모드라 review 워커 미사용)
- review 파일: 0건 (`.planning/sprint/7/reviews/` 비어있음 — 정상)
- 1라운드 통과율: N/A
- escalation: 0건

## 핵심 산출물

### Commit `02863dd` — fix(mobile): launch_ios xcodebuild 가 SwiftPM 구조 따르도록
**Sprint 6 인프라 회귀 발견 후 즉시 fix**. `scripts/mobile-launch.sh:234` 의 `-workspace ios/App/App.xcworkspace` 가 Capacitor SwiftPM 통합 (`ios/App/CapApp-SPM`) 프로젝트의 실제 파일 구조와 어긋남 (워크스페이스 부재). 시뮬 분기는 Sprint 6 review 에서 검증되지 않아 누락. `-project ios/App/App.xcodeproj` 로 교체.

### `.planning/sprint/7/smoke-ios.md` — finding 5건 정리
시뮬 smoke 단계에서 **5건의 finding** 발견. 그 중 1건은 즉시 fix, 4건은 Sprint 8 이월:

| # | finding | 영향도 | 상태 |
|---|---|---|---|
| F1 | `mobile-launch.sh` sim 분기 SwiftPM 회귀 | infra | ✅ fix `02863dd` |
| **F5** | **`.env` 부재 → AI 항상 template fallback** | **AI 핵심 기능 무력화** | **P0**, Sprint 8 |
| F2 | TweaksPanel production bundle leak | UX/계약 위반 | P1, Sprint 8 |
| F3 | `import.meta.env.DEV` 가드 메커니즘 부재 (코드베이스 전체) | 시스템 결함 | P1 (F2와 통합) |
| F4 | iOS WebView pinch-zoom 가능 (4중 결함) | UX | P2, Sprint 8 |
| — | `mobile-launch.sh:157` `pick_ios_device_udid` `-workspace` 잔존 | infra | P3, Sprint 8 |

### `.planning/sprint/7/uat-results.md` — skeleton (의도적 미수집)
실기기 UAT 양식 사전 배치. 측정 필드는 시뮬값으로 채우면 데이터 오염되므로 의도적으로 비어둠. Sprint 8 에서 채워질 예정.

## 신규 결정 / 패턴 / 교훈

### 결정 1 — Sprint 7 의 가장 큰 가치는 "실기기 UAT 4시간 헛수고를 미리 막은 것"
사용자가 시뮬 smoke 에서 finding 5 (LLM backend 미설정 → AI template fallback) 를 즉시 알아챔. 만약 그대로 실기기 UAT 진행했다면 mediapipe 다운로드 / RAG 응답 / peak_rss 모두 *template fallback 측정* 이 되어 무의미한 데이터를 수집했을 것. **시뮬 smoke 가 실기기 UAT 의 효율적 사전 검증 단계로서 가치 있음** — 실기기 의존성과 무관한 production 빌드 결함을 빠르게 발견.

### 결정 2 — 모드 변경 시 결과물 분리 원칙
사용자가 도중에 "실기기 → 시뮬레이터" 로 모드 변경 시, 본래 결과 양식 (`uat-results.md`) 은 의도적으로 비워두고 별도 파일 (`smoke-ios.md`) 로 분리. 데이터 오염 방지 + 실기기 UAT 가 의미 있게 진행될 수 있도록 보존.

### 패턴 1 — Sprint 6 review 체크리스트 보강 필요
Sprint 6 task-1 review 가 `ios-device` 분기는 검증했으나 `ios` (시뮬) 분기는 미검증 → SwiftPM 구조 미스매치가 다음 스프린트로 leak. **review prompt 에 "시뮬+실기기 양쪽 분기 강제 검증" 항목 추가 필요**. Sprint 8 의 review 워커 prompt 갱신 또는 ADR-S5-001 옵션 D 확장으로 반영 가치.

### 패턴 2 — "production bundle 토큰 grep" 이 가벼우면서 강력한 회귀 가드
`grep -c "DEV TWEAKS" dist/assets/*.js` 한 줄로 TweaksPanel leak 을 즉시 탐지. CI 에 통합하면 dev/prod 가드 누락 시 자동 fail. Sprint 8 에서 일반화 (`__DEV__`, `vitest`, `fixture`, `dev/` 등) 한 회귀 가드 후보.

### 교훈 1 — `.env.example` 만 git tracked 의 위험
프로젝트가 `.env.example` 만 추적하고 `.env.production` 은 부재 — 빌드 결과물의 LLM backend 가 'none' 으로 떨어지는데 빌드/타입체크는 모두 통과. 핵심 환경 변수를 정적 보장 없이 런타임에만 검증하는 게 위험. Sprint 8 에서 vite plugin 또는 빌드 사전 스크립트로 필수 환경 변수 assert 가드.

### 교훈 2 — UI 의 mode 라벨이 finding 을 단축
사용자가 "AI 가 템플릿 모드임" 이라고 즉시 짚어준 건 `AiSheet.tsx:122` 의 "이 기기는 템플릿 모드" 라벨 덕분. 정직한 mode 라벨링이 디버깅 신호로서 가치. Sprint 8 fix 후보 3 (envBackend 빈 값 시 console.error + UI 라벨 강화) 의 근거.

## 이월 항목

### Sprint 8 task 후보 (우선순위 순)
1. **[P0]** `.env.production` 작성 + LLM backend 환경 변수 설정. mediapipe 디폴트 + Gemma3 model URL. 실기기 UAT 의 *전제 조건*. (Finding 5)
2. **[P1]** `App.tsx` TweaksPanel 가드 (`{import.meta.env.DEV && <TweaksPanel />}`) + `import.meta.env.DEV` 가드 메커니즘 일반화 + production bundle grep CI 회귀 가드. (Finding 2 + 3 통합)
3. **[P2]** iOS WebView pinch-zoom 4중 fix: viewport meta + CSS touch-action + JS gesturestart preventDefault + capacitor.config.ts ios 섹션. (Finding 4)
4. **[P3]** `scripts/mobile-launch.sh:157` `pick_ios_device_udid` `-workspace` 잔존 점검 — devicectl fallback 이 가렸을 가능성. (Finding 1 잔여 의심점)
5. **이후**: Sprint 4 Phase B 실기기 UAT 본 수행 (iPhone + Android, `uat-results.md` 채우기). P0 fix 후에야 의미 있음.

### 메타 결정 후보
- Sprint 8 review 워커 prompt 에 "시뮬+실기기 양쪽 분기 강제 검증" 항목 추가 (Sprint 6 회귀 패턴 방지).

## ADR 참조
- `docs/adr/ADR-S5-001-...` — review diff base / dispatch.json fork_point (적용 안 됨, no_workers 모드)
- `.planning/sprint/7/smoke-ios.md` — finding 상세 본문
- `.planning/sprint/7/uat-results.md` — 실기기 UAT skeleton (Sprint 8 채움)
- `.planning/sprint/7/dispatch.json` — no_workers manifest
