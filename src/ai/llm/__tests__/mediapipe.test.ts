import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DOWNLOAD_IDLE_TIMEOUT_MS,
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
      expect.arrayContaining(['huggingface.co', 'localhost', '127.0.0.1']),
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
        'https://huggingface.co/foo/resolve/main/m.task',
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
        'https://huggingface.co/foo/resolve/main/m.task',
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
        'https://huggingface.co/foo/resolve/main/m.task',
        () => undefined,
      ),
    ).rejects.toThrow(/init-failed: model fetch failed \(502\)/)
  })

  // ===========================================================================
  // Sprint 12 task-2: download lifecycle trace + idle timeout
  // ===========================================================================

  it('정상 stream → trace stage 가 request-start → response → first-chunk → milestone → complete 순서로 emit', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    // 10 chunks * 10 bytes = 100 bytes total. 각 chunk 마다 progress 가 0.10 씩
    // 증가 → 0.10 / 0.25 / 0.50 / 0.75 / 0.90 boundary 모두 횡단.
    const chunks: Uint8Array[] = []
    for (let i = 0; i < 10; i++) {
      chunks.push(new Uint8Array([i, i, i, i, i, i, i, i, i, i]))
    }
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(c)
        controller.close()
      },
    })
    fetchMock.mockResolvedValueOnce(
      new Response(stream, {
        status: 200,
        headers: { 'content-length': '100' },
      }),
    )
    const traceCalls: { stage: string; detail?: Record<string, unknown> }[] = []
    const url = 'https://huggingface.co/foo/resolve/main/m.task'
    await fetchModelWithProgress(
      url,
      () => undefined,
      (stage, detail) => {
        traceCalls.push({ stage, ...(detail !== undefined ? { detail } : {}) })
      },
    )
    const stages = traceCalls.map((c) => c.stage)
    expect(stages[0]).toBe('download:request-start')
    expect(stages[1]).toBe('download:response')
    // first-chunk 는 첫 chunk 직후 emit 되며, 이후 milestone 들이 따라온다.
    const firstChunkIdx = stages.indexOf('download:first-chunk')
    const completeIdx = stages.indexOf('download:complete')
    expect(firstChunkIdx).toBeGreaterThan(1)
    expect(completeIdx).toBe(stages.length - 1)
    // 5 boundary 각각 정확히 한 번씩 emit.
    const milestoneCalls = traceCalls.filter(
      (c) => c.stage === 'download:milestone',
    )
    expect(milestoneCalls).toHaveLength(5)
    const milestoneValues = milestoneCalls
      .map((c) => (c.detail as { progress: number }).progress)
      .sort((a, b) => a - b)
    expect(milestoneValues).toEqual([0.10, 0.25, 0.50, 0.75, 0.90])
    // request-start detail 에 url 포함 / response detail 에 status / complete detail
    // 에 totalBytes 포함되는지 sanity check.
    expect(traceCalls[0]?.detail).toMatchObject({ modelUrl: url })
    expect(traceCalls[1]?.detail).toMatchObject({ status: 200, ok: true })
    expect(traceCalls.at(-1)?.detail).toMatchObject({ totalBytes: 100 })
  })

  it('첫 chunk 후 후속 chunk 가 idleTimeoutMs 동안 도달하지 않으면 init-failed throw + idle-timeout trace', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    // ReadableStream 의 enqueue→close 누락 케이스가 환경에 따라 자동 termination 으로
    // 처리될 수 있어 mock reader 로 직접 두 번째 read() 를 무한 pending 시킨다.
    let firstRead = true
    const reader = {
      read: vi.fn().mockImplementation(() => {
        if (firstRead) {
          firstRead = false
          return Promise.resolve({
            done: false,
            value: new Uint8Array([1, 2, 3]),
          })
        }
        return new Promise(() => undefined) // never resolves — idle watchdog 가 race 승리해야 함
      }),
      cancel: vi.fn().mockResolvedValue(undefined),
      releaseLock: vi.fn(),
    }
    const fakeBody = { getReader: () => reader }
    const fakeResponse = {
      ok: true,
      status: 200,
      url: 'https://huggingface.co/foo/resolve/main/m.task',
      headers: new Headers({ 'content-length': '1000' }),
      body: fakeBody,
      arrayBuffer: () => Promise.reject(new Error('not used')),
    }
    fetchMock.mockResolvedValueOnce(fakeResponse as unknown as Response)
    const traceCalls: { stage: string; detail?: Record<string, unknown> }[] = []
    await expect(
      fetchModelWithProgress(
        'https://huggingface.co/foo/resolve/main/m.task',
        () => undefined,
        (stage, detail) => {
          traceCalls.push({ stage, ...(detail !== undefined ? { detail } : {}) })
        },
        { idleTimeoutMs: 50 },
      ),
    ).rejects.toThrow(/init-failed: download stalled \(no chunk for 50ms\)/)
    const idleTrace = traceCalls.find((c) => c.stage === 'download:idle-timeout')
    expect(idleTrace).toBeDefined()
    expect(idleTrace?.detail).toMatchObject({ idleMs: 50, lastByte: 3 })
  })

  it('idle-timeout 발화 시 reader.cancel() 가 호출됨', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    const cancelSpy = vi.fn().mockResolvedValue(undefined)
    let firstRead = true
    const reader = {
      read: vi.fn().mockImplementation(() => {
        if (firstRead) {
          firstRead = false
          return Promise.resolve({
            done: false,
            value: new Uint8Array([42, 42, 42]),
          })
        }
        return new Promise(() => undefined) // never resolves
      }),
      cancel: cancelSpy,
      releaseLock: vi.fn(),
    }
    const fakeBody = { getReader: () => reader }
    const fakeResponse = {
      ok: true,
      status: 200,
      url: 'https://huggingface.co/foo/resolve/main/m.task',
      headers: new Headers({ 'content-length': '1000' }),
      body: fakeBody,
      arrayBuffer: () => Promise.reject(new Error('not used')),
    }
    fetchMock.mockResolvedValueOnce(fakeResponse as unknown as Response)
    await expect(
      fetchModelWithProgress(
        'https://huggingface.co/foo/resolve/main/m.task',
        () => undefined,
        () => undefined,
        { idleTimeoutMs: 30 },
      ),
    ).rejects.toThrow(/init-failed: download stalled/)
    expect(cancelSpy).toHaveBeenCalled()
  })

  it('progress 가 같은 milestone boundary 를 여러 chunk 에 걸쳐 통과해도 trace 는 단 한 번만 emit (dedup)', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    // 100 chunks * 1 byte. progress 가 boundary 를 매끄럽게 통과하지만 내부 set 으로
    // 각 boundary 에 대해 1회만 emit 되어야 한다.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 100; i++) {
          controller.enqueue(new Uint8Array([i & 0xff]))
        }
        controller.close()
      },
    })
    fetchMock.mockResolvedValueOnce(
      new Response(stream, {
        status: 200,
        headers: { 'content-length': '100' },
      }),
    )
    const milestoneCount = new Map<number, number>()
    await fetchModelWithProgress(
      'https://huggingface.co/foo/resolve/main/m.task',
      () => undefined,
      (stage, detail) => {
        if (stage === 'download:milestone' && detail) {
          const p = (detail as { progress: number }).progress
          milestoneCount.set(p, (milestoneCount.get(p) ?? 0) + 1)
        }
      },
    )
    // 정확히 5 boundary, 각 1회.
    expect([...milestoneCount.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [0.10, 1],
      [0.25, 1],
      [0.50, 1],
      [0.75, 1],
      [0.90, 1],
    ])
  })

  it('onTrace 미지정 (undefined) 이어도 기존 호출자 (worker / main-thread fallback 외) 는 정상 동작', async () => {
    // 회귀 가드: trace 콜백이 옵셔널이라는 계약 검증.
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    const payload = new Uint8Array([1, 2, 3, 4])
    fetchMock.mockResolvedValueOnce(
      new Response(payload, {
        status: 200,
        headers: { 'content-length': '4' },
      }),
    )
    const out = await fetchModelWithProgress(
      'https://huggingface.co/m.task',
      () => undefined,
    )
    expect(Array.from(out)).toEqual([1, 2, 3, 4])
  })

  it('DOWNLOAD_IDLE_TIMEOUT_MS 상수 export = 30s', () => {
    expect(DOWNLOAD_IDLE_TIMEOUT_MS).toBe(30_000)
  })
})
