import { describe, expect, it } from 'vitest'
import { pmt } from '../pmt'

describe('pmt', () => {
  it('이자율 0 일 때 원금 / 개월수', () => {
    expect(pmt(0, 360, 100000)).toBe(100000 / 360)
  })

  it('n <= 0 가드', () => {
    expect(pmt(0, 0, 100)).toBe(0)
    expect(pmt(0.01, -1, 100)).toBe(0)
  })

  it('Excel PMT 호환 (연 4%, 30년, 100,000 원금)', () => {
    // Excel: =PMT(0.04/12, 360, 100000) → -477.4153...
    const result = pmt(0.04 / 12, 360, 100000)
    expect(result).toBeCloseTo(477.4154, 3)
    expect(Math.abs(result - 477.4154)).toBeLessThanOrEqual(0.001)
  })
})
