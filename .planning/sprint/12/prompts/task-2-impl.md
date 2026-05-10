# Sprint 12 / task-2 — fetchModelWithProgress trace 강화 + idle timeout

당신은 Sprint 12 task-2 구현 워커 (Claude) 입니다.

## 0. 작업 환경 (worktree 분리 필수)

```bash
cd /Users/leokim/Desktop/leo.kim/InSeoul
git branch -D task-2-impl 2>/dev/null
git worktree prune
mkdir -p ../inseoul-worktrees
git worktree add -b task-2-impl ../inseoul-worktrees/task-2-impl main
cd ../inseoul-worktrees/task-2-impl
pwd  # 반드시 ../inseoul-worktrees/task-2-impl
```

이후 모든 명령은 worktree 내부에서 실행. 메인 트리 cd 금지.

## 1. 트리거 / 컨텍스트

iOS 시뮬레이터 UAT 에서 배지가 "모델 다운로드 0%" 에서 stall — 어디서 멈췄는지 trace 부재. 현재 `fetchModelWithProgress` (`src/ai/llm/mediapipe.ts:120`) 는 다음만 emit:

- `init:fetch-ok` (다운로드 *완료* 후)
- `progress` 메시지 (Math.min(0.999, received/total)) — total > 0 일 때만, 첫 chunk 도달 후

즉 fetch resolve 전 / first-chunk 직전 / chunk 미도달 stall 모두 silent. 사용자가 "0%" 만 보고 root cause 식별 불가.

## 2. 수용 기준

### 2-A. 신규 trace stage 추가 (`src/ai/llm/mediapipe.ts`)

`fetchModelWithProgress` signature 확장:

```ts
export type DownloadTraceCallback = (stage: string, detail?: Record<string, unknown>) => void

export async function fetchModelWithProgress(
  modelUrl: string,
  onProgress: ProgressCallback,
  onTrace?: DownloadTraceCallback,
): Promise<Uint8Array>
```

다음 stage 를 emit (모두 `download:` prefix):

| stage | 시점 | detail |
|---|---|---|
| `download:request-start` | `fetch(modelUrl)` 호출 직전 | `{ modelUrl }` |
| `download:response` | `fetch` resolve 직후 | `{ status, ok, contentLength, urlAfterRedirect }` (`res.url`) |
| `download:first-chunk` | 첫 chunk 도달 | `{ byteLength, elapsedMs }` |
| `download:milestone` | progress 가 0.10 / 0.25 / 0.50 / 0.75 / 0.90 경계를 넘을 때마다 (각 1회) | `{ progress, received }` |
| `download:complete` | 마지막 chunk + concat 완료 | `{ totalBytes, elapsedMs }` |
| `download:idle-timeout` | idle threshold 초과 | `{ idleMs, lastByte }` (throw 직전) |

milestone 은 누적 boundary 마다 한 번만 emit (set 또는 lastMilestone 변수로 dedup).

### 2-B. Idle timeout

`download:first-chunk` 이후 chunk-to-chunk 간격이 30초 초과 시 throw:

```ts
throw new Error('init-failed: download stalled (no chunk for 30000ms)')
```

구현: `setTimeout` 기반 watchdog 또는 `Promise.race`. AbortController 로 fetch 취소 후 reader.cancel(). watchdog 은 매 chunk 도달 시 reset.

상수 `DOWNLOAD_IDLE_TIMEOUT_MS = 30_000` export — 단위 테스트에서 override 가능하도록 옵션 파라미터 추가 (`{ idleTimeoutMs?: number }`).

### 2-C. 워커 forward (`src/ai/worker/llm.worker.ts`)

`handleInit` 의 `llm.init(modelUrl, onProgress, onTrace?)` 호출 시 download trace 도 worker postMessage 로 전달:

```ts
await llm.init(
  modelUrl,
  (progress) => send({ type: 'progress', progress }),
  (stage, detail) => send({ type: 'trace', stage, detail }),
)
```

`MediaPipeLLM.init` 에 `onTrace` 콜백 통과 (이미 부분적으로 존재 — `init:enter` 등). `fetchModelWithProgress` 에 같은 trace 콜백 forward:

```ts
const modelBuffer = await fetchModelWithProgress(modelUrl, onProgress, onTrace)
```

### 2-D. 단위 테스트 (`src/ai/llm/__tests__/mediapipe.test.ts`)

기존 `describe('fetchModelWithProgress', ...)` block 에 다음 케이스 추가 (4개 이상):

1. **trace stage 순서 검증** — mock fetch + 작은 stream → `request-start`, `response`, `first-chunk`, `milestone(50%)`, `complete` 순서대로 호출됨 (totalBytes >= milestone trigger 조건 갖추도록 stream 크기 조정).
2. **idle-timeout** — mock stream 이 첫 chunk 후 무한 대기 → `idleTimeoutMs: 100` 옵션 → 100ms 후 throw `init-failed: download stalled`.
3. **idle-timeout 후 reader cancel** — abort 가 정상 호출됐는지 spy 검증.
4. **milestone dedup** — progress 가 같은 boundary 를 두 번 넘어도 (스트림 변동) `milestone` trace 는 한 번만.

기존 케이스 (host allowlist, content-length, max-bytes) 는 보존. trace 콜백은 옵셔널이므로 기존 호출자 (`onTrace` 없이 호출) 영향 없어야 함.

### 2-E. 검증

- `npm run lint` 통과 (0e/0w)
- `npm test` 통과 (기존 134 + 새 4 이상)
- `npm run build` 통과 (production 컴파일 OK — 기존 trace 콜백 변경에 회귀 없음)

## 3. 스코프 파일

- `src/ai/llm/mediapipe.ts` (fetchModelWithProgress, MediaPipeLLM.init)
- `src/ai/worker/llm.worker.ts` (handleInit 의 trace forward)
- `src/ai/llm/__tests__/mediapipe.test.ts` (신규 케이스)
- `src/ai/llm/types.ts` (DownloadTraceCallback export — 필요 시)

**NEVER**: `vite.config.ts`, `package.json`, `scripts/*` (task-1 의 영역). `docs/*` (task-3). `src/ai/hooks/useLLM.ts` 는 `trace` 메시지 처리 이미 보유 (line 302) — 변경 불필요.

## 4. 워크플로우

1. 구현 + 테스트
2. `npm run lint && npm test && npm run build`
3. commit (브랜치 = `task-2-impl`)
4. 완료 시:
   ```
   [IMPL_DONE] task-2 commit=<short_sha> ready_for_review
   ```
   `cmux display-message -p "[IMPL_DONE] task-2"` 발신

## 5. 주의사항

- review pass 전까지 main 머지 금지
- task-1 / task-3 영역 침범 금지
- review 파일 read-only
- 모든 작업은 `../inseoul-worktrees/task-2-impl` 안에서만
