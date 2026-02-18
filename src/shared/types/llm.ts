/** LLM 供应商配置 */
export interface LLMProvider {
  id: string
  name: string
  baseURL: string
  apiKey: string
  model: string
  maxTokens: number
  temperature: number
}

/** LLM 供应商预设（不含用户凭证） */
export interface LLMProviderPreset {
  id: string
  name: string
  baseURL: string
  defaultModel: string
  models: string[]
}

/** 聊天消息 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ChatMessageContent[]
}

/** 多模态消息内容 */
export type ChatMessageContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
