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
    })

    it('should return error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'))

      const provider = new WhisperASR({ baseURL: 'https://api.test.com', apiKey: 'sk-key' })
      const result = await provider.testConnection()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Connection refused')
    })
  })

  describe('streaming workflow', () => {
    it('should accumulate audio and flush on stop', async () => {
      vi.useFakeTimers()

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'transcribed text' })
      })

      const provider = new WhisperASR({ baseURL: 'https://api.test.com', apiKey: 'sk-key' })
      const transcripts: { text: string; isFinal: boolean }[] = []
      provider.onTranscript((t) => transcripts.push({ text: t.text, isFinal: t.isFinal }))

      await provider.startStream(16000, 'zh')

      // Send some audio
      provider.sendAudio(new ArrayBuffer(320))
      provider.sendAudio(new ArrayBuffer(320))

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

      const provider = new WhisperASR({ baseURL: 'https://api.test.com', apiKey: 'sk-key' })
      await provider.startStream(16000, 'zh')
      await provider.stopStream()

      // This should be ignored
      provider.sendAudio(new ArrayBuffer(320))

      vi.useRealTimers()
    })

    it('should call flush periodically with setInterval', async () => {
      vi.useFakeTimers()

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'periodic result' })
      })

      const provider = new WhisperASR({ baseURL: 'https://api.test.com', apiKey: 'sk-key' })
      const transcripts: string[] = []
      provider.onTranscript((t) => transcripts.push(t.text))

      await provider.startStream(16000, 'en')
      provider.sendAudio(new ArrayBuffer(320))

      // Advance timer past the flush interval (3000ms)
      await vi.advanceTimersByTimeAsync(3100)

      await provider.stopStream()

      vi.useRealTimers()

      expect(mockFetch).toHaveBeenCalled()
    })
  })

  describe('WAV formatting', () => {
    it('should send FormData with correct fields', async () => {
      vi.useFakeTimers()

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'hello' })
      })

      const provider = new WhisperASR({ baseURL: 'https://api.test.com', apiKey: 'sk-key' })
      provider.onTranscript(() => {})

      await provider.startStream(16000, 'zh')
      provider.sendAudio(new ArrayBuffer(640))
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

      const provider = new WhisperASR({ baseURL: 'https://api.test.com', apiKey: 'sk-key' })
      provider.onTranscript(() => {})

      await provider.startStream(16000, 'zh-en')
      provider.sendAudio(new ArrayBuffer(320))
      await provider.stopStream()

      vi.useRealTimers()

      const body = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][1].body as FormData
      expect(body.get('language')).toBe('zh')
    })
  })
})
