// Template-based answers — used when WebGPU is unavailable, the model has not
// downloaded, or generation fails. Ported verbatim from
// InSeoul_UI/screens/ai-sheet.jsx::answerFor.
//
// No fetch, no IO. Pure deterministic string composition.

import type { AdvisorContext } from '@/types/contracts'
import { SCENARIOS } from '@/data/scenarios'
import { actionEffects, riskEffects } from '@/lib/sim/effects'
import { fmtKRWLong, fmtYearMonth } from '@/lib/sim/format'

function dsrSeverity(dsrBase: number): string {
  if (dsrBase < 35) return '아직 안정 범위'
  if (dsrBase < 45) return '주의가 필요한 수준'
  return '부담이 큰 수준'
}

export function templateAnswerFor(
  question: string,
  ctx: AdvisorContext,
): string {
  const { data, scenarioKey, sim } = ctx
  const scenarioLabel = SCENARIOS[scenarioKey].label
  const acts = actionEffects(data)
  const risk = riskEffects(data)
  const lower = question.toLowerCase()

  if (question.includes('LTV') || lower.includes('ltv')) {
    const maxLoan = (data.goalPriceM * data.ltv) / 100
    return (
      `LTV는 집값 대비 대출 비율이에요.\n\n` +
      `현재 목표 주택은 ${fmtKRWLong(data.goalPriceM)}이고 LTV ${data.ltv}%를 적용했어요. ` +
      `단순 계산상 최대 ${fmtKRWLong(maxLoan)}까지 대출로 잡아 계산해요.\n\n` +
      `실제 한도는 DSR과 금융기관 심사에 따라 달라질 수 있어요.`
    )
  }

  if (question.includes('왜')) {
    return (
      `${scenarioLabel} 시나리오에서는\n` +
      `• 집값이 연 ${sim.sp.growth.toFixed(1)}% 오르고\n` +
      `• 자산은 연 ${sim.sp.returnRate.toFixed(1)}%로 자라며\n` +
      `• 월 ${data.monthlySaving}만 원을 추가로 모아요\n\n` +
      `이 속도라면 약 ${fmtYearMonth(sim.months)} 뒤에 가용 자산이 미래 집값을 따라잡아요.`
    )
  }

  if (question.includes('저축') || question.includes('효과적')) {
    const top = acts[0]
    if (top) {
      return (
        `현재 조건에서 가장 영향이 큰 변수는 "${top.label}"이에요.\n\n` +
        `${top.sub} 약 ${fmtYearMonth(top.savedMonths)} 빨라져요.\n\n` +
        `저축액 외에는 투자 수익률, 목표 가격 조정 순으로 영향이 커요.`
      )
    }
  }

  if (question.includes('금리') || question.includes('부담')) {
    const delta = Math.round(risk.monthlyPayDelta).toLocaleString()
    return (
      `금리가 1%p 오르면 월 상환액이 약 ${delta}만 원 더 늘어요.\n` +
      `DSR도 ${risk.dsrBase.toFixed(0)}%에서 ${risk.dsrHi.toFixed(0)}%로 올라가요.\n\n` +
      `현재 소득 수준에서는 ${dsrSeverity(risk.dsrBase)}이에요.`
    )
  }

  if (question.includes('계산식') || question.includes('어떻게')) {
    return (
      `계산은 두 줄을 비교하는 거예요.\n\n` +
      `• 내 가용 자산 = 자기자본 × (1+수익률) + 누적 저축 + LTV 대출 - 거래비용\n` +
      `• 목표 집값 = 현재가 × (1+상승률)^기간\n\n` +
      `이 두 값이 처음 만나는 시점을 "예상 진입 시점"으로 보여드려요.`
    )
  }

  if (question.includes('리스크') || question.includes('위험')) {
    const delta = Math.round(risk.monthlyPayDelta).toLocaleString()
    return (
      `이 조건에서 가장 큰 리스크는 금리 변동이에요.\n\n` +
      `금리가 1%p 오를 때 월 상환액이 약 ${delta}만 원 늘어요. ` +
      `DSR도 ${risk.dsrBase.toFixed(0)}% → ${risk.dsrHi.toFixed(0)}%로 올라요.\n\n` +
      `구매 후 6~12개월 생활비를 비상금으로 두는 걸 추천해요.`
    )
  }

  return (
    `현재 시뮬레이션은 ${scenarioLabel} 시나리오 기준 약 ${fmtYearMonth(sim.months)} 후 진입을 예상해요.\n\n` +
    `조금 더 구체적으로 알려주시면 상황에 맞춰 설명해드릴게요.`
  )
}
