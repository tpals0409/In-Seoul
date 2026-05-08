import { useAppStore } from '@/store/appStore'
import type { PersonaKey, ScenarioKey, Screen } from '@/types/contracts'

/**
 * 개발용 인스펙터 — 페르소나 / 시나리오 / 화면을 즉시 전환.
 * 프로덕션 빌드(import.meta.env.DEV === false)에서는 App.tsx 가 마운트하지 않는다.
 */
export function TweaksPanel() {
  const persona = useAppStore((s) => s.persona)
  const scenario = useAppStore((s) => s.scenario)
  const screen = useAppStore((s) => s.screen)
  const setPersona = useAppStore((s) => s.setPersona)
  const setScenario = useAppStore((s) => s.setScenario)
  const setScreen = useAppStore((s) => s.setScreen)

  const personas: PersonaKey[] = ['early', 'mid', 'senior']
  const scenarios: ScenarioKey[] = ['safe', 'base', 'bold']
  const screens: Screen[] = [
    'welcome',
    'wizard',
    'result',
    'golden',
    'action',
    'risk',
    'calc',
    'stepping',
    'scenario-edit',
  ]

  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 1000,
        background: 'rgba(11,26,43,0.92)',
        color: '#fff',
        padding: 12,
        borderRadius: 12,
        fontFamily: 'monospace',
        fontSize: 11,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minWidth: 220,
        boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ opacity: 0.6, fontWeight: 700 }}>DEV TWEAKS</div>
      <Row label="persona">
        {personas.map((k) => (
          <PillBtn key={k} active={persona === k} onClick={() => setPersona(k)}>
            {k}
          </PillBtn>
        ))}
      </Row>
      <Row label="scenario">
        {scenarios.map((k) => (
          <PillBtn key={k} active={scenario === k} onClick={() => setScenario(k)}>
            {k}
          </PillBtn>
        ))}
      </Row>
      <Row label="screen">
        <select
          value={screen}
          onChange={(e) => setScreen(e.target.value as Screen)}
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.08)',
            color: '#fff',
            border: 'none',
            padding: '4px 6px',
            borderRadius: 6,
            fontFamily: 'monospace',
            fontSize: 11,
          }}
        >
          {screens.map((s) => (
            <option key={s} value={s} style={{ background: '#0B1A2B' }}>
              {s}
            </option>
          ))}
        </select>
      </Row>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <span style={{ width: 60, opacity: 0.5 }}>{label}</span>
      <div style={{ display: 'flex', gap: 4, flex: 1 }}>{children}</div>
    </div>
  )
}

function PillBtn({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? '#3182F6' : 'rgba(255,255,255,0.08)',
        color: '#fff',
        border: 'none',
        padding: '3px 8px',
        borderRadius: 6,
        fontFamily: 'monospace',
        fontSize: 11,
        cursor: 'pointer',
        flex: 1,
      }}
    >
      {children}
    </button>
  )
}
