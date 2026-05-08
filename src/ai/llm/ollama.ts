// Ollama HTTP client. Talks to the local Ollama daemon (default
// http://localhost:11434) — no Web Worker, no MediaPipe runtime.
//
// 프라이버시: 사용자가 명시적으로 VITE_LLM_BACKEND=ollama 를 켰을 때만 사용된다.
// 그 경우 호출 대상은 *로컬 데몬* — 외부 서버로 데이터가 나가지 않는다.
// VITE_OLLAMA_URL 은 기본 localhost. 외부 URL 로 바꾸는 건 운영자 책임.
//
// /api/generate 응답은 NDJSON: 각 줄이 `{response, done, ...}`. 마지막 줄 done=true.
// fetch ReadableStream 을 줄 단위로 파싱해 onToken 으로 forwarding 한다.

const PING_TIMEOUT_MS = 1500
const NDJSON_LINE_DELIM = '\n'

export interface OllamaConfig {
  /** 데몬 base URL. 끝의 슬래시는 무시한다. */
  url: string
  /** ollama list 의 모델 태그. 예: 'gemma3:4b' */
  model: string
}

export interface OllamaGenerateOptions {
  /** 0..1, 모델 결정성. */
  temperature?: number | undefined
  /** 출력 최대 토큰. */
  maxTokens?: number | undefined
}

interface OllamaStreamLine {
  response?: string
  done?: boolean
  error?: string
}

/** 작은 NDJSON 디코더 — 청크 경계가 줄 중간에 와도 안전. */
class NdjsonBuffer {
  private buf = ''

  push(text: string): string[] {
    this.buf += text
    const out: string[] = []
    let idx = this.buf.indexOf(NDJSON_LINE_DELIM)
    while (idx !== -1) {
      const line = this.buf.slice(0, idx).trim()
      this.buf = this.buf.slice(idx + 1)
      if (line.length > 0) out.push(line)
      idx = this.buf.indexOf(NDJSON_LINE_DELIM)
    }
    return out
  }

  /** stream 종료 시 남은 잔여(개행 없는 마지막 라인) 반환. */
  flush(): string[] {
    const remaining = this.buf.trim()
    this.buf = ''
    return remaining.length > 0 ? [remaining] : []
  }
}

export class OllamaClient {
  private readonly config: OllamaConfig

  constructor(config: OllamaConfig) {
    this.config = config
  }

  /** 데몬 health check. 살아있으면 모델 목록 반환, 아니면 throw. */
  async ping(signal?: AbortSignal): Promise<string[]> {
    const ctrl = new AbortController()
    const timeoutId = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS)
    const onParentAbort = () => ctrl.abort()
    if (signal) {
      if (signal.aborted) ctrl.abort()
      else signal.addEventListener('abort', onParentAbort, { once: true })
    }
    try {
      const res = await fetch(`${this.baseUrl()}/api/tags`, {
        method: 'GET',
        signal: ctrl.signal,
      })
      if (!res.ok) {
        throw new Error(`Ollama /api/tags HTTP ${res.status}`)
      }
      const json = (await res.json()) as { models?: Array<{ name?: string }> }
      const models = (json.models ?? [])
        .map((m) => m.name)
        .filter((n): n is string => typeof n === 'string')
      return models
    } finally {
      clearTimeout(timeoutId)
      if (signal) signal.removeEventListener('abort', onParentAbort)
    }
  }

  /**
   * 토큰 스트리밍 generation.
   * - signal 이 abort 되면 fetch 가 throw('AbortError') → 호출자에 전파.
   * - onToken 은 *완성된* 토큰 조각만 받는다. NDJSON line 단위.
   */
  async generate(
    prompt: string,
    onToken: (delta: string) => void,
    signal?: AbortSignal,
    options: OllamaGenerateOptions = {},
  ): Promise<void> {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')

    const body: Record<string, unknown> = {
      model: this.config.model,
      prompt,
      stream: true,
    }
    const opts: Record<string, unknown> = {}
    if (options.temperature !== undefined) opts['temperature'] = options.temperature
    if (options.maxTokens !== undefined) opts['num_predict'] = options.maxTokens
    if (Object.keys(opts).length > 0) body['options'] = opts

    const fetchInit: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
    if (signal) fetchInit.signal = signal

    const res = await fetch(`${this.baseUrl()}/api/generate`, fetchInit)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Ollama /api/generate HTTP ${res.status}: ${text}`)
    }
    if (!res.body) {
      throw new Error('Ollama response has no body')
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    const buffer = new NdjsonBuffer()
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        const text = decoder.decode(value, { stream: true })
        const lines = buffer.push(text)
        for (const line of lines) {
          this.handleLine(line, onToken)
        }
      }
      const tail = buffer.flush()
      for (const line of tail) {
        this.handleLine(line, onToken)
      }
    } finally {
      try {
        reader.releaseLock()
      } catch {
        /* ignore — already released */
      }
    }
  }

  private handleLine(line: string, onToken: (s: string) => void): void {
    let parsed: OllamaStreamLine
    try {
      parsed = JSON.parse(line) as OllamaStreamLine
    } catch {
      // 비-JSON 라인은 무시 (방어적). 데몬이 정상이면 이 분기 안 탄다.
      return
    }
    if (typeof parsed.error === 'string' && parsed.error.length > 0) {
      throw new Error(parsed.error)
    }
    if (typeof parsed.response === 'string' && parsed.response.length > 0) {
      onToken(parsed.response)
    }
  }

  private baseUrl(): string {
    return this.config.url.replace(/\/+$/, '')
  }
}
