---
sprint: 10
status: carry-over
to_sprint: 11
last_updated: 2026-05-10
---

# Sprint 10 → 11 핸드오프 — iOS 실기기 LLM init 막힘

## 요약
사용자 손작업 트랙 task-1 (Sprint 4 Phase B 실기기 UAT 본 수행) 이 **mediapipe LLM init 자체로 막혀** 측정 불가. peak_rss_mb / 콜드 스타트 / mediapipe / WebView 모두 적재 못 함. 다음 sprint 로 이월. Sprint 10 의 cmux task-2 (UAT 인프라 정비) 는 정상 완료 (b5980f7, review pass R1).

## 단말 / 환경
- **단말**: iPhone 17 Pro (`iPhone18,3`, name=김셈, UDID `57695B59-9B84-509C-9AD2-BF541D31A0EF`)
- **iOS SDK 26.4** (Xcode 26.x, iphoneos26.4)
- **메모리 한도**: WKWebView 단일 페이지 ~1.4-1.5GB (Apple 공식, [forum/133449](https://developer.apple.com/forums/thread/133449))
- **빌드 환경**: Mac mini, Apple Team `7CSDQM2CRV` (tpals0409@icloud.com Personal Team)

## 시도 1 — Gemma 4 E2B (1.86GB)
**결과**: WKWebView **process crash** (jetsam-like)

```
⚡️ [INSEOUL_LLM] init posted ... gemma-4-E2B-it-web.task
[PID=928] WebProcessProxy::didClose: (web process 0 crash)
WebPageProxy::dispatchProcessDidTerminate: reason=Crash
⚡️ WebView process terminated
⚡️ WebView loaded                              ← Capacitor 자동 reload
```

**Root cause**: 1.86GB single buffer 가 iOS WKWebView 한도 초과. mediapipe RC 0.10.36 도 못 막음 (메모리 정책은 mediapipe 코드의 영역이 아님).

**참조**: [mediapipe #6270 (gemma-4-E2B web crash)](https://github.com/google-ai-edge/mediapipe/issues/6270), [#5757 (iOS std::bad_alloc)](https://github.com/google-ai-edge/mediapipe/issues/5757), [#5976 (8GB RAM 단말 E2B 부팅 실패)](https://github.com/google-ai-edge/mediapipe/issues/5976).

## 시도 2 — Gemma 3 1B int4-web (528MB) + mediapipe 0.10.36-rc
**결과**: `ModuleFactory not set.` 무한 루프

```
⚡️ [INSEOUL_LLM] ensureReady rejected ModuleFactory not set.   ← 200+회 반복
```

**Root cause 추정**: RC 의 js bundle 이 jsdelivr default tag (stable 0.10.27 wasm) 와 mismatch. 또한 AiSheet useEffect 의 `[advisor]` deps 가 advisor reference 변경 시 매번 재트리거 → ensureReady 무한 호출.

## 시도 3 — Gemma 3 1B + mediapipe 0.10.27 + 명시 wasm 버전 + AiSheet ref guard
**조치**:
- mediapipe 다운그레이드 → 0.10.27 stable
- `MEDIAPIPE_WASM_BASE` → `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.27/wasm` (cdn cache 변동 회피)
- `AiSheet.tsx` 의 `ensureReadyOnceRef` 박아 한 번만 호출

**결과**: 무한 루프는 200회 → **3회로 감소** (ref guard 부분 작동, mount/unmount 시 재발). 그러나 trace 로깅 0건 — worker 가 init 메시지를 받기 전 죽는 패턴.

```
⚡️ [INSEOUL_LLM] ensureReady rejected ModuleFactory not set.   ← 3회만
⚡️ [INSEOUL_LLM] init posted {url: ".../gemma3-1B-it-int4.task"}
(이후 trace 0건. worker bootstrap-start 도 안 옴)
```

## 시도 4 — eager init + worker 부트스트랩 trace 강화
**조치**:
- AdvisorProvider mount 시 즉시 `ensureReady()` 호출 (앱 launch = 모델 다운로드 시작)
- worker top-level dynamic import + 단계별 trace (bootstrap-start / before-import / after-import / llm-instantiated)
- main thread `worker:constructing` / `worker:constructed` trace
- `self.addEventListener('error')` + `'unhandledrejection')` 핸들러로 silent death 캐치

**결과**: 사용자 보고 — 여전히 동일 문제. 다음 sprint 이월 결정.

## 현재 코드 상태 (sprint-10-llm-debug 브랜치)
변경 파일 (commit 됨):
- `src/ai/AdvisorContext.tsx` — eager init + ref guard
- `src/ai/hooks/useLLM.ts` — worker construct trace + onMessage trace forward + worker error trace
- `src/ai/llm/mediapipe.ts` — init() 단계별 trace (`init:enter` / `host-ok` / `webgpu-ok` / `fileset-ok` / `fetch-ok` / `gpu-ok` / `gpu-fail`) + wasm URL 명시 버전
- `src/ai/llm/types.ts` — `WorkerOutTraceMsg` type 추가
- `src/ai/worker/llm.worker.ts` — bootstrap trace + dynamic import 패턴 + self error/rejection 핸들러
- `src/screens/sheets/AiSheet.tsx` — `ensureReadyOnceRef` 박아 한 번만 호출

로컬 전용 (commit 금지):
- `ios/App/App.xcodeproj/project.pbxproj` — `DEVELOPMENT_TEAM` `3RR93ZTUZC → 7CSDQM2CRV`, `PRODUCT_BUNDLE_IDENTIFIER` `com.inseoul.app → com.inseoul.app.tpals0409`
- `.env.local` — `VITE_LLM_BACKEND=mediapipe` + `VITE_GEMMA_MODEL_URL=https://huggingface.co/K4N4T/gemma3-1B-it-int4.task/resolve/main/gemma3-1B-it-int4.task` (528MB ungated mirror, 4 미러 byte 동일)

## Sprint 11 시작 시 first action
**권장 흐름**: sprint-10-llm-debug 브랜치 위에 새 commit 으로 진행.

```bash
git checkout sprint-10-llm-debug
# main 변경 흡수 필요 시:
git rebase main
# 새 작업 브랜치:
git checkout -b sprint-11-task-N-impl
```

## 시도해볼 다음 후보 (우선순위순)

### A. wasm 자체 호스팅 — jsdelivr CDN 의존 제거 (가장 결정적)
mediapipe 의 wasm 파일을 `node_modules/@mediapipe/tasks-genai/wasm/` 에서 `public/wasm/` 으로 복사 + Vite 가 dist 에 inline. `MEDIAPIPE_WASM_BASE` 를 `/wasm` (relative) 로 변경.

**장점**: cdn fetch 실패 / WKWebView 의 cross-origin wasm streaming 정책 / cache 변동 모두 회피.
**비용**: vite 빌드에 wasm copy step 추가 (~10분).

### B. main thread 에서 mediapipe 직접 사용 — worker 우회
`useLLM.ts` 의 mediapipe path 가 Worker 쓰는데, 528MB 정도면 main thread 에서 처리해도 UI freeze 짧음. 진짜 root cause 가 *worker 내 wasm streaming* 이면 해결.

**장점**: worker / cross-origin / module factory 이슈 전부 회피.
**비용**: useLLM 의 mediapipe 분기 재작성. UI freeze 위험.

### C. WebGPU 지원 명시 점검
`assertWebGpu()` 가 통과하는지 확인. iPhone 17 Pro Safari 의 WKWebView 가 정말 WebGPU 지원하는지 검증.

```
설정 → Safari → 고급 → 실험적 기능 → "WebGPU" ON 확인
```

또는 WebGPU 미지원이면 mediapipe 의 CPU backend 명시 (`createFromOptions({delegate: 'CPU'})`)

### D. mediapipe RC 재시도 + 명시 버전 wasm
시도 2-3 의 조합 미흡. RC 0.10.36 + wasm URL `@0.10.36-rc.20260507` 명시. 다만 RC 안정성 낮음.

### E. Capacitor 의 console plugin / WKWebView 가 worker console 을 forward 하는지 점검
worker 에서 직접 `console.log` 호출이 native log 에 안 보임 → 우리는 `postMessage({type:'trace'})` 로 우회. 근데 worker 가 죽으면 아무 메시지도 못 보냄. main thread 의 worker.onerror 가 동작하는지 별도 검증 필요.

## 참고 자료 (시도 1 검색 결과)
- [Gemma 4: Byte for byte — Google Blog](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/)
- [mediapipe #6270](https://github.com/google-ai-edge/mediapipe/issues/6270)
- [mediapipe #5757](https://github.com/google-ai-edge/mediapipe/issues/5757)
- [mediapipe #5976](https://github.com/google-ai-edge/mediapipe/issues/5976)
- [Apple Developer Forums — WKWebView memory budget](https://developer.apple.com/forums/thread/133449)
- [Capacitor #5260 — WKWebView memory pressure](https://github.com/ionic-team/capacitor/discussions/5260)
- [WebGPU bugs holding back browser AI (Medium)](https://medium.com/@marcelo.emmerich/webgpu-bugs-are-holding-back-the-browser-ai-revolution-27d5f8c1dfca)

## 잔존 task (Sprint 11 으로 이월)
1. **iOS 실기기 UAT 본 수행** — 모델 init 막혀서 측정 0건. peak_rss_mb / 콜드 스타트 / mediapipe / WebView. (Sprint 8 → 9 → 10 → 11 세 번째 이월)
2. **Gemma 4 의지** — 1.86GB 가 WKWebView 한도 초과 확인. iPhone UAT 에선 Gemma 3 1B 또는 더 작은 모델로 변경 필요.
3. **cmux 워커 worktree 분리** — Sprint 9 이월 그대로 (메타 작업, 별도 세션).
