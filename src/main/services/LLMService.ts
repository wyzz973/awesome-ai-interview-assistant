import type { LLMProvider, ChatMessage, ChatMessageContent } from '@shared/types/llm'
import { LLM_PROVIDER_PRESETS } from '@shared/constants'
import { getLogger } from '../logger'

const log = getLogger('LLMService')
const MODELSD_DEV_URL = 'https://models.dev/api.json'

type ModelFetchSource = 'provider' | 'models.dev' | 'preset'

interface ModelFetchResult {
  models: string[]
  error?: string
  source?: ModelFetchSource
  warning?: string
}

export class LLMService {
  private config: LLMProvider

  constructor(config: LLMProvider) {
    this.config = { ...config }
  }

  updateConfig(config: Partial<LLMProvider>): void {
    log.info('LLM 配置更新')
    this.config = { ...this.config, ...config }
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

    const imageData = this.normalizeBase64Image(imageBase64)
    const imageUrl = `data:image/png;base64,${imageData}`

    const userContent: ChatMessageContent[] = []
    const trimmedPrompt = prompt?.trim()
    if (trimmedPrompt) {
      userContent.push({ type: 'text', text: trimmedPrompt })
    }
    userContent.push({
      type: 'image_url' as const,
      image_url: { url: imageUrl }
    })

    const messages: ChatMessage[] = [
      ...(historyMessages ?? []),
      { role: 'user', content: userContent }
    ]

    const model = this.resolveScreenshotModel()

    return this.streamRequest({
      model,
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

      const url = this.buildChatCompletionsUrl(baseURL)
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

  /** 从供应商 API 动态获取可用模型列表（失败时回退 models.dev 与本地预设） */
  async fetchModels(baseURL: string, apiKey: string, providerId?: string): Promise<ModelFetchResult> {
    const resolvedProvider = this.resolveProviderId(providerId, baseURL)
    log.debug('获取模型列表', { providerId: resolvedProvider, baseURL })

    let providerError: string | undefined
    try {
      const models = await this.fetchModelsFromProvider(resolvedProvider, baseURL, apiKey)
      if (models.length > 0) {
        return { models, source: 'provider' }
      }
      providerError = '供应商未返回可用模型'
    } catch (err) {
      providerError = err instanceof Error ? err.message : String(err)
      log.warn('供应商模型接口获取失败，尝试回退', { providerId: resolvedProvider, error: providerError })
    }

    let modelsDevError: string | undefined
    try {
      const models = await this.fetchModelsFromModelsDev(resolvedProvider)
      if (models.length > 0) {
        return {
          models,
          source: 'models.dev',
          warning: providerError ? `供应商接口失败，已回退到 models.dev：${providerError}` : undefined,
        }
      }
      modelsDevError = 'models.dev 未返回可用模型'
    } catch (err) {
      modelsDevError = err instanceof Error ? err.message : String(err)
      log.warn('models.dev 回退失败，尝试本地预设', { providerId: resolvedProvider, error: modelsDevError })
    }

    const presetModels = this.getPresetModels(resolvedProvider)
    if (presetModels.length > 0) {
      return {
        models: presetModels,
        source: 'preset',
        warning: providerError || modelsDevError ? '已回退到本地预设模型列表' : undefined,
      }
    }

    return {
      models: [],
      error: providerError ?? modelsDevError ?? '未获取到可用模型',
    }
  }

  /** 检测当前配置是否为 GLM (智谱清言) 供应商 */
  private isGLMProvider(): boolean {
    return this.config.id === 'glm' || this.config.baseURL.includes('bigmodel.cn')
  }

  private resolveScreenshotModel(): string {
    if (!this.isGLMProvider()) {
      return this.config.model
    }

    if (this.isLikelyVisionModel(this.config.model)) {
      return this.config.model
    }

    const fallbackModel = this.getGLMVisionFallbackModel(this.config.model)
    log.warn('检测到 GLM 文本模型用于截图，自动切换到视觉模型', {
      from: this.config.model,
      to: fallbackModel,
    })
    return fallbackModel
  }

  private isLikelyVisionModel(model: string): boolean {
    const normalized = model.toLowerCase()
    return (
      normalized.includes('4v') ||
      normalized.includes('.6v') ||
      normalized.includes('-v') ||
      normalized.includes('-vl') ||
      normalized.includes('vision')
    )
  }

  private getGLMVisionFallbackModel(currentModel: string): string {
    const normalized = currentModel.toLowerCase()
    if (normalized.startsWith('glm-4.6')) {
      return 'glm-4.6v'
    }
    return 'glm-4v-plus'
  }

  private normalizeBase64Image(imageBase64: string): string {
    return imageBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '').trim()
  }

  private resolveProviderId(providerId: string | undefined, baseURL: string): string {
    const normalizedId = providerId?.trim().toLowerCase()
    if (normalizedId) {
      return normalizedId
    }

    const lowerBase = baseURL.toLowerCase()
    if (lowerBase.includes('anthropic.com')) return 'claude'
    if (lowerBase.includes('bigmodel.cn') || lowerBase.includes('zhipu')) return 'glm'
    if (lowerBase.includes('dashscope.aliyuncs.com') || lowerBase.includes('qwen')) return 'qwen'
    if (lowerBase.includes('moonshot')) return 'moonshot'
    if (lowerBase.includes('minimax')) return 'minimax'
    if (lowerBase.includes('deepseek')) return 'deepseek'
    if (lowerBase.includes('openai.com')) return 'openai'
    return 'custom'
  }

  private async fetchModelsFromProvider(providerId: string, baseURL: string, apiKey: string): Promise<string[]> {
    if (providerId === 'claude') {
      const anthropicModels = await this.fetchAnthropicModels(baseURL, apiKey)
      if (anthropicModels.length > 0) {
        return anthropicModels
      }
      // Anthropic 兼容模式下再回退到 OpenAI 风格 /models
    }
    return this.fetchOpenAICompatibleModels(baseURL, apiKey)
  }

  private async fetchOpenAICompatibleModels(baseURL: string, apiKey: string): Promise<string[]> {
    const urls = this.buildModelEndpointCandidates(baseURL)
    let lastError: string | undefined

    for (const url of urls) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          signal: AbortSignal.timeout(8000),
        })

        if (!response.ok) {
          lastError = `HTTP ${response.status}`
          continue
        }

        const json = await response.json()
        const parsed = this.extractModelIds(json)
        if (parsed.length > 0) {
          return parsed
        }
        lastError = '响应格式不符合预期'
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
      }
    }

    throw new Error(lastError ?? '请求模型列表失败')
  }

  private async fetchAnthropicModels(baseURL: string, apiKey: string): Promise<string[]> {
    const url = this.buildAnthropicModelsUrl(baseURL)
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(8000),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const json = await response.json()
    const parsed = this.extractModelIds(json)
    if (parsed.length === 0) {
      throw new Error('响应格式不符合预期')
    }
    return parsed
  }

  private buildModelEndpointCandidates(baseURL: string): string[] {
    const normalized = baseURL.replace(/\/+$/, '')
    if (normalized.endsWith('/models')) {
      return [normalized]
    }

    const withVersion = this.ensureOpenAICompatibleVersion(normalized)
    const candidates = [this.buildModelsUrl(withVersion), `${normalized}/models`]
    return [...new Set(candidates)]
  }

  private buildAnthropicModelsUrl(baseURL: string): string {
    const normalized = baseURL.replace(/\/+$/, '')
    if (normalized.endsWith('/models')) {
      return normalized
    }
    const root = /\/v\d+$/i.test(normalized) ? normalized : `${normalized}/v1`
    return `${root}/models`
  }

  private extractModelIds(payload: unknown): string[] {
    const candidates = this.extractModelArray(payload)
    const ids = candidates
      .map((item) => this.extractModelId(item))
      .filter((id): id is string => Boolean(id))

    return [...new Set(ids)]
  }

  private extractModelArray(payload: unknown): unknown[] {
    if (Array.isArray(payload)) {
      return payload
    }
    if (!payload || typeof payload !== 'object') {
      return []
    }

    const record = payload as Record<string, unknown>
    const data = record.data
    if (Array.isArray(data)) {
      return data
    }
    const models = record.models
    if (Array.isArray(models)) {
      return models
    }
    const result = record.result
    if (Array.isArray(result)) {
      return result
    }
    return []
  }

  private extractModelId(item: unknown): string | null {
    if (typeof item === 'string') {
      return item.trim() || null
    }
    if (!item || typeof item !== 'object') {
      return null
    }

    const record = item as Record<string, unknown>
    const fields = ['id', 'model', 'model_id', 'name']
    for (const field of fields) {
      const value = record[field]
      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
    }
    return null
  }

  private async fetchModelsFromModelsDev(providerId: string): Promise<string[]> {
    const response = await fetch(MODELSD_DEV_URL, {
      headers: { 'User-Agent': 'ai-interview-assistant' },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const json = await response.json()
    if (!json || typeof json !== 'object') {
      throw new Error('响应格式不符合预期')
    }

    const providerIds = this.getModelsDevProviderIds(providerId)
    const allModels: Array<{ id: string; releaseDate?: string }> = []

    for (const id of providerIds) {
      const providerData = (json as Record<string, unknown>)[id]
      if (!providerData || typeof providerData !== 'object') continue

      const modelsRecord = (providerData as Record<string, unknown>).models
      if (!modelsRecord || typeof modelsRecord !== 'object') continue

      for (const [modelId, modelInfo] of Object.entries(modelsRecord as Record<string, unknown>)) {
        let releaseDate: string | undefined
        if (modelInfo && typeof modelInfo === 'object') {
          const rd = (modelInfo as Record<string, unknown>).release_date
          if (typeof rd === 'string') {
            releaseDate = rd
          }
        }
        allModels.push({ id: modelId, releaseDate })
      }
    }

    const filtered = this.filterModelsByProvider(
      providerId,
      allModels
        .filter((m) => Boolean(m.id))
        .sort((a, b) => {
          const ra = a.releaseDate ?? ''
          const rb = b.releaseDate ?? ''
          return rb.localeCompare(ra)
        })
        .map((m) => m.id)
    )

    return [...new Set(filtered)]
  }

  private getModelsDevProviderIds(providerId: string): string[] {
    switch (providerId) {
      case 'glm':
        return ['zhipuai']
      case 'qwen':
        return ['alibaba-cn', 'alibaba']
      case 'moonshot':
        return ['moonshotai', 'moonshotai-cn']
      case 'minimax':
        return ['minimax', 'minimax-cn']
      case 'claude':
        return ['anthropic']
      case 'openai':
      case 'deepseek':
        return [providerId]
      default:
        return []
    }
  }

  private filterModelsByProvider(providerId: string, models: string[]): string[] {
    switch (providerId) {
      case 'glm':
        return models.filter((id) => /^glm-/i.test(id))
      case 'qwen':
        return models.filter((id) => /^(qwen|qwq)/i.test(id))
      case 'moonshot':
        return models.filter((id) => /^(kimi-|moonshot-)/i.test(id))
      case 'minimax':
        return models.filter((id) => /^minimax-/i.test(id))
      case 'claude':
        return models.filter((id) => /^claude-/i.test(id))
      case 'deepseek':
        return models.filter((id) => /^deepseek-/i.test(id))
      default:
        return models
    }
  }

  private getPresetModels(providerId: string): string[] {
    const preset = LLM_PROVIDER_PRESETS.find((p) => p.id === providerId)
    return preset ? [...preset.models] : []
  }

  /** 内部：构建请求并处理 SSE 流 */
  private async *streamRequest(body: object): AsyncGenerator<string> {
    const url = this.buildChatCompletionsUrl(this.config.baseURL)
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

  private buildChatCompletionsUrl(baseURL: string): string {
    const base = this.ensureOpenAICompatibleVersion(baseURL)
    return `${base}/chat/completions`
  }

  private buildModelsUrl(baseURL: string): string {
    const base = this.ensureOpenAICompatibleVersion(baseURL)
    return `${base}/models`
  }

  private ensureOpenAICompatibleVersion(baseURL: string): string {
    const base = baseURL.replace(/\/+$/, '')
    return /\/v\d+$/i.test(base) ? base : `${base}/v1`
  }
}
