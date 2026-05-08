import type {
  ActionEffect,
  ActionEffectId,
  RiskEffect,
  SimulationData,
} from '@/types/contracts'
import { LOAN_TERM_MONTHS } from '@/types/contracts'
import { simulate } from './simulate'
import { pmt } from './pmt'

interface ActionVariantSeed {
  id: ActionEffectId
  label: string
  sub: string
  delta: Partial<SimulationData>
}

/**
 * 4 가지 행동 변경(저축/수익률/목표가/LTV)이 목표 도달 개월수를
 * 얼마나 단축시키는지 계산. savedMonths 내림차순 정렬.
 */
export function actionEffects(p: SimulationData): ActionEffect[] {
  const base = simulate(p, 'base').months
  const variants: ActionVariantSeed[] = [
    {
      id: 'save',
      label: '월 저축액',
      sub: '월 30만 원을 더 모으면',
      delta: { monthlySaving: p.monthlySaving + 30 },
    },
    {
      id: 'ret',
      label: '투자 수익률',
      sub: '연 1%p 더 올리면',
      delta: { returnRate: p.returnRate + 1 },
    },
    {
      id: 'price',
      label: '목표 가격',
      sub: '10% 낮추면',
      delta: { goalPriceM: Math.round(p.goalPriceM * 0.9) },
    },
    {
      id: 'ltv',
      label: 'LTV',
      sub: '50%로 늘리면',
      delta: { ltv: 50 },
    },
  ]
  return variants
    .map((v) => {
      const months = simulate({ ...p, ...v.delta }, 'base').months
      return {
        id: v.id,
        label: v.label,
        sub: v.sub,
        delta: v.delta,
        months,
        savedMonths: Math.max(0, base - months),
      }
    })
    .sort((a, b) => b.savedMonths - a.savedMonths)
}

/**
 * 금리 +1%p 시 월 납입액 / DSR 변화. base 시나리오 기준.
 */
export function riskEffects(p: SimulationData): RiskEffect {
  const base = simulate(p, 'base')
  const monthlyPayBase = base.monthlyPayment
  const monthlyPayHi = pmt(
    (p.rate + 1) / 100 / 12,
    LOAN_TERM_MONTHS,
    base.futureLoan,
  )
  const dsrBase = ((monthlyPayBase * 12) / (p.monthlyIncome * 12)) * 100
  const dsrHi = ((monthlyPayHi * 12) / (p.monthlyIncome * 12)) * 100
  return {
    monthlyPayBase,
    monthlyPayHi,
    monthlyPayDelta: monthlyPayHi - monthlyPayBase,
    dsrBase,
    dsrHi,
  }
}
