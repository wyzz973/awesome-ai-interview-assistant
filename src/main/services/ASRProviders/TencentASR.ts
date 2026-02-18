import type { ASRProvider, ASRTranscript, ASRTranscriptCallback } from './ASRProvider'

export interface TencentASRConfig {
  appId: string
  secretId: string
  secretKey: string
}

/**
 * 腾讯云实时语音识别 ASR Provider
 * 使用腾讯云 ASR WebSocket API 进行实时语音转文字。
 */
export class TencentASR implements ASRProvider {
  readonly name = 'tencent'

  private config: TencentASRConfig
  private callback: ASRTranscriptCallback | null = null
  private ws: WebSocket | null = null
  private running = false

  constructor(config: TencentASRConfig) {
    this.config = { ...config }
  }

  async startStream(sampleRate: number, language: string): Promise<void> {
    this.running = true

    const engineType = mapLanguageToEngine(language, sampleRate)
    const url = buildTencentWsUrl(
      this.config.appId,
      this.config.secretId,
      this.config.secretKey,
      engineType
    )

    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        resolve()
      }

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data as string)
      }

      this.ws.onerror = () => {
        reject(new Error('Tencent ASR WebSocket connection failed'))
      }

      this.ws.onclose = () => {
        this.running = false
      }
    })
  }

  sendAudio(audioData: ArrayBuffer): void {
    if (!this.running || !this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(audioData)
  }

  onTranscript(callback: ASRTranscriptCallback): void {
    this.callback = callback
  }

  async stopStream(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.running = false
      return
    }

    // 发送结束信号（空 buffer）
    this.ws.send(JSON.stringify({ type: 'end' }))

    return new Promise<void>((resolve) => {
      const onClose = () => {
        this.running = false
        resolve()
      }

      if (this.ws) {
        this.ws.addEventListener('close', onClose, { once: true })
        setTimeout(() => {
          if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
            this.ws.close()
          }
          onClose()
        }, 5000)
      } else {
        onClose()
      }
    })
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const url = buildTencentWsUrl(
        this.config.appId,
        this.config.secretId,
        this.config.secretKey,
        '16k_zh'
      )
      return new Promise<{ success: boolean; error?: string }>((resolve) => {
        const ws = new WebSocket(url)
        const timeout = setTimeout(() => {
          ws.close()
          resolve({ success: false, error: 'Connection timeout' })
        }, 10000)

        ws.onopen = () => {
          clearTimeout(timeout)
          ws.close()
          resolve({ success: true })
        }

        ws.onerror = () => {
          clearTimeout(timeout)
          resolve({ success: false, error: 'WebSocket connection failed' })
        }
      })
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }

  private handleMessage(data: string): void {
    try {
      const msg = JSON.parse(data)

      // 腾讯云 ASR 返回格式
      if (msg.code !== 0) return

      const result = msg.result
      if (!result || !result.voice_text_str) return

      const isFinal = result.slice_type === 2 // 2 = 尾包（最终结果）

      const transcript: ASRTranscript = {
        text: result.voice_text_str,
        timestamp: Date.now(),
        isFinal
      }

      if (this.callback) {
        this.callback(transcript)
      }
    } catch {
      // Skip malformed messages
    }
  }
}

function mapLanguageToEngine(language: string, sampleRate: number): string {
  const rate = sampleRate >= 16000 ? '16k' : '8k'
  switch (language) {
    case 'en':
      return `${rate}_en`
    case 'zh-en':
      return `${rate}_zh_large`
    default:
      return `${rate}_zh`
  }
}

function buildTencentWsUrl(
  appId: string,
  secretId: string,
  _secretKey: string,
  engineType: string
): string {
  // 腾讯云 ASR WebSocket 地址
  // 实际使用时需要通过 secretId/secretKey 生成签名
  // 这里使用简化的 URL 格式
  return `wss://asr.cloud.tencent.com/asr/v2/${appId}?secretid=${secretId}&engine_type=${engineType}`
}
