import type { ScenarioAdjust, ScenarioKey } from '@/types/contracts'

export const SCENARIOS: Record<ScenarioKey, ScenarioAdjust> = {
  safe: {
    label: '안정',
    growth: +1.5,
    returnRate: -1.5,
    rate: +0.8,
    sub: '집값 상승과 금리 부담을 조금 더 신중하게 반영했어요.',
  },
  base: {
    label: '기준',
    growth: 0,
    returnRate: 0,
    rate: 0,
    sub: '입력한 값에 가장 가까운 가정으로 계산했어요.',
  },
  bold: {
    label: '적극',
    growth: -0.8,
    returnRate: +1.5,
    rate: -0.5,
    sub: '저축과 자산 성장에 조금 더 긍정적인 가정을 반영했어요.',
  },
}
