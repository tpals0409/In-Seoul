import type {
  ScenarioKey,
  SimResult,
  SimulationData,
} from '@/types/contracts'
import {
  LOAN_TERM_MONTHS,
  MAX_MONTHS,
  SIM_BASE_DATE_ISO,
  TX_COST_RATIO,
} from '@/types/contracts'
import { SCENARIOS } from '@/data/scenarios'
import { pmt } from './pmt'

/** 자산 합계 (만원). 결측 필드는 0 으로 처리. */
export function totalAssetsMan(p: SimulationData): number {
  return (p.assets.cash || 0) + (p.assets.invest || 0) + (p.assets.etc || 0)
}

/**
 * 시나리오 보정을 SimulationData 에 적용. growth/returnRate 는 0 이상,
 * rate 는 0.5% 이상으로 클램프.
 */
export function applyScenario(
  p: SimulationData,
  key: ScenarioKey,
): SimulationData {
  const s = SCENARIOS[key]
  return {
    ...p,
    growth: Math.max(0, p.growth + s.growth),
    returnRate: Math.max(0, p.returnRate + s.returnRate),
    rate: Math.max(0.5, p.rate + s.rate),
  }
}

function dateAfterMonths(m: number): Date {
  const d = new Date(SIM_BASE_DATE_ISO)
  d.setMonth(d.getMonth() + m)
  return d
}

/**
 * 월 단위 시뮬레이션. 0..MAX_MONTHS (=240) 총 241개 시계열 포인트 생성.
 * 자산이 (집값 - LTV대출 + 거래비용) 을 처음 도달하는 달을 crossMonth 로 기록.
 */
export function simulate(
  data: SimulationData,
  scenario: ScenarioKey,
): SimResult {
  const sp = applyScenario(data, scenario)
  const monthlyReturn = Math.pow(1 + sp.returnRate / 100, 1 / 12) - 1
  const monthlyGrowth = Math.pow(1 + sp.growth / 100, 1 / 12) - 1

  let assets = totalAssetsMan(data)
  let goalPrice = data.goalPriceM
  const seriesAssets: number[] = [assets]
  const seriesGoal: number[] = [goalPrice]
  const seriesAvail: number[] = [
    assets + (goalPrice * sp.ltv) / 100 - goalPrice * TX_COST_RATIO,
  ]

  let crossMonth: number | null = null
  for (let m = 1; m <= MAX_MONTHS; m++) {
    assets = assets * (1 + monthlyReturn) + data.monthlySaving
    goalPrice = goalPrice * (1 + monthlyGrowth)
    const ltvLoanCur = (goalPrice * sp.ltv) / 100
    const txCost = goalPrice * TX_COST_RATIO
    const buyable = assets + ltvLoanCur - txCost
    seriesAssets.push(assets)
    seriesGoal.push(goalPrice)
    seriesAvail.push(buyable)
    if (crossMonth === null && buyable >= goalPrice) crossMonth = m
  }

  const reachable = crossMonth !== null
  const months = crossMonth ?? MAX_MONTHS

  // 현재 시점 부족액
  const currentBuyable =
    totalAssetsMan(data) +
    (data.goalPriceM * sp.ltv) / 100 -
    data.goalPriceM * TX_COST_RATIO
  const shortfallNow = Math.max(0, data.goalPriceM - currentBuyable)

  const futurePrice = seriesGoal[months] ?? data.goalPriceM
  const futureLoan = (futurePrice * sp.ltv) / 100
  const monthlyPayment = pmt(sp.rate / 100 / 12, LOAN_TERM_MONTHS, futureLoan)

  return {
    sp,
    months,
    reachable,
    crossDate: dateAfterMonths(months),
    seriesAssets,
    seriesGoal,
    seriesAvail,
    shortfallNow,
    futurePrice,
    futureLoan,
    monthlyPayment,
  }
}
