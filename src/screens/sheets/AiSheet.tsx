import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react'
import type {
  AdvisorContext as AdvisorCtx,
  AiContext,
  ChatMsg,
  ScenarioKey,
  Screen,
  SimulationData,
} from '@/types/contracts'
import { Icons } from '@/components/Icons'
import { SCENARIOS } from '@/data/scenarios'
import {
  fmtKRW,
  fmtYearMonth,
  simulate,
  totalAssetsMan,
} from '@/lib/sim'
import { useAppStore } from '@/store/appStore'
import { useAdvisorContext } from '@/ai/hooks/useAdvisorContext'
import { isOnDeviceLlm } from '@/ai/hooks/useLLM'
import { useMarketSnapshot } from '@/data/useMarketSnapshot'

type SheetMsg = ChatMsg | { id: string; role: 'context'; content: '' }

interface ContextChipsProps {
  data: SimulationData
  scenario: ScenarioKey
}

function ContextChips({ data, scenario }: ContextChipsProps) {
  const r = simulate(data, scenario)
  const total = totalAssetsMan(data)
  const chips: ReadonlyArray<{ icon: string; label: string }> = [
    { icon: '📍', label: `${data.goalDistrict} ${data.goalArea}평` },
    { icon: '🎯', label: fmtKRW(data.goalPriceM) },
    { icon: '💰', label: `자산 ${fmtKRW(total)}` },
    { icon: '📈', label: `월 ${data.monthlySaving}만 저축` },
    { icon: '⚖️', label: `${SCENARIOS[scenario].label} 시나리오` },
    { icon: '⏱', label: `결과 ${fmtYearMonth(r.months)}` },
  ]
  return (
    <div className="col gap-8" style={{ padding: '4px 0 8px' }}>
      <div
        className="t-caption"
        style={{ fontSize: 11, color: 'var(--muted)' }}
      >
        아래 조건을 참고해 답변해드려요
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {chips.map((c) => (
          <span
            key={c.label}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '5px 10px',
              borderRadius: 999,
              background: 'rgba(49,130,246,0.08)',
              border: '1px solid rgba(49,130,246,0.18)',
              fontSize: 11.5,
              fontWeight: 600,
              color: '#0E4A9F',
              letterSpacing: '-0.005em',
            }}
          >
            <span style={{ fontSize: 11 }}>{c.icon}</span>
            {c.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function greeting(data: SimulationData, scenario: ScenarioKey): string {
  const r = simulate(data, scenario)
  return `안녕하세요. ${data.goalDistrict} ${data.goalArea}평 기준 ${SCENARIOS[scenario].label} 시나리오로 약 ${fmtYearMonth(r.months)} 뒤 진입이 예상돼요. 무엇이 궁금하세요?`
}

interface LlmStatusBadgeProps {
  status: import('@/types/contracts').LLMStatus
  progress?: number | undefined
  /** false 면 호스트가 외부 — "온디바이스" 라고 표기하지 않고 경고 톤으로 바꾼다. */
  onDevice: boolean
}

/** 사용자에게 현재 추론 모드/진행률을 보여주는 작은 배지.
 *  unsupported / idle / error 가 모두 같은 "템플릿 모드"로 보이지 않도록
 *  원인을 짧게 분리해서 표기한다. */
function LlmStatusBadge({ status, progress, onDevice }: LlmStatusBadgeProps) {
  let label: string
  let color: string
  switch (status) {
    case 'ready':
      label = onDevice ? '온디바이스 AI' : '⚠️ 원격 LLM 사용 중'
      color = onDevice ? 'rgba(34,150,90,0.14)' : 'rgba(231,111,81,0.20)'
      break
    case 'generating':
      label = '응답 생성 중'
      color = 'rgba(49,130,246,0.14)'
      break
    case 'downloading':
      label = `모델 다운로드 ${progress !== undefined ? Math.round(progress * 100) : 0}%`
      color = 'rgba(244,162,97,0.18)'
      break
    case 'loading':
      label = '모델 로드 중'
      color = 'rgba(49,130,246,0.14)'
      break
    case 'error':
      label = '오류 — 템플릿 답변 사용 중'
      color = 'rgba(231,111,81,0.14)'
      break
    case 'unsupported':
      label = '이 기기는 템플릿 모드'
      color = 'rgba(244,162,97,0.18)'
      break
    case 'idle':
    default:
      label = '템플릿 모드'
      color = 'rgba(15,26,43,0.06)'
      break
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        background: color,
        fontSize: 10.5,
        fontWeight: 700,
        color: 'var(--ink-2)',
        letterSpacing: '-0.005em',
      }}
    >
      {label}
    </span>
  )
}

let __aiMsgIdCounter = 0
const newId = () => `m${++__aiMsgIdCounter}`

const HINTS: ReadonlyArray<string> = [
  '왜 이 시점이 나왔나요?',
  '저축액을 늘리는 게 가장 효과적일까요?',
  '금리가 오르면 얼마나 부담이 커져요?',
  'LTV가 뭐예요?',
  '계산식을 쉽게 설명해주세요',
]

/** AiContext (UI 트리거) → Screen (도메인 식별자). 컨텍스트 페이로드 빌드용. */
function aiCtxToScreen(ctx: AiContext | null): Screen {
  switch (ctx) {
    case 'welcome':
      return 'welcome'
    case 'result':
      return 'result'
    case 'golden':
      return 'golden'
    case 'action':
      return 'action'
    case 'risk':
      return 'risk'
    case 'calc':
      return 'calc'
    case 'stepping':
      return 'stepping'
    case 'general':
    case 'question':
    case null:
    default:
      return 'result'
  }
}

export function AiSheet() {
  const open = useAppStore((s) => s.ui.aiOpen)
  const prefill = useAppStore((s) => s.ui.aiPrefill)
  if (!open) return null
  // prefill 변경 시(이미 열린 상태에서 다른 컨텍스트로 재호출)에도
  // body 를 새 인스턴스로 mount 하여 msgs/input 을 재초기화한다.
  // open false→true 전환은 부모의 조건부 렌더만으로도 자연스럽게 mount 된다.
  return <AiSheetBody key={prefill || '__no_prefill__'} />
}

function AiSheetBody() {
  const aiCtx = useAppStore((s) => s.ui.aiCtx)
  const prefill = useAppStore((s) => s.ui.aiPrefill)
  const closeAi = useAppStore((s) => s.closeAi)
  const data = useAppStore((s) => s.data)
  const scenario = useAppStore((s) => s.scenario)
  const persona = useAppStore((s) => s.persona)

  const advisor = useAdvisorContext()
  const llmStatus = advisor.state.llm.status
  const llmProgress = advisor.state.llm.progress
  const { snapshot: marketSnapshot } = useMarketSnapshot()

  // body 는 시트가 열릴 때(또는 prefill 변경 시) 새로 mount 되므로
  // 초기 msgs/input 을 lazy initializer 로 한 번만 만든다.
  const [msgs, setMsgs] = useState<SheetMsg[]>(() => [
    { id: newId(), role: 'context', content: '' },
    {
      id: newId(),
      role: 'ai',
      content: greeting(data, scenario),
    },
  ])
  const [input, setInput] = useState<string>(() => prefill || '')
  const [streaming, setStreaming] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const askInFlightRef = useRef<AbortController | null>(null)

  // 시트가 열릴 때(=mount) 모델 ready 시도. 미설정·미지원 환경에선 즉시 거부되어
  // 폴백 모드(템플릿)로 흐른다.
  useEffect(() => {
    advisor.ensureReady().catch(() => {
      /* unsupported / no model URL — handled via state.llm.status */
    })
  }, [advisor])

  // prefill 이 있으면 시트 진입 직후 입력창에 포커스.
  useEffect(() => {
    if (!prefill) return
    const t = window.setTimeout(() => inputRef.current?.focus(), 320)
    return () => window.clearTimeout(t)
  }, [prefill])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [msgs, streaming])

  // 시트가 닫히면(body unmount) in-flight 토큰 스트림 폐기.
  // streaming 상태는 컴포넌트와 함께 사라지므로 별도 세팅 불필요.
  useEffect(() => {
    return () => {
      askInFlightRef.current?.abort()
      askInFlightRef.current = null
    }
  }, [])

  const ask = async (q: string) => {
    if (!q || streaming) return

    const userMsg: SheetMsg = { id: newId(), role: 'user', content: q }
    const streamId = newId()
    setMsgs((m) => [
      ...m,
      userMsg,
      { id: streamId, role: 'ai-stream', content: '', streaming: true },
    ])
    setInput('')
    setStreaming(true)

    const ctrl = new AbortController()
    askInFlightRef.current?.abort()
    askInFlightRef.current = ctrl

    const goalSnap = marketSnapshot?.snapshots.find(
      (s) => s.district === data.goalDistrict,
    )
    const ctx: AdvisorCtx = {
      screen: aiCtxToScreen(aiCtx),
      persona,
      scenarioKey: scenario,
      data,
      sim: simulate(data, scenario),
      recentChat: msgs
        .filter((m): m is ChatMsg => m.role !== 'context')
        .slice(-4),
      ...(goalSnap && marketSnapshot
        ? {
            marketReference: {
              district: goalSnap.district,
              medianPrice: goalSnap.price,
              medianJeonse: goalSnap.jeonsePrice,
              asOf: marketSnapshot.builtAt,
            },
          }
        : {}),
    }

    let accumulated = ''
    try {
      for await (const chunk of advisor.ask(q, ctx, ctrl.signal)) {
        if (ctrl.signal.aborted) return
        accumulated += chunk
        setMsgs((m) =>
          m.map((msg) =>
            msg.id === streamId ? { ...msg, content: accumulated } : msg,
          ),
        )
      }
    } catch {
      // useAdvisor 가 폴백 처리하므로 일반적으로 throw 하지 않음. 안전망.
    } finally {
      if (!ctrl.signal.aborted) {
        setMsgs((m) =>
          m.map((msg) =>
            msg.id === streamId
              ? { id: msg.id, role: 'ai', content: accumulated }
              : msg,
          ),
        )
        setStreaming(false)
      }
      if (askInFlightRef.current === ctrl) askInFlightRef.current = null
    }
  }

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) =>
    setInput(e.target.value)
  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') void ask(input)
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={closeAi} />
      <div className="sheet" style={{ height: '78%' }}>
        <div className="sheet-handle" />
        <div
          className="row"
          style={{ padding: '4px 20px 12px', justifyContent: 'space-between' }}
        >
          <div className="row gap-8">
            <div
              className="dot"
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: 'linear-gradient(135deg,#3182F6,#6FA8FF)',
                color: '#fff',
              }}
            >
              <Icons.Sparkles s={16} />
            </div>
            <div className="col">
              <div className="row gap-6" style={{ alignItems: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>AI 어드바이저</div>
                <LlmStatusBadge
                  status={llmStatus}
                  progress={llmProgress}
                  onDevice={isOnDeviceLlm()}
                />
              </div>
              <div className="t-caption" style={{ fontSize: 11 }}>
                현재 결과 기준으로 답해드려요
              </div>
            </div>
          </div>
          <button className="nav-icon" onClick={closeAi}>
            <Icons.Close />
          </button>
        </div>
        <div className="hair" />
        <div
          ref={scrollRef}
          style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}
        >
          <div className="col gap-12">
            {msgs.map((m) => {
              if (m.role === 'context') {
                return (
                  <ContextChips key={m.id} data={data} scenario={scenario} />
                )
              }
              const isUser = m.role === 'user'
              const isStream = m.role === 'ai-stream'
              return (
                <div
                  key={m.id}
                  className="row"
                  style={{
                    justifyContent: isUser ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={{
                      maxWidth: '82%',
                      padding: '12px 14px',
                      borderRadius: isUser
                        ? '16px 16px 4px 16px'
                        : '4px 16px 16px 16px',
                      background: isUser ? '#3182F6' : '#F1F5FB',
                      color: isUser ? '#fff' : 'var(--ink)',
                      fontSize: 14,
                      lineHeight: 1.55,
                      letterSpacing: '-0.005em',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {m.content}
                    {isStream && <span style={{ opacity: 0.6 }}>▍</span>}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="col gap-8" style={{ marginTop: 16 }}>
            <div className="t-caption" style={{ fontSize: 11 }}>
              이런 질문은 어떠세요?
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {HINTS.map((h) => (
                <button
                  key={h}
                  className="ai-chip"
                  onClick={() => {
                    setInput(h)
                    inputRef.current?.focus()
                  }}
                  disabled={streaming}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div
          style={{
            padding: '10px 16px 24px',
            borderTop: '0.5px solid var(--hair-2)',
            background: 'rgba(255,255,255,0.85)',
          }}
        >
          <div
            className="row gap-8"
            style={{
              background: '#F1F5FB',
              borderRadius: 14,
              padding: '6px 6px 6px 14px',
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={onInputChange}
              placeholder="궁금한 점을 입력해주세요"
              onKeyDown={onInputKey}
              style={{
                flex: 1,
                border: 0,
                background: 'transparent',
                outline: 'none',
                fontSize: 14,
                fontFamily: 'inherit',
                padding: '8px 0',
                color: 'var(--ink)',
              }}
            />
            <button
              onClick={() => void ask(input)}
              disabled={!input || streaming}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: 0,
                background: input && !streaming ? '#3182F6' : '#C9D7E8',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icons.ArrowRight s={14} c="#fff" />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
