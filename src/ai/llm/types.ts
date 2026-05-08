// Internal LLM runtime types — exchanged between hook (main thread) and worker.
// Do not export to non-ai consumers; public surface lives in @/types/contracts.

export interface GenerateOptions {
  /** Maximum tokens to generate. Mapped to MediaPipe maxTokens. */
  maxTokens?: number | undefined
  temperature?: number | undefined
  topK?: number | undefined
  /** Optional opaque request id for correlating streaming output. */
  requestId?: string | undefined
}

// =============================================================================
// Worker → Main (output)
// =============================================================================

export interface WorkerOutTokenMsg {
  type: 'token'
  /** Cumulative text so far (MediaPipe progress listener gives partial deltas;
   *  the worker forwards only the new delta to keep main-thread cheap). */
  text: string
  requestId?: string | undefined
}

export interface WorkerOutDoneMsg {
  type: 'done'
  requestId?: string | undefined
}

export interface WorkerOutErrorMsg {
  type: 'error'
  /** Stable code so hook can map to LLMStatus. */
  code: 'unsupported' | 'init-failed' | 'generate-failed' | 'disposed'
  message: string
  requestId?: string | undefined
}

export interface WorkerOutProgressMsg {
  type: 'progress'
  /** 0..1 download progress. */
  progress: number
}

export interface WorkerOutReadyMsg {
  type: 'ready'
}

export interface WorkerOutLoadingMsg {
  type: 'loading'
}

export type WorkerOutMsg =
  | WorkerOutTokenMsg
  | WorkerOutDoneMsg
  | WorkerOutErrorMsg
  | WorkerOutProgressMsg
  | WorkerOutReadyMsg
  | WorkerOutLoadingMsg

// =============================================================================
// Main → Worker (input)
// =============================================================================

export interface WorkerInInitMsg {
  type: 'init'
  modelUrl: string
  options?: GenerateOptions | undefined
}

export interface WorkerInGenerateMsg {
  type: 'generate'
  prompt: string
  requestId: string
  options?: GenerateOptions | undefined
}

export interface WorkerInDisposeMsg {
  type: 'dispose'
}

export type WorkerInMsg =
  | WorkerInInitMsg
  | WorkerInGenerateMsg
  | WorkerInDisposeMsg
