import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/types/ipc'
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
import type { ChatMessage } from '@shared/types/llm'

export interface IPCDependencies {
  configManager: ConfigManager
  stealthWindow: StealthWindow
  screenCapture: ScreenCapture
  audioCapture: AudioCapture
  asrService: ASRService
  llmService: LLMService
  reviewService: ReviewService
  sessionRecorder: SessionRecorder
  sessionRepo: SessionRepo
  transcriptRepo: TranscriptRepo
  screenshotQARepo: ScreenshotQARepo
  reviewRepo: ReviewRepo
}

export function registerIPCHandlers(deps: IPCDependencies): void {
  const {
    configManager,
    stealthWindow,
    screenCapture,
    audioCapture,
    asrService,
    llmService,
    reviewService,
    sessionRecorder,
    sessionRepo,
    transcriptRepo,
    screenshotQARepo,
    reviewRepo,
  } = deps

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
    const config = configManager.get('appearance' as never) as { opacity?: number } | undefined
    return { opacity: config?.opacity ?? 0.85 }
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

  // ── LLM ──
  ipcMain.handle(IPC_CHANNELS.LLM_CHAT, async (event, messages: ChatMessage[]) => {
    try {
      const stream = await llmService.chat(messages)
      const sender = event.sender

      // 流式推送每个 chunk 到渲染进程
      ;(async () => {
        try {
          for await (const chunk of stream) {
            if (!sender.isDestroyed()) {
              sender.send(IPC_CHANNELS.LLM_STREAM_CHUNK, chunk)
            }
          }
          if (!sender.isDestroyed()) {
            sender.send(IPC_CHANNELS.LLM_STREAM_END)
          }
        } catch (err) {
          if (!sender.isDestroyed()) {
            sender.send(IPC_CHANNELS.LLM_STREAM_ERROR, err instanceof Error ? err.message : String(err))
          }
        }
      })()

      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.LLM_ANALYZE_SCREENSHOT, async (event, imageBase64: string, prompt?: string) => {
    try {
      const stream = await llmService.analyzeScreenshot(imageBase64, prompt)
      const sender = event.sender

      ;(async () => {
        try {
          for await (const chunk of stream) {
            if (!sender.isDestroyed()) {
              sender.send(IPC_CHANNELS.LLM_STREAM_CHUNK, chunk)
            }
          }
          if (!sender.isDestroyed()) {
            sender.send(IPC_CHANNELS.LLM_STREAM_END)
          }
        } catch (err) {
          if (!sender.isDestroyed()) {
            sender.send(IPC_CHANNELS.LLM_STREAM_ERROR, err instanceof Error ? err.message : String(err))
          }
        }
      })()

      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.LLM_TEST_CONNECTION, async () => {
    return await llmService.testConnection()
  })

  ipcMain.handle(IPC_CHANNELS.LLM_FETCH_MODELS, async (_e, baseURL: string, apiKey: string) => {
    return await llmService.fetchModels(baseURL, apiKey)
  })

  // ── ASR ──
  ipcMain.handle(IPC_CHANNELS.ASR_START, async (event) => {
    try {
      const config = configManager.get('asr' as never) as { sampleRate?: number; language?: string } | undefined
      const sampleRate = config?.sampleRate ?? 16000
      const language = config?.language ?? 'zh'

      // 注册转写回调，推送到渲染进程
      const sender = event.sender
      asrService.onTranscript((transcript) => {
        if (!sender.isDestroyed()) {
          sender.send(IPC_CHANNELS.ASR_TRANSCRIPT, {
            id: '',
            sessionId: sessionRecorder.getSessionId() ?? '',
            timestamp: transcript.timestamp,
            speaker: transcript.speaker,
            text: transcript.text,
            isFinal: transcript.isFinal,
          })
        }

        // 同时记录到 SessionRecorder
        if (sessionRecorder.isRecording()) {
          sessionRecorder.recordTranscript(
            transcript.speaker,
            transcript.text,
            transcript.timestamp,
            transcript.isFinal,
          )
        }
      })

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

  ipcMain.handle(IPC_CHANNELS.ASR_TEST_CONNECTION, async () => {
    try {
      return await asrService.testConnection()
    } catch (err) {
      return {
        system: { success: false, error: err instanceof Error ? err.message : String(err) },
        mic: { success: false, error: err instanceof Error ? err.message : String(err) },
      }
    }
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

      return { sessions: result.sessions, total: result.total }
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

      return { session, transcripts, screenshotQAs, review }
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

      if (format === 'json') {
        const data = JSON.stringify({ session, transcripts, screenshotQAs, review }, null, 2)
        return { success: true, data, mimeType: 'application/json' }
      }

      if (format === 'markdown' || format === 'md') {
        const lines: string[] = []
        lines.push(`# 面试记录: ${session.company} - ${session.position}`)
        lines.push(`\n**时间**: ${new Date(session.startTime).toLocaleString()}`)
        lines.push(`**时长**: ${Math.round(session.duration / 60)} 分钟`)
        lines.push(`**状态**: ${session.status}\n`)

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
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, async (_e, key: string) => configManager.get(key as never))
  ipcMain.handle(IPC_CHANNELS.CONFIG_SET, async (_e, key: string, value: unknown) => {
    configManager.set(key as never, value as never)
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
  ipcMain.handle(IPC_CHANNELS.CONFIG_EXPORT, async () => configManager.exportConfig())
  ipcMain.handle(IPC_CHANNELS.CONFIG_IMPORT, async (_e, config: unknown) => {
    configManager.importConfig(config as never)
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
    configManager.resetToDefaults()
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
