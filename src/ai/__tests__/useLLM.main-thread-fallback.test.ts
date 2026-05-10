import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLLM } from '../hooks/useLLM'

/**
 * Sprint 11 task-4 — main-thread mediapipe fallback 분기 검증.
 *
 * accept_criteria:
 *   (a) VITE_LLM_RUN_MAIN_THREAD='1' + backend='mediapipe' → Worker constructor 미호출
 *       (= worker bypass, main thread 직접 호출 분기 진입).
 *   (b) VITE_LLM_RUN_MAIN_THREAD 미설정 + backend='mediapipe' → 기존 worker path 진입
 *       (= Worker constructor 정확히 1회 호출, 회귀 0).
 *   (c) VITE_LLM_RUN_MAIN_THREAD='0' + backend='mediapipe' → off 처리, 기존 worker path 진입.
 *   (d) backend='ollama' 면 VITE_LLM_RUN_MAIN_THREAD='1' 이라도 Worker 미호출 (영향 X).
 *
 * 실제 mediapipe 모델 로드 / GPU 호출은 jsdom 에서 검증 불가 (WebGPU + wasm 필요)
 * — 단위 테스트는 *분기 자체* 가 정상 동작하는지만 본다. 옵션 키가 워커 부팅을
 * 막는다는 사실 자체가 fallback 핵심 기능. 실제 추론 검증은 시뮬레이터/실기기 UAT.
 */

class MockWorker extends EventTarget {
  postMessage = vi.fn()
  terminate = vi.fn()
}

let workerCallCount = 0

beforeEach(() => {
  workerCallCount = 0
  function WorkerStub(this: MockWorker): MockWorker {
    workerCallCount += 1
    return new MockWorker()
  }
  vi.stubGlobal('Worker', vi.fn(WorkerStub as unknown as () => MockWorker))
  vi.stubEnv('VITE_GEMMA_MODEL_URL', 'https://huggingface.co/test/model.task')
  vi.stubEnv('VITE_OLLAMA_URL', '')
  vi.stubEnv('VITE_ALLOW_REMOTE_LLM', '')
  // 부팅 trace console.warn 은 단언과 무관 — 출력 노이즈만 줄임.
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useLLM main-thread fallback (Sprint 11 task-4)', () => {
  it('VITE_LLM_RUN_MAIN_THREAD=1 + mediapipe → Worker constructor 미호출', () => {
    vi.stubEnv('VITE_LLM_BACKEND', 'mediapipe')
    vi.stubEnv('VITE_LLM_RUN_MAIN_THREAD', '1')

    const { unmount } = renderHook(() => useLLM())

    // 핵심 단언: worker 가 부팅되지 않아야 한다.
    expect(workerCallCount).toBe(0)
    unmount()
  })

  it('VITE_LLM_RUN_MAIN_THREAD 미지정 + mediapipe → 기존 worker path 회귀', () => {
    vi.stubEnv('VITE_LLM_BACKEND', 'mediapipe')
    // VITE_LLM_RUN_MAIN_THREAD 의도적으로 미설정.

    const { unmount } = renderHook(() => useLLM())

    // worker path 가 살아있다는 회귀 가드.
    expect(workerCallCount).toBe(1)
    unmount()
  })

  it('VITE_LLM_RUN_MAIN_THREAD=0 + mediapipe → off 처리, worker path', () => {
    vi.stubEnv('VITE_LLM_BACKEND', 'mediapipe')
    vi.stubEnv('VITE_LLM_RUN_MAIN_THREAD', '0')

    const { unmount } = renderHook(() => useLLM())

    // '1' 가 아닌 모든 값은 off — '0' 도 worker path 로 흐른다.
    expect(workerCallCount).toBe(1)
    unmount()
  })

  it('VITE_LLM_RUN_MAIN_THREAD=1 + ollama → mediapipe 가 아니므로 Worker 미호출 (ollama 정상)', () => {
    vi.stubEnv('VITE_LLM_BACKEND', 'ollama')
    vi.stubEnv('VITE_LLM_RUN_MAIN_THREAD', '1')
    vi.stubEnv('VITE_OLLAMA_URL', 'http://localhost:11434')
    vi.stubEnv('VITE_OLLAMA_MODEL', 'gemma3:4b')
    vi.stubEnv('VITE_GEMMA_MODEL_URL', '')

    const { unmount } = renderHook(() => useLLM())

    // ollama 는 worker 를 안 쓰고, main-thread 옵션은 mediapipe 한정 — 둘 다 영향 0.
    expect(workerCallCount).toBe(0)
    unmount()
  })
})
