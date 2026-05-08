// Barrel — public surface of the RAG retrieval subsystem.

export { embedQuery, getExtractor, RAG_EMBEDDING_DIM, RAG_EMBEDDING_MODEL } from './embed'
export { decodeEmbedding, loadKnowledgeIndex } from './index-loader'
export { retrieve } from './retrieve'
export type {
  KnowledgeChunk,
  KnowledgeFile,
  KnowledgeIndex,
  RetrievalResult,
} from './types'
