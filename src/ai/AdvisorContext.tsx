// React provider for the advisor context. App.tsx mounts this once so all
// screens share a single Worker instance and chat history.
//
// The context object + value type live in ./advisorContextValue, and the
// `useAdvisorContext` hook lives in ./hooks/useAdvisorContext, so this file
// can export only the React component (react-refresh requirement).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AdvisorContext as AdvisorCtx } from '@/types/contracts'
import { useAdvisor } from './hooks/useAdvisor'
import {
  AdvisorReactContext,
  type AdvisorContextValue,
} from './advisorContextValue'

export interface AdvisorProviderProps {
  children: ReactNode
}

export function AdvisorProvider({ children }: AdvisorProviderProps): ReactNode {
  const { state, history, ensureReady, ask, clearHistory } = useAdvisor()

  const [current, setCurrent] = useState<AdvisorCtx | null>(null)
  const [isOpen, setIsOpen] = useState<boolean>(false)

  // 앱 launch 시점에 모델 다운로드 시작 (advisor 시트 진입 안 기다림).
  // ref guard 로 한 번만 호출 — Provider 가 unmount 안 되는 한 한 번.
  const eagerInitRef = useRef(false)
  useEffect(() => {
    if (eagerInitRef.current) return
    eagerInitRef.current = true
    console.warn('[INSEOUL_LLM] eager-init from AdvisorProvider')
    ensureReady().catch((err) => {
      console.warn(
        '[INSEOUL_LLM] eager-init rejected',
        err instanceof Error ? err.message : String(err),
      )
    })
  }, [ensureReady])

  const openWith = useCallback((ctx: AdvisorCtx) => {
    setCurrent(ctx)
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  const value = useMemo<AdvisorContextValue>(
    () => ({
      state,
      history,
      ensureReady,
      ask,
      clearHistory,
      current,
      openWith,
      close,
      isOpen,
    }),
    [
      state,
      history,
      ensureReady,
      ask,
      clearHistory,
      current,
      openWith,
      close,
      isOpen,
    ],
  )

  return (
    <AdvisorReactContext.Provider value={value}>
      {children}
    </AdvisorReactContext.Provider>
  )
}
