import { describe, expect, it } from 'vitest'
import { summarizeAdvisorContext } from '../context'
import type { AdvisorContext, SimResult } from '@/types/contracts'
import { PERSONAS } from '@/data/personas'
import { simulate } from '@/lib/sim'

function makeCtx(over: Partial<AdvisorContext> = {}): AdvisorContext {
  const data = PERSONAS.mid.defaults
  const sim: SimResult = simulate(data, 'base')
  return {
    screen: 'result',
    persona: 'mid',
    scenarioKey: 'base',
    data,
    sim,
    recentChat: [],
    ...over,
  }
}

describe('summarizeAdvisorContext', () => {
  it('marketReference 없음 → 4줄 출력', () => {
    const out = summarizeAdvisorContext(makeCtx())
    expect(out.split('\n')).toHaveLength(4)
    expect(out).toContain('화면: result')
    expect(out).toContain('페르소나: mid')
    expect(out).toContain('목표:')
    expect(out).toContain('요약:')
    expect(out).not.toContain('실거래')
  })

  it('marketReference 있음 → 5줄 + 실거래 인용', () => {
    const out = summarizeAdvisorContext(
      makeCtx({
        marketReference: {
          district: '마포구',
          medianPrice: 131500,
          medianJeonse: 73000,
          asOf: '2026-05-08T07:41:46.840Z',
        },
      }),
    )
    expect(out.split('\n')).toHaveLength(5)
    expect(out).toContain('실거래 중앙값(마포구, 60-85㎡, 2026-05-08 기준)')
    expect(out).toContain('매매')
    expect(out).toContain('전세')
  })

  it('reachable=false → 진입 어려움 표시', () => {
    const data = PERSONAS.early.defaults
    const sim = simulate(data, 'safe')
    const out = summarizeAdvisorContext(
      makeCtx({ data, sim, persona: 'early', scenarioKey: 'safe' }),
    )
    if (sim.reachable) {
      expect(out).toContain('후 진입')
    } else {
      expect(out).toContain('진입 어려움')
    }
  })

  it('DSR 계산 — 월소득 720만, 월상환 X → DSR (X*12)/(720*12)*100', () => {
    const ctx = makeCtx()
    const out = summarizeAdvisorContext(ctx)
    // mid persona, monthlyIncome=720
    const expectedDsr = ((ctx.sim.monthlyPayment * 12) / (ctx.data.monthlyIncome * 12)) * 100
    expect(out).toContain(`DSR ${expectedDsr.toFixed(1)}%`)
  })
})
