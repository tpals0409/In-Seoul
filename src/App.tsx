import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Icons } from '@/components/Icons'
import { IOSDevice } from '@/components/iosFrame'
import { useAppStore } from '@/store/appStore'
import { Welcome } from '@/screens/Welcome'
import { Wizard } from '@/screens/wizard/Wizard'
import { Result } from '@/screens/Result'
import { GoldenDetail } from '@/screens/details/GoldenDetail'
import { ActionGuide } from '@/screens/details/ActionGuide'
import { RiskCheck } from '@/screens/details/RiskCheck'
import { CalcDetail } from '@/screens/details/CalcDetail'
import { SteppingStone } from '@/screens/SteppingStone'
import { ScenarioEdit } from '@/screens/ScenarioEdit'
import { AiSheet } from '@/screens/sheets/AiSheet'
import { HelpSheet } from '@/screens/sheets/HelpSheet'
import { ResetModal } from '@/screens/sheets/ResetModal'
import { TweaksPanel } from '@/dev/TweaksPanel'
import { AdvisorProvider } from '@/ai/AdvisorContext'

const FAB_SCREENS = new Set(['result', 'golden', 'action', 'risk', 'calc'])

function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(query)
    const handler = (e: MediaQueryListEvent) => setMatch(e.matches)
    setMatch(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [query])
  return match
}

function ScreenBody() {
  const screen = useAppStore((s) => s.screen)
  switch (screen) {
    case 'welcome':
      return <Welcome />
    case 'wizard':
      return <Wizard />
    case 'result':
      return <Result />
    case 'golden':
      return <GoldenDetail />
    case 'action':
      return <ActionGuide />
    case 'risk':
      return <RiskCheck />
    case 'calc':
      return <CalcDetail />
    case 'stepping':
      return <SteppingStone />
    case 'scenario-edit':
      return <ScenarioEdit />
    default:
      return null
  }
}

function CalculatingOverlay() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 80,
        background:
          'linear-gradient(180deg, rgba(245,250,255,0.96) 0%, rgba(225,239,255,0.96) 100%)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        animation: 'fadeIn 200ms ease-out',
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 18,
          background: 'linear-gradient(135deg, #3182F6, #6FA8FF)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 12px 40px rgba(49,130,246,0.35)',
          animation: 'fadeIn 600ms ease-out',
        }}
      >
        <Icons.Sparkles s={26} c="#fff" />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontSize: 17,
            fontWeight: 800,
            color: 'var(--ink)',
            letterSpacing: '-0.02em',
          }}
        >
          입력값으로 예상 시점을 계산하고 있어요
        </div>
        <div className="t-caption" style={{ marginTop: 6 }}>
          자산 성장과 집값 상승을 240개월 시뮬레이션 중…
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: 8,
              background: '#3182F6',
              animation: `dotPulse 1s ${i * 0.15}s infinite ease-in-out`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

function AppShell() {
  const screen = useAppStore((s) => s.screen)
  const aiOpen = useAppStore((s) => s.ui.aiOpen)
  const calculating = useAppStore((s) => s.ui.calculating)
  const openAi = useAppStore((s) => s.openAi)

  const showFab = FAB_SCREENS.has(screen) && !aiOpen

  return (
    <div className="app">
      <div className="app-bg" />
      <div className="app-scroll">
        <ScreenBody />
      </div>
      {calculating && <CalculatingOverlay />}

      {showFab && (
        <button
          className="ai-fab"
          onClick={() => {
            const ctx =
              screen === 'result' ||
              screen === 'golden' ||
              screen === 'action' ||
              screen === 'risk' ||
              screen === 'calc'
                ? screen
                : 'general'
            openAi(ctx)
          }}
          aria-label="AI"
        >
          <Icons.Sparkles s={20} c="#fff" />
        </button>
      )}

      <AiSheet />
      <HelpSheet />
      <ResetModal />
    </div>
  )
}

export default function App() {
  const isMobile = useMediaQuery('(max-width: 480px)')
  const isNative = Capacitor.isNativePlatform()

  if (isNative || isMobile) {
    return (
      <AdvisorProvider>
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: '#F2F2F7',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
            paddingLeft: 'env(safe-area-inset-left)',
            paddingRight: 'env(safe-area-inset-right)',
          }}
        >
          <AppShell />
        </div>
        <TweaksPanel />
      </AdvisorProvider>
    )
  }

  return (
    <AdvisorProvider>
      <div className="page">
        <IOSDevice width={402} height={874} homeIndicator>
          <AppShell />
        </IOSDevice>
        <TweaksPanel />
      </div>
    </AdvisorProvider>
  )
}
