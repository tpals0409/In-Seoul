import type { ScenarioKey } from '@/types/contracts'

interface Props {
  value: ScenarioKey
  onChange: (k: ScenarioKey) => void
}

const OPTS: Array<[ScenarioKey, string]> = [
  ['safe', '안정'],
  ['base', '기준'],
  ['bold', '적극'],
]

export function ScenarioSeg({ value, onChange }: Props) {
  const idx = OPTS.findIndex((o) => o[0] === value)
  return (
    <div className="seg" role="radiogroup">
      <div
        className="seg-thumb"
        style={{
          left: `calc(4px + ${idx} * (100% - 8px) / 3)`,
          width: 'calc((100% - 8px) / 3)',
        }}
      />
      {OPTS.map(([k, l]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={k === value}
          onClick={() => onChange(k)}
        >
          {l}
        </button>
      ))}
    </div>
  )
}
