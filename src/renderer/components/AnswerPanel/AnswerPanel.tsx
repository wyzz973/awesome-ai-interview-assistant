import { useRef, useEffect, useState, type KeyboardEvent } from 'react'
import { Send, Trash2, History } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { IconButton } from '../Common'
import MessageBubble from './MessageBubble'
import StreamingText from './StreamingText'

export default function AnswerPanel() {
  const {
    messages,
    isStreaming,
    currentStreamText,
    enableHistory,
    addUserMessage,
    setEnableHistory,
    clearMessages,
  } = useChatStore()

  const [inputText, setInputText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, currentStreamText])

  const handleSend = () => {
    const text = inputText.trim()
    if (!text || isStreaming) return
    addUserMessage(text)
    setInputText('')
    // 重置 textarea 高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // textarea 自适应高度
  const handleInput = (value: string) => {
    setInputText(value)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }

  return (
    <div className="flex flex-col h-full bg-bg-secondary">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-default">
        <span className="text-xs font-medium text-text-secondary">AI 助手</span>
        <div className="flex items-center gap-1">
          {/* 上下文开关 */}
          <button
            onClick={() => setEnableHistory(!enableHistory)}
            className={`
              flex items-center gap-1 px-2 py-1 rounded-md text-xs
              transition-colors cursor-pointer border-none
              ${enableHistory
                ? 'bg-accent-primary/15 text-accent-primary'
                : 'bg-transparent text-text-muted hover:text-text-secondary'
              }
            `}
            title={enableHistory ? '关闭上下文' : '开启上下文'}
          >
            <History size={14} />
            <span>上下文</span>
          </button>

          {/* 清空 */}
          <IconButton
            icon={<Trash2 size={14} />}
            size="sm"
            label="清空对话"
            onClick={clearMessages}
            disabled={messages.length === 0 && !isStreaming}
          />
        </div>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {messages.length === 0 && !isStreaming && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-text-muted">截屏或输入问题开始对话</p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* 流式输出中 */}
        {isStreaming && currentStreamText && (
          <div className="flex gap-3">
            <div className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center bg-accent-success/20 text-accent-success">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
            </div>
            <div className="bg-bg-tertiary rounded-lg px-3 py-2 max-w-[85%]">
              <StreamingText text={currentStreamText} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 底部输入区 */}
      <div className="px-3 py-2 border-t border-border-default">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入问题，Enter 发送，Shift+Enter 换行"
            rows={1}
            disabled={isStreaming}
            className="
              flex-1 resize-none bg-bg-tertiary text-text-primary text-sm
              border border-border-default rounded-lg px-3 py-2
              placeholder:text-text-muted
              focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus/30
              transition-colors disabled:opacity-50
            "
          />
          <IconButton
            icon={<Send size={16} />}
            size="md"
            label="发送"
            onClick={handleSend}
            disabled={!inputText.trim() || isStreaming}
            className={inputText.trim() && !isStreaming ? 'text-accent-primary hover:bg-accent-primary/10' : ''}
          />
        </div>
      </div>
    </div>
  )
}
