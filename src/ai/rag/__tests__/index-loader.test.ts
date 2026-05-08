// Deep-validation coverage for the prebuilt knowledge index loader.
//
// We exercise the public `loadKnowledgeIndex()` flow with a stubbed `fetch`
// so the validation/sanitization pipeline is reached. IndexedDB is absent in
// jsdom, so the loader naturally falls through to the network branch.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetMemoryCacheForTests,
  decodeEmbedding,
  loadKnowledgeIndex,
} from '../index-loader'
import type { KnowledgeChunk, KnowledgeIndex } from '../types'

const EMBED_DIM = 4

function f32ToBase64(values: number[]): string {
  const f32 = new Float32Array(values)
  const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength)
  let bin = ''
  for (let i = 0; i < u8.length; i += 1) {
    bin += String.fromCharCode(u8[i] ?? 0)
  }
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

function stubFetchJson(payload: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => payload,
    })),
  )
}

function stubFetchFailure(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('network down')
    }),
  )
}

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  _resetMemoryCacheForTests()
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  warnSpy.mockRestore()
})

describe('decodeEmbedding', () => {
  it('round-trips a Float32Array of the expected length', () => {
    const b64 = f32ToBase64([1, -1, 0.25, 0.75])
    const out = decodeEmbedding(b64)
    expect(out).toBeInstanceOf(Float32Array)
    expect(out.length).toBe(EMBED_DIM)
    expect(Array.from(out)).toEqual([1, -1, 0.25, 0.75])
  })
})

describe('loadKnowledgeIndex — deep validation', () => {
  it('case 1: 정상 인덱스는 그대로 통과하며 경고를 남기지 않는다', async () => {
    const idx = makeIndex([
      makeChunk({ id: 'a' }),
      makeChunk({ id: 'b', file: 'risk_disclaimer', heading: '권유 금지' }),
    ])
    stubFetchJson(idx)

    const out = await loadKnowledgeIndex()

    expect(out.chunks).toHaveLength(2)
    expect(out.chunks[0]?.id).toBe('a')
    expect(out.chunks[1]?.id).toBe('b')
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('case 2: 필수 필드 누락(id 비어있음) chunk 는 스킵되고 인덱스 전체는 사용된다', async () => {
    const broken = { ...makeChunk({ id: 'broken' }), id: '' }
    const idx = makeIndex([
      makeChunk({ id: 'good-1' }),
      broken,
      makeChunk({ id: 'good-2' }),
    ])
    stubFetchJson(idx)

    const out = await loadKnowledgeIndex()

    expect(out.chunks).toHaveLength(2)
    expect(out.chunks.map((c) => c.id)).toEqual(['good-1', 'good-2'])
    // 한 번만 경고 — 손상 chunk N 개여도 단일 aggregate 경고.
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const msg = String(warnSpy.mock.calls[0]?.[0] ?? '')
    expect(msg).toContain('Dropped 1')
  })

  it('case 3: embedding 차원 불일치 chunk 는 스킵된다', async () => {
    const wrongDim = makeChunk({
      id: 'short',
      embedding: f32ToBase64([0.1, 0.2]), // dim=2 but index says 4
    })
    const idx = makeIndex([makeChunk({ id: 'ok' }), wrongDim])
    stubFetchJson(idx)

    const out = await loadKnowledgeIndex()

    expect(out.chunks).toHaveLength(1)
    expect(out.chunks[0]?.id).toBe('ok')
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('case 4: base64 디코딩이 깨진 chunk 는 스킵된다', async () => {
    // Length not a multiple of 4 → decodeEmbedding throws.
    const garbage = makeChunk({ id: 'rotten', embedding: 'AAA=' })
    const idx = makeIndex([garbage, makeChunk({ id: 'ok' })])
    stubFetchJson(idx)

    const out = await loadKnowledgeIndex()

    expect(out.chunks).toHaveLength(1)
    expect(out.chunks[0]?.id).toBe('ok')
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('case 5: 전체 인덱스 스키마 위반(top-level chunks 가 배열 아님)은 거부된다', async () => {
    // Top-level shape violation → fetch result fails isKnowledgeIndex; with
    // no IDB cache available in jsdom the loader must throw.
    stubFetchJson({
      version: 1,
      embeddingModel: 'x',
      embeddingDim: EMBED_DIM,
      builtAt: 'now',
      chunks: 'not-an-array',
    })

    await expect(loadKnowledgeIndex()).rejects.toThrow(
      /Failed to load knowledge index/,
    )
  })

  it('case 6: 알 수 없는 file 값과 누락된 id 가 섞여도 정상 chunk 만 남는다', async () => {
    const badFile = makeChunk({ id: 'badfile', file: 'unknown' as never })
    const noContent = makeChunk({ id: 'no-content' }) as unknown as Record<string, unknown>
    delete noContent['content']
    const idx = makeIndex([
      badFile,
      noContent,
      makeChunk({ id: 'good' }),
    ])
    stubFetchJson(idx)

    const out = await loadKnowledgeIndex()

    expect(out.chunks).toHaveLength(1)
    expect(out.chunks[0]?.id).toBe('good')
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0]?.[0] ?? '')).toContain('Dropped 2')
  })

  it('case 7: network/IDB 모두 실패하면 throw', async () => {
    stubFetchFailure()
    await expect(loadKnowledgeIndex()).rejects.toThrow(
      /Failed to load knowledge index/,
    )
  })
})
