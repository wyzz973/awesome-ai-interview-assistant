import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { IPC_CHANNELS } from '@shared/types/ipc'
import { DEFAULT_WHISPER_STREAMING } from '@shared/constants'

import { ConfigManager } from './config/ConfigManager'
import { getDatabase, closeDatabase } from './db/database'
import { SessionRepo } from './db/repositories/SessionRepo'
import { TranscriptRepo } from './db/repositories/TranscriptRepo'
import { ScreenshotQARepo } from './db/repositories/ScreenshotQARepo'
import { ReviewRepo } from './db/repositories/ReviewRepo'
import { SessionContextRepo } from './db/repositories/SessionContextRepo'
import { InterviewMemoryRepo } from './db/repositories/InterviewMemoryRepo'
import { LLMService } from './services/LLMService'
import { ASRService } from './services/ASRService'
import { ReviewService } from './services/ReviewService'
import { InterviewMemoryService } from './services/InterviewMemoryService'
import { HealthMonitorService } from './services/HealthMonitorService'
import { ResumeParser } from './services/ResumeParser'
import { WhisperASR } from './services/ASRProviders/WhisperASR'
import { AliyunASR } from './services/ASRProviders/AliyunASR'
import { TencentASR } from './services/ASRProviders/TencentASR'
import { StealthWindow } from './window/StealthWindow'
import { ScreenCapture } from './capture/ScreenCapture'
import { AudioCapture } from './capture/AudioCapture'
import { SessionRecorder } from './recorder/SessionRecorder'
import { HotkeyManager } from './hotkey/HotkeyManager'
import { TrayManager } from './tray/TrayManager'
import { registerIPCHandlers } from './ipc/handlers'
import { initializeLogger, getLogger } from './logger'

interface RecordingToggleResult {
  success: boolean
  isRecording: boolean
  sessionId?: string
  warning?: string
  error?: string
}

interface InterviewStartOptions {
  company?: string
  position?: string
  round?: string
  backgroundNote?: string
  resumeFilePath?: string
  resumeFileName?: string
}

interface RecordingStatusSnapshot {
  isRecording: boolean
  sessionId: string | null
  asrRunning: boolean
}

class App {
  private configManager!: ConfigManager
  private stealthWindow!: StealthWindow
  private screenCapture!: ScreenCapture
  private audioCapture!: AudioCapture
  private llmService!: LLMService
  private asrService!: ASRService
  private reviewService!: ReviewService
  private healthMonitor!: HealthMonitorService
  private sessionRecorder!: SessionRecorder
  private hotkeyManager!: HotkeyManager
  private trayManager!: TrayManager

  // DB repos
  private sessionRepo!: SessionRepo
  private transcriptRepo!: TranscriptRepo
  private screenshotQARepo!: ScreenshotQARepo
  private reviewRepo!: ReviewRepo
  private sessionContextRepo!: SessionContextRepo
  private interviewMemoryRepo!: InterviewMemoryRepo
  private interviewMemoryService!: InterviewMemoryService
  private resumeParser!: ResumeParser

  private log = getLogger('App')
  private asrTranscriptSeq = 0
  private asrDebugSeq = 0

  async initialize(): Promise<void> {
    initializeLogger()
    this.log.info('应用启动', { version: app.getVersion(), packaged: app.isPackaged })

    // 1. ConfigManager
    this.configManager = new ConfigManager()

    // 2. Database + Repos
    const db = getDatabase()
    this.sessionRepo = new SessionRepo(db)
    this.transcriptRepo = new TranscriptRepo(db)
    this.screenshotQARepo = new ScreenshotQARepo(db)
    this.reviewRepo = new ReviewRepo(db)
    this.sessionContextRepo = new SessionContextRepo(db)
    this.interviewMemoryRepo = new InterviewMemoryRepo(db)

    // 3. LLM Service (用 chat 配置初始化)
    const llmConfig = await this.configManager.getResolvedLLMConfig()
    this.llmService = new LLMService(llmConfig.chat)

    // 监听 LLM 配置变更，自动更新
    this.configManager.onChanged('llm', () => {
      void (async () => {
        const cfg = await this.configManager.getResolvedLLMConfig()
        this.llmService.updateConfig(cfg.chat)
        await this.setupASRProviders()
      })()
    })

    // 4. ASR Service
    this.asrService = new ASRService()
    await this.setupASRProviders()

    // 监听 ASR 配置变更
    this.configManager.onChanged('asr', () => {
      void this.setupASRProviders()
    })

    // 5. Review Service
    this.reviewService = new ReviewService(this.llmService)

    // 6. Windows
    this.stealthWindow = new StealthWindow()

    // 7. Capture Services
    this.screenCapture = new ScreenCapture(this.stealthWindow)
    this.audioCapture = new AudioCapture()
    this.healthMonitor = new HealthMonitorService({
      getRecordingStatus: () => this.getRecordingStatusSnapshot(),
      getRecordingGateMode: () => {
        const mode = this.configManager.get('recordingGateMode')
        return mode === 'lenient' ? 'lenient' : 'strict'
      },
      checkBlackHole: () => this.audioCapture.checkBlackHole(),
      checkLLMReady: () => this.checkLLMReady(),
      checkASRReady: () => this.checkASRReady(),
    })

    // 8. SessionRecorder
    const dbPath = join(app.getPath('userData'), 'data', 'interviews.db')
    this.sessionRecorder = new SessionRecorder(dbPath)
    this.resumeParser = new ResumeParser()
    this.interviewMemoryService = new InterviewMemoryService(
      this.sessionContextRepo,
      this.interviewMemoryRepo,
    )

    // 8.1 统一注册 ASR 转写回调（热键录制和 IPC 启动共用）
    this.asrService.onTranscript((transcript) => {
      this.healthMonitor.recordHeartbeat()
      const sessionId = this.sessionRecorder.getSessionId() ?? ''
      this.sendToRenderer(IPC_CHANNELS.ASR_TRANSCRIPT, {
        id: `asr-${transcript.timestamp}-${++this.asrTranscriptSeq}`,
        sessionId,
        timestamp: transcript.timestamp,
        speaker: transcript.speaker,
        text: transcript.text,
        isFinal: transcript.isFinal,
      })

      if (this.sessionRecorder.isRecording() && transcript.isFinal && transcript.text.trim()) {
        this.sessionRecorder.recordTranscript(
          transcript.speaker,
          transcript.text,
          transcript.timestamp,
          transcript.isFinal,
        )
        const activeSessionId = this.sessionRecorder.getSessionId()
        if (activeSessionId) {
          this.interviewMemoryService.appendTranscript({
            sessionId: activeSessionId,
            speaker: transcript.speaker,
            text: transcript.text,
            timestamp: transcript.timestamp,
            isFinal: transcript.isFinal,
          })
        }
      }
    })

    // 9. 连接 AudioCapture 到 ASRService
    this.audioCapture.setOnMicData((data) => {
      const audio = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      this.asrService.sendMicAudio(audio)
    })
    this.audioCapture.setOnSystemAudioData((data) => {
      const audio = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      this.asrService.sendSystemAudio(audio)
    })

    // 10. IPC Handlers（必须先注册，避免 renderer 启动后调用时出现 "No handler registered"）
    registerIPCHandlers({
      configManager: this.configManager,
      stealthWindow: this.stealthWindow,
      screenCapture: this.screenCapture,
      audioCapture: this.audioCapture,
      toggleRecording: (options) => this.handleToggleRecording(options),
      getRecordingStatus: () => this.getRecordingStatusSnapshot(),
      asrService: this.asrService,
      llmService: this.llmService,
      reviewService: this.reviewService,
      sessionRecorder: this.sessionRecorder,
      sessionRepo: this.sessionRepo,
      transcriptRepo: this.transcriptRepo,
      screenshotQARepo: this.screenshotQARepo,
      reviewRepo: this.reviewRepo,
      sessionContextRepo: this.sessionContextRepo,
      interviewMemoryService: this.interviewMemoryService,
      healthMonitor: this.healthMonitor,
    })

    // 11. 创建主窗口
    this.createWindow()

    // 外观配置变更后实时应用到窗口
    this.configManager.onChanged('appearance', (newVal) => {
      const appearance = newVal as import('@shared/types/config').AppearanceConfig
      this.stealthWindow.setOpacity(appearance.opacity)
      this.stealthWindow.resize(appearance.panelWidth, appearance.panelHeight)
    })

    // 12. HotkeyManager
    this.hotkeyManager = new HotkeyManager(this.configManager)
    this.registerHotkeyHandlers()
    this.hotkeyManager.registerAll()

    // 13. TrayManager
    this.trayManager = new TrayManager()
    this.trayManager.setHotkeys(this.configManager.getHotkeys())
    this.trayManager.create({
      onScreenshot: () => this.handleScreenshot(),
      onToggleRecording: () => this.handleToggleRecording(),
      onToggleWindow: () => this.stealthWindow.toggle(),
      onShowHistory: () => this.sendToRenderer('navigate', '/history'),
      onShowSettings: () => this.sendToRenderer('navigate', '/settings'),
    })

    // 监听快捷键变更同步到 Tray
    this.configManager.onChanged('hotkeys', (newVal) => {
      this.trayManager.setHotkeys(newVal as import('@shared/types/hotkey').HotkeyConfig)
    })
  }

  private createWindow(): void {
    this.log.info('创建主窗口')
    const appearance = this.configManager.get('appearance') as import('@shared/types/config').AppearanceConfig
    const mainWindow = this.stealthWindow.create(appearance)

    mainWindow.on('ready-to-show', () => {
      this.stealthWindow.show()
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
  }

  private async setupASRProviders(): Promise<void> {
    try {
      const asrConfig = await this.configManager.getResolvedASRConfig()

      switch (asrConfig.provider) {
        case 'whisper': {
          const resolvedLLM = await this.configManager.getResolvedLLMConfig()
          const whisperConfig = asrConfig.whisper ?? {
            id: resolvedLLM.chat.id,
            name: resolvedLLM.chat.name,
            baseURL: resolvedLLM.chat.baseURL,
            apiKey: resolvedLLM.chat.apiKey,
            model: 'gpt-4o-mini-transcribe',
            streaming: { ...DEFAULT_WHISPER_STREAMING },
          }
          const effectiveConfig = {
            providerId: whisperConfig.id,
            baseURL: whisperConfig.baseURL,
            apiKey: whisperConfig.apiKey || resolvedLLM.chat.apiKey,
            model: this.normalizeWhisperASRModel(whisperConfig.id, whisperConfig.baseURL, whisperConfig.model),
            streaming: {
              ...DEFAULT_WHISPER_STREAMING,
              ...(whisperConfig.streaming ?? {}),
            },
          }
          const whisper = this.createWhisperProvider('interviewer', effectiveConfig)
          this.asrService.setSystemProvider(whisper)
          this.asrService.setMicProvider(this.createWhisperProvider('me', effectiveConfig))
          break
        }
        case 'aliyun': {
          if (asrConfig.aliyun) {
            const provider = new AliyunASR(asrConfig.aliyun)
            this.asrService.setSystemProvider(provider)
            this.asrService.setMicProvider(new AliyunASR(asrConfig.aliyun))
          } else {
            this.log.warn('阿里云 ASR 配置不完整，回退到 Whisper')
            const resolvedLLM = await this.configManager.getResolvedLLMConfig()
            this.asrService.setSystemProvider(this.createWhisperProvider('interviewer', {
              providerId: resolvedLLM.chat.id,
              baseURL: resolvedLLM.chat.baseURL,
              apiKey: resolvedLLM.chat.apiKey,
              model: 'gpt-4o-mini-transcribe',
              streaming: { ...DEFAULT_WHISPER_STREAMING },
            }))
            this.asrService.setMicProvider(this.createWhisperProvider('me', {
              providerId: resolvedLLM.chat.id,
              baseURL: resolvedLLM.chat.baseURL,
              apiKey: resolvedLLM.chat.apiKey,
              model: 'gpt-4o-mini-transcribe',
              streaming: { ...DEFAULT_WHISPER_STREAMING },
            }))
          }
          break
        }
        case 'tencent': {
          if (asrConfig.tencent) {
            const provider = new TencentASR(asrConfig.tencent)
            this.asrService.setSystemProvider(provider)
            this.asrService.setMicProvider(new TencentASR(asrConfig.tencent))
          } else {
            this.log.warn('腾讯云 ASR 配置不完整，回退到 Whisper')
            const resolvedLLM = await this.configManager.getResolvedLLMConfig()
            this.asrService.setSystemProvider(this.createWhisperProvider('interviewer', {
              providerId: resolvedLLM.chat.id,
              baseURL: resolvedLLM.chat.baseURL,
              apiKey: resolvedLLM.chat.apiKey,
              model: 'gpt-4o-mini-transcribe',
              streaming: { ...DEFAULT_WHISPER_STREAMING },
            }))
            this.asrService.setMicProvider(this.createWhisperProvider('me', {
              providerId: resolvedLLM.chat.id,
              baseURL: resolvedLLM.chat.baseURL,
              apiKey: resolvedLLM.chat.apiKey,
              model: 'gpt-4o-mini-transcribe',
              streaming: { ...DEFAULT_WHISPER_STREAMING },
            }))
          }
          break
        }
        default: {
          this.log.warn('未知 ASR 供应商，回退到 Whisper', { provider: asrConfig.provider })
          const resolvedLLM = await this.configManager.getResolvedLLMConfig()
          this.asrService.setSystemProvider(
            this.createWhisperProvider('interviewer', {
              providerId: resolvedLLM.chat.id,
              baseURL: resolvedLLM.chat.baseURL,
              apiKey: resolvedLLM.chat.apiKey,
              model: 'gpt-4o-mini-transcribe',
              streaming: { ...DEFAULT_WHISPER_STREAMING },
            }),
          )
          this.asrService.setMicProvider(
            this.createWhisperProvider('me', {
              providerId: resolvedLLM.chat.id,
              baseURL: resolvedLLM.chat.baseURL,
              apiKey: resolvedLLM.chat.apiKey,
              model: 'gpt-4o-mini-transcribe',
              streaming: { ...DEFAULT_WHISPER_STREAMING },
            }),
          )
        }
      }
    } catch (err) {
      this.log.error('初始化 ASR Provider 失败', err)
    }
  }

  private normalizeWhisperASRModel(providerId: string, baseURL: string, model?: string): string {
    const normalizedBaseURL = baseURL.toLowerCase()
    const isQwenLike = providerId === 'qwen' || normalizedBaseURL.includes('dashscope.aliyuncs.com')
    const fallback = isQwenLike ? 'qwen3-asr-flash' : 'gpt-4o-mini-transcribe'
    const raw = model?.trim()
    if (!raw) return fallback

    if (/(tts|text[-_]?to[-_]?speech|speech[-_]?synthesis|voice[-_]?clone)/i.test(raw)) {
      this.log.warn('检测到 TTS 模型被用于 ASR，自动回退到 ASR 模型', {
        from: raw,
        to: fallback,
      })
      return fallback
    }
    return raw
  }

  private createWhisperProvider(
    speaker: 'interviewer' | 'me',
    config: ConstructorParameters<typeof WhisperASR>[0],
  ): WhisperASR {
    const provider = new WhisperASR(config)
    provider.onDebug((event) => {
      this.healthMonitor.recordASRDebug(event)
      this.sendToRenderer(IPC_CHANNELS.ASR_DEBUG, {
        id: `asr-debug-${event.timestamp}-${++this.asrDebugSeq}`,
        speaker,
        ...event,
      })
    })
    return provider
  }

  private registerHotkeyHandlers(): void {
    this.hotkeyManager.registerHandler('screenshot', () => this.handleScreenshot())
    this.hotkeyManager.registerHandler('toggleWindow', () => this.stealthWindow.toggle())
    this.hotkeyManager.registerHandler('toggleStealth', () => this.stealthWindow.toggleInteraction())
    this.hotkeyManager.registerHandler('decreaseOpacity', () => this.stealthWindow.decreaseOpacity())
    this.hotkeyManager.registerHandler('increaseOpacity', () => this.stealthWindow.increaseOpacity())
    this.hotkeyManager.registerHandler('toggleRecording', () => this.handleToggleRecording())
    this.hotkeyManager.registerHandler('sendMessage', () => this.sendToRenderer('hotkey:sendMessage'))
  }

  private async handleScreenshot(): Promise<void> {
    try {
      const result = await this.screenCapture.captureRegion()
      if (result) {
        this.sendToRenderer('screenshot:captured', {
          imageBase64: result.imageBase64,
          region: result.region,
        })
      }
    } catch (err) {
      this.log.error('截屏失败', err)
    }
  }

  private async handleToggleRecording(options?: InterviewStartOptions): Promise<RecordingToggleResult> {
    try {
      if (this.sessionRecorder.isRecording()) {
        const sessionId = await this.sessionRecorder.stopSession()
        if (this.asrService.isRunning()) {
          await this.asrService.stopStream()
        }
        this.audioCapture.stop()
        this.stealthWindow.enableInteraction()
        this.trayManager.setStatus('ready')
        this.healthMonitor.clearRecordingIssue()
        this.healthMonitor.recordHeartbeat()
        this.sendToRenderer('recording:stopped', { sessionId })
        return { success: true, isRecording: false, ...(sessionId ? { sessionId } : {}) }
      } else {
        // 启动会话录制
        const draftCompany = options?.company?.trim()
        const draftPosition = options?.position?.trim()
        const company = draftCompany || '模拟面试'
        const position = draftPosition || '软件工程师'
        const sessionId = await this.sessionRecorder.startSession(company, position)
        let warning = ''

        const round = options?.round?.trim() ?? ''
        const backgroundNote = options?.backgroundNote?.trim() ?? ''
        const resumeFilePath = options?.resumeFilePath?.trim() ?? ''
        const resumeFileName = options?.resumeFileName?.trim() ?? ''

        if (round || backgroundNote || resumeFilePath) {
          let resumeText = ''
          if (resumeFilePath) {
            try {
              const parsed = await this.resumeParser.parse(resumeFilePath)
              resumeText = parsed.text
            } catch (err) {
              const detail = err instanceof Error ? err.message : String(err)
              warning = warning
                ? `${warning}；简历解析失败：${detail}`
                : `简历解析失败：${detail}`
              this.sendToRenderer('recording:error', {
                message: `简历解析失败：${detail}`,
                fatal: false,
                code: 'resume-parse-failed',
              })
              this.healthMonitor.recordRecordingIssue({
                message: `简历解析失败：${detail}`,
                code: 'resume-parse-failed',
              })
            }
          }

          this.interviewMemoryService.ingestSessionContext({
            sessionId,
            round,
            backgroundNote,
            resumeFilePath,
            resumeFileName,
            resumeText,
          })
        }

        // ASR 和音频捕获可能因未配置而失败，不阻塞录制
        try {
          const asrConfig = this.configManager.get('asr')
          await this.asrService.startStream(asrConfig.sampleRate, asrConfig.language)
        } catch (asrErr) {
          this.log.warn('ASR 启动失败（将不带转写继续录制）', asrErr)
          warning = 'ASR 启动失败，当前会话不会生成实时转写'
          this.sendToRenderer('recording:error', {
            message: warning,
            fatal: false,
            code: 'asr-start-failed',
          })
          this.healthMonitor.recordRecordingIssue({
            message: warning,
            code: 'asr-start-failed',
          })
        }

        try {
          await this.audioCapture.start()
        } catch (audioErr) {
          this.log.warn('音频捕获启动失败', audioErr)
          const detail = audioErr instanceof Error ? audioErr.message : String(audioErr)

          // 音频采集不可用时，回滚本次录制启动，避免出现“界面未录制但会话已开始”的不一致状态
          if (this.asrService.isRunning()) {
            await this.asrService.stopStream().catch(() => {})
          }
          if (this.sessionRecorder.isRecording()) {
            await this.sessionRecorder.stopSession().catch(() => {})
          }
          this.audioCapture.stop()
          this.stealthWindow.enableInteraction()
          this.trayManager.setStatus('ready')
          const error = `音频捕获启动失败：${detail}`
          this.sendToRenderer('recording:error', {
            message: error,
            fatal: true,
            code: 'audio-capture-start-failed',
          })
          this.healthMonitor.recordRecordingIssue({
            message: error,
            code: 'audio-capture-start-failed',
          })
          return { success: false, isRecording: false, error }
        }

        this.stealthWindow.disableInteraction()
        this.trayManager.setStatus('recording')
        this.healthMonitor.clearRecordingIssue()
        this.healthMonitor.recordHeartbeat()
        this.sendToRenderer('recording:started', { sessionId })
        return {
          success: true,
          isRecording: true,
          sessionId,
          ...(warning ? { warning } : {}),
        }
      }
    } catch (err) {
      this.log.error('录制切换失败', err)
      const error = err instanceof Error ? err.message : String(err)
      this.sendToRenderer('recording:error', {
        message: error,
        fatal: true,
        code: 'recording-toggle-failed',
      })
      this.healthMonitor.recordRecordingIssue({
        message: error,
        code: 'recording-toggle-failed',
      })
      return {
        success: false,
        isRecording: this.sessionRecorder?.isRecording?.() ?? false,
        error,
      }
    }
  }

  private getRecordingStatusSnapshot(): RecordingStatusSnapshot {
    return {
      isRecording: this.sessionRecorder?.isRecording?.() ?? false,
      sessionId: this.sessionRecorder?.getSessionId?.() ?? null,
      asrRunning: this.asrService?.isRunning?.() ?? false,
    }
  }

  private async checkLLMReady(): Promise<boolean> {
    const llm = await this.configManager.getResolvedLLMConfig()
    const chat = llm.chat
    return !!(chat.baseURL?.trim() && chat.apiKey?.trim() && chat.model?.trim())
  }

  private async checkASRReady(): Promise<boolean> {
    const asr = await this.configManager.getResolvedASRConfig()
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

  private sendToRenderer(channel: string, ...args: unknown[]): void {
    const win = this.stealthWindow.getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  }

  /** macOS activate 时重新创建窗口（不重新初始化整个应用） */
  recreateWindow(): void {
    this.createWindow()
  }

  async shutdown(): Promise<void> {
    this.log.info('应用退出')
    // 停止录制中的会话
    if (this.sessionRecorder?.isRecording()) {
      await this.sessionRecorder.stopSession()
    }

    // 停止 ASR
    if (this.asrService?.isRunning()) {
      await this.asrService.stopStream()
    }

    // 停止音频捕获
    this.audioCapture?.stop()

    // 销毁快捷键和托盘
    this.hotkeyManager?.destroy()
    this.trayManager?.destroy()

    // 关闭数据库
    closeDatabase()
  }
}

// ── Application Lifecycle ──

const application = new App()

app.whenReady().then(async () => {
  await application.initialize()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      // 窗口全部关闭后仅重新创建窗口，不重新初始化（避免 IPC handler 重复注册崩溃）
      application.recreateWindow()
    }
  })
})

let isQuitting = false
app.on('before-quit', async (event) => {
  if (isQuitting) return
  isQuitting = true
  event.preventDefault()
  try {
    await application.shutdown()
  } catch (err) {
    console.error('Shutdown error:', err)
  } finally {
    app.exit(0)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
