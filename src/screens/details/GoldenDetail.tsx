import { useMemo } from 'react'
import { Icons } from '@/components/Icons'
import { ScenarioSeg } from '@/components/ScenarioSeg'
import { GoldenSpark } from '@/components/GoldenSpark'
import { fmtDateK, fmtKRWLong, fmtYearMonth, simulate } from '@/lib/sim'
import { useAppStore } from '@/store/appStore'
import { DetailHeader } from './DetailHeader'

interface LegendProps {
  color: string
  label: string
}

function Legend({ color, label }: LegendProps) {
  return (
    <div className="row gap-6">
      <span
        style={{ width: 10, height: 10, background: color, borderRadius: 3 }}
      />
      <span className="t-caption">{label}</span>
    </div>
  )
}

export function GoldenDetail() {
  const data = useAppStore((s) => s.data)
  const scenario = useAppStore((s) => s.scenario)
  const setScenario = useAppStore((s) => s.setScenario)
  const setScreen = useAppStore((s) => s.setScreen)
  const openAi = useAppStore((s) => s.openAi)

  const result = useMemo(() => simulate(data, scenario), [data, scenario])
  const onBack = () => setScreen('result')

  const assetsAtCross = result.seriesAssets[result.months]
  const assetsLabel =
    assetsAtCross !== undefined ? fmtKRWLong(assetsAtCross) : '—'

  const rows: ReadonlyArray<readonly [string, string]> = [
    ['그때 예상 집값', fmtKRWLong(result.futurePrice)],
    ['그때 가용 자산', assetsLabel],
    ['그때 가능 대출', fmtKRWLong(result.futureLoan)],
  ]

  return (
    <div className="screen col" style={{ minHeight: '100%' }}>
      <DetailHeader title="Golden Cross" onBack={onBack} />
      <div className="pad col gap-16" style={{ padding: '8px 20px 120px' }}>
        <div className="t-title">선이 만나는 지점이 진입 시점이에요</div>
        <div className="card" style={{ padding: '20px 12px 16px' }}>
          <GoldenSpark result={result} height={220} />
          <div
            className="row gap-12"
            style={{ justifyContent: 'center', marginTop: 12 }}
          >
            <Legend color="#3182F6" label="내 가용 자산" />
            <Legend color="#A2D2FF" label="목표 집값" />
            <Legend color="#FFD166" label="진입 시점" />
          </div>
        </div>

        <ScenarioSeg value={scenario} onChange={setScenario} />

        <div className="card" style={{ padding: 18 }}>
          <div className="t-tag">예상 진입 시점</div>
          <div className="t-num-hero" style={{ marginTop: 4, fontSize: 32 }}>
            {fmtDateK(result.crossDate)}
          </div>
          <div className="t-caption" style={{ marginTop: 4 }}>
            지금부터 약 {fmtYearMonth(result.months)} 후
          </div>
          <div className="hair" style={{ margin: '14px 0' }} />
          <div className="col gap-8">
            {rows.map(([l, v]) => (
              <div
                key={l}
                className="row"
                style={{ justifyContent: 'space-between' }}
              >
                <div className="t-body" style={{ color: 'var(--muted)' }}>{l}</div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        <button
          className="ai-chip"
          onClick={() => openAi('golden', '왜 이 시점이 나왔나요?')}
          style={{ alignSelf: 'flex-start' }}
        >
          <Icons.Sparkles s={14} /> 왜 이 시점이 나왔나요?
        </button>
      </div>
    </div>
  )
}
