import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OllamaClient } from '../ollama'
import { isLocalLlmHost } from '@/ai/hooks/useLLM'

const URL = 'http://localhost:11434'

function makeStreamingResponse(lines: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line))
      }
      controller.close()
    },
  })
  return new Response(stream, { status: 200 })
}

function makeChunkedStreamingResponse(rawChunks: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of rawChunks) controller.enqueue(encoder.encode(c))
      controller.close()
    },
  })
  return new Response(stream, { status: 200 })
}

describe('OllamaClient.ping', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('200 응답 + models 배열 → 모델 이름 리스트 반환', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ models: [{ name: 'gemma3:4b' }, { name: 'embeddinggemma:latest' }] }),
        { status: 200 },
      ),
    )
    const client = new OllamaClient({ url: URL, model: 'gemma3:4b' })
    const out = await client.ping()
    expect(out).toEqual(['gemma3:4b', 'embeddinggemma:latest'])
    expect(fetchMock).toHaveBeenCalledWith(`${URL}/api/tags`, expect.objectContaining({ method: 'GET' }))
  })

  it('비-200 응답 → throw', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(new Response('', { status: 502 }))
    const client = new OllamaClient({ url: URL, model: 'gemma3:4b' })
    await expect(client.ping()).rejects.toThrow(/502/)
  })

  it('connection refused (fetch reject) → throw', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const client = new OllamaClient({ url: URL, model: 'gemma3:4b' })
    await expect(client.ping()).rejects.toThrow(/ECONNREFUSED/)
  })
})

describe('OllamaClient.generate (NDJSON streaming)', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('happy path: 줄 단위 응답을 onToken 으로 전달', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(
      makeStreamingResponse([
        '{"response":"안녕","done":false}\n',
        '{"response":"하세요","done":false}\n',
        '{"response":"!","done":true}\n',
      ]),
    )
    const client = new OllamaClient({ url: URL, model: 'gemma3:4b' })
    const tokens: string[] = []
    await client.generate('hi', (t) => tokens.push(t))
    expect(tokens).toEqual(['안녕', '하세요', '!'])
  })

  it('청크 경계가 줄 중간에 와도 line 단위로 디코드', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    // '{"response":"안녕","done":false}\n' 을 여러 청크로 쪼갬
    fetchMock.mockResolvedValueOnce(
      makeChunkedStreamingResponse([
        '{"resp',
        'onse":"안녕",',
        '"done":false}\n{"response":"세상',
        '","done":true}\n',
      ]),
    )
    const client = new OllamaClient({ url: URL, model: 'gemma3:4b' })
    const tokens: string[] = []
    await client.generate('hi', (t) => tokens.push(t))
    expect(tokens).toEqual(['안녕', '세상'])
  })

  it('비-200 → throw + 본문 메시지 포함', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(new Response('model not found', { status: 404 }))
    const client = new OllamaClient({ url: URL, model: 'no-such' })
    await expect(client.generate('q', () => undefined)).rejects.toThrow(/404/)
  })

  it('error 라인이 오면 throw', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(
      makeStreamingResponse([`{"error":"out of memory"}\n`]),
    )
    const client = new OllamaClient({ url: URL, model: 'gemma3:4b' })
    await expect(client.generate('q', () => undefined)).rejects.toThrow(/out of memory/)
  })

  it('signal.aborted=true 로 호출 시 즉시 AbortError', async () => {
    const client = new OllamaClient({ url: URL, model: 'gemma3:4b' })
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(
      client.generate('q', () => undefined, ctrl.signal),
    ).rejects.toThrow(/abort/i)
  })

  it('signal 을 fetch 에 전달', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(
      makeStreamingResponse([`{"response":"x","done":true}\n`]),
    )
    const client = new OllamaClient({ url: URL, model: 'gemma3:4b' })
    const ctrl = new AbortController()
    await client.generate('q', () => undefined, ctrl.signal)
    const callArgs = fetchMock.mock.calls[0]
    expect(callArgs?.[1]?.signal).toBe(ctrl.signal)
  })

  it.each([
    ['http://localhost:11434', true],
    ['http://127.0.0.1:11434', true],
    ['http://[::1]:11434', true],
    ['http://0.0.0.0:11434', true],
    ['https://my-server.example.com:11434', false],
    ['http://192.168.1.42:11434', false],
    ['http://ollama.local:11434', false],
    ['not-a-url', false],
  ] as const)('isLocalLlmHost(%s) === %s', (url, expected) => {
    expect(isLocalLlmHost(url)).toBe(expected)
  })

  it('options.maxTokens / temperature → body.options 에 매핑', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(
      makeStreamingResponse([`{"response":"x","done":true}\n`]),
    )
    const client = new OllamaClient({ url: URL, model: 'gemma3:4b' })
    await client.generate('q', () => undefined, undefined, {
      temperature: 0.4,
      maxTokens: 256,
    })
    const callBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    ) as { options?: Record<string, unknown> }
    expect(callBody.options).toEqual({ temperature: 0.4, num_predict: 256 })
  })
})
