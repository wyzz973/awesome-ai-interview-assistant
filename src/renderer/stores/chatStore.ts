import { create } from 'zustand'

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
      console.error('[Chat] LLM stream error:', error)
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
        console.error('[Chat] LLM chat failed:', result.error)
        endStream()
        cleanup()
      }
    } catch (err) {
      console.error('[Chat] LLM chat error:', err)
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
