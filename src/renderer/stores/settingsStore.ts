import { create } from 'zustand'
import type {
  AppConfig,
  AppearanceConfig,
  ASRConfig,
  StorageConfig,
} from '@shared/types'
import type { LLMProvider, ProgrammingLanguagePreference } from '@shared/types'
import type { HotkeyConfig, HotkeyAction } from '@shared/types'
import { getLogger } from '../utils/logger'

const log = getLogger('settingsStore')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api as {
  configGet: (key: string) => Promise<unknown>
  configSet: (key: string, value: unknown) => Promise<unknown>
  configExport: () => Promise<AppConfig | null>
  configImport: (config: unknown) => Promise<unknown>
  configReset: () => Promise<unknown>
  hotkeyGetAll: () => Promise<HotkeyConfig | null>
  hotkeyUpdate: (action: string, accelerator: string) => Promise<unknown>
  hotkeyReset: () => Promise<unknown>
} | undefined

interface SettingsState {
  config: AppConfig | null
  loading: boolean
  saving: boolean

  loadConfig: () => Promise<void>
  updateLLMProvider: (key: 'screenshot' | 'chat' | 'review', provider: LLMProvider) => Promise<void>
  updateASR: (asr: Partial<ASRConfig>) => Promise<void>
  updateHotkey: (action: HotkeyAction, accelerator: string) => Promise<void>
  resetHotkeys: () => Promise<void>
  updateAppearance: (appearance: Partial<AppearanceConfig>) => Promise<void>
  updateStorage: (storage: Partial<StorageConfig>) => Promise<void>
  updateProgrammingLanguage: (language: ProgrammingLanguagePreference) => Promise<void>
  updateSystemPrompt: (prompt: string) => Promise<void>
  setEnableHistoryContext: (enabled: boolean) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  config: null,
  loading: false,
  saving: false,

  loadConfig: async () => {
    if (!api) {
      log.warn('IPC 不可用')
      return
    }
    // 首次加载时显示 loading，后续刷新在后台静默更新避免闪烁
    const isFirstLoad = !get().config
    if (isFirstLoad) {
      set({ loading: true })
    }
    try {
      const config = await api.configExport() as AppConfig | null
      if (config) {
        set({ config })
      }
    } finally {
      if (isFirstLoad) {
        set({ loading: false })
      }
    }
  },

  updateLLMProvider: async (key, provider) => {
    const { config } = get()
    if (!config || !api) return
    const updatedLLM = { ...config.llm, [key]: provider }
    const updated = { ...config, llm: updatedLLM }
    set({ config: updated, saving: true })
    try {
      await api.configSet('llm', updatedLLM)
    } finally {
      set({ saving: false })
    }
  },

  updateASR: async (asr) => {
    const { config } = get()
    if (!config || !api) return
    const updatedASR = { ...config.asr, ...asr }
    const updated = { ...config, asr: updatedASR }
    set({ config: updated, saving: true })
    try {
      await api.configSet('asr', updatedASR)
    } finally {
      set({ saving: false })
    }
  },

  updateHotkey: async (action, accelerator) => {
    const { config } = get()
    if (!config || !api) return
    const updatedHotkeys = { ...config.hotkeys, [action]: accelerator }
    const updated = { ...config, hotkeys: updatedHotkeys }
    set({ config: updated, saving: true })
    try {
      await api.hotkeyUpdate(action, accelerator)
    } finally {
      set({ saving: false })
    }
  },

  resetHotkeys: async () => {
    if (!api) return
    await api.hotkeyReset()
    await get().loadConfig()
  },

  updateAppearance: async (appearance) => {
    const { config } = get()
    if (!config || !api) return
    const updatedAppearance = { ...config.appearance, ...appearance }
    const updated = { ...config, appearance: updatedAppearance }
    set({ config: updated, saving: true })
    try {
      await api.configSet('appearance', updatedAppearance)
    } finally {
      set({ saving: false })
    }
  },

  updateStorage: async (storage) => {
    const { config } = get()
    if (!config || !api) return
    const updatedStorage = { ...config.storage, ...storage }
    const updated = { ...config, storage: updatedStorage }
    set({ config: updated, saving: true })
    try {
      await api.configSet('storage', updatedStorage)
    } finally {
      set({ saving: false })
    }
  },

  updateProgrammingLanguage: async (language) => {
    const { config } = get()
    if (!config || !api) return
    const updated = { ...config, programmingLanguage: language }
    set({ config: updated, saving: true })
    try {
      await api.configSet('programmingLanguage', language)
    } finally {
      set({ saving: false })
    }
  },

  updateSystemPrompt: async (prompt) => {
    const { config } = get()
    if (!config || !api) return
    const updated = { ...config, systemPrompt: prompt }
    set({ config: updated, saving: true })
    try {
      await api.configSet('systemPrompt', prompt)
    } finally {
      set({ saving: false })
    }
  },

  setEnableHistoryContext: async (enabled) => {
    const { config } = get()
    if (!config || !api) return
    const updated = { ...config, enableHistoryContext: enabled }
    set({ config: updated, saving: true })
    try {
      await api.configSet('enableHistoryContext', enabled)
    } finally {
      set({ saving: false })
    }
  },
}))
