import { create } from 'zustand'
import type {
  AppConfig,
  AppearanceConfig,
  ASRConfig,
  StorageConfig,
} from '@shared/types'
import type { LLMProvider } from '@shared/types'
import type { HotkeyConfig, HotkeyAction } from '@shared/types'

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
  updateSystemPrompt: (prompt: string) => Promise<void>
  setEnableHistoryContext: (enabled: boolean) => Promise<void>
}

// IPC 调用辅助 — 如果 window.electron 不存在则返回 mock
function ipcInvoke(channel: string, ...args: unknown[]): Promise<unknown> {
  if (window.electron?.ipcRenderer) {
    return window.electron.ipcRenderer.invoke(channel, ...args)
  }
  // 开发阶段 fallback
  console.warn(`[settingsStore] IPC not available: ${channel}`, args)
  return Promise.resolve(null)
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  config: null,
  loading: false,
  saving: false,

  loadConfig: async () => {
    set({ loading: true })
    try {
      const config = (await ipcInvoke('config:get')) as AppConfig | null
      if (config) {
        set({ config })
      }
    } finally {
      set({ loading: false })
    }
  },

  updateLLMProvider: async (key, provider) => {
    const { config } = get()
    if (!config) return
    const updated = {
      ...config,
      llm: { ...config.llm, [key]: provider },
    }
    set({ config: updated, saving: true })
    await ipcInvoke('config:set', updated)
    set({ saving: false })
  },

  updateASR: async (asr) => {
    const { config } = get()
    if (!config) return
    const updated = { ...config, asr: { ...config.asr, ...asr } }
    set({ config: updated, saving: true })
    await ipcInvoke('config:set', updated)
    set({ saving: false })
  },

  updateHotkey: async (action, accelerator) => {
    const { config } = get()
    if (!config) return
    const updated = {
      ...config,
      hotkeys: { ...config.hotkeys, [action]: accelerator },
    }
    set({ config: updated, saving: true })
    await ipcInvoke('config:set', updated)
    set({ saving: false })
  },

  resetHotkeys: async () => {
    await ipcInvoke('hotkey:reset')
    await get().loadConfig()
  },

  updateAppearance: async (appearance) => {
    const { config } = get()
    if (!config) return
    const updated = {
      ...config,
      appearance: { ...config.appearance, ...appearance },
    }
    set({ config: updated, saving: true })
    await ipcInvoke('config:set', updated)
    set({ saving: false })
  },

  updateStorage: async (storage) => {
    const { config } = get()
    if (!config) return
    const updated = {
      ...config,
      storage: { ...config.storage, ...storage },
    }
    set({ config: updated, saving: true })
    await ipcInvoke('config:set', updated)
    set({ saving: false })
  },

  updateSystemPrompt: async (prompt) => {
    const { config } = get()
    if (!config) return
    const updated = { ...config, systemPrompt: prompt }
    set({ config: updated, saving: true })
    await ipcInvoke('config:set', updated)
    set({ saving: false })
  },

  setEnableHistoryContext: async (enabled) => {
    const { config } = get()
    if (!config) return
    const updated = { ...config, enableHistoryContext: enabled }
    set({ config: updated, saving: true })
    await ipcInvoke('config:set', updated)
    set({ saving: false })
  },
}))
