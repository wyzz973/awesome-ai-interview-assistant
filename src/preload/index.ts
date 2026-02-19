import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '@shared/types/ipc'
import type { Session, TranscriptEntry, ScreenshotQA, ReviewReport } from '@shared/types/session'
import type { AppConfig } from '@shared/types/config'
import type { HotkeyConfig } from '@shared/types/hotkey'

const api = {
  // ── Window ──
  windowToggle: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_TOGGLE),
  windowSetOpacity: (opacity: number) => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_SET_OPACITY, opacity),
  windowGetOpacity: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_GET_OPACITY),

  // ── Screenshot ──
  screenshotCapture: () => ipcRenderer.invoke(IPC_CHANNELS.SCREENSHOT_CAPTURE),

  /** 截屏选区：确认选区 */
  selectorConfirm: (region: { x: number; y: number; width: number; height: number }) => {
    ipcRenderer.send('selector:confirm', region)
  },
  /** 截屏选区：取消选区 */
  selectorCancel: () => {
    ipcRenderer.send('selector:cancel')
  },
  /** 截屏选区：请求截图数据 */
  selectorRequestScreenshot: () => {
    ipcRenderer.send('selector:requestScreenshot')
  },
  /** 截屏选区：接收截图数据 */
  onSelectorScreenshot: (callback: (dataURL: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, dataURL: string) => callback(dataURL)
    ipcRenderer.on('selector:screenshot', handler)
    return () => ipcRenderer.removeListener('selector:screenshot', handler)
  },

  // ── LLM ──
  llmChat: (messages: unknown[]) => ipcRenderer.invoke(IPC_CHANNELS.LLM_CHAT, messages),
  llmAnalyzeScreenshot: (imageBase64: string, prompt?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.LLM_ANALYZE_SCREENSHOT, imageBase64, prompt),
  llmTestConnection: (override?: { baseURL: string; apiKey: string; model: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.LLM_TEST_CONNECTION, override),
  llmFetchModels: (baseURL: string, apiKey: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.LLM_FETCH_MODELS, baseURL, apiKey),

  /** LLM 流式推送监听 */
  onLLMStreamChunk: (callback: (chunk: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, chunk: string) => callback(chunk)
    ipcRenderer.on(IPC_CHANNELS.LLM_STREAM_CHUNK, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.LLM_STREAM_CHUNK, handler)
  },
  onLLMStreamEnd: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(IPC_CHANNELS.LLM_STREAM_END, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.LLM_STREAM_END, handler)
  },
  onLLMStreamError: (callback: (error: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, error: string) => callback(error)
    ipcRenderer.on(IPC_CHANNELS.LLM_STREAM_ERROR, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.LLM_STREAM_ERROR, handler)
  },

  // ── ASR ──
  asrStart: () => ipcRenderer.invoke(IPC_CHANNELS.ASR_START),
  asrStop: () => ipcRenderer.invoke(IPC_CHANNELS.ASR_STOP),
  asrStatus: () => ipcRenderer.invoke(IPC_CHANNELS.ASR_STATUS),
  asrTestConnection: () => ipcRenderer.invoke(IPC_CHANNELS.ASR_TEST_CONNECTION),

  /** ASR 转写结果推送监听 */
  onASRTranscript: (callback: (entry: TranscriptEntry) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, entry: TranscriptEntry) => callback(entry)
    ipcRenderer.on(IPC_CHANNELS.ASR_TRANSCRIPT, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ASR_TRANSCRIPT, handler)
  },

  // ── Session ──
  sessionStart: (company?: string, position?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SESSION_START, company, position),
  sessionStop: () => ipcRenderer.invoke(IPC_CHANNELS.SESSION_STOP),
  sessionList: (options?: { page?: number; pageSize?: number; status?: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.SESSION_LIST, options),
  sessionGet: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.SESSION_GET, id),
  sessionDelete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.SESSION_DELETE, id),
  sessionExport: (id: string, format: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SESSION_EXPORT, id, format),

  // ── Review ──
  reviewGenerate: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.REVIEW_GENERATE, sessionId),
  reviewGet: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.REVIEW_GET, sessionId),

  // ── Config ──
  configGet: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET, key),
  configSet: (key: string, value: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SET, key, value),
  configGetSecure: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET_SECURE, key),
  configSetSecure: (key: string, value: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SET_SECURE, key, value),
  configDeleteSecure: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_DELETE_SECURE, key),
  configReset: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_RESET),
  configExport: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_EXPORT),
  configImport: (config: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_IMPORT, config),

  // ── Hotkey ──
  hotkeyGetAll: () => ipcRenderer.invoke(IPC_CHANNELS.HOTKEY_GET_ALL),
  hotkeyUpdate: (action: string, accelerator: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.HOTKEY_UPDATE, action, accelerator),
  hotkeyReset: () => ipcRenderer.invoke(IPC_CHANNELS.HOTKEY_RESET),
  hotkeyCheckConflict: (accelerator: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.HOTKEY_CHECK_CONFLICT, accelerator),

  // ── Audio ──
  audioListDevices: () => ipcRenderer.invoke(IPC_CHANNELS.AUDIO_LIST_DEVICES),
  audioCheckBlackhole: () => ipcRenderer.invoke(IPC_CHANNELS.AUDIO_CHECK_BLACKHOLE),
  audioInstallBlackhole: () => ipcRenderer.invoke(IPC_CHANNELS.AUDIO_INSTALL_BLACKHOLE),

  // ── 主进程 → 渲染器 事件监听 ──
  onScreenshotCaptured: (callback: (data: { imageBase64: string; region?: unknown }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: { imageBase64: string; region?: unknown }) => callback(data)
    ipcRenderer.on('screenshot:captured', handler)
    return () => ipcRenderer.removeListener('screenshot:captured', handler)
  },
  onRecordingStarted: (callback: (data: { sessionId: string }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: { sessionId: string }) => callback(data)
    ipcRenderer.on('recording:started', handler)
    return () => ipcRenderer.removeListener('recording:started', handler)
  },
  onRecordingStopped: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('recording:stopped', handler)
    return () => ipcRenderer.removeListener('recording:stopped', handler)
  },
  onRecordingError: (callback: (data: { message: string }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: { message: string }) => callback(data)
    ipcRenderer.on('recording:error', handler)
    return () => ipcRenderer.removeListener('recording:error', handler)
  },
  onNavigate: (callback: (route: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, route: string) => callback(route)
    ipcRenderer.on('navigate', handler)
    return () => ipcRenderer.removeListener('navigate', handler)
  },
  onHotkeySendMessage: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('hotkey:sendMessage', handler)
    return () => ipcRenderer.removeListener('hotkey:sendMessage', handler)
  },
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
