// MediaPipe Gemma 2B IT 4-bit wrapper. Default execution context is the Web
// Worker (llm.worker.ts). The only network IO permitted in the entire /ai
// tree happens here (the model download from the configured URL).
//
// Sprint 11 task-4: useLLM 의 main-thread fallback (VITE_LLM_RUN_MAIN_THREAD=1)
// 도 이 모듈을 직접 import 한다. 활성 시 generate 가 main thread micro-task 를
// 점유 — UI 스크롤/입력 freeze 위험. 워커 silent-death 잔존 케이스 회피용 옵트인.

import { FilesetResolver, LlmInference } from '@mediapipe/tasks-genai'
import type { GenerateOptions } from './types'

// Sprint 11 task-1: 외부 CDN 의존 제거 — `public/wasm/` 으로 prebuild 시 복사된
// wasm/loader 6 파일을 dist root 에서 절대 경로로 로드한다. WKWebView 의
// cross-origin wasm streaming 정책 / CDN cache 변동으로 인한 'ModuleFactory not
// set.' 무한 루프 (Sprint 10 핸드오프 fix 후보 A) 해소.
const MEDIAPIPE_WASM_BASE = '/wasm'

// VITE_GEMMA_MODEL_URL 의 호스트가 이 목록에 없으면 거부한다.
// huggingface.co — 정식 모델 배포 채널 (Sprint 11 부터 단일화).
// localhost / 127.0.0.1 — 개발/오프라인 자체 호스팅.
// 사용자가 명시적으로 다른 호스트를 허용하려면 VITE_ALLOW_CUSTOM_MODEL_HOST=1 설정.
//
// Sprint 11 task-1: 외부 npm CDN 호스트를 화이트리스트에서 제거 — Sprint 10 finding
// (WKWebView cross-origin wasm streaming + CDN cache 변동) 와 동일 risk surface 가
// 모델 fetch 에도 적용되므로 권장 채널만 남긴다.
export const MODEL_HOST_WHITELIST: readonly string[] = [
  'huggingface.co',
  'localhost',
  '127.0.0.1',
]

// 2 GiB. Gemma 2B IT 4-bit 모델은 대략 1.3 GiB 수준이므로 이 한도가 현실적.
// 초과 시 임의의 거대 바이너리를 LLM 모델로 로드하려는 시도일 가능성이 크다.
export const MODEL_MAX_BYTES = 2 * 1024 * 1024 * 1024

// Sprint 12 task-2: 첫 chunk 도달 후 chunk-to-chunk 무응답 임계값. iOS UAT 에서
// 0% stall 의 root cause 식별을 위해 watchdog timeout 추가. 초과 시 download:idle-
// timeout trace + init-failed 로 명시적 throw.
export const DOWNLOAD_IDLE_TIMEOUT_MS = 30_000

export type ProgressCallback = (progress: number) => void
export type TokenCallback = (deltaText: string, done: boolean) => void
export type DownloadTraceCallback = (
  stage: string,
  detail?: Record<string, unknown>,
) => void

export interface FetchModelOptions {
  /** Override DOWNLOAD_IDLE_TIMEOUT_MS — 단위 테스트에서 짧게 설정. */
  idleTimeoutMs?: number
}

declare global {
  interface Navigator {
    readonly gpu?: {
      requestAdapter: () => Promise<unknown>
    }
  }
  // WorkerGlobalScope (used inside the worker) also exposes navigator.gpu.
  interface WorkerNavigator {
    readonly gpu?: {
      requestAdapter: () => Promise<unknown>
    }
  }
}

async function assertWebGpu(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    throw new Error('unsupported: WebGPU is not available in this environment')
  }
  const adapter = await navigator.gpu.requestAdapter()
  if (adapter === null || adapter === undefined) {
    throw new Error('unsupported: no WebGPU adapter')
  }
}

function hostMatches(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith('.' + suffix)
}

function envAllowCustomHost(): boolean {
  // 워커 컨텍스트에서도 Vite 가 import.meta.env 를 주입한다.
  const raw = import.meta.env['VITE_ALLOW_CUSTOM_MODEL_HOST']
  return raw === '1' || raw === 'true'
}

/**
 * modelUrl 의 호스트가 화이트리스트에 있거나 사용자가 명시적으로 우회 동의했는지
 * 확인한다. 위반 시 init-failed 메시지로 throw — Worker 가 이 prefix 를 보고
 * WorkerOutErrorMsg.code='init-failed' 로 매핑한다.
 */
export function assertAllowedModelHost(modelUrl: string): void {
  let host: string
  try {
    host = new URL(modelUrl).hostname.toLowerCase()
  } catch {
    throw new Error(`init-failed: invalid model URL '${modelUrl}'`)
  }
  if (host.length === 0) {
    throw new Error(`init-failed: invalid model URL '${modelUrl}'`)
  }
  for (const allowed of MODEL_HOST_WHITELIST) {
    if (hostMatches(host, allowed)) return
  }
  if (envAllowCustomHost()) return
  throw new Error(
    `init-failed: model host '${host}' is not in the allowlist (set VITE_ALLOW_CUSTOM_MODEL_HOST=1 to override)`,
  )
}

/**
 * Content-Length 헤더가 명시적으로 0 또는 비정상(>2GiB)인 경우 거부한다.
 * 헤더 부재(스트리밍 응답에서 흔함)는 통과시킨다 — 그 경우 본문 길이는 streaming
 * 누적 바이트로 별도 cap 한다.
 */
export function assertContentLength(header: string | null): void {
  if (header === null) return
  const n = Number.parseInt(header, 10)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`init-failed: invalid model size (content-length=${header})`)
  }
  if (n > MODEL_MAX_BYTES) {
    throw new Error(
      `init-failed: model size ${n} exceeds limit ${MODEL_MAX_BYTES}`,
    )
  }
}

const MILESTONE_BOUNDARIES: readonly number[] = [0.10, 0.25, 0.50, 0.75, 0.90]

/**
 * Fetch the model with progress reporting. Returns a Uint8Array suitable for
 * `LlmInference.createFromModelBuffer`. We do this manually because MediaPipe's
 * `createFromModelPath` does not expose download progress.
 *
 * Sprint 12 task-2: onTrace 콜백 + idle timeout 추가. iOS UAT 0% stall 의 root
 * cause 식별을 위해 download lifecycle 의 6 단계 (request-start / response /
 * first-chunk / milestone / complete / idle-timeout) 를 emit. first-chunk 이후
 * chunk-to-chunk 간격이 idleTimeoutMs (기본 30s) 초과 시 throw.
 */
export async function fetchModelWithProgress(
  modelUrl: string,
  onProgress: ProgressCallback,
  onTrace?: DownloadTraceCallback,
  options?: FetchModelOptions,
): Promise<Uint8Array> {
  const idleTimeoutMs = options?.idleTimeoutMs ?? DOWNLOAD_IDLE_TIMEOUT_MS
  const trace = onTrace ?? ((): void => undefined)

  assertAllowedModelHost(modelUrl)

  const startTime = Date.now()
  trace('download:request-start', { modelUrl })

  const ac = new AbortController()
  const res = await fetch(modelUrl, { signal: ac.signal })

  const totalHeader = res.headers.get('content-length')
  trace('download:response', {
    status: res.status,
    ok: res.ok,
    contentLength: totalHeader,
    urlAfterRedirect: res.url,
  })

  if (!res.ok) {
    throw new Error(`init-failed: model fetch failed (${res.status})`)
  }

  assertContentLength(totalHeader)
  const total = totalHeader ? Number.parseInt(totalHeader, 10) : 0
  const body = res.body
  if (!body) {
    // Fallback: no streaming, just read whole buffer.
    const buf = await res.arrayBuffer()
    if (buf.byteLength > MODEL_MAX_BYTES) {
      throw new Error(
        `init-failed: model size ${buf.byteLength} exceeds limit ${MODEL_MAX_BYTES}`,
      )
    }
    onProgress(1)
    trace('download:complete', {
      totalBytes: buf.byteLength,
      elapsedMs: Date.now() - startTime,
    })
    return new Uint8Array(buf)
  }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  let firstChunkSeen = false
  const milestonesEmitted = new Set<number>()

  // Idle watchdog. armed only after the first chunk arrives. setTimeout-based
  // race: the rejection promise wins if no chunk lands within idleTimeoutMs.
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let idleFired = false
  let idleReject: ((err: Error) => void) | null = null
  const idlePromise = new Promise<never>((_, reject) => {
    idleReject = reject
  })
  // 정상 경로에서 idlePromise 가 reject 되지 않으면 unhandled rejection 경고를
  // 막기 위해 noop catch 를 등록. race 에서 reject 시점엔 실제 catch 가 잡는다.
  idlePromise.catch(() => undefined)

  const armIdle = (): void => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      idleFired = true
      trace('download:idle-timeout', {
        idleMs: idleTimeoutMs,
        lastByte: received,
      })
      try {
        ac.abort()
      } catch {
        // ignore
      }
      reader.cancel().catch(() => undefined)
      idleReject?.(
        new Error(
          `init-failed: download stalled (no chunk for ${idleTimeoutMs}ms)`,
        ),
      )
    }, idleTimeoutMs)
  }
  const disarmIdle = (): void => {
    if (idleTimer) {
      clearTimeout(idleTimer)
      idleTimer = null
    }
  }

  try {
    for (;;) {
      let result: ReadableStreamReadResult<Uint8Array>
      try {
        result = await Promise.race([reader.read(), idlePromise])
      } catch (err) {
        if (idleFired) {
          throw err instanceof Error
            ? err
            : new Error(`init-failed: download stalled (no chunk for ${idleTimeoutMs}ms)`)
        }
        throw err
      }
      const { done, value } = result
      if (done) break
      if (value) {
        chunks.push(value)
        received += value.byteLength
        if (!firstChunkSeen) {
          firstChunkSeen = true
          trace('download:first-chunk', {
            byteLength: value.byteLength,
            elapsedMs: Date.now() - startTime,
          })
        }
        armIdle()
        // Defense-in-depth: 헤더가 거짓을 말하더라도 누적 바이트가 cap 을 넘으면 중단.
        if (received > MODEL_MAX_BYTES) {
          try {
            await reader.cancel()
          } catch {
            // ignore
          }
          throw new Error(
            `init-failed: model stream exceeded limit ${MODEL_MAX_BYTES} bytes`,
          )
        }
        if (total > 0) {
          const progress = Math.min(0.999, received / total)
          onProgress(progress)
          for (const m of MILESTONE_BOUNDARIES) {
            if (progress >= m && !milestonesEmitted.has(m)) {
              milestonesEmitted.add(m)
              trace('download:milestone', { progress: m, received })
            }
          }
        }
      }
    }
  } finally {
    disarmIdle()
  }

  onProgress(1)
  // Concatenate chunks.
  const out = new Uint8Array(received)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  trace('download:complete', {
    totalBytes: out.byteLength,
    elapsedMs: Date.now() - startTime,
  })
  return out
}

export class MediaPipeLLM {
  private llm: LlmInference | null = null

  async init(
    modelUrl: string,
    onProgress: ProgressCallback,
    onTrace?: DownloadTraceCallback,
  ): Promise<void> {
    const trace = onTrace ?? (() => undefined)
    trace('init:enter', { modelUrl, wasmBase: MEDIAPIPE_WASM_BASE })
    // 호스트 화이트리스트는 WebGPU 검사 *전에* 평가 — 비-허용 호스트면 GPU 자원
    // 없는 환경에서도 동일하게 차단되어야 한다.
    assertAllowedModelHost(modelUrl)
    trace('init:host-ok')
    await assertWebGpu()
    trace('init:webgpu-ok')

    const fileset = await FilesetResolver.forGenAiTasks(MEDIAPIPE_WASM_BASE)
    trace('init:fileset-ok')
    const modelBuffer = await fetchModelWithProgress(modelUrl, onProgress, onTrace)
    trace('init:fetch-ok', { byteLength: modelBuffer.byteLength })

    try {
      this.llm = await LlmInference.createFromOptions(fileset, {
        baseOptions: {
          modelAssetBuffer: modelBuffer,
        },
        maxTokens: 2048,
        topK: 40,
        temperature: 0.7,
        randomSeed: 1,
      })
      trace('init:gpu-ok')
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err)
      trace('init:gpu-fail', {
        message: m,
        name: err instanceof Error ? err.name : undefined,
      })
      throw err
    }
  }

  /**
   * Stream a generation. The callback receives (deltaText, done). MediaPipe's
   * progress listener actually delivers partial *cumulative* text in some
   * versions; here we forward each callback as the delta and let the worker
   * decide how to relay. We pass partialResult straight through — the worker
   * computes the diff against the running buffer.
   */
  async generate(
    prompt: string,
    onToken: TokenCallback,
    options?: GenerateOptions,
  ): Promise<void> {
    if (!this.llm) {
      throw new Error('generate-failed: model not initialized')
    }
    if (options) {
      const setOpts: Record<string, number> = {}
      if (options.maxTokens !== undefined) setOpts['maxTokens'] = options.maxTokens
      if (options.temperature !== undefined) setOpts['temperature'] = options.temperature
      if (options.topK !== undefined) setOpts['topK'] = options.topK
      if (Object.keys(setOpts).length > 0) {
        await this.llm.setOptions(setOpts)
      }
    }

    await this.llm.generateResponse(prompt, (partialResult, done) => {
      onToken(partialResult, done)
    })
  }

  dispose(): void {
    if (this.llm) {
      this.llm.close()
      this.llm = null
    }
  }
}
