import { systemPreferences } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'
import { getLogger } from '../logger'

const execAsync = promisify(exec)
const log = getLogger('AudioCapture')

export interface AudioDevice {
  id: string
  name: string
  kind: 'input' | 'output'
}

export type AudioDataCallback = (data: Buffer) => void

export class AudioCapture {
  private micStream: MediaRecorder | null = null
  private systemStream: MediaRecorder | null = null
  private isCapturing: boolean = false

  private onMicData: AudioDataCallback | null = null
  private onSystemAudioData: AudioDataCallback | null = null

  /** 设置麦克风音频数据回调 */
  setOnMicData(callback: AudioDataCallback): void {
    this.onMicData = callback
  }

  /** 设置系统音频数据回调 */
  setOnSystemAudioData(callback: AudioDataCallback): void {
    this.onSystemAudioData = callback
  }

  /** 开始捕获 */
  async start(micDeviceId?: string, systemDeviceId?: string): Promise<void> {
    if (this.isCapturing) return
    log.info('开始音频捕获')

    // 请求麦克风权限 (macOS)
    if (process.platform === 'darwin') {
      const micStatus = systemPreferences.getMediaAccessStatus('microphone')
      if (micStatus !== 'granted') {
        const granted = await systemPreferences.askForMediaAccess('microphone')
        if (!granted) {
          throw new Error('Microphone access denied')
        }
      }
    }

    this.isCapturing = true

    // 启动麦克风捕获
    if (this.onMicData) {
      await this.startMicCapture(micDeviceId)
    }

    // 启动系统音频捕获 (需要 BlackHole)
    if (this.onSystemAudioData && systemDeviceId) {
      await this.startSystemCapture(systemDeviceId)
    }
  }

  /** 停止捕获 */
  stop(): void {
    log.info('停止音频捕获')
    this.isCapturing = false

    if (this.micStream && this.micStream.state !== 'inactive') {
      this.micStream.stop()
    }
    this.micStream = null

    if (this.systemStream && this.systemStream.state !== 'inactive') {
      this.systemStream.stop()
    }
    this.systemStream = null
  }

  /** 列出可用音频设备 */
  async listDevices(): Promise<AudioDevice[]> {
    try {
      const { stdout } = await execAsync(
        'system_profiler SPAudioDataType -json 2>/dev/null || echo "[]"',
      )
      const data = JSON.parse(stdout)
      const devices: AudioDevice[] = []

      const audioItems = data?.SPAudioDataType ?? []
      for (const item of audioItems) {
        const items = item?._items ?? []
        for (const device of items) {
          const name = device._name ?? 'Unknown'
          const hasInput = device.coreaudio_default_audio_input_device === 'spaudio_yes'
          const hasOutput = device.coreaudio_default_audio_output_device === 'spaudio_yes'

          if (hasInput) {
            devices.push({ id: name, name, kind: 'input' })
          }
          if (hasOutput) {
            devices.push({ id: name, name, kind: 'output' })
          }
        }
      }

      return devices
    } catch {
      return []
    }
  }

  /** 检测 BlackHole 是否已安装 */
  async checkBlackHole(): Promise<boolean> {
    try {
      // 优先检查驱动文件是否存在（system_profiler 可能不列出虚拟音频设备）
      const { stdout } = await execAsync(
        'ls /Library/Audio/Plug-Ins/HAL/ 2>/dev/null | grep -i blackhole',
      )
      return stdout.trim().length > 0
    } catch {
      return false
    }
  }

  /** 通过 brew 安装 BlackHole 2ch（在终端中执行） */
  async installBlackHole(): Promise<{ success: boolean; error?: string; terminalOpened?: boolean }> {
    try {
      // 先检查是否已安装
      const installed = await this.checkBlackHole()
      if (installed) {
        return { success: true }
      }

      // 检查 brew 是否可用
      try {
        await execAsync('which brew')
      } catch {
        return { success: false, error: '未检测到 Homebrew，请先安装 Homebrew: https://brew.sh' }
      }

      // 在终端中执行安装（cask 需要 sudo 权限，必须在真实终端中运行）
      await execAsync(
        `osascript -e 'tell application "Terminal" to do script "HOMEBREW_NO_AUTO_UPDATE=1 brew install blackhole-2ch"' -e 'tell application "Terminal" to activate'`,
      )

      return { success: true, terminalOpened: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: `无法打开终端: ${msg}` }
    }
  }

  private async startMicCapture(deviceId?: string): Promise<void> {
    try {
      const constraints: MediaStreamConstraints = {
        audio: deviceId
          ? { deviceId: { exact: deviceId } }
          : true,
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      this.micStream = new MediaRecorder(stream, { mimeType: 'audio/webm' })

      this.micStream.ondataavailable = async (event): Promise<void> => {
        if (event.data.size > 0 && this.onMicData) {
          const arrayBuffer = await event.data.arrayBuffer()
          this.onMicData(Buffer.from(arrayBuffer))
        }
      }

      this.micStream.start(250) // 250ms chunks
    } catch (err) {
      log.error('麦克风捕获失败', err)
    }
  }

  private async startSystemCapture(deviceId: string): Promise<void> {
    try {
      const constraints: MediaStreamConstraints = {
        audio: { deviceId: { exact: deviceId } },
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      this.systemStream = new MediaRecorder(stream, { mimeType: 'audio/webm' })

      this.systemStream.ondataavailable = async (event): Promise<void> => {
        if (event.data.size > 0 && this.onSystemAudioData) {
          const arrayBuffer = await event.data.arrayBuffer()
          this.onSystemAudioData(Buffer.from(arrayBuffer))
        }
      }

      this.systemStream.start(250) // 250ms chunks
    } catch (err) {
      log.error('系统音频捕获失败', err)
    }
  }
}
