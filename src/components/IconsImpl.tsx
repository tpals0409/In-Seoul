interface IconProps {
  s?: number
  c?: string
}

interface ChevronProps extends IconProps {
  dir?: 'right' | 'down' | 'left' | 'up'
}

export const Back = ({ s = 22, c = 'currentColor' }: IconProps) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="M15 5l-7 7 7 7" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const Close = ({ s = 20, c = 'currentColor' }: IconProps) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="M6 6l12 12M18 6l-12 12" stroke={c} strokeWidth="2.2" strokeLinecap="round" />
  </svg>
)

export const Help = ({ s = 18, c = 'currentColor' }: IconProps) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.7" />
    <path
      d="M9.5 9.5c0-1.4 1.1-2.5 2.5-2.5s2.5 1.1 2.5 2.5c0 1.5-2.5 1.8-2.5 3.5"
      stroke={c}
      strokeWidth="1.7"
      strokeLinecap="round"
    />
    <circle cx="12" cy="16.5" r="1" fill={c} />
  </svg>
)

export const Lock = ({ s = 14, c = 'currentColor' }: IconProps) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <rect x="5" y="11" width="14" height="9" rx="2" stroke={c} strokeWidth="1.7" />
    <path d="M8 11V8a4 4 0 018 0v3" stroke={c} strokeWidth="1.7" />
  </svg>
)

export const Sparkles = ({ s = 16, c = 'currentColor' }: IconProps) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={c}>
    <path d="M12 2l1.6 4.4L18 8l-4.4 1.6L12 14l-1.6-4.4L6 8l4.4-1.6L12 2z" />
    <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" opacity="0.7" />
  </svg>
)

export const ArrowRight = ({ s = 16, c = 'currentColor' }: IconProps) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="M5 12h14M13 6l6 6-6 6" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const Chevron = ({ s = 16, c = 'currentColor', dir = 'right' }: ChevronProps) => {
  const r = { right: 0, down: 90, left: 180, up: 270 }[dir]
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      style={{ transform: `rotate(${r}deg)` }}
    >
      <path
        d="M9 6l6 6-6 6"
        stroke={c}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export const Spark = ({ s = 18 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="M5 13l4 4L19 7" stroke="#1B7B47" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
