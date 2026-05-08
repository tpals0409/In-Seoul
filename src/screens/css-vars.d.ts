/**
 * 인라인 style 에서 CSS custom property (`--pct`, `--track-color` 등) 사용 허용.
 * React 의 CSSProperties 는 닫힌 타입이라 module augmentation 필요.
 */
import 'react'

declare module 'react' {
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined
  }
}
