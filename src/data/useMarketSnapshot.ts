import { useEffect, useState } from 'react'
import {
  getMarketSnapshotFor,
  loadMarketSnapshot,
  type MarketSnapshot,
} from './marketSnapshot'

export interface UseMarketSnapshotResult {
  snapshot: MarketSnapshot | null
  /** 로드가 시도 완료된 상태(성공/실패 무관). false 면 아직 처음 fetch 중. */
  ready: boolean
}

/**
 * 시장 시세 스냅샷 lazy 로드. 앱 마운트 시 1회만 fetch (loadMarketSnapshot 내부 캐시).
 * 스냅샷이 없거나 깨졌으면 snapshot=null + ready=true 로 끝나서, 호출자는 폴백 사용.
 */
export function useMarketSnapshot(): UseMarketSnapshotResult {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null)
  const [ready, setReady] = useState<boolean>(false)

  useEffect(() => {
    let cancelled = false
    loadMarketSnapshot()
      .then((s) => {
        if (cancelled) return
        setSnapshot(s)
        setReady(true)
      })
      .catch(() => {
        if (cancelled) return
        setSnapshot(null)
        setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { snapshot, ready }
}

/** snapshot 에서 매매 중앙값(만원) 가져오기. 없으면 null. */
export function priceFromSnapshot(
  snapshot: MarketSnapshot | null,
  district: string,
): number | null {
  if (!snapshot) return null
  // getMarketSnapshotFor 는 모듈 레벨 캐시를 보지만, snapshot 인자가 있으면
  // 명시적 lookup 이 더 안전 — 캐시 시점차 race 방지.
  const found = snapshot.snapshots.find((s) => s.district === district)
  if (found) return found.price
  // 캐시 폴백 (다른 경로로 채워졌을 수 있음)
  return getMarketSnapshotFor(district)?.price ?? null
}
