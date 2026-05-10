# Sprint 10 — Xcode 로 다시 테스트 진행 (실기기 UAT 본 수행)

## 기간
2026-05-10 (단일 세션, 약 4시간 — 사용자 손작업 트랙 LLM 디버깅 + cmux task-2)

## start_commit → end_commit
679ce37 → 8d72ef4 (task-2 머지 commit)

## 작업 결과
| Task | 제목 | verdict | rounds | commit |
|---|---|---|---|---|
| 1 | Xcode 통한 iOS 실기기 UAT 본 수행 (사용자 손작업) | **이월** | — | (Sprint 8 → 9 → 10 → 11 세 번째 이월) |
| 2 | UAT 인프라 정비 — sprint-10 결과 템플릿 신규 + troubleshooting 갱신 | pass | 1 | b5980f7 → merge 8d72ef4 |

## 검증 요약 (Codex Review)
- 총 cmux task: 1 (task-2)
- 1라운드 통과율: **1/1**
- 평균 라운드: 1
- escalation: 0건
- 총 task (사용자 손작업 포함): 2 — pass 1, 이월 1
- review 파일 인덱스:
  - `.planning/sprint/10/reviews/task-2.md` (R1 pass — `b5980f7` 검증)

## 신규 결정 / 패턴 / 교훈

### 1. iOS WKWebView 단일 페이지 메모리 한도 ~1.5GB — on-device LLM 모델 size 가드 (신규 메모)
사용자가 Sprint 4 Phase B 의 실기기 UAT (peak_rss_mb / 콜드 스타트 / mediapipe / WebView 측정) 를 Xcode 로 직접 시도. 본 측정 전 `.env.local` 에 mediapipe 백엔드 + Gemma 4 E2B-it-web.task (~1.86GB) URL 적재 후 ⌘R. 첫 실행에서 모델 100% 다운로드 도달 직후 native log 에 결정적 패턴 발견:

```
⚡️ [INSEOUL_LLM] init posted ... gemma-4-E2B-it-web.task
[PID=928] WebProcessProxy::didClose: (web process 0 crash)
WebPageProxy::dispatchProcessDidTerminate: reason=Crash
⚡️ WebView process terminated   ← 결정적
⚡️ WebView loaded               ← Capacitor 자동 reload
```

= 1.86GB single buffer 가 iOS WKWebView 한도 초과 → process crash → Capacitor 자동 reload → 무한 다운로드 루프. 웹 검색으로 industry-known 함정 확인:

- [mediapipe #6270](https://github.com/google-ai-edge/mediapipe/issues/6270) — `gemma-4-E2B-it-web.task` 가 데스크톱 Chrome / M4 에서도 `RuntimeError: memory access out of bounds`
- [mediapipe #5757](https://github.com/google-ai-edge/mediapipe/issues/5757) — 2.16GB Llama-3.2-1b-q8.task iOS `std::bad_alloc`
- [mediapipe #5976](https://github.com/google-ai-edge/mediapipe/issues/5976) — Gemma 3n E2B 8GB RAM 단말 `Array buffer allocation failed`. **Gemma 3 1B / Gemma 2 2B 는 OK** (reporter 직접 증언)
- [Apple forum/133449](https://developer.apple.com/forums/thread/133449) — iOS WebKit 단일 페이지 max memory 1.4-1.5GB 공식 명시

**처방**:
- iPhone WKWebView 용 on-device LLM 모델은 **≤ 1GB int4 양자화** 권장
- Gemma 4 family 의 .task 는 E2B (1.86GB) 가 최소 — iPhone UAT 에선 사용 불가
- 검증된 안전 path: `litert-community/Gemma3-1B-IT` (gemma3-1b-it-int4-web.task ~554MB)
- ungated mirror (예: `K4N4T/gemma3-1B-it-int4.task`) 가 라이선스 동의 0건으로 즉시 사용 가능. 4 mirror byte 동일 (554,661,243) = 변조 위험 사실상 0
- src/ai/llm/mediapipe.ts 의 `MODEL_MAX_BYTES` (현재 2GiB) 는 iPhone 한도와 별개 — iPhone UAT 시 코드 한도 와는 무관하게 1.5GB 함정 존재

### 2. mediapipe `ModuleFactory not set.` 무한 루프 — Sprint 11 미해결 fix 후보 (신규 메모)
Gemma 3 1B (528MB, 한도 안전) 후퇴 후 새로운 함정. 100% 다운로드 도달 전부터 main thread 의 `ensureReady` catch 가 `ModuleFactory not set.` 메시지를 200+회 반복 receive. trace 로깅 (worker bootstrap / mediapipe init 단계별) 박았으나 worker 자체 trace 0 건 — worker 가 init 메시지를 받기 전에 죽거나 송신 자체 실패.

다음 시도 후보 (`.planning/sprint/10/llm-debug-handoff.md` 우선순위순):
1. **wasm 자체 호스팅** (jsdelivr CDN 의존 제거 — `node_modules/@mediapipe/tasks-genai/wasm/` → `public/wasm/` 복사 + `MEDIAPIPE_WASM_BASE` relative path)
2. main thread 에서 mediapipe 직접 사용 — Web Worker 우회
3. WebGPU 지원 명시 점검 + CPU delegate 강제
4. mediapipe RC + 명시 버전 wasm 재시도
5. worker console 의 native bridge forward 동작 검증

### 3. main 트랙 코드 디버깅은 별도 디버그 브랜치로 격리 (재확인 + 강화)
사용자 손작업 트랙 (task-1 UAT) 이 LLM 코드 영역에 fix 가 필요한 상황 발생. cmux task-2 review 워커가 검증 중인 task-2-impl 브랜치에서 main 트랙 코드를 동시 수정하면 review 게이트 영역 (docs/.planning) 이 흐려짐. 이번 sprint 에서 `git stash → main checkout → 새 디버그 브랜치 → stash pop` 패턴으로 분리 적용.

**부수 함정**: stash/pop 과정에서 일부 파일의 변경이 *손실* 됨 (Sprint 10 에서는 mediapipe.ts / types.ts / useLLM.ts / AiSheet.tsx 의 일부 trace 코드가 사라져 재박해야 했음). git stash 의 conflict 자동 처리 이슈로 추정. **처방**: stash pop 후 즉시 grep 으로 변경 적용 검증 의무.

### 4. 사용자 손작업 트랙의 로컬 전용 변경 (commit 금지) 패턴 정착
사용자 본인의 codesigning override 가 필요한 단계 (Apple Team ID, bundle ID) 가 등장. `ios/App/App.xcodeproj/project.pbxproj` 의 `DEVELOPMENT_TEAM` (3RR93ZTUZC → 7CSDQM2CRV) + `PRODUCT_BUNDLE_IDENTIFIER` (com.inseoul.app → com.inseoul.app.tpals0409) 두 곳을 sed 로 swap 후 **working tree 에만 두고 commit 금지**. 협업자 빌드 깨짐 방지. `.env.local` (gitignored) 도 같은 카테고리. 이 패턴은 Sprint 11+ 에서도 반복될 것 — 향후 xcconfig 분리로 정공법 fix 검토.

## ADR 와 별도 자산 (영구 보존)
- `.planning/sprint/10/dispatch.json` — 디스패치 매니페스트
- `.planning/sprint/10/reviews/task-2.md` (R1 pass)
- `.planning/sprint/10/uat-results.md` — task-2 작성 템플릿 (사용자 측정값 미기재, Sprint 11 작성 예정)
- `.planning/sprint/10/llm-debug-handoff.md` — Sprint 11 LLM fix 핸드오프 (단계별 시도 결과 + 5개 fix 후보)
- 머지 commit: `8d72ef4` (--no-ff, parents `679ce37` + `b5980f7`). origin/main push 완료.
- 디버깅 브랜치: `sprint-10-llm-debug` (commit `f67f3f1`, Sprint 11 base)

## 이월 항목

### task-1 — Sprint 4 Phase B 실기기 UAT 본 수행 (Sprint 11)
- Sprint 8 → 9 → 10 → **Sprint 11** 으로 네 번째 sprint 이월. 측정값 0건 적재 (LLM init 자체로 막힘).
- Sprint 11 의 첫 task: LLM init 정상화 (위 §2 fix 후보 1번 wasm 자체 호스팅 권장) 후 advisor 답변 정상 → peak_rss_mb / 콜드스타트 / WebView 측정 진행.
- 모델은 **Gemma 3 1B int4-web (~554 MB)** 으로 확정 (Gemma 4 의지 폐기 — §1 한도 초과).

### cmux 워커 worktree 분리 (Sprint 11+)
- Sprint 9 → 10 → 11 두 번째 이월. `/start` skill 메타 작업이라 자체 수정 중 cmux 워커 띄우면 위험. 별도 세션 권장.
