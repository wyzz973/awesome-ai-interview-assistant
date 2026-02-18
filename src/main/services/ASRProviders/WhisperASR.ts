import type { ASRProvider, ASRTranscript, ASRTranscriptCallback } from './ASRProvider'

export interface WhisperASRConfig {
  baseURL: string
  apiKey: string
}

/**
 * Whisper ASR Provider
 * 使用 OpenAI Whisper API 进行语音转文字。
 * 由于 Whisper 是请求-响应模式（非实时流），
 * 这里通过定时收集音频缓冲区并批量发送实现伪流式效果。
 */
export class WhisperASR implements ASRProvider {
  readonly name = 'whisper'

  private config: WhisperASRConfig
  private callback: ASRTranscriptCallback | null = null
  private audioChunks: ArrayBuffer[] = []
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private running = false
  private language = 'zh'

  constructor(config: WhisperASRConfig) {
    this.config = { ...config }
  }

  async startStream(sampleRate: number, language: string): Promise<void> {
    this.language = language
    this.running = true
    this.audioChunks = []

    // 每 3 秒将缓冲区音频发送给 Whisper API
    this.flushTimer = setInterval(() => {
      this.flushAudio()
    }, 3000)
  }

  sendAudio(audioData: ArrayBuffer): void {
    if (!this.running) return
    this.audioChunks.push(audioData)
  }

  onTranscript(callback: ASRTranscriptCallback): void {
    this.callback = callback
  }

  async stopStream(): Promise<void> {
    this.running = false

    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }

    // 发送剩余音频
    await this.flushAudio()
    this.audioChunks = []
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // 发送一个极小的 WAV 文件测试连接
      const testWav = createMinimalWav()
      const formData = new FormData()
      formData.append('file', new Blob([testWav], { type: 'audio/wav' }), 'test.wav')
      formData.append('model', 'whisper-1')

      const url = `${this.config.baseURL}/v1/audio/transcriptions`
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`
        },
        body: formData
      })

      if (!response.ok) {
        const text = await response.text()
        return { success: false, error: `HTTP ${response.status}: ${text}` }
      }

      return { success: true }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }

  private async flushAudio(): Promise<void> {
    if (this.audioChunks.length === 0) return

    const chunks = this.audioChunks.splice(0)
    const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0)
    if (totalLength === 0) return

    const merged = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(new Uint8Array(chunk), offset)
      offset += chunk.byteLength
    }

    try {
      const wavData = wrapRawPCMAsWav(merged, 16000)
      const formData = new FormData()
      formData.append('file', new Blob([wavData], { type: 'audio/wav' }), 'audio.wav')
      formData.append('model', 'whisper-1')
      formData.append('language', this.language === 'zh-en' ? 'zh' : this.language)
      formData.append('response_format', 'json')

      const url = `${this.config.baseURL}/v1/audio/transcriptions`
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`
        },
        body: formData
      })

      if (!response.ok) return

      const result = await response.json()
      if (result.text && this.callback) {
        const transcript: ASRTranscript = {
          text: result.text,
          timestamp: Date.now(),
          isFinal: true
        }
        this.callback(transcript)
      }
    } catch {
      // Silently ignore transcription errors during streaming
    }
  }
}

/** 创建一个最小的有效 WAV 文件用于测试连接 */
function createMinimalWav(): ArrayBuffer {
  return wrapRawPCMAsWav(new Uint8Array(320), 16000)
}

/** 将 raw PCM 数据包装为 WAV 格式 */
function wrapRawPCMAsWav(pcmData: Uint8Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const dataSize = pcmData.byteLength
  const headerSize = 44
  const buffer = new ArrayBuffer(headerSize + dataSize)
  const view = new DataView(buffer)

  // RIFF header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')

  // fmt chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)

  // data chunk
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  const output = new Uint8Array(buffer)
  output.set(pcmData, headerSize)

  return buffer
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}
