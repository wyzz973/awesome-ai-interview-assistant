import { Mic, User } from 'lucide-react'
import type { TranscriptEntryData } from '../../stores/transcriptStore'

interface TranscriptEntryProps {
  entry: TranscriptEntryData
  selected: boolean
  onToggle: (id: string) => void
}

export default function TranscriptEntry({ entry, selected, onToggle }: TranscriptEntryProps) {
  const isInterviewer = entry.speaker === 'interviewer'

  return (
    <div
      onClick={() => onToggle(entry.id)}
      className={`
        flex gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors
        ${selected ? 'bg-accent-primary/10 border border-accent-primary/30' : 'border border-transparent hover:bg-bg-hover'}
        ${!entry.isFinal ? 'opacity-60' : ''}
      `}
    >
      {/* 说话人图标 */}
      <div
        className={`
          shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5
          ${isInterviewer ? 'bg-accent-warning/20 text-accent-warning' : 'bg-accent-primary/20 text-accent-primary'}
        `}
      >
        {isInterviewer ? <Mic size={12} /> : <User size={12} />}
      </div>

      {/* 内容 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className={`text-[11px] font-medium ${isInterviewer ? 'text-accent-warning' : 'text-accent-primary'}`}
          >
            {isInterviewer ? '面试官' : '我'}
          </span>
          <span className="text-[10px] text-text-muted">
            {new Date(entry.timestamp).toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </span>
        </div>
        <p className="text-sm text-text-primary break-words whitespace-pre-wrap leading-relaxed">
          {entry.text}
        </p>
      </div>
    </div>
  )
}
