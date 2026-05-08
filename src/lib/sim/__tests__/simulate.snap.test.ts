import { describe, expect, it } from 'vitest'
import type { PersonaKey, ScenarioKey } from '@/types/contracts'
import { PERSONAS } from '@/data/personas'
import { simulate } from '../simulate'

const PERSONA_KEYS: readonly PersonaKey[] = ['early', 'mid', 'senior']
const SCENARIO_KEYS: readonly ScenarioKey[] = ['safe', 'base', 'bold']

interface SnapshotRow {
  months: number
  reachable: boolean
  crossDateISO: string
  futurePriceRounded: number
  monthlyPaymentRounded: number
  shortfallNowRounded: number
}

describe('simulate — 9 combo parity snapshot', () => {
  it('3 personas × 3 scenarios', () => {
    const result: Record<string, SnapshotRow> = {}
    for (const pk of PERSONA_KEYS) {
      for (const sk of SCENARIO_KEYS) {
        const data = PERSONAS[pk].defaults
        const r = simulate(data, sk)
        result[`${pk}/${sk}`] = {
          months: r.months,
          reachable: r.reachable,
          crossDateISO: r.crossDate.toISOString(),
          futurePriceRounded: Math.round(r.futurePrice),
          monthlyPaymentRounded: Math.round(r.monthlyPayment),
          shortfallNowRounded: Math.round(r.shortfallNow),
        }
      }
    }
    expect(result).toMatchInlineSnapshot(`
      {
        "early/base": {
          "crossDateISO": "2044-01-08T00:00:00.000Z",
          "futurePriceRounded": 101144,
          "monthlyPaymentRounded": 247,
          "months": 212,
          "reachable": true,
          "shortfallNowRounded": 28000,
        },
        "early/bold": {
          "crossDateISO": "2039-06-08T00:00:00.000Z",
          "futurePriceRounded": 79763,
          "monthlyPaymentRounded": 184,
          "months": 157,
          "reachable": true,
          "shortfallNowRounded": 28000,
        },
        "early/safe": {
          "crossDateISO": "2046-05-08T00:00:00.000Z",
          "futurePriceRounded": 144703,
          "monthlyPaymentRounded": 388,
          "months": 240,
          "reachable": false,
          "shortfallNowRounded": 28000,
        },
        "mid/base": {
          "crossDateISO": "2046-05-08T00:00:00.000Z",
          "futurePriceRounded": 180611,
          "monthlyPaymentRounded": 353,
          "months": 240,
          "reachable": false,
          "shortfallNowRounded": 55500,
        },
        "mid/bold": {
          "crossDateISO": "2044-03-08T00:00:00.000Z",
          "futurePriceRounded": 147415,
          "monthlyPaymentRounded": 271,
          "months": 214,
          "reachable": true,
          "shortfallNowRounded": 55500,
        },
        "mid/safe": {
          "crossDateISO": "2046-05-08T00:00:00.000Z",
          "futurePriceRounded": 241171,
          "monthlyPaymentRounded": 518,
          "months": 240,
          "reachable": false,
          "shortfallNowRounded": 55500,
        },
        "senior/base": {
          "crossDateISO": "2046-05-08T00:00:00.000Z",
          "futurePriceRounded": 358162,
          "monthlyPaymentRounded": 726,
          "months": 240,
          "reachable": false,
          "shortfallNowRounded": 92000,
        },
        "senior/bold": {
          "crossDateISO": "2041-05-08T00:00:00.000Z",
          "futurePriceRounded": 268429,
          "monthlyPaymentRounded": 513,
          "months": 180,
          "reachable": true,
          "shortfallNowRounded": 92000,
        },
        "senior/safe": {
          "crossDateISO": "2046-05-08T00:00:00.000Z",
          "futurePriceRounded": 477594,
          "monthlyPaymentRounded": 1061,
          "months": 240,
          "reachable": false,
          "shortfallNowRounded": 92000,
        },
      }
    `)
  })
})
