import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { User, Bot } from 'lucide-react'
import type { ChatMessage } from '../../stores/chatStore'

interface MessageBubbleProps {
  message: ChatMessage
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const [expanded, setExpanded] = useState(false)
  const assistantParts = useMemo(() => {
    if (isUser) return { lead: '', detail: '' }
    const blocks = message.content
      .split(/\\n\\s*\\n/g)
      .map((part) => part.trim())
      .filter(Boolean)
    if (blocks.length <= 1) {
      return { lead: message.content.trim(), detail: '' }
    }
    return {
      lead: blocks[0],
      detail: blocks.slice(1).join('\\n\\n'),
    }
  }, [isUser, message.content])

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* 头像 */}
      <div
        className={`
          shrink-0 w-7 h-7 rounded-lg flex items-center justify-center
          ${isUser ? 'bg-accent-primary/20 text-accent-primary' : 'bg-accent-success/20 text-accent-success'}
        `}
      >
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      {/* 消息内容 */}
      <div className={`flex flex-col gap-1.5 ${isUser ? 'max-w-[90%] items-end' : 'max-w-[96%] items-start'}`}>
        {/* 截屏缩略图 */}
        {message.screenshotPath && (
          <div className="rounded-lg overflow-hidden border border-border-default max-w-[240px]">
            <img
              src={message.screenshotPath.startsWith('data:') ? message.screenshotPath : `file://${message.screenshotPath}`}
              alt="截屏"
              className="w-full h-auto object-cover"
            />
          </div>
        )}

        {/* 文本内容 */}
        <div
          className={`
            rounded-lg px-3 py-2 text-sm
            ${isUser
              ? 'bg-accent-primary text-white'
              : 'bg-bg-tertiary text-text-primary space-y-2'
            }
          `}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          ) : (
            <>
              <div className="rounded-md border border-accent-success/20 bg-accent-success/5 px-2.5 py-2">
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                    {assistantParts.lead || message.content}
                  </ReactMarkdown>
                </div>
              </div>
              {assistantParts.detail && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="text-[11px] text-accent-primary hover:text-accent-primary-hover bg-transparent border-none p-0 cursor-pointer"
                  >
                    {expanded ? '收起细节' : '展开细节'}
                  </button>
                  {expanded && (
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                        {assistantParts.detail}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* 时间戳 */}
        <span className="text-[10px] text-text-muted px-1">
          {new Date(message.timestamp).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    </div>
  )
}
