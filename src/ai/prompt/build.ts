// Final prompt assembler. Pure: no fetch, no IO. Token budget enforced by
// crude character-count proxy (≈4 chars / token for Korean+English mix; we use
// 12,000 chars as a soft cap to stay under ~3,000 input tokens).

import type { AdvisorContext } from '@/types/contracts'
import { SYSTEM_PROMPT_KO } from './system'
import { summarizeAdvisorContext } from './context'

export interface PromptChunk {
  id: string
  heading: string
  content: string
}

export interface BuildPromptArgs {
  question: string
  ctx: AdvisorContext
  chunks: PromptChunk[]
}

/** ~3,000 tokens × 4 chars/token. Conservative for mixed Korean/English. */
const MAX_PROMPT_CHARS = 12_000

function renderChunks(chunks: PromptChunk[], remainingChars: number): string {
  if (chunks.length === 0) return ''
  const rendered: string[] = []
  let used = 0
  for (const c of chunks) {
    const block = `[출처: ${c.id}]\n${c.content}`
    // +2 for the joining "\n\n"
    const cost = block.length + (rendered.length > 0 ? 2 : 0)
    if (used + cost > remainingChars) break
    rendered.push(block)
    used += cost
  }
  return rendered.join('\n\n')
}

function renderRecentChat(ctx: AdvisorContext): string {
  const recent = ctx.recentChat.slice(-4)
  if (recent.length === 0) return ''
  return recent.map((m) => `${m.role}: ${m.content}`).join('\n')
}

export function buildPrompt(args: BuildPromptArgs): string {
  const { question, ctx, chunks } = args
  const userContext = summarizeAdvisorContext(ctx)
  const recent = renderRecentChat(ctx)

  // Compute a budget for chunks: subtract everything else from MAX_PROMPT_CHARS.
  const fixedSize =
    SYSTEM_PROMPT_KO.length +
    userContext.length +
    recent.length +
    question.length +
    // overhead for headers/labels (rough)
    160
  const chunkBudget = Math.max(0, MAX_PROMPT_CHARS - fixedSize)
  const chunksBlock = renderChunks(chunks, chunkBudget)

  const sections: string[] = []
  sections.push(`[시스템] ${SYSTEM_PROMPT_KO}`)
  sections.push('')
  sections.push('[참고자료]')
  sections.push(chunksBlock)
  sections.push('')
  sections.push('[사용자 상황]')
  sections.push(userContext)
  sections.push('')
  sections.push('[최근 대화]')
  sections.push(recent)
  sections.push('')
  sections.push(`[사용자 질문] ${question}`)
  sections.push('')
  sections.push('[답변]')
  sections.push('')

  return sections.join('\n')
}
