import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/types/ipc'
import type { ConfigManager } from '@main/config/ConfigManager'

export function registerIPCHandlers(deps: { configManager: ConfigManager }): void {
  const { configManager } = deps

  // Window
  ipcMain.handle(IPC_CHANNELS.WINDOW_TOGGLE, async () => ({ success: true }))
  ipcMain.handle(IPC_CHANNELS.WINDOW_SET_OPACITY, async (_e, opacity: number) => ({ success: true, opacity }))
  ipcMain.handle(IPC_CHANNELS.WINDOW_GET_OPACITY, async () => ({ opacity: 0.85 }))

  // Screenshot
  ipcMain.handle(IPC_CHANNELS.SCREENSHOT_CAPTURE, async () => ({ success: false, error: 'Not implemented' }))

  // LLM
  ipcMain.handle(IPC_CHANNELS.LLM_CHAT, async (_e, _messages: unknown[]) => ({ success: false, error: 'Not implemented' }))
  ipcMain.handle(IPC_CHANNELS.LLM_ANALYZE_SCREENSHOT, async (_e, _img: string, _prompt?: string) => ({ success: false, error: 'Not implemented' }))
  ipcMain.handle(IPC_CHANNELS.LLM_TEST_CONNECTION, async () => ({ success: false, error: 'Not implemented' }))

  // ASR
  ipcMain.handle(IPC_CHANNELS.ASR_START, async () => ({ success: false, error: 'Not implemented' }))
  ipcMain.handle(IPC_CHANNELS.ASR_STOP, async () => ({ success: true }))
  ipcMain.handle(IPC_CHANNELS.ASR_STATUS, async () => ({ isRecording: false }))
  ipcMain.handle(IPC_CHANNELS.ASR_TEST_CONNECTION, async () => ({ success: false, error: 'Not implemented' }))

  // Session
  ipcMain.handle(IPC_CHANNELS.SESSION_START, async (_e, _company?: string, _position?: string) => ({ success: false, error: 'Not implemented' }))
  ipcMain.handle(IPC_CHANNELS.SESSION_STOP, async () => ({ success: true }))
  ipcMain.handle(IPC_CHANNELS.SESSION_LIST, async (_e, _options?: unknown) => ({ sessions: [], total: 0 }))
  ipcMain.handle(IPC_CHANNELS.SESSION_GET, async (_e, _id: string) => null)
  ipcMain.handle(IPC_CHANNELS.SESSION_DELETE, async (_e, _id: string) => ({ success: false, error: 'Not implemented' }))
  ipcMain.handle(IPC_CHANNELS.SESSION_EXPORT, async (_e, _id: string, _fmt: string) => ({ success: false, error: 'Not implemented' }))

  // Review
  ipcMain.handle(IPC_CHANNELS.REVIEW_GENERATE, async (_e, _id: string) => ({ success: false, error: 'Not implemented' }))
  ipcMain.handle(IPC_CHANNELS.REVIEW_GET, async (_e, _id: string) => null)

  // Config (fully implemented)
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, async (_e, key: string) => configManager.get(key as never))
  ipcMain.handle(IPC_CHANNELS.CONFIG_SET, async (_e, key: string, value: unknown) => { configManager.set(key as never, value as never); return { success: true } })
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET_SECURE, async (_e, key: string) => configManager.getSecure(key))
  ipcMain.handle(IPC_CHANNELS.CONFIG_SET_SECURE, async (_e, key: string, value: string) => { await configManager.setSecure(key, value); return { success: true } })
  ipcMain.handle(IPC_CHANNELS.CONFIG_DELETE_SECURE, async (_e, key: string) => ({ success: await configManager.deleteSecure(key) }))
  ipcMain.handle(IPC_CHANNELS.CONFIG_RESET, async () => { configManager.resetToDefaults(); return { success: true } })
  ipcMain.handle(IPC_CHANNELS.CONFIG_EXPORT, async () => configManager.exportConfig())
  ipcMain.handle(IPC_CHANNELS.CONFIG_IMPORT, async (_e, config: unknown) => { configManager.importConfig(config as never); return { success: true } })

  // Hotkey
  ipcMain.handle(IPC_CHANNELS.HOTKEY_GET_ALL, async () => configManager.getHotkeys())
  ipcMain.handle(IPC_CHANNELS.HOTKEY_UPDATE, async (_e, action: string, accelerator: string) => {
    const hotkeys = configManager.getHotkeys();
    (hotkeys as Record<string, string>)[action] = accelerator
    configManager.setHotkeys(hotkeys)
    return { success: true }
  })
  ipcMain.handle(IPC_CHANNELS.HOTKEY_RESET, async () => ({ success: true }))
  ipcMain.handle(IPC_CHANNELS.HOTKEY_CHECK_CONFLICT, async (_e, _acc: string) => ({ hasConflict: false }))

  // Audio
  ipcMain.handle(IPC_CHANNELS.AUDIO_LIST_DEVICES, async () => [])
  ipcMain.handle(IPC_CHANNELS.AUDIO_CHECK_BLACKHOLE, async () => ({ available: false }))
}
