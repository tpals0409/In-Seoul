// MediaPipe Gemma 2B IT 4-bit wrapper. Runs inside the Web Worker — never
// import from main-thread modules. The only network IO permitted in the entire
// /ai tree happens here (the model download from the configured URL).

import { FilesetResolver, LlmInference } from '@mediapipe/tasks-genai'
import type { GenerateOptions } from './types'

const MEDIAPIPE_WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm'

// VITE_GEMMA_MODEL_URL 의 호스트가 이 목록에 없으면 거부한다.
// jsdelivr.net / huggingface.co — 정식 모델 배포 채널.
// localhost / 127.0.0.1 — 개발/오프라인 자체 호스팅.
// 사용자가 명시적으로 다른 호스트를 허용하려면 VITE_ALLOW_CUSTOM_MODEL_HOST=1 설정.
export const MODEL_HOST_WHITELIST: readonly string[] = [
  'jsdelivr.net',
  'huggingface.co',
  'localhost',
  '127.0.0.1',
]

// 2 GiB. Gemma 2B IT 4-bit 모델은 대략 1.3 GiB 수준이므로 이 한도가 현실적.
// 초과 시 임의의 거대 바이너리를 LLM 모델로 로드하려는 시도일 가능성이 크다.
export const MODEL_MAX_BYTES = 2 * 1024 * 1024 * 1024

export type ProgressCallback = (progress: number) => void
export type TokenCallback = (deltaText: string, done: boolean) => void

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

/**
 * Fetch the model with progress reporting. Returns a Uint8Array suitable for
 * `LlmInference.createFromModelBuffer`. We do this manually because MediaPipe's
 * `createFromModelPath` does not expose download progress.
 */
export async function fetchModelWithProgress(
  modelUrl: string,
  onProgress: ProgressCallback,
): Promise<Uint8Array> {
  assertAllowedModelHost(modelUrl)
  const res = await fetch(modelUrl)
  if (!res.ok) {
    throw new Error(`init-failed: model fetch failed (${res.status})`)
  }
  const totalHeader = res.headers.get('content-length')
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
    return new Uint8Array(buf)
  }
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      received += value.byteLength
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
        onProgress(Math.min(0.999, received / total))
      }
    }
  }
  onProgress(1)
  // Concatenate chunks.
  const out = new Uint8Array(received)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

export class MediaPipeLLM {
  private llm: LlmInference | null = null

  async init(modelUrl: string, onProgress: ProgressCallback): Promise<void> {
    // 호스트 화이트리스트는 WebGPU 검사 *전에* 평가 — 비-허용 호스트면 GPU 자원
    // 없는 환경에서도 동일하게 차단되어야 한다.
    assertAllowedModelHost(modelUrl)
    await assertWebGpu()

    const fileset = await FilesetResolver.forGenAiTasks(MEDIAPIPE_WASM_BASE)
    const modelBuffer = await fetchModelWithProgress(modelUrl, onProgress)

    this.llm = await LlmInference.createFromOptions(fileset, {
      baseOptions: {
        modelAssetBuffer: modelBuffer,
      },
      maxTokens: 2048,
      topK: 40,
      temperature: 0.7,
      randomSeed: 1,
    })
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
