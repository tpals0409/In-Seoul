import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetMarketSnapshotCache,
  getMarketSnapshotFor,
  loadMarketSnapshot,
  type MarketSnapshot,
} from '../marketSnapshot'

const VALID_SNAPSHOT: MarketSnapshot = {
  version: 1,
  builtAt: '2026-05-08T00:00:00.000Z',
  source: 'test',
  snapshots: [
    { district: '강남구', lawdCd: '11680', price: 283000, jeonsePrice: 95000 },
    { district: '노원구', lawdCd: '11350', price: 72800, jeonsePrice: 47125 },
  ],
}

describe('marketSnapshot loader', () => {
  beforeEach(() => {
    __resetMarketSnapshotCache()
  })
  afterEach(() => {
    __resetMarketSnapshotCache()
    vi.restoreAllMocks()
  })

  it('정상 응답 → MarketSnapshot 반환 + 캐시', async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(VALID_SNAPSHOT), { status: 200 }),
      ),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const a = await loadMarketSnapshot()
    expect(a).not.toBeNull()
    expect(a?.snapshots).toHaveLength(2)

    // 두 번째 호출은 캐시 사용 → fetch 1회만
    const b = await loadMarketSnapshot()
    expect(b).toBe(a)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('404 → null', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response('', { status: 404 })),
    ) as unknown as typeof fetch

    const r = await loadMarketSnapshot()
    expect(r).toBeNull()
  })

  it('잘못된 스키마(version 99) → null', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ version: 99, snapshots: [] }), { status: 200 }),
      ),
    ) as unknown as typeof fetch

    const r = await loadMarketSnapshot()
    expect(r).toBeNull()
  })

  it('가드: builtAt 가 ISO 형식 아님 → null', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ ...VALID_SNAPSHOT, builtAt: '2026-05-08' }),
          { status: 200 },
        ),
      ),
    ) as unknown as typeof fetch
    expect(await loadMarketSnapshot()).toBeNull()
  })

  it('가드: lawdCd 가 5자리 숫자 아님 → null', async () => {
    const broken = {
      ...VALID_SNAPSHOT,
      snapshots: [{ ...VALID_SNAPSHOT.snapshots[0], lawdCd: 'ABCDE' }],
    }
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(broken), { status: 200 })),
    ) as unknown as typeof fetch
    expect(await loadMarketSnapshot()).toBeNull()
  })

  it('가드: price 가 음수/실수/0 → null', async () => {
    for (const bad of [-1, 0, 100.5, Number.NaN]) {
      __resetMarketSnapshotCache()
      const broken = {
        ...VALID_SNAPSHOT,
        snapshots: [{ ...VALID_SNAPSHOT.snapshots[0], price: bad }],
      }
      globalThis.fetch = vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify(broken), { status: 200 })),
      ) as unknown as typeof fetch
      expect(await loadMarketSnapshot()).toBeNull()
    }
  })

  it('가드: jeonsePrice 가 1조 초과 → null', async () => {
    const broken = {
      ...VALID_SNAPSHOT,
      snapshots: [{ ...VALID_SNAPSHOT.snapshots[0], jeonsePrice: 999_999_999_999 }],
    }
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(broken), { status: 200 })),
    ) as unknown as typeof fetch
    expect(await loadMarketSnapshot()).toBeNull()
  })

  it('가드: snapshots 배열이 비어있음 → null', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ...VALID_SNAPSHOT, snapshots: [] }), { status: 200 }),
      ),
    ) as unknown as typeof fetch
    expect(await loadMarketSnapshot()).toBeNull()
  })

  it('네트워크 오류 → null (throw 없음)', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.reject(new Error('network')),
    ) as unknown as typeof fetch

    await expect(loadMarketSnapshot()).resolves.toBeNull()
  })

  it('getMarketSnapshotFor: 캐시된 데이터에서 district 조회', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(VALID_SNAPSHOT), { status: 200 }),
      ),
    ) as unknown as typeof fetch

    await loadMarketSnapshot()
    expect(getMarketSnapshotFor('강남구')?.price).toBe(283000)
    expect(getMarketSnapshotFor('노원구')?.jeonsePrice).toBe(47125)
    expect(getMarketSnapshotFor('미존재구')).toBeNull()
  })

  it('getMarketSnapshotFor: 캐시 없으면 null', () => {
    expect(getMarketSnapshotFor('강남구')).toBeNull()
  })
})
