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
      <div className={`flex flex-col gap-1.5 max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
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
              : 'bg-bg-tertiary text-text-primary'
            }
          `}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {message.content}
              </ReactMarkdown>
            </div>
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
