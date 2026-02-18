import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LLMService } from '../LLMService'
import type { LLMProvider, ChatMessage } from '@shared/types/llm'

function makeProvider(overrides?: Partial<LLMProvider>): LLMProvider {
  return {
    id: 'test-provider',
    name: 'Test Provider',
    baseURL: 'https://api.test.com',
    apiKey: 'sk-test-key',
    model: 'gpt-4',
    maxTokens: 2048,
    temperature: 0.7,
    ...overrides
  }
}

/** Helper: create a ReadableStream from SSE text */
function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    }
  })
}

/** Collect all tokens from an async iterable */
async function collect(iter: AsyncIterable<string>): Promise<string[]> {
  const result: string[] = []
  for await (const token of iter) {
    result.push(token)
  }
  return result
}

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  mockFetch.mockReset()
})

describe('LLMService', () => {
  describe('constructor & updateConfig', () => {
    it('should initialize with provided config', () => {
      const config = makeProvider()
      const service = new LLMService(config)
      // Verify config is used by checking testConnection calls the correct URL
      mockFetch.mockResolvedValueOnce({ ok: true, text: async () => '' })
      service.testConnection()
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/chat/completions',
        expect.any(Object)
      )
    })

    it('should update config with updateConfig()', () => {
      const service = new LLMService(makeProvider())
      service.updateConfig({ baseURL: 'https://api.new.com', model: 'gpt-3.5-turbo' })

      mockFetch.mockResolvedValueOnce({ ok: true, text: async () => '' })
      service.testConnection()
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.new.com/v1/chat/completions',
        expect.any(Object)
      )
    })

    it('should not mutate original config object', () => {
      const config = makeProvider()
      const service = new LLMService(config)
      service.updateConfig({ model: 'changed' })
      expect(config.model).toBe('gpt-4')
    })
  })

  describe('chat()', () => {
    it('should build correct request body', async () => {
      const sseData = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: [DONE]\n\n'
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: sseStream(sseData)
      })

      const service = new LLMService(makeProvider())
      const messages: ChatMessage[] = [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hi' }
      ]

      const iter = await service.chat(messages)
      await collect(iter)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer sk-test-key'
          },
          body: JSON.stringify({
            model: 'gpt-4',
            messages,
            max_tokens: 2048,
            temperature: 0.7,
            stream: true
          })
        })
      )
    })

    it('should yield streamed content tokens', async () => {
      const sseData = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: [DONE]\n\n'
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: sseStream(sseData)
      })

      const service = new LLMService(makeProvider())
      const iter = await service.chat([{ role: 'user', content: 'Hi' }])
      const tokens = await collect(iter)
      expect(tokens).toEqual(['Hello', ' world'])
    })
  })

  describe('analyzeScreenshot()', () => {
    it('should build vision request with image_url content', async () => {
      const sseData = [
        'data: {"choices":[{"delta":{"content":"I see"}}]}\n\n',
        'data: [DONE]\n\n'
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: sseStream(sseData)
      })

      const service = new LLMService(makeProvider())
      const iter = await service.analyzeScreenshot('abc123base64', 'What is this?')
      await collect(iter)

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,abc123base64' }
            },
            { type: 'text', text: 'What is this?' }
          ]
        }
      ])
    })

    it('should include history messages when provided', async () => {
      const sseData = [
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
        'data: [DONE]\n\n'
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: sseStream(sseData)
      })

      const history: ChatMessage[] = [
        { role: 'system', content: 'Analyze screenshots' },
        { role: 'user', content: 'Previous question' },
        { role: 'assistant', content: 'Previous answer' }
      ]

      const service = new LLMService(makeProvider())
      const iter = await service.analyzeScreenshot('img', undefined, history)
      await collect(iter)

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.messages).toHaveLength(4)
      expect(callBody.messages[0]).toEqual({ role: 'system', content: 'Analyze screenshots' })
      expect(callBody.messages[3].role).toBe('user')
      expect(callBody.messages[3].content).toEqual([
        {
          type: 'image_url',
          image_url: { url: 'data:image/png;base64,img' }
        }
      ])
    })

    it('should omit text content when no prompt provided', async () => {
      const sseData = [
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
        'data: [DONE]\n\n'
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: sseStream(sseData)
      })

      const service = new LLMService(makeProvider())
      const iter = await service.analyzeScreenshot('img')
      await collect(iter)

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      const userContent = callBody.messages[0].content
      expect(userContent).toHaveLength(1)
      expect(userContent[0].type).toBe('image_url')
    })
  })

  describe('generateReview()', () => {
    it('should build review request with system prompt and session data', async () => {
      const sseData = [
        'data: {"choices":[{"delta":{"content":"Report"}}]}\n\n',
        'data: [DONE]\n\n'
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: sseStream(sseData)
      })

      const service = new LLMService(makeProvider())
      const iter = await service.generateReview('session data here')
      await collect(iter)

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.messages[0].role).toBe('system')
      expect(callBody.messages[1]).toEqual({
        role: 'user',
        content: 'session data here'
      })
    })
  })

  describe('testConnection()', () => {
    it('should return success when API responds OK', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '{"id":"test"}'
      })

      const service = new LLMService(makeProvider())
      const result = await service.testConnection()
      expect(result).toEqual({ success: true })
    })

    it('should send non-streaming request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '{}'
      })

      const service = new LLMService(makeProvider())
      await service.testConnection()

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.stream).toBe(false)
      expect(callBody.max_tokens).toBe(1)
    })

    it('should return error on HTTP failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized'
      })

      const service = new LLMService(makeProvider())
      const result = await service.testConnection()
      expect(result).toEqual({ success: false, error: 'HTTP 401: Unauthorized' })
    })

    it('should return error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const service = new LLMService(makeProvider())
      const result = await service.testConnection()
      expect(result).toEqual({ success: false, error: 'Network error' })
    })
  })

  describe('streamRequest() SSE parsing', () => {
    it('should handle chunked SSE data across multiple reads', async () => {
      // SSE data split across chunks
      const sseData = [
        'data: {"choices":[{"delta":{"con',
        'tent":"He"}}]}\n\ndata: {"choices":[{"delta":{"content":"llo"}}]}\n\n',
        'data: [DONE]\n\n'
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: sseStream(sseData)
      })

      const service = new LLMService(makeProvider())
      const iter = await service.chat([{ role: 'user', content: 'test' }])
      const tokens = await collect(iter)
      expect(tokens).toEqual(['He', 'llo'])
    })

    it('should skip SSE comment lines', async () => {
      const sseData = [
        ': keep-alive\n',
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
        'data: [DONE]\n\n'
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: sseStream(sseData)
      })

      const service = new LLMService(makeProvider())
      const iter = await service.chat([{ role: 'user', content: 'test' }])
      const tokens = await collect(iter)
      expect(tokens).toEqual(['ok'])
    })

    it('should skip empty delta content', async () => {
      const sseData = [
        'data: {"choices":[{"delta":{}}]}\n\n',
        'data: {"choices":[{"delta":{"content":""}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"real"}}]}\n\n',
        'data: [DONE]\n\n'
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: sseStream(sseData)
      })

      const service = new LLMService(makeProvider())
      const iter = await service.chat([{ role: 'user', content: 'test' }])
      const tokens = await collect(iter)
      expect(tokens).toEqual(['real'])
    })

    it('should throw on HTTP error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      })

      const service = new LLMService(makeProvider())
      const iter = await service.chat([{ role: 'user', content: 'test' }])
      await expect(collect(iter)).rejects.toThrow('LLM API error: HTTP 500: Internal Server Error')
    })

    it('should throw when response body is null', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: null
      })

      const service = new LLMService(makeProvider())
      const iter = await service.chat([{ role: 'user', content: 'test' }])
      await expect(collect(iter)).rejects.toThrow('LLM API error: response body is null')
    })

    it('should handle malformed JSON gracefully', async () => {
      const sseData = [
        'data: {invalid json}\n\n',
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
        'data: [DONE]\n\n'
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: sseStream(sseData)
      })

      const service = new LLMService(makeProvider())
      const iter = await service.chat([{ role: 'user', content: 'test' }])
      const tokens = await collect(iter)
      expect(tokens).toEqual(['ok'])
    })
  })

  describe('multi-provider support', () => {
    it('should switch provider via updateConfig', async () => {
      const service = new LLMService(makeProvider())

      // Switch to a different provider
      service.updateConfig({
        baseURL: 'https://api.deepseek.com',
        apiKey: 'sk-deepseek-key',
        model: 'deepseek-chat'
      })

      const sseData = [
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
        'data: [DONE]\n\n'
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: sseStream(sseData)
      })

      const iter = await service.chat([{ role: 'user', content: 'test' }])
      await collect(iter)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.deepseek.com/v1/chat/completions',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-deepseek-key'
          }),
          body: expect.stringContaining('"model":"deepseek-chat"')
        })
      )
    })

    it('should work with various OpenAI-compatible providers', async () => {
      const providers = [
        makeProvider({ baseURL: 'https://api.openai.com', model: 'gpt-4' }),
        makeProvider({ baseURL: 'https://api.deepseek.com', model: 'deepseek-chat' }),
        makeProvider({ baseURL: 'https://api.moonshot.cn', model: 'moonshot-v1-8k' })
      ]

      for (const config of providers) {
        const sseData = [
          'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
          'data: [DONE]\n\n'
        ]
        mockFetch.mockResolvedValueOnce({
          ok: true,
          body: sseStream(sseData)
        })

        const service = new LLMService(config)
        const iter = await service.chat([{ role: 'user', content: 'test' }])
        const tokens = await collect(iter)
        expect(tokens).toEqual(['ok'])

        const calledUrl = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0]
        expect(calledUrl).toBe(`${config.baseURL}/v1/chat/completions`)
      }
    })
  })
})
