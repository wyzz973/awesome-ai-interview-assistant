import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

import { ConfigManager } from './config/ConfigManager'
import { getDatabase, closeDatabase } from './db/database'
import { SessionRepo } from './db/repositories/SessionRepo'
import { TranscriptRepo } from './db/repositories/TranscriptRepo'
import { ScreenshotQARepo } from './db/repositories/ScreenshotQARepo'
import { ReviewRepo } from './db/repositories/ReviewRepo'
import { LLMService } from './services/LLMService'
import { ASRService } from './services/ASRService'
import { ReviewService } from './services/ReviewService'
import { WhisperASR } from './services/ASRProviders/WhisperASR'
import { AliyunASR } from './services/ASRProviders/AliyunASR'
import { TencentASR } from './services/ASRProviders/TencentASR'
import { StealthWindow } from './window/StealthWindow'
import { SelectorWindow } from './window/SelectorWindow'
import { ScreenCapture } from './capture/ScreenCapture'
import { AudioCapture } from './capture/AudioCapture'
import { SessionRecorder } from './recorder/SessionRecorder'
import { HotkeyManager } from './hotkey/HotkeyManager'
import { TrayManager } from './tray/TrayManager'
import { registerIPCHandlers } from './ipc/handlers'
import { initializeLogger, getLogger } from './logger'

class App {
  private configManager!: ConfigManager
  private stealthWindow!: StealthWindow
  private selectorWindow!: SelectorWindow
  private screenCapture!: ScreenCapture
  private audioCapture!: AudioCapture
  private llmService!: LLMService
  private asrService!: ASRService
  private reviewService!: ReviewService
  private sessionRecorder!: SessionRecorder
  private hotkeyManager!: HotkeyManager
  private trayManager!: TrayManager

  // DB repos
  private sessionRepo!: SessionRepo
  private transcriptRepo!: TranscriptRepo
  private screenshotQARepo!: ScreenshotQARepo
  private reviewRepo!: ReviewRepo

  private log = getLogger('App')

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

    // 3. LLM Service (用 chat 配置初始化)
    const llmConfig = this.configManager.get('llm')
    this.llmService = new LLMService(llmConfig.chat)

    // 监听 LLM 配置变更，自动更新
    this.configManager.onChanged('llm', (newVal) => {
      const cfg = newVal as typeof llmConfig
      this.llmService.updateConfig(cfg.chat)
    })

    // 4. ASR Service
    this.asrService = new ASRService()
    this.setupASRProviders()

    // 监听 ASR 配置变更
    this.configManager.onChanged('asr', () => {
      this.setupASRProviders()
    })

    // 5. Review Service
    this.reviewService = new ReviewService(this.llmService)

    // 6. Windows
    this.stealthWindow = new StealthWindow()
    this.selectorWindow = new SelectorWindow()

    // 7. Capture Services
    this.screenCapture = new ScreenCapture(this.stealthWindow, this.selectorWindow)
    this.audioCapture = new AudioCapture()

    // 8. SessionRecorder
    const dbPath = join(app.getPath('userData'), 'data', 'interviews.db')
    this.sessionRecorder = new SessionRecorder(dbPath)

    // 9. 连接 AudioCapture 到 ASRService
    this.audioCapture.setOnMicData((data) => {
      this.asrService.sendMicAudio(data.buffer as ArrayBuffer)
    })
    this.audioCapture.setOnSystemAudioData((data) => {
      this.asrService.sendSystemAudio(data.buffer as ArrayBuffer)
    })

    // 10. 创建主窗口
    this.createWindow()

    // 11. IPC Handlers
    registerIPCHandlers({
      configManager: this.configManager,
      stealthWindow: this.stealthWindow,
      screenCapture: this.screenCapture,
      audioCapture: this.audioCapture,
      asrService: this.asrService,
      llmService: this.llmService,
      reviewService: this.reviewService,
      sessionRecorder: this.sessionRecorder,
      sessionRepo: this.sessionRepo,
      transcriptRepo: this.transcriptRepo,
      screenshotQARepo: this.screenshotQARepo,
      reviewRepo: this.reviewRepo,
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
    const mainWindow = this.stealthWindow.create()

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

  private setupASRProviders(): void {
    const asrConfig = this.configManager.get('asr')

    switch (asrConfig.provider) {
      case 'whisper': {
        const whisperConfig = asrConfig.whisper ?? {
          baseURL: this.configManager.get('llm').chat.baseURL,
          apiKey: this.configManager.get('llm').chat.apiKey,
        }
        const whisper = new WhisperASR(whisperConfig)
        this.asrService.setSystemProvider(whisper)
        this.asrService.setMicProvider(new WhisperASR(whisperConfig))
        break
      }
      case 'aliyun': {
        if (asrConfig.aliyun) {
          const provider = new AliyunASR(asrConfig.aliyun)
          this.asrService.setSystemProvider(provider)
          this.asrService.setMicProvider(new AliyunASR(asrConfig.aliyun))
        }
        break
      }
      case 'tencent': {
        if (asrConfig.tencent) {
          const provider = new TencentASR(asrConfig.tencent)
          this.asrService.setSystemProvider(provider)
          this.asrService.setMicProvider(new TencentASR(asrConfig.tencent))
        }
        break
      }
    }
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

  private async handleToggleRecording(): Promise<void> {
    try {
      if (this.sessionRecorder.isRecording()) {
        await this.sessionRecorder.stopSession()
        if (this.asrService.isRunning()) {
          await this.asrService.stopStream()
        }
        this.audioCapture.stop()
        this.stealthWindow.enableInteraction()
        this.trayManager.setStatus('ready')
        this.sendToRenderer('recording:stopped')
      } else {
        // 启动会话录制
        const sessionId = await this.sessionRecorder.startSession()

        // ASR 和音频捕获可能因未配置而失败，不阻塞录制
        try {
          const asrConfig = this.configManager.get('asr')
          await this.asrService.startStream(asrConfig.sampleRate, asrConfig.language)
        } catch (asrErr) {
          this.log.warn('ASR 启动失败（将不带转写继续录制）', asrErr)
        }

        try {
          await this.audioCapture.start()
        } catch (audioErr) {
          this.log.warn('音频捕获启动失败', audioErr)
        }

        this.stealthWindow.disableInteraction()
        this.trayManager.setStatus('recording')
        this.sendToRenderer('recording:started', { sessionId })
      }
    } catch (err) {
      this.log.error('录制切换失败', err)
      this.sendToRenderer('recording:error', {
        message: err instanceof Error ? err.message : String(err)
      })
    }
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
