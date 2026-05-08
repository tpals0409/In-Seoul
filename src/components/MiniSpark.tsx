export function MiniSpark() {
  return (
    <svg width="100%" viewBox="0 0 320 90" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="ms" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#3182F6" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#3182F6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M8 70 Q 80 60 140 50 T 312 18 L 312 86 L 8 86 Z" fill="url(#ms)" />
      <path
        d="M8 16 Q 80 24 140 32 T 312 60"
        stroke="#A2D2FF"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M8 70 Q 80 60 140 50 T 312 18"
        stroke="#3182F6"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="180" cy="44" r="8" fill="#FFD166" stroke="#fff" strokeWidth="2.5" />
      <circle cx="180" cy="44" r="3" fill="#fff" />
    </svg>
  )
}
