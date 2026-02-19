import type { LLMProvider, ChatMessage } from '@shared/types/llm'
import { getLogger } from '../logger'

const log = getLogger('LLMService')

export class LLMService {
  private config: LLMProvider

  constructor(config: LLMProvider) {
    this.config = { ...config }
  }

  updateConfig(config: LLMProvider): void {
    log.info('LLM 配置更新')
    this.config = { ...config }
  }

  /** 流式文本聊天 */
  async chat(messages: ChatMessage[]): Promise<AsyncIterable<string>> {
    log.info('开始 LLM 聊天')
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
    log.info('开始截屏分析')

    // 根据供应商决定 image_url 格式
    // GLM (智谱清言): 需要纯 base64 字符串
    // OpenAI / Qwen / Moonshot / MiniMax 等: 需要 data URI 格式
    const imageUrl = this.isGLMProvider()
      ? imageBase64
      : `data:image/png;base64,${imageBase64}`

    const userContent = [
      {
        type: 'image_url' as const,
        image_url: { url: imageUrl }
      },
      { type: 'text' as const, text: prompt || '请分析这张图片' }
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
    log.info('开始生成复盘报告')
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

  /** 测试连接（可传入临时配置，用于 Onboarding/Settings 中测试用户表单值） */
  async testConnection(override?: { baseURL: string; apiKey: string; model: string }): Promise<{ success: boolean; error?: string }> {
    log.info('测试 LLM 连接')
    try {
      const baseURL = override?.baseURL ?? this.config.baseURL
      const apiKey = override?.apiKey ?? this.config.apiKey
      const model = override?.model ?? this.config.model

      const url = `${baseURL.replace(/\/+$/, '')}/chat/completions`
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
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

  /** 从供应商 API 动态获取可用模型列表 */
  async fetchModels(baseURL: string, apiKey: string): Promise<{ models: string[]; error?: string }> {
    log.debug('获取模型列表')
    try {
      const base = baseURL.replace(/\/+$/, '')
      const url = `${base}/models`
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(8000),
      })

      if (!response.ok) {
        return { models: [], error: `HTTP ${response.status}` }
      }

      const json = await response.json()
      // OpenAI 兼容格式: { data: [{ id: "model-id" }, ...] }
      const data = json.data ?? json
      if (!Array.isArray(data)) {
        return { models: [], error: '响应格式不符合预期' }
      }

      const models = data
        .map((m: { id?: string }) => m.id)
        .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
        .sort()

      return { models }
    } catch (err) {
      return {
        models: [],
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  /** 检测当前配置是否为 GLM (智谱清言) 供应商 */
  private isGLMProvider(): boolean {
    return this.config.id === 'glm' || this.config.baseURL.includes('bigmodel.cn')
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
      log.error('LLM API 请求失败', { status: response.status })
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
