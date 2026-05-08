import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react'
import type {
  ActionEffect,
  ActionEffectId,
  SimulationData,
} from '@/types/contracts'
import { Icons } from '@/components/Icons'
import { actionEffects, fmtKRW, fmtYearMonth, simulate } from '@/lib/sim'
import { useAppStore } from '@/store/appStore'
import { DetailHeader } from './DetailHeader'

interface SliderCfg {
  key: keyof SimulationData
  min: number
  max: number
  step: number
  current: number
  format: (v: number) => string
  label: string
}

function buildCfg(id: ActionEffectId, data: SimulationData): SliderCfg {
  if (id === 'save') {
    const cur = data.monthlySaving
    return {
      key: 'monthlySaving',
      min: 50,
      max: Math.max(500, cur + 250),
      step: 10,
      current: cur,
      format: (v) => `${v}만 원`,
      label: '월 저축액',
    }
  }
  if (id === 'ret') {
    return {
      key: 'returnRate',
      min: 0,
      max: 10,
      step: 0.1,
      current: data.returnRate,
      format: (v) => `연 ${Number(v).toFixed(1)}%`,
      label: '투자 수익률',
    }
  }
  if (id === 'price') {
    const cur = data.goalPriceM
    const min = Math.max(20000, Math.round((cur * 0.5) / 1000) * 1000)
    const max = Math.round((cur * 1.2) / 1000) * 1000
    return {
      key: 'goalPriceM',
      min,
      max,
      step: 500,
      current: cur,
      format: (v) => fmtKRW(v),
      label: '목표 주택 가격',
    }
  }
  // ltv
  return {
    key: 'ltv',
    min: 30,
    max: 70,
    step: 5,
    current: data.ltv,
    format: (v) => `${v}%`,
    label: 'LTV',
  }
}

interface ActionCardProps {
  a: ActionEffect
  i: number
  color: string
  data: SimulationData
  setData: (d: SimulationData) => void
  maxSaved: number
  expanded: boolean
  onToggle: () => void
  onAi: (ctx: 'action', prefill: string) => void
}

function ActionCard({
  a,
  i,
  color,
  data,
  setData,
  maxSaved,
  expanded,
  onToggle,
  onAi,
}: ActionCardProps) {
  const cfg = useMemo(() => buildCfg(a.id, data), [a.id, data])
  const [val, setVal] = useState<number>(cfg.current)

  useEffect(() => {
    setVal(cfg.current)
  }, [cfg.current])

  const preview = useMemo<{ delta: number; months: number } | null>(() => {
    if (val === cfg.current) return null
    const next: SimulationData = { ...data, [cfg.key]: val }
    const baseM = simulate(data, 'base').months
    const nextM = simulate(next, 'base').months
    return { delta: baseM - nextM, months: nextM }
  }, [val, cfg, data])

  const pct = ((val - cfg.min) / (cfg.max - cfg.min)) * 100
  const isImprove = preview !== null && preview.delta > 0
  const isWorse = preview !== null && preview.delta < 0
  const previewColor = isImprove
    ? '#1B7B47'
    : isWorse
      ? '#BC6014'
      : 'var(--muted)'

  const applyChange = () => {
    setData({ ...data, [cfg.key]: val })
    onToggle()
  }
  const resetVal = () => setVal(cfg.current)

  const rangeStyle: CSSProperties = {
    '--pct': `${pct}%`,
    '--track-color': color,
  }

  return (
    <div className="card" style={{ padding: 18 }}>
      <button
        onClick={onToggle}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'block',
          width: '100%',
        }}
      >
        <div className="row gap-12" style={{ alignItems: 'flex-start' }}>
          <div
            className="dot"
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: `${color}1A`,
              color: color,
              fontSize: 14,
              fontWeight: 800,
            }}
          >
            {i + 1}
          </div>
          <div className="col" style={{ flex: 1 }}>
            <div className="t-subtitle">{a.label}을 바꾸면</div>
            <div className="t-caption" style={{ marginTop: 2 }}>{a.sub}</div>
          </div>
          <div className="col" style={{ alignItems: 'flex-end' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#1B7B47' }}>
              -{fmtYearMonth(a.savedMonths)}
            </div>
            <div className="t-caption" style={{ fontSize: 11 }}>빨라져요</div>
          </div>
          <div
            style={{
              marginLeft: 4,
              color: 'var(--muted)',
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.22s',
            }}
          >
            <Icons.Chevron s={16} c="#8A98AD" />
          </div>
        </div>

        <div
          style={{
            marginTop: 14,
            height: 6,
            background: 'rgba(15,26,43,0.06)',
            borderRadius: 999,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.min(100, (a.savedMonths / maxSaved) * 100)}%`,
              background: color,
              borderRadius: 999,
              transition: 'width 0.4s',
            }}
          />
        </div>
      </button>

      <div className={`action-expand ${expanded ? 'expanded' : 'collapsed'}`}>
        <div
          style={{
            paddingTop: 18,
            marginTop: 16,
            borderTop: '1px solid rgba(15,26,43,0.06)',
          }}
        >
          <div
            className="row"
            style={{
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 10,
            }}
          >
            <div className="t-tag">{cfg.label} 조정</div>
            <div className="row gap-8" style={{ alignItems: 'baseline' }}>
              <span
                style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}
              >
                {cfg.format(val)}
              </span>
              {val !== cfg.current && (
                <button
                  onClick={resetVal}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    fontSize: 11,
                    color: 'var(--muted)',
                    textDecoration: 'underline',
                  }}
                >
                  되돌리기
                </button>
              )}
            </div>
          </div>

          <input
            type="range"
            className="range-slider"
            min={cfg.min}
            max={cfg.max}
            step={cfg.step}
            value={val}
            onChange={(e) => setVal(parseFloat(e.target.value))}
            style={rangeStyle}
          />

          <div
            className="row"
            style={{ justifyContent: 'space-between', marginTop: 4 }}
          >
            <span className="t-caption" style={{ fontSize: 11 }}>
              {cfg.format(cfg.min)}
            </span>
            <span className="t-caption" style={{ fontSize: 11 }}>
              현재 {cfg.format(cfg.current)}
            </span>
            <span className="t-caption" style={{ fontSize: 11 }}>
              {cfg.format(cfg.max)}
            </span>
          </div>

          <div
            style={{
              marginTop: 14,
              padding: '12px 14px',
              background: 'rgba(49,130,246,0.06)',
              borderRadius: 12,
            }}
          >
            {preview !== null ? (
              <div
                className="row"
                style={{
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span className="t-caption">변경 시 예상</span>
                <div className="row gap-6" style={{ alignItems: 'baseline' }}>
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: 'var(--ink)',
                    }}
                  >
                    {fmtYearMonth(preview.months)}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: previewColor,
                    }}
                  >
                    {isImprove ? '−' : isWorse ? '+' : ''}
                    {fmtYearMonth(Math.abs(preview.delta))}
                  </span>
                </div>
              </div>
            ) : (
              <div className="t-caption" style={{ textAlign: 'center' }}>
                슬라이더를 움직이면 예상 시점이 바로 바뀌어요
              </div>
            )}
          </div>

          <div className="row gap-8" style={{ marginTop: 14 }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={val === cfg.current}
              onClick={applyChange}
            >
              적용하기
            </button>
            <button
              className="ai-chip"
              onClick={() =>
                onAi('action', `${a.label} 변수가 가장 효과적인 이유는?`)
              }
            >
              <Icons.Sparkles s={12} /> 이유
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const PALETTE = ['#3182F6', '#FFD166', '#1B7B47', '#A2D2FF']

export function ActionGuide() {
  const data = useAppStore((s) => s.data)
  const setData = useAppStore((s) => s.setData)
  const setScreen = useAppStore((s) => s.setScreen)
  const openAi = useAppStore((s) => s.openAi)

  const actions = useMemo(() => actionEffects(data), [data])
  const [openId, setOpenId] = useState<ActionEffectId | null>(null)
  const onBack = () => setScreen('result')
  const onAi = (ctx: 'action', prefill: string) => openAi(ctx, prefill)

  const topSaved = actions[0]?.savedMonths ?? 0
  const maxSaved = Math.max(1, topSaved)

  return (
    <div className="screen col" style={{ minHeight: '100%' }}>
      <DetailHeader title="기간 줄이기" onBack={onBack} />
      <div className="pad col gap-16" style={{ padding: '8px 20px 40px' }}>
        <div className="t-title">기간을 줄일 수 있는 조건을 찾아봤어요</div>
        <div className="t-body" style={{ color: 'var(--muted)' }}>
          영향이 큰 변수부터 보여드려요. 카드를 열면 직접 조정해볼 수 있어요.
        </div>

        <div className="col gap-12">
          {actions.map((a, i) => (
            <ActionCard
              key={a.id}
              a={a}
              i={i}
              color={PALETTE[i] ?? '#3182F6'}
              data={data}
              setData={setData}
              maxSaved={maxSaved}
              expanded={openId === a.id}
              onToggle={() => setOpenId(openId === a.id ? null : a.id)}
              onAi={onAi}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
