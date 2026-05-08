import type { MouseEvent } from 'react'
import { Icons } from '@/components/Icons'
import { useAppStore } from '@/store/appStore'

export function ResetModal() {
  const open = useAppStore((s) => s.ui.resetOpen)
  const setResetOpen = useAppStore((s) => s.setResetOpen)
  const resetAll = useAppStore((s) => s.resetAll)

  if (!open) return null

  const onClose = () => setResetOpen(false)
  const onConfirm = () => {
    resetAll()
  }
  const stop = (e: MouseEvent<HTMLDivElement>) => e.stopPropagation()

  return (
    <div
      className="ai-overlay"
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 90,
        background: 'rgba(11,26,43,0.32)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 24px',
        animation: 'fadeIn 160ms ease-out',
      }}
    >
      <div
        onClick={stop}
        className="card"
        style={{
          width: 'calc(100% - 48px)',
          maxWidth: 340,
          padding: '22px 22px 16px',
          background: 'rgba(255,255,255,0.96)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.95)',
          boxShadow: '0 20px 60px rgba(15,26,43,0.18)',
          borderRadius: 20,
        }}
      >
        <div
          className="dot"
          style={{
            background: 'rgba(255,122,26,0.12)',
            color: '#FF7A1A',
            width: 40,
            height: 40,
            borderRadius: 12,
            marginBottom: 14,
          }}
        >
          <Icons.Lock s={18} c="#FF7A1A" />
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: 'var(--ink)',
            letterSpacing: '-0.02em',
          }}
        >
          입력한 정보를 삭제할까요?
        </div>
        <div
          className="t-body"
          style={{ marginTop: 8, color: 'var(--muted)', lineHeight: 1.55 }}
        >
          삭제하면 이 기기에 저장된 자산, 소득, 목표 조건이 사라져요. 이 작업은 되돌릴 수 없어요.
        </div>
        <div className="row gap-8" style={{ marginTop: 18 }}>
          <button
            onClick={onClose}
            className="btn"
            style={{
              flex: 1,
              background: 'rgba(15,26,43,0.06)',
              color: 'var(--ink)',
              fontWeight: 700,
            }}
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className="btn"
            style={{ flex: 1, background: '#FF7A1A', color: '#fff', fontWeight: 700 }}
          >
            삭제하기
          </button>
        </div>
      </div>
    </div>
  )
}
