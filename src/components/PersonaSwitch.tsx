import type { PersonaKey } from '@/types/contracts'

interface Props {
  value: PersonaKey
  onChange: (k: PersonaKey) => void
}

const OPTS: Array<[PersonaKey, string]> = [
  ['early', '초년생'],
  ['mid', '30대'],
  ['senior', '시니어'],
]

export function PersonaSwitch({ value, onChange }: Props) {
  return (
    <div className="persona-switch" role="radiogroup">
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
