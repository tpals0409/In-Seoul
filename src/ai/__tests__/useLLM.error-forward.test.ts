import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLLM } from '../hooks/useLLM'

/**
 * Sprint 11 task-2 — worker silent-death trace forward 검증.
 *
 * accept_criteria:
 *   (a) worker.onerror 발화 시 ErrorEvent 5필드 (message/filename/lineno/colno/stack)
 *       를 `[INSEOUL_LLM] worker.onerror` console.error 로 forward → main → Capacitor 로
 *       trace 가 나가야 한다 (worker 가 죽어 postMessage 도 못 보낼 때 유일한 단서).
 *   (b) worker.onmessageerror 발화 시 별도 trace + state.error 로 표시.
 *
 * Capacitor / iOS WebView native log 로의 forward 자체는 vitest jsdom 에서 검증 불가
 * (xcrun device log 는 통합 테스트 영역) — 여기서는 main thread `console.error` 호출
 * 까지가 단위 테스트 boundary. 그 이후는 capacitor.config.ts `loggingBehavior: 'debug'`
 * 가 보장하며 docs/llm-debugging.md 가 추적 manual 을 제공.
 */

class MockWorker extends EventTarget {
  postMessage = vi.fn()
  terminate = vi.fn()
}

let activeWorker: MockWorker | null = null

beforeEach(() => {
  activeWorker = null
  // 화살표 함수는 [[Construct]] 가 없어 `new Worker(...)` 가 throw — 일반 function 으로
  // 작성해 vi.fn 으로 wrap. 명시 return 된 object 가 new 의 결과로 채택된다.
  function WorkerStub(this: MockWorker): MockWorker {
    const w = new MockWorker()
    activeWorker = w
    return w
  }
  vi.stubGlobal('Worker', vi.fn(WorkerStub as unknown as () => MockWorker))
  vi.stubEnv('VITE_LLM_BACKEND', 'mediapipe')
  vi.stubEnv('VITE_GEMMA_MODEL_URL', 'https://example.test/model.task')
  vi.stubEnv('VITE_OLLAMA_URL', '')
  vi.stubEnv('VITE_ALLOW_REMOTE_LLM', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useLLM mediapipe — worker silent-death trace forward', () => {
  it('worker.onerror → ErrorEvent 5필드를 [INSEOUL_LLM] worker.onerror 로 console.error', async () => {
    // 부팅 trace 의 console.warn 은 결과 단언과 무관 — 테스트 출력 노이즈만 줄임.
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const { result, unmount } = renderHook(() => useLLM())
    expect(activeWorker).not.toBeNull()

    const stack = 'Error: ModuleFactory not set.\n  at boot (cdn.jsdelivr.net/bundle.mjs:1234:56)'
    const errorObject = new Error('ModuleFactory not set.')
    errorObject.stack = stack

    await act(async () => {
      activeWorker!.dispatchEvent(
        new ErrorEvent('error', {
          message: 'ModuleFactory not set.',
          filename: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.27/wasm/genai_wasm.js',
          lineno: 1234,
          colno: 56,
          error: errorObject,
        }),
      )
    })

    // 5 필드가 다 들어갔는지 + tag prefix 가 있는지.
    const matchingCall = errorSpy.mock.calls.find(
      ([tag]) => tag === '[INSEOUL_LLM] worker.onerror',
    )
    expect(matchingCall, 'console.error 호출에 [INSEOUL_LLM] worker.onerror 가 없음').toBeDefined()
    const detail = matchingCall![1] as Record<string, unknown>
    expect(detail).toMatchObject({
      message: 'ModuleFactory not set.',
      filename: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.27/wasm/genai_wasm.js',
      lineno: 1234,
      colno: 56,
      stack,
    })

    expect(result.current.state.status).toBe('error')
    expect(
      result.current.state.status === 'error' ? result.current.state.errorMessage : undefined,
    ).toBe('ModuleFactory not set.')

    unmount()
  })

  it('worker.onmessageerror → 별도 trace + state.error 로 deserialization 실패 표면화', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const { result, unmount } = renderHook(() => useLLM())
    expect(activeWorker).not.toBeNull()

    await act(async () => {
      activeWorker!.dispatchEvent(new Event('messageerror'))
    })

    const matchingCall = errorSpy.mock.calls.find(
      ([tag]) => tag === '[INSEOUL_LLM] worker.onmessageerror',
    )
    expect(matchingCall, 'console.error 에 worker.onmessageerror trace 가 없음').toBeDefined()
    const detail = matchingCall![1] as Record<string, unknown>
    expect(detail).toMatchObject({ type: 'messageerror' })

    expect(result.current.state.status).toBe('error')

    unmount()
  })

  it('error 발화 시 in-flight init promise 가 reject + pending generate 도 reject', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const { result, unmount } = renderHook(() => useLLM())
    expect(activeWorker).not.toBeNull()

    // ensureReady 를 띄워 init promise 를 만들어 두고, 해결 전에 worker.error 를 발화.
    let ensureRejection: unknown = null
    const ensurePromise = act(async () => {
      try {
        await result.current.ensureReady()
      } catch (err) {
        ensureRejection = err
      }
    })

    await act(async () => {
      activeWorker!.dispatchEvent(
        new ErrorEvent('error', {
          message: 'worker died',
          filename: 'inline',
          lineno: 1,
          colno: 1,
          error: new Error('worker died'),
        }),
      )
    })
    await ensurePromise

    expect(ensureRejection).toBeInstanceOf(Error)
    expect((ensureRejection as Error).message).toBe('worker died')
    expect(result.current.state.status).toBe('error')

    unmount()
  })
})
