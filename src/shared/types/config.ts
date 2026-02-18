import type { LLMProvider } from './llm'
import type { HotkeyConfig } from './hotkey'

/** ASR 供应商类型 */
export type ASRProviderType = 'aliyun' | 'tencent' | 'whisper' | 'google'

/** ASR 语言模式 */
export type ASRLanguage = 'zh' | 'en' | 'zh-en'

/** ASR 配置 */
export interface ASRConfig {
  provider: ASRProviderType
  language: ASRLanguage
  sampleRate: number
  /** 阿里云 ASR 凭证 */
  aliyun?: {
    appKey: string
    accessKeyId: string
    accessKeySecret: string
  }
  /** 腾讯云 ASR 凭证 */
  tencent?: {
    appId: string
    secretId: string
    secretKey: string
  }
  /** Whisper API（复用 LLM 的 API Key） */
  whisper?: {
    baseURL: string
    apiKey: string
  }
}

/** 外观配置 */
export interface AppearanceConfig {
  theme: 'light' | 'dark' | 'system'
  opacity: number
  fontSize: number
  panelWidth: number
  panelHeight: number
  startPosition: { x: number; y: number } | 'center' | 'right'
}

/** 存储配置 */
export interface StorageConfig {
  dataDir: string
  screenshotRetentionDays: number
  maxDatabaseSizeMB: number
}

/** 应用总配置 */
export interface AppConfig {
  onboardingCompleted: boolean
  llm: {
    screenshot: LLMProvider
    chat: LLMProvider
    review: LLMProvider
  }
  asr: ASRConfig
  hotkeys: HotkeyConfig
  appearance: AppearanceConfig
  storage: StorageConfig
  systemPrompt: string
  enableHistoryContext: boolean
  historyContextCount: number
}
