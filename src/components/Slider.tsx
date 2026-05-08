import { useRef, type PointerEvent } from 'react'

interface Props {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
}

export function Slider({ value, min, max, step = 1, onChange }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const pct = ((value - min) / (max - min)) * 100

  const apply = (clientX: number) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    const raw = min + x * (max - min)
    const snapped = Math.round(raw / step) * step
    onChange(Math.max(min, Math.min(max, snapped)))
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    apply(e.clientX)
    const move = (ev: globalThis.PointerEvent) => apply(ev.clientX)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="slider-track" ref={ref} onPointerDown={onPointerDown}>
      <div className="slider-rail">
        <div className="slider-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="slider-thumb" style={{ left: `${pct}%` }} />
    </div>
  )
}
