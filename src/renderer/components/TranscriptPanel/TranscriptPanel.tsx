import { useRef, useEffect, useState } from 'react'
import { Trash2, Download, Send } from 'lucide-react'
import { useTranscriptStore } from '../../stores/transcriptStore'
import { useChatStore } from '../../stores/chatStore'
import { IconButton } from '../Common'
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

  const { addUserMessage } = useChatStore()
  const listEndRef = useRef<HTMLDivElement>(null)
  const [duration, setDuration] = useState('00:00')

  // 自动滚动
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  // 录音计时
  useEffect(() => {
    if (!isRecording || !recordingStartTime) {
      setDuration('00:00')
      return
    }
    const tick = () => setDuration(formatDuration(Date.now() - recordingStartTime))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [isRecording, recordingStartTime])

  const hasSelection = selectedEntryIds.size > 0

  const handleSendToAI = () => {
    const text = getSelectedText()
    if (text) {
      addUserMessage(text)
    }
  }

  const handleExport = () => {
    const text = entries
      .sort((a, b) => a.timestamp - b.timestamp)
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
        {entries.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-text-muted">开始录音后，转写内容将在这里显示</p>
          </div>
        )}

        {entries
          .sort((a, b) => a.timestamp - b.timestamp)
          .map((entry) => (
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
