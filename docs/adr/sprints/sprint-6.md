# Sprint 6 — Phase B UAT 인프라 정비 (실기기 path)

**상태**: 완료 (2026-05-10 단일 세션)
**기간**: 2026-05-10 (단일 세션, 약 1시간)
**start_commit → end_commit**: `c139be3` → `72ab349` (origin push 완료)

## 목표

Sprint 4 Phase B 실기기 UAT 가 매끄럽게 진행되도록 *주변 인프라* 정비. 시뮬레이터 한정인 `mobile:*` 스크립트의 실기기 분기 추가, UAT 결과 수집 자동화, 모바일 troubleshooting 카탈로그. UAT 자체 (task-5) 는 사용자 손작업으로 분리.

## 작업 결과

| Task | 제목 | verdict | rounds | impl commit | merge commit |
|---|---|---|---|---|---|
| 1 | 실기기 빌드/install 자동화 | pass | 1 | `b4ea12f` | `67282a2` |
| 2 | 실기기 메모리 측정 보강 | pass | 2 | `e859635` (R2) | `948699d` |
| 3 | UAT 결과 템플릿 + 수집 자동화 | pass | 2 (R1=race) | `16b63dd` | `72ab349` |
| 4 | README + troubleshooting 카탈로그 | pass | 2 (R1=cross-task dep) | `62fa077` (R2) | `7e6bb0e` |
| 5 | 실기기 UAT 실행 (사용자 손작업) | **이월 → Sprint 7** | — | — | — |

### 산출물

- **scripts/mobile-launch.sh** (+143/-16): `--device <udid|serial>` 옵션, USB 자동 감지 (`xcrun devicectl list devices` / `adb devices`), `npm run mobile:ios:device` / `mobile:android:device` 신규 npm script.
- **scripts/mobile-mem-measure.sh** (+309/-23): iOS `xctrace record --template Allocations` + `xcrun devicectl device info processes` fallback, Android `adb -s <serial>` 일관 적용 (logcat 포함), `--device` 옵션, `--dry-run` 분기.
- **.planning/sprint/6/uat-results-template.md** (신규, +47): Sprint 4 §기록양식의 iOS/Android 필드 그대로 반영. `host`, `peak_rss_mb`, `peak_dirty_mb`, `peak_pss_mb`, `native_heap_mb`, `egl_mtrack_mb`, `rag_response_quality`, `issues`.
- **scripts/collate-uat.mjs** (신규, +139): Node ESM. stdin/파일 입력 → iOS/Android 섹션 Markdown 표 출력. `npm run uat:collate`. 누락 필드 `—`.
- **README.md** (+43): 실기기 빌드 섹션 신규 — Xcode signing/team, USB trust, Android 개발자 옵션 + USB 디버깅, `npx cap run <platform> --target <UDID|serial>` 흐름.
- **docs/uat-troubleshooting.md** (신규, +87): 4건 카탈로그 — cert untrusted (iOS), USB unauthorized (Android), mediapipe 모델 다운로드 실패, OOM/메모리 부족. 증상 → 원인 → 해결책.
- **package.json** (+5/-1): `mobile:ios:device`, `mobile:android:device`, `uat:collate` 3개 script 추가.

누적: 7 files (3 신규), +756/-40 line.

## 검증 요약 (Codex Review)

- **총 task**: 4 (+ 사용자 task-5)
- **1라운드 통과율**: 1/4 (25%) — task-1 만
- **평균 라운드**: 1.75
- **escalation**: 0건
- **review 파일 인덱스**:
  - `.planning/sprint/6/reviews/task-1.md` (R1 pass)
  - `.planning/sprint/6/reviews/task-2.md` (R1 reject → R2 pass)
  - `.planning/sprint/6/reviews/task-3.md` (R1 reject [race] → R2 pass)
  - `.planning/sprint/6/reviews/task-4.md` (R1 reject [cross-task dep] → R2 pass)

### 머지된 commit (origin push 완료, c139be3 → 72ab349)

```
72ab349 merge: s6-task-3 — UAT 결과 템플릿 + collate 자동화 (R2 pass after race-condition R1)
948699d merge: s6-task-2 — 실기기 메모리 측정 보강 (ADB_S logcat + xctrace iOS, R2 pass)
7e6bb0e merge: s6-task-4 — README 실기기 가이드 + UAT troubleshooting (R2 pass)
67282a2 merge: s6-task-1 — 실기기 빌드/install 자동화 (mobile:ios:device + mobile:android:device)
16b63dd feat(uat): add Sprint 6 실기기 UAT 결과 양식 + collate 자동화
e859635 fix(s6-task-2): R2 — pin android logcat to ADB_S + xctrace iOS sampler
62fa077 docs(sprint-6): task-4 review pass — npm script 가정 제거, Capacitor CLI 직접 사용
89707b6 docs(sprint-6): task-4 — README 실기기 가이드 + UAT troubleshooting 카탈로그
178778f feat(s6-task-2): real-device mem measurement — iOS devicectl + Android adb -s
b4ea12f feat(mobile): add real-device install/launch — mobile:ios:device, mobile:android:device
```

### 통합 회귀 (각 머지 후)

| 시점 | lint | vitest | playwright (chromium) | build |
|---|---|---|---|---|
| post-task-1 (`67282a2`) | 0e/0w | 128/128 | (생략) | OK |
| post-task-4 (`7e6bb0e`) | 0e/0w | 128/128 | (생략) | OK |
| **최종 (`72ab349`)** | **0e/0w** | **128/128** | **10/10** | **SUCCESS** |

ADR-S2-001 baseline 0 유지.

## 신규 결정 / 패턴 / 교훈

### 1. review 워커 commit 도달 전 폴링 → false reject (task-3 R1)

**증상**: task-3 codex review 가 impl 워커의 commit `16b63dd` 도달 직전 자체 폴링으로 검증 시작 → `git diff 67282a2..s6-task-3-impl` 결과 empty → "필수 산출물 누락" 으로 R1 REJECT.

**근본 원인**: review 프롬프트 가 "[IMPL_DONE] 시그널 또는 폴링" 으로 명시 — 시그널 도달 *못 한* 상태에서 폴링이 활성화되면 commit 시점 race 발생. impl 워커가 IMPL_DONE 발신 *전* 에 `git log` 폴링이 hit 하면 직전 base commit (67282a2) 이 head 로 보여서 빈 diff.

**해결**: 오케스트레이터가 명시적 R2 nudge 송신 (impl 워커가 보낸 cmux send 도 도달 안 함). R2 에서 동일 commit 16b63dd 검증 → PASS.

**적용**: review 프롬프트의 폴링 조건을 강화 — *최소 1개 신규 commit (HEAD ≠ base) 확인 후* 검증 시작. 또는 IMPL_DONE display-message 도달 *전엔 절대 폴링 금지*. → `feedback_review_polling_race.md` 신규 메모.

### 2. cross-task rebase + fork_point_override (ADR-S5-001 옵션 D 확장)

**증상**: task-4 R1 reject 사유 = "task-1 의 신규 npm script `mobile:ios:device` / `mobile:android:device` 가 task-4 브랜치 `package.json` 에 없음" → README/troubleshooting 의 명령 안내가 `npm ERR! Missing script`.

**근본 원인**: task-4 fork_point = `c139be3`, task-1 변경분 미흡수. impl prompt 에서 "task-1 머지 기다리지 말고 명칭 가정" 안내했으나 codex review 가 합리적으로 거부.

**해결**: task-1 main 머지 후 task-4 워크트리 `git rebase main` → 새 fork_point = `67282a2` (task-1 머지 commit). dispatch.json `fork_point_override` 필드 추가 + R2 review prompt 의 diff base 갱신. R2 에서 task-4 자율 commit (`62fa077`: npm script 가정 제거 + Capacitor CLI 직접 사용 `npx cap run ios/android --target <UDID|serial>`) → PASS.

**적용**: ADR-S5-001 옵션 D 의 자연스러운 확장. Wave N task 가 Wave N-1 의 머지 결과를 흡수해야 할 때 rebase + fork_point_override 가 표준. *주의: rebase 는 동일 task 의 review 진행 중에는 금지* (R1 진행 중 rebase 는 R1 verdict 의 commit hash 무효화). → `feedback_cross_task_rebase.md` 신규 메모.

### 3. codex 신규 부팅 auto-update 함정 (ws:4)

**증상**: task-1 review 워커 (codex) 부팅 시 `npm install -g @openai/codex` 자동 update 트리거 (`v0.129.0 → v0.130.0`) → "Please restart Codex" → codex 자체 종료 → cmux send prompt 가 zsh shell 로 흘러감 (`zsh: no matches found: [IMPL_DONE]`).

**해결**: shell 상태에서 `codex` 명령 재실행 + Enter → 0.130.0 부팅 후 prompt 재송신.

**적용**: `/start` 7단계의 codex 워커 부트스트랩 직후 자동 update 가능성 인지. 첫 prompt 송신 후 1회 read-screen 으로 codex 부팅 확인 + 필요 시 재부팅 fallback. → `feedback_codex_auto_update_on_boot.md` 신규 메모.

### 4. 사용자 워커 페인 직접 입력 위험 (ws:3, ws:5)

**증상**:
- ws:3 (task-1 impl) 에 사용자가 `❯ review 워커 시작해줘` 직접 입력 — impl 워커가 review 책임 진다고 오해할 위험
- ws:5 (task-2 impl) 에 사용자가 `❯ /end` 직접 입력 — 워크플로우 종료 명령을 impl 안에서 실행하면 안 됨

**해결**: 오케스트레이터가 정정 nudge 송신 + 사용자에게 "워커 페인은 직접 입력하지 마시고 메인 세션에 말씀해주세요" 안내.

**적용**: 사용자 행동 메모. /start 9단계 핸드오프 안내에 명시 강화. (영구 메모는 아님 — sprint-6.md 에만 기록)

### 5. 운영 효율성 인사이트

- **Wave 2 부트스트랩 자동화 효과**: task-1 PASS 직후 task-3 워크트리 + 워커 페어 부트스트랩 → 4 task 모두 동시 진행. wall-clock ~1시간.
- **자율 R2 commit 효과**: task-4 review codex 의 cmux send 핵심 지적이 impl 워커에 자동 도달 → impl 워커 자율 R2 commit (`62fa077`). 오케스트레이터 개입 0. Sprint 5 의 "review 워커 IMPL_DONE 자동 도달 보장 부재" 의 *반대 방향* (impl 방향 cmux send 는 안정).
- **task-2 R2 잔여 리스크**: iOS 실기기 메모리는 xctrace 시도 + fallback 구현했으나 review codex 환경에 paired physical device 없어 실제 numeric sample 은 UAT 한정. 이 부분이 **task-5 (실기기 UAT) 의 핵심 검증 항목**.

## 이월 항목

- **task-5 (실기기 UAT) → Sprint 7**: 사용자 결정 (이번 세션에서 미수행). Sprint 7 강력 후보로 등록.
  - 활용 가능 인프라: `mobile:ios:device` / `mobile:android:device` / `mobile:mem:ios --device` / `mobile:mem:android --device` / `uat:collate` / `docs/uat-troubleshooting.md`
  - 검증 핵심: iOS xctrace numeric sample 실제 동작 + Android dumpsys meminfo 실제 측정 + mediapipe 1~2GB 다운로드 + RAG 응답 품질 + peak RSS/PSS

## 후속 처리

- 신규 메모 3건: `feedback_review_polling_race.md`, `feedback_cross_task_rebase.md`, `feedback_codex_auto_update_on_boot.md`
- ADR-S5-001 본문에 옵션 D 확장 (cross-task rebase 시 fork_point_override) 추가는 *생략* — sprint-6.md 의 §2 결정/패턴 #2 가 SSOT, 메모 인덱스로 도달 가능.
