import { describe, expect, it } from 'vitest'
import {
  calcMedianPrice,
  parseAptRentXml,
  parseAptTradeXml,
} from '../molit'
import { lawdCodeFor, SEOUL_LAWD_CODES } from '@/data/lawd'

const TRADE_XML_OK = `
<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header>
    <resultCode>000</resultCode>
    <resultMsg>OK</resultMsg>
  </header>
  <body>
    <items>
      <item>
        <aptNm>래미안</aptNm>
        <umdNm>역삼동</umdNm>
        <floor>10</floor>
        <excluUseAr>84.93</excluUseAr>
        <buildYear>2010</buildYear>
        <dealYear>2025</dealYear>
        <dealMonth>2</dealMonth>
        <dealDay>5</dealDay>
        <dealAmount>389,000</dealAmount>
        <sggCd>11680</sggCd>
      </item>
      <item>
        <aptNm>타워팰리스</aptNm>
        <umdNm>도곡동</umdNm>
        <floor>32</floor>
        <excluUseAr>59.97</excluUseAr>
        <buildYear>2002</buildYear>
        <dealYear>2025</dealYear>
        <dealMonth>2</dealMonth>
        <dealDay>20</dealDay>
        <dealAmount>1,250,000</dealAmount>
        <sggCd>11680</sggCd>
      </item>
    </items>
  </body>
</response>
`

const TRADE_XML_ERR = `
<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header>
    <resultCode>030</resultCode>
    <resultMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</resultMsg>
  </header>
</response>
`

const RENT_XML_MIXED = `
<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header>
    <resultCode>000</resultCode>
    <resultMsg>OK</resultMsg>
  </header>
  <body>
    <items>
      <item>
        <aptNm>마포래미안</aptNm>
        <umdNm>아현동</umdNm>
        <floor>15</floor>
        <excluUseAr>84.91</excluUseAr>
        <buildYear>2014</buildYear>
        <dealYear>2025</dealYear>
        <dealMonth>3</dealMonth>
        <dealDay>1</dealDay>
        <deposit>80,000</deposit>
        <monthlyRent>0</monthlyRent>
        <sggCd>11440</sggCd>
      </item>
      <item>
        <aptNm>마포래미안</aptNm>
        <umdNm>아현동</umdNm>
        <floor>3</floor>
        <excluUseAr>59.95</excluUseAr>
        <buildYear>2014</buildYear>
        <dealYear>2025</dealYear>
        <dealMonth>3</dealMonth>
        <dealDay>10</dealDay>
        <deposit>20,000</deposit>
        <monthlyRent>120</monthlyRent>
        <sggCd>11440</sggCd>
      </item>
    </items>
  </body>
</response>
`

describe('molit XML parsing', () => {
  it('parseAptTradeXml: 정상 응답 → AptTrade 배열', () => {
    const trades = parseAptTradeXml(TRADE_XML_OK)
    expect(trades).toHaveLength(2)
    expect(trades[0]?.aptName).toBe('래미안')
    expect(trades[0]?.dealAmount).toBe(389_000)
    expect(trades[0]?.area).toBeCloseTo(84.93, 2)
    expect(trades[1]?.dealAmount).toBe(1_250_000)
    expect(trades[1]?.sggCd).toBe('11680')
  })

  it('parseAptTradeXml: resultCode 030 → throw', () => {
    expect(() => parseAptTradeXml(TRADE_XML_ERR)).toThrow(/030/)
  })

  it('parseAptRentXml: 전세 + 월세 혼합 파싱', () => {
    const rents = parseAptRentXml(RENT_XML_MIXED)
    expect(rents).toHaveLength(2)
    expect(rents[0]?.deposit).toBe(80_000)
    expect(rents[0]?.monthlyRent).toBe(0)
    expect(rents[1]?.deposit).toBe(20_000)
    expect(rents[1]?.monthlyRent).toBe(120)
  })

  it('parseAptTradeXml: 빈 items → 빈 배열', () => {
    const xml = '<response><header><resultCode>000</resultCode></header><body><items/></body></response>'
    expect(parseAptTradeXml(xml)).toEqual([])
  })
})

describe('calcMedianPrice', () => {
  it('60-85㎡ 필터: 범위 밖 거래는 제외', () => {
    const trades = [
      { area: 50, dealAmount: 100_000 }, // 제외
      { area: 70, dealAmount: 200_000 },
      { area: 85, dealAmount: 300_000 },
      { area: 100, dealAmount: 500_000 }, // 제외
    ]
    expect(calcMedianPrice(trades)).toBe(250_000) // (200+300)/2
  })

  it('빈 배열 → 0', () => {
    expect(calcMedianPrice([])).toBe(0)
  })

  it('홀수 개수 → 실제 중앙값', () => {
    const trades = [
      { area: 60, dealAmount: 100_000 },
      { area: 70, dealAmount: 200_000 },
      { area: 80, dealAmount: 300_000 },
    ]
    expect(calcMedianPrice(trades)).toBe(200_000)
  })

  it('dealAmount===0 항목은 제외', () => {
    const trades = [
      { area: 70, dealAmount: 0 },
      { area: 70, dealAmount: 100_000 },
    ]
    expect(calcMedianPrice(trades)).toBe(100_000)
  })

  it('커스텀 면적 범위', () => {
    const trades = [
      { area: 50, dealAmount: 100_000 },
      { area: 60, dealAmount: 200_000 },
    ]
    expect(calcMedianPrice(trades, 40, 55)).toBe(100_000)
  })
})

describe('LAWD codes', () => {
  it('25개 자치구 모두 매핑', () => {
    expect(Object.keys(SEOUL_LAWD_CODES)).toHaveLength(25)
  })

  it('강남구 = 11680', () => {
    expect(lawdCodeFor('강남구')).toBe('11680')
  })

  it('미존재 자치구 → null', () => {
    expect(lawdCodeFor('존재하지않는구')).toBeNull()
  })

  it('모든 코드는 5자리, 11 prefix (서울)', () => {
    for (const code of Object.values(SEOUL_LAWD_CODES)) {
      expect(code).toHaveLength(5)
      expect(code.startsWith('11')).toBe(true)
    }
  })
})
