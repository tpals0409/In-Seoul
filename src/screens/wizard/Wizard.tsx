import {
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react'
import type { HelpTopic, ScenarioKey, SimulationData } from '@/types/contracts'
import { Icons } from '@/components/Icons'
import { ScenarioSeg } from '@/components/ScenarioSeg'
import { Slider } from '@/components/Slider'
import { SCENARIOS } from '@/data/scenarios'
import { SEOUL_DISTRICTS, suggestPriceWithSnapshot } from '@/data/districts'
import { priceFromSnapshot, useMarketSnapshot } from '@/data/useMarketSnapshot'
import { fmtKRWLong } from '@/lib/sim'
import { useAppStore } from '@/store/appStore'

interface NavBarProps {
  step: number
  total: number
  onBack: () => void
  label?: string
}

function NavBar({ step, total, onBack, label }: NavBarProps) {
  return (
    <div className="app-nav">
      <button className="nav-icon" onClick={onBack} aria-label="back">
        <Icons.Back s={20} />
      </button>
      <div className="nav-progress">
        <div className="nav-step">{label ?? `${step}/${total}`}</div>
        <div className="progress">
          <div
            className="progress-fill"
            style={{ width: `${(step / total) * 100}%` }}
          />
        </div>
      </div>
      <div style={{ width: 40 }} />
    </div>
  )
}

interface MoneyInputProps {
  value: number
  onChange: (v: number) => void
  placeholder?: string
  unit?: string
  autoFocus?: boolean
}

function MoneyInput({
  value,
  onChange,
  placeholder,
  unit = '만원',
  autoFocus = false,
}: MoneyInputProps) {
  const [focused, setFocused] = useState(false)
  const display = value === 0 && !focused ? '' : Number(value).toLocaleString()
  return (
    <div className="input">
      <input
        type="text"
        inputMode="numeric"
        value={display}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          const raw = e.target.value.replace(/[^\d]/g, '')
          const n = parseInt(raw, 10)
          onChange(Number.isFinite(n) ? n : 0)
        }}
        placeholder={placeholder}
      />
      <span className="input-unit">{unit}</span>
    </div>
  )
}

interface StepShellProps {
  step: number
  total: number
  title: string
  subtitle?: string
  children: ReactNode
  ctaLabel?: string
  onNext: () => void
  onBack: () => void
  ctaDisabled?: boolean
}

function StepShell({
  step,
  total,
  title,
  subtitle,
  children,
  ctaLabel,
  onNext,
  onBack,
  ctaDisabled,
}: StepShellProps) {
  return (
    <div className="screen col" style={{ minHeight: '100%' }}>
      <NavBar step={step} total={total} onBack={onBack} />
      <div className="pad col gap-8" style={{ padding: '8px 20px 0' }}>
        <div className="t-eyebrow" style={{ color: '#3182F6' }}>
          STEP {step} / {total}
        </div>
        <div className="t-title">{title}</div>
        {subtitle !== undefined && (
          <div className="t-body" style={{ color: 'var(--muted)' }}>
            {subtitle}
          </div>
        )}
      </div>
      <div className="pad col" style={{ padding: '24px 20px 140px', flex: 1 }}>
        {children}
      </div>
      <div className="cta-bar">
        <button
          className="btn btn-primary"
          disabled={ctaDisabled ?? false}
          style={{ width: '100%' }}
          onClick={onNext}
        >
          {ctaLabel ?? '다음'}
        </button>
      </div>
    </div>
  )
}

interface StepProps {
  data: SimulationData
  patchData: (patch: Partial<SimulationData>) => void
  onNext: () => void
  onBack: () => void
}

function Step1({ data, patchData, onNext, onBack }: StepProps) {
  const [detail, setDetail] = useState(false)
  const total =
    (data.assets.cash || 0) + (data.assets.invest || 0) + (data.assets.etc || 0)
  const setField = (k: 'cash' | 'invest' | 'etc', v: number) => {
    patchData({ assets: { ...data.assets, [k]: v } })
  }

  const fields: ReadonlyArray<readonly ['cash' | 'invest' | 'etc', string]> = [
    ['cash', '현금 / 예금'],
    ['invest', '투자 자산'],
    ['etc', '기타 자산'],
  ]

  return (
    <StepShell
      step={1}
      total={5}
      onBack={onBack}
      onNext={onNext}
      title="지금 모아둔 자산이 얼마나 있나요?"
      subtitle="현금, 투자, 기타 자산을 모두 더한 값이에요."
    >
      {!detail ? (
        <div className="col gap-12">
          <div className="t-tag">총 현재 자산</div>
          <MoneyInput
            value={total}
            onChange={(v) =>
              patchData({ assets: { cash: v, invest: 0, etc: 0 } })
            }
            autoFocus
          />
          <button
            className="btn btn-ghost"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => setDetail(true)}
          >
            세부 항목으로 입력하기 <Icons.Chevron s={14} c="#3182F6" />
          </button>
        </div>
      ) : (
        <div className="col gap-16">
          {fields.map(([k, l]) => (
            <div key={k} className="col gap-8">
              <div className="t-tag">{l}</div>
              <MoneyInput value={data.assets[k]} onChange={(v) => setField(k, v)} />
            </div>
          ))}
          <div
            style={{
              marginTop: 4,
              padding: '14px 16px',
              background: 'rgba(49,130,246,0.06)',
              borderRadius: 14,
            }}
          >
            <div
              className="t-caption"
              style={{ color: '#3182F6', fontWeight: 600 }}
            >
              합계
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                marginTop: 2,
                letterSpacing: '-0.02em',
              }}
            >
              {fmtKRWLong(total)}
            </div>
          </div>
          <button
            className="btn btn-ghost"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => setDetail(false)}
          >
            총액으로 돌아가기
          </button>
        </div>
      )}
    </StepShell>
  )
}

function Step2({ data, patchData, onNext, onBack }: StepProps) {
  const [detail, setDetail] = useState(false)
  const presets = [100, 150, 200, 300]
  return (
    <StepShell
      step={2}
      total={5}
      onBack={onBack}
      onNext={onNext}
      title="매달 얼마를 모을 수 있나요?"
      subtitle="실제로 저축 가능한 금액 기준으로 알려주세요."
    >
      <div className="col gap-12">
        <div className="t-tag">월 저축액</div>
        <MoneyInput
          value={data.monthlySaving}
          onChange={(v) => patchData({ monthlySaving: v })}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          {presets.map((p) => (
            <button
              key={p}
              className="chip"
              data-on={data.monthlySaving === p ? '1' : '0'}
              onClick={() => patchData({ monthlySaving: p })}
            >
              {p}만
            </button>
          ))}
        </div>
        <button
          className="btn btn-ghost"
          style={{ alignSelf: 'flex-start', marginTop: 4 }}
          onClick={() => setDetail(!detail)}
        >
          {detail ? '간단히 입력하기' : '월 소득과 지출도 입력하기'}{' '}
          <Icons.Chevron s={14} c="#3182F6" dir={detail ? 'up' : 'right'} />
        </button>

        {detail && (
          <div className="col gap-16" style={{ marginTop: 8 }}>
            <div className="col gap-8">
              <div className="t-tag">월 소득</div>
              <MoneyInput
                value={data.monthlyIncome}
                onChange={(v) => patchData({ monthlyIncome: v })}
              />
            </div>
            <div className="col gap-8">
              <div className="t-tag">월 지출</div>
              <MoneyInput
                value={data.monthlyExpense}
                onChange={(v) => patchData({ monthlyExpense: v })}
              />
            </div>
          </div>
        )}
      </div>
    </StepShell>
  )
}

function Step3({ data, patchData, onNext, onBack }: StepProps) {
  const popular = [
    '강남구',
    '마포구',
    '노원구',
    '관악구',
    '성동구',
    '서초구',
    '송파구',
    '용산구',
  ]
  const [showAll, setShowAll] = useState(false)
  const [query, setQuery] = useState('')
  const filtered = useMemo<readonly string[]>(() => {
    const q = query.trim()
    if (!q) return SEOUL_DISTRICTS
    return SEOUL_DISTRICTS.filter((d) => d.includes(q))
  }, [query])
  const visible = showAll ? filtered : popular

  const areas = [18, 25, 30, 34]
  const pricePresets = [60000, 80000, 100000, 120000, 150000, 200000]
  const { snapshot } = useMarketSnapshot()
  const livePrice = priceFromSnapshot(snapshot, data.goalDistrict)
  const suggested = suggestPriceWithSnapshot(
    data.goalDistrict,
    data.goalArea,
    livePrice,
  )
  const isLive = livePrice !== null
  const [customArea, setCustomArea] = useState(false)
  const applySuggested = () => patchData({ goalPriceM: suggested })
  return (
    <StepShell
      step={3}
      total={5}
      onBack={onBack}
      onNext={onNext}
      title="어떤 집을 목표로 하고 있나요?"
      subtitle="지역, 평형, 가격을 입력해주세요."
    >
      <div className="col gap-16">
        <div className="col gap-8">
          <div
            className="row"
            style={{ justifyContent: 'space-between', alignItems: 'center' }}
          >
            <div className="t-tag">희망 지역</div>
            <button
              onClick={() => setShowAll((s) => !s)}
              style={{
                appearance: 'none',
                border: 0,
                background: 'transparent',
                padding: 0,
                fontSize: 12,
                fontWeight: 600,
                color: '#3182F6',
                cursor: 'pointer',
              }}
            >
              {showAll ? '추천 자치구만 보기' : '전체 25개 자치구 보기'}
            </button>
          </div>
          {showAll && (
            <div className="input" style={{ marginBottom: 4 }}>
              <input
                type="text"
                placeholder="자치구 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ fontSize: 15, fontWeight: 500 }}
              />
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {visible.map((d) => (
              <button
                key={d}
                className="chip"
                data-on={data.goalDistrict === d ? '1' : '0'}
                onClick={() => patchData({ goalDistrict: d })}
              >
                {d}
              </button>
            ))}
            {showAll && filtered.length === 0 && (
              <div className="t-caption" style={{ padding: '8px 4px' }}>
                일치하는 자치구가 없어요
              </div>
            )}
          </div>
        </div>
        <div className="col gap-8">
          <div
            className="row"
            style={{ justifyContent: 'space-between', alignItems: 'center' }}
          >
            <div className="t-tag">평형</div>
            <button
              onClick={() => setCustomArea((s) => !s)}
              style={{
                appearance: 'none',
                border: 0,
                background: 'transparent',
                padding: 0,
                fontSize: 12,
                fontWeight: 600,
                color: '#3182F6',
                cursor: 'pointer',
              }}
            >
              {customArea ? '추천 평형 보기' : '직접 입력'}
            </button>
          </div>
          {customArea ? (
            <div className="input">
              <input
                type="text"
                inputMode="numeric"
                value={data.goalArea}
                onChange={(e) => {
                  const n =
                    parseInt(e.target.value.replace(/[^\d]/g, ''), 10) || 0
                  patchData({ goalArea: n })
                }}
              />
              <span className="input-unit">평</span>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {areas.map((a) => (
                <button
                  key={a}
                  className="chip"
                  data-on={data.goalArea === a ? '1' : '0'}
                  onClick={() => patchData({ goalArea: a })}
                >
                  {a}평
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="col gap-8">
          <div
            className="row"
            style={{ justifyContent: 'space-between', alignItems: 'center' }}
          >
            <div className="t-tag">목표 주택 가격</div>
            {suggested > 0 && data.goalPriceM !== suggested && (
              <button
                onClick={applySuggested}
                style={{
                  appearance: 'none',
                  border: 0,
                  background: isLive
                    ? 'rgba(34,150,90,0.12)'
                    : 'rgba(49,130,246,0.10)',
                  padding: '4px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: isLive ? '#1B7B47' : '#3182F6',
                  cursor: 'pointer',
                  borderRadius: 8,
                }}
                title={isLive ? '국토부 실거래 중앙값 기준' : '참고치 기준'}
              >
                <Icons.Sparkles s={11} c={isLive ? '#1B7B47' : '#3182F6'} />{' '}
                {isLive ? '실거래' : '참고'} · {data.goalDistrict}{' '}
                {data.goalArea}평 약 {suggested / 10000}억 적용
              </button>
            )}
          </div>
          <MoneyInput
            value={data.goalPriceM}
            onChange={(v) => patchData({ goalPriceM: v })}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {pricePresets.map((p) => (
              <button
                key={p}
                className="chip"
                data-on={data.goalPriceM === p ? '1' : '0'}
                onClick={() => patchData({ goalPriceM: p })}
              >
                {p / 10000}억
              </button>
            ))}
          </div>
        </div>
      </div>
    </StepShell>
  )
}

interface Step4Props extends StepProps {
  openHelp: (k: HelpTopic) => void
}

function Step4({ data, patchData, onNext, onBack, openHelp }: Step4Props) {
  return (
    <StepShell
      step={4}
      total={5}
      onBack={onBack}
      onNext={onNext}
      title="대출은 어느 정도로 계산할까요?"
      subtitle="LTV·DSR이 어렵다면 기본값 그대로 두어도 괜찮아요."
    >
      <div className="col gap-16">
        <div className="col gap-10">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div
              className="t-tag"
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              LTV
              <button
                onClick={() => openHelp('ltv')}
                style={{
                  appearance: 'none',
                  border: 0,
                  background: 'transparent',
                  padding: 2,
                  color: '#8A98AD',
                  cursor: 'pointer',
                }}
              >
                <Icons.Help s={14} />
              </button>
            </div>
            <div className="t-num-md" style={{ color: '#3182F6' }}>
              {data.ltv}%
            </div>
          </div>
          <Slider
            value={data.ltv}
            min={20}
            max={70}
            step={5}
            onChange={(v) => patchData({ ltv: v })}
          />
        </div>
        <div className="col gap-10">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div
              className="t-tag"
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              DSR
              <button
                onClick={() => openHelp('dsr')}
                style={{
                  appearance: 'none',
                  border: 0,
                  background: 'transparent',
                  padding: 2,
                  color: '#8A98AD',
                  cursor: 'pointer',
                }}
              >
                <Icons.Help s={14} />
              </button>
            </div>
            <div className="t-num-md" style={{ color: '#3182F6' }}>
              {data.dsr}%
            </div>
          </div>
          <Slider
            value={data.dsr}
            min={20}
            max={60}
            step={5}
            onChange={(v) => patchData({ dsr: v })}
          />
        </div>
        <div className="col gap-10">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="t-tag">예상 금리</div>
            <div className="t-num-md" style={{ color: '#3182F6' }}>
              {data.rate.toFixed(1)}%
            </div>
          </div>
          <Slider
            value={data.rate}
            min={2.5}
            max={7}
            step={0.1}
            onChange={(v) => patchData({ rate: Math.round(v * 10) / 10 })}
          />
        </div>
        <div
          style={{
            marginTop: 8,
            padding: '14px 16px',
            background: 'rgba(255,209,102,0.18)',
            borderRadius: 14,
          }}
        >
          <div className="t-caption" style={{ color: '#946100' }}>
            실제 대출 한도는 금융기관 심사에 따라 달라질 수 있어요.
          </div>
        </div>
      </div>
    </StepShell>
  )
}

interface Step5Props {
  data: SimulationData
  patchData: (patch: Partial<SimulationData>) => void
  onDone: () => void
  onBack: () => void
}

const SCENARIO_PRESETS: Record<ScenarioKey, { growth: number; returnRate: number }> = {
  safe: { growth: 4.5, returnRate: 2.5 },
  base: { growth: 3.0, returnRate: 4.0 },
  bold: { growth: 2.2, returnRate: 5.5 },
}

function Step5({ data, patchData, onDone, onBack }: Step5Props) {
  const [preset, setPreset] = useState<ScenarioKey>('base')
  const apply = (k: ScenarioKey) => {
    setPreset(k)
    patchData(SCENARIO_PRESETS[k])
  }
  return (
    <StepShell
      step={5}
      total={5}
      onBack={onBack}
      onNext={onDone}
      ctaLabel="결과 보기"
      title="앞으로의 변화를 어떻게 가정할까요?"
      subtitle="시장 가정에 따라 결과가 달라져요. 나중에 결과 화면에서 바꿀 수도 있어요."
    >
      <div className="col gap-16">
        <ScenarioSeg value={preset} onChange={apply} />
        <div className="card" style={{ padding: '14px 16px' }}>
          <div className="t-caption">{SCENARIOS[preset].sub}</div>
        </div>
        <div className="col gap-10" style={{ marginTop: 4 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="t-tag">집값 상승률</div>
            <div className="t-num-md" style={{ color: '#3182F6' }}>
              {data.growth.toFixed(1)}%
            </div>
          </div>
          <Slider
            value={data.growth}
            min={0}
            max={8}
            step={0.1}
            onChange={(v) => patchData({ growth: Math.round(v * 10) / 10 })}
          />
        </div>
        <div className="col gap-10">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="t-tag">투자 수익률</div>
            <div className="t-num-md" style={{ color: '#3182F6' }}>
              {data.returnRate.toFixed(1)}%
            </div>
          </div>
          <Slider
            value={data.returnRate}
            min={0}
            max={10}
            step={0.1}
            onChange={(v) => patchData({ returnRate: Math.round(v * 10) / 10 })}
          />
        </div>
      </div>
    </StepShell>
  )
}

export function Wizard() {
  const data = useAppStore((s) => s.data)
  const patchData = useAppStore((s) => s.patchData)
  const step = useAppStore((s) => s.wizardStep)
  const setWizardStep = useAppStore((s) => s.setWizardStep)
  const setScreen = useAppStore((s) => s.setScreen)
  const setCalculating = useAppStore((s) => s.setCalculating)
  const openHelp = useAppStore((s) => s.openHelp)

  const goNext = () => {
    if (step === 1) setWizardStep(2)
    else if (step === 2) setWizardStep(3)
    else if (step === 3) setWizardStep(4)
    else if (step === 4) setWizardStep(5)
  }
  const goBack = () => {
    if (step === 1) setScreen('welcome')
    else if (step === 2) setWizardStep(1)
    else if (step === 3) setWizardStep(2)
    else if (step === 4) setWizardStep(3)
    else if (step === 5) setWizardStep(4)
  }
  const onComplete = () => {
    setCalculating(true)
    setScreen('result')
    window.setTimeout(() => setCalculating(false), 1400)
  }

  switch (step) {
    case 1:
      return (
        <Step1 data={data} patchData={patchData} onNext={goNext} onBack={goBack} />
      )
    case 2:
      return (
        <Step2 data={data} patchData={patchData} onNext={goNext} onBack={goBack} />
      )
    case 3:
      return (
        <Step3 data={data} patchData={patchData} onNext={goNext} onBack={goBack} />
      )
    case 4:
      return (
        <Step4
          data={data}
          patchData={patchData}
          onNext={goNext}
          onBack={goBack}
          openHelp={openHelp}
        />
      )
    case 5:
      return (
        <Step5
          data={data}
          patchData={patchData}
          onDone={onComplete}
          onBack={goBack}
        />
      )
    default:
      return null
  }
}
