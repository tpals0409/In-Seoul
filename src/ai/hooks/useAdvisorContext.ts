// Hook accessor for the AdvisorContext. Split out from AdvisorContext.tsx so
// that the .tsx file exports only React components (react-refresh rule).

import { useContext } from 'react'
import {
  AdvisorReactContext,
  type AdvisorContextValue,
} from '../advisorContextValue'

export function useAdvisorContext(): AdvisorContextValue {
  const ctx = useContext(AdvisorReactContext)
  if (!ctx) {
    throw new Error('useAdvisorContext must be used inside <AdvisorProvider>')
  }
  return ctx
}
