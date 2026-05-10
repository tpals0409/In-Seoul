// React hook owning the LLM runtime. Dispatches by VITE_LLM_BACKEND:
//   - 'ollama'    → HTTP fetch to local Ollama daemon (no Worker, no MediaPipe)
//   - 'mediapipe' → MediaPipe Web LLM in a Web Worker (existing path)
//   - 'none'/미설정 → 사용 안 함 (UI 는 템플릿 폴백)
//
// 어떤 백엔드든 hook 의 외부 인터페이스(state/ensureReady/generate)는 동일하다.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LLMState } from '@/types/contracts'
import type { WorkerInMsg, WorkerOutMsg } from '../llm/types'
import { OllamaClient } from '../llm/ollama'

type BackendKind = 'ollama' | 'mediapipe' | 'none'

interface PendingRequest {
  onToken: (deltaText: string) => void
  resolve: () => void
  reject: (err: Error) => void
}

export interface UseLLMOptions {
  modelUrl?: string | undefined
  /** 강제 백엔드 지정 — 테스트/스토리북용. 미설정 시 env 로 결정. */
  backend?: BackendKind | undefined
}

export interface UseLLMResult {
  state: LLMState
  ensureReady: () => Promise<void>
  /** signal 가 abort 되면 토큰 forwarding 을 중단하고 reject 한다. */
  generate: (
    prompt: string,
    onToken: (s: string) => void,
    signal?: AbortSignal,
  ) => Promise<void>
}

function envBackend(): BackendKind {
  const raw = import.meta.env['VITE_LLM_BACKEND']
  if (raw === 'ollama' || raw === 'mediapipe' || raw === 'none') return raw
  // 호환성: VITE_LLM_BACKEND 미설정이면 VITE_GEMMA_MODEL_URL 유무로 mediapipe 추론.
  const gemma = import.meta.env['VITE_GEMMA_MODEL_URL']
  if (typeof gemma === 'string' && gemma.length > 0) return 'mediapipe'
  return 'none'
}

function envModelUrl(): string | undefined {
  const url = import.meta.env['VITE_GEMMA_MODEL_URL']
  return typeof url === 'string' && url.length > 0 ? url : undefined
}

function envOllamaUrl(): string {
  const url = import.meta.env['VITE_OLLAMA_URL']
  return typeof url === 'string' && url.length > 0 ? url : 'http://localhost:11434'
}

function envOllamaModel(): string {
  const m = import.meta.env['VITE_OLLAMA_MODEL']
  return typeof m === 'string' && m.length > 0 ? m : 'gemma3:4b'
}

/** 원격 ollama 호스트로의 *명시적* 옵트인. 정확히 '1' 일 때만 통과. */
function envAllowRemoteLlm(): boolean {
  return import.meta.env['VITE_ALLOW_REMOTE_LLM'] === '1'
}

export interface OllamaHostCheck {
  /** ensureReady/generate 가 통과해도 되는가. */
  allowed: boolean
  /** 호스트가 비-로컬이면 true. allowed=true 인 경우 UI 가 원격 배지 표시. */
  remote: boolean
  /** 차단 시 사용자/개발자에게 노출할 사유. allowed=true 면 undefined. */
  reason?: string
}

/**
 * Ollama URL 의 호스트가 호출 가능한지 *boundary* 검증.
 * - 로컬 호스트 → 항상 통과 (remote=false)
 * - 비-로컬 + VITE_ALLOW_REMOTE_LLM=1 → 통과하되 remote=true (UI 경고용)
 * - 비-로컬 + 동의 없음 → 차단. 사용자 재무 데이터가 외부 서버로 전송될 위험.
 */
export function checkOllamaHost(url: string, allowRemote: boolean): OllamaHostCheck {
  if (isLocalLlmHost(url)) return { allowed: true, remote: false }
  if (allowRemote) return { allowed: true, remote: true }
  return {
    allowed: false,
    remote: true,
    reason:
      `Ollama 호스트 ${url} 가 로컬이 아니므로 차단되었습니다. ` +
      '사용자 데이터가 외부 서버로 전송될 수 있습니다. ' +
      '명시적으로 원격 호출을 허용하려면 VITE_ALLOW_REMOTE_LLM=1 을 설정하세요.',
  }
}

/**
 * 백엔드가 ollama 인 경우, 데몬 호스트가 *진짜로 로컬*인지 판정한다.
 * URL parse 실패하거나 알 수 없는 호스트는 false 처리 (안전 측 기본값).
 *
 * 비-로컬 호스트라면 사용자 데이터가 외부 서버로 전송되는 셈이므로,
 * UI 가 "온디바이스 AI" 라고 표기해서는 안 된다 — 호출자가 이 결과를 보고
 * 명시적인 "원격 LLM 사용 중" 경고를 띄울 수 있게 한다.
 */
export function isLocalLlmHost(url: string): boolean {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '[::1]' ||
      host === '0.0.0.0'
    )
  } catch {
    return false
  }
}

/** 현재 설정된 LLM 백엔드가 *로컬*에서 동작하는지. ollama 의 경우만 호스트 검증. */
export function isOnDeviceLlm(): boolean {
  const backend = envBackend()
  if (backend === 'ollama') return isLocalLlmHost(envOllamaUrl())
  // MediaPipe Web LLM 은 항상 브라우저 내부에서 추론 → on-device.
  if (backend === 'mediapipe') return true
  return false
}

function makeRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`
}

/* ─────────────────── Ollama backend (HTTP, no worker) ─────────────────── */

function useOllamaBackend(enabled: boolean): UseLLMResult {
  const [state, setState] = useState<LLMState>({ status: 'idle' })
  const readyPromiseRef = useRef<Promise<void> | null>(null)
  /** ensureReady 시점에 결정된 원격 여부. status 전이(generating↔ready)에도 보존. */
  const remoteRef = useRef<boolean>(false)

  const client = useMemo(
    () =>
      enabled
        ? new OllamaClient({ url: envOllamaUrl(), model: envOllamaModel() })
        : null,
    [enabled],
  )

  const ensureReady = useCallback(async (): Promise<void> => {
    if (!client) throw new Error('Ollama backend is not enabled')
    if (state.status === 'ready') return
    if (readyPromiseRef.current) return readyPromiseRef.current

    // 호스트 가드를 *fetch 이전* 에 강제. 비-로컬 호스트는 명시 동의 없이 차단.
    const url = envOllamaUrl()
    const check = checkOllamaHost(url, envAllowRemoteLlm())
    if (!check.allowed) {
      const message = check.reason ?? `Ollama host ${url} is not allowed`
      setState({ status: 'error', errorMessage: message, remote: true })
      throw new Error(message)
    }
    remoteRef.current = check.remote

    setState({ status: 'loading', remote: check.remote ? true : undefined })
    const p = (async () => {
      try {
        const models = await client.ping()
        const want = envOllamaModel()
        if (models.length === 0) {
          throw new Error('Ollama 데몬에 모델이 없습니다 (`ollama pull gemma3:4b`)')
        }
        if (!models.some((m) => m === want || m.startsWith(`${want}:`) || want.startsWith(m))) {
          // 모델 매칭은 느슨하게 — 'gemma3:4b' 가 없어도 'gemma3' 변종 있으면 통과.
          // 정확 매칭 실패 시에도 generate 단계에서 재확인되므로 차단하지 않는다.
        }
        setState({ status: 'ready', remote: check.remote ? true : undefined })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setState({
          status: 'error',
          errorMessage: message,
          remote: check.remote ? true : undefined,
        })
        throw err
      }
    })()
    readyPromiseRef.current = p
    try {
      await p
    } finally {
      readyPromiseRef.current = null
    }
  }, [client, state.status])

  const generate = useCallback(
    async (
      prompt: string,
      onToken: (s: string) => void,
      signal?: AbortSignal,
    ): Promise<void> => {
      if (!client) throw new Error('Ollama backend is not enabled')

      // generate 직전 호스트 재검증. ensureReady 우회/env 변동 등 boundary 방어.
      const url = envOllamaUrl()
      const check = checkOllamaHost(url, envAllowRemoteLlm())
      if (!check.allowed) {
        const message = check.reason ?? `Ollama host ${url} is not allowed`
        setState({ status: 'error', errorMessage: message, remote: true })
        throw new Error(message)
      }
      remoteRef.current = check.remote

      if (state.status !== 'ready') throw new Error('LLM is not ready')
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError')

      const remote = remoteRef.current
      setState({ status: 'generating', remote: remote ? true : undefined })
      try {
        await client.generate(
          prompt,
          (delta) => {
            if (signal?.aborted) return
            onToken(delta)
          },
          signal,
        )
        setState((prev) =>
          prev.status === 'generating'
            ? { status: 'ready', remote: remote ? true : undefined }
            : prev,
        )
      } catch (err) {
        const isAbort =
          err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message))
        setState((prev) => {
          if (prev.status !== 'generating') return prev
          if (isAbort) return { status: 'ready', remote: remote ? true : undefined }
          return {
            status: 'error',
            errorMessage: err instanceof Error ? err.message : String(err),
            remote: remote ? true : undefined,
          }
        })
        throw err
      }
    },
    [client, state.status],
  )

  return { state, ensureReady, generate }
}

/* ─────────────────── MediaPipe backend (Web Worker) ─────────────────── */

function useMediapipeBackend(
  enabled: boolean,
  modelUrlOption: string | undefined,
): UseLLMResult {
  const [state, setState] = useState<LLMState>({ status: 'idle' })

  const workerRef = useRef<Worker | null>(null)
  const initPromiseRef = useRef<Promise<void> | null>(null)
  const initResolveRef = useRef<(() => void) | null>(null)
  const initRejectRef = useRef<((err: Error) => void) | null>(null)
  const pendingRef = useRef<Map<string, PendingRequest>>(new Map())
  const modelUrlRef = useRef<string | undefined>(modelUrlOption ?? envModelUrl())

  useEffect(() => {
    modelUrlRef.current = modelUrlOption ?? envModelUrl()
  }, [modelUrlOption])

  useEffect(() => {
    if (!enabled) return
    console.warn('[INSEOUL_LLM] worker:constructing')
    let worker: Worker
    try {
      worker = new Worker(
        new URL('../worker/llm.worker.ts', import.meta.url),
        { type: 'module' },
      )
      console.warn('[INSEOUL_LLM] worker:constructed')
    } catch (err) {
      console.warn('[INSEOUL_LLM] worker:construct-throw', err instanceof Error ? err.message : String(err))
      throw err
    }
    workerRef.current = worker
    const pendingMap = pendingRef.current

    const onMessage = (ev: MessageEvent<WorkerOutMsg>) => {
      const msg = ev.data
      switch (msg.type) {
        case 'trace':
          console.warn('[INSEOUL_LLM]', msg.stage, msg.detail ?? {})
          break
        case 'progress':
          setState({ status: 'downloading', progress: msg.progress })
          break
        case 'loading':
          console.warn('[INSEOUL_LLM] state→loading (download done, GPU upload)')
          setState({ status: 'loading' })
          break
        case 'ready': {
          console.warn('[INSEOUL_LLM] state→ready')
          setState({ status: 'ready' })
          const resolve = initResolveRef.current
          initResolveRef.current = null
          initRejectRef.current = null
          if (resolve) resolve()
          break
        }
        case 'token': {
          const reqId = msg.requestId
          if (reqId !== undefined) {
            const pending = pendingRef.current.get(reqId)
            if (pending) pending.onToken(msg.text)
          }
          break
        }
        case 'done': {
          const reqId = msg.requestId
          if (reqId !== undefined) {
            const pending = pendingRef.current.get(reqId)
            if (pending) {
              pendingRef.current.delete(reqId)
              pending.resolve()
            }
          }
          setState((prev) =>
            prev.status === 'generating' ? { status: 'ready' } : prev,
          )
          break
        }
        case 'error': {
          const message = msg.message
          console.warn('[INSEOUL_LLM] worker error', { code: msg.code, message })
          if (msg.code === 'unsupported' || msg.code === 'init-failed') {
            const status = msg.code === 'unsupported' ? 'unsupported' : 'error'
            setState({ status, errorMessage: message })
            const reject = initRejectRef.current
            initResolveRef.current = null
            initRejectRef.current = null
            if (reject) reject(new Error(message))
            initPromiseRef.current = null
          }
          const reqId = msg.requestId
          if (reqId !== undefined) {
            const pending = pendingRef.current.get(reqId)
            if (pending) {
              pendingRef.current.delete(reqId)
              pending.reject(new Error(message))
            }
            setState((prev) =>
              prev.status === 'generating' ? { status: 'ready' } : prev,
            )
          }
          break
        }
      }
    }

    // worker 가 silent death 로 죽으면 main thread `error` 이벤트가 유일한 단서.
    // worker 측 self.addEventListener('error') 가 postMessage 로 보조 trace 를
    // 보내지만 worker module evaluation 자체가 throw 하면 그 핸들러도 못 띄움 —
    // ErrorEvent 모든 필드 + error.stack 을 main console 에 박는 게 최후 단서.
    const onError = (ev: ErrorEvent) => {
      const stack = ev.error instanceof Error ? ev.error.stack : undefined
      console.error('[INSEOUL_LLM] worker.onerror', {
        message: ev.message,
        filename: ev.filename,
        lineno: ev.lineno,
        colno: ev.colno,
        stack,
      })
      setState({ status: 'error', errorMessage: ev.message })
      const reject = initRejectRef.current
      initResolveRef.current = null
      initRejectRef.current = null
      if (reject) reject(new Error(ev.message))
      initPromiseRef.current = null
      for (const [, pending] of pendingRef.current) {
        pending.reject(new Error(ev.message))
      }
      pendingRef.current.clear()
    }

    // structured-clone 실패로 message 가 deserialize 안 되는 케이스 (Worker spec).
    // ErrorEvent 가 아니라 일반 Event 라 message 필드 없음 — 발생 자체를 기록.
    const onMessageError = (ev: Event) => {
      console.error('[INSEOUL_LLM] worker.onmessageerror', {
        type: ev.type,
        timeStamp: ev.timeStamp,
      })
      setState({
        status: 'error',
        errorMessage: 'worker message deserialization failed',
      })
    }

    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onError)
    worker.addEventListener('messageerror', onMessageError)

    return () => {
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
      worker.removeEventListener('messageerror', onMessageError)
      try {
        const dispose: WorkerInMsg = { type: 'dispose' }
        worker.postMessage(dispose)
      } catch {
        /* ignore */
      }
      worker.terminate()
      workerRef.current = null
      for (const [, pending] of pendingMap) {
        pending.reject(new Error('worker disposed'))
      }
      pendingMap.clear()
      const reject = initRejectRef.current
      initResolveRef.current = null
      initRejectRef.current = null
      if (reject) reject(new Error('worker disposed'))
      initPromiseRef.current = null
    }
  }, [enabled])

  const ensureReady = useCallback(async (): Promise<void> => {
    if (state.status === 'ready') return
    if (state.status === 'unsupported') {
      throw new Error('WebGPU is not supported on this device')
    }
    if (initPromiseRef.current) return initPromiseRef.current

    const url = modelUrlRef.current
    if (!url) {
      throw new Error('VITE_GEMMA_MODEL_URL is not configured')
    }
    const worker = workerRef.current
    if (!worker) throw new Error('worker is not initialized')

    const promise = new Promise<void>((resolve, reject) => {
      initResolveRef.current = resolve
      initRejectRef.current = reject
    })
    initPromiseRef.current = promise
    setState({ status: 'downloading', progress: 0 })
    console.warn('[INSEOUL_LLM] init posted', { url })
    const initMsg: WorkerInMsg = { type: 'init', modelUrl: url }
    worker.postMessage(initMsg)
    try {
      await promise
    } finally {
      initPromiseRef.current = null
    }
  }, [state.status])

  const generate = useCallback(
    async (
      prompt: string,
      onToken: (s: string) => void,
      signal?: AbortSignal,
    ): Promise<void> => {
      const worker = workerRef.current
      if (!worker) throw new Error('worker is not initialized')
      if (state.status !== 'ready') {
        throw new Error('LLM is not ready')
      }
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError')

      const requestId = makeRequestId()
      setState({ status: 'generating' })

      let onAbort: (() => void) | null = null
      const promise = new Promise<void>((resolve, reject) => {
        const noopToken = () => {
          /* abort 후 들어오는 잔여 토큰 폐기 */
        }
        pendingRef.current.set(requestId, { onToken, resolve, reject })
        if (signal) {
          onAbort = () => {
            const entry = pendingRef.current.get(requestId)
            if (entry) {
              pendingRef.current.set(requestId, {
                onToken: noopToken,
                resolve: () => undefined,
                reject: () => undefined,
              })
              pendingRef.current.delete(requestId)
              setState((prev) =>
                prev.status === 'generating' ? { status: 'ready' } : prev,
              )
              reject(new DOMException('aborted', 'AbortError'))
            }
          }
          signal.addEventListener('abort', onAbort, { once: true })
        }
      })
      const msg: WorkerInMsg = { type: 'generate', prompt, requestId }
      worker.postMessage(msg)
      try {
        await promise
      } finally {
        if (signal && onAbort) signal.removeEventListener('abort', onAbort)
      }
    },
    [state.status],
  )

  return { state, ensureReady, generate }
}

/* ─────────────────── 'none' backend (no LLM) ─────────────────── */

function useNoneBackend(): UseLLMResult {
  const ensureReady = useCallback(async () => {
    throw new Error('LLM backend is not configured (VITE_LLM_BACKEND)')
  }, [])
  const generate = useCallback(async () => {
    throw new Error('LLM backend is not configured')
  }, [])
  // status: idle 로 남는다 — useAdvisor 가 status !== 'ready' 분기로 템플릿 사용.
  return { state: { status: 'idle' }, ensureReady, generate }
}

/* ─────────────────── public hook ─────────────────── */

export function useLLM(options: UseLLMOptions = {}): UseLLMResult {
  const backend: BackendKind = options.backend ?? envBackend()
  // hook 호출은 분기 없이 *모든* 백엔드를 호출해야 React 규칙을 지킨다.
  // 사용 안 하는 백엔드는 idle 상태로 흘러가고 부작용을 내지 않도록 작성됨.
  const ollama = useOllamaBackend(backend === 'ollama')
  const mediapipe = useMediapipeBackend(backend === 'mediapipe', options.modelUrl)
  const none = useNoneBackend()

  if (backend === 'ollama') return ollama
  if (backend === 'mediapipe') return mediapipe
  return none
}
