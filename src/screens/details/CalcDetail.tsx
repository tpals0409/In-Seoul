import type { ReactNode } from 'react'
import { Icons } from '@/components/Icons'
import { SCENARIOS } from '@/data/scenarios'
import {
  fmtKRWLong,
  fmtYearMonth,
  simulate,
  totalAssetsMan,
} from '@/lib/sim'
import { useAppStore } from '@/store/appStore'
import { DetailHeader } from './DetailHeader'

interface RowProps {
  l: string
  v: string
}

function Row({ l, v }: RowProps) {
  return (
    <div
      className="row"
      style={{ justifyContent: 'space-between', padding: '8px 0' }}
    >
      <div className="t-body" style={{ color: 'var(--muted)', fontSize: 14 }}>
        {l}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
        {v}
      </div>
    </div>
  )
}

interface SectionGroupProps {
  title: string
  children: ReactNode
}

function SectionGroup({ title, children }: SectionGroupProps) {
  return (
    <div className="card" style={{ padding: '6px 18px' }}>
      <div className="t-tag" style={{ padding: '12px 0 4px', fontSize: 12 }}>
        {title}
      </div>
      <div style={{ paddingBottom: 6 }}>{children}</div>
    </div>
  )
}

export function CalcDetail() {
  const data = useAppStore((s) => s.data)
  const scenario = useAppStore((s) => s.scenario)
  const setScreen = useAppStore((s) => s.setScreen)
  const openAi = useAppStore((s) => s.openAi)

  const result = simulate(data, scenario)
  const total = totalAssetsMan(data)
  const onBack = () => setScreen('result')

  return (
    <div className="screen col" style={{ minHeight: '100%' }}>
      <DetailHeader title="상세 계산" onBack={onBack} />
      <div className="pad col gap-16" style={{ padding: '8px 20px 40px' }}>
        <div className="t-title">계산에 사용한 기준이에요</div>

        <SectionGroup title="현재 상황">
          <Row l="현재 자산" v={fmtKRWLong(total)} />
          <Row l="월 저축액" v={`${data.monthlySaving}만 원`} />
          <Row l="월 소득" v={`${data.monthlyIncome}만 원`} />
        </SectionGroup>

        <SectionGroup title="목표">
          <Row
            l="지역 / 평형"
            v={`${data.goalDistrict} ${data.goalArea}평`}
          />
          <Row l="목표 가격(현재)" v={fmtKRWLong(data.goalPriceM)} />
          <Row
            l={`목표 가격 (${fmtYearMonth(result.months)} 후)`}
            v={fmtKRWLong(result.futurePrice)}
          />
        </SectionGroup>

        <SectionGroup title={`${SCENARIOS[scenario].label} 시나리오 가정`}>
          <Row l="집값 상승률" v={`연 ${result.sp.growth.toFixed(1)}%`} />
          <Row l="투자 수익률" v={`연 ${result.sp.returnRate.toFixed(1)}%`} />
          <Row l="대출 금리" v={`연 ${result.sp.rate.toFixed(1)}%`} />
          <Row l="LTV" v={`${data.ltv}%`} />
          <Row l="DSR" v={`${data.dsr}%`} />
          <Row l="거래 비용" v="주택가의 5% (취득세·중개·등기)" />
        </SectionGroup>

        <div
          className="card"
          style={{ padding: 18, background: 'rgba(49,130,246,0.04)' }}
        >
          <div className="t-tag" style={{ color: '#3182F6' }}>골든 크로스 조건</div>
          <pre
            style={{
              margin: '10px 0 0',
              fontFamily: 'ui-monospace, monospace',
              fontSize: 12,
              color: 'var(--ink-2)',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}
          >
{`자기자본 + LTV 대출 - 거래비용 ≥ 목표 주택 미래가격
  ↓ 만족하는 최초 시점 = 예상 진입`}
          </pre>
        </div>

        <button
          className="ai-chip"
          onClick={() => openAi('calc', '계산식을 쉽게 설명해주세요')}
          style={{ alignSelf: 'flex-start' }}
        >
          <Icons.Sparkles s={14} /> 계산식을 쉽게 설명해주세요
        </button>

        <div
          className="t-caption"
          style={{ color: 'var(--muted-2)', marginTop: 8 }}
        >
          본 결과는 사용자가 입력한 값과 서비스 내 가정에 따른 참고용 시뮬레이션입니다.
          실제 주택 가격, 대출 한도, 세금, 금리, 정책 조건은 시점과 개인 상황에 따라 달라질 수 있습니다.
          인서울은 특정 부동산 매수, 매도, 투자 결정을 권유하지 않습니다.
        </div>
      </div>
    </div>
  )
}
