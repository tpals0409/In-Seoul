// 빌드타임에 생성된 25개 구 시세 스냅샷을 런타임에 lazy-load.
// 출처: scripts/refresh-market.ts → public/data/seoul-prices.json (same-origin 정적 fetch).
// 파일이 없으면 null 반환 — 호출자는 DISTRICT_PRICE_25 fallback 으로 안전.

export interface MarketDistrictSnapshot {
  district: string
  lawdCd: string
  /** 매매 중앙값 (만원) */
  price: number
  /** 전세 중앙값 (만원) */
  jeonsePrice: number
}

export interface MarketSnapshot {
  version: 1
  builtAt: string
  source: string
  snapshots: MarketDistrictSnapshot[]
}

const SNAPSHOT_URL = '/data/seoul-prices.json'

let cache: MarketSnapshot | null | undefined
let inflight: Promise<MarketSnapshot | null> | null = null

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/
const LAWD_CD_RE = /^\d{5}$/
/** 합리적 만원 가격 상한 (1조). 이걸 넘는 입력은 깨진 응답으로 본다. */
const MAX_PRICE_MAN = 100_000_000

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v > 0
}

function isValidDistrictSnapshot(v: unknown): v is MarketDistrictSnapshot {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  if (typeof r['district'] !== 'string' || r['district'].length === 0) return false
  if (typeof r['lawdCd'] !== 'string' || !LAWD_CD_RE.test(r['lawdCd'])) return false
  if (!isPositiveInt(r['price']) || r['price'] > MAX_PRICE_MAN) return false
  if (!isPositiveInt(r['jeonsePrice']) || r['jeonsePrice'] > MAX_PRICE_MAN) return false
  return true
}

function isMarketSnapshot(v: unknown): v is MarketSnapshot {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (o['version'] !== 1) return false
  if (typeof o['builtAt'] !== 'string' || !ISO_DATE_RE.test(o['builtAt'])) return false
  // builtAt 가 실제 parsing 가능한지 한 번 더 확인
  if (Number.isNaN(Date.parse(o['builtAt']))) return false
  if (typeof o['source'] !== 'string' || o['source'].length === 0) return false
  if (!Array.isArray(o['snapshots']) || o['snapshots'].length === 0) return false
  return o['snapshots'].every(isValidDistrictSnapshot)
}

/**
 * 시세 스냅샷을 로드. 첫 호출 후 메모리 캐시. 파일이 없거나 깨졌으면 null.
 * 호출자는 null 일 때 prototype 의 DISTRICT_PRICE_25 로 폴백한다.
 */
export async function loadMarketSnapshot(): Promise<MarketSnapshot | null> {
  if (cache !== undefined) return cache
  if (inflight) return inflight

  inflight = (async (): Promise<MarketSnapshot | null> => {
    try {
      const res = await fetch(SNAPSHOT_URL, { cache: 'no-cache' })
      if (!res.ok) {
        cache = null
        return null
      }
      const data: unknown = await res.json()
      if (!isMarketSnapshot(data)) {
        cache = null
        return null
      }
      cache = data
      return data
    } catch {
      cache = null
      return null
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/**
 * district 의 시세 스냅샷 반환. 미존재 시 null.
 * 동기 호출 — 사전에 loadMarketSnapshot() 을 한 번 await 해서 캐시 채워둔 뒤 사용.
 */
export function getMarketSnapshotFor(district: string): MarketDistrictSnapshot | null {
  if (!cache) return null
  return cache.snapshots.find((s) => s.district === district) ?? null
}

/** 테스트용: 캐시 초기화. 프로덕션 코드에서 호출 금지. */
export function __resetMarketSnapshotCache(): void {
  cache = undefined
  inflight = null
}
