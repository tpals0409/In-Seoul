// Loader + cache for the prebuilt knowledge index.
//
// Strategy:
//   1. In-memory singleton (fastest; lives for the page session).
//   2. IndexedDB cache (offline support, survives reload).
//   3. Network fetch of /knowledge/index.json built by scripts/build-knowledge.ts.
//
// Cache invalidates whenever the network copy reports a newer `builtAt`.

import type { KnowledgeChunk, KnowledgeFile, KnowledgeIndex } from './types'

const INDEX_URL = '/knowledge/index.json'
const DB_NAME = 'inseoul-rag-cache'
const DB_VERSION = 1
const STORE_NAME = 'index'
const KEY = 'index'

let memoryIndex: KnowledgeIndex | null = null
let inflight: Promise<KnowledgeIndex> | null = null

// ---------------------------------------------------------------------------
// IndexedDB helpers (no external deps; promise wrappers around IDB).
// ---------------------------------------------------------------------------

interface IDBContext {
  db: IDBDatabase
}

function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}

function openDb(): Promise<IDBContext | null> {
  if (!isIndexedDBAvailable()) return Promise.resolve(null)
  return new Promise<IDBContext | null>((resolvePromise) => {
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      resolvePromise(null)
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => {
      resolvePromise({ db: req.result })
    }
    req.onerror = () => {
      resolvePromise(null)
    }
    req.onblocked = () => {
      resolvePromise(null)
    }
  })
}

function idbGet(ctx: IDBContext, key: string): Promise<unknown> {
  return new Promise<unknown>((resolvePromise) => {
    let tx: IDBTransaction
    try {
      tx = ctx.db.transaction(STORE_NAME, 'readonly')
    } catch {
      resolvePromise(null)
      return
    }
    const store = tx.objectStore(STORE_NAME)
    const req = store.get(key)
    req.onsuccess = () => {
      resolvePromise(req.result ?? null)
    }
    req.onerror = () => {
      resolvePromise(null)
    }
  })
}

function idbPut(ctx: IDBContext, key: string, value: unknown): Promise<void> {
  return new Promise<void>((resolvePromise) => {
    let tx: IDBTransaction
    try {
      tx = ctx.db.transaction(STORE_NAME, 'readwrite')
    } catch {
      resolvePromise()
      return
    }
    const store = tx.objectStore(STORE_NAME)
    const req = store.put(value, key)
    req.onsuccess = () => {
      resolvePromise()
    }
    req.onerror = () => {
      resolvePromise()
    }
  })
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Narrow `unknown` (e.g. result of JSON.parse / IDB get) to a KnowledgeIndex. */
function isKnowledgeIndex(value: unknown): value is KnowledgeIndex {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (v['version'] !== 1) return false
  if (typeof v['embeddingModel'] !== 'string') return false
  if (typeof v['embeddingDim'] !== 'number') return false
  if (!Number.isFinite(v['embeddingDim']) || (v['embeddingDim'] as number) <= 0) return false
  if (typeof v['builtAt'] !== 'string') return false
  if (!Array.isArray(v['chunks'])) return false
  return true
}

const KNOWLEDGE_FILES: ReadonlySet<KnowledgeFile> = new Set<KnowledgeFile>([
  'calculation_logic',
  'financial_concepts',
  'loan_products',
  'seoul_districts',
  'strategies',
  'risk_disclaimer',
])

function isKnowledgeFile(value: unknown): value is KnowledgeFile {
  return typeof value === 'string' && KNOWLEDGE_FILES.has(value as KnowledgeFile)
}

/**
 * Deep-validate a single chunk: required fields exist with correct types AND
 * the base64 `embedding` decodes to a Float32Array whose length matches
 * `embeddingDim`. Returns null on any violation; the caller logs a single
 * aggregate warning rather than spamming per-chunk noise.
 */
function validateChunk(
  raw: unknown,
  embeddingDim: number,
): KnowledgeChunk | null {
  if (typeof raw !== 'object' || raw === null) return null
  const c = raw as Record<string, unknown>

  if (typeof c['id'] !== 'string' || c['id'].length === 0) return null
  if (!isKnowledgeFile(c['file'])) return null
  if (typeof c['heading'] !== 'string') return null
  if (typeof c['content'] !== 'string') return null
  if (typeof c['embedding'] !== 'string' || c['embedding'].length === 0) return null

  let vec: Float32Array
  try {
    vec = decodeEmbedding(c['embedding'])
  } catch {
    return null
  }
  if (vec.length !== embeddingDim) return null

  return raw as KnowledgeChunk
}

/**
 * Filter the chunks array down to only the chunks that pass deep validation.
 * Logs a single aggregate `console.warn` if any chunks were dropped.
 *
 * The original index object is NOT mutated; a shallow clone with replaced
 * `chunks` is returned so the in-memory cache holds the cleaned view.
 */
function sanitizeIndex(idx: KnowledgeIndex): KnowledgeIndex {
  const cleaned: KnowledgeChunk[] = []
  let dropped = 0
  for (const raw of idx.chunks) {
    const ok = validateChunk(raw, idx.embeddingDim)
    if (ok === null) {
      dropped += 1
      continue
    }
    cleaned.push(ok)
  }
  if (dropped > 0) {
    console.warn(
      `[rag/index-loader] Dropped ${String(dropped)} corrupted chunk(s) of ${String(idx.chunks.length)} during validation.`,
    )
  }
  if (dropped === 0) return idx
  return { ...idx, chunks: cleaned }
}

function builtAtTime(idx: KnowledgeIndex): number {
  const t = Date.parse(idx.builtAt)
  return Number.isFinite(t) ? t : 0
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the KnowledgeIndex, hitting in-memory cache if available, then IDB,
 * then the network. Updates the IDB copy when the network copy is newer than
 * what is cached locally.
 */
export function loadKnowledgeIndex(): Promise<KnowledgeIndex> {
  if (memoryIndex !== null) return Promise.resolve(memoryIndex)
  if (inflight !== null) return inflight
  inflight = doLoad().finally(() => {
    inflight = null
  })
  return inflight
}

async function doLoad(): Promise<KnowledgeIndex> {
  const ctx = await openDb()

  // Try IDB first for a quick offline-friendly read.
  let cached: KnowledgeIndex | null = null
  if (ctx !== null) {
    const raw = await idbGet(ctx, KEY)
    if (isKnowledgeIndex(raw)) cached = raw
  }

  // Try network. If it succeeds and is newer (or no cache), refresh.
  // We persist the *raw* network payload to IDB (sanitization is applied to
  // the in-memory copy only) so that a future build with a fixed chunk does
  // not get masked by a previously-cleaned cache entry.
  let network: KnowledgeIndex | null = null
  try {
    const resp = await fetch(INDEX_URL, { cache: 'no-cache' })
    if (resp.ok) {
      const json: unknown = await resp.json()
      if (isKnowledgeIndex(json)) {
        network = json
      }
    }
  } catch {
    network = null
  }

  let chosen: KnowledgeIndex
  if (network !== null && cached === null) {
    chosen = network
    if (ctx !== null) await idbPut(ctx, KEY, network)
  } else if (network !== null && cached !== null) {
    chosen = builtAtTime(network) > builtAtTime(cached) ? network : cached
    if (chosen === network && ctx !== null) await idbPut(ctx, KEY, network)
  } else if (cached !== null) {
    chosen = cached
  } else {
    throw new Error(
      '[rag/index-loader] Failed to load knowledge index (no cache, no network).',
    )
  }

  const sanitized = sanitizeIndex(chosen)
  memoryIndex = sanitized
  return sanitized
}

/** Decode a base64 embedding string back to a Float32Array. */
export function decodeEmbedding(b64: string): Float32Array {
  // atob is available in browsers and in modern Node (>=16).
  const bin = atob(b64)
  const len = bin.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i += 1) {
    bytes[i] = bin.charCodeAt(i)
  }
  // Bytes length must be a multiple of 4 (Float32 = 4 bytes).
  if ((bytes.byteLength & 3) !== 0) {
    throw new Error(
      `[rag/index-loader] Decoded embedding byte length ${String(bytes.byteLength)} is not a multiple of 4.`,
    )
  }
  return new Float32Array(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength / 4,
  )
}

/** Test/dev only — clear the in-memory cache. */
export function _resetMemoryCacheForTests(): void {
  memoryIndex = null
  inflight = null
}
