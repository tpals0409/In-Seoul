// Lazy-loaded embedding pipeline (multilingual MiniLM, 384 dims).
// Used only at query time. The transformers.js library (~300KB+ ONNX runtime)
// is dynamically imported on first call so the main bundle stays slim.

import type {
  FeatureExtractionPipeline,
  Tensor,
} from '@xenova/transformers'

const EMBEDDING_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'
const EMBEDDING_DIM = 384

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null

async function loadExtractorOnce(): Promise<FeatureExtractionPipeline> {
  // Dynamic import — Vite emits transformers.js into a separate chunk that
  // loads only when the user actually triggers RAG retrieval.
  const transformers = await import('@xenova/transformers')
  const tryLoad = async (): Promise<FeatureExtractionPipeline> => {
    const p = await transformers.pipeline('feature-extraction', EMBEDDING_MODEL)
    return p as FeatureExtractionPipeline
  }
  try {
    return await tryLoad()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[rag/embed] pipeline load failed (${msg}). Retrying once…`)
    return await tryLoad()
  }
}

/** Returns the singleton FeatureExtractionPipeline, loading it on first call. */
export function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (extractorPromise === null) {
    extractorPromise = loadExtractorOnce().catch((err: unknown) => {
      // Reset so a future call may retry from scratch.
      extractorPromise = null
      throw err instanceof Error ? err : new Error(String(err))
    })
  }
  return extractorPromise
}

/**
 * Embed a single query string with mean pooling + L2 normalization.
 * Returns a length-384 Float32Array (caller may treat dot product as cosine).
 */
export async function embedQuery(text: string): Promise<Float32Array> {
  const extractor = await getExtractor()
  const tensor: Tensor = await extractor(text, {
    pooling: 'mean',
    normalize: true,
  })
  const data: unknown = tensor.data
  if (!(data instanceof Float32Array)) {
    throw new Error(
      '[rag/embed] Embedding tensor data is not a Float32Array.',
    )
  }
  if (data.length < EMBEDDING_DIM) {
    throw new Error(
      `[rag/embed] Embedding tensor too small: expected >= ${String(EMBEDDING_DIM)}, got ${String(data.length)}.`,
    )
  }
  // Copy so we own the buffer independently of the tensor's lifetime.
  return new Float32Array(data.subarray(0, EMBEDDING_DIM))
}

export const RAG_EMBEDDING_MODEL = EMBEDDING_MODEL
export const RAG_EMBEDDING_DIM = EMBEDDING_DIM
