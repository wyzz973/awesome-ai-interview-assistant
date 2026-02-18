import type { ASRProvider, ASRTranscript, ASRTranscriptCallback } from './ASRProvider'

export interface AliyunASRConfig {
  appKey: string
  accessKeyId: string
  accessKeySecret: string
}

/**
 * 阿里云实时语音识别 ASR Provider
 * 使用阿里云 NLS WebSocket API 进行实时语音转文字。
 */
export class AliyunASR implements ASRProvider {
  readonly name = 'aliyun'

  private config: AliyunASRConfig
  private callback: ASRTranscriptCallback | null = null
  private ws: WebSocket | null = null
  private running = false
  private taskId = ''

  constructor(config: AliyunASRConfig) {
    this.config = { ...config }
  }

  async startStream(sampleRate: number, language: string): Promise<void> {
    this.running = true
    this.taskId = generateTaskId()

    const url = buildAliyunWsUrl(this.config.accessKeyId, this.config.accessKeySecret)

    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        // 发送 StartTranscription 指令
        const startMessage = {
          header: {
            message_id: generateTaskId(),
            task_id: this.taskId,
            namespace: 'SpeechTranscriber',
            name: 'StartTranscription',
            appkey: this.config.appKey
          },
          payload: {
            format: 'pcm',
            sample_rate: sampleRate,
            enable_intermediate_result: true,
            enable_punctuation_prediction: true,
            enable_inverse_text_normalization: true
          }
        }
        this.ws!.send(JSON.stringify(startMessage))
        resolve()
      }

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data as string)
      }

      this.ws.onerror = () => {
        reject(new Error('Aliyun ASR WebSocket connection failed'))
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

    // 发送 StopTranscription 指令
    const stopMessage = {
      header: {
        message_id: generateTaskId(),
        task_id: this.taskId,
        namespace: 'SpeechTranscriber',
        name: 'StopTranscription',
        appkey: this.config.appKey
      }
    }
    this.ws.send(JSON.stringify(stopMessage))

    return new Promise<void>((resolve) => {
      const onClose = () => {
        this.running = false
        resolve()
      }

      if (this.ws) {
        this.ws.addEventListener('close', onClose, { once: true })
        // Fallback timeout to prevent hanging
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
      const url = buildAliyunWsUrl(this.config.accessKeyId, this.config.accessKeySecret)
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
      const name = msg.header?.name

      if (name === 'TranscriptionResultChanged') {
        // 中间结果
        const text = msg.payload?.result
        if (text && this.callback) {
          const transcript: ASRTranscript = {
            text,
            timestamp: Date.now(),
            isFinal: false
          }
          this.callback(transcript)
        }
      } else if (name === 'SentenceEnd') {
        // 最终结果
        const text = msg.payload?.result
        if (text && this.callback) {
          const transcript: ASRTranscript = {
            text,
            timestamp: Date.now(),
            isFinal: true
          }
          this.callback(transcript)
        }
      }
    } catch {
      // Skip malformed messages
    }
  }
}

function buildAliyunWsUrl(accessKeyId: string, _accessKeySecret: string): string {
  // 阿里云 NLS WebSocket 地址
  // 实际使用时需要通过 accessKeyId/accessKeySecret 生成 token
  // 这里使用简化的 URL 格式，token 生成逻辑在实际部署中完善
  return `wss://nls-gateway.cn-shanghai.aliyuncs.com/ws/v1?token=${accessKeyId}`
}

function generateTaskId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
}
