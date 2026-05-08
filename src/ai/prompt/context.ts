// Render an AdvisorContext into a compact Korean text block consumed by the
// prompt builder. Pure function — no IO, no fetch, no DOM.

import type { AdvisorContext } from '@/types/contracts'
import { SCENARIOS } from '@/data/scenarios'
import { fmtKRW, fmtYearMonth } from '@/lib/sim/format'

/**
 * 사용자 상황 요약 (한국어). 4-5줄 고정 형태로 모델이 토큰을 절약할 수 있게 한다.
 * marketReference 가 있으면 5번째 줄로 실거래 중앙값을 명시한다 — AI 가 추정 답변
 * 대신 실데이터를 인용하도록 유도.
 */
export function summarizeAdvisorContext(ctx: AdvisorContext): string {
  const { screen, persona, scenarioKey, data, sim, marketReference } = ctx
  const scenarioLabel = SCENARIOS[scenarioKey].label
  const growth = sim.sp.growth.toFixed(1)
  const ret = sim.sp.returnRate.toFixed(1)
  const rate = sim.sp.rate.toFixed(1)
  const goalLine =
    `목표: ${data.goalDistrict} ${data.goalArea}평 ${fmtKRW(data.goalPriceM)}`
  const reachText = sim.reachable
    ? `${fmtYearMonth(sim.months)} 후 진입`
    : '진입 어려움'
  const monthly = Math.round(sim.monthlyPayment).toLocaleString()
  const dsr = ((sim.monthlyPayment * 12) / (data.monthlyIncome * 12)) * 100
  const summaryLine =
    `요약: ${reachText}, 월상환 ${monthly}만, DSR ${dsr.toFixed(1)}%`

  const lines = [
    `화면: ${screen} | 페르소나: ${persona}`,
    `시나리오: ${scenarioLabel}, 집값+${growth}%, 자산+${ret}%, 금리${rate}%`,
    goalLine,
    summaryLine,
  ]

  if (marketReference) {
    const asOfShort = marketReference.asOf.slice(0, 10) // YYYY-MM-DD
    lines.push(
      `실거래 중앙값(${marketReference.district}, 60-85㎡, ${asOfShort} 기준): ` +
        `매매 ${fmtKRW(marketReference.medianPrice)}, 전세 ${fmtKRW(marketReference.medianJeonse)}`,
    )
  }

  return lines.join('\n')
}
