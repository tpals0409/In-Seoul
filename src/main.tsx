import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import './index.css'
import App from './App'

// iOS WKWebView pinch-zoom 가드 — viewport meta / touch-action / capacitor 설정과 함께
// 4중 가드를 구성한다. iOS 10+ Safari 가 user-scalable=no 를 무시할 수 있어 필요.
const preventGesture = (event: Event) => event.preventDefault()
document.addEventListener('gesturestart', preventGesture, { passive: false })
document.addEventListener('gesturechange', preventGesture, { passive: false })
document.addEventListener('gestureend', preventGesture, { passive: false })

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('root element missing')

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
