import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  checkOllamaHost,
  isLocalLlmHost,
  isOnDeviceLlm,
  useLLM,
} from '../useLLM'

/**
 * task-1 — Ollama 호스트 화이트리스트 가드 *실제 호출 차단* 으로 승격되었는지 검증.
 *
 * accept_criteria:
 *   (a) 비-로컬 ollama URL → ensureReady/generate throw + state.status='error' + errorMessage
 *   (b) VITE_ALLOW_REMOTE_LLM=1 명시 동의 시에만 통과 + state.remote=true
 *   (c) localhost / 127.0.0.1 / ::1 회귀 없음
 *   (d) mediapipe 백엔드는 ollama 가드와 무관
 */

function stubOllamaEnv(opts: {
  url: string
  allowRemote?: '0' | '1' | '' | undefined
  model?: string
}): void {
  vi.stubEnv('VITE_LLM_BACKEND', 'ollama')
  vi.stubEnv('VITE_OLLAMA_URL', opts.url)
  vi.stubEnv('VITE_OLLAMA_MODEL', opts.model ?? 'gemma3:4b')
  vi.stubEnv('VITE_ALLOW_REMOTE_LLM', opts.allowRemote ?? '')
  vi.stubEnv('VITE_GEMMA_MODEL_URL', '')
}

describe('checkOllamaHost (pure)', () => {
  it.each([
    ['http://localhost:11434', false, true, false],
    ['http://127.0.0.1:11434', false, true, false],
    ['http://[::1]:11434', false, true, false],
    ['http://0.0.0.0:11434', false, true, false],
    ['http://localhost:11434', true, true, false], // 동의는 로컬에서 무시
    ['http://192.168.1.50:11434', false, false, true], // 차단 + remote=true
    ['https://gpu-server.example.com:11434', false, false, true],
    ['http://192.168.1.50:11434', true, true, true], // 동의 시 통과 + remote
    ['not-a-url', false, false, true],
    ['not-a-url', true, true, true],
  ] as const)(
    '%s + allowRemote=%s → allowed=%s remote=%s',
    (url, allowRemote, expAllowed, expRemote) => {
      const r = checkOllamaHost(url, allowRemote)
      expect(r.allowed).toBe(expAllowed)
      expect(r.remote).toBe(expRemote)
      if (!expAllowed) {
        expect(r.reason).toMatch(/VITE_ALLOW_REMOTE_LLM/)
      } else {
        expect(r.reason).toBeUndefined()
      }
    },
  )
})

describe('useLLM ollama backend host guard', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('localhost ollama URL → ensureReady 통과, remote 플래그 없음 (회귀)', async () => {
    stubOllamaEnv({ url: 'http://localhost:11434' })
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ models: [{ name: 'gemma3:4b' }] }), {
        status: 200,
      }),
    )

    const { result } = renderHook(() => useLLM())
    await act(async () => {
      await result.current.ensureReady()
    })

    expect(result.current.state.status).toBe('ready')
    expect(result.current.state.remote).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:11434/api/tags',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('비-로컬 ollama URL + 동의 없음 → ensureReady throw + state.error + fetch 차단', async () => {
    stubOllamaEnv({ url: 'http://192.168.1.50:11434' })
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>

    const { result } = renderHook(() => useLLM())
    await act(async () => {
      await expect(result.current.ensureReady()).rejects.toThrow(
        /VITE_ALLOW_REMOTE_LLM/,
      )
    })

    expect(result.current.state.status).toBe('error')
    expect(result.current.state.errorMessage).toMatch(/192\.168\.1\.50/)
    expect(result.current.state.errorMessage).toMatch(/VITE_ALLOW_REMOTE_LLM/)
    expect(result.current.state.remote).toBe(true)
    // 가장 중요한 단언: 외부 호스트로 *어떤 fetch 도* 발생하지 않았다.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('비-로컬 + VITE_ALLOW_REMOTE_LLM=1 → ensureReady 통과 + state.remote=true', async () => {
    stubOllamaEnv({ url: 'http://192.168.1.50:11434', allowRemote: '1' })
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ models: [{ name: 'gemma3:4b' }] }), {
        status: 200,
      }),
    )

    const { result } = renderHook(() => useLLM())
    await act(async () => {
      await result.current.ensureReady()
    })

    expect(result.current.state.status).toBe('ready')
    expect(result.current.state.remote).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.1.50:11434/api/tags',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('비-로컬 + 동의 없음 → generate 직접 호출도 차단 (boundary 이중 검증)', async () => {
    stubOllamaEnv({ url: 'http://gpu.evil.example:11434' })
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>

    const { result } = renderHook(() => useLLM())
    await act(async () => {
      await expect(
        result.current.generate('q', () => undefined),
      ).rejects.toThrow(/VITE_ALLOW_REMOTE_LLM/)
    })

    expect(result.current.state.status).toBe('error')
    expect(result.current.state.remote).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('VITE_ALLOW_REMOTE_LLM 가 "true" 등 다른 truthy 값이면 동의로 인정하지 않음 (strict opt-in)', async () => {
    // 보안: 명시적 '1' 만 통과. 'true', 'yes', '0', 'on' 등은 거부.
    stubOllamaEnv({ url: 'http://192.168.1.50:11434' })
    vi.stubEnv('VITE_ALLOW_REMOTE_LLM', 'true')
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>

    const { result } = renderHook(() => useLLM())
    await act(async () => {
      await expect(result.current.ensureReady()).rejects.toThrow(
        /VITE_ALLOW_REMOTE_LLM/,
      )
    })

    expect(result.current.state.status).toBe('error')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('mediapipe 백엔드는 ollama 호스트 가드와 무관', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('VITE_LLM_BACKEND=mediapipe + 비-로컬 OLLAMA_URL → on-device 판정 그대로', () => {
    vi.stubEnv('VITE_LLM_BACKEND', 'mediapipe')
    vi.stubEnv('VITE_GEMMA_MODEL_URL', 'https://huggingface.co/x.task')
    // ollama 가드를 트리거할 조건이지만 mediapipe 백엔드에서는 무관해야 한다.
    vi.stubEnv('VITE_OLLAMA_URL', 'http://192.168.1.50:11434')
    vi.stubEnv('VITE_ALLOW_REMOTE_LLM', '')

    expect(isOnDeviceLlm()).toBe(true)
    // 순수 helper 자체도 ollama URL 과 독립적으로 동작.
    expect(isLocalLlmHost('http://192.168.1.50:11434')).toBe(false)
    expect(isLocalLlmHost('http://localhost:11434')).toBe(true)
  })
})
