import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Production build 시 `VITE_LLM_BACKEND` 가 명시 설정됐는지 fail-fast.
 *
 * Sprint 7 Finding 5 회귀 방지:
 * `VITE_LLM_BACKEND` 미설정으로 useLLM 이 'none' 백엔드로 떨어져 모든 AI 응답이
 * template fallback 되는 결함을 빌드 시점에 차단한다.
 *
 * 적용 범위:
 *   - `apply: 'build'` → dev 서버/vitest 미적용.
 *   - `mode !== 'production'` 인 빌드 (예: `vite build --mode development`,
 *     storybook 빌드 등) 도 스킵. assertion 의 목적은 *production 산출물* 의
 *     무결성이며, dev/preview 빌드를 깨뜨리면 안 된다 (R3 fix).
 */
function assertLlmBackend(): Plugin {
  return {
    name: 'inseoul:assert-llm-backend',
    apply: 'build',
    config(_, { mode }) {
      if (mode !== 'production') return
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

/**
 * Production build 시 `dist/wasm/` 에 MediaPipe wasm 6 파일이 복사됐는지 fail-fast.
 *
 * Sprint 12 task-1 회귀 방지:
 * `prebuild` lifecycle hook 이 우회되거나 (`vite build` 직접 호출 등) `public/wasm/`
 * 가 비어 있으면 dist 번들에 wasm 0개로 떨어져 런타임이 jsdelivr CDN fallback 시도 →
 * Sprint 10 의 "ModuleFactory not set" 회귀로 silent fail. closeBundle 시점에
 * dist/wasm/ 의 6 파일 존재를 확인해 빌드 시점에 차단한다.
 *
 * 적용 범위:
 *   - `apply: 'build'` → dev 서버/vitest 미적용.
 *   - `mode === 'production'` 만 검증 — dev/preview 빌드 (storybook 등) 는 스킵.
 *
 * `options.distDir` 는 단위 테스트용 — 미지정 시 cwd/dist/wasm 사용.
 */
export function assertWasmCopied(options: { distDir?: string } = {}): Plugin {
  const required = [
    'genai_wasm_internal.js',
    'genai_wasm_internal.wasm',
    'genai_wasm_module_internal.js',
    'genai_wasm_module_internal.wasm',
    'genai_wasm_nosimd_internal.js',
    'genai_wasm_nosimd_internal.wasm',
  ]
  let modeRef: string | undefined
  return {
    name: 'inseoul:assert-wasm-copied',
    apply: 'build',
    config(_, { mode }) {
      modeRef = mode
    },
    closeBundle() {
      if (options.distDir === undefined && modeRef !== 'production') return
      const distDir = options.distDir ?? path.resolve(process.cwd(), 'dist', 'wasm')
      const missing = required.filter((f) => !fs.existsSync(path.join(distDir, f)))
      if (missing.length > 0) {
        throw new Error(
          `[assert-wasm-copied] dist/wasm/ 누락 (${missing.length}/${required.length}): ` +
            `${missing.join(', ')}. ` +
            `prebuild 가 실행되지 않았거나 \`vite build\` 가 lifecycle hook 을 우회한 가능성. ` +
            `해결: \`bash scripts/copy-mediapipe-wasm.sh\` 또는 \`npm run build\` 재실행. ` +
            `(Sprint 12 task-1 회귀 방지.)`,
        )
      }
    },
  }
}

// `vite.config.ts` 가 vitest 의 모듈 로더에서 import 되면 `import.meta.url` 이
// file: 스킴이 아닐 수 있어 `fileURLToPath` 가 throw 한다 (assertWasmCopied 단위
// 테스트 사례). 빌드 시에는 정상 동작, 단위 테스트 시 process.cwd() 로 fallback.
function resolveSrcAlias(): string {
  try {
    return fileURLToPath(new URL('./src', import.meta.url))
  } catch {
    return path.resolve(process.cwd(), 'src')
  }
}

export default defineConfig({
  plugins: [react(), assertLlmBackend(), assertWasmCopied()],
  resolve: {
    alias: {
      '@': resolveSrcAlias(),
    },
  },
  worker: {
    format: 'es',
  },
})
