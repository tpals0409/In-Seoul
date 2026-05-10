import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { assertWasmCopied } from '../../vite.config'

/**
 * Sprint 12 task-1: vite plugin 의 closeBundle 검증 로직 단위 테스트.
 *
 * `assertWasmCopied` 는 dist/wasm/ 에 MediaPipe wasm 6 파일이 복사됐는지 확인한다.
 * mock dist 디렉터리를 생성/정리하면서 plugin 의 closeBundle hook 을 직접 호출해
 * - 누락 시 throw
 * - 6 파일 모두 존재 시 통과
 * 두 케이스를 검증한다.
 */
const REQUIRED = [
  'genai_wasm_internal.js',
  'genai_wasm_internal.wasm',
  'genai_wasm_module_internal.js',
  'genai_wasm_module_internal.wasm',
  'genai_wasm_nosimd_internal.js',
  'genai_wasm_nosimd_internal.wasm',
]

function callCloseBundle(plugin: ReturnType<typeof assertWasmCopied>): void {
  const hook = plugin.closeBundle
  if (typeof hook !== 'function') {
    throw new Error('plugin.closeBundle is not a function')
  }
  // closeBundle 은 PluginContext 에 바인딩되어 호출되지만, 본 구현은 this 를 쓰지 않으므로 빈 객체 OK.
  ;(hook as () => void).call({} as never)
}

describe('assertWasmCopied vite plugin', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'assert-wasm-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('throws when dist/wasm/ is missing required wasm files', () => {
    // 빈 디렉터리 → 6 파일 모두 누락.
    const plugin = assertWasmCopied({ distDir: tmpDir })
    expect(() => callCloseBundle(plugin)).toThrowError(/assert-wasm-copied/)
    expect(() => callCloseBundle(plugin)).toThrowError(/누락/)
  })

  it('passes when all 6 wasm files are present in dist/wasm/', () => {
    for (const f of REQUIRED) {
      fs.writeFileSync(path.join(tmpDir, f), 'stub')
    }
    const plugin = assertWasmCopied({ distDir: tmpDir })
    expect(() => callCloseBundle(plugin)).not.toThrow()
  })
})
