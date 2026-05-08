// React context object + value type for the advisor. Split from
// AdvisorContext.tsx so the latter can export only components (react-refresh).

import { createContext } from 'react'
import type {
  AdvisorContext as AdvisorCtx,
  ChatMsg,
  LLMState,
} from '@/types/contracts'

export interface AdvisorContextValue {
  state: { llm: LLMState }
  history: ChatMsg[]
  ensureReady: () => Promise<void>
  ask: (
    question: string,
    ctx: AdvisorCtx,
    signal?: AbortSignal,
  ) => AsyncIterable<string>
  clearHistory: () => void
  /** Currently bound advisor context (last screen that opened the sheet). */
  current: AdvisorCtx | null
  openWith: (ctx: AdvisorCtx) => void
  close: () => void
  isOpen: boolean
}

export const AdvisorReactContext = createContext<AdvisorContextValue | null>(
  null,
)
