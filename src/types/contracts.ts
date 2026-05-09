// InSeoul shared contracts — single source of truth for cross-role types.
// engine, screens, storage, ai 모두 이 파일을 참조한다. 임포트 외 파생 타입 금지.

// =============================================================================
// 1. Simulation domain (engine → all)
// =============================================================================

export type PersonaKey = 'early' | 'mid' | 'senior'
export type ScenarioKey = 'safe' | 'base' | 'bold'

/** 모든 금액은 만원 단위 (10,000 KRW). 비율은 % (예: ltv=40 → 40%). */
export interface Assets {
  cash: number
  invest: number
  etc: number
}

/** wizard 입력값. PERSONAS 로부터 시작해 사용자가 수정한다. */
export interface SimulationData {
  assets: Assets
  monthlyIncome: number
  monthlyExpense: number
  monthlySaving: number
  goalDistrict: string
  goalArea: number
  goalPriceM: number
  ltv: number
  dsr: number
  rate: number
  growth: number
  returnRate: number
}

/** 초기 프리셋. SimulationData 와 정체성(key/label/sub)을 분리해 결합도를 낮춘다.
 *  사용자가 wizard 에서 편집한 값은 PersistedState.data 로 흐르므로, Persona 는
 *  defaults 만 보유하고 시뮬은 simulate(data, ...) 처럼 SimulationData 만 받는다. */
export interface PersonaPreset {
  key: PersonaKey
  label: string
  sub: string
  defaults: SimulationData
}

export interface ScenarioAdjust {
  label: '안정' | '기준' | '적극'
  /** 추가될 growth 절대값 (예: +1.5 = growth+1.5%p) */
  growth: number
  returnRate: number
  rate: number
  sub: string
}

export interface SimResult {
  /** scenario 보정이 적용된 SimulationData (sp = "simulation persona") */
  sp: SimulationData
  /** 진입까지 걸리는 개월수. unreachable 시 240. */
  months: number
  reachable: boolean
  crossDate: Date
  /** 0..240 = 241개 포인트 */
  seriesAssets: number[]
  seriesGoal: number[]
  seriesAvail: number[]
  shortfallNow: number
  futurePrice: number
  futureLoan: number
  monthlyPayment: number
}

export type ActionEffectId = 'save' | 'ret' | 'price' | 'ltv'

export interface ActionEffect {
  id: ActionEffectId
  label: string
  sub: string
  delta: Partial<SimulationData>
  months: number
  /** base scenario 대비 단축된 개월수, ≥ 0 */
  savedMonths: number
}

export interface RiskEffect {
  monthlyPayBase: number
  monthlyPayHi: number
  monthlyPayDelta: number
  dsrBase: number
  dsrHi: number
}

// =============================================================================
// 2. UI navigation (App ↔ screens)
// =============================================================================

export type Screen =
  | 'welcome'
  | 'wizard'
  | 'result'
  | 'golden'
  | 'action'
  | 'risk'
  | 'calc'
  | 'stepping'
  | 'scenario-edit'

export type WizardStep = 1 | 2 | 3 | 4 | 5

export type AiContext =
  | 'general'
  | 'welcome'
  | 'result'
  | 'golden'
  | 'action'
  | 'risk'
  | 'calc'
  | 'stepping'
  | 'question'

export type HelpTopic = 'ltv' | 'dsr' | 'rate' | 'growth' | 'return' | 'tx-cost'

// =============================================================================
// 3. AI advisor contracts (screens ↔ ai)
// =============================================================================

export type ChatRole = 'user' | 'ai' | 'ai-stream' | 'context'

export interface ChatMsg {
  id: string
  role: ChatRole
  content: string
  /** 스트리밍 중 여부 (token-by-token 렌더). 완료 시 false. */
  streaming?: boolean | undefined
  /** 인용된 청크 ID (file#heading#i 형식) */
  citations?: string[] | undefined
}

export type LLMStatus =
  | 'idle'
  | 'unsupported'      // WebGPU 미지원 등
  | 'downloading'      // 모델 파일 다운로드 중
  | 'loading'          // worker 로 모델 로드 중
  | 'ready'
  | 'generating'
  | 'error'

export interface LLMState {
  status: LLMStatus
  /** 다운로드 진행률 0..1 */
  progress?: number | undefined
  errorMessage?: string | undefined
  /** Ollama 백엔드가 비-로컬 호스트 + VITE_ALLOW_REMOTE_LLM=1 명시 동의 상태로 동작 중일 때 true.
   *  사용자 데이터가 외부 서버로 전송되므로, UI 가 "⚠️ 원격 LLM 사용 중" 배지를 표시한다. */
  remote?: boolean | undefined
}

/** 목표 자치구의 실거래 중앙값 — 답변 grounding 용. snapshot 미로드 시 undefined. */
export interface MarketReference {
  district: string
  /** 매매 중앙값 (만원) */
  medianPrice: number
  /** 전세 중앙값 (만원) */
  medianJeonse: number
  /** ISO 시각 — 데이터 신선도 표기용 */
  asOf: string
}

/** screens 에서 ai sheet 를 열 때 컨텍스트로 넘기는 페이로드 */
export interface AdvisorContext {
  screen: Screen
  persona: PersonaKey
  scenarioKey: ScenarioKey
  /** 현재 wizard 입력 + scenario 보정된 결과 요약 */
  data: SimulationData
  sim: SimResult
  recentChat: ChatMsg[]
  /** 목표 자치구 실거래가. 로드되어 있으면 prompt 에 인용. */
  marketReference?: MarketReference | undefined
}

// =============================================================================
// 4. Persistence (storage → all)
// =============================================================================

export const SCHEMA_VERSION = 1 as const

/** ScenarioEdit 화면에서 조정 가능한 슬라이더 5종. exactOptionalPropertyTypes 환경에서
 *  zod 의 .partial() 출력(`{ k?: T | undefined }`)과 호환되도록 명시적 union 사용. */
export type ScenarioTweaks = {
  growth?: number | undefined
  returnRate?: number | undefined
  rate?: number | undefined
  ltv?: number | undefined
  dsr?: number | undefined
}

export interface PersistedState {
  v: typeof SCHEMA_VERSION
  data: SimulationData
  scenario: ScenarioKey
  persona: PersonaKey
  /** ScenarioEdit 화면에서 수정한 시나리오 슬라이더 값. 없으면 기본 SCENARIOS 사용. */
  scenarioTweaks?: ScenarioTweaks | undefined
}

// =============================================================================
// 5. Knowledge base / RAG (build script ↔ ai/rag)
// =============================================================================

/** 6개 MD 소스 파일 — knowledge/docs/<key>.md */
export type KnowledgeFile =
  | 'calculation_logic'
  | 'financial_concepts'
  | 'loan_products'
  | 'seoul_districts'
  | 'strategies'
  | 'risk_disclaimer'

export interface KnowledgeChunk {
  /** `${file}#${headingSlug}#${i}` */
  id: string
  file: KnowledgeFile
  /** 가장 가까운 H2 heading text */
  heading: string
  /** ['파일명', 'H2 heading', ...] */
  headingPath: string[]
  content: string
  tokenCount: number
  /** base64-encoded Float32Array of length=embeddingDim */
  embedding: string
}

export interface KnowledgeIndex {
  version: 1
  embeddingModel: string
  embeddingDim: number
  chunks: KnowledgeChunk[]
  builtAt: string
}

export interface RetrievalResult {
  chunk: KnowledgeChunk
  score: number
  matchedKeywords?: string[] | undefined
}

// =============================================================================
// 6. Constants used in tests / formulas
// =============================================================================

/** 시뮬 기준일 — 결정성 보장을 위해 고정. 변경 시 9개 스냅샷 재생성 필요. */
export const SIM_BASE_DATE_ISO = '2026-05-08T00:00:00.000Z' as const
/** 5% — 취득세 + 중개보수 + 등기 등 거래비용 비율 */
export const TX_COST_RATIO = 0.05
/** 30년 만기 (개월) — PMT 계산에 사용 */
export const LOAN_TERM_MONTHS = 360
/** 시뮬 최대 기간 */
export const MAX_MONTHS = 240
