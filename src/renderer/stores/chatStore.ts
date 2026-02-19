import { create } from 'zustand'
import { getLogger } from '../utils/logger'

const log = getLogger('chatStore')

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  /** 截屏消息附带的图片路径 */
  screenshotPath?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api as {
  llmChat: (messages: { role: string; content: string }[]) => Promise<{ success: boolean; error?: string }>
  llmAnalyzeScreenshot: (imageBase64: string, prompt?: string) => Promise<{ success: boolean; error?: string }>
  onLLMStreamChunk: (cb: (chunk: string) => void) => () => void
  onLLMStreamEnd: (cb: () => void) => () => void
  onLLMStreamError: (cb: (error: string) => void) => () => void
} | undefined

interface ChatState {
  messages: ChatMessage[]
  isStreaming: boolean
  currentStreamText: string
  enableHistory: boolean

  addUserMessage: (content: string, screenshotPath?: string) => void
  sendMessage: (content: string) => Promise<void>
  sendScreenshot: (imageBase64: string, prompt?: string) => Promise<void>
  startStream: () => void
  appendStreamChunk: (chunk: string) => void
  endStream: () => void
  setEnableHistory: (enabled: boolean) => void
  clearMessages: () => void
}

let msgId = 0

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  currentStreamText: '',
  enableHistory: false,

  addUserMessage: (content, screenshotPath) => {
    const message: ChatMessage = {
      id: `msg-${++msgId}`,
      role: 'user',
      content,
      timestamp: Date.now(),
      screenshotPath,
    }
    set((state) => ({ messages: [...state.messages, message] }))
  },

  sendMessage: async (content) => {
    if (!api) return
    const { addUserMessage, startStream, appendStreamChunk, endStream, enableHistory } = get()

    addUserMessage(content)
    startStream()

    // 构建发送给 LLM 的消息列表
    const chatMessages: { role: string; content: string }[] = []
    if (enableHistory) {
      // 包含历史上下文（取最新的消息，含刚添加的）
      const current = get().messages
      for (const m of current) {
        chatMessages.push({ role: m.role, content: m.content })
      }
    } else {
      chatMessages.push({ role: 'user', content })
    }

    // 注册流式监听
    const offChunk = api.onLLMStreamChunk((chunk) => appendStreamChunk(chunk))
    const offEnd = api.onLLMStreamEnd(() => {
      endStream()
      cleanup()
    })
    const offError = api.onLLMStreamError((error) => {
      log.error('LLM 流式错误', error)
      endStream()
      cleanup()
    })

    function cleanup() {
      offChunk()
      offEnd()
      offError()
    }

    try {
      const result = await api.llmChat(chatMessages)
      if (!result.success) {
        log.error('LLM 聊天失败', result.error)
        endStream()
        cleanup()
      }
    } catch (err) {
      log.error('LLM 聊天异常', err)
      endStream()
      cleanup()
    }
  },

  sendScreenshot: async (imageBase64, prompt) => {
    if (!api) return
    const { addUserMessage, startStream, appendStreamChunk, endStream } = get()

    // 用 data URI 作为截屏缩略图路径
    const screenshotDataURI = `data:image/png;base64,${imageBase64}`
    addUserMessage(prompt || '请分析这张截图', screenshotDataURI)
    startStream()

    const offChunk = api.onLLMStreamChunk((chunk) => appendStreamChunk(chunk))
    const offEnd = api.onLLMStreamEnd(() => {
      endStream()
      cleanup()
    })
    const offError = api.onLLMStreamError((error) => {
      log.error('LLM 截屏分析流式错误', error)
      endStream()
      cleanup()
    })

    function cleanup() {
      offChunk()
      offEnd()
      offError()
    }

    try {
      const result = await api.llmAnalyzeScreenshot(imageBase64, prompt)
      if (!result.success) {
        log.error('LLM 截屏分析失败', result.error)
        endStream()
        cleanup()
      }
    } catch (err) {
      log.error('LLM 截屏分析异常', err)
      endStream()
      cleanup()
    }
  },

  startStream: () => {
    set({ isStreaming: true, currentStreamText: '' })
  },

  appendStreamChunk: (chunk) => {
    set((state) => ({ currentStreamText: state.currentStreamText + chunk }))
  },

  endStream: () => {
    const { currentStreamText } = get()
    if (currentStreamText) {
      const message: ChatMessage = {
        id: `msg-${++msgId}`,
        role: 'assistant',
        content: currentStreamText,
        timestamp: Date.now(),
      }
      set((state) => ({
        messages: [...state.messages, message],
        isStreaming: false,
        currentStreamText: '',
      }))
    } else {
      set({ isStreaming: false, currentStreamText: '' })
    }
  },

  setEnableHistory: (enabled) => {
    set({ enableHistory: enabled })
  },

  clearMessages: () => {
    set({ messages: [], currentStreamText: '', isStreaming: false })
  },
}))
