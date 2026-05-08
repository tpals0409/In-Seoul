// Local re-exports so other rag modules can import from a single namespace.
// This avoids each rag file deep-importing @/types/contracts directly and
// keeps the contract surface for retrieval colocated.

export type {
  KnowledgeChunk,
  KnowledgeFile,
  KnowledgeIndex,
  RetrievalResult,
} from '@/types/contracts'

/** Internal — a chunk whose base64 `embedding` has been decoded once. */
export interface DecodedChunk {
  /** Reference to the original chunk (id, content, heading, etc.). */
  // Kept as a structural type — see `decodeChunk` in retrieve.ts.
  id: string
  vector: Float32Array
}

/** Force-include trigger keywords for the risk disclaimer chunk. */
export const RISK_TRIGGER_KEYWORDS: readonly string[] = [
  '추천',
  '매수',
  '사야',
  '살까',
  '살지',
  '오를까',
  '오를지',
  '예측',
  '확실',
  '예측해',
  '예측가능',
] as const

/** Heading marker the retrieve forced-inclusion logic looks for. */
export const RISK_DISCLAIMER_HEADING_MARKER = '권유 금지' as const

/** Bonus added to the cosine score for each chunk that literally matches a query keyword. */
export const KEYWORD_BOOST = 0.05 as const
