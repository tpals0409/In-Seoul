import { describe, expect, it } from 'vitest'
import { fmtKRW, fmtYearMonth } from '../format'

describe('fmtKRW', () => {
  it('비유한 입력은 — 반환', () => {
    expect(fmtKRW(NaN)).toBe('—')
    expect(fmtKRW(Infinity)).toBe('—')
    expect(fmtKRW(-Infinity)).toBe('—')
  })

  it('0 만원', () => {
    expect(fmtKRW(0)).toBe('0만')
  })

  it('1억 미만은 만 단위', () => {
    expect(fmtKRW(9500)).toBe('9,500만')
  })

  it('정확히 1억', () => {
    expect(fmtKRW(10000)).toBe('1억')
  })

  it('1억 + 만 단위', () => {
    expect(fmtKRW(18000)).toBe('1억 8,000만')
  })
})

describe('fmtYearMonth', () => {
  it('0개월', () => {
    expect(fmtYearMonth(0)).toBe('0개월')
  })

  it('정확히 1년', () => {
    expect(fmtYearMonth(12)).toBe('1년')
  })

  it('1년 2개월', () => {
    expect(fmtYearMonth(14)).toBe('1년 2개월')
  })
})
