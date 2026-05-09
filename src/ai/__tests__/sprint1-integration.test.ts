// Sprint 1 통합 회귀 smoke — 4 가드가 *한 시나리오 안에서* 함께 살아있는지 확인.
//
// 각 가드의 단위 테스트는 이미 sprint-1 에서 통과 상태(127 unit). 이 파일은
// 통합 main 에서 가드들이 서로의 동작을 깨지 않고 *공존* 함을 한 흐름으로 본다:
//
//   ② RAG chunk-level validation (rag/index-loader)
//     → 손상된 청크가 섞여도 정상 청크만 남고 콘솔 경고 1회
//   ④ Prompt 8K cap + KRW 양자화 (prompt/build, prompt/context)
//     → 위에서 sanitize 된 chunks + 큰 KRW 사용자 데이터를 prompt 로 합쳤을 때
//        길이 ≤ MAX_PROMPT_CHARS, raw 만원값 0건, 라벨 표기 1건 이상
//   ① Ollama boundary (hooks/useLLM)
//     → 비-로컬 OLLAMA_URL + 동의 없음 → ensureReady 차단 + fetch 0
//   ③ MediaPipe URL allowlist (llm/mediapipe)
//     → 비허용 host modelUrl → assertAllowedModelHost throw
//
// 외부 네트워크 호출 0 — local-first 약속에 따라 fetch 는 vi.stubGlobal 로 모킹.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import {
  _resetMemoryCacheForTests,
  loadKnowledgeIndex,
} from '@/ai/rag/index-loader'
import type { KnowledgeChunk, KnowledgeIndex } from '@/ai/rag/types'
import {
  buildPrompt,
  MAX_PROMPT_CHARS,
  type PromptChunk,
} from '@/ai/prompt/build'
import { useLLM } from '@/ai/hooks/useLLM'
import { assertAllowedModelHost } from '@/ai/llm/mediapipe'
import { PERSONAS } from '@/data/personas'
import { simulate } from '@/lib/sim'
import type { AdvisorContext } from '@/types/contracts'

const EMBED_DIM = 4

function f32ToBase64(values: number[]): string {
  const f32 = new Float32Array(values)
  const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength)
  let bin = ''
  for (let i = 0; i < u8.length; i += 1) bin += String.fromCharCode(u8[i] ?? 0)
  return btoa(bin)
}

function makeChunk(over: Partial<KnowledgeChunk> = {}): KnowledgeChunk {
  return {
    id: 'seoul_districts#mapo#0',
    file: 'seoul_districts',
    heading: '마포구',
    headingPath: ['seoul_districts', '마포구'],
    content: '마포구는 서울 서북부에 위치한 자치구이다.',
    tokenCount: 12,
    embedding: f32ToBase64([0.5, 0.5, 0.5, 0.5]),
    ...over,
  }
}

function makeIndex(chunks: unknown[]): KnowledgeIndex {
  return {
    version: 1,
    embeddingModel: 'Xenova/multilingual-e5-small',
    embeddingDim: EMBED_DIM,
    builtAt: '2026-05-08T00:00:00.000Z',
    chunks: chunks as KnowledgeChunk[],
  }
}

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  _resetMemoryCacheForTests()
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  warnSpy.mockRestore()
  vi.restoreAllMocks()
})

describe('Sprint 1 통합 회귀 smoke — 4 가드 공존', () => {
  it('rag chunk validation → prompt 8K cap + KRW 양자화 → ollama 차단 → mediapipe 화이트리스트', async () => {
    /* ─────────────── ② RAG chunk-level validation ─────────────── */
    // 정상 2 + 손상 1(id 빈 문자열) → sanitizeIndex 가 손상만 드롭, 단일 aggregate warn.
    const broken = { ...makeChunk({ id: 'broken' }), id: '' }
    const idx = makeIndex([
      makeChunk({ id: 'good-1', heading: '마포구 시세' }),
      broken,
      makeChunk({
        id: 'good-2',
        heading: '강남구 시세',
        content: '강남구는 서울 동남부의 자치구이다.',
      }),
    ])
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => idx })),
    )

    const loaded = await loadKnowledgeIndex()
    expect(loaded.chunks).toHaveLength(2)
    expect(loaded.chunks.map((c) => c.id)).toEqual(['good-1', 'good-2'])
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0]?.[0] ?? '')).toContain('Dropped 1')

    /* ─────────────── ④ Prompt 8K cap + KRW 양자화 ─────────────── */
    // senior persona 의 큰 KRW 절대값(goalPriceM=180000=18억, monthlyIncome=1100,
    // monthlySaving=400, cash=15000) 이 raw 만원값 그대로 prompt 에 안 박히고
    // 양자화 라벨로만 노출되는지 + cap 보장 확인.
    const data = PERSONAS.senior.defaults
    const sim = simulate(data, 'base')
    const ctx: AdvisorContext = {
      screen: 'result',
      persona: 'senior',
      scenarioKey: 'base',
      data,
      sim,
      recentChat: [],
    }
    // sanitize 된 chunks + 거대 chunk 1개 → cap 가드도 함께 활성화.
    const chunks: PromptChunk[] = [
      ...loaded.chunks.map((c) => ({
        id: c.id,
        heading: c.heading,
        content: c.content,
      })),
      { id: 'huge', heading: 'h', content: 'X'.repeat(20_000) },
    ]
    const prompt = buildPrompt({
      question: '강남구 18억대 진입 가능한가요?',
      ctx,
      chunks,
    })

    expect(prompt.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS)
    // KRW 양자화 라벨이 사용자 상황 요약에 들어와 있어야 한다.
    expect(prompt).toContain('18억대')
    // raw 만원값 노출 금지.
    expect(prompt).not.toContain('180000')
    expect(prompt).not.toContain('15000만')
    expect(prompt).not.toContain('1100만')
    // sanitize 통과한 chunk 가 그대로 prompt 인용 헤더로 흐른 사실을 확인 —
    // RAG → prompt 단계가 손상 청크를 통과시키지 않았다는 end-to-end 증거.
    expect(prompt).toContain('[출처: good-1]')
    expect(prompt).not.toContain('[출처: broken]')

    /* ─────────────── ① Ollama boundary ─────────────── */
    // 위 단계의 fetch stub 을 풀고 ollama boundary 가 *fetch 호출 자체를*
    // 차단하는지(allowed=false 분기) 검증한다 — boundary 는 가장 강한 보호.
    vi.unstubAllGlobals()
    const ollamaFetch = vi.fn() as unknown as typeof fetch
    globalThis.fetch = ollamaFetch
    vi.stubEnv('VITE_LLM_BACKEND', 'ollama')
    vi.stubEnv('VITE_OLLAMA_URL', 'http://192.168.1.50:11434')
    vi.stubEnv('VITE_OLLAMA_MODEL', 'gemma3:4b')
    vi.stubEnv('VITE_ALLOW_REMOTE_LLM', '')
    vi.stubEnv('VITE_GEMMA_MODEL_URL', '')

    const { result } = renderHook(() => useLLM())
    await act(async () => {
      await expect(result.current.ensureReady()).rejects.toThrow(
        /VITE_ALLOW_REMOTE_LLM/,
      )
    })
    expect(result.current.state.status).toBe('error')
    expect(result.current.state.errorMessage).toMatch(/192\.168\.1\.50/)
    expect(result.current.state.remote).toBe(true)
    // 핵심: 비-로컬 호스트로 *어떤 fetch 도* 발생하지 않았다.
    expect(ollamaFetch).not.toHaveBeenCalled()

    /* ─────────────── ③ MediaPipe URL allowlist ─────────────── */
    // VITE_ALLOW_CUSTOM_MODEL_HOST 미설정 — 비허용 host 는 assertAllowedModelHost
    // 단계에서 즉시 throw, fetch/WebGPU 진행 전에 차단.
    vi.stubEnv('VITE_ALLOW_CUSTOM_MODEL_HOST', '')
    expect(() =>
      assertAllowedModelHost('https://malicious.example.com/model.task'),
    ).toThrow(/init-failed: model host 'malicious\.example\.com'/)
    // 회귀 가드: 화이트리스트 호스트는 절대 막지 않는다.
    expect(() =>
      assertAllowedModelHost(
        'https://huggingface.co/google/gemma/resolve/main/model.task',
      ),
    ).not.toThrow()
  })
})
