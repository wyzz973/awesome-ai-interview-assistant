import { useRef, useEffect, useState, useMemo } from 'react'
import { Trash2, Download, Send, Play, Loader2, Settings2, CircleAlert } from 'lucide-react'
import { useTranscriptStore } from '../../stores/transcriptStore'
import { useChatStore } from '../../stores/chatStore'
import { useAppStore } from '../../stores/appStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { IconButton, Button, toast } from '../Common'
import TranscriptEntry from './TranscriptEntry'

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export default function TranscriptPanel() {
  const {
    entries,
    isRecording,
    recordingStartTime,
    selectedEntryIds,
    toggleSelect,
    getSelectedText,
    clear,
  } = useTranscriptStore()
  const { recordingIssue, setView, interviewDraft } = useAppStore()
  const { config } = useSettingsStore()

  const { sendMessage } = useChatStore()
  const listEndRef = useRef<HTMLDivElement>(null)
  const [duration, setDuration] = useState('00:00')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [starting, setStarting] = useState(false)
  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.timestamp - b.timestamp),
    [entries]
  )

  // 自动滚动
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  // 录音计时
  useEffect(() => {
    if (!isRecording || !recordingStartTime) {
      setDuration('00:00')
      setElapsedMs(0)
      return
    }
    const tick = () => {
      const nextElapsed = Date.now() - recordingStartTime
      setElapsedMs(nextElapsed)
      setDuration(formatDuration(nextElapsed))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [isRecording, recordingStartTime])

  const hasSelection = selectedEntryIds.size > 0

  const handleSendToAI = () => {
    const text = getSelectedText()
    if (text) {
      sendMessage(text)
    }
  }

  const handleExport = () => {
    const text = sortedEntries
      .map(
        (e) =>
          `[${new Date(e.timestamp).toLocaleTimeString('zh-CN')}] [${e.speaker === 'interviewer' ? '面试官' : '我'}] ${e.text}`
      )
      .join('\n')

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transcript-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleStartInterview = async () => {
    if (isRecording || starting) return
    if (!window.api?.recordingToggle) {
      toast.error('当前版本不支持页面内面试控制，请使用快捷键')
      return
    }
    setStarting(true)
    try {
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
        toast.error(result?.error || '开始面试失败')
        return
      }
      if (result.warning) {
        toast.info(result.warning)
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      toast.error(`开始面试失败: ${detail}`)
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-bg-secondary">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-default">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-text-secondary">转写记录</span>
          {isRecording && (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-accent-danger animate-pulse" />
              <span className="text-[11px] text-accent-danger font-mono">{duration}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            icon={<Download size={14} />}
            size="sm"
            label="导出记录"
            onClick={handleExport}
            disabled={entries.length === 0}
          />
          <IconButton
            icon={<Trash2 size={14} />}
            size="sm"
            label="清空记录"
            onClick={clear}
            disabled={entries.length === 0}
          />
        </div>
      </div>

      {/* 条目列表 */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {entries.length === 0 && !isRecording && (
          <div className="flex items-center justify-center h-full px-4">
            <div className="max-w-md w-full rounded-xl border border-border-default bg-bg-tertiary/60 p-4 space-y-3">
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 h-7 w-7 rounded-full bg-accent-primary/15 text-accent-primary flex items-center justify-center">
                  <Play size={14} />
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-text-primary font-medium">开始一次面试会话</p>
                  <p className="text-xs text-text-muted">
                    点击“开始面试”后，系统会自动采集音频并实时显示转写文本。
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => void handleStartInterview()} loading={starting}>
                  开始面试
                </Button>
                <span className="text-[11px] text-text-muted">快捷键：{config?.hotkeys.toggleRecording ?? 'CommandOrControl+Shift+R'}</span>
              </div>

              {recordingIssue && (
                <div className="rounded-lg border border-accent-warning/30 bg-accent-warning/10 p-2.5">
                  <div className="flex items-start gap-2">
                    <CircleAlert size={14} className="text-accent-warning mt-0.5 shrink-0" />
                    <div className="space-y-2">
                      <p className="text-xs text-text-secondary">{recordingIssue.message}</p>
                      <Button size="sm" variant="ghost" onClick={() => setView('settings')}>
                        <Settings2 size={13} />
                        打开设置排查
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {entries.length === 0 && isRecording && (
          <div className="flex items-center justify-center h-full px-4">
            <div className="max-w-md w-full rounded-xl border border-accent-primary/20 bg-accent-primary/5 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm text-text-primary">
                <Loader2 size={14} className="animate-spin text-accent-primary" />
                正在实时转写中（{duration}）
              </div>
              <p className="text-xs text-text-muted">检测到语音后，文本会在这里逐步出现。</p>
              {elapsedMs >= 10000 && (
                <p className="text-xs text-accent-warning">
                  超过 10 秒仍无文本：请检查麦克风权限，或到设置页测试 ASR 连接。
                </p>
              )}
            </div>
          </div>
        )}

        {sortedEntries.map((entry) => (
          <TranscriptEntry
            key={entry.id}
            entry={entry}
            selected={selectedEntryIds.has(entry.id)}
            onToggle={toggleSelect}
          />
        ))}

        <div ref={listEndRef} />
      </div>

      {/* 选中操作栏 */}
      {hasSelection && (
        <div className="px-3 py-2 border-t border-border-default flex items-center justify-between">
          <span className="text-xs text-text-secondary">
            已选 {selectedEntryIds.size} 条
          </span>
          <button
            onClick={handleSendToAI}
            className="
              inline-flex items-center gap-1.5 px-3 py-1.5
              bg-accent-primary text-white text-xs font-medium
              rounded-lg border-none cursor-pointer
              hover:bg-accent-primary-hover transition-colors
            "
          >
            <Send size={12} />
            发送给 AI
          </button>
        </div>
      )}
    </div>
  )
}
