import { useEffect, useRef } from 'react'
import type { SimResult } from '@/types/contracts'

interface Props {
  result: SimResult
  height?: number
  accent?: boolean
  showLabels?: boolean
  padded?: boolean
}

export function GoldenSpark({
  result,
  height = 130,
  accent = true,
  showLabels = true,
  padded = true,
}: Props) {
  const N = Math.min(result.seriesGoal.length, Math.max(24, result.months + 12))
  const goal = result.seriesGoal.slice(0, N)
  const avail = result.seriesAvail.slice(0, N)
  const all = [...goal, ...avail]
  const maxY = Math.max(...all) * 1.05
  const minY = Math.min(...all) * 0.92

  const W = 320
  const H = height
  const padL = padded ? 12 : 0
  const padR = padded ? 12 : 0
  const padT = 14
  const padB = 18
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const xAt = (i: number) => padL + (i / (N - 1)) * innerW
  const yAt = (v: number) => padT + (1 - (v - minY) / (maxY - minY)) * innerH

  const path = (arr: number[]) =>
    arr
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`)
      .join(' ')

  // Cross point — handle noUncheckedIndexedAccess by extracting safely
  let cx: number | null = null
  let cy: number | null = null
  if (result.reachable) {
    const goalAtCross = goal[result.months]
    if (goalAtCross !== undefined) {
      cx = xAt(result.months)
      cy = yAt(goalAtCross)
    }
  }

  const goalD = path(goal)
  const availD = path(avail)
  const fillD = `${availD} L ${xAt(N - 1)} ${H - padB} L ${xAt(0)} ${H - padB} Z`

  const goalRef = useRef<SVGPathElement | null>(null)
  const availRef = useRef<SVGPathElement | null>(null)
  const fillRef = useRef<SVGPathElement | null>(null)
  const prev = useRef({ goal: goalD, avail: availD, fill: fillD })

  useEffect(() => {
    const fromGoal = prev.current.goal
    const fromAvail = prev.current.avail
    const fromFill = prev.current.fill
    const toGoal = goalD
    const toAvail = availD
    const toFill = fillD
    if (fromGoal === toGoal && fromAvail === toAvail) return

    const dur = 460
    const start = performance.now()
    const ease = (t: number) => 1 - Math.pow(1 - t, 3)

    const interp = (a: string, b: string, t: number): string => {
      const ta = a.match(/-?\d+\.?\d*|[ML]/g) ?? []
      const tb = b.match(/-?\d+\.?\d*|[ML]/g) ?? []
      if (ta.length !== tb.length) return b
      let out = ''
      for (let i = 0; i < ta.length; i++) {
        const aTok = ta[i]
        const bTok = tb[i]
        if (aTok === undefined || bTok === undefined) continue
        if (aTok === 'M' || aTok === 'L' || aTok === 'Z') {
          out += ' ' + aTok
        } else {
          const av = parseFloat(aTok)
          const bv = parseFloat(bTok)
          out += ' ' + (av + (bv - av) * t).toFixed(2)
        }
      }
      return out.trim()
    }

    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      const e = ease(t)
      goalRef.current?.setAttribute('d', interp(fromGoal, toGoal, e))
      availRef.current?.setAttribute('d', interp(fromAvail, toAvail, e))
      fillRef.current?.setAttribute('d', interp(fromFill, toFill, e))
      if (t < 1) raf = requestAnimationFrame(tick)
      else prev.current = { goal: toGoal, avail: toAvail, fill: toFill }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [goalD, availD, fillD])

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id="availFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#3182F6" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#3182F6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path ref={fillRef} d={fillD} fill="url(#availFill)" />
      <path
        ref={goalRef}
        d={goalD}
        stroke="#A2D2FF"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />
      <path
        ref={availRef}
        d={availD}
        stroke="#3182F6"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
      />
      {accent && cx !== null && cy !== null && (
        <g
          className="cross-dot"
          key={`x${cx.toFixed(0)}-${cy.toFixed(0)}`}
          style={{ animation: 'crossPop 0.46s cubic-bezier(.34,1.56,.64,1)' }}
        >
          <line
            x1={cx}
            x2={cx}
            y1={padT}
            y2={H - padB}
            stroke="#FFD166"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.6"
          />
          <circle cx={cx} cy={cy} r="9" fill="#FFD166" stroke="#fff" strokeWidth="2.5" />
          <circle cx={cx} cy={cy} r="3.5" fill="#fff" />
        </g>
      )}
      {showLabels && (
        <g
          style={{
            fontSize: 10,
            fontFamily: 'Pretendard Variable, sans-serif',
            fontWeight: 600,
          }}
        >
          <text x={padL} y={H - 3} fill="#8A98AD">
            지금
          </text>
          <text x={W - padR} y={H - 3} fill="#8A98AD" textAnchor="end">
            {Math.round(N / 12)}년 후
          </text>
          {accent && cx !== null && (
            <text x={cx} y={padT - 2} fill="#5A3F00" textAnchor="middle" fontWeight="700">
              예상 진입 시점
            </text>
          )}
        </g>
      )}
    </svg>
  )
}
