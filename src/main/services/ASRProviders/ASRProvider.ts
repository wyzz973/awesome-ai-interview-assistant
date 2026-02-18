/** ASR 转写结果 */
export interface ASRTranscript {
  text: string
  timestamp: number
  isFinal: boolean
}

/** ASR 供应商回调 */
export type ASRTranscriptCallback = (transcript: ASRTranscript) => void

/** ASR 供应商接口 */
export interface ASRProvider {
  readonly name: string

  /** 开启流式识别 */
  startStream(sampleRate: number, language: string): Promise<void>

  /** 发送音频数据 */
  sendAudio(audioData: ArrayBuffer): void

  /** 注册转写回调 */
  onTranscript(callback: ASRTranscriptCallback): void

  /** 停止流式识别 */
  stopStream(): Promise<void>

  /** 测试连接 */
  testConnection(): Promise<{ success: boolean; error?: string }>
}
