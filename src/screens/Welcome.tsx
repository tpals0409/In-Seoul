import { Icons } from '@/components/Icons'
import { MiniSpark } from '@/components/MiniSpark'
import { useAppStore } from '@/store/appStore'

const FEATURES: ReadonlyArray<readonly [string, string]> = [
  ['보수·기준·적극', '시나리오별 진입 시점을 비교해요'],
  ['병목 변수', '가장 영향 큰 변수와 단축 효과를 보여줘요'],
  ['리스크 체크', '구매 후 부담도 함께 확인해요'],
]

export function Welcome() {
  const setScreen = useAppStore((s) => s.setScreen)
  const setWizardStep = useAppStore((s) => s.setWizardStep)

  const onStart = () => {
    setWizardStep(1)
    setScreen('wizard')
  }

  return (
    <div className="screen col" style={{ padding: '40px 20px 120px', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
        <div
          className="ai-chip"
          style={{
            pointerEvents: 'none',
            color: 'var(--ink-2)',
            borderColor: 'rgba(15,26,43,0.10)',
          }}
        >
          <Icons.Lock s={13} c="#5B6B82" /> 입력 정보는 이 기기에만 저장돼요
        </div>
      </div>

      <div
        className="card"
        style={{
          marginTop: 14,
          padding: '14px 16px',
          background: 'rgba(255,255,255,0.6)',
          borderColor: 'rgba(49,130,246,0.12)',
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
        }}
      >
        <div
          className="dot"
          style={{
            background: 'rgba(49,130,246,0.10)',
            color: '#3182F6',
            width: 32,
            height: 32,
            borderRadius: 9,
          }}
        >
          <Icons.Lock s={15} c="#3182F6" />
        </div>
        <div className="col" style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--ink)',
              letterSpacing: '-0.01em',
            }}
          >
            Local-First 데이터
          </div>
          <div className="t-caption" style={{ marginTop: 2, lineHeight: 1.5 }}>
            자산·소득 같은 민감한 정보는 서버로 보내지 않고 이 기기에만 저장돼요. 언제든 결과 화면에서 삭제할 수 있어요.
          </div>
        </div>
      </div>

      <div className="col gap-12" style={{ marginTop: 32 }}>
        <div className="t-eyebrow" style={{ color: '#3182F6' }}>
          InSeoul · 서울 내 집 마련 시뮬레이터
        </div>
        <div
          style={{
            fontSize: 30,
            fontWeight: 800,
            letterSpacing: '-0.025em',
            lineHeight: 1.2,
            color: 'var(--ink)',
          }}
        >
          서울 내 집 마련,{' '}
          <span
            style={{
              background: 'linear-gradient(90deg, #3182F6 0%, #6FA8FF 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            언제 가능할지
          </span>{' '}
          계산해볼까요?
        </div>
        <div className="t-body" style={{ color: 'var(--muted)' }}>
          자산, 저축액, 목표 지역을 입력하면 내 조건에 맞는 예상 진입 시점을 보여드려요.
        </div>
      </div>

      <div className="sample-glass" style={{ marginTop: 28 }}>
        <div className="t-tag" style={{ color: '#3182F6' }}>예시 결과</div>
        <div
          style={{
            marginTop: 6,
            fontSize: 17,
            fontWeight: 700,
            color: 'var(--ink)',
            letterSpacing: '-0.01em',
          }}
        >
          서울 목표 아파트까지
        </div>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span className="t-num-hero" style={{ fontSize: 34 }}>약 4년 2개월</span>
          <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 600 }}>남았어요</span>
        </div>
        <div style={{ marginTop: 14, marginBottom: 4 }}>
          <MiniSpark />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <span style={{ width: 8, height: 8, background: '#FFD166', borderRadius: 4 }} />
          <span className="t-caption">내 자산과 목표 집값이 만나는 시점</span>
        </div>
      </div>

      <div className="col gap-12" style={{ marginTop: 24 }}>
        {FEATURES.map(([h, b], i) => (
          <div key={h} className="row gap-12" style={{ alignItems: 'flex-start' }}>
            <div
              className="dot"
              style={{
                background: 'rgba(49,130,246,0.10)',
                color: '#3182F6',
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              {i + 1}
            </div>
            <div className="col" style={{ paddingTop: 2 }}>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: 'var(--ink)',
                  letterSpacing: '-0.01em',
                }}
              >
                {h}
              </div>
              <div className="t-caption" style={{ marginTop: 2 }}>{b}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ height: 16 }} />
      <div
        className="t-caption"
        style={{ textAlign: 'center', padding: '0 20px', marginTop: 16 }}
      >
        본 결과는 입력값과 가정에 따른 참고용 시뮬레이션이에요.
      </div>

      <div className="cta-bar">
        <button
          className="btn btn-primary"
          style={{ width: '100%' }}
          onClick={onStart}
        >
          시작하기
        </button>
      </div>
    </div>
  )
}
