# LLM silent-death 디버깅 가이드

Sprint 10 → 11 carry-over (`docs/.planning/sprint/10/llm-debug-handoff.md`) 의 fix 후보 E
("worker silent-death 의 trace 가 main thread / Capacitor 까지 forward 되는지 검증") 의 결과물.

**대상**: iOS WKWebView 위에서 `@mediapipe/tasks-genai` Web Worker 가 init 도달 전에
조용히 죽는 케이스. trace 단 한 줄도 안 보일 때 어디까지 살아있었는지 확인하는 매뉴얼.

## 왜 silent death 인가

- Web Worker 의 `console.log/warn/error` 는 **WKWebView Capacitor bridge 가 native log 로
  forward 하지 않는다**. Capacitor `loggingBehavior` 는 main JS context 만 후킹한다.
- 그래서 worker 는 `postMessage({type:'trace'})` 로 main 에 trace 를 보내고,
  main 의 `useLLM` 이 받아서 `console.warn('[INSEOUL_LLM]', stage, detail)` 로 native 에 기록한다.
- 그러나 worker module evaluation 이 throw 하면 trace 핸들러 자체가 등록되기 *전* 일 수 있고,
  worker 가 jetsam-kill 당하면 어떤 메시지도 못 보낸다.
- 그 경우 main thread 의 `worker.onerror` / `worker.onmessageerror` 가 유일한 단서다.

## trace forward 경로

```
┌─ main thread (useLLM) ────────────┐      ┌─ Web Worker (llm.worker) ─────┐
│                                    │      │                                │
│ ensureReady()                      │      │ <module evaluation>            │
│   ├─ worker:constructing           │      │   ├─ worker:bootstrap-start    │
│   ├─ worker:constructed   ◀──── ev │ post │   ├─ worker:before-import-…    │
│   │                                │ ◀────┤   ├─ worker:after-import-…    │
│   ├─ init posted          ────────▶│ post │   └─ worker:llm-instantiated   │
│   │                                │      │                                │
│   ├─ trace               ◀──── ev  │ post │ handleInit(modelUrl)           │
│   ├─ progress            ◀──── ev  │      │   ├─ init:enter                │
│   ├─ loading             ◀──── ev  │      │   ├─ host-ok                   │
│   ├─ ready               ◀──── ev  │      │   ├─ webgpu-ok                 │
│   │                                │      │   ├─ fileset-ok                │
│   │ <on failure>                   │      │   ├─ fetch-ok                  │
│   ├─ worker.onerror ◀── browser    │      │   ├─ gpu-ok ─ ready            │
│   ├─ worker.onmessageerror ◀───    │      │   └─ gpu-fail ─ error(init-…)  │
│   │                                │      │                                │
│   └─ worker:self-error   ◀──── ev  │ post │ self.addEventListener('error') │
│                                    │      │ self.addEventListener(         │
│                                    │      │   'unhandledrejection')        │
└────────────────────────────────────┘      └────────────────────────────────┘
```

## 어느 trace 까지 도달했는지로 root cause 압축

각 stage 가 안 들어오면 *그 직전 stage 와 그 stage 사이* 에서 죽은 것.

| 마지막 trace | 다음에 와야 했던 trace | 의심 root cause | 확인 방법 |
|---|---|---|---|
| (아무것도 없음) | `worker:constructing` | `useLLM` mount 자체가 안 됨 — `<AdvisorProvider>` 가 트리에 없거나 React unmount 직후 다시 mount 됨 | React DevTools / `[INSEOUL_LLM]` 패턴 검색 |
| `worker:constructing` | `worker:constructed` | `new Worker(...)` 가 throw — `import.meta.url` resolve 실패, vite worker bundle 누락 | `worker:construct-throw` trace + Network 탭에서 worker chunk URL |
| `worker:constructed` | `worker:bootstrap-start` | worker module **evaluation 자체** 가 throw — 보통 `@mediapipe/tasks-genai` top-level 의 wasm Module factory 초기화 실패 | `worker.onerror` 의 message/filename/lineno/stack 확인. Sprint 10 시도 2 의 `ModuleFactory not set.` 패턴 |
| `worker:bootstrap-start` | `worker:before-import-mediapipe` | dynamic import 직전 동기 코드에서 throw (현재 사실상 없음) | `worker:self-error` trace |
| `worker:before-import-mediapipe` | `worker:after-import-mediapipe` | mediapipe ESM 모듈 fetch / parse 실패 — cdn jsdelivr 변동, cross-origin wasm streaming 정책 거부 | `worker:import-mediapipe-throw` trace의 `phase: 'import-fail'` + stack |
| `worker:after-import-mediapipe` | `worker:llm-instantiated` | `new MediaPipeLLM()` 가 throw — 일반적으론 동기 wrapper 라 거의 발생 안 함 | `worker:llm-instantiate-throw` trace + stack |
| `worker:llm-instantiated` | `init:enter` | main 이 `init` 메시지를 안 보냈거나 worker 가 message 이벤트 전에 죽음 | `[INSEOUL_LLM] init posted` 가 main 에 있는지 |
| `init:enter` | `host-ok` | model URL 의 host 검증 실패 (allow-list 미통과) | `error.message` 에 `unsupported` prefix |
| `host-ok` | `webgpu-ok` | WebGPU 미지원 (iOS Safari 실험적 기능 OFF, simulator) | `error.message` 에 `unsupported: webgpu` |
| `webgpu-ok` | `fileset-ok` | `FilesetResolver.forGenAiTasks` 실패 — wasm base URL fetch 거부 | wasm URL 직접 curl 로 200 확인 |
| `fileset-ok` | `fetch-ok` | model `.task` 파일 fetch 실패 — HuggingFace 401/403, CDN 차단, redirect mismatch | model URL 직접 curl + `Content-Length` 확인 |
| `fetch-ok` | `gpu-ok` 또는 `gpu-fail` | GPU 업로드 도중 jetsam-kill — model 이 WKWebView 메모리 한도 (~1.5GB) 초과 | iOS 콘솔에 `WebProcessProxy::didClose` + `WebContent process … crash` 로그. Sprint 10 시도 1 의 Gemma-4 1.86GB 패턴 |
| `gpu-fail` | (X) | GPU 업로드 자체 실패 — model 파일 corrupt 또는 unsupported quantization | `error.detail` 의 mediapipe 메시지 |

## main thread 단서

`worker:bootstrap-start` 가 안 들어오면 `console.error` 의 `[INSEOUL_LLM] worker.onerror` 한 줄이
유일한 단서. 다섯 필드를 다 본다:

```
[INSEOUL_LLM] worker.onerror {
  message: 'ModuleFactory not set.',
  filename: 'https://cdn.jsdelivr.net/.../tasks-genai-bundle.mjs',
  lineno: 1234,
  colno: 56,
  stack: 'Error: ModuleFactory not set.\n  at … '
}
```

- **filename** 으로 어느 모듈에서 죽었는지 (mediapipe wrapper 인지, wasm glue 인지) 압축.
- **stack** 으로 비동기 chain (top-level await import → Module init) 의 어느 frame 에서 throw 했는지 확인.
- **`worker.onmessageerror`** 가 뜨면 worker→main postMessage payload 가 structured-clone 실패한 것.
  Sprint 10 시점 schema 에선 거의 발생 안 함 (string/number/object 만 보냄). 떴다면 worker schema 변경 흔적.

## Capacitor 설정과 worker 의 관계

- `capacitor.config.ts` 의 `loggingBehavior: 'debug'` 는 **main JS context** 의 `console.*` 만 native log 로 forward.
- Worker scope 의 `console.log` 는 forward 안 됨 — `postMessage({type:'trace'})` 로 main 에 보내야 한다 (현재 방식).
- iOS UAT 시 Xcode 콘솔 / `xcrun simctl spawn booted log stream --predicate 'subsystem contains "InSeoul"'` 로 `[INSEOUL_LLM]` prefix 추적.

## Sprint 10 carry-over 의심 케이스 매핑

| 현상 | 마지막 trace | 본 가이드 표상의 의심 지점 |
|---|---|---|
| 시도 1: Gemma-4 1.86GB → WKWebView crash | `fetch-ok` 후 침묵 | `fetch-ok → gpu-ok/fail` 사이 jetsam-kill |
| 시도 2: `ModuleFactory not set.` 200회 | `init posted` 까지 (worker bootstrap trace 0건) | `worker:constructed → worker:bootstrap-start` 사이 — top-level mediapipe wasm Module factory init throw |
| 시도 3: 3회로 감소했지만 trace 0건 | 동일 | 동일 — Sprint 11 task-1 (mediapipe upgrade) 가 이 지점을 노린다 |
| 시도 4: eager init + bootstrap trace 후에도 도달 안 함 | 동일 | 본 task-2 가 추가하는 main 측 `worker.onerror` 의 stack 으로 정밀 압축 가능 |

## 운영 메모

- `[INSEOUL_LLM]` 는 grep-friendly prefix. Xcode 콘솔에서 필터링하면 LLM 흐름만 볼 수 있다.
- iOS Safari Web Inspector 가 붙은 상태라면 worker 의 `console.log` 도 보인다 — Capacitor bridge 가
  안 forward 하는 것뿐, runtime 자체는 정상 동작. Web Inspector + 실기기 동시 디버깅을 권장.
- `unhandledrejection` 도 worker 안에서 캐치되어 trace 로 나온다 — async 함수 내부 throw 의 단서.
