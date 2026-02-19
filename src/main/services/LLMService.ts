import type { LLMProvider, ChatMessage } from '@shared/types/llm'

export class LLMService {
  private config: LLMProvider

  constructor(config: LLMProvider) {
    this.config = { ...config }
  }

  updateConfig(config: Partial<LLMProvider>): void {
    this.config = { ...this.config, ...config }
  }

  /** 流式文本聊天 */
  async chat(messages: ChatMessage[]): Promise<AsyncIterable<string>> {
    return this.streamRequest({
      model: this.config.model,
      messages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      stream: true
    })
  }

  /** 截屏分析 (vision API) */
  async analyzeScreenshot(
    imageBase64: string,
    prompt?: string,
    historyMessages?: ChatMessage[]
  ): Promise<AsyncIterable<string>> {
    const userContent = [
      {
        type: 'image_url' as const,
        image_url: { url: `data:image/png;base64,${imageBase64}` }
      },
      ...(prompt ? [{ type: 'text' as const, text: prompt }] : [])
    ]

    const messages: ChatMessage[] = [
      ...(historyMessages ?? []),
      { role: 'user', content: userContent }
    ]

    return this.streamRequest({
      model: this.config.model,
      messages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      stream: true
    })
  }

  /** 生成复盘报告 */
  async generateReview(sessionData: string): Promise<AsyncIterable<string>> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          '你是一个面试复盘助手。请根据以下面试会话数据，生成一份详细的复盘报告，包括表现评估、改进建议和亮点总结。'
      },
      { role: 'user', content: sessionData }
    ]

    return this.streamRequest({
      model: this.config.model,
      messages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      stream: true
    })
  }

  /** 测试连接 */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const url = `${this.config.baseURL.replace(/\/+$/, '')}/chat/completions`
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
          stream: false
        })
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

  /** 内部：构建请求并处理 SSE 流 */
  private async *streamRequest(body: object): AsyncGenerator<string> {
    const url = `${this.config.baseURL.replace(/\/+$/, '')}/chat/completions`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`LLM API error: HTTP ${response.status}: ${text}`)
    }

    if (!response.body) {
      throw new Error('LLM API error: response body is null')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        // Keep the last incomplete line in the buffer
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith(':')) continue
          if (trimmed === 'data: [DONE]') return

          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6)
            try {
              const parsed = JSON.parse(jsonStr)
              const content = parsed.choices?.[0]?.delta?.content
              if (content) {
                yield content
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }
      }

      // Process any remaining data in the buffer
      if (buffer.trim()) {
        const trimmed = buffer.trim()
        if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
          const jsonStr = trimmed.slice(6)
          try {
            const parsed = JSON.parse(jsonStr)
            const content = parsed.choices?.[0]?.delta?.content
            if (content) {
              yield content
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
}
