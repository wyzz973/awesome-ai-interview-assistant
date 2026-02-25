import type { LLMProvider } from './llm'
import type { HotkeyConfig } from './hotkey'

/** ASR 供应商类型 */
export type ASRProviderType = 'aliyun' | 'tencent' | 'whisper' | 'google'

/** ASR 语言模式 */
export type ASRLanguage = 'zh' | 'en' | 'zh-en'

/** 录制启动门禁模式 */
export type RecordingGateMode = 'strict' | 'lenient'

/** 编程语言偏好（用于代码题默认输出语言） */
export type ProgrammingLanguagePreference =
  | 'auto'
  | 'python'
  | 'java'
  | 'javascript'
  | 'typescript'
  | 'go'
  | 'cpp'
  | 'c'
  | 'rust'
  | 'csharp'
  | 'kotlin'
  | 'swift'
  | 'php'

/** Whisper/OpenAI 兼容 ASR 流式参数 */
export interface WhisperStreamingConfig {
  /** 请求分段窗口长度（毫秒） */
  chunkLengthMs?: number
  /** 邻接片段重叠时长（毫秒） */
  overlapMs?: number
  /** 是否在说话过程中推送非最终结果 */
  emitPartial?: boolean
  /** 是否启用能量阈值 VAD */
  vadEnabled?: boolean
  /** VAD 能量阈值（0~1） */
  vadThreshold?: number
  /** 最短有效语音时长（毫秒） */
  minSpeechMs?: number
  /** 判定说话结束的静音时长（毫秒） */
  minSilenceMs?: number
}

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
    id: string
    name: string
    baseURL: string
    apiKey: string
    model: string
    streaming?: WhisperStreamingConfig
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
  programmingLanguage: ProgrammingLanguagePreference
  systemPrompt: string
  enableHistoryContext: boolean
  historyContextCount: number
  recordingGateMode: RecordingGateMode
}
