import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { Icons } from '@/components/Icons'
import { fmtYearMonth, simulate } from '@/lib/sim'
import { useAppStore } from '@/store/appStore'

type FieldKey = 'growth' | 'returnRate' | 'rate' | 'ltv' | 'dsr'

const FIELD_KEYS: ReadonlyArray<FieldKey> = [
  'growth',
  'returnRate',
  'rate',
  'ltv',
  'dsr',
]

type Draft = Record<FieldKey, number>

interface Field {
  key: FieldKey
  label: string
  sub: string
  min: number
  max: number
  step: number
  fmt: (v: number) => string
  hint: string
}

const FIELDS: ReadonlyArray<Field> = [
  {
    key: 'growth',
    label: '집값 상승률',
    sub: '연간 주택 가격 상승 가정',
    min: 0,
    max: 8,
    step: 0.1,
    fmt: (v) => `연 ${v.toFixed(1)}%`,
    hint: '서울 5년 평균 약 3% 수준',
  },
  {
    key: 'returnRate',
    label: '투자 수익률',
    sub: '자산 운용 기대 수익률',
    min: 0,
    max: 12,
    step: 0.1,
    fmt: (v) => `연 ${v.toFixed(1)}%`,
    hint: 'MMF 3~4%, 주식 5~7% 수준',
  },
  {
    key: 'rate',
    label: '대출 금리',
    sub: '주택담보대출 적용 금리',
    min: 2,
    max: 8,
    step: 0.1,
    fmt: (v) => `연 ${v.toFixed(1)}%`,
    hint: '2026년 시중은행 기준 4~5%',
  },
  {
    key: 'ltv',
    label: 'LTV',
    sub: '집값 대비 대출 비율',
    min: 30,
    max: 70,
    step: 5,
    fmt: (v) => `${v}%`,
    hint: '서울 비투기지역 50%, 투기지역 40%',
  },
  {
    key: 'dsr',
    label: 'DSR',
    sub: '소득 대비 상환 부담 한도',
    min: 30,
    max: 60,
    step: 5,
    fmt: (v) => `${v}%`,
    hint: '시중은행 통상 40%',
  },
]

export function ScenarioEdit() {
  const data = useAppStore((s) => s.data)
  const setData = useAppStore((s) => s.setData)
  const setScreen = useAppStore((s) => s.setScreen)

  const original = useRef<Draft>({
    growth: data.growth,
    returnRate: data.returnRate,
    rate: data.rate,
    ltv: data.ltv,
    dsr: data.dsr,
  })
  const [draft, setDraft] = useState<Draft>({
    growth: data.growth,
    returnRate: data.returnRate,
    rate: data.rate,
    ltv: data.ltv,
    dsr: data.dsr,
  })

  const onBack = () => setScreen('result')

  const preview = useMemo(
    () => simulate({ ...data, ...draft }, 'base'),
    [draft, data],
  )
  const baseline = useMemo(() => simulate(data, 'base'), [data])
  const delta = baseline.months - preview.months

  const update = (k: FieldKey, v: number) =>
    setDraft((d) => ({ ...d, [k]: v }))
  const reset = () => setDraft({ ...original.current })
  const apply = () => {
    setData({ ...data, ...draft })
    onBack()
  }

  const dirty = FIELD_KEYS.some((k) => draft[k] !== original.current[k])

  return (
    <div className="screen col" style={{ minHeight: '100%' }}>
      <div className="app-nav">
        <button
          className="nav-icon"
          onClick={onBack}
          aria-label="back"
        >
          <Icons.Back s={20} />
        </button>
        <div className="nav-progress">
          <div className="nav-step">시나리오 직접 편집</div>
        </div>
        <button
          className="nav-icon"
          onClick={reset}
          disabled={!dirty}
          aria-label="reset"
          style={{
            opacity: dirty ? 1 : 0.3,
            fontSize: 12,
            fontWeight: 700,
            color: '#3182F6',
            width: 'auto',
            padding: '0 12px',
          }}
        >
          초기화
        </button>
      </div>

      <div className="pad col gap-16" style={{ padding: '8px 20px 140px' }}>
        <div className="t-title">가정을 직접 조정해보세요</div>
        <div className="t-body" style={{ color: 'var(--muted)' }}>
          기준 시나리오 기준 예상 진입 시점이 어떻게 바뀌는지 바로 확인할 수 있어요.
        </div>

        <div
          className="card"
          style={{
            padding: 18,
            background:
              'linear-gradient(135deg, rgba(49,130,246,0.08), rgba(162,210,255,0.18))',
            borderColor: 'rgba(49,130,246,0.2)',
          }}
        >
          <div className="t-tag">변경 시 예상 진입 시점</div>
          <div
            className="row gap-8"
            style={{ alignItems: 'baseline', marginTop: 6 }}
          >
            <span
              className="fade-num"
              key={preview.months}
              style={{
                fontSize: 28,
                fontWeight: 800,
                letterSpacing: '-0.025em',
                color: 'var(--ink)',
              }}
            >
              약 {fmtYearMonth(preview.months)}
            </span>
            {dirty && (
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color:
                    delta > 0
                      ? '#1B7B47'
                      : delta < 0
                        ? '#BC6014'
                        : 'var(--muted)',
                }}
              >
                {delta > 0
                  ? `−${fmtYearMonth(delta)}`
                  : delta < 0
                    ? `+${fmtYearMonth(-delta)}`
                    : '변동 없음'}
              </span>
            )}
          </div>
          <div className="t-caption" style={{ marginTop: 4 }}>
            기준 약 {fmtYearMonth(baseline.months)} → 변경 후{' '}
            {fmtYearMonth(preview.months)}
          </div>
        </div>

        {FIELDS.map((f) => {
          const v = draft[f.key]
          const orig = original.current[f.key]
          const pct = ((v - f.min) / (f.max - f.min)) * 100
          const changed = v !== orig
          const rangeStyle: CSSProperties = {
            '--pct': `${pct}%`,
            '--track-color': '#3182F6',
          }
          return (
            <div key={f.key} className="card" style={{ padding: 18 }}>
              <div
                className="row"
                style={{
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                }}
              >
                <div className="col">
                  <div className="t-subtitle">{f.label}</div>
                  <div className="t-caption" style={{ marginTop: 2 }}>
                    {f.sub}
                  </div>
                </div>
                <div className="col" style={{ alignItems: 'flex-end' }}>
                  <span
                    style={{
                      fontSize: 18,
                      fontWeight: 800,
                      color: changed ? '#3182F6' : 'var(--ink)',
                    }}
                  >
                    {f.fmt(v)}
                  </span>
                  {changed && (
                    <span
                      className="t-caption"
                      style={{ fontSize: 11, color: 'var(--muted)' }}
                    >
                      기존 {f.fmt(orig)}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <input
                  type="range"
                  className="range-slider"
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={v}
                  onChange={(e) => update(f.key, parseFloat(e.target.value))}
                  style={rangeStyle}
                />
              </div>
              <div
                className="row"
                style={{ justifyContent: 'space-between', marginTop: 4 }}
              >
                <span className="t-caption" style={{ fontSize: 11 }}>
                  {f.fmt(f.min)}
                </span>
                <span className="t-caption" style={{ fontSize: 11 }}>
                  {f.fmt(f.max)}
                </span>
              </div>
              <div
                className="t-caption"
                style={{
                  marginTop: 10,
                  padding: '8px 12px',
                  background: 'rgba(15,26,43,0.04)',
                  borderRadius: 10,
                  fontSize: 11.5,
                }}
              >
                💡 {f.hint}
              </div>
            </div>
          )
        })}

        <div
          className="t-caption"
          style={{
            textAlign: 'center',
            fontSize: 11,
            marginTop: 4,
            color: 'var(--muted)',
          }}
        >
          편집한 가정은 안정 / 기준 / 적극 시나리오 모두에 반영돼요.
        </div>
      </div>

      <div className="cta-bar">
        <button
          className="btn btn-primary"
          disabled={!dirty}
          onClick={apply}
          style={{ width: '100%' }}
        >
          {dirty ? '적용하기' : '변경사항 없음'}
        </button>
      </div>
    </div>
  )
}
