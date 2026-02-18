import { create } from 'zustand'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  /** 截屏消息附带的图片路径 */
  screenshotPath?: string
}

interface ChatState {
  messages: ChatMessage[]
  isStreaming: boolean
  currentStreamText: string
  enableHistory: boolean

  addUserMessage: (content: string, screenshotPath?: string) => void
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
