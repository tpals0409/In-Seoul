import type { PersistedState } from '@/types/contracts'
import { SCHEMA_VERSION } from '@/types/contracts'
import { PersistedStateSchema } from '@/lib/validation/schemas'

const ROOT_KEY = 'inseoul-local-state'
const LEGACY_PREFIX = 'inseoul'

/**
 * Local-First persistence. 사용자의 재무 데이터는 절대 외부로 송신하지 않는다.
 * 단일 키(ROOT_KEY) 안에 versioned envelope 형태로 저장한다.
 */
export function loadPersisted(): PersistedState | null {
  try {
    const raw = localStorage.getItem(ROOT_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    const result = PersistedStateSchema.safeParse(parsed)
    if (!result.success) return null
    if (result.data.v !== SCHEMA_VERSION) {
      // future: migrate(result.data, target)
      return null
    }
    return result.data
  } catch {
    return null
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
const SAVE_DEBOUNCE_MS = 300

export function savePersisted(state: PersistedState): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      const validated = PersistedStateSchema.parse(state)
      localStorage.setItem(ROOT_KEY, JSON.stringify(validated))
    } catch {
      // 영구저장 실패는 silent — 다음 호출 때 재시도
    } finally {
      saveTimer = null
    }
  }, SAVE_DEBOUNCE_MS)
}

/** 모든 inseoul* 키 삭제 (현 세션 + 레거시) */
export function wipePersisted(): void {
  try {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(LEGACY_PREFIX)) toRemove.push(k)
    }
    toRemove.forEach((k) => localStorage.removeItem(k))
  } catch {
    // ignore
  }
}

/** JSON Blob 으로 내보내기 */
export function exportPersistedAsBlob(state: PersistedState): Blob {
  return new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
}
