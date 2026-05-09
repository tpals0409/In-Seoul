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

/** 출처 헤더 외에 의미있는 본문 일부를 보존하기 위한 최소 content 길이 */
const MIN_CHUNK_CONTENT_CHARS = 40

function renderChunks(chunks: PromptChunk[], remainingChars: number): string {
  if (chunks.length === 0 || remainingChars <= 0) return ''
  const rendered: string[] = []
  let used = 0
  for (const c of chunks) {
    const sep = rendered.length > 0 ? 2 : 0
    const header = `[출처: ${c.id}]\n`
    const block = header + c.content
    const cost = block.length + sep
    if (used + cost <= remainingChars) {
      rendered.push(block)
      used += cost
      continue
    }
    // budget 부족: 첫 chunk 도 통째로 drop 하지 않도록 부분 truncate.
    // 헤더는 인용 출처 식별자라 절대 자르지 않고, 본문만 잘라 일부라도 보존한다.
    const remain = remainingChars - used - sep
    const contentBudget = remain - header.length
    if (contentBudget >= MIN_CHUNK_CONTENT_CHARS) {
      rendered.push(header + c.content.slice(0, contentBudget))
    }
    // 부분 보존했든 아예 못 했든, 다음 chunk 부터는 더 들어갈 자리 없음 → 종료.
    break
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

  const out = sections.join('\n')
  // Hard cap 보증: question 이 비정상적으로 길거나 시스템/사용자 컨텍스트 합이
  // budget 산정과 어긋날 때도 최종 출력은 절대 MAX_PROMPT_CHARS 를 넘지 않는다.
  // 마지막 [답변] 빈줄 영역이 절단되더라도 LLM 은 EOS 까지 자기 회귀로 채운다.
  return out.length > MAX_PROMPT_CHARS ? out.slice(0, MAX_PROMPT_CHARS) : out
}
