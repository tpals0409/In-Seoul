// Final prompt assembler. Pure: no fetch, no IO.
//
// Char budget (sprint-1 task-4): 8,000 chars hard cap. Mandatory sections
// (system + sanitized user context + question) are always included. Optional
// sections compete for the remainder with priority chunks > recentChat:
//   - chunks  → fed first up to remaining budget (RAG citations are the most
//     valuable signal for grounded answers)
//   - recent  → only what fits after chunks; chat tail truncated head-first
// Rationale: 8,000 chars ≈ 2,000 input tokens at ~4 chars/token (Korean+English)
// — well under on-device LLM context windows and keeps prompt logging/screenshot
// surface area bounded.

import type { AdvisorContext, ChatMsg } from '@/types/contracts'
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

/** 8,000 chars ≈ 2,000 input tokens (4 chars/token, KR+EN mix). */
export const MAX_PROMPT_CHARS = 8_000

/** 섹션 헤더/라벨/줄바꿈 오버헤드 추정. 실제는 ~120, 여유 두고 200. */
const HEADER_OVERHEAD = 200

function renderChunks(chunks: PromptChunk[], remainingChars: number): string {
  if (chunks.length === 0 || remainingChars <= 0) return ''
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

/**
 * recentChat 을 budget 안에 들어오는 만큼 *끝에서부터* 채운다. 가장 최근 메시지가
 * 유지되고 오래된 메시지부터 절단된다 — 직전 문맥이 답변 품질에 가장 중요.
 */
function renderRecentChatWithBudget(
  recentChat: ChatMsg[],
  budget: number,
): string {
  if (budget <= 0 || recentChat.length === 0) return ''
  const candidates = recentChat.slice(-4)
  const lines: string[] = []
  let used = 0
  for (let i = candidates.length - 1; i >= 0; i--) {
    const m = candidates[i]
    if (!m) continue
    const line = `${m.role}: ${m.content}`
    // +1 for the joining "\n"
    const cost = line.length + (lines.length > 0 ? 1 : 0)
    if (used + cost > budget) break
    lines.unshift(line)
    used += cost
  }
  return lines.join('\n')
}

export function buildPrompt(args: BuildPromptArgs): string {
  const { question, ctx, chunks } = args
  const userContext = summarizeAdvisorContext(ctx)

  // Mandatory sections always included — system + user ctx + question + headers.
  const mandatorySize =
    SYSTEM_PROMPT_KO.length +
    userContext.length +
    question.length +
    HEADER_OVERHEAD
  const optionalBudget = Math.max(0, MAX_PROMPT_CHARS - mandatorySize)

  // chunks 우선 — RAG 인용이 답변 grounding 에 가장 중요.
  const chunksBlock = renderChunks(chunks, optionalBudget)
  // recentChat 후순위 — chunks 가 쓰고 남은 예산 안에서만, +2 는 섹션 사이 "\n\n".
  const recentBudget = Math.max(
    0,
    optionalBudget - chunksBlock.length - (chunksBlock.length > 0 ? 2 : 0),
  )
  const recent = renderRecentChatWithBudget(ctx.recentChat, recentBudget)

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
