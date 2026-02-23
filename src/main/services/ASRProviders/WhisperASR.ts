import { DEFAULT_WHISPER_STREAMING } from '@shared/constants'
import type { WhisperStreamingConfig } from '@shared/types/config'
import type { ASRProvider, ASRTranscript, ASRTranscriptCallback } from './ASRProvider'

const OVERLAP_TAIL_LIMIT = 160
const MAX_UTTERANCE_MS = 30000
const MIN_OVERLAP_TEXT_CHARS = 2

export interface WhisperASRConfig {
  providerId?: string
  baseURL: string
  apiKey: string
  model?: string
  streaming?: WhisperStreamingConfig
}

export interface WhisperASRDebugEvent {
  timestamp: number
  stage: 'state' | 'decision' | 'request' | 'response' | 'error'
  reason?: string
  isFinal?: boolean
  vadSpeech?: boolean
  chunkMs?: number
  utteranceMs?: number
  speechMs?: number
  silenceMs?: number
  latencyMs?: number
  status?: number
  textLength?: number
  message?: string
  model?: string
  endpoint?: string
}

/**
 * Whisper ASR Provider（OpenAI 兼容）
 *
 * 实现策略：
 * 1. 可选 VAD 门控，避免静音/噪声频繁请求；
 * 2. 支持 partial/final 两阶段输出；
 * 3. 支持 chunk + overlap 参数，段间做文本前缀去重。
 */
export class WhisperASR implements ASRProvider {
  readonly name = 'whisper'

  private config: WhisperASRConfig
  private callback: ASRTranscriptCallback | null = null
  private debugCallback: ((event: WhisperASRDebugEvent) => void) | null = null

  private running = false
  private language = 'zh'
  private sampleRate = 16000
  private streaming = normalizeStreamingConfig()

  private tickTimer: ReturnType<typeof setInterval> | null = null
  private inflight = false
  private pendingTick = false
  private pendingFinal = false

  private inUtterance = false
  private speechMs = 0
  private silenceMs = 0
  private utteranceChunks: Uint8Array[] = []
  private utteranceBytes = 0
  private preRollChunks: Uint8Array[] = []
  private preRollBytes = 0

  private lastPartialText = ''
  private lastPartialAt = 0
  private lastFinalTail = ''
  private lastVADSpeech: boolean | null = null

  constructor(config: WhisperASRConfig) {
    this.config = { ...config }
    this.streaming = normalizeStreamingConfig(this.config.streaming)
  }

  async startStream(sampleRate: number, language: string): Promise<void> {
    this.sampleRate = Number.isFinite(sampleRate) && sampleRate > 0 ? Math.round(sampleRate) : 16000
    this.language = language
    this.running = true
    this.streaming = normalizeStreamingConfig(this.config.streaming)
    this.resetAllState()

    const tickMs = Math.max(200, Math.min(900, Math.round(this.streaming.chunkLengthMs / 4)))
    this.tickTimer = setInterval(() => {
      void this.processTick(false)
    }, tickMs)
    this.emitDebug({
      stage: 'state',
      reason: 'start',
      model: this.getModel(),
      endpoint: this.usesChatCompletionsASR() ? '/chat/completions' : '/audio/transcriptions',
      message: `chunk=${this.streaming.chunkLengthMs}ms overlap=${this.streaming.overlapMs}ms vad=${this.streaming.vadEnabled ? 'on' : 'off'}`,
    })
  }

  sendAudio(audioData: ArrayBuffer): void {
    if (!this.running || audioData.byteLength === 0) return

    const chunk = new Uint8Array(audioData.slice(0))
    if (chunk.byteLength === 0) return

    const chunkMs = this.bytesToMs(chunk.byteLength)
    const speech = this.streaming.vadEnabled ? hasSpeechEnergy(chunk, this.streaming.vadThreshold) : true
    if (this.lastVADSpeech === null || this.lastVADSpeech !== speech) {
      this.lastVADSpeech = speech
      this.emitDebug({
        stage: 'state',
        reason: speech ? 'speech-start' : 'speech-stop',
        vadSpeech: speech,
        chunkMs,
      })
    }

    if (speech) {
      if (!this.inUtterance) {
        this.startUtterance()
      }
      this.pushUtteranceChunk(chunk)
      this.speechMs += chunkMs
      this.silenceMs = 0
      return
    }

    if (this.inUtterance) {
      this.pushUtteranceChunk(chunk)
      this.silenceMs += chunkMs
    } else {
      this.pushPreRollChunk(chunk)
    }
  }

  onTranscript(callback: ASRTranscriptCallback): void {
    this.callback = callback
  }

  onDebug(callback: (event: WhisperASRDebugEvent) => void): void {
    this.debugCallback = callback
  }

  async stopStream(): Promise<void> {
    this.running = false

    if (this.tickTimer) {
      clearInterval(this.tickTimer)
      this.tickTimer = null
    }

    await this.processTick(true)
    this.emitDebug({
      stage: 'state',
      reason: 'stop',
    })
    this.resetAllState()
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const useChatEndpoint = this.usesChatCompletionsASR()
      let response: Response
      if (useChatEndpoint && this.isQwenASRModel(this.getModel())) {
        // 与官方文档一致：连接探测时用公网音频 URL，避免最小音频边界问题
        response = await this.requestQwenProbeConnection(this.language)
      } else if (useChatEndpoint) {
        const testWav = createMinimalWav()
        response = await this.requestChatCompletionsASR(testWav, this.language)
      } else {
        const testWav = createMinimalWav()
        response = await this.requestTranscriptionsASR(testWav, this.language)
      }

      if (!response.ok) {
        const text = await response.text()
        const endpoint = useChatEndpoint ? '/chat/completions' : '/audio/transcriptions'
        return { success: false, error: this.formatConnectionError(response.status, text, endpoint) }
      }

      return { success: true }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  private async processTick(forceFinal: boolean): Promise<void> {
    if (this.inflight) {
      this.pendingTick = true
      this.pendingFinal = this.pendingFinal || forceFinal
      return
    }

    if (!this.inUtterance) return

    const utteranceMs = this.bytesToMs(this.utteranceBytes)
    const enoughSpeech = this.speechMs >= this.streaming.minSpeechMs || forceFinal
    const shouldFinalize = forceFinal ||
      (this.streaming.vadEnabled
        ? this.silenceMs >= this.streaming.minSilenceMs
        : utteranceMs >= this.streaming.chunkLengthMs)

    if (!enoughSpeech) {
      if (shouldFinalize) {
        this.resetUtterance(false)
      }
      return
    }

    const partialIntervalMs = Math.max(500, Math.round(this.streaming.chunkLengthMs * 0.55))
    const shouldPartial = this.streaming.emitPartial &&
      !shouldFinalize &&
      utteranceMs >= Math.min(this.streaming.chunkLengthMs, 1200) &&
      Date.now() - this.lastPartialAt >= partialIntervalMs

    if (!shouldPartial && !shouldFinalize) return
    const reason = shouldFinalize
      ? (forceFinal ? 'manual-stop' : (this.streaming.vadEnabled ? 'silence-final' : 'chunk-final'))
      : 'periodic-partial'
    this.emitDebug({
      stage: 'decision',
      reason,
      isFinal: shouldFinalize,
      utteranceMs,
      speechMs: this.speechMs,
      silenceMs: this.silenceMs,
    })

    this.inflight = true
    try {
      const pcm = mergeChunks(this.utteranceChunks, this.utteranceBytes)
      if (pcm.byteLength === 0) {
        if (shouldFinalize) this.resetUtterance(true)
        return
      }

      const wavData = wrapRawPCMAsWav(pcm, this.sampleRate)
      const text = await this.requestAndExtractText(wavData, this.language, {
        reason,
        isFinal: shouldFinalize,
        utteranceMs,
        speechMs: this.speechMs,
        silenceMs: this.silenceMs,
      })
      if (!text) {
        if (shouldFinalize) this.resetUtterance(true)
        return
      }

      const normalized = normalizeTranscriptText(text)
      if (!normalized) {
        if (shouldFinalize) this.resetUtterance(true)
        return
      }

      const deduped = stripOverlapPrefix(normalized, this.lastFinalTail)

      if (shouldFinalize) {
        const finalText = deduped || normalized
        if (finalText) {
          this.emitTranscript(finalText, true)
          this.lastFinalTail = keepTailText(joinTailText(this.lastFinalTail, finalText), OVERLAP_TAIL_LIMIT)
        }
        this.lastPartialText = ''
        this.lastPartialAt = 0
        this.resetUtterance(true)
      } else {
        const partialText = deduped || normalized
        if (partialText && partialText !== this.lastPartialText) {
          this.emitTranscript(partialText, false)
          this.lastPartialText = partialText
          this.lastPartialAt = Date.now()
        }
      }
    } catch {
      this.emitDebug({
        stage: 'error',
        reason,
        isFinal: shouldFinalize,
        message: 'request failed',
      })
      if (shouldFinalize) this.resetUtterance(true)
    } finally {
      this.inflight = false
      if (this.pendingTick) {
        const nextForceFinal = this.pendingFinal
        this.pendingTick = false
        this.pendingFinal = false
        void this.processTick(nextForceFinal)
      }
    }
  }

  private emitTranscript(text: string, isFinal: boolean): void {
    if (!this.callback || !text.trim()) return
    const transcript: ASRTranscript = {
      text: text.trim(),
      timestamp: Date.now(),
      isFinal,
    }
    this.callback(transcript)
  }

  private startUtterance(): void {
    this.inUtterance = true
    this.speechMs = 0
    this.silenceMs = 0
    this.lastPartialText = ''
    this.lastPartialAt = 0

    this.utteranceChunks = this.preRollChunks.splice(0)
    this.utteranceBytes = this.preRollBytes
    this.preRollBytes = 0
  }

  private resetUtterance(keepTail: boolean): void {
    if (keepTail && this.streaming.overlapMs > 0 && this.utteranceBytes > 0) {
      const overlapBytes = this.msToBytes(this.streaming.overlapMs)
      const tail = takeTailBytes(this.utteranceChunks, overlapBytes)
      this.preRollChunks = tail
      this.preRollBytes = tail.reduce((sum, chunk) => sum + chunk.byteLength, 0)
    } else {
      this.preRollChunks = []
      this.preRollBytes = 0
    }

    this.inUtterance = false
    this.speechMs = 0
    this.silenceMs = 0
    this.utteranceChunks = []
    this.utteranceBytes = 0
    this.lastPartialText = ''
    this.lastPartialAt = 0
  }

  private resetAllState(): void {
    this.inflight = false
    this.pendingTick = false
    this.pendingFinal = false
    this.inUtterance = false
    this.speechMs = 0
    this.silenceMs = 0
    this.utteranceChunks = []
    this.utteranceBytes = 0
    this.preRollChunks = []
    this.preRollBytes = 0
    this.lastPartialText = ''
    this.lastPartialAt = 0
    this.lastFinalTail = ''
    this.lastVADSpeech = null
  }

  private pushUtteranceChunk(chunk: Uint8Array): void {
    this.utteranceChunks.push(chunk)
    this.utteranceBytes += chunk.byteLength

    const maxBytes = this.msToBytes(MAX_UTTERANCE_MS)
    if (this.utteranceBytes <= maxBytes) return

    while (this.utteranceBytes > maxBytes && this.utteranceChunks.length > 1) {
      const removed = this.utteranceChunks.shift()
      if (!removed) break
      this.utteranceBytes -= removed.byteLength
    }
  }

  private pushPreRollChunk(chunk: Uint8Array): void {
    const maxBytes = this.msToBytes(this.streaming.overlapMs)
    if (maxBytes <= 0) return
    this.preRollChunks.push(chunk)
    this.preRollBytes += chunk.byteLength

    while (this.preRollBytes > maxBytes && this.preRollChunks.length > 0) {
      const removed = this.preRollChunks.shift()
      if (!removed) break
      this.preRollBytes -= removed.byteLength
    }
  }

  private bytesToMs(byteLength: number): number {
    if (this.sampleRate <= 0) return 0
    return (byteLength / (this.sampleRate * 2)) * 1000
  }

  private msToBytes(ms: number): number {
    return Math.floor(Math.max(0, ms) * (this.sampleRate * 2) / 1000)
  }

  private async requestAndExtractText(
    wavData: ArrayBuffer,
    language: string,
    context: {
      reason: string
      isFinal: boolean
      utteranceMs: number
      speechMs: number
      silenceMs: number
    },
  ): Promise<string> {
    const useChat = this.usesChatCompletionsASR()
    const endpoint = useChat ? '/chat/completions' : '/audio/transcriptions'
    const startedAt = Date.now()
    this.emitDebug({
      stage: 'request',
      reason: context.reason,
      isFinal: context.isFinal,
      endpoint,
      model: this.getModel(),
      utteranceMs: context.utteranceMs,
      speechMs: context.speechMs,
      silenceMs: context.silenceMs,
    })
    const response = useChat
      ? await this.requestChatCompletionsASR(wavData, language)
      : await this.requestTranscriptionsASR(wavData, language)
    const latencyMs = Date.now() - startedAt
    if (!response.ok) {
      const text = (await safeReadResponseText(response)).trim()
      this.emitDebug({
        stage: 'error',
        reason: context.reason,
        isFinal: context.isFinal,
        endpoint,
        status: response.status,
        latencyMs,
        message: text || `HTTP ${response.status}`,
      })
      return ''
    }
    const result = await response.json()
    const text = useChat
      ? extractTextFromChatCompletionsResult(result)
      : extractTextFromTranscriptionsResult(result)
    this.emitDebug({
      stage: 'response',
      reason: context.reason,
      isFinal: context.isFinal,
      endpoint,
      status: response.status,
      latencyMs,
      textLength: text.trim().length,
      utteranceMs: context.utteranceMs,
      speechMs: context.speechMs,
      silenceMs: context.silenceMs,
    })
    return text
  }

  private usesChatCompletionsASR(): boolean {
    const provider = this.config.providerId?.toLowerCase()
    const base = this.config.baseURL.toLowerCase()
    return provider === 'qwen' || base.includes('dashscope.aliyuncs.com')
  }

  private getModel(): string {
    const model = this.config.model?.trim()
    if (model) return model
    return this.getDefaultASRModel()
  }

  private normalizeBaseURL(): string {
    let normalized = this.config.baseURL.replace(/\/+$/, '')
    if (
      this.usesChatCompletionsASR() &&
      /dashscope\.aliyuncs\.com\/api\/v1$/i.test(normalized)
    ) {
      normalized = normalized.replace(/\/api\/v1$/i, '/compatible-mode/v1')
    }
    return normalized
  }

  private buildEndpoint(path: '/audio/transcriptions' | '/chat/completions'): string {
    const base = this.normalizeBaseURL()
    if (base.endsWith(path)) {
      return base
    }
    if (/\/v\d+$/i.test(base)) {
      return `${base}${path}`
    }
    return `${base}/v1${path}`
  }

  private async requestTranscriptionsASR(wavData: ArrayBuffer, language: string): Promise<Response> {
    const formData = new FormData()
    formData.append('file', new Blob([wavData], { type: 'audio/wav' }), 'audio.wav')
    formData.append('model', this.getModel())
    formData.append('language', language === 'zh-en' ? 'zh' : language)
    formData.append('response_format', 'json')

    const url = this.buildEndpoint('/audio/transcriptions')
    return fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: formData,
    })
  }

  private async requestChatCompletionsASR(wavData: ArrayBuffer, language: string): Promise<Response> {
    const audioDataURI = `data:audio/wav;base64,${Buffer.from(wavData).toString('base64')}`
    return this.requestChatCompletionsASRByAudioData(audioDataURI, language)
  }

  private async requestQwenProbeConnection(language: string): Promise<Response> {
    const sampleAudioURL = 'https://dashscope.oss-cn-beijing.aliyuncs.com/audios/welcome.mp3'
    return this.requestChatCompletionsASRByAudioData(sampleAudioURL, language)
  }

  private async requestChatCompletionsASRByAudioData(audioData: string, language: string): Promise<Response> {
    const model = this.getModel()
    const body = this.isQwenASRModel(model)
      ? {
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'input_audio', input_audio: { data: audioData } },
              ],
            },
          ],
          stream: false,
          asr_options: this.buildASROptions(language),
        }
      : {
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: this.buildTranscriptionPrompt(language) },
                { type: 'input_audio', input_audio: { data: audioData, format: 'wav' } },
              ],
            },
          ],
          stream: false,
          temperature: 0,
        }

    const url = this.buildEndpoint('/chat/completions')
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    })
  }

  private buildTranscriptionPrompt(language: string): string {
    switch (language) {
      case 'en':
        return 'Transcribe the following audio into plain English text only.'
      case 'zh-en':
        return '请将这段音频准确转写为文本，自动识别中英文，只返回转写结果。'
      default:
        return '请将这段音频准确转写为中文文本，只返回转写结果。'
    }
  }

  private buildASROptions(language: string): { enable_itn: boolean; language?: 'zh' | 'en' } {
    if (language === 'zh') {
      return { enable_itn: false, language: 'zh' }
    }
    if (language === 'en') {
      return { enable_itn: false, language: 'en' }
    }
    return { enable_itn: false }
  }

  private getDefaultASRModel(): string {
    return this.usesChatCompletionsASR() ? 'qwen3-asr-flash' : 'whisper-1'
  }

  private isLikelyTTSModel(model: string): boolean {
    return /(tts|text[-_]?to[-_]?speech|speech[-_]?synthesis|voice[-_]?clone)/i.test(model)
  }

  private isQwenASRModel(model: string): boolean {
    return /^qwen\d*[-_.]?asr/i.test(model.trim())
  }

  private formatConnectionError(
    status: number,
    responseText: string,
    endpoint: '/chat/completions' | '/audio/transcriptions',
  ): string {
    const model = this.getModel()
    const text = responseText?.trim() || 'request failed'
    if (status === 404) {
      const hint = this.isLikelyTTSModel(model)
        ? `模型 ${model} 更像 TTS，请改用 ${this.getDefaultASRModel()}`
        : `请确认模型 ${model} 与 Base URL 匹配且支持 ASR`
      return `HTTP 404: ${text}。接口 ${endpoint}。${hint}`
    }
    if (this.isLikelyTTSModel(model)) {
      return `HTTP ${status}: ${text}。接口 ${endpoint}。模型 ${model} 更像 TTS，请改用 ${this.getDefaultASRModel()}`
    }
    return `HTTP ${status}: ${text}。接口 ${endpoint}`
  }

  private emitDebug(event: Omit<WhisperASRDebugEvent, 'timestamp'>): void {
    if (!this.debugCallback) return
    this.debugCallback({
      timestamp: Date.now(),
      ...event,
    })
  }
}

function normalizeStreamingConfig(
  streaming?: WhisperStreamingConfig,
): Required<WhisperStreamingConfig> {
  const next = {
    ...DEFAULT_WHISPER_STREAMING,
    ...(streaming ?? {}),
  }
  return {
    chunkLengthMs: clampInt(next.chunkLengthMs, 800, 12000),
    overlapMs: clampInt(next.overlapMs, 0, 2000),
    emitPartial: !!next.emitPartial,
    vadEnabled: !!next.vadEnabled,
    vadThreshold: clampFloat(next.vadThreshold, 0.001, 0.2),
    minSpeechMs: clampInt(next.minSpeechMs, 80, 4000),
    minSilenceMs: clampInt(next.minSilenceMs, 120, 5000),
  }
}

function clampInt(value: unknown, min: number, max: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.round(n)))
}

function clampFloat(value: unknown, min: number, max: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

function hasSpeechEnergy(chunk: Uint8Array, threshold: number): boolean {
  if (chunk.byteLength < 2) return false
  const sampleCount = Math.floor(chunk.byteLength / 2)
  const samples = new Int16Array(chunk.buffer, chunk.byteOffset, sampleCount)
  let sum = 0
  for (let i = 0; i < samples.length; i++) {
    const normalized = samples[i] / 32768
    sum += normalized * normalized
  }
  const rms = Math.sqrt(sum / samples.length)
  return rms >= threshold
}

function mergeChunks(chunks: Uint8Array[], totalLength: number): Uint8Array {
  if (totalLength <= 0) return new Uint8Array(0)
  const merged = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}

function takeTailBytes(chunks: Uint8Array[], limitBytes: number): Uint8Array[] {
  if (limitBytes <= 0 || chunks.length === 0) return []

  const tail: Uint8Array[] = []
  let kept = 0
  for (let i = chunks.length - 1; i >= 0; i--) {
    const chunk = chunks[i]
    if (kept >= limitBytes) break
    if (kept + chunk.byteLength <= limitBytes) {
      tail.unshift(chunk)
      kept += chunk.byteLength
      continue
    }
    const needed = limitBytes - kept
    const slice = chunk.subarray(chunk.byteLength - needed)
    tail.unshift(slice)
    kept += needed
    break
  }
  return tail
}

function normalizeTranscriptText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripOverlapPrefix(text: string, previousTail: string): string {
  const normalizedText = normalizeTranscriptText(text)
  const normalizedPrev = normalizeTranscriptText(previousTail)
  if (!normalizedText || !normalizedPrev) return normalizedText

  const max = Math.min(normalizedText.length, normalizedPrev.length, 48)
  for (let len = max; len >= MIN_OVERLAP_TEXT_CHARS; len--) {
    if (normalizedPrev.slice(-len) === normalizedText.slice(0, len)) {
      return normalizedText.slice(len).trimStart()
    }
  }
  return normalizedText
}

function joinTailText(prev: string, next: string): string {
  if (!prev) return next
  if (!next) return prev
  return `${prev} ${next}`.trim()
}

function keepTailText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(-maxChars)
}

async function safeReadResponseText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ''
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

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')

  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)

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

function extractTextFromTranscriptionsResult(result: unknown): string {
  if (!result || typeof result !== 'object') return ''
  const text = (result as Record<string, unknown>).text
  return typeof text === 'string' ? text : ''
}

function extractTextFromChatCompletionsResult(result: unknown): string {
  if (!result || typeof result !== 'object') return ''
  const choices = (result as Record<string, unknown>).choices
  if (!Array.isArray(choices) || choices.length === 0) return ''

  const message = (choices[0] as Record<string, unknown>).message
  if (!message || typeof message !== 'object') return ''

  const content = (message as Record<string, unknown>).content
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return ''
  }

  const texts = content
    .map((part) => {
      if (!part || typeof part !== 'object') return ''
      const text = (part as Record<string, unknown>).text
      return typeof text === 'string' ? text : ''
    })
    .filter(Boolean)

  return texts.join('\n')
}
