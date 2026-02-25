import { useRef, useEffect, useState, useMemo, useCallback, type KeyboardEvent } from 'react'
import {
  Send,
  Trash2,
  History,
  Mic,
  Square,
  Wrench,
  FileText,
  Camera,
  Sparkles,
  ClipboardList,
  Columns2,
  MessageSquareText,
} from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useAppStore } from '../../stores/appStore'
import { useTranscriptStore } from '../../stores/transcriptStore'
import { IconButton, Button, toast, HealthStatusBar } from '../Common'
import MessageBubble from './MessageBubble'
import StreamingText from './StreamingText'
import { runRecordingPreflight } from '../../services/recordingPreflight'
import { shouldBlockInterviewStart } from '../../services/recordingGate'

function isLLMReady(config: ReturnType<typeof useSettingsStore.getState>['config']): boolean {
  if (!config) return false
  const chat = config.llm.chat
  return !!(chat.baseURL?.trim() && chat.apiKey?.trim() && chat.model?.trim())
}

function isASRReady(config: ReturnType<typeof useSettingsStore.getState>['config']): boolean {
  if (!config) return false
  const asr = config.asr
  if (asr.provider === 'whisper') {
    return !!(asr.whisper?.baseURL?.trim() && asr.whisper?.apiKey?.trim() && asr.whisper?.model?.trim())
  }
  if (asr.provider === 'aliyun') {
    return !!(asr.aliyun?.appKey?.trim() && asr.aliyun?.accessKeyId?.trim() && asr.aliyun?.accessKeySecret?.trim())
  }
  if (asr.provider === 'tencent') {
    return !!(asr.tencent?.appId?.trim() && asr.tencent?.secretId?.trim() && asr.tencent?.secretKey?.trim())
  }
  return false
}

function formatSpeakerLabel(speaker: 'interviewer' | 'me'): string {
  return speaker === 'interviewer' ? '面试官' : '我'
}

export default function AnswerPanel() {
  const {
    messages,
    isStreaming,
    currentStreamText,
    enableHistory,
    sendMessage,
    setEnableHistory,
    clearMessages,
    sendScreenshot,
  } = useChatStore()
  const { config, setEnableHistoryContext } = useSettingsStore()
  const {
    isRecording,
    setView,
    recordingIssue,
    interviewDraft,
    setInterviewDraft,
    lastCompletedSessionId,
    answerLayout,
    setAnswerLayout,
    healthSnapshot,
    setRecordingIssue,
  } = useAppStore()
  const transcriptEntries = useTranscriptStore((s) => s.entries)

  const [inputText, setInputText] = useState('')
  const [togglingRecording, setTogglingRecording] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recordingHotkey = config?.hotkeys.toggleRecording ?? 'CommandOrControl+Shift+R'
  const llmReady = isLLMReady(config)
  const asrReady = isASRReady(config)
  const gateMode = config?.recordingGateMode ?? 'strict'
  const gateDecision = shouldBlockInterviewStart(healthSnapshot)
  const hasHealthAlert = Boolean(
    healthSnapshot && (
      healthSnapshot.gate.blocked ||
      healthSnapshot.checks.audio.state !== 'ok' ||
      healthSnapshot.checks.asr.state !== 'ok' ||
      healthSnapshot.checks.llm.state !== 'ok'
    )
  )

  const quickPromptTemplates = useMemo(
    () => [
      '给我 90 秒可直接口述的答案版本。',
      '先讲结论，再给关键步骤和风险点。',
      '如果是代码题，先复杂度，再最短可运行实现。',
      '如果是系统设计，先架构骨架再给容量估算。',
    ],
    [],
  )

  const liveTranscriptEntries = useMemo(
    () => [...transcriptEntries].filter((entry) => entry.text.trim()).slice(-12),
    [transcriptEntries],
  )

  useEffect(() => {
    try {
      const raw = localStorage.getItem('interview-draft-v1')
      if (!raw) return
      const parsed = JSON.parse(raw) as {
        company?: string
        position?: string
        round?: string
        backgroundNote?: string
        resumeFilePath?: string
        resumeFileName?: string
      }
      if (
        parsed.company ||
        parsed.position ||
        parsed.round ||
        parsed.backgroundNote ||
        parsed.resumeFilePath ||
        parsed.resumeFileName
      ) {
        setInterviewDraft({
          company: parsed.company ?? '',
          position: parsed.position ?? '',
          round: parsed.round ?? '',
          backgroundNote: parsed.backgroundNote ?? '',
          resumeFilePath: parsed.resumeFilePath ?? '',
          resumeFileName: parsed.resumeFileName ?? '',
        })
      }
    } catch {
      // ignore invalid local cache
    }
  }, [setInterviewDraft])

  useEffect(() => {
    try {
      localStorage.setItem('interview-draft-v1', JSON.stringify(interviewDraft))
    } catch {
      // ignore storage failure
    }
  }, [interviewDraft])

  useEffect(() => {
    try {
      localStorage.setItem('answer-layout-v2', answerLayout)
    } catch {
      // ignore storage failure
    }
  }, [answerLayout])

  useEffect(() => {
    try {
      const cached = localStorage.getItem('answer-layout-v2')
      if (cached === 'focus' || cached === 'split') {
        setAnswerLayout(cached)
      }
    } catch {
      // ignore storage failure
    }
  }, [setAnswerLayout])

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, currentStreamText])

  const handleSend = useCallback(() => {
    const text = inputText.trim()
    if (!text || isStreaming) return
    sendMessage(text)
    setInputText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [inputText, isStreaming, sendMessage])

  useEffect(() => {
    const handler = () => handleSend()
    window.addEventListener('hotkey:sendMessage', handler)
    return () => window.removeEventListener('hotkey:sendMessage', handler)
  }, [handleSend])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (value: string) => {
    setInputText(value)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }

  const handleToggleHistory = () => {
    const next = !enableHistory
    setEnableHistory(next)
    void setEnableHistoryContext(next)
  }

  const invokeInterviewToggle = async (mode: 'start' | 'end') => {
    if (!window.api?.recordingToggle) {
      toast.error('当前版本不支持页面内面试控制')
      return
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
      toast.error(result?.error || `${mode === 'start' ? '开始' : '结束'}面试失败`)
      return
    }
    if (result.warning) {
      setRecordingIssue({
        message: result.warning,
        fatal: false,
        code: 'recording-warning',
        timestamp: Date.now(),
      })
    }
  }

  const handleStartInterview = async () => {
    if (isRecording || togglingRecording) return
    setTogglingRecording(true)
    try {
      const report = await runRecordingPreflight()
      const blockedByPreflight = gateMode === 'strict' && !report.dualChannelReady
      const blockedByHealth = gateMode === 'strict' && gateDecision.blocked

      if (blockedByPreflight || blockedByHealth) {
        const reason = blockedByHealth
          ? gateDecision.reason
          : (report.blockingReason ?? '录音前自检未通过')
        setRecordingIssue({
          message: reason,
          fatal: false,
          code: 'recording-gate-blocked',
          timestamp: Date.now(),
        })
        setView('settings')
        return
      }

      if (!report.dualChannelReady && gateMode === 'lenient') {
        setRecordingIssue({
          message: report.blockingReason ?? '双声道链路未就绪，将以降级模式继续。',
          fatal: false,
          code: 'recording-gate-lenient-warning',
          timestamp: Date.now(),
        })
      }

      await invokeInterviewToggle('start')
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      toast.error(`开始面试失败: ${detail}`)
    } finally {
      setTogglingRecording(false)
    }
  }

  const handleEndInterview = async () => {
    if (!isRecording || togglingRecording) return
    setTogglingRecording(true)
    try {
      await invokeInterviewToggle('end')
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      toast.error(`结束面试失败: ${detail}`)
    } finally {
      setTogglingRecording(false)
    }
  }

  const handleCaptureQuestion = async () => {
    if (capturing) return
    if (!window.api?.screenshotCapture) {
      toast.error('当前版本不支持页面内截屏')
      return
    }
    setCapturing(true)
    try {
      const result = await window.api.screenshotCapture() as {
        success: boolean
        imageBase64?: string
        error?: string
      }
      if (!result?.success || !result.imageBase64) {
        toast.error(result?.error || '截图失败')
        return
      }
      await sendScreenshot(result.imageBase64, '请分析这道程序员面试题，给出高分答法。')
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      toast.error(`截屏失败: ${detail}`)
    } finally {
      setCapturing(false)
    }
  }

  const insertQuickPrompt = (text: string) => {
    setInputText(text)
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
        textareaRef.current.style.height = 'auto'
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
      }
    })
  }

  const handleSelectResumeClick = async () => {
    if (!window.api?.pickResumeFile) {
      toast.error('当前版本不支持选择本地简历文件')
      return
    }
    try {
      const result = await window.api.pickResumeFile() as {
        success?: boolean
        canceled?: boolean
        filePath?: string
        fileName?: string
        error?: string
      }

      if (!result?.success) {
        toast.error(result?.error || '选择简历失败')
        return
      }
      if (result.canceled) return

      const filePath = result.filePath?.trim() ?? ''
      const fileName = result.fileName?.trim() ?? ''
      if (!filePath || !fileName) {
        toast.error('未获取到简历文件路径，请重试')
        return
      }

      setInterviewDraft({
        resumeFilePath: filePath,
        resumeFileName: fileName,
      })
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      toast.error(`选择简历失败: ${detail}`)
    }
  }

  const renderMessageList = () => (
    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
      {messages.length === 0 && !isStreaming && (
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <p className="text-sm text-text-muted">输入问题即可获得可直接口述答案</p>
          <div className="flex flex-wrap gap-2 justify-center max-w-[95%]">
            {quickPromptTemplates.map((template) => (
              <button
                key={template}
                type="button"
                onClick={() => insertQuickPrompt(template)}
                className="px-2.5 py-1.5 rounded-md text-xs border border-border-default text-text-secondary bg-bg-tertiary/50 hover:bg-bg-hover hover:text-text-primary transition-colors cursor-pointer"
              >
                {template}
              </button>
            ))}
          </div>
        </div>
      )}

      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {isStreaming && currentStreamText && (
        <div className="flex gap-3">
          <div className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center bg-accent-success/20 text-accent-success">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
          </div>
          <div className="bg-bg-tertiary rounded-lg px-3 py-2 max-w-[96%]">
            <StreamingText text={currentStreamText} />
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  )

  return (
    <div className="flex flex-col h-full bg-bg-secondary">
      {!isRecording && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-border-default">
          <span className="text-xs font-medium text-text-secondary">AI 助手</span>
          <div className="flex items-center gap-1">
            <button
              onClick={handleToggleHistory}
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
            <IconButton
              icon={<Trash2 size={14} />}
              size="sm"
              label="清空对话"
              onClick={clearMessages}
              disabled={messages.length === 0 && !isStreaming}
            />
          </div>
        </div>
      )}

      {!isRecording && <HealthStatusBar snapshot={healthSnapshot} />}
      {isRecording && hasHealthAlert && <HealthStatusBar snapshot={healthSnapshot} compact />}

      {!isRecording ? (
        <div className="px-3 py-2 border-b border-border-default bg-bg-secondary">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => void handleStartInterview()}
              loading={togglingRecording}
              disabled={isRecording}
              variant="primary"
            >
              <Mic size={12} />
              开始面试
            </Button>
            <Button
              size="sm"
              onClick={() => void handleEndInterview()}
              loading={togglingRecording}
              disabled={!isRecording}
              variant="danger"
            >
              <Square size={12} />
              结束面试
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setView('transcript')}>
              <FileText size={12} />
              实时转写
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void handleCaptureQuestion()} loading={capturing}>
              <Camera size={12} />
              当前页提问
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setView('settings')}>
              <Wrench size={12} />
              配置检查
            </Button>
            {lastCompletedSessionId && (
              <Button size="sm" variant="ghost" onClick={() => setView('history')}>
                <ClipboardList size={12} />
                面试归档
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-text-muted mt-2">
            <span>模式: 赛前准备</span>
            <span>门禁: {gateMode === 'strict' ? 'Strict' : 'Lenient'}</span>
            <span>快捷键: {recordingHotkey}</span>
            <span>LLM: {llmReady ? '已配置' : '待配置'}</span>
            <span>ASR: {asrReady ? '已配置' : '待配置'}</span>
          </div>
        </div>
      ) : (
        <div className="px-3 py-2 border-b border-border-default bg-bg-secondary/90">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => void handleEndInterview()}
              loading={togglingRecording}
              disabled={!isRecording}
              variant="danger"
            >
              <Square size={12} />
              结束面试
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void handleCaptureQuestion()} loading={capturing}>
              <Camera size={12} />
              当前页提问
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setView('transcript')}>
              <FileText size={12} />
              转写
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAnswerLayout(answerLayout === 'focus' ? 'split' : 'focus')}
            >
              <Columns2 size={12} />
              {answerLayout === 'focus' ? '双栏' : '单栏'}
            </Button>
          </div>
        </div>
      )}

      {!isRecording && (
        <div className="px-3 pt-3 border-b border-border-default/70 bg-bg-secondary">
          <div className="rounded-xl border border-border-default bg-bg-tertiary/60 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-accent-primary" />
              <span className="text-sm font-medium text-text-primary">面试准备（必要信息优先）</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                value={interviewDraft.company}
                onChange={(e) => setInterviewDraft({ company: e.target.value })}
                placeholder="目标公司"
                className="h-8 px-2.5 text-xs rounded-md bg-bg-primary border border-border-default text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus"
              />
              <input
                value={interviewDraft.position}
                onChange={(e) => setInterviewDraft({ position: e.target.value })}
                placeholder="岗位"
                className="h-8 px-2.5 text-xs rounded-md bg-bg-primary border border-border-default text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                value={interviewDraft.round}
                onChange={(e) => setInterviewDraft({ round: e.target.value })}
                placeholder="几面（例：一面）"
                className="h-8 px-2.5 text-xs rounded-md bg-bg-primary border border-border-default text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus"
              />
              <button
                type="button"
                onClick={handleSelectResumeClick}
                className="h-8 px-2.5 text-xs rounded-md bg-bg-primary border border-border-default text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer text-left"
                title={interviewDraft.resumeFileName || '选择简历文件（PDF / DOCX / TXT）'}
              >
                {interviewDraft.resumeFileName
                  ? `简历：${interviewDraft.resumeFileName}`
                  : '选择简历（PDF / DOCX / TXT）'}
              </button>
            </div>

            <textarea
              value={interviewDraft.backgroundNote}
              onChange={(e) => setInterviewDraft({ backgroundNote: e.target.value })}
              rows={2}
              placeholder="补充背景（可选）"
              className="w-full px-2.5 py-2 text-xs rounded-md bg-bg-primary border border-border-default text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus resize-none"
            />

            {(gateDecision.blocked || recordingIssue) && (
              <div className="rounded-lg border border-accent-warning/25 bg-accent-warning/10 px-2.5 py-2 text-xs text-text-secondary">
                {gateDecision.blocked ? gateDecision.reason : recordingIssue?.message}
              </div>
            )}
          </div>
        </div>
      )}

      <div
        className={`
          flex-1 min-h-0
          ${isRecording && answerLayout === 'split'
            ? 'grid grid-cols-[minmax(0,2fr)_minmax(260px,1fr)] gap-0'
            : 'flex flex-col'
          }
        `}
      >
        {renderMessageList()}

        {isRecording && answerLayout === 'split' && (
          <div className="min-h-0 border-l border-border-default bg-bg-secondary/70 flex flex-col">
            <div className="px-3 py-2 border-b border-border-default flex items-center gap-1.5 text-xs text-text-secondary">
              <MessageSquareText size={13} />
              实时转写速览
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
              {liveTranscriptEntries.length === 0 && (
                <p className="text-xs text-text-muted">等待语音输入...</p>
              )}
              {liveTranscriptEntries.map((entry) => (
                <div key={entry.id} className="rounded-md border border-border-default/70 bg-bg-tertiary/40 p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[11px] ${entry.speaker === 'interviewer' ? 'text-accent-warning' : 'text-accent-primary'}`}>
                      {formatSpeakerLabel(entry.speaker)}
                    </span>
                    <span className="text-[10px] text-text-muted">
                      {new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary leading-5 whitespace-pre-wrap">{entry.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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
