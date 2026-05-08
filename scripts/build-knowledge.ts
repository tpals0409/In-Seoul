/**
 * build-knowledge.ts — Build-time RAG index generator.
 *
 * Reads the 6 markdown files under src/knowledge/docs/, splits them by H2
 * headings (with paragraph-level sub-splitting + token overlap when a section
 * exceeds the chunk budget), embeds each chunk with the multilingual MiniLM
 * model, and emits public/knowledge/index.json conforming to KnowledgeIndex.
 *
 * Run via: npm run build:knowledge
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Buffer } from 'node:buffer'
import { performance } from 'node:perf_hooks'

import {
  AutoTokenizer,
  pipeline,
  type FeatureExtractionPipeline,
  type PreTrainedTokenizer,
  type Tensor,
} from '@xenova/transformers'

import type {
  KnowledgeChunk,
  KnowledgeFile,
  KnowledgeIndex,
} from '../src/types/contracts.ts'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMBEDDING_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'
const EMBEDDING_DIM = 384
const MAX_TOKENS_PER_CHUNK = 500
const OVERLAP_TOKENS = 50

const KNOWLEDGE_FILES: readonly KnowledgeFile[] = [
  'calculation_logic',
  'financial_concepts',
  'loan_products',
  'seoul_districts',
  'strategies',
  'risk_disclaimer',
] as const

// ---------------------------------------------------------------------------
// Path helpers (ESM-friendly)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const APP_ROOT = resolve(__dirname, '..')
const DOCS_DIR = resolve(APP_ROOT, 'src/knowledge/docs')
const OUT_DIR = resolve(APP_ROOT, 'public/knowledge')
const OUT_PATH = resolve(OUT_DIR, 'index.json')

// ---------------------------------------------------------------------------
// Types (build-script local)
// ---------------------------------------------------------------------------

interface RawSection {
  heading: string
  body: string // body paragraphs only (no heading line)
}

interface PreparedChunk {
  file: KnowledgeFile
  heading: string
  content: string // includes the `## heading` prefix line
  tokenCount: number
}

// ---------------------------------------------------------------------------
// Slug + token helpers
// ---------------------------------------------------------------------------

/** Slugify a heading: keep word chars (Unicode), collapse whitespace to '-'. */
function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Count tokens via the model's own tokenizer (excluding special tokens). */
function countTokens(tokenizer: PreTrainedTokenizer, text: string): number {
  const ids = tokenizer.encode(text, null, { add_special_tokens: false })
  return ids.length
}

// ---------------------------------------------------------------------------
// Markdown splitting
// ---------------------------------------------------------------------------

/**
 * Split a markdown document by `^## ` H2 headings.
 * Lines before the first H2 (e.g. the H1 title) are discarded.
 */
function splitByH2(markdown: string): RawSection[] {
  const lines = markdown.split(/\r?\n/)
  const sections: RawSection[] = []
  let currentHeading: string | null = null
  let currentBody: string[] = []

  const flush = (): void => {
    if (currentHeading !== null) {
      sections.push({
        heading: currentHeading,
        body: currentBody.join('\n').trim(),
      })
    }
  }

  for (const line of lines) {
    const match = /^##\s+(.+?)\s*$/.exec(line)
    if (match !== null && typeof match[1] === 'string') {
      flush()
      currentHeading = match[1].trim()
      currentBody = []
    } else if (currentHeading !== null) {
      currentBody.push(line)
    }
  }
  flush()
  return sections
}

/** Split a body into non-empty paragraph blocks (separated by blank lines). */
function splitParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

/**
 * Take the trailing N tokens of `text` (decoded back to string) for overlap.
 * Falls back to character-based slice if decoding produces nothing.
 */
function tailOverlap(
  tokenizer: PreTrainedTokenizer,
  text: string,
  overlapTokens: number,
): string {
  if (overlapTokens <= 0) return ''
  const ids = tokenizer.encode(text, null, { add_special_tokens: false })
  if (ids.length <= overlapTokens) return text
  const tailIds = ids.slice(ids.length - overlapTokens)
  const decoded = tokenizer.decode(tailIds, {
    skip_special_tokens: true,
    clean_up_tokenization_spaces: true,
  })
  return decoded.trim()
}

/**
 * Sub-split an oversized H2 section by paragraphs.
 * Each output content already includes the `## heading` line so the embedding
 * captures structural context.
 */
function subSplitSection(
  file: KnowledgeFile,
  heading: string,
  body: string,
  tokenizer: PreTrainedTokenizer,
): PreparedChunk[] {
  const headingLine = `## ${heading}`
  const headingTokens = countTokens(tokenizer, headingLine)
  const budget = Math.max(1, MAX_TOKENS_PER_CHUNK - headingTokens)
  const paragraphs = splitParagraphs(body)

  // Special case: single oversized paragraph → fall back to sentence-ish split.
  const blocks: string[] =
    paragraphs.length > 1
      ? paragraphs
      : splitParagraphs(body.replace(/([。.!?！？])\s+/g, '$1\n\n'))

  const chunks: PreparedChunk[] = []
  let buffer = ''
  let bufferTokens = 0
  let overlap = ''

  const flushBuffer = (): void => {
    if (buffer.trim().length === 0) return
    const content = `${headingLine}\n\n${buffer.trim()}`
    chunks.push({
      file,
      heading,
      content,
      tokenCount: countTokens(tokenizer, content),
    })
    overlap = tailOverlap(tokenizer, buffer, OVERLAP_TOKENS)
    buffer = ''
    bufferTokens = 0
  }

  for (const block of blocks) {
    const blockTokens = countTokens(tokenizer, block)

    // A single block that already exceeds budget gets emitted alone.
    if (blockTokens >= budget) {
      flushBuffer()
      const content = `${headingLine}\n\n${block.trim()}`
      chunks.push({
        file,
        heading,
        content,
        tokenCount: countTokens(tokenizer, content),
      })
      overlap = tailOverlap(tokenizer, block, OVERLAP_TOKENS)
      continue
    }

    if (bufferTokens === 0 && overlap.length > 0) {
      buffer = `${overlap}\n\n${block}`
      bufferTokens = countTokens(tokenizer, buffer)
      continue
    }

    const candidate = buffer.length > 0 ? `${buffer}\n\n${block}` : block
    const candidateTokens = countTokens(tokenizer, candidate)
    if (candidateTokens > budget) {
      flushBuffer()
      buffer = overlap.length > 0 ? `${overlap}\n\n${block}` : block
      bufferTokens = countTokens(tokenizer, buffer)
    } else {
      buffer = candidate
      bufferTokens = candidateTokens
    }
  }
  flushBuffer()

  return chunks
}

/** Build chunks for a single MD file. */
function chunkFile(
  file: KnowledgeFile,
  markdown: string,
  tokenizer: PreTrainedTokenizer,
): PreparedChunk[] {
  const sections = splitByH2(markdown)
  const out: PreparedChunk[] = []
  for (const section of sections) {
    const headingLine = `## ${section.heading}`
    const wholeContent = `${headingLine}\n\n${section.body}`.trim()
    const wholeTokens = countTokens(tokenizer, wholeContent)
    if (wholeTokens <= MAX_TOKENS_PER_CHUNK) {
      out.push({
        file,
        heading: section.heading,
        content: wholeContent,
        tokenCount: wholeTokens,
      })
    } else {
      out.push(...subSplitSection(file, section.heading, section.body, tokenizer))
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Embedding helpers
// ---------------------------------------------------------------------------

/** Convert a Float32Array to a base64 string (little-endian, 4 bytes per float). */
function floatsToBase64(floats: Float32Array): string {
  const bytes = new Uint8Array(
    floats.buffer,
    floats.byteOffset,
    floats.byteLength,
  )
  return Buffer.from(bytes).toString('base64')
}

/** Extract a Float32Array slice of the given length from a tensor's data. */
function tensorRowToFloat32(tensor: Tensor, rowLength: number): Float32Array {
  const data: unknown = tensor.data
  if (!(data instanceof Float32Array)) {
    throw new Error(
      `Embedding tensor data is not Float32Array (got ${Object.prototype.toString.call(data)}).`,
    )
  }
  if (data.length < rowLength) {
    throw new Error(
      `Embedding tensor too small: expected >= ${String(rowLength)}, got ${String(data.length)}.`,
    )
  }
  // Copy first row to a fresh Float32Array (decouples from tensor lifetime).
  return new Float32Array(data.subarray(0, rowLength))
}

/** Retry a fallible async op once before propagating. */
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[build-knowledge] ${label} failed (${msg}). Retrying once…`)
    return await fn()
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const t0 = performance.now()
  console.log('[build-knowledge] Loading tokenizer + embedding pipeline…')

  const tokenizer: PreTrainedTokenizer = await withRetry(
    'tokenizer download',
    () => AutoTokenizer.from_pretrained(EMBEDDING_MODEL),
  )

  const extractor: FeatureExtractionPipeline = await withRetry(
    'pipeline download',
    async () => {
      const p = await pipeline('feature-extraction', EMBEDDING_MODEL)
      return p as FeatureExtractionPipeline
    },
  )

  // ---- Read + chunk all 6 files ----
  const allChunks: PreparedChunk[] = []
  for (const file of KNOWLEDGE_FILES) {
    const path = resolve(DOCS_DIR, `${file}.md`)
    const md = await readFile(path, 'utf-8')
    const fileChunks = chunkFile(file, md, tokenizer)
    console.log(
      `[build-knowledge] ${file}.md → ${String(fileChunks.length)} chunk(s)`,
    )
    allChunks.push(...fileChunks)
  }

  // ---- Embed each chunk ----
  console.log(
    `[build-knowledge] Embedding ${String(allChunks.length)} chunk(s)…`,
  )
  const finalChunks: KnowledgeChunk[] = []
  const headingCounters = new Map<string, number>()
  let totalTokens = 0

  for (const c of allChunks) {
    const slug = slugify(c.heading)
    const counterKey = `${c.file}#${slug}`
    const idx = headingCounters.get(counterKey) ?? 0
    headingCounters.set(counterKey, idx + 1)

    const tensor = await extractor(c.content, {
      pooling: 'mean',
      normalize: true,
    })
    const vec = tensorRowToFloat32(tensor, EMBEDDING_DIM)

    const chunk: KnowledgeChunk = {
      id: `${c.file}#${slug}#${String(idx)}`,
      file: c.file,
      heading: c.heading,
      headingPath: [c.file, c.heading],
      content: c.content,
      tokenCount: c.tokenCount,
      embedding: floatsToBase64(vec),
    }
    finalChunks.push(chunk)
    totalTokens += c.tokenCount
  }

  // ---- Emit JSON ----
  const index: KnowledgeIndex = {
    version: 1,
    embeddingModel: EMBEDDING_MODEL,
    embeddingDim: EMBEDDING_DIM,
    chunks: finalChunks,
    builtAt: new Date().toISOString(),
  }

  await mkdir(OUT_DIR, { recursive: true })
  const json = JSON.stringify(index, null, 2)
  await writeFile(OUT_PATH, json, 'utf-8')
  const bytes = Buffer.byteLength(json, 'utf-8')

  const elapsedMs = Math.round(performance.now() - t0)
  console.log('[build-knowledge] Done.')
  console.log(
    `  files       : ${String(KNOWLEDGE_FILES.length)}\n` +
      `  chunks      : ${String(finalChunks.length)}\n` +
      `  totalTokens : ${String(totalTokens)}\n` +
      `  outputBytes : ${String(bytes)} (${(bytes / 1024).toFixed(1)} KB)\n` +
      `  outputPath  : ${OUT_PATH}\n` +
      `  elapsedMs   : ${String(elapsedMs)}`,
  )
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err)
  console.error('[build-knowledge] FAILED:', msg)
  process.exit(1)
})
