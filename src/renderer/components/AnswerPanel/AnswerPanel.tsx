import { useRef, useEffect, useState, useMemo, useCallback, type KeyboardEvent } from 'react'
import { Send, Trash2, History, Mic, Square, Wrench, FileText, Camera, Sparkles, CheckCircle2, CircleAlert, ClipboardList } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useAppStore } from '../../stores/appStore'
import { IconButton, Button, toast } from '../Common'
import MessageBubble from './MessageBubble'
import StreamingText from './StreamingText'
import { runRecordingPreflight, confirmRecordingWithPreflight } from '../../services/recordingPreflight'

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
  } = useAppStore()

  const [inputText, setInputText] = useState('')
  const [togglingRecording, setTogglingRecording] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recordingHotkey = config?.hotkeys.toggleRecording ?? 'CommandOrControl+Shift+R'
  const llmReady = isLLMReady(config)
  const asrReady = isASRReady(config)
  const workflowReady = llmReady && asrReady
  const stageLabel = isRecording ? '面试进行中' : lastCompletedSessionId ? '面试已结束，建议复盘' : '赛前准备'

  const quickPromptTemplates = useMemo(
    () => [
      '算法题：先给最优时间/空间复杂度思路，再给可运行代码（含边界条件和测试样例）。',
      '系统设计：先给组件图和数据流，再做容量估算、瓶颈分析与降级方案。',
      '排障题：先列 3 个最可能根因，再给最短验证路径和命令。',
      '行为题：按 STAR 结构给我 90 秒可口述版本。',
    ],
    [],
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

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, currentStreamText])

  const handleSend = useCallback(() => {
    const text = inputText.trim()
    if (!text || isStreaming) return
    sendMessage(text)
    setInputText('')
    // 重置 textarea 高度
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

  // textarea 自适应高度
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
      toast.info(result.warning)
    }
  }

  const handleStartInterview = async () => {
    if (isRecording || togglingRecording) return
    setTogglingRecording(true)
    try {
      const report = await runRecordingPreflight()
      const proceed = confirmRecordingWithPreflight(report)
      if (!proceed) {
        setView('settings')
        return
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
      toast.success(`已选择简历：${fileName}`)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      toast.error(`选择简历失败: ${detail}`)
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

      {/* 工作流卡片 */}
      <div className="px-3 pt-3 border-b border-border-default/70 bg-bg-secondary">
        <div className="rounded-xl border border-border-default bg-bg-tertiary/60 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-accent-primary" />
              <span className="text-sm font-medium text-text-primary">程序员面试工作流</span>
            </div>
            <span className="text-[11px] text-text-muted">{stageLabel}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              value={interviewDraft.company}
              onChange={(e) => setInterviewDraft({ company: e.target.value })}
              placeholder="目标公司（例：Google / 字节）"
              className="h-8 px-2.5 text-xs rounded-md bg-bg-primary border border-border-default text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus"
            />
            <input
              value={interviewDraft.position}
              onChange={(e) => setInterviewDraft({ position: e.target.value })}
              placeholder="岗位（例：Backend Engineer）"
              className="h-8 px-2.5 text-xs rounded-md bg-bg-primary border border-border-default text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              value={interviewDraft.round}
              onChange={(e) => setInterviewDraft({ round: e.target.value })}
              placeholder="轮次（例：一面 / 二面 / 终面）"
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

          {interviewDraft.resumeFileName && !isRecording && (
            <p className="text-[11px] text-text-muted">
              已选择简历，点击“开始面试”后会自动解析并注入本次会话。
            </p>
          )}

          <textarea
            value={interviewDraft.backgroundNote}
            onChange={(e) => setInterviewDraft({ backgroundNote: e.target.value })}
            rows={2}
            placeholder="本次面试背景（例：二面，重点考察系统设计与高并发）"
            className="w-full px-2.5 py-2 text-xs rounded-md bg-bg-primary border border-border-default text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus resize-none"
          />

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
              看实时转写
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void handleCaptureQuestion()} loading={capturing}>
              <Camera size={12} />
              当前页提问
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setView('settings')}>
              <Wrench size={12} />
              配置检查
            </Button>
            {lastCompletedSessionId && !isRecording && (
              <Button size="sm" variant="ghost" onClick={() => setView('history')}>
                <ClipboardList size={12} />
                生成复盘
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border ${llmReady ? 'text-accent-success border-accent-success/25 bg-accent-success/10' : 'text-accent-warning border-accent-warning/25 bg-accent-warning/10'}`}>
              {llmReady ? <CheckCircle2 size={12} /> : <CircleAlert size={12} />}
              AI 模型 {llmReady ? '已配置' : '待配置'}
            </span>
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border ${asrReady ? 'text-accent-success border-accent-success/25 bg-accent-success/10' : 'text-accent-warning border-accent-warning/25 bg-accent-warning/10'}`}>
              {asrReady ? <CheckCircle2 size={12} /> : <CircleAlert size={12} />}
              ASR {asrReady ? '已配置' : '待配置'}
            </span>
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border ${workflowReady ? 'text-accent-success border-accent-success/25 bg-accent-success/10' : 'text-text-muted border-border-default bg-bg-primary/60'}`}>
              {workflowReady ? <CheckCircle2 size={12} /> : <CircleAlert size={12} />}
              快捷键 {recordingHotkey}
            </span>
          </div>

          {recordingIssue && (
            <div className="rounded-lg border border-accent-warning/25 bg-accent-warning/10 px-2.5 py-2 text-xs text-text-secondary">
              {recordingIssue.message}
            </div>
          )}
        </div>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <p className="text-sm text-text-muted">从上方工作流开始，或直接输入问题</p>
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
