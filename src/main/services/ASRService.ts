import type { ASRProvider, ASRTranscript } from './ASRProviders/ASRProvider'
import { getLogger } from '../logger'

const log = getLogger('ASRService')

/** 带说话人标识的转写结果 */
export interface SpeakerTranscript {
  speaker: 'interviewer' | 'me'
  text: string
  timestamp: number
  isFinal: boolean
}

export type SpeakerTranscriptCallback = (transcript: SpeakerTranscript) => void

/**
 * ASR 编排服务
 * 管理双通道（系统音频 = interviewer，麦克风 = me）的 ASR Provider，
 * 统一输出带说话人标识的转写结果。
 */
export class ASRService {
  private systemProvider: ASRProvider | null = null
  private micProvider: ASRProvider | null = null
  private callback: SpeakerTranscriptCallback | null = null
  private running = false

  /** 设置系统音频通道的 ASR Provider（interviewer） */
  setSystemProvider(provider: ASRProvider): void {
    log.debug('设置系统音频 ASR Provider', { name: provider.name })
    this.systemProvider = provider
  }

  /** 设置麦克风通道的 ASR Provider（me） */
  setMicProvider(provider: ASRProvider): void {
    log.debug('设置麦克风 ASR Provider', { name: provider.name })
    this.micProvider = provider
  }

  /** 注册转写回调 */
  onTranscript(callback: SpeakerTranscriptCallback): void {
    this.callback = callback
  }

  /** 开启双通道识别 */
  async startStream(sampleRate: number, language: string): Promise<void> {
    if (!this.systemProvider || !this.micProvider) {
      throw new Error('Both system and mic ASR providers must be set before starting')
    }

    log.info('开始 ASR 双通道识别', { sampleRate, language })
    this.running = true

    this.systemProvider.onTranscript((transcript: ASRTranscript) => {
      if (this.callback) {
        this.callback({
          speaker: 'interviewer',
          text: transcript.text,
          timestamp: transcript.timestamp,
          isFinal: transcript.isFinal
        })
      }
    })

    this.micProvider.onTranscript((transcript: ASRTranscript) => {
      if (this.callback) {
        this.callback({
          speaker: 'me',
          text: transcript.text,
          timestamp: transcript.timestamp,
          isFinal: transcript.isFinal
        })
      }
    })

    await Promise.all([
      this.systemProvider.startStream(sampleRate, language),
      this.micProvider.startStream(sampleRate, language)
    ])
  }

  /** 向系统音频通道发送音频数据 */
  sendSystemAudio(audioData: ArrayBuffer): void {
    if (!this.running || !this.systemProvider) return
    this.systemProvider.sendAudio(audioData)
  }

  /** 向麦克风通道发送音频数据 */
  sendMicAudio(audioData: ArrayBuffer): void {
    if (!this.running || !this.micProvider) return
    this.micProvider.sendAudio(audioData)
  }

  /** 停止双通道识别 */
  async stopStream(): Promise<void> {
    log.info('停止 ASR 识别')
    this.running = false

    const stops: Promise<void>[] = []
    if (this.systemProvider) stops.push(this.systemProvider.stopStream())
    if (this.micProvider) stops.push(this.micProvider.stopStream())

    await Promise.all(stops)
  }

  /** 测试两个通道的连接 */
  async testConnection(): Promise<{
    system: { success: boolean; error?: string }
    mic: { success: boolean; error?: string }
  }> {
    log.info('测试 ASR 连接')
    const [system, mic] = await Promise.all([
      this.systemProvider
        ? this.systemProvider.testConnection()
        : { success: false, error: 'System provider not set' },
      this.micProvider
        ? this.micProvider.testConnection()
        : { success: false, error: 'Mic provider not set' }
    ])

    return { system, mic }
  }

  /** 当前是否正在运行 */
  isRunning(): boolean {
    return this.running
  }
}
