import { z } from 'zod'
import { SCHEMA_VERSION } from '@/types/contracts'

/**
 * 시뮬레이션 입력값 스키마. 단위는 만원/% 그대로.
 * 영구저장 경계와 wizard 의 "다음" 버튼 클릭 시점에서 검증한다.
 */
export const SimulationDataSchema = z.object({
  assets: z.object({
    cash: z.number().int().min(0).max(10_000_000),
    invest: z.number().int().min(0).max(10_000_000),
    etc: z.number().int().min(0).max(10_000_000),
  }),
  monthlyIncome: z.number().int().min(0).max(100_000),
  monthlyExpense: z.number().int().min(0).max(100_000),
  monthlySaving: z.number().int().min(0).max(10_000),
  goalDistrict: z.string().min(1).max(20),
  goalArea: z.number().int().min(5).max(80),
  goalPriceM: z.number().int().min(1_000).max(1_000_000),
  ltv: z.number().min(20).max(70),
  dsr: z.number().min(20).max(60),
  rate: z.number().min(0.5).max(12),
  growth: z.number().min(0).max(10),
  returnRate: z.number().min(0).max(15),
})

export const PersonaKeySchema = z.enum(['early', 'mid', 'senior'])
export const ScenarioKeySchema = z.enum(['safe', 'base', 'bold'])

export const ScenarioTweaksSchema = SimulationDataSchema.pick({
  growth: true,
  returnRate: true,
  rate: true,
  ltv: true,
  dsr: true,
}).partial()

export const PersistedStateSchema = z.object({
  v: z.literal(SCHEMA_VERSION),
  data: SimulationDataSchema,
  scenario: ScenarioKeySchema,
  persona: PersonaKeySchema,
  scenarioTweaks: ScenarioTweaksSchema.optional(),
})
