import { describe, expect, it } from 'vitest'
import { buildPrompt, MAX_PROMPT_CHARS, type PromptChunk } from '../build'
import {
  quantizeAmountM,
  quantizeMonthlyAmountM,
} from '../context'
import { templateAnswerFor } from '@/ai/fallback/templates'
import type { AdvisorContext, ChatMsg, SimResult } from '@/types/contracts'
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

function makeChunk(id: string, content: string): PromptChunk {
  return { id, heading: 'h', content }
}

function makeChat(role: ChatMsg['role'], content: string, idx: number): ChatMsg {
  return { id: `m${idx}`, role, content }
}

describe('quantize helpers', () => {
  it('1억 단위 양자화: <1천만 / N천만대 / N억대', () => {
    expect(quantizeAmountM(0)).toBe('1천만 미만')
    expect(quantizeAmountM(999)).toBe('1천만 미만')
    expect(quantizeAmountM(3500)).toBe('3천만대')
    expect(quantizeAmountM(9999)).toBe('9천만대')
    expect(quantizeAmountM(10000)).toBe('1억대')
    expect(quantizeAmountM(60000)).toBe('6억대')
    expect(quantizeAmountM(100000)).toBe('10억대')
    expect(quantizeAmountM(180000)).toBe('18억대')
  })

  it('월 50만 단위 양자화', () => {
    expect(quantizeMonthlyAmountM(0)).toBe('월 50만 미만')
    expect(quantizeMonthlyAmountM(49)).toBe('월 50만 미만')
    expect(quantizeMonthlyAmountM(50)).toBe('월 50만대')
    expect(quantizeMonthlyAmountM(199)).toBe('월 150만대')
    expect(quantizeMonthlyAmountM(200)).toBe('월 200만대')
  })

  it('비유한/음수 → "—"', () => {
    expect(quantizeAmountM(NaN)).toBe('—')
    expect(quantizeAmountM(-1)).toBe('—')
    expect(quantizeMonthlyAmountM(NaN)).toBe('—')
    expect(quantizeMonthlyAmountM(-1)).toBe('—')
  })
})

describe('buildPrompt — sanitize 정책', () => {
  it('(a) 사용자 재무 절대값(목표가)이 raw 정수 대신 라벨로 들어간다', () => {
    // mid persona: goalPriceM=100000(=10억), monthlyIncome=720, monthlySaving=200
    const out = buildPrompt({
      question: '얼마면 살 수 있을까?',
      ctx: makeCtx(),
      chunks: [],
    })
    // raw 정수가 그대로 박히면 안 됨 — 100000 / 720 / 200 모두
    expect(out).not.toMatch(/100000/)
    expect(out).not.toMatch(/720[^0-9]/) // 720 이 다른 숫자 일부가 아닌 단독 숫자로 나오면 fail
    // 라벨이 들어가야 함
    expect(out).toContain('10억대')
  })

  it('(b) 자산/소득/저축 raw 만원값이 프롬프트 본문에 노출되지 않는다', () => {
    // senior: assets cash=15000, monthlyIncome=1100, monthlySaving=400, goalPriceM=180000
    const data = PERSONAS.senior.defaults
    const sim = simulate(data, 'base')
    const out = buildPrompt({
      question: 'Q',
      ctx: makeCtx({ data, sim, persona: 'senior' }),
      chunks: [],
    })
    // raw 절대값 정수 검출 — 자산/저축은 summarize 에 포함 안 되지만 회귀 가드
    expect(out).not.toContain('15000만')
    expect(out).not.toContain('1100만')
    expect(out).not.toContain('180000')
    expect(out).toContain('18억대')
  })
})

describe('buildPrompt — 8,000자 cap', () => {
  it('(c) 거대 chunks 에도 결과 길이는 MAX_PROMPT_CHARS 이내', () => {
    const giant = 'X'.repeat(20_000)
    const chunks = [
      makeChunk('a', giant),
      makeChunk('b', giant),
      makeChunk('c', giant),
    ]
    const out = buildPrompt({
      question: '질문',
      ctx: makeCtx(),
      chunks,
    })
    expect(out.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS)
  })

  it('(d) chunks 우선 보존, recentChat 후순위 절단', () => {
    // chunks 가 optional 예산을 거의 다 먹어 recentChat 이 들어갈 자리가 없게.
    const fillerChunk = 'C'.repeat(6_000)
    const chunks = [makeChunk('chunk-keep', fillerChunk)]
    const longChat: ChatMsg[] = [
      makeChat('user', 'A'.repeat(2_000), 1),
      makeChat('ai', 'B'.repeat(2_000), 2),
      makeChat('user', 'tail-msg', 3),
    ]
    const out = buildPrompt({
      question: 'Q',
      ctx: makeCtx({ recentChat: longChat }),
      chunks,
    })
    // chunk 본문이 보존됐는지(헤더로 검증)
    expect(out).toContain('[출처: chunk-keep]')
    // recentChat 의 거대한 앞쪽 메시지는 잘려나갔어야 함
    expect(out).not.toContain('A'.repeat(2_000))
    expect(out).not.toContain('B'.repeat(2_000))
    // 가장 최근 짧은 메시지는 살아있을 수도 / 없을 수도 있지만, chunks 가 우선이므로
    // 절대 chunk 본문이 잘리고 chat 이 살아있으면 안 됨.
    expect(out.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS)
  })

  it('(e) recentChat 만 거대해도 cap 준수, 가장 최근 메시지 우선 보존', () => {
    // 각 메시지를 cap(8,000) 보다 충분히 크게 만들어 한 번에 다 들어가지 못하게.
    const longChat: ChatMsg[] = [
      makeChat('user', 'OLDEST'.repeat(2_000), 1),
      makeChat('ai', 'MIDDLE'.repeat(2_000), 2),
      makeChat('user', 'NEWEST', 3),
    ]
    const out = buildPrompt({
      question: 'Q',
      ctx: makeCtx({ recentChat: longChat }),
      chunks: [],
    })
    expect(out.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS)
    expect(out).toContain('NEWEST')
    // 오래된 거대 메시지는 통째로는 들어가지 못함
    expect(out).not.toContain('OLDEST'.repeat(2_000))
    expect(out).not.toContain('MIDDLE'.repeat(2_000))
  })
})

describe('fallback templates — 동일 sanitize 정책', () => {
  it('(f) LTV 답변에 raw 목표가/대출한도 정수가 안 들어가고 라벨이 들어간다', () => {
    // mid: goalPriceM=100000, ltv=40 → maxLoan=40000
    const out = templateAnswerFor('LTV가 뭐예요?', makeCtx())
    expect(out).not.toMatch(/100000/)
    expect(out).not.toMatch(/40000/)
    expect(out).toContain('10억대')
    expect(out).toContain('4억대') // maxLoan = 40000
  })

  it('(g) "왜" 답변의 월 저축액이 50만 단위 라벨', () => {
    // mid: monthlySaving=200
    const out = templateAnswerFor('왜 그런가요?', makeCtx())
    // "월 200만 원" 같은 raw 표기 금지, 라벨이 들어가야 함
    expect(out).toContain('월 200만대')
    expect(out).not.toMatch(/월 200만 원/)
  })
})
