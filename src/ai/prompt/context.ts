// Render an AdvisorContext into a compact Korean text block consumed by the
// prompt builder. Pure function — no IO, no fetch, no DOM.
//
// Privacy policy (sprint-1 task-4): 사용자 재무 절대값(자산/소득/저축/목표가/
// 월상환액)은 *원시 만원값* 그대로 프롬프트에 박지 않는다. 1억(=10,000만)
// 단위 또는 50만 단위 라벨 양자화로 변환해 prompt 로깅/스크린샷 시 노출 위험을
// 낮춘다. delta/비율 등 *상대값*은 sanitize 대상이 아니다.

import type { AdvisorContext } from '@/types/contracts'
import { SCENARIOS } from '@/data/scenarios'
import { fmtKRW, fmtYearMonth } from '@/lib/sim/format'

/**
 * 만원 단위 절대 금액을 라벨 범주로 양자화한다.
 *  - <1,000만   → "1천만 미만"
 *  - <1억(10,000만) → "N천만대"
 *  - 그 이상     → "N억대"
 * 비유한 / 음수는 "—". 의도: LLM 프롬프트 및 폴백 답변에서 사용자 재무 절대값을
 * 라벨로만 노출.
 */
export function quantizeAmountM(man: number): string {
  if (!Number.isFinite(man) || man < 0) return '—'
  if (man < 1000) return '1천만 미만'
  if (man < 10000) {
    const k = Math.floor(man / 1000)
    return `${k}천만대`
  }
  const eok = Math.floor(man / 10000)
  return `${eok}억대`
}

/**
 * 월 단위 금액(소득/저축/상환 등)을 50만 단위 라벨로 양자화한다.
 * 0 → "월 50만 미만". 양자화 폭이 너무 크면 정보가 없고 너무 작으면 노출 위험이
 * 늘어 50만이 균형점 — early 페르소나 월저축 150만, mid 200만 등이 의미 있는
 * 라벨 차이를 갖는다.
 */
export function quantizeMonthlyAmountM(man: number): string {
  if (!Number.isFinite(man) || man < 0) return '—'
  if (man < 50) return '월 50만 미만'
  const bucket = Math.floor(man / 50) * 50
  return `월 ${bucket}만대`
}

/**
 * 사용자 상황 요약 (한국어). 4-5줄 고정 형태로 모델이 토큰을 절약할 수 있게 한다.
 * 사용자 재무 절대값은 quantizeAmountM/quantizeMonthlyAmountM 으로 라벨화한다.
 * marketReference (공공 실거래가) 는 사용자 데이터가 아니므로 fmtKRW 그대로 둔다.
 */
export function summarizeAdvisorContext(ctx: AdvisorContext): string {
  const { screen, persona, scenarioKey, data, sim, marketReference } = ctx
  const scenarioLabel = SCENARIOS[scenarioKey].label
  const growth = sim.sp.growth.toFixed(1)
  const ret = sim.sp.returnRate.toFixed(1)
  const rate = sim.sp.rate.toFixed(1)
  const goalLine =
    `목표: ${data.goalDistrict} ${data.goalArea}평 ${quantizeAmountM(data.goalPriceM)}`
  const reachText = sim.reachable
    ? `${fmtYearMonth(sim.months)} 후 진입`
    : '진입 어려움'
  const monthlyLabel = quantizeMonthlyAmountM(sim.monthlyPayment)
  const dsr = ((sim.monthlyPayment * 12) / (data.monthlyIncome * 12)) * 100
  const summaryLine =
    `요약: ${reachText}, 월상환 ${monthlyLabel}, DSR ${dsr.toFixed(1)}%`

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
