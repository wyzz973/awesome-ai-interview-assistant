import { MessageSquare, FileText, Clock, Settings } from 'lucide-react'
import { useAppStore, type AppView } from '../../stores/appStore'
import { useTranscriptStore } from '../../stores/transcriptStore'

const TABS: { id: AppView; label: string; icon: typeof MessageSquare }[] = [
  { id: 'answer', label: '答案', icon: MessageSquare },
  { id: 'transcript', label: '转写', icon: FileText },
  { id: 'history', label: '历史', icon: Clock },
  { id: 'settings', label: '设置', icon: Settings },
]

export default function Toolbar() {
  const { currentView, setView, isRecording } = useAppStore()
  const transcriptRecording = useTranscriptStore((s) => s.isRecording)
  const recording = isRecording || transcriptRecording

  return (
    <div className="flex items-center justify-between px-2 py-1.5 bg-bg-primary border-b border-border-default drag-region">
      {/* Tab 切换 */}
      <div className="flex items-center gap-0.5 no-drag">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = currentView === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              className={`
                flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium
                transition-colors cursor-pointer border-none
                ${active
                  ? 'bg-accent-primary/15 text-accent-primary'
                  : 'bg-transparent text-text-muted hover:text-text-secondary hover:bg-bg-hover'
                }
              `}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* 面试状态指示 */}
      <div className="flex items-center gap-2 no-drag pr-1">
        {recording && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-accent-danger animate-pulse" />
            <span className="text-[11px] text-accent-danger font-medium">录音中</span>
          </div>
        )}
        {!recording && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-accent-success" />
            <span className="text-[11px] text-text-muted">就绪</span>
          </div>
        )}
      </div>
    </div>
  )
}
