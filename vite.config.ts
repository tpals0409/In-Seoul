import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

/**
 * Production build 시 `VITE_LLM_BACKEND` 가 명시 설정됐는지 fail-fast.
 *
 * Sprint 7 Finding 5 회귀 방지:
 * `VITE_LLM_BACKEND` 미설정으로 useLLM 이 'none' 백엔드로 떨어져 모든 AI 응답이
 * template fallback 되는 결함을 빌드 시점에 차단한다.
 *
 * `apply: 'build'` 로 dev 서버/vitest 에는 영향 없음.
 */
function assertLlmBackend(): Plugin {
  return {
    name: 'inseoul:assert-llm-backend',
    apply: 'build',
    config(_, { mode }) {
      const env = loadEnv(mode, process.cwd(), '')
      const raw = env['VITE_LLM_BACKEND']
      const allowed = ['ollama', 'mediapipe', 'none'] as const
      if (!allowed.includes(raw as (typeof allowed)[number])) {
        const display = raw === undefined || raw === '' ? '<unset>' : JSON.stringify(raw)
        throw new Error(
          `[assert-llm-backend] VITE_LLM_BACKEND must be one of ${JSON.stringify(allowed)} ` +
            `for production build. 현재: ${display}. ` +
            `해결: \`.env.production\` 의 \`VITE_LLM_BACKEND\` 값을 확인하거나, ` +
            `빌드 환경 (CI/dashboard) 에 VITE_LLM_BACKEND 를 주입하세요. ` +
            `(Sprint 7 Finding 5 회귀 방지 — Sprint 8 task-1.)`,
        )
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), assertLlmBackend()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  worker: {
    format: 'es',
  },
})
