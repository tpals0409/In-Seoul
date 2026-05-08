import { describe, expect, it } from 'vitest'
import { PERSONAS } from '@/data/personas'
import { actionEffects, riskEffects } from '../effects'

describe('actionEffects', () => {
  it('mid 페르소나에서 4개 변형 모두 반환', () => {
    const effects = actionEffects(PERSONAS.mid.defaults)
    expect(effects).toHaveLength(4)
    const ids = new Set(effects.map((e) => e.id))
    expect(ids).toEqual(new Set(['save', 'ret', 'price', 'ltv']))
  })

  it('savedMonths 내림차순 정렬', () => {
    const effects = actionEffects(PERSONAS.mid.defaults)
    for (let i = 1; i < effects.length; i++) {
      const prev = effects[i - 1]
      const cur = effects[i]
      if (prev && cur) {
        expect(prev.savedMonths).toBeGreaterThanOrEqual(cur.savedMonths)
      }
    }
  })

  it('savedMonths 는 항상 0 이상', () => {
    const effects = actionEffects(PERSONAS.mid.defaults)
    for (const e of effects) {
      expect(e.savedMonths).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('riskEffects', () => {
  it('금리 +1%p 시 dsrHi >= dsrBase', () => {
    const r = riskEffects(PERSONAS.mid.defaults)
    expect(r.dsrHi).toBeGreaterThanOrEqual(r.dsrBase)
    expect(r.monthlyPayHi).toBeGreaterThanOrEqual(r.monthlyPayBase)
    expect(r.monthlyPayDelta).toBeCloseTo(
      r.monthlyPayHi - r.monthlyPayBase,
      6,
    )
  })
})
