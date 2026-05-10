// Web Worker entry — owns the MediaPipe LlmInference instance. The main
// thread interacts only via WorkerInMsg / WorkerOutMsg. Vite handles bundling
// (vite.config.ts: worker.format = 'es').

/// <reference lib="webworker" />

import type {
  WorkerInMsg,
  WorkerOutMsg,
  WorkerOutErrorMsg,
} from '../llm/types'

declare const self: DedicatedWorkerGlobalScope

// Bootstrap trace — fires before any heavy import. If main never sees this,
// worker module evaluation itself failed before listeners registered.
self.postMessage({ type: 'trace', stage: 'worker:bootstrap-start' } as WorkerOutMsg)

self.addEventListener('error', (ev: ErrorEvent) => {
  // ErrorEvent 의 error 필드는 spec 상 throw 한 객체. main 에서 stack 을 봐야
  // silent-death root cause (e.g. wasm streaming compile fail) 를 짚을 수 있다.
  const stack = ev.error instanceof Error ? ev.error.stack : undefined
  self.postMessage({
    type: 'trace',
    stage: 'worker:self-error',
    detail: {
      message: ev.message,
      filename: ev.filename,
      lineno: ev.lineno,
      colno: ev.colno,
      stack,
    },
  } as WorkerOutMsg)
})
self.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
  const reason = ev.reason
  const message = reason instanceof Error ? reason.message : String(reason)
  const stack = reason instanceof Error ? reason.stack : undefined
  self.postMessage({
    type: 'trace',
    stage: 'worker:unhandled-rejection',
    detail: { message, stack },
  } as WorkerOutMsg)
})

// Dynamic import so any throw in mediapipe top-level (e.g. wasm Module factory
// init) lands in our catch and reports as a trace, not a silent worker death.
let MediaPipeLLM: typeof import('../llm/mediapipe').MediaPipeLLM
try {
  self.postMessage({ type: 'trace', stage: 'worker:before-import-mediapipe' } as WorkerOutMsg)
  const mod = await import('../llm/mediapipe')
  MediaPipeLLM = mod.MediaPipeLLM
  self.postMessage({ type: 'trace', stage: 'worker:after-import-mediapipe' } as WorkerOutMsg)
} catch (err) {
  self.postMessage({
    type: 'trace',
    stage: 'worker:import-mediapipe-throw',
    detail: {
      phase: 'import-fail',
      target: '@mediapipe/tasks-genai',
      message: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.name : undefined,
      stack: err instanceof Error ? err.stack : undefined,
    },
  } as WorkerOutMsg)
  throw err
}

let llm: InstanceType<typeof MediaPipeLLM>
try {
  llm = new MediaPipeLLM()
  self.postMessage({ type: 'trace', stage: 'worker:llm-instantiated' } as WorkerOutMsg)
} catch (err) {
  self.postMessage({
    type: 'trace',
    stage: 'worker:llm-instantiate-throw',
    detail: {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    },
  } as WorkerOutMsg)
  throw err
}

let initialized = false

function send(msg: WorkerOutMsg): void {
  self.postMessage(msg)
}

function errorMsg(
  code: WorkerOutErrorMsg['code'],
  err: unknown,
  requestId?: string,
): WorkerOutErrorMsg {
  const message =
    err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown error'
  // If the wrapper threw with the form 'unsupported: ...' rewrite the code.
  let resolvedCode = code
  if (typeof message === 'string') {
    if (message.startsWith('unsupported')) resolvedCode = 'unsupported'
    else if (message.startsWith('init-failed')) resolvedCode = 'init-failed'
    else if (message.startsWith('generate-failed')) resolvedCode = 'generate-failed'
  }
  return {
    type: 'error',
    code: resolvedCode,
    message,
    ...(requestId !== undefined ? { requestId } : {}),
  }
}

async function handleInit(modelUrl: string): Promise<void> {
  if (initialized) {
    send({ type: 'ready' })
    return
  }
  try {
    await llm.init(
      modelUrl,
      (progress) => {
        send({ type: 'progress', progress })
      },
      // Sprint 12 task-2: download lifecycle trace 도 main thread 로 forward —
      // 'download:request-start' / 'download:response' / 'download:first-chunk'
      // / 'download:milestone' / 'download:complete' / 'download:idle-timeout'
      // 가 useLLM 의 'trace' 메시지 핸들러로 흘러간다 (배지 0% stall 진단용).
      (stage, detail) => {
        if (detail !== undefined) {
          send({ type: 'trace', stage, detail })
        } else {
          send({ type: 'trace', stage })
        }
      },
    )
    // Once download finishes, we're loading the model into the GPU runtime.
    send({ type: 'loading' })
    initialized = true
    send({ type: 'ready' })
  } catch (err) {
    send(errorMsg('init-failed', err))
  }
}

async function handleGenerate(
  prompt: string,
  requestId: string,
): Promise<void> {
  if (!initialized) {
    send(errorMsg('generate-failed', 'model not initialized', requestId))
    return
  }
  let lastSent = ''
  try {
    await llm.generate(prompt, (partial, done) => {
      // MediaPipe partials may be cumulative or delta depending on the model.
      // We compute a delta vs lastSent — if partial doesn't start with lastSent
      // (i.e. it's already a delta), treat it as the delta directly.
      let delta: string
      if (partial.startsWith(lastSent)) {
        delta = partial.slice(lastSent.length)
        lastSent = partial
      } else {
        delta = partial
        lastSent = lastSent + partial
      }
      if (delta.length > 0) {
        send({ type: 'token', text: delta, requestId })
      }
      if (done) {
        send({ type: 'done', requestId })
      }
    })
  } catch (err) {
    send(errorMsg('generate-failed', err, requestId))
  }
}

function handleDispose(): void {
  try {
    llm.dispose()
    initialized = false
  } catch (err) {
    send(errorMsg('disposed', err))
  }
}

self.addEventListener('message', (ev: MessageEvent<WorkerInMsg>) => {
  const msg = ev.data
  switch (msg.type) {
    case 'init':
      void handleInit(msg.modelUrl)
      break
    case 'generate':
      void handleGenerate(msg.prompt, msg.requestId)
      break
    case 'dispose':
      handleDispose()
      break
  }
})
