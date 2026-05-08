import { Icons } from '@/components/Icons'
import { riskEffects } from '@/lib/sim'
import { useAppStore } from '@/store/appStore'
import { DetailHeader } from './DetailHeader'

type RiskLevel = 'stable' | 'warn' | 'risk'

const LVL_TEXT: Record<RiskLevel, string> = {
  stable: '안정',
  warn: '주의',
  risk: '부담',
}

export function RiskCheck() {
  const data = useAppStore((s) => s.data)
  const setScreen = useAppStore((s) => s.setScreen)
  const openAi = useAppStore((s) => s.openAi)

  const r = riskEffects(data)
  const lvl: RiskLevel =
    r.dsrBase < 35 ? 'stable' : r.dsrBase < 45 ? 'warn' : 'risk'
  const lvlText = LVL_TEXT[lvl]
  const onBack = () => setScreen('result')

  const items: ReadonlyArray<readonly [string, string, RiskLevel]> = [
    ['금리 변동', '금리가 오르면 월 상환액과 DSR이 함께 올라요', lvl],
    [
      '소득 변동',
      `현재 월 소득의 ${r.dsrBase.toFixed(0)}%가 상환액이에요`,
      r.dsrBase < 30 ? 'stable' : 'warn',
    ],
    ['집값 하락', '단기 급락 시 자산 변동성에 주의가 필요해요', 'warn'],
  ]

  return (
    <div className="screen col" style={{ minHeight: '100%' }}>
      <DetailHeader title="리스크 체크" onBack={onBack} />
      <div className="pad col gap-16" style={{ padding: '8px 20px 40px' }}>
        <div className="t-title">구매 후 부담을 함께 확인해보세요</div>

        <div className="card" style={{ padding: 20 }}>
          <div
            className="row"
            style={{ justifyContent: 'space-between', alignItems: 'center' }}
          >
            <div className="t-tag">전체 부담 상태</div>
            <span className={`status-pill status-${lvl}`}>{lvlText}</span>
          </div>
          <div className="t-num-hero" style={{ fontSize: 32, marginTop: 6 }}>
            DSR 약 {r.dsrBase.toFixed(0)}%
          </div>
          <div className="t-caption" style={{ marginTop: 4 }}>
            소득의 약 {r.dsrBase.toFixed(0)}%를 대출 상환에 쓰는 셈이에요.
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="t-tag">금리가 1%p 오르면</div>
          <div
            className="row gap-12"
            style={{ marginTop: 10, alignItems: 'baseline' }}
          >
            <div>
              <div className="t-caption">현재</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>
                {Math.round(r.monthlyPayBase).toLocaleString()}
                <span
                  style={{
                    fontSize: 14,
                    color: 'var(--muted)',
                    fontWeight: 600,
                  }}
                >
                  만
                </span>
              </div>
            </div>
            <Icons.ArrowRight c="#8A98AD" />
            <div>
              <div className="t-caption" style={{ color: '#BC6014' }}>금리 +1%p</div>
              <div
                style={{ fontSize: 22, fontWeight: 800, color: '#BC6014' }}
              >
                {Math.round(r.monthlyPayHi).toLocaleString()}
                <span
                  style={{
                    fontSize: 14,
                    color: 'var(--muted)',
                    fontWeight: 600,
                  }}
                >
                  만
                </span>
              </div>
            </div>
          </div>
          <div
            style={{
              marginTop: 12,
              padding: '12px 14px',
              background: 'rgba(244,162,97,0.14)',
              borderRadius: 12,
            }}
          >
            <div
              className="t-caption"
              style={{ color: '#BC6014', fontWeight: 600 }}
            >
              월 약 {Math.round(r.monthlyPayDelta).toLocaleString()}만 원이 더 늘어요.
              DSR도 {r.dsrBase.toFixed(0)}% → {r.dsrHi.toFixed(0)}%로 올라요.
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="t-tag">리스크 항목별</div>
          <div className="col gap-12" style={{ marginTop: 12 }}>
            {items.map(([t, d, k]) => (
              <div
                key={t}
                className="row gap-12"
                style={{ alignItems: 'flex-start' }}
              >
                <span
                  className={`status-pill status-${k}`}
                  style={{ marginTop: 2 }}
                >
                  {LVL_TEXT[k]}
                </span>
                <div className="col" style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{t}</div>
                  <div className="t-caption" style={{ marginTop: 2 }}>{d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          className="ai-chip"
          onClick={() => openAi('risk', '가장 큰 리스크는 뭐예요?')}
          style={{ alignSelf: 'flex-start' }}
        >
          <Icons.Sparkles s={14} /> 가장 큰 리스크는 뭐예요?
        </button>
      </div>
    </div>
  )
}
