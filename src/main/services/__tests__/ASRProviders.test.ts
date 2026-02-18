import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AliyunASR } from '../ASRProviders/AliyunASR'
import { TencentASR } from '../ASRProviders/TencentASR'
import type { ASRTranscript } from '../ASRProviders/ASRProvider'

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  url: string
  readyState = MockWebSocket.CONNECTING
  onopen: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null
  sentMessages: (string | ArrayBuffer)[] = []
  private closeListeners: (() => void)[] = []

  constructor(url: string) {
    this.url = url
    // Auto-connect in next tick
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN
      if (this.onopen) this.onopen(new Event('open'))
    }, 0)
  }

  send(data: string | ArrayBuffer): void {
    this.sentMessages.push(data)
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED
    for (const listener of this.closeListeners) {
      listener()
    }
    if (this.onclose) this.onclose(new CloseEvent('close'))
  }

  addEventListener(type: string, listener: () => void, _options?: { once: boolean }): void {
    if (type === 'close') {
      this.closeListeners.push(listener)
    }
  }

  // Helper: simulate server message
  simulateMessage(data: string): void {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data }))
    }
  }

  // Helper: simulate error
  simulateError(): void {
    if (this.onerror) {
      this.onerror(new Event('error'))
    }
  }
}

let lastCreatedWs: MockWebSocket | null = null

vi.stubGlobal(
  'WebSocket',
  class extends MockWebSocket {
    constructor(url: string) {
      super(url)
      lastCreatedWs = this
    }
  }
)

// Expose WebSocket constants
;(globalThis as Record<string, unknown>).WebSocket = Object.assign(
  (globalThis as Record<string, unknown>).WebSocket as object,
  {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3
  }
)

beforeEach(() => {
  lastCreatedWs = null
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AliyunASR', () => {
  const config = {
    appKey: 'test-app-key',
    accessKeyId: 'test-access-key-id',
    accessKeySecret: 'test-access-key-secret'
  }

  it('should have name "aliyun"', () => {
    const provider = new AliyunASR(config)
    expect(provider.name).toBe('aliyun')
  })

  it('should implement ASRProvider interface', () => {
    const provider = new AliyunASR(config)
    expect(typeof provider.startStream).toBe('function')
    expect(typeof provider.sendAudio).toBe('function')
    expect(typeof provider.onTranscript).toBe('function')
    expect(typeof provider.stopStream).toBe('function')
    expect(typeof provider.testConnection).toBe('function')
  })

  describe('startStream', () => {
    it('should connect to aliyun WebSocket', async () => {
      const provider = new AliyunASR(config)
      const startPromise = provider.startStream(16000, 'zh')

      await vi.advanceTimersByTimeAsync(10)
      await startPromise

      expect(lastCreatedWs).not.toBeNull()
      expect(lastCreatedWs!.url).toContain('nls-gateway')
    })

    it('should send StartTranscription message on connect', async () => {
      const provider = new AliyunASR(config)
      const startPromise = provider.startStream(16000, 'zh')

      await vi.advanceTimersByTimeAsync(10)
      await startPromise

      expect(lastCreatedWs!.sentMessages).toHaveLength(1)
      const msg = JSON.parse(lastCreatedWs!.sentMessages[0] as string)
      expect(msg.header.name).toBe('StartTranscription')
      expect(msg.header.appkey).toBe('test-app-key')
      expect(msg.payload.sample_rate).toBe(16000)
      expect(msg.payload.format).toBe('pcm')
    })
  })

  describe('sendAudio', () => {
    it('should forward audio data via WebSocket', async () => {
      const provider = new AliyunASR(config)
      const startPromise = provider.startStream(16000, 'zh')
      await vi.advanceTimersByTimeAsync(10)
      await startPromise

      const audioData = new ArrayBuffer(320)
      provider.sendAudio(audioData)

      // sentMessages[0] is StartTranscription, [1] is audio
      expect(lastCreatedWs!.sentMessages).toHaveLength(2)
      expect(lastCreatedWs!.sentMessages[1]).toBe(audioData)
    })
  })

  describe('transcript handling', () => {
    it('should emit intermediate results as non-final', async () => {
      const provider = new AliyunASR(config)
      const transcripts: ASRTranscript[] = []
      provider.onTranscript((t) => transcripts.push(t))

      const startPromise = provider.startStream(16000, 'zh')
      await vi.advanceTimersByTimeAsync(10)
      await startPromise

      lastCreatedWs!.simulateMessage(
        JSON.stringify({
          header: { name: 'TranscriptionResultChanged' },
          payload: { result: '你好' }
        })
      )

      expect(transcripts).toHaveLength(1)
      expect(transcripts[0].text).toBe('你好')
      expect(transcripts[0].isFinal).toBe(false)
    })

    it('should emit SentenceEnd results as final', async () => {
      const provider = new AliyunASR(config)
      const transcripts: ASRTranscript[] = []
      provider.onTranscript((t) => transcripts.push(t))

      const startPromise = provider.startStream(16000, 'zh')
      await vi.advanceTimersByTimeAsync(10)
      await startPromise

      lastCreatedWs!.simulateMessage(
        JSON.stringify({
          header: { name: 'SentenceEnd' },
          payload: { result: '你好世界' }
        })
      )

      expect(transcripts).toHaveLength(1)
      expect(transcripts[0].text).toBe('你好世界')
      expect(transcripts[0].isFinal).toBe(true)
    })

    it('should ignore malformed messages', async () => {
      const provider = new AliyunASR(config)
      const transcripts: ASRTranscript[] = []
      provider.onTranscript((t) => transcripts.push(t))

      const startPromise = provider.startStream(16000, 'zh')
      await vi.advanceTimersByTimeAsync(10)
      await startPromise

      lastCreatedWs!.simulateMessage('not json')
      lastCreatedWs!.simulateMessage(JSON.stringify({ header: { name: 'Unknown' } }))

      expect(transcripts).toHaveLength(0)
    })
  })

  describe('stopStream', () => {
    it('should send StopTranscription message', async () => {
      const provider = new AliyunASR(config)
      const startPromise = provider.startStream(16000, 'zh')
      await vi.advanceTimersByTimeAsync(10)
      await startPromise

      const stopPromise = provider.stopStream()
      await vi.advanceTimersByTimeAsync(5100)
      await stopPromise

      const messages = lastCreatedWs!.sentMessages.map((m) =>
        typeof m === 'string' ? JSON.parse(m) : m
      )
      const stopMsg = messages.find(
        (m: Record<string, unknown>) =>
          typeof m === 'object' && (m as { header?: { name: string } }).header?.name === 'StopTranscription'
      )
      expect(stopMsg).toBeDefined()
    })
  })

  describe('testConnection', () => {
    it('should return success on connection open', async () => {
      const provider = new AliyunASR(config)
      const resultPromise = provider.testConnection()
      await vi.advanceTimersByTimeAsync(10)
      const result = await resultPromise
      expect(result.success).toBe(true)
    })
  })
})

describe('TencentASR', () => {
  const config = {
    appId: 'test-app-id',
    secretId: 'test-secret-id',
    secretKey: 'test-secret-key'
  }

  it('should have name "tencent"', () => {
    const provider = new TencentASR(config)
    expect(provider.name).toBe('tencent')
  })

  it('should implement ASRProvider interface', () => {
    const provider = new TencentASR(config)
    expect(typeof provider.startStream).toBe('function')
    expect(typeof provider.sendAudio).toBe('function')
    expect(typeof provider.onTranscript).toBe('function')
    expect(typeof provider.stopStream).toBe('function')
    expect(typeof provider.testConnection).toBe('function')
  })

  describe('startStream', () => {
    it('should connect to tencent WebSocket with correct engine type', async () => {
      const provider = new TencentASR(config)
      const startPromise = provider.startStream(16000, 'zh')
      await vi.advanceTimersByTimeAsync(10)
      await startPromise

      expect(lastCreatedWs).not.toBeNull()
      expect(lastCreatedWs!.url).toContain('asr.cloud.tencent.com')
      expect(lastCreatedWs!.url).toContain('16k_zh')
    })

    it('should use English engine for en language', async () => {
      const provider = new TencentASR(config)
      const startPromise = provider.startStream(16000, 'en')
      await vi.advanceTimersByTimeAsync(10)
      await startPromise

      expect(lastCreatedWs!.url).toContain('16k_en')
    })

    it('should use large model engine for zh-en', async () => {
      const provider = new TencentASR(config)
      const startPromise = provider.startStream(16000, 'zh-en')
      await vi.advanceTimersByTimeAsync(10)
      await startPromise

      expect(lastCreatedWs!.url).toContain('16k_zh_large')
    })

    it('should use 8k rate for low sample rates', async () => {
      const provider = new TencentASR(config)
      const startPromise = provider.startStream(8000, 'zh')
      await vi.advanceTimersByTimeAsync(10)
      await startPromise

      expect(lastCreatedWs!.url).toContain('8k_zh')
    })
  })

  describe('sendAudio', () => {
    it('should forward audio data via WebSocket', async () => {
      const provider = new TencentASR(config)
      const startPromise = provider.startStream(16000, 'zh')
      await vi.advanceTimersByTimeAsync(10)
      await startPromise

      const audioData = new ArrayBuffer(320)
      provider.sendAudio(audioData)

      expect(lastCreatedWs!.sentMessages).toHaveLength(1)
      expect(lastCreatedWs!.sentMessages[0]).toBe(audioData)
    })
  })

  describe('transcript handling', () => {
    it('should emit intermediate results (slice_type != 2)', async () => {
      const provider = new TencentASR(config)
      const transcripts: ASRTranscript[] = []
      provider.onTranscript((t) => transcripts.push(t))

      const startPromise = provider.startStream(16000, 'zh')
      await vi.advanceTimersByTimeAsync(10)
      await startPromise

      lastCreatedWs!.simulateMessage(
        JSON.stringify({
          code: 0,
          result: { voice_text_str: '你好', slice_type: 1 }
        })
      )

      expect(transcripts).toHaveLength(1)
      expect(transcripts[0].text).toBe('你好')
      expect(transcripts[0].isFinal).toBe(false)
    })

    it('should emit final results (slice_type == 2)', async () => {
      const provider = new TencentASR(config)
      const transcripts: ASRTranscript[] = []
      provider.onTranscript((t) => transcripts.push(t))

      const startPromise = provider.startStream(16000, 'zh')
      await vi.advanceTimersByTimeAsync(10)
      await startPromise

      lastCreatedWs!.simulateMessage(
        JSON.stringify({
          code: 0,
          result: { voice_text_str: '你好世界', slice_type: 2 }
        })
      )

      expect(transcripts).toHaveLength(1)
      expect(transcripts[0].text).toBe('你好世界')
      expect(transcripts[0].isFinal).toBe(true)
    })

    it('should ignore error results (code != 0)', async () => {
      const provider = new TencentASR(config)
      const transcripts: ASRTranscript[] = []
      provider.onTranscript((t) => transcripts.push(t))

      const startPromise = provider.startStream(16000, 'zh')
      await vi.advanceTimersByTimeAsync(10)
      await startPromise

      lastCreatedWs!.simulateMessage(
        JSON.stringify({
          code: 1001,
          message: 'error'
        })
      )

      expect(transcripts).toHaveLength(0)
    })

    it('should ignore malformed messages', async () => {
      const provider = new TencentASR(config)
      const transcripts: ASRTranscript[] = []
      provider.onTranscript((t) => transcripts.push(t))

      const startPromise = provider.startStream(16000, 'zh')
      await vi.advanceTimersByTimeAsync(10)
      await startPromise

      lastCreatedWs!.simulateMessage('not json')

      expect(transcripts).toHaveLength(0)
    })
  })

  describe('stopStream', () => {
    it('should send end message', async () => {
      const provider = new TencentASR(config)
      const startPromise = provider.startStream(16000, 'zh')
      await vi.advanceTimersByTimeAsync(10)
      await startPromise

      const stopPromise = provider.stopStream()
      await vi.advanceTimersByTimeAsync(5100)
      await stopPromise

      const sentStrings = lastCreatedWs!.sentMessages.filter(
        (m): m is string => typeof m === 'string'
      )
      const endMsg = sentStrings.find((m) => {
        try {
          return JSON.parse(m).type === 'end'
        } catch {
          return false
        }
      })
      expect(endMsg).toBeDefined()
    })
  })

  describe('testConnection', () => {
    it('should return success on connection open', async () => {
      const provider = new TencentASR(config)
      const resultPromise = provider.testConnection()
      await vi.advanceTimersByTimeAsync(10)
      const result = await resultPromise
      expect(result.success).toBe(true)
    })
  })
})
