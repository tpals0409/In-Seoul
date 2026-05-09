import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MODEL_HOST_WHITELIST,
  MODEL_MAX_BYTES,
  assertAllowedModelHost,
  assertContentLength,
  fetchModelWithProgress,
} from '../mediapipe'

/**
 * task-3: MediaPipe 모델 URL 출처 + 응답 메타 가드.
 *
 * 이 파일은 *순수 함수* (assertAllowedModelHost / assertContentLength) 와
 * fetchModelWithProgress 의 fetch 모킹 통합 케이스만 검증한다. assertWebGpu /
 * LlmInference.createFromOptions 분기는 워커 환경 의존이라 e2e 영역.
 */

describe('assertAllowedModelHost', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each([
    'https://cdn.jsdelivr.net/npm/foo/model.task',
    'https://huggingface.co/google/gemma/resolve/main/model.task',
    'https://hf.example.huggingface.co/model.task',
    'http://localhost:8080/model.task',
    'http://127.0.0.1:8080/model.task',
  ])('화이트리스트 호스트 %s → 통과', (url) => {
    expect(() => assertAllowedModelHost(url)).not.toThrow()
  })

  it('미허용 호스트(VITE_ALLOW_CUSTOM_MODEL_HOST 미설정) → init-failed throw', () => {
    vi.stubEnv('VITE_ALLOW_CUSTOM_MODEL_HOST', '')
    expect(() =>
      assertAllowedModelHost('https://malicious.example.com/model.task'),
    ).toThrow(/init-failed: model host 'malicious\.example\.com'/)
  })

  it('미허용 호스트라도 VITE_ALLOW_CUSTOM_MODEL_HOST=1 이면 통과', () => {
    vi.stubEnv('VITE_ALLOW_CUSTOM_MODEL_HOST', '1')
    expect(() =>
      assertAllowedModelHost('https://my-self-hosted.example.org/m.task'),
    ).not.toThrow()
  })

  it('파싱 불가 URL → init-failed throw (env 우회 무관)', () => {
    vi.stubEnv('VITE_ALLOW_CUSTOM_MODEL_HOST', '1')
    expect(() => assertAllowedModelHost('not-a-url')).toThrow(
      /init-failed: invalid model URL/,
    )
  })

  it('huggingface.co 와 비슷하지만 다른 호스트는 차단 (suffix spoof 방지)', () => {
    vi.stubEnv('VITE_ALLOW_CUSTOM_MODEL_HOST', '')
    // 'evilhuggingface.co' 는 'huggingface.co' 의 서픽스가 아님 — 점(.) 경계 매칭 필수.
    expect(() =>
      assertAllowedModelHost('https://evilhuggingface.co/model.task'),
    ).toThrow(/not in the allowlist/)
  })

  it('whitelist 상수에 핵심 호스트가 모두 포함', () => {
    expect(MODEL_HOST_WHITELIST).toEqual(
      expect.arrayContaining([
        'jsdelivr.net',
        'huggingface.co',
        'localhost',
        '127.0.0.1',
      ]),
    )
  })
})

describe('assertContentLength', () => {
  it('헤더 부재 → 통과 (스트리밍 응답 호환)', () => {
    expect(() => assertContentLength(null)).not.toThrow()
  })

  it('정상 크기 → 통과', () => {
    expect(() => assertContentLength('1342177280')).not.toThrow() // ~1.25 GiB
  })

  it('content-length=0 → init-failed throw', () => {
    expect(() => assertContentLength('0')).toThrow(/invalid model size/)
  })

  it('content-length=음수/NaN → init-failed throw', () => {
    expect(() => assertContentLength('-1')).toThrow(/invalid model size/)
    expect(() => assertContentLength('abc')).toThrow(/invalid model size/)
  })

  it('content-length 가 2GiB 초과 → init-failed throw', () => {
    const tooBig = (MODEL_MAX_BYTES + 1).toString()
    expect(() => assertContentLength(tooBig)).toThrow(/exceeds limit/)
  })

  it('content-length 가 정확히 2GiB → 통과', () => {
    expect(() => assertContentLength(MODEL_MAX_BYTES.toString())).not.toThrow()
  })
})

describe('fetchModelWithProgress', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch
    vi.unstubAllEnvs()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('미허용 호스트면 fetch 자체를 호출하지 않고 throw', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    vi.stubEnv('VITE_ALLOW_CUSTOM_MODEL_HOST', '')
    await expect(
      fetchModelWithProgress(
        'https://192.168.1.50:9000/m.task',
        () => undefined,
      ),
    ).rejects.toThrow(/init-failed: model host/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('content-length 가 비정상이면 본문 읽기 전에 throw', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-length': '0' },
      }),
    )
    await expect(
      fetchModelWithProgress(
        'https://cdn.jsdelivr.net/npm/foo/m.task',
        () => undefined,
      ),
    ).rejects.toThrow(/invalid model size/)
  })

  it('content-length 가 2GiB 초과면 throw', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-length': (MODEL_MAX_BYTES + 1).toString() },
      }),
    )
    await expect(
      fetchModelWithProgress(
        'https://cdn.jsdelivr.net/npm/foo/m.task',
        () => undefined,
      ),
    ).rejects.toThrow(/exceeds limit/)
  })

  it('정상 응답(화이트리스트 호스트 + 적정 크기) → ArrayBuffer 반환 + 진행률 1', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    const payload = new Uint8Array([10, 20, 30, 40])
    fetchMock.mockResolvedValueOnce(
      new Response(payload, {
        status: 200,
        headers: { 'content-length': payload.byteLength.toString() },
      }),
    )
    const progress: number[] = []
    const out = await fetchModelWithProgress(
      'https://huggingface.co/model.task',
      (p) => progress.push(p),
    )
    expect(Array.from(out)).toEqual([10, 20, 30, 40])
    expect(progress.at(-1)).toBe(1)
  })

  it('비-200 응답 → init-failed throw', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(new Response('', { status: 502 }))
    await expect(
      fetchModelWithProgress(
        'https://cdn.jsdelivr.net/npm/foo/m.task',
        () => undefined,
      ),
    ).rejects.toThrow(/init-failed: model fetch failed \(502\)/)
  })
})
