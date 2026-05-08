// Top-K retrieval over the prebuilt KnowledgeIndex.
//
//  - Embed the query (multilingual MiniLM, normalized → cosine == dot product).
//  - Score each chunk via dot product against the query embedding.
//  - Apply a small +0.05 bonus per chunk that literally contains a query
//    keyword in its heading or content (Korean + English alphabetical tokens).
//  - For "should I buy?" style queries, force-include the risk-disclaimer
//    "권유 금지" chunk at index 0 of the top-K result.

import { embedQuery } from './embed'
import { decodeEmbedding } from './index-loader'
import {
  KEYWORD_BOOST,
  RISK_DISCLAIMER_HEADING_MARKER,
  RISK_TRIGGER_KEYWORDS,
} from './types'
import type { KnowledgeChunk, KnowledgeIndex, RetrievalResult } from './types'

// ---------------------------------------------------------------------------
// Vector + keyword helpers
// ---------------------------------------------------------------------------

/** Vectors are pre-normalized → dot product equals cosine similarity. */
function dot(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length)
  let s = 0
  for (let i = 0; i < n; i += 1) {
    const ai = a[i] ?? 0
    const bi = b[i] ?? 0
    s += ai * bi
  }
  return s
}

/**
 * Extract literal-keyword tokens from the query.
 *
 *  - Korean runs (Hangul syllables / Jamo).
 *  - English alphabetical runs (case-insensitive; lowercased).
 *
 * Pure digit runs and short single-character English fragments are ignored to
 * keep the boost from being triggered by trivia like "1" or "I".
 */
function extractKeywords(query: string): string[] {
  const re = /[\p{Script=Hangul}]+|[A-Za-z]+/gu
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of query.matchAll(re)) {
    const raw = m[0]
    if (typeof raw !== 'string' || raw.length === 0) continue
    const norm = /^[A-Za-z]+$/.test(raw) ? raw.toLowerCase() : raw
    if (norm.length < 2) continue
    if (seen.has(norm)) continue
    seen.add(norm)
    out.push(norm)
  }
  return out
}

/** Returns the subset of `keywords` that appear literally in the chunk. */
function matchKeywordsInChunk(
  chunk: KnowledgeChunk,
  keywords: readonly string[],
): string[] {
  if (keywords.length === 0) return []
  const headingLower = chunk.heading.toLowerCase()
  const contentLower = chunk.content.toLowerCase()
  const hits: string[] = []
  for (const kw of keywords) {
    // English keywords already lowercased in extractKeywords; Korean is unaffected.
    if (headingLower.includes(kw) || contentLower.includes(kw)) {
      hits.push(kw)
    }
  }
  return hits
}

/** Returns true if any RISK_TRIGGER_KEYWORDS appears in the raw query string. */
function shouldForceRiskDisclaimer(query: string): boolean {
  for (const kw of RISK_TRIGGER_KEYWORDS) {
    if (query.includes(kw)) return true
  }
  return false
}

/** Locate the canonical "권유 금지" disclaimer chunk, if present in the index. */
function findRiskDisclaimerChunk(
  index: KnowledgeIndex,
): KnowledgeChunk | null {
  for (const chunk of index.chunks) {
    if (
      chunk.file === 'risk_disclaimer' &&
      chunk.heading.includes(RISK_DISCLAIMER_HEADING_MARKER)
    ) {
      return chunk
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Embedding cache (decode base64 → Float32Array on first use, then memoize).
// Keyed by chunk id so it survives index reloads as long as ids are stable.
// ---------------------------------------------------------------------------

const decodedCache = new Map<string, Float32Array>()

function getChunkVector(chunk: KnowledgeChunk): Float32Array {
  const cached = decodedCache.get(chunk.id)
  if (cached !== undefined) return cached
  const vec = decodeEmbedding(chunk.embedding)
  decodedCache.set(chunk.id, vec)
  return vec
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Retrieve up to `topK` chunks ranked by (cosine + keyword bonus). Always
 * inserts the risk disclaimer "권유 금지" chunk at position 0 when the query
 * contains a recommendation/prediction trigger keyword.
 */
export async function retrieve(
  query: string,
  index: KnowledgeIndex,
  topK = 4,
): Promise<RetrievalResult[]> {
  if (topK <= 0) return []

  const trimmed = query.trim()
  if (trimmed.length === 0) return []

  const queryVec = await embedQuery(trimmed)
  const keywords = extractKeywords(trimmed)

  // Score every chunk.
  const scored: RetrievalResult[] = []
  for (const chunk of index.chunks) {
    const cv = getChunkVector(chunk)
    const cosine = dot(queryVec, cv)
    const matched = matchKeywordsInChunk(chunk, keywords)
    const score = cosine + matched.length * KEYWORD_BOOST
    const result: RetrievalResult =
      matched.length > 0
        ? { chunk, score, matchedKeywords: matched }
        : { chunk, score }
    scored.push(result)
  }

  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, topK)

  // Force-include the risk disclaimer if the query is a buy/predict question.
  if (shouldForceRiskDisclaimer(trimmed)) {
    const riskChunk = findRiskDisclaimerChunk(index)
    if (riskChunk !== null) {
      const alreadyIn = top.findIndex((r) => r.chunk.id === riskChunk.id)
      if (alreadyIn === -1) {
        const cv = getChunkVector(riskChunk)
        const cosine = dot(queryVec, cv)
        const matched = matchKeywordsInChunk(riskChunk, keywords)
        const forced: RetrievalResult =
          matched.length > 0
            ? {
                chunk: riskChunk,
                score: cosine + matched.length * KEYWORD_BOOST,
                matchedKeywords: matched,
              }
            : { chunk: riskChunk, score: cosine }
        if (top.length < topK) {
          top.unshift(forced)
        } else {
          // Replace the lowest-ranked entry, then move the forced result to the top.
          top[top.length - 1] = forced
          top.unshift(forced)
          top.splice(top.length - 1, 1)
        }
      } else if (alreadyIn !== 0) {
        // Move the existing entry to the front so the LLM sees it first.
        const existing = top[alreadyIn]
        if (existing !== undefined) {
          top.splice(alreadyIn, 1)
          top.unshift(existing)
        }
      }
    }
  }

  return top
}

/** Test-only — purge the decoded-embedding cache (e.g. between unit tests). */
export function _resetRetrievalCacheForTests(): void {
  decodedCache.clear()
}
