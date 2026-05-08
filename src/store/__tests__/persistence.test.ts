import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  exportPersistedAsBlob,
  loadPersisted,
  savePersisted,
  wipePersisted,
} from '../persistence'
import { PERSONAS } from '@/data/personas'
import type { PersistedState } from '@/types/contracts'
import { SCHEMA_VERSION } from '@/types/contracts'

const makeState = (): PersistedState => ({
  v: SCHEMA_VERSION,
  persona: 'mid',
  scenario: 'base',
  data: structuredClone(PERSONAS.mid.defaults),
})

function clearLocal(): void {
  // Node 25 의 실험적 localStorage 는 .clear() 미지원. 키를 수집해 삭제.
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k) keys.push(k)
  }
  keys.forEach((k) => localStorage.removeItem(k))
}

describe('persistence', () => {
  beforeEach(() => {
    clearLocal()
  })
  afterEach(() => {
    clearLocal()
    vi.useRealTimers()
  })

  it('round-trip save → load', async () => {
    vi.useFakeTimers()
    savePersisted(makeState())
    vi.advanceTimersByTime(400)
    const loaded = loadPersisted()
    expect(loaded).not.toBeNull()
    expect(loaded?.persona).toBe('mid')
    expect(loaded?.data.assets.cash).toBe(6500)
  })

  it('returns null on missing or corrupted state', () => {
    expect(loadPersisted()).toBeNull()
    localStorage.setItem('inseoul-local-state', '{not json}')
    expect(loadPersisted()).toBeNull()
    localStorage.setItem('inseoul-local-state', JSON.stringify({ v: 999, data: {} }))
    expect(loadPersisted()).toBeNull()
  })

  it('schema migration: rejects future versions safely (no throw, returns null)', () => {
    const future = makeState() as unknown as Record<string, unknown>
    future.v = 9999
    localStorage.setItem('inseoul-local-state', JSON.stringify(future))
    expect(() => loadPersisted()).not.toThrow()
    expect(loadPersisted()).toBeNull()
  })

  it('schema migration: rejects past versions (v=0) safely (no throw, returns null)', () => {
    const past = { v: 0, data: { ancient: true }, scenario: 'base', persona: 'mid' }
    localStorage.setItem('inseoul-local-state', JSON.stringify(past))
    expect(() => loadPersisted()).not.toThrow()
    expect(loadPersisted()).toBeNull()
  })

  it('schema migration: corrupted "data" with valid v also returns null', () => {
    const broken = { v: SCHEMA_VERSION, data: { assets: 'not-an-object' } }
    localStorage.setItem('inseoul-local-state', JSON.stringify(broken))
    expect(loadPersisted()).toBeNull()
  })

  it('wipePersisted removes inseoul* keys (incl. legacy)', () => {
    localStorage.setItem('inseoul-local-state', '{}')
    localStorage.setItem('inseoul-old-key', '{}')
    localStorage.setItem('keep-me', 'yes')
    wipePersisted()
    expect(localStorage.getItem('inseoul-local-state')).toBeNull()
    expect(localStorage.getItem('inseoul-old-key')).toBeNull()
    expect(localStorage.getItem('keep-me')).toBe('yes')
  })

  it('exportPersistedAsBlob produces valid JSON', async () => {
    const blob = exportPersistedAsBlob(makeState())
    const text = await blob.text()
    const parsed: unknown = JSON.parse(text)
    expect(parsed).toMatchObject({ v: SCHEMA_VERSION, persona: 'mid' })
  })

  it('PRIVACY GUARD: no network calls during save/load/wipe', () => {
    const fetchSpy = vi.fn()
    const xhrSpy = vi.fn()
    const beaconSpy = vi.fn()
    const origFetch = globalThis.fetch
    const origBeacon = navigator.sendBeacon
    const origXhrOpen = XMLHttpRequest.prototype.open

    globalThis.fetch = fetchSpy as typeof fetch
    Object.defineProperty(navigator, 'sendBeacon', {
      value: beaconSpy,
      configurable: true,
      writable: true,
    })
    XMLHttpRequest.prototype.open = xhrSpy as typeof XMLHttpRequest.prototype.open

    try {
      vi.useFakeTimers()
      savePersisted(makeState())
      vi.advanceTimersByTime(400)
      loadPersisted()
      wipePersisted()
      exportPersistedAsBlob(makeState())

      expect(fetchSpy).not.toHaveBeenCalled()
      expect(xhrSpy).not.toHaveBeenCalled()
      expect(beaconSpy).not.toHaveBeenCalled()
    } finally {
      globalThis.fetch = origFetch
      Object.defineProperty(navigator, 'sendBeacon', {
        value: origBeacon,
        configurable: true,
        writable: true,
      })
      XMLHttpRequest.prototype.open = origXhrOpen
    }
  })
})
