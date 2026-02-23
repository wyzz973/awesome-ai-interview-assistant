import { useState } from 'react'
import { MessageSquare, FileText, Clock, Settings, Mic, Square, Loader2 } from 'lucide-react'
import { useAppStore, type AppView } from '../../stores/appStore'
import { useTranscriptStore } from '../../stores/transcriptStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { toast } from '../Common'
import { runRecordingPreflight, confirmRecordingWithPreflight } from '../../services/recordingPreflight'

const TABS: { id: AppView; label: string; icon: typeof MessageSquare }[] = [
  { id: 'answer', label: '答案', icon: MessageSquare },
  { id: 'transcript', label: '转写', icon: FileText },
  { id: 'history', label: '历史', icon: Clock },
  { id: 'settings', label: '设置', icon: Settings },
]

export default function Toolbar() {
  const { currentView, setView, isRecording, recordingIssue, interviewDraft } = useAppStore()
  const { config } = useSettingsStore()
  const transcriptRecording = useTranscriptStore((s) => s.isRecording)
  const recording = isRecording || transcriptRecording
  const [toggling, setToggling] = useState(false)

  const recordingHotkey = config?.hotkeys.toggleRecording ?? 'CommandOrControl+Shift+R'

  const handleToggleRecording = async () => {
    if (toggling) return
    if (!window.api?.recordingToggle) {
      toast.error('当前版本不支持页面内面试控制，请使用快捷键')
      return
    }
    setToggling(true)
    try {
      if (!recording) {
        const report = await runRecordingPreflight()
        const proceed = confirmRecordingWithPreflight(report)
        if (!proceed) {
          setView('settings')
          return
        }
      }
      const company = interviewDraft.company.trim()
      const position = interviewDraft.position.trim()
      const round = interviewDraft.round.trim()
      const backgroundNote = interviewDraft.backgroundNote.trim()
      const resumeFilePath = interviewDraft.resumeFilePath.trim()
      const resumeFileName = interviewDraft.resumeFileName.trim()
      const options =
        company || position || round || backgroundNote || resumeFilePath || resumeFileName
          ? { company, position, round, backgroundNote, resumeFilePath, resumeFileName }
          : undefined
      const result = await window.api.recordingToggle(options) as {
        success?: boolean
        warning?: string
        error?: string
      }
      if (!result?.success) {
        const detail = result?.error || '面试操作失败'
        toast.error(detail)
        useAppStore.getState().setRecordingIssue({
          message: detail,
          fatal: true,
          code: 'recording-toggle-failed',
          timestamp: Date.now(),
        })
        return
      }
      if (result.warning) {
        toast.info(result.warning)
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      toast.error(`面试操作失败: ${detail}`)
      useAppStore.getState().setRecordingIssue({
        message: detail,
        fatal: true,
        code: 'recording-toggle-exception',
        timestamp: Date.now(),
      })
    } finally {
      setToggling(false)
    }
  }

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
      <div className="flex items-center gap-2.5 no-drag pr-1">
        <button
          type="button"
          onClick={() => void handleToggleRecording()}
          disabled={toggling}
          title={`快捷键：${recordingHotkey}`}
          className={`
            inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium
            transition-colors cursor-pointer
            disabled:opacity-60 disabled:cursor-not-allowed
            ${recording
              ? 'border-accent-danger/30 text-accent-danger bg-accent-danger/10 hover:bg-accent-danger/15'
              : 'border-accent-primary/35 text-accent-primary bg-accent-primary/10 hover:bg-accent-primary/15'
            }
          `}
        >
          {toggling ? <Loader2 size={13} className="animate-spin" /> : recording ? <Square size={12} /> : <Mic size={12} />}
          <span>{recording ? '结束面试' : '开始面试'}</span>
        </button>

        {recording && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-accent-danger animate-pulse" />
            <span className="text-[11px] text-accent-danger font-medium">面试中</span>
          </div>
        )}
        {!recording && recordingIssue && (
          <div className="flex items-center gap-1.5" title={recordingIssue.message}>
            <span className="w-2 h-2 rounded-full bg-accent-warning animate-pulse" />
            <span className="text-[11px] text-accent-warning font-medium">需处理</span>
          </div>
        )}
        {!recording && !recordingIssue && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-accent-success" />
            <span className="text-[11px] text-text-muted">就绪</span>
          </div>
        )}
      </div>
    </div>
  )
}
