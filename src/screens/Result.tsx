import { useMemo, useState, type ReactNode } from 'react'
import type { AiContext, Screen } from '@/types/contracts'
import { Icons } from '@/components/Icons'
import { ScenarioSeg } from '@/components/ScenarioSeg'
import { GoldenSpark } from '@/components/GoldenSpark'
import { SCENARIOS } from '@/data/scenarios'
import {
  actionEffects,
  fmtDateK,
  fmtKRW,
  fmtKRWLong,
  fmtYearMonth,
  riskEffects,
  simulate,
} from '@/lib/sim'
import { useAppStore } from '@/store/appStore'
import { priceFromSnapshot, useMarketSnapshot } from '@/data/useMarketSnapshot'

interface SmallCardProps {
  tag: string
  emoji: string
  value: ReactNode
  sub: string
  tint: string
}

function SmallCard({ tag, emoji, value, sub, tint }: SmallCardProps) {
  return (
    <div
      className="card"
      style={{
        padding: '16px 18px',
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
      }}
    >
      <div
        className="dot"
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: `${tint}1A`,
          color: tint,
          fontSize: 18,
        }}
      >
        {emoji}
      </div>
      <div className="col" style={{ flex: 1, minWidth: 0 }}>
        <div className="t-tag" style={{ fontSize: 12 }}>{tag}</div>
        <div
          style={{
            fontSize: 19,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            marginTop: 2,
            color: 'var(--ink)',
          }}
        >
          {value}
        </div>
        <div className="t-caption" style={{ marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  )
}

type BadgeKind = 'stable' | 'warn' | 'risk'

interface SectionLinkProps {
  title: string
  desc: string
  badge?: string
  badgeKind?: BadgeKind
  onClick: () => void
}

function SectionLink({
  title,
  desc,
  badge,
  badgeKind = 'stable',
  onClick,
}: SectionLinkProps) {
  return (
    <div className="section-card" onClick={onClick}>
      <div
        className="row"
        style={{ justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div className="col">
          <div className="t-subtitle">{title}</div>
          <div className="t-caption" style={{ marginTop: 2 }}>{desc}</div>
        </div>
        <div className="row gap-8">
          {badge !== undefined && (
            <span className={`status-pill status-${badgeKind}`}>{badge}</span>
          )}
          <Icons.Chevron s={18} c="#8A98AD" />
        </div>
      </div>
    </div>
  )
}

export function Result() {
  const data = useAppStore((s) => s.data)
  const scenario = useAppStore((s) => s.scenario)
  const setScenario = useAppStore((s) => s.setScenario)
  const setScreen = useAppStore((s) => s.setScreen)
  const setWizardStep = useAppStore((s) => s.setWizardStep)
  const setResetOpen = useAppStore((s) => s.setResetOpen)
  const openAi = useAppStore((s) => s.openAi)

  const [showAssump, setShowAssump] = useState(false)
  const [showMore, setShowMore] = useState(false)

  const result = useMemo(() => simulate(data, scenario), [data, scenario])
  const actions = useMemo(() => actionEffects(data), [data])
  const risk = useMemo(() => riskEffects(data), [data])
  const top = actions[0]

  const { snapshot } = useMarketSnapshot()
  const livePrice = priceFromSnapshot(snapshot, data.goalDistrict)
  const liveAsOf = snapshot?.builtAt.slice(0, 10)
  const isLive = livePrice !== null
  // 사용자가 입력한 목표가 vs 실거래 중앙값 — 비교 % (60-85㎡ 베이스를 25평 기준으로 단순 비례)
  const liveDiffPct = isLive
    ? Math.round(((data.goalPriceM - livePrice * (data.goalArea / 25)) / (livePrice * (data.goalArea / 25))) * 100)
    : 0

  const onNav = (s: Screen) => setScreen(s)
  const onAi = (ctx: AiContext, prefill?: string) =>
    openAi(ctx, prefill ?? '')
  const onEdit = () => {
    setWizardStep(1)
    setScreen('wizard')
  }
  const onReset = () => setResetOpen(true)

  const dsrLevel: BadgeKind =
    risk.dsrBase < 35 ? 'stable' : risk.dsrBase < 45 ? 'warn' : 'risk'
  const dsrLabel = dsrLevel === 'stable' ? '안정' : dsrLevel === 'warn' ? '주의' : '부담'
  const dsrColor =
    dsrLevel === 'stable' ? '#1B7B47' : dsrLevel === 'warn' ? '#F4A261' : '#E76F51'

  const topSavedMonths = top !== undefined ? top.savedMonths : 0
  const topLabel = top !== undefined ? top.label : '-'
  const topSub = top !== undefined ? top.sub : ''

  return (
    <div className="screen col" style={{ minHeight: '100%' }}>
      <div className="app-nav" style={{ height: 56 }}>
        <div className="col" style={{ paddingLeft: 8 }}>
          <div className="t-eyebrow">서울 · {data.goalDistrict} {data.goalArea}평</div>
          <div className="t-tag" style={{ color: 'var(--ink)' }}>결과 요약</div>
        </div>
        <div className="spacer" />
        <button
          className="ai-chip"
          onClick={onEdit}
          style={{
            marginRight: 8,
            color: 'var(--ink-2)',
            borderColor: 'rgba(15,26,43,0.10)',
          }}
        >
          조건 바꾸기
        </button>
      </div>

      <div className="pad col gap-16" style={{ padding: '12px 20px 32px' }}>
        <div className="hero-card">
          <div className="hero-inner">
            <div className="t-tag" style={{ color: 'var(--muted)' }}>
              {data.goalDistrict} 목표 아파트까지
            </div>
            {isLive && livePrice !== null && (
              <div
                className="t-caption"
                style={{
                  marginTop: 4,
                  fontSize: 11.5,
                  color: '#1B7B47',
                  fontWeight: 600,
                  letterSpacing: '-0.005em',
                }}
                title={`국토부 실거래 ${liveAsOf ?? ''} 기준`}
              >
                실거래 중앙값 25평 약 {fmtKRW(livePrice)}
                {Math.abs(liveDiffPct) >= 5 && (
                  <span
                    style={{
                      marginLeft: 6,
                      color: liveDiffPct > 0 ? '#BC6014' : '#1B7B47',
                      fontWeight: 700,
                    }}
                  >
                    (입력 {liveDiffPct > 0 ? '+' : ''}
                    {liveDiffPct}%)
                  </span>
                )}
              </div>
            )}
            <div
              className="row gap-8"
              style={{ marginTop: 6, alignItems: 'baseline' }}
            >
              <div
                key={result.months}
                className="fade-num t-num-hero"
                style={{ color: 'var(--ink)' }}
              >
                약 {fmtYearMonth(result.months)}
              </div>
              <div style={{ fontSize: 18, color: 'var(--muted)', fontWeight: 700 }}>
                남았어요
              </div>
            </div>
            <div
              style={{
                marginTop: 10,
                fontSize: 14,
                color: 'var(--ink-2)',
                fontWeight: 600,
              }}
            >
              예상 시점은{' '}
              <span style={{ color: '#3182F6' }}>{fmtDateK(result.crossDate)}</span>이에요.
            </div>
            <div className="t-caption" style={{ marginTop: 6 }}>
              현재 입력값과 {SCENARIOS[scenario].label} 시나리오로 계산했어요.
            </div>

            <div style={{ marginTop: 14, marginLeft: -6, marginRight: -6 }}>
              <GoldenSpark result={result} height={110} />
            </div>

            <div
              className="row gap-8"
              style={{ marginTop: 12, flexWrap: 'wrap' }}
            >
              <button
                className="ai-chip"
                onClick={() => onAi('result', '왜 이 시점이 나왔나요?')}
              >
                <Icons.Sparkles s={12} /> 왜 이 시점이 나왔나요?
              </button>
              <button
                className="ai-chip"
                onClick={() => onAi('result', '어떻게 줄일 수 있나요?')}
              >
                <Icons.Sparkles s={12} /> 어떻게 줄일 수 있나요?
              </button>
            </div>
          </div>
        </div>

        <div className="col gap-8">
          <ScenarioSeg value={scenario} onChange={setScenario} />
          <div className="col gap-8">
            <div className="t-caption">{SCENARIOS[scenario].sub}</div>
            <button
              className="btn btn-ghost"
              style={{
                height: 28,
                padding: '0 4px',
                fontSize: 13,
                alignSelf: 'flex-start',
              }}
              onClick={() => setShowAssump((s) => !s)}
            >
              {showAssump ? '접기' : '가정 자세히'}{' '}
              <Icons.Chevron s={12} c="#3182F6" dir={showAssump ? 'up' : 'down'} />
            </button>
          </div>
          {showAssump && (
            <div className="card" style={{ padding: '14px 16px' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                }}
              >
                {(
                  [
                    ['집값 상승률', `${result.sp.growth.toFixed(1)}%`],
                    ['투자 수익률', `${result.sp.returnRate.toFixed(1)}%`],
                    ['대출 금리', `${result.sp.rate.toFixed(1)}%`],
                    ['LTV / DSR', `${data.ltv}% / ${data.dsr}%`],
                    ['거래 비용', '주택가 5%'],
                    ['기준일', '2026.05.08'],
                  ] satisfies ReadonlyArray<readonly [string, string]>
                ).map(([l, v]) => (
                  <div key={l} className="col gap-4">
                    <div className="t-caption" style={{ fontSize: 12 }}>{l}</div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: 'var(--ink)',
                      }}
                    >
                      {v}
                    </div>
                  </div>
                ))}
              </div>
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: '1px solid rgba(15,26,43,0.06)',
                }}
              >
                <button
                  className="btn btn-secondary"
                  style={{ width: '100%', height: 38 }}
                  onClick={() => onNav('scenario-edit')}
                >
                  <Icons.Sparkles s={12} /> 시나리오 직접 편집
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="col gap-12">
          <SmallCard
            tag="부족 금액"
            emoji="💰"
            value={fmtKRWLong(result.shortfallNow)}
            sub="지금 사기엔 이만큼 부족해요"
            tint="#3182F6"
          />
          <SmallCard
            tag="가장 큰 영향 변수"
            emoji="🎯"
            value={topLabel}
            sub={`${topSub} 약 ${fmtYearMonth(topSavedMonths)} 빨라져요`}
            tint="#FFD166"
          />
          <SmallCard
            tag="줄일 수 있는 기간"
            emoji="⏱"
            value={`최대 ${fmtYearMonth(topSavedMonths)}`}
            sub="조건을 조금만 바꿔도 단축할 수 있어요"
            tint="#1B7B47"
          />

          {showMore && (
            <>
              <SmallCard
                tag="예상 대출 가능"
                emoji="🏦"
                value={fmtKRWLong(result.futureLoan)}
                sub={`${data.goalDistrict} ${data.goalArea}평 기준 LTV ${data.ltv}%`}
                tint="#3182F6"
              />
              <SmallCard
                tag="예상 월 상환액"
                emoji="💳"
                value={`${Math.round(result.monthlyPayment).toLocaleString()}만 원`}
                sub={`${data.rate.toFixed(1)}% / 30년 원리금균등 가정`}
                tint="#3182F6"
              />
              <SmallCard
                tag="구매 후 부담"
                emoji="⚖️"
                value={dsrLabel}
                sub={`DSR 기준 약 ${risk.dsrBase.toFixed(0)}%`}
                tint={dsrColor}
              />
            </>
          )}
          <button
            className="btn btn-ghost"
            style={{ alignSelf: 'center' }}
            onClick={() => setShowMore((s) => !s)}
          >
            {showMore ? '접기' : '대출·월상환·리스크 더보기'}{' '}
            <Icons.Chevron s={12} c="#3182F6" dir={showMore ? 'up' : 'down'} />
          </button>
        </div>

        <div className="section-card" onClick={() => onNav('golden')}>
          <div
            className="row"
            style={{ justifyContent: 'space-between', alignItems: 'center' }}
          >
            <div className="col">
              <div className="t-subtitle">Golden Cross</div>
              <div className="t-caption" style={{ marginTop: 2 }}>
                두 선이 만나는 지점이 예상 진입 시점이에요
              </div>
            </div>
            <Icons.Chevron s={18} c="#8A98AD" />
          </div>
        </div>

        <SectionLink
          title="기간 줄이기"
          desc="기간을 줄일 수 있는 조건을 찾아봤어요"
          badge={`최대 ${fmtYearMonth(topSavedMonths)} 단축`}
          onClick={() => onNav('action')}
        />
        <SectionLink
          title="리스크 체크"
          desc="구매 후 부담도 함께 확인해보세요"
          badge={dsrLabel}
          badgeKind={dsrLevel}
          onClick={() => onNav('risk')}
        />
        <SectionLink
          title="상세 계산"
          desc="계산에 사용한 기준을 확인해보세요"
          onClick={() => onNav('calc')}
        />
        <SectionLink
          title="징검다리 전략"
          desc="서울 진입 전 중간 거점도 비교해볼까요"
          badge="비교"
          onClick={() => onNav('stepping')}
        />

        <div
          className="t-caption"
          style={{ marginTop: 4, padding: '0 4px', color: 'var(--muted-2)' }}
        >
          이 결과는 입력한 값과 가정에 따른 참고용 시뮬레이션이에요.
          실제 주택 가격, 대출 한도, 세금, 금리는 시점과 개인 상황에 따라 달라질 수 있어요.
        </div>

        <div
          className="row"
          style={{
            justifyContent: 'center',
            alignItems: 'center',
            gap: 6,
            marginTop: 14,
            paddingBottom: 4,
          }}
        >
          <Icons.Lock s={11} c="#8A98AD" />
          <span className="t-caption" style={{ color: 'var(--muted-2)' }}>
            입력 정보는 이 기기에만 저장돼요 ·
          </span>
          <button
            onClick={onReset}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              color: '#3182F6',
              textDecoration: 'underline',
              textUnderlineOffset: 2,
            }}
          >
            입력 데이터 삭제
          </button>
        </div>
        <div style={{ height: 24 }} />
      </div>
    </div>
  )
}
