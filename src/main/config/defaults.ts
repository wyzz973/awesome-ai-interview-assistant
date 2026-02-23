import type { AppConfig } from '@shared/types/config'
import type { LLMProvider } from '@shared/types/llm'
import {
  ASR_PROVIDER_PRESETS,
  DEFAULT_WHISPER_STREAMING,
  DEFAULT_HOTKEYS,
  DEFAULT_APPEARANCE,
  DEFAULT_STORAGE,
  DEFAULT_SYSTEM_PROMPT,
} from '@shared/constants'

/** 默认 LLM Provider 配置（未填入 API Key） */
const DEFAULT_LLM_PROVIDER: LLMProvider = {
  id: 'openai',
  name: 'OpenAI',
  baseURL: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-5.2',
  maxTokens: 4096,
  temperature: 0.7,
}

/** 完整的默认应用配置 */
export const DEFAULT_APP_CONFIG: AppConfig = {
  onboardingCompleted: false,
  llm: {
    screenshot: { ...DEFAULT_LLM_PROVIDER },
    chat: { ...DEFAULT_LLM_PROVIDER },
    review: { ...DEFAULT_LLM_PROVIDER },
  },
  asr: {
    provider: 'whisper',
    language: 'zh-en',
    sampleRate: 16000,
    whisper: {
      id: ASR_PROVIDER_PRESETS[0].id,
      name: ASR_PROVIDER_PRESETS[0].name,
      baseURL: ASR_PROVIDER_PRESETS[0].baseURL,
      apiKey: '',
      model: ASR_PROVIDER_PRESETS[0].defaultModel,
      streaming: { ...DEFAULT_WHISPER_STREAMING },
    },
  },
  hotkeys: { ...DEFAULT_HOTKEYS },
  appearance: { ...DEFAULT_APPEARANCE },
  storage: { ...DEFAULT_STORAGE },
  programmingLanguage: 'auto',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  enableHistoryContext: false,
  historyContextCount: 5,
}

/** Keychain 服务名 */
export const KEYCHAIN_SERVICE = 'ai-interview-assistant'
