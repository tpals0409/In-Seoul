// Composes RAG retrieval, prompt building, the LLM hook, and the template
// fallback into a single `ask` interface for screens.

import { useCallback, useState } from 'react'
import type {
  AdvisorContext,
  ChatMsg,
  LLMState,
  RetrievalResult,
} from '@/types/contracts'
import { loadKnowledgeIndex, retrieve } from '@/ai/rag'
import { buildPrompt, type PromptChunk } from '../prompt/build'
import { templateAnswerFor } from '../fallback/templates'
import { useLLM } from './useLLM'

export interface AdvisorState {
  llm: LLMState
}

export interface UseAdvisorResult {
  state: AdvisorState
  history: ChatMsg[]
  ensureReady: () => Promise<void>
  /** signal 가 abort 되면 토큰 스트리밍 + history 반영을 즉시 중단. */
  ask: (
    question: string,
    ctx: AdvisorContext,
    signal?: AbortSignal,
  ) => AsyncIterable<string>
  clearHistory: () => void
}

function makeMsgId(): string {
  return `msg_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`
}

/** Mirror the prototype's chunk-step animation: split full text into ~40 frames. */
function* splitForStream(full: string): Generator<string> {
  if (full.length === 0) return
  const stepSize = Math.max(1, Math.floor(full.length / 40))
  let i = 0
  let last = 0
  while (i < full.length) {
    i = Math.min(full.length, i + stepSize)
    yield full.slice(last, i)
    last = i
  }
}

function chunksFromRetrieval(results: RetrievalResult[]): PromptChunk[] {
  return results.map((r) => ({
    id: r.chunk.id,
    heading: r.chunk.heading,
    content: r.chunk.content,
  }))
}

/** RAG 인덱스 + 검색. 실패해도 advisor 흐름은 계속되어야 하므로 [] 폴백. */
async function retrieveSafely(question: string): Promise<RetrievalResult[]> {
  try {
    const index = await loadKnowledgeIndex()
    return await retrieve(question, index, 4)
  } catch {
    return []
  }
}

export function useAdvisor(): UseAdvisorResult {
  const { state: llmState, ensureReady, generate } = useLLM()
  const [history, setHistory] = useState<ChatMsg[]>([])

  const ask = useCallback(
    (
      question: string,
      ctx: AdvisorContext,
      signal?: AbortSignal,
    ): AsyncIterable<string> => {
      const userMsg: ChatMsg = {
        id: makeMsgId(),
        role: 'user',
        content: question,
      }

      // history 반영은 정상 완료(또는 자연 에러) 시점에만 한다. abort 시
      // user/ai 둘 다 남기지 않아 "abort = 흔적 없음" 불변식을 유지한다.
      // recentChat 은 prompt 빌더용으로만 [...history, userMsg] 를 임시 합성.
      const enrichedCtx: AdvisorContext = {
        ...ctx,
        recentChat: [...ctx.recentChat, userMsg],
      }

      const aborted = (): boolean => signal?.aborted === true

      const generator = async function* (): AsyncGenerator<string, void, void> {
        let fullText = ''
        let errored = false

        // RAG: lazy-load index + retrieve; failure → [] (template fallback uses no chunks).
        const retrieval = await retrieveSafely(question)
        if (aborted()) return
        const chunks = chunksFromRetrieval(retrieval)

        if (llmState.status === 'ready') {
          // Streamed model path.
          const prompt = buildPrompt({ question, ctx: enrichedCtx, chunks })
          const queue: string[] = []
          let resolveNext: (() => void) | null = null
          let done = false
          let error: Error | null = null

          const flush = () => {
            if (resolveNext) {
              const r = resolveNext
              resolveNext = null
              r()
            }
          }

          const generatePromise = generate(prompt, (delta) => {
            if (aborted()) return
            queue.push(delta)
            fullText += delta
            flush()
          }, signal)
            .then(() => {
              done = true
              flush()
            })
            .catch((err: unknown) => {
              error = err instanceof Error ? err : new Error(String(err))
              done = true
              flush()
            })

          while (!done || queue.length > 0) {
            if (aborted()) {
              await generatePromise.catch(() => undefined)
              return
            }
            if (queue.length === 0 && !done) {
              await new Promise<void>((res) => {
                resolveNext = res
              })
              continue
            }
            const next = queue.shift()
            if (next !== undefined && next.length > 0) {
              yield next
            }
          }
          await generatePromise
          if (error !== null) {
            const e: Error = error
            if (e.name !== 'AbortError') errored = true
          }
        }

        if (aborted()) return

        if (llmState.status !== 'ready' || errored) {
          // Fallback path: template answer with simulated streaming.
          const reply = templateAnswerFor(question, enrichedCtx)
          fullText = reply
          for (const piece of splitForStream(reply)) {
            if (aborted()) return
            yield piece
            await new Promise<void>((res) => setTimeout(res, 22))
          }
        }

        if (aborted()) return

        const aiMsg: ChatMsg = {
          id: makeMsgId(),
          role: 'ai',
          content: fullText,
        }
        // 정상 완료: 사용자 질문 + AI 응답을 한 번에 history 에 commit.
        setHistory((prev) => [...prev, userMsg, aiMsg])
      }

      return generator()
    },
    [llmState.status, generate],
  )

  const clearHistory = useCallback(() => {
    setHistory([])
  }, [])

  return {
    state: { llm: llmState },
    history,
    ensureReady,
    ask,
    clearHistory,
  }
}
