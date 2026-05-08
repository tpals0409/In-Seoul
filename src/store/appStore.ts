import { create } from 'zustand'
import type {
  AiContext,
  HelpTopic,
  PersonaKey,
  PersistedState,
  ScenarioKey,
  ScenarioTweaks,
  Screen,
  SimulationData,
  WizardStep,
} from '@/types/contracts'
import { SCHEMA_VERSION } from '@/types/contracts'
import { PERSONAS } from '@/data/personas'
import { loadPersisted, savePersisted, wipePersisted } from './persistence'

interface SheetState {
  aiOpen: boolean
  aiCtx: AiContext | null
  aiPrefill: string
  helpTopic: HelpTopic | null
  resetOpen: boolean
  calculating: boolean
}

interface AppStore {
  // persisted
  persona: PersonaKey
  scenario: ScenarioKey
  data: SimulationData
  scenarioTweaks: ScenarioTweaks | undefined
  // ephemeral UI
  screen: Screen
  wizardStep: WizardStep
  ui: SheetState
  // actions
  setPersona: (k: PersonaKey) => void
  setScenario: (s: ScenarioKey) => void
  setData: (d: SimulationData) => void
  patchData: (patch: Partial<SimulationData>) => void
  setScenarioTweaks: (t: ScenarioTweaks | undefined) => void
  setScreen: (s: Screen) => void
  setWizardStep: (n: WizardStep) => void
  openAi: (ctx: AiContext, prefill?: string) => void
  closeAi: () => void
  openHelp: (topic: HelpTopic) => void
  closeHelp: () => void
  setResetOpen: (open: boolean) => void
  setCalculating: (b: boolean) => void
  resetAll: () => void
}

const DEFAULT_PERSONA: PersonaKey = 'mid'
const DEFAULT_SCENARIO: ScenarioKey = 'base'

const initial = (): Pick<AppStore, 'persona' | 'scenario' | 'data' | 'scenarioTweaks'> => {
  const persisted = loadPersisted()
  if (persisted) {
    return {
      persona: persisted.persona,
      scenario: persisted.scenario,
      data: persisted.data,
      scenarioTweaks: persisted.scenarioTweaks,
    }
  }
  const defaults = PERSONAS[DEFAULT_PERSONA].defaults
  return {
    persona: DEFAULT_PERSONA,
    scenario: DEFAULT_SCENARIO,
    data: structuredClone(defaults),
    scenarioTweaks: undefined,
  }
}

const init = initial()

const initialUi: SheetState = {
  aiOpen: false,
  aiCtx: null,
  aiPrefill: '',
  helpTopic: null,
  resetOpen: false,
  calculating: false,
}

export const useAppStore = create<AppStore>((set, get) => ({
  persona: init.persona,
  scenario: init.scenario,
  data: init.data,
  scenarioTweaks: init.scenarioTweaks,
  screen: 'welcome',
  wizardStep: 1,
  ui: initialUi,

  setPersona: (k) => {
    const defaults = PERSONAS[k].defaults
    set({ persona: k, data: structuredClone(defaults), scenarioTweaks: undefined })
    persist(get())
  },
  setScenario: (s) => {
    set({ scenario: s })
    persist(get())
  },
  setData: (d) => {
    set({ data: d })
    persist(get())
  },
  patchData: (patch) => {
    set((s) => ({ data: { ...s.data, ...patch } }))
    persist(get())
  },
  setScenarioTweaks: (t) => {
    set({ scenarioTweaks: t })
    persist(get())
  },
  setScreen: (s) => set({ screen: s }),
  setWizardStep: (n) => set({ wizardStep: n }),
  openAi: (ctx, prefill = '') =>
    set((s) => ({ ui: { ...s.ui, aiOpen: true, aiCtx: ctx, aiPrefill: prefill } })),
  closeAi: () => set((s) => ({ ui: { ...s.ui, aiOpen: false, aiCtx: null, aiPrefill: '' } })),
  openHelp: (topic) => set((s) => ({ ui: { ...s.ui, helpTopic: topic } })),
  closeHelp: () => set((s) => ({ ui: { ...s.ui, helpTopic: null } })),
  setResetOpen: (open) => set((s) => ({ ui: { ...s.ui, resetOpen: open } })),
  setCalculating: (b) => set((s) => ({ ui: { ...s.ui, calculating: b } })),

  resetAll: () => {
    wipePersisted()
    const defaults = PERSONAS[DEFAULT_PERSONA].defaults
    set({
      persona: DEFAULT_PERSONA,
      scenario: DEFAULT_SCENARIO,
      data: structuredClone(defaults),
      scenarioTweaks: undefined,
      screen: 'welcome',
      wizardStep: 1,
      ui: { ...initialUi },
    })
  },
}))

function persist(s: AppStore): void {
  const snapshot: PersistedState = {
    v: SCHEMA_VERSION,
    persona: s.persona,
    scenario: s.scenario,
    data: s.data,
    ...(s.scenarioTweaks !== undefined ? { scenarioTweaks: s.scenarioTweaks } : {}),
  }
  savePersisted(snapshot)
}
