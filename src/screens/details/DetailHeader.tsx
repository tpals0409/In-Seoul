import { Icons } from '@/components/Icons'

interface Props {
  title: string
  onBack: () => void
  sub?: string
}

export function DetailHeader({ title, onBack, sub }: Props) {
  return (
    <>
      <div className="app-nav">
        <button className="nav-icon" onClick={onBack}>
          <Icons.Back s={20} />
        </button>
        <div className="t-tag" style={{ color: 'var(--ink)' }}>{title}</div>
        <div style={{ width: 40 }} />
      </div>
      {sub !== undefined && (
        <div className="pad t-caption" style={{ padding: '0 20px 4px' }}>
          {sub}
        </div>
      )}
    </>
  )
}
