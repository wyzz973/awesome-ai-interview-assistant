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

/**
 * 音频捕获桥接器（主进程）
 *
 * 实际采集在 renderer 进程完成（可使用 getUserMedia/MediaRecorder），
 * 主进程仅维护录制状态并转发音频分片给 ASRService。
 */
export class AudioCapture {
  private isCapturing = false
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

  /** 开始捕获（主进程仅做权限检查和状态切换） */
  async start(): Promise<void> {
    if (this.isCapturing) return
    log.info('开始音频捕获（renderer bridge）')

    // 请求麦克风权限 (macOS)
    if (process.platform === 'darwin') {
      const micStatus = systemPreferences.getMediaAccessStatus('microphone')
      if (micStatus !== 'granted') {
        const granted = await systemPreferences.askForMediaAccess('microphone')
        if (!granted) {
          throw new Error('麦克风权限被拒绝')
        }
      }
    }

    this.isCapturing = true
  }

  /** 停止捕获 */
  stop(): void {
    if (!this.isCapturing) return
    log.info('停止音频捕获')
    this.isCapturing = false
  }

  /** 从 renderer 推入麦克风音频分片 */
  pushMicData(data: Buffer): void {
    if (!this.isCapturing || !this.onMicData || data.length === 0) return
    this.onMicData(data)
  }

  /** 从 renderer 推入系统音频分片 */
  pushSystemAudioData(data: Buffer): void {
    if (!this.isCapturing || !this.onSystemAudioData || data.length === 0) return
    this.onSystemAudioData(data)
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
    const probes = [
      'test -d "/Library/Audio/Plug-Ins/HAL" && ls "/Library/Audio/Plug-Ins/HAL" 2>/dev/null | grep -qi "blackhole"',
      'test -d "$HOME/Library/Audio/Plug-Ins/HAL" && ls "$HOME/Library/Audio/Plug-Ins/HAL" 2>/dev/null | grep -qi "blackhole"',
      'brew list --cask blackhole-2ch >/dev/null 2>&1',
    ]

    for (const probe of probes) {
      try {
        await execAsync(probe)
        log.debug('BlackHole 检测命中', { probe })
        return true
      } catch {
        // try next probe
      }
    }
    log.debug('BlackHole 检测未命中')
    return false
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
}
