import { useMemo } from 'react'
import { Icons } from '@/components/Icons'
import {
  fmtKRW,
  fmtYearMonth,
  pmt,
  simulate,
} from '@/lib/sim'
import { useAppStore } from '@/store/appStore'

interface SteppingCandidate {
  id: string
  name: string
  sub: string
  priceRatio: number
  transit: string
  seoulAccess: number
  note: string
}

const STEPPING_CANDIDATES: ReadonlyArray<SteppingCandidate> = [
  {
    id: 'gwangmyeong',
    name: '광명',
    sub: '서울 서남부 접근',
    priceRatio: 0.62,
    transit: 'KTX 광명역 · 1호선',
    seoulAccess: 4,
    note: '서울 서남부·여의도 접근성이 좋아요',
  },
  {
    id: 'bundang',
    name: '성남 (분당)',
    sub: '강남권 출퇴근',
    priceRatio: 0.78,
    transit: '신분당선 · 분당선',
    seoulAccess: 5,
    note: '강남 출퇴근이 가능한 인기 지역이에요',
  },
  {
    id: 'gwacheon',
    name: '과천',
    sub: '강남 인접 베드타운',
    priceRatio: 0.82,
    transit: '4호선 · 과천대로',
    seoulAccess: 5,
    note: '강남에 가깝지만 진입가도 상대적으로 높아요',
  },
  {
    id: 'songdo',
    name: '인천 송도',
    sub: '신도시 · 자족형',
    priceRatio: 0.55,
    transit: 'GTX-B 예정 · 인천1호선',
    seoulAccess: 3,
    note: '진입가는 낮지만 서울 출퇴근 시간이 길어요',
  },
  {
    id: 'hyangdong',
    name: '고양 향동',
    sub: 'DMC·은평권 접근',
    priceRatio: 0.58,
    transit: '6호선 · DMC 인접',
    seoulAccess: 4,
    note: 'DMC·상암 근무자에게 합리적인 대안이에요',
  },
]

interface StatProps {
  l: string
  v: string
}

function Stat({ l, v }: StatProps) {
  return (
    <div className="col">
      <div className="t-caption" style={{ fontSize: 11 }}>{l}</div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--ink)',
          marginTop: 2,
        }}
      >
        {v}
      </div>
    </div>
  )
}

export function SteppingStone() {
  const data = useAppStore((s) => s.data)
  const scenario = useAppStore((s) => s.scenario)
  const setScreen = useAppStore((s) => s.setScreen)
  const openAi = useAppStore((s) => s.openAi)

  const baseResult = useMemo(() => simulate(data, scenario), [data, scenario])
  const baseMonths = baseResult.months

  const candidates = useMemo(() => {
    return STEPPING_CANDIDATES.map((c) => {
      const altGoal = Math.round(data.goalPriceM * c.priceRatio)
      const altData = { ...data, goalPriceM: altGoal }
      const r = simulate(altData, scenario)
      const monthlyPay = pmt(
        data.rate / 100 / 12,
        360,
        (altGoal * data.ltv) / 100,
      )
      const dsr =
        ((monthlyPay * 12) / (data.monthlyIncome * 12)) * 100
      return {
        ...c,
        altGoal,
        months: r.months,
        savedMonths: Math.max(0, baseMonths - r.months),
        monthlyPay,
        dsr,
      }
    }).sort((a, b) => b.savedMonths - a.savedMonths)
  }, [data, scenario, baseMonths])

  const fastest = candidates[0]
  const onBack = () => setScreen('result')

  return (
    <div className="screen col" style={{ minHeight: '100%' }}>
      <div className="app-nav">
        <button className="nav-icon" onClick={onBack}>
          <Icons.Back s={20} />
        </button>
        <div className="t-tag" style={{ color: 'var(--ink)' }}>징검다리 전략</div>
        <div style={{ width: 40 }} />
      </div>

      <div className="pad col gap-16" style={{ padding: '8px 20px 40px' }}>
        <div>
          <div className="t-eyebrow" style={{ color: '#3182F6' }}>비교용 후보</div>
          <div className="t-title" style={{ marginTop: 6 }}>
            중간 거점도 비교해볼까요?
          </div>
          <div
            className="t-body"
            style={{ color: 'var(--muted)', marginTop: 8 }}
          >
            {data.goalDistrict} 목표까지 약 {fmtYearMonth(baseMonths)} 걸려요. 가격이 낮고 서울 접근성이 좋은 후보를 추려봤어요.
          </div>
        </div>

        {fastest !== undefined && fastest.savedMonths > 0 && (
          <div className="hero-card">
            <div className="hero-inner" style={{ padding: '20px 22px' }}>
              <div className="t-tag" style={{ color: 'var(--muted)' }}>가장 빠른 진입</div>
              <div
                className="row gap-10"
                style={{ marginTop: 6, alignItems: 'baseline' }}
              >
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                    color: 'var(--ink)',
                  }}
                >
                  {fastest.name}
                </div>
                <div
                  style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 600 }}
                >
                  {fastest.sub}
                </div>
              </div>
              <div
                className="row gap-12"
                style={{ marginTop: 14, alignItems: 'baseline' }}
              >
                <div className="col">
                  <div className="t-caption">예상 진입</div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 800,
                      color: 'var(--ink)',
                    }}
                  >
                    약 {fmtYearMonth(fastest.months)}
                  </div>
                </div>
                <div
                  style={{
                    width: 1,
                    height: 32,
                    background: 'rgba(15,26,43,0.10)',
                  }}
                />
                <div className="col">
                  <div className="t-caption">목표 대비 단축</div>
                  <div
                    style={{ fontSize: 22, fontWeight: 800, color: '#1B7B47' }}
                  >
                    -{fmtYearMonth(fastest.savedMonths)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="col gap-12">
          {candidates.map((c) => (
            <div key={c.id} className="card" style={{ padding: 18 }}>
              <div
                className="row"
                style={{
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div className="col" style={{ flex: 1 }}>
                  <div className="row gap-8" style={{ alignItems: 'baseline' }}>
                    <div
                      style={{
                        fontSize: 17,
                        fontWeight: 800,
                        color: 'var(--ink)',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {c.name}
                    </div>
                    <div className="t-caption">{c.sub}</div>
                  </div>
                  <div className="t-caption" style={{ marginTop: 4 }}>
                    {c.transit}
                  </div>
                </div>
                <div className="col" style={{ alignItems: 'flex-end' }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: c.savedMonths > 0 ? '#1B7B47' : '#8A98AD',
                    }}
                  >
                    {c.savedMonths > 0
                      ? `-${fmtYearMonth(c.savedMonths)}`
                      : '단축 없음'}
                  </div>
                  <div className="t-caption" style={{ fontSize: 11 }}>
                    vs {data.goalDistrict}
                  </div>
                </div>
              </div>

              <div className="hair" style={{ margin: '14px 0' }} />

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 10,
                }}
              >
                <Stat l="진입 가격" v={`${fmtKRW(c.altGoal)}원`} />
                <Stat
                  l="월 상환"
                  v={`${Math.round(c.monthlyPay).toLocaleString()}만`}
                />
                <Stat
                  l="서울 접근성"
                  v={'★'.repeat(c.seoulAccess) + '☆'.repeat(5 - c.seoulAccess)}
                />
              </div>

              <div
                className="t-caption"
                style={{
                  marginTop: 12,
                  padding: '10px 12px',
                  background: 'rgba(162,210,255,0.18)',
                  borderRadius: 10,
                  color: '#2A5BA8',
                }}
              >
                {c.note}
              </div>

              <div className="row gap-8" style={{ marginTop: 12 }}>
                <button
                  className="ai-chip"
                  onClick={() =>
                    openAi('stepping', `${c.name}이 저한테 어떤 의미예요?`)
                  }
                >
                  <Icons.Sparkles s={12} /> 이 후보가 어때요?
                </button>
              </div>
            </div>
          ))}
        </div>

        <div
          className="card"
          style={{
            padding: 16,
            background: 'rgba(244,162,97,0.10)',
            border: '1px solid rgba(244,162,97,0.25)',
          }}
        >
          <div className="t-tag" style={{ color: '#BC6014' }}>📌 비교용이에요</div>
          <div
            className="t-caption"
            style={{ marginTop: 6, color: '#7A4711', lineHeight: 1.6 }}
          >
            여기에 표시된 후보는 매수 추천이 아니에요.
            가격·접근성·대출 가능성 기준으로 비교할 수 있도록 골라낸 예시이며,
            실제 진입 가격·교통·정책은 시점에 따라 달라질 수 있어요.
          </div>
        </div>

        <button
          className="ai-chip"
          onClick={() => openAi('stepping', '어떤 기준으로 추렸나요?')}
          style={{ alignSelf: 'flex-start' }}
        >
          <Icons.Sparkles s={14} /> 어떤 기준으로 추렸나요?
        </button>
      </div>
    </div>
  )
}
