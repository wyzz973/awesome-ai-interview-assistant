import { ipcMain, BrowserWindow, app, dialog } from 'electron'
import { basename, join } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { IPC_CHANNELS } from '@shared/types/ipc'
import { DEFAULT_HOTKEYS } from '@shared/constants'
import type { ConfigManager } from '@main/config/ConfigManager'
import type { StealthWindow } from '@main/window/StealthWindow'
import type { ScreenCapture } from '@main/capture/ScreenCapture'
import type { AudioCapture } from '@main/capture/AudioCapture'
import type { ASRService } from '@main/services/ASRService'
import type { LLMService } from '@main/services/LLMService'
import type { ReviewService } from '@main/services/ReviewService'
import type { SessionRecorder } from '@main/recorder/SessionRecorder'
import type { SessionRepo } from '@main/db/repositories/SessionRepo'
import type { TranscriptRepo } from '@main/db/repositories/TranscriptRepo'
import type { ScreenshotQARepo } from '@main/db/repositories/ScreenshotQARepo'
import type { ReviewRepo } from '@main/db/repositories/ReviewRepo'
import type { SessionContextRepo } from '@main/db/repositories/SessionContextRepo'
import type { ChatMessage } from '@shared/types/llm'
import type { SessionListItem } from '@shared/types/session'
import { WhisperASR } from '@main/services/ASRProviders/WhisperASR'
import type { ProgrammingLanguagePreference } from '@shared/types/config'
import { buildRuntimeSystemPrompt } from '@main/services/PromptPolicy'
import type { InterviewMemoryService } from '@main/services/InterviewMemoryService'
import type { HealthMonitorService } from '@main/services/HealthMonitorService'
import { buildSessionSummary } from '@main/services/sessionSummary'
import { getLogger } from '../logger'

const log = getLogger('IPC')
const LANGUAGE_LABELS: Record<Exclude<ProgrammingLanguagePreference, 'auto'>, string> = {
  python: 'Python',
  java: 'Java',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  go: 'Go',
  cpp: 'C++',
  c: 'C',
  rust: 'Rust',
  csharp: 'C#',
  kotlin: 'Kotlin',
  swift: 'Swift',
  php: 'PHP',
}

export interface IPCDependencies {
  configManager: ConfigManager
  stealthWindow: StealthWindow
  screenCapture: ScreenCapture
  audioCapture: AudioCapture
  toggleRecording: (options?: {
    company?: string
    position?: string
    round?: string
    backgroundNote?: string
    resumeFilePath?: string
    resumeFileName?: string
  }) => Promise<{
    success: boolean
    isRecording: boolean
    sessionId?: string
    warning?: string
    error?: string
  }>
  getRecordingStatus: () => {
    isRecording: boolean
    sessionId: string | null
    asrRunning: boolean
  }
  asrService: ASRService
  llmService: LLMService
  reviewService: ReviewService
  sessionRecorder: SessionRecorder
  sessionRepo: SessionRepo
  transcriptRepo: TranscriptRepo
  screenshotQARepo: ScreenshotQARepo
  reviewRepo: ReviewRepo
  sessionContextRepo: SessionContextRepo
  interviewMemoryService: InterviewMemoryService
  healthMonitor: HealthMonitorService
}

export function registerIPCHandlers(deps: IPCDependencies): void {
  log.debug('注册 IPC 处理器')
  const {
    configManager,
    stealthWindow,
    screenCapture,
    audioCapture,
    toggleRecording,
    getRecordingStatus,
    asrService,
    llmService,
    reviewService,
    sessionRecorder,
    sessionRepo,
    transcriptRepo,
    screenshotQARepo,
    reviewRepo,
    sessionContextRepo,
    interviewMemoryService,
    healthMonitor,
  } = deps
  const healthStreams = new Map<number, NodeJS.Timeout>()

  const stopHealthStream = (webContentsId: number) => {
    const timer = healthStreams.get(webContentsId)
    if (timer) {
      clearInterval(timer)
      healthStreams.delete(webContentsId)
    }
  }

  // ── Window ──
  ipcMain.handle(IPC_CHANNELS.WINDOW_TOGGLE, async () => {
    stealthWindow.toggle()
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_SET_OPACITY, async (_e, opacity: number) => {
    stealthWindow.setOpacity(opacity)
    return { success: true, opacity }
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_GET_OPACITY, async () => {
    const appearance = configManager.get('appearance')
    return { opacity: appearance.opacity ?? 0.85 }
  })

  // ── Health ──
  ipcMain.handle(IPC_CHANNELS.HEALTH_GET_SNAPSHOT, async () => {
    return await healthMonitor.getSnapshot()
  })

  ipcMain.handle(IPC_CHANNELS.HEALTH_SUBSCRIBE, async (event, intervalMs?: number) => {
    const sender = event.sender
    const webContentsId = sender.id
    const nextInterval = Number.isFinite(intervalMs)
      ? Math.max(1000, Math.min(10000, Math.round(Number(intervalMs))))
      : 2000

    stopHealthStream(webContentsId)

    const pushSnapshot = async () => {
      if (sender.isDestroyed()) {
        stopHealthStream(webContentsId)
        return
      }
      try {
        const snapshot = await healthMonitor.getSnapshot()
        sender.send(IPC_CHANNELS.HEALTH_UPDATE, snapshot)
      } catch (err) {
        log.warn('推送健康快照失败', err)
      }
    }

    void pushSnapshot()
    const timer = setInterval(() => {
      void pushSnapshot()
    }, nextInterval)
    healthStreams.set(webContentsId, timer)

    sender.once('destroyed', () => {
      stopHealthStream(webContentsId)
    })
    return { success: true, intervalMs: nextInterval }
  })

  ipcMain.handle(IPC_CHANNELS.HEALTH_UNSUBSCRIBE, async (event) => {
    stopHealthStream(event.sender.id)
    return { success: true }
  })

  // ── Screenshot ──
  ipcMain.handle(IPC_CHANNELS.SCREENSHOT_CAPTURE, async () => {
    try {
      const result = await screenCapture.captureRegion()
      if (!result) {
        return { success: false, error: 'User cancelled selection' }
      }
      return {
        success: true,
        imageBase64: result.imageBase64,
        region: result.region,
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.RESUME_PICK_FILE, async (event) => {
    try {
      const ownerWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined
      const result = await dialog.showOpenDialog(ownerWindow, {
        title: '选择简历文件',
        properties: ['openFile'],
        filters: [
          {
            name: 'Resume',
            extensions: ['pdf', 'doc', 'docx', 'txt', 'md', 'markdown'],
          },
        ],
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: true, canceled: true }
      }

      const filePath = result.filePaths[0]
      return {
        success: true,
        canceled: false,
        filePath,
        fileName: basename(filePath),
      }
    } catch (err) {
      return {
        success: false,
        canceled: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })

  // ── LLM ──
  ipcMain.handle(IPC_CHANNELS.LLM_CHAT, async (event, messages: ChatMessage[]) => {
    const startedAt = Date.now()
    try {
      // 每次调用前从 configManager 读取 chat 角色的最新配置
      const llmConfig = await configManager.getResolvedLLMConfig()
      llmService.updateConfig(llmConfig.chat)
      const systemPrompt = getSystemPrompt(configManager)
      const sessionId = sessionRecorder.getSessionId()
      const userQuery = extractLatestUserQuery(messages)
      const sessionContext = sessionId && userQuery
        ? interviewMemoryService.buildInjectedContext({
            sessionId,
            query: userQuery,
            limit: 8,
            maxChars: 3200,
          })
        : ''
      const finalMessages = withSessionContextMessage(
        withSystemPrompt(messages, systemPrompt),
        sessionContext,
      )
      if (sessionId && userQuery) {
        interviewMemoryService.appendChatMessage({
          sessionId,
          role: 'user',
          text: userQuery,
          timestamp: Date.now(),
        })
      }

      const stream = await llmService.chat(finalMessages)
      const sender = event.sender

      // 流式推送每个 chunk 到渲染进程
      ;(async () => {
        let fullAnswer = ''
        try {
          for await (const chunk of stream) {
            fullAnswer += chunk
            if (!sender.isDestroyed()) {
              sender.send(IPC_CHANNELS.LLM_STREAM_CHUNK, chunk)
            }
          }
          if (!sender.isDestroyed()) {
            sender.send(IPC_CHANNELS.LLM_STREAM_END)
          }
          healthMonitor.recordLLMCall({
            ok: true,
            latencyMs: Date.now() - startedAt,
          })
          if (sessionId && fullAnswer.trim()) {
            interviewMemoryService.appendChatMessage({
              sessionId,
              role: 'assistant',
              text: fullAnswer,
              timestamp: Date.now(),
            })
          }
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err)
          healthMonitor.recordLLMCall({
            ok: false,
            latencyMs: Date.now() - startedAt,
            error: detail,
          })
          if (!sender.isDestroyed()) {
            sender.send(IPC_CHANNELS.LLM_STREAM_ERROR, detail)
          }
        }
      })()

      return { success: true }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      healthMonitor.recordLLMCall({
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: detail,
      })
      return { success: false, error: detail }
    }
  })

  ipcMain.handle(IPC_CHANNELS.LLM_ANALYZE_SCREENSHOT, async (event, imageBase64: string, prompt?: string) => {
    const startedAt = Date.now()
    try {
      // 读取 screenshot 角色配置，apiKey 为空时回退到 chat 配置
      const llmConfig = await configManager.getResolvedLLMConfig()
      const roleConfig = llmConfig.screenshot?.apiKey ? llmConfig.screenshot : llmConfig.chat
      llmService.updateConfig(roleConfig)
      const rawQuestion = prompt?.trim() || '请分析这张截图'
      const question = buildScreenshotQuestion(configManager, rawQuestion)
      const systemPrompt = getSystemPrompt(configManager)
      const language = getProgrammingLanguage(configManager)
      const sessionId = sessionRecorder.getSessionId()
      const sessionContext = sessionId
        ? interviewMemoryService.buildInjectedContext({
            sessionId,
            query: question,
            limit: 8,
            maxChars: 3200,
          })
        : ''
      log.debug('截图分析请求', {
        language,
        questionPreview: question.slice(0, 200),
        hasSystemPrompt: !!systemPrompt,
      })
      const historyMessages: ChatMessage[] = []
      if (systemPrompt) {
        historyMessages.push({ role: 'system', content: systemPrompt })
      }
      if (sessionContext) {
        historyMessages.push({ role: 'system', content: sessionContext })
      }
      const stream = await llmService.analyzeScreenshot(
        imageBase64,
        question,
        historyMessages.length > 0 ? historyMessages : undefined,
      )
      const sender = event.sender
      const imagePath = sessionId ? persistScreenshotImage(sessionId, imageBase64) : ''
      if (sessionId) {
        interviewMemoryService.appendScreenshotQA({
          sessionId,
          timestamp: Date.now(),
          question,
        })
      }

      ;(async () => {
        let fullAnswer = ''
        try {
          for await (const chunk of stream) {
            fullAnswer += chunk
            if (!sender.isDestroyed()) {
              sender.send(IPC_CHANNELS.LLM_STREAM_CHUNK, chunk)
            }
          }
          if (!sender.isDestroyed()) {
            sender.send(IPC_CHANNELS.LLM_STREAM_END)
          }
          healthMonitor.recordLLMCall({
            ok: true,
            latencyMs: Date.now() - startedAt,
          })

          if (sessionId && sessionRecorder.isRecording() && fullAnswer.trim()) {
            sessionRecorder.recordScreenshotQA({
              timestamp: Date.now(),
              imagePath,
              question,
              answer: fullAnswer,
              model: roleConfig.model,
            })
          }
          if (sessionId && fullAnswer.trim()) {
            interviewMemoryService.appendScreenshotQA({
              sessionId,
              timestamp: Date.now(),
              answer: fullAnswer,
            })
          }
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err)
          healthMonitor.recordLLMCall({
            ok: false,
            latencyMs: Date.now() - startedAt,
            error: detail,
          })
          if (!sender.isDestroyed()) {
            sender.send(IPC_CHANNELS.LLM_STREAM_ERROR, detail)
          }
        }
      })()

      return { success: true }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      healthMonitor.recordLLMCall({
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: detail,
      })
      return { success: false, error: detail }
    }
  })

  ipcMain.handle(IPC_CHANNELS.LLM_TEST_CONNECTION, async (_e, override?: { baseURL: string; apiKey: string; model: string }) => {
    return await llmService.testConnection(override)
  })

  ipcMain.handle(IPC_CHANNELS.LLM_FETCH_MODELS, async (_e, providerId: string, baseURL: string, apiKey: string) => {
    return await llmService.fetchModels(baseURL, apiKey, providerId)
  })

  // ── Recording ──
  ipcMain.handle(IPC_CHANNELS.RECORDING_TOGGLE, async (_e, options?: {
    company?: string
    position?: string
    round?: string
    backgroundNote?: string
    resumeFilePath?: string
    resumeFileName?: string
  }) => {
    try {
      return await toggleRecording(options)
    } catch (err) {
      return {
        success: false,
        isRecording: getRecordingStatus().isRecording,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.RECORDING_STATUS, async () => {
    return getRecordingStatus()
  })

  // ── ASR ──
  ipcMain.handle(IPC_CHANNELS.ASR_START, async () => {
    try {
      const asrConfig = configManager.get('asr')
      const sampleRate = asrConfig.sampleRate ?? 16000
      const language = asrConfig.language ?? 'zh'

      await asrService.startStream(sampleRate, language)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.ASR_STOP, async () => {
    try {
      await asrService.stopStream()
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.ASR_STATUS, async () => {
    return { isRecording: asrService.isRunning() }
  })

  ipcMain.handle(IPC_CHANNELS.ASR_TEST_CONNECTION, async (_e, override?: {
    providerId?: string
    baseURL: string
    apiKey: string
    model: string
  }) => {
    try {
      if (override?.baseURL && override?.apiKey && override?.model) {
        const probeConfig = {
          providerId: override.providerId,
          baseURL: override.baseURL,
          apiKey: override.apiKey,
          model: override.model,
        }
        const [system, mic] = await Promise.all([
          new WhisperASR(probeConfig).testConnection(),
          new WhisperASR(probeConfig).testConnection(),
        ])
        return { system, mic }
      }
      return await asrService.testConnection()
    } catch (err) {
      return {
        system: { success: false, error: err instanceof Error ? err.message : String(err) },
        mic: { success: false, error: err instanceof Error ? err.message : String(err) },
      }
    }
  })

  ipcMain.on(IPC_CHANNELS.ASR_PUSH_MIC_AUDIO, (_e, chunk: unknown) => {
    const buffer = toNodeBuffer(chunk)
    if (!buffer) return
    audioCapture.pushMicData(buffer)
  })

  ipcMain.on(IPC_CHANNELS.ASR_PUSH_SYSTEM_AUDIO, (_e, chunk: unknown) => {
    const buffer = toNodeBuffer(chunk)
    if (!buffer) return
    audioCapture.pushSystemAudioData(buffer)
  })

  // ── Session ──
  ipcMain.handle(IPC_CHANNELS.SESSION_START, async (_e, company?: string, position?: string) => {
    try {
      const sessionId = await sessionRecorder.startSession(company, position)
      return { success: true, sessionId }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_STOP, async () => {
    try {
      const sessionId = await sessionRecorder.stopSession()

      // 同时停止 ASR
      if (asrService.isRunning()) {
        await asrService.stopStream()
      }

      return { success: true, sessionId }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_LIST, async (_e, options?: { page?: number; pageSize?: number; status?: string }) => {
    try {
      const page = options?.page ?? 1
      const pageSize = options?.pageSize ?? 20
      const offset = (page - 1) * pageSize

      const result = sessionRepo.list({
        status: options?.status as 'recording' | 'completed' | 'reviewed' | undefined,
        offset,
        limit: pageSize,
      })
      const sessions: SessionListItem[] = result.sessions.map((session) => {
        const context = sessionContextRepo.getBySessionId(session.id)
        const review = reviewRepo.getBySessionId(session.id)
        const screenshotQAs = screenshotQARepo.getBySessionId(session.id)
        const transcripts = transcriptRepo.getBySessionId(session.id)
        const summary = buildSessionSummary({
          reviewSummary: review?.summary,
          screenshotQAs: screenshotQAs.map((item) => ({
            question: item.question,
            answer: item.answer,
          })),
          transcripts: transcripts.map((entry) => ({
            speaker: entry.speaker,
            text: entry.text,
            isFinal: entry.isFinal,
          })),
          maxLength: 120,
        })

        return {
          id: session.id,
          company: session.company,
          position: session.position,
          round: context?.round ?? '',
          summary,
          startTime: session.startTime,
          duration: session.duration,
          status: session.status,
        }
      })

      return { sessions, total: result.total }
    } catch (err) {
      return { sessions: [], total: 0, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_GET, async (_e, id: string) => {
    try {
      const session = sessionRepo.getById(id)
      if (!session) return null

      const transcripts = transcriptRepo.getBySessionId(id)
      const screenshotQAs = screenshotQARepo.getBySessionId(id)
      const review = reviewRepo.getBySessionId(id)
      const context = sessionContextRepo.getBySessionId(id)

      return { session, transcripts, screenshotQAs, review, context }
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_DELETE, async (_e, id: string) => {
    try {
      const deleted = sessionRepo.delete(id)
      return { success: deleted }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_EXPORT, async (_e, id: string, format: string) => {
    try {
      const session = sessionRepo.getById(id)
      if (!session) {
        return { success: false, error: 'Session not found' }
      }

      const transcripts = transcriptRepo.getBySessionId(id)
      const screenshotQAs = screenshotQARepo.getBySessionId(id)
      const review = reviewRepo.getBySessionId(id)
      const context = sessionContextRepo.getBySessionId(id)

      if (format === 'json') {
        const data = JSON.stringify({ session, context, transcripts, screenshotQAs, review }, null, 2)
        return { success: true, data, mimeType: 'application/json' }
      }

      if (format === 'markdown' || format === 'md') {
        const lines: string[] = []
        lines.push(`# 面试记录: ${session.company} - ${session.position}`)
        lines.push(`\n**时间**: ${new Date(session.startTime).toLocaleString()}`)
        lines.push(`**时长**: ${Math.round(session.duration / 60)} 分钟`)
        lines.push(`**状态**: ${session.status}\n`)
        if (context) {
          if (context.round) {
            lines.push(`**轮次**: ${context.round}`)
          }
          if (context.backgroundNote) {
            lines.push(`**面试背景**: ${context.backgroundNote}`)
          }
          if (context.resumeFileName) {
            lines.push(`**简历文件**: ${context.resumeFileName}`)
          }
          lines.push('')
        }

        if (transcripts.length > 0) {
          lines.push('## 对话记录\n')
          for (const t of transcripts) {
            if (!t.isFinal) continue
            const speaker = t.speaker === 'interviewer' ? '面试官' : '我'
            lines.push(`**${speaker}**: ${t.text}\n`)
          }
        }

        if (screenshotQAs.length > 0) {
          lines.push('## 截屏问答\n')
          for (const qa of screenshotQAs) {
            lines.push(`**问题**: ${qa.question}`)
            lines.push(`**回答** (${qa.model}): ${qa.answer}\n`)
          }
        }

        if (review) {
          lines.push('## 复盘报告\n')
          lines.push(review.summary)
          if (review.performance.strengths.length > 0) {
            lines.push('\n### 亮点')
            for (const s of review.performance.strengths) {
              lines.push(`- ${s}`)
            }
          }
          if (review.performance.weaknesses.length > 0) {
            lines.push('\n### 待改进')
            for (const w of review.performance.weaknesses) {
              lines.push(`- ${w}`)
            }
          }
          if (review.suggestions.length > 0) {
            lines.push('\n### 建议')
            for (const s of review.suggestions) {
              lines.push(`- ${s}`)
            }
          }
        }

        const data = lines.join('\n')
        return { success: true, data, mimeType: 'text/markdown' }
      }

      return { success: false, error: `Unsupported format: ${format}` }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ── Review ──
  ipcMain.handle(IPC_CHANNELS.REVIEW_GENERATE, async (_e, sessionId: string) => {
    try {
      // 读取 review 角色配置，apiKey 为空时回退到 chat 配置
      const llmConfig = await configManager.getResolvedLLMConfig()
      const roleConfig = llmConfig.review?.apiKey ? llmConfig.review : llmConfig.chat
      llmService.updateConfig(roleConfig)
      const session = sessionRepo.getById(sessionId)
      if (!session) {
        return { success: false, error: 'Session not found' }
      }

      const transcripts = transcriptRepo.getBySessionId(sessionId)
      const screenshotQAs = screenshotQARepo.getBySessionId(sessionId)

      const report = await reviewService.generateReview(sessionId, transcripts, screenshotQAs)

      // 保存或更新到数据库
      const existing = reviewRepo.getBySessionId(sessionId)
      let saved: typeof report
      if (existing) {
        saved = reviewRepo.update(existing.id, {
          generatedAt: report.generatedAt,
          summary: report.summary,
          questions: report.questions,
          performance: report.performance,
          suggestions: report.suggestions,
          keyTopics: report.keyTopics,
        }) ?? report
      } else {
        saved = reviewRepo.create({
          sessionId,
          generatedAt: report.generatedAt,
          summary: report.summary,
          questions: report.questions,
          performance: report.performance,
          suggestions: report.suggestions,
          keyTopics: report.keyTopics,
        })
      }

      // 更新会话状态为 reviewed
      sessionRepo.update(sessionId, { status: 'reviewed' })

      return { success: true, report: saved }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.REVIEW_GET, async (_e, sessionId: string) => {
    try {
      return reviewRepo.getBySessionId(sessionId)
    } catch {
      return null
    }
  })

  // ── Config (fully implemented) ──
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, async (_e, key: string) => {
    if (key === 'llm') return configManager.getResolvedLLMConfig()
    if (key === 'asr') return configManager.getResolvedASRConfig()
    return configManager.get(key)
  })
  ipcMain.handle(IPC_CHANNELS.CONFIG_SET, async (_e, key: string, value: unknown) => {
    if (key === 'llm') {
      await configManager.setLLMConfig(value as import('@shared/types/config').AppConfig['llm'])
      return { success: true }
    }
    if (key === 'asr') {
      await configManager.setASRConfig(value as import('@shared/types/config').AppConfig['asr'])
      return { success: true }
    }
    configManager.set(key, value)
    return { success: true }
  })
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET_SECURE, async (_e, key: string) => configManager.getSecure(key))
  ipcMain.handle(IPC_CHANNELS.CONFIG_SET_SECURE, async (_e, key: string, value: string) => {
    await configManager.setSecure(key, value)
    return { success: true }
  })
  ipcMain.handle(IPC_CHANNELS.CONFIG_DELETE_SECURE, async (_e, key: string) => ({
    success: await configManager.deleteSecure(key),
  }))
  ipcMain.handle(IPC_CHANNELS.CONFIG_RESET, async () => {
    configManager.resetToDefaults()
    return { success: true }
  })
  ipcMain.handle(IPC_CHANNELS.CONFIG_EXPORT, async () => configManager.exportConfigResolved())
  ipcMain.handle(IPC_CHANNELS.CONFIG_IMPORT, async (_e, config: unknown) => {
    await configManager.importConfigWithSecrets(config as Partial<import('@shared/types/config').AppConfig>)
    return { success: true }
  })

  // ── Hotkey ──
  ipcMain.handle(IPC_CHANNELS.HOTKEY_GET_ALL, async () => configManager.getHotkeys())

  ipcMain.handle(IPC_CHANNELS.HOTKEY_UPDATE, async (_e, action: string, accelerator: string) => {
    const hotkeys = configManager.getHotkeys()
    ;(hotkeys as Record<string, string>)[action] = accelerator
    configManager.setHotkeys(hotkeys)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.HOTKEY_RESET, async () => {
    // 只重置快捷键，不要重置所有配置（否则会清空 API Key 等）
    configManager.setHotkeys({ ...DEFAULT_HOTKEYS })
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.HOTKEY_CHECK_CONFLICT, async (_e, accelerator: string) => {
    const hotkeys = configManager.getHotkeys() as Record<string, string>
    const conflicting = Object.entries(hotkeys).find(([, val]) => val === accelerator)
    return {
      hasConflict: !!conflicting,
      conflictAction: conflicting?.[0],
    }
  })

  // ── Audio ──
  ipcMain.handle(IPC_CHANNELS.AUDIO_LIST_DEVICES, async () => {
    try {
      return await audioCapture.listDevices()
    } catch {
      return []
    }
  })

  ipcMain.handle(IPC_CHANNELS.AUDIO_CHECK_BLACKHOLE, async () => {
    try {
      const available = await audioCapture.checkBlackHole()
      return { available }
    } catch {
      return { available: false }
    }
  })

  ipcMain.handle(IPC_CHANNELS.AUDIO_INSTALL_BLACKHOLE, async () => {
    try {
      return await audioCapture.installBlackHole()
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

function getSystemPrompt(configManager: ConfigManager): string {
  const raw = configManager.get('systemPrompt')
  const basePrompt = typeof raw === 'string' ? raw.trim() : ''
  return buildRuntimeSystemPrompt(basePrompt, getProgrammingLanguage(configManager))
}

function buildScreenshotQuestion(configManager: ConfigManager, question: string): string {
  const language = getProgrammingLanguage(configManager)
  if (language === 'auto') return question

  const label = LANGUAGE_LABELS[language as Exclude<ProgrammingLanguagePreference, 'auto'>]
  if (!label) return question

  return `${question}\n\n补充要求（严格执行）：若需要写代码，请优先使用 ${label} 作答。即使截图里出现其他语言示例，也请转换为 ${label}。只有当我在当前这条提问里明确指定其他语言时才切换。`
}

function getProgrammingLanguage(configManager: ConfigManager): ProgrammingLanguagePreference {
  const languageRaw = configManager.get('programmingLanguage')
  const language = typeof languageRaw === 'string' ? languageRaw.trim().toLowerCase() : 'auto'
  return language as ProgrammingLanguagePreference
}

function withSystemPrompt(messages: ChatMessage[], systemPrompt: string): ChatMessage[] {
  const sanitized = (messages ?? []).filter((message) => {
    if (!message) return false
    if (typeof message.content === 'string') {
      return message.content.trim().length > 0 || message.role === 'system'
    }
    return Array.isArray(message.content) ? message.content.length > 0 : true
  })

  if (!systemPrompt) return sanitized
  if (sanitized.some((m) => m.role === 'system')) return sanitized

  return [{ role: 'system', content: systemPrompt }, ...sanitized]
}

function withSessionContextMessage(messages: ChatMessage[], sessionContext: string): ChatMessage[] {
  const context = sessionContext.trim()
  if (!context) return messages

  if (messages.some((message) => message.role === 'system' && message.content === context)) {
    return messages
  }

  const firstNonSystemIdx = messages.findIndex((message) => message.role !== 'system')
  if (firstNonSystemIdx < 0) {
    return [...messages, { role: 'system', content: context }]
  }

  return [
    ...messages.slice(0, firstNonSystemIdx),
    { role: 'system', content: context },
    ...messages.slice(firstNonSystemIdx),
  ]
}

function extractLatestUserQuery(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (!message || message.role !== 'user') continue
    const text = extractMessageText(message.content).trim()
    if (!text) continue
    if (isInternalConstraintMessage(text)) continue
    return text
  }
  return ''
}

function extractMessageText(content: ChatMessage['content']): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((item) => {
      if (item.type === 'text') return item.text ?? ''
      return ''
    })
    .join('\n')
}

function isInternalConstraintMessage(text: string): boolean {
  const normalized = text.trim()
  if (!normalized) return false
  return (
    normalized.includes('代码语言要求（强约束）') ||
    normalized.includes('附加策略（代码语言偏好') ||
    normalized.includes('[DIRECT_ANSWER_MODE]')
  )
}

function persistScreenshotImage(sessionId: string, imageBase64: string): string {
  try {
    const screenshotDir = join(app.getPath('userData'), 'data', 'screenshots', sessionId)
    mkdirSync(screenshotDir, { recursive: true })
    const imagePath = join(screenshotDir, `${Date.now()}-${randomUUID()}.png`)
    writeFileSync(imagePath, Buffer.from(imageBase64, 'base64'))
    return imagePath
  } catch (err) {
    log.warn('持久化截屏失败', err)
    return ''
  }
}

function toNodeBuffer(chunk: unknown): Buffer | null {
  if (!chunk) return null
  if (Buffer.isBuffer(chunk)) return chunk
  if (chunk instanceof ArrayBuffer) return Buffer.from(chunk)
  if (ArrayBuffer.isView(chunk)) {
    return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
  }
  return null
}
