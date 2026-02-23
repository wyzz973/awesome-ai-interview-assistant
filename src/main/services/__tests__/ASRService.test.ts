import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ASRService } from '../ASRService'
import type { SpeakerTranscript } from '../ASRService'
import type { ASRProvider, ASRTranscriptCallback } from '../ASRProviders/ASRProvider'
import { WhisperASR } from '../ASRProviders/WhisperASR'

/** 创建一个 mock ASR Provider */
function createMockProvider(name = 'mock'): ASRProvider & {
  triggerTranscript: (text: string, isFinal: boolean) => void
  sentAudio: ArrayBuffer[]
} {
  let callback: ASRTranscriptCallback | null = null
  const sentAudio: ArrayBuffer[] = []

  return {
    name,
    sentAudio,
    async startStream() {},
    sendAudio(audioData: ArrayBuffer) {
      sentAudio.push(audioData)
    },
    onTranscript(cb: ASRTranscriptCallback) {
      callback = cb
    },
    async stopStream() {},
    async testConnection() {
      return { success: true }
    },
    triggerTranscript(text: string, isFinal: boolean) {
      if (callback) {
        callback({ text, timestamp: Date.now(), isFinal })
      }
    }
  }
}

function createPCMChunk(durationMs: number, sampleRate = 16000, amplitude = 0.35): ArrayBuffer {
  const sampleCount = Math.max(1, Math.round(sampleRate * (durationMs / 1000)))
  const samples = new Int16Array(sampleCount)
  const value = Math.round(Math.max(-1, Math.min(1, amplitude)) * 0x7fff)
  for (let i = 0; i < samples.length; i++) {
    samples[i] = value
  }
  return samples.buffer
}

describe('ASRProvider interface', () => {
  it('should define required methods', () => {
    const provider = createMockProvider()
    expect(typeof provider.startStream).toBe('function')
    expect(typeof provider.sendAudio).toBe('function')
    expect(typeof provider.onTranscript).toBe('function')
    expect(typeof provider.stopStream).toBe('function')
    expect(typeof provider.testConnection).toBe('function')
    expect(typeof provider.name).toBe('string')
  })
})

describe('ASRService', () => {
  let service: ASRService
  let systemProvider: ReturnType<typeof createMockProvider>
  let micProvider: ReturnType<typeof createMockProvider>

  beforeEach(() => {
    service = new ASRService()
    systemProvider = createMockProvider('system')
    micProvider = createMockProvider('mic')
    service.setSystemProvider(systemProvider)
    service.setMicProvider(micProvider)
  })

  describe('startStream / stopStream', () => {
    it('should start both providers', async () => {
      const systemStart = vi.spyOn(systemProvider, 'startStream')
      const micStart = vi.spyOn(micProvider, 'startStream')

      await service.startStream(16000, 'zh')

      expect(systemStart).toHaveBeenCalledWith(16000, 'zh')
      expect(micStart).toHaveBeenCalledWith(16000, 'zh')
    })

    it('should stop both providers', async () => {
      const systemStop = vi.spyOn(systemProvider, 'stopStream')
      const micStop = vi.spyOn(micProvider, 'stopStream')

      await service.startStream(16000, 'zh')
      await service.stopStream()

      expect(systemStop).toHaveBeenCalled()
      expect(micStop).toHaveBeenCalled()
    })

    it('should throw if providers not set', async () => {
      const emptyService = new ASRService()
      await expect(emptyService.startStream(16000, 'zh')).rejects.toThrow(
        'Both system and mic ASR providers must be set before starting'
      )
    })

    it('should track running state', async () => {
      expect(service.isRunning()).toBe(false)
      await service.startStream(16000, 'zh')
      expect(service.isRunning()).toBe(true)
      await service.stopStream()
      expect(service.isRunning()).toBe(false)
    })
  })

  describe('dual-channel transcription', () => {
    it('should tag system channel as interviewer', async () => {
      const transcripts: SpeakerTranscript[] = []
      service.onTranscript((t) => transcripts.push(t))

      await service.startStream(16000, 'zh')
      systemProvider.triggerTranscript('What is React?', true)

      expect(transcripts).toHaveLength(1)
      expect(transcripts[0].speaker).toBe('interviewer')
      expect(transcripts[0].text).toBe('What is React?')
      expect(transcripts[0].isFinal).toBe(true)
    })

    it('should tag mic channel as me', async () => {
      const transcripts: SpeakerTranscript[] = []
      service.onTranscript((t) => transcripts.push(t))

      await service.startStream(16000, 'zh')
      micProvider.triggerTranscript('React is a UI library', true)

      expect(transcripts).toHaveLength(1)
      expect(transcripts[0].speaker).toBe('me')
      expect(transcripts[0].text).toBe('React is a UI library')
    })

    it('should handle interleaved transcripts from both channels', async () => {
      const transcripts: SpeakerTranscript[] = []
      service.onTranscript((t) => transcripts.push(t))

      await service.startStream(16000, 'zh')
      systemProvider.triggerTranscript('Question 1', true)
      micProvider.triggerTranscript('Answer 1', true)
      systemProvider.triggerTranscript('Question 2', false)

      expect(transcripts).toHaveLength(3)
      expect(transcripts[0].speaker).toBe('interviewer')
      expect(transcripts[1].speaker).toBe('me')
      expect(transcripts[2].speaker).toBe('interviewer')
      expect(transcripts[2].isFinal).toBe(false)
    })

    it('should include timestamp in transcripts', async () => {
      const transcripts: SpeakerTranscript[] = []
      service.onTranscript((t) => transcripts.push(t))

      await service.startStream(16000, 'zh')
      systemProvider.triggerTranscript('hi', true)

      expect(transcripts[0].timestamp).toBeGreaterThan(0)
    })
  })

  describe('sendAudio', () => {
    it('should forward system audio to system provider', async () => {
      await service.startStream(16000, 'zh')

      const buf = new ArrayBuffer(320)
      service.sendSystemAudio(buf)

      expect(systemProvider.sentAudio).toHaveLength(1)
      expect(systemProvider.sentAudio[0]).toBe(buf)
    })

    it('should forward mic audio to mic provider', async () => {
      await service.startStream(16000, 'zh')

      const buf = new ArrayBuffer(320)
      service.sendMicAudio(buf)

      expect(micProvider.sentAudio).toHaveLength(1)
      expect(micProvider.sentAudio[0]).toBe(buf)
    })

    it('should not forward audio when not running', () => {
      const buf = new ArrayBuffer(320)
      service.sendSystemAudio(buf)
      service.sendMicAudio(buf)

      expect(systemProvider.sentAudio).toHaveLength(0)
      expect(micProvider.sentAudio).toHaveLength(0)
    })
  })

  describe('testConnection', () => {
    it('should test both providers', async () => {
      const result = await service.testConnection()
      expect(result.system).toEqual({ success: true })
      expect(result.mic).toEqual({ success: true })
    })

    it('should return errors when providers not set', async () => {
      const emptyService = new ASRService()
      const result = await emptyService.testConnection()
      expect(result.system.success).toBe(false)
      expect(result.mic.success).toBe(false)
    })
  })
})

describe('WhisperASR', () => {
  const mockFetch = vi.fn()
  vi.stubGlobal('fetch', mockFetch)

  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('should have name "whisper"', () => {
    const provider = new WhisperASR({ baseURL: 'https://api.test.com', apiKey: 'sk-test' })
    expect(provider.name).toBe('whisper')
  })

  it('should implement ASRProvider interface', () => {
    const provider = new WhisperASR({ baseURL: 'https://api.test.com', apiKey: 'sk-test' })
    expect(typeof provider.startStream).toBe('function')
    expect(typeof provider.sendAudio).toBe('function')
    expect(typeof provider.onTranscript).toBe('function')
    expect(typeof provider.stopStream).toBe('function')
    expect(typeof provider.testConnection).toBe('function')
  })

  describe('testConnection', () => {
    it('should call whisper transcriptions endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: '' })
      })

      const provider = new WhisperASR({ baseURL: 'https://api.openai.com', apiKey: 'sk-key' })
      const result = await provider.testConnection()

      expect(result).toEqual({ success: true })
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/audio/transcriptions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-key'
          })
        })
      )
    })

    it('should return error on HTTP failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized'
      })

      const provider = new WhisperASR({ baseURL: 'https://api.test.com', apiKey: 'bad-key' })
      const result = await provider.testConnection()

      expect(result.success).toBe(false)
      expect(result.error).toContain('401')
      expect(result.error).toContain('/audio/transcriptions')
    })

    it('should return error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'))

      const provider = new WhisperASR({ baseURL: 'https://api.test.com', apiKey: 'sk-key' })
      const result = await provider.testConnection()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Connection refused')
    })

    it('should use chat completions endpoint for qwen provider', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] })
      })

      const provider = new WhisperASR({
        providerId: 'qwen',
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: 'sk-qwen',
        model: 'qwen3-asr-flash'
      })
      const result = await provider.testConnection()

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-qwen'
          })
        })
      )
    })

    it('should build qwen asr body in compatible format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] })
      })

      const provider = new WhisperASR({
        providerId: 'qwen',
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: 'sk-qwen',
        model: 'qwen3-asr-flash'
      })
      await provider.testConnection()

      const [, options] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]
      const body = JSON.parse(String(options?.body))
      expect(body.model).toBe('qwen3-asr-flash')
      expect(body.stream).toBe(false)
      expect(body.temperature).toBeUndefined()
      expect(body.asr_options).toBeDefined()
      expect(body.messages?.[0]?.content?.[0]?.type).toBe('input_audio')
      expect(body.messages?.[0]?.content?.[0]?.input_audio?.data).toContain('https://dashscope.oss-cn-beijing.aliyuncs.com/audios/welcome.mp3')
      expect(body.messages?.[0]?.content?.[0]?.input_audio?.format).toBeUndefined()
    })

    it('should normalize legacy dashscope /api/v1 to /compatible-mode/v1', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] })
      })

      const provider = new WhisperASR({
        providerId: 'qwen',
        baseURL: 'https://dashscope.aliyuncs.com/api/v1',
        apiKey: 'sk-qwen',
        model: 'qwen3-asr-flash'
      })
      const result = await provider.testConnection()

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-qwen'
          })
        })
      )
    })

    it('should return actionable hint when tts model is used for ASR', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => ''
      })

      const provider = new WhisperASR({
        providerId: 'qwen',
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: 'sk-qwen',
        model: 'qwen3-tts-flash'
      })
      const result = await provider.testConnection()

      expect(result.success).toBe(false)
      expect(result.error).toContain('更像 TTS')
      expect(result.error).toContain('qwen3-asr-flash')
    })
  })

  describe('streaming workflow', () => {
    it('should accumulate audio and flush on stop', async () => {
      vi.useFakeTimers()

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'transcribed text' })
      })

      const provider = new WhisperASR({
        baseURL: 'https://api.test.com',
        apiKey: 'sk-key',
        streaming: { vadEnabled: false },
      })
      const transcripts: { text: string; isFinal: boolean }[] = []
      provider.onTranscript((t) => transcripts.push({ text: t.text, isFinal: t.isFinal }))

      await provider.startStream(16000, 'zh')

      // Send some audio
      provider.sendAudio(createPCMChunk(220))
      provider.sendAudio(createPCMChunk(220))

      // Stop should flush remaining audio
      await provider.stopStream()

      vi.useRealTimers()

      // Should have called fetch at least once (on stop flush)
      expect(mockFetch).toHaveBeenCalled()
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]
      expect(lastCall[0]).toBe('https://api.test.com/v1/audio/transcriptions')
    })

    it('should not send audio after stopStream', async () => {
      vi.useFakeTimers()

      const provider = new WhisperASR({
        baseURL: 'https://api.test.com',
        apiKey: 'sk-key',
        streaming: { vadEnabled: false },
      })
      await provider.startStream(16000, 'zh')
      await provider.stopStream()

      // This should be ignored
      provider.sendAudio(createPCMChunk(120))

      vi.useRealTimers()
    })

    it('should call flush periodically with setInterval', async () => {
      vi.useFakeTimers()

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'periodic result' })
      })

      const provider = new WhisperASR({
        baseURL: 'https://api.test.com',
        apiKey: 'sk-key',
        streaming: { vadEnabled: false, chunkLengthMs: 1000 },
      })
      const transcripts: string[] = []
      provider.onTranscript((t) => transcripts.push(t.text))

      await provider.startStream(16000, 'en')
      provider.sendAudio(createPCMChunk(1200))

      // Advance timer past the flush interval (3000ms)
      await vi.advanceTimersByTimeAsync(3100)

      await provider.stopStream()

      vi.useRealTimers()

      expect(mockFetch).toHaveBeenCalled()
    })

    it('should parse transcript text from qwen chat completions response', async () => {
      vi.useFakeTimers()

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '这是一段转写结果' } }] })
      })

      const provider = new WhisperASR({
        providerId: 'qwen',
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: 'sk-qwen',
        model: 'qwen3-asr-flash',
        streaming: { vadEnabled: false },
      })
      const transcripts: string[] = []
      provider.onTranscript((t) => transcripts.push(t.text))

      await provider.startStream(16000, 'zh')
      provider.sendAudio(createPCMChunk(300))
      await provider.stopStream()

      vi.useRealTimers()

      expect(transcripts).toContain('这是一段转写结果')
    })

    it('should emit partial then final with VAD end-of-speech detection', async () => {
      vi.useFakeTimers()

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ text: '你好，今天聊一下项目架构' }),
      })

      const provider = new WhisperASR({
        baseURL: 'https://api.test.com',
        apiKey: 'sk-key',
        streaming: {
          chunkLengthMs: 900,
          overlapMs: 300,
          emitPartial: true,
          vadEnabled: true,
          vadThreshold: 0.01,
          minSpeechMs: 120,
          minSilenceMs: 240,
        },
      })

      const events: Array<{ text: string; isFinal: boolean }> = []
      provider.onTranscript((t) => events.push({ text: t.text, isFinal: t.isFinal }))

      await provider.startStream(16000, 'zh')
      provider.sendAudio(createPCMChunk(1200, 16000, 0.35))
      await vi.advanceTimersByTimeAsync(1400)
      provider.sendAudio(createPCMChunk(400, 16000, 0))
      await vi.advanceTimersByTimeAsync(1200)
      await provider.stopStream()
      vi.useRealTimers()

      expect(events.some((e) => !e.isFinal)).toBe(true)
      expect(events.some((e) => e.isFinal)).toBe(true)
    })

    it('should dedupe overlap text between consecutive finals', async () => {
      vi.useFakeTimers()

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ text: '你好世界' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ text: '世界今天继续' }),
        })

      const provider = new WhisperASR({
        baseURL: 'https://api.test.com',
        apiKey: 'sk-key',
        streaming: {
          emitPartial: false,
          vadEnabled: true,
          vadThreshold: 0.01,
          minSpeechMs: 120,
          minSilenceMs: 220,
          overlapMs: 400,
          chunkLengthMs: 1000,
        },
      })

      const finals: string[] = []
      provider.onTranscript((t) => {
        if (t.isFinal) finals.push(t.text)
      })

      await provider.startStream(16000, 'zh')
      provider.sendAudio(createPCMChunk(500, 16000, 0.32))
      provider.sendAudio(createPCMChunk(350, 16000, 0))
      await vi.advanceTimersByTimeAsync(1400)

      provider.sendAudio(createPCMChunk(550, 16000, 0.34))
      provider.sendAudio(createPCMChunk(350, 16000, 0))
      await vi.advanceTimersByTimeAsync(1400)

      await provider.stopStream()
      vi.useRealTimers()

      expect(finals[0]).toBe('你好世界')
      expect(finals[1]).toBe('今天继续')
    })
  })

  describe('WAV formatting', () => {
    it('should send FormData with correct fields', async () => {
      vi.useFakeTimers()

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'hello' })
      })

      const provider = new WhisperASR({
        baseURL: 'https://api.test.com',
        apiKey: 'sk-key',
        streaming: { vadEnabled: false },
      })
      provider.onTranscript(() => {})

      await provider.startStream(16000, 'zh')
      provider.sendAudio(createPCMChunk(300))
      await provider.stopStream()

      vi.useRealTimers()

      expect(mockFetch).toHaveBeenCalled()
      const body = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][1].body as FormData
      expect(body.get('model')).toBe('whisper-1')
      expect(body.get('language')).toBe('zh')
      expect(body.get('response_format')).toBe('json')
      expect(body.get('file')).toBeInstanceOf(Blob)
    })

    it('should map zh-en language to zh', async () => {
      vi.useFakeTimers()

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ text: '' })
      })

      const provider = new WhisperASR({
        baseURL: 'https://api.test.com',
        apiKey: 'sk-key',
        streaming: { vadEnabled: false },
      })
      provider.onTranscript(() => {})

      await provider.startStream(16000, 'zh-en')
      provider.sendAudio(createPCMChunk(280))
      await provider.stopStream()

      vi.useRealTimers()

      const body = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][1].body as FormData
      expect(body.get('language')).toBe('zh')
    })
  })
})
