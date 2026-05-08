// MediaPipe Gemma 2B IT 4-bit wrapper. Runs inside the Web Worker — never
// import from main-thread modules. The only network IO permitted in the entire
// /ai tree happens here (the model download from the configured URL).

import { FilesetResolver, LlmInference } from '@mediapipe/tasks-genai'
import type { GenerateOptions } from './types'

const MEDIAPIPE_WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm'

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

/**
 * Fetch the model with progress reporting. Returns a Uint8Array suitable for
 * `LlmInference.createFromModelBuffer`. We do this manually because MediaPipe's
 * `createFromModelPath` does not expose download progress.
 */
async function fetchModelWithProgress(
  modelUrl: string,
  onProgress: ProgressCallback,
): Promise<Uint8Array> {
  const res = await fetch(modelUrl)
  if (!res.ok) {
    throw new Error(`init-failed: model fetch failed (${res.status})`)
  }
  const totalHeader = res.headers.get('content-length')
  const total = totalHeader ? Number.parseInt(totalHeader, 10) : 0
  const body = res.body
  if (!body) {
    // Fallback: no streaming, just read whole buffer.
    const buf = await res.arrayBuffer()
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
