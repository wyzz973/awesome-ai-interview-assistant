import Store from 'electron-store'
import * as keytar from 'keytar'
import type { AppConfig, WhisperStreamingConfig } from '@shared/types/config'
import type { HotkeyConfig } from '@shared/types/hotkey'
import { DEFAULT_APP_CONFIG, KEYCHAIN_SERVICE } from './defaults'
import { DEFAULT_WHISPER_STREAMING, DEFAULT_SYSTEM_PROMPT } from '@shared/constants'
import { getLogger } from '../logger'

const log = getLogger('ConfigManager')
const LLM_ROLES = ['screenshot', 'chat', 'review'] as const
const ASR_SECURE_KEYS = [
  'asr.whisper.apiKey',
  'asr.aliyun.accessKeyId',
  'asr.aliyun.accessKeySecret',
  'asr.tencent.secretId',
  'asr.tencent.secretKey',
] as const

const LEGACY_DEFAULT_SYSTEM_PROMPTS = new Set([
  `你是一位资深的技术面试辅助助手。你的任务是帮助用户在技术面试中获取实时辅助。

请遵循以下原则：
1. **直接给出答案**：面试时间有限，直接给出关键答案和要点
2. **代码题**：给出可运行的代码，附带简短的思路说明和时间/空间复杂度
3. **系统设计题**：给出清晰的架构方案，包含核心组件、数据流和关键技术选型
4. **概念题**：用简洁的语言解释核心概念，举例说明
5. **格式化输出**：使用 Markdown 格式，代码块标注语言类型
6. **中英双语**：如果题目是英文，先给英文答案，再附中文解释`.trim(),
])

const PROGRAMMING_LANGUAGES = new Set([
  'auto',
  'python',
  'java',
  'javascript',
  'typescript',
  'go',
  'cpp',
  'c',
  'rust',
  'csharp',
  'kotlin',
  'swift',
  'php',
])
const RECORDING_GATE_MODES = new Set(['strict', 'lenient'])

type ChangeCallback = (newValue: unknown, oldValue: unknown) => void

export class ConfigManager {
  private store: Store<AppConfig>
  private listeners: Map<string, Set<ChangeCallback>>

  constructor() {
    this.store = new Store<AppConfig>({
      name: 'settings',
      defaults: DEFAULT_APP_CONFIG,
    })
    this.listeners = new Map()
    this.migrateProgrammingLanguageDefault()
    this.migrateRecordingGateModeDefault()
    this.migrateSystemPromptToLatestDefault()
  }

  /** 读取配置项 */
  get<K extends keyof AppConfig>(key: K): AppConfig[K]
  get<T>(key: string, defaultValue?: T): T
  get(key: string, defaultValue?: unknown): unknown {
    return this.store.get(key as keyof AppConfig, defaultValue as never)
  }

  /** 写入配置项并触发变更监听 */
  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void
  set(key: string, value: unknown): void
  set(key: string, value: unknown): void {
    log.debug('配置更新', { key })
    const oldValue = this.store.get(key as keyof AppConfig)
    this.store.set(key as keyof AppConfig, value as never)
    this.notifyListeners(key, value, oldValue)
  }

  /** 通过 macOS Keychain 读取敏感信息 */
  async getSecure(key: string): Promise<string | null> {
    return keytar.getPassword(KEYCHAIN_SERVICE, key)
  }

  /** 通过 macOS Keychain 存储敏感信息 */
  async setSecure(key: string, value: string): Promise<void> {
    await keytar.setPassword(KEYCHAIN_SERVICE, key, value)
  }

  /** 通过 macOS Keychain 删除敏感信息 */
  async deleteSecure(key: string): Promise<boolean> {
    return keytar.deletePassword(KEYCHAIN_SERVICE, key)
  }

  /** 监听配置项变更，返回取消订阅函数 */
  onChanged(key: string, callback: ChangeCallback): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set())
    }
    this.listeners.get(key)!.add(callback)
    return () => {
      this.listeners.get(key)?.delete(callback)
    }
  }

  /** 获取快捷键配置 */
  getHotkeys(): HotkeyConfig {
    return this.get('hotkeys')
  }

  /** 设置快捷键配置 */
  setHotkeys(config: HotkeyConfig): void {
    this.set('hotkeys', config)
  }

  /** 导出全部配置（不含敏感信息） */
  exportConfig(): AppConfig {
    return JSON.parse(JSON.stringify(this.store.store))
  }

  /** 导出配置并注入 Keychain 中的敏感信息（用于运行态/UI） */
  async exportConfigResolved(): Promise<AppConfig> {
    const config = this.exportConfig()
    config.llm = await this.resolveLLMConfig(config.llm)
    config.asr = await this.resolveASRConfig(config.asr)
    return config
  }

  /** 导入配置（合并覆盖） */
  importConfig(config: Partial<AppConfig>): void {
    log.info('导入配置')
    const current = this.store.store
    const merged = { ...current, ...config }
    this.store.store = merged

    // 通知所有变更的 key
    for (const key of Object.keys(config) as (keyof AppConfig)[]) {
      this.notifyListeners(key, merged[key], current[key])
    }
  }

  /** 写入 LLM 配置：敏感字段仅保存在 Keychain，磁盘保留脱敏值 */
  async setLLMConfig(llm: AppConfig['llm']): Promise<void> {
    const sanitized = JSON.parse(JSON.stringify(llm)) as AppConfig['llm']
    for (const role of LLM_ROLES) {
      const secureKey = `llm.${role}.apiKey`
      const apiKey = llm[role].apiKey
      await this.persistSecureValue(secureKey, apiKey)
      sanitized[role].apiKey = ''
    }
    this.set('llm', sanitized)
  }

  /** 写入 ASR 配置：敏感字段仅保存在 Keychain，磁盘保留脱敏值 */
  async setASRConfig(asr: AppConfig['asr']): Promise<void> {
    const sanitized = JSON.parse(JSON.stringify(asr)) as AppConfig['asr']
    await this.persistSecureValue('asr.whisper.apiKey', asr.whisper?.apiKey)
    await this.persistSecureValue('asr.aliyun.accessKeyId', asr.aliyun?.accessKeyId)
    await this.persistSecureValue('asr.aliyun.accessKeySecret', asr.aliyun?.accessKeySecret)
    await this.persistSecureValue('asr.tencent.secretId', asr.tencent?.secretId)
    await this.persistSecureValue('asr.tencent.secretKey', asr.tencent?.secretKey)

    if (sanitized.whisper) sanitized.whisper.apiKey = ''
    if (sanitized.aliyun) {
      sanitized.aliyun.accessKeyId = ''
      sanitized.aliyun.accessKeySecret = ''
    }
    if (sanitized.tencent) {
      sanitized.tencent.secretId = ''
      sanitized.tencent.secretKey = ''
    }
    this.set('asr', sanitized)
  }

  /** 从磁盘配置 + Keychain 还原 LLM 配置（含迁移） */
  async getResolvedLLMConfig(): Promise<AppConfig['llm']> {
    const llm = this.get('llm') as AppConfig['llm']
    return this.resolveLLMConfig(llm)
  }

  /** 从磁盘配置 + Keychain 还原 ASR 配置（含迁移） */
  async getResolvedASRConfig(): Promise<AppConfig['asr']> {
    const asr = this.get('asr') as AppConfig['asr']
    return this.resolveASRConfig(asr)
  }

  /** 导入配置并处理敏感字段 */
  async importConfigWithSecrets(config: Partial<AppConfig>): Promise<void> {
    const rest = { ...config }
    if (rest.llm) {
      await this.setLLMConfig(rest.llm)
      delete rest.llm
    }
    if (rest.asr) {
      await this.setASRConfig(rest.asr)
      delete rest.asr
    }
    if (Object.keys(rest).length > 0) {
      this.importConfig(rest)
    }
  }

  /** 重置为默认配置 */
  resetToDefaults(): void {
    log.info('重置为默认配置')
    const oldConfig = this.store.store
    this.store.clear()
    // store.clear 后会自动使用 defaults，通知所有 key 变更
    const newConfig = this.store.store
    for (const key of Object.keys(oldConfig) as (keyof AppConfig)[]) {
      if (JSON.stringify(oldConfig[key]) !== JSON.stringify(newConfig[key])) {
        this.notifyListeners(key, newConfig[key], oldConfig[key])
      }
    }

    // 同步清理 Keychain 中的敏感信息
    for (const role of LLM_ROLES) {
      void this.deleteSecure(`llm.${role}.apiKey`).catch((err) => {
        log.warn('重置配置时清理 Keychain 失败', { key: `llm.${role}.apiKey`, error: err })
      })
    }
    for (const key of ASR_SECURE_KEYS) {
      void this.deleteSecure(key).catch((err) => {
        log.warn('重置配置时清理 Keychain 失败', { key, error: err })
      })
    }
  }

  /** 获取配置文件路径（用于调试） */
  getConfigPath(): string {
    return this.store.path
  }

  private notifyListeners(key: string, newValue: unknown, oldValue: unknown): void {
    const callbacks = this.listeners.get(key)
    if (callbacks) {
      for (const cb of callbacks) {
        try {
          cb(newValue, oldValue)
        } catch (err) {
          log.error('配置监听回调执行异常', { key, error: err })
        }
      }
    }
  }

  private async resolveLLMConfig(llm: AppConfig['llm']): Promise<AppConfig['llm']> {
    const resolved = JSON.parse(JSON.stringify(llm)) as AppConfig['llm']
    let migratedFromPlaintext = false
    for (const role of LLM_ROLES) {
      const secureKey = `llm.${role}.apiKey`
      const secureValue = await this.safeGetSecureValue(secureKey)
      if (secureValue) {
        resolved[role].apiKey = secureValue
      } else if (resolved[role].apiKey) {
        // 明文配置迁移到 Keychain
        await this.persistSecureValue(secureKey, resolved[role].apiKey)
        migratedFromPlaintext = true
      }
    }
    if (migratedFromPlaintext) {
      const sanitized = JSON.parse(JSON.stringify(llm)) as AppConfig['llm']
      for (const role of LLM_ROLES) {
        sanitized[role].apiKey = ''
      }
      this.store.set('llm', sanitized as never)
    }
    return resolved
  }

  private async resolveASRConfig(asr: AppConfig['asr']): Promise<AppConfig['asr']> {
    const resolved = JSON.parse(JSON.stringify(asr)) as AppConfig['asr']
    let migratedFromPlaintext = false
    const secureMap: Array<{ key: (typeof ASR_SECURE_KEYS)[number]; get: () => string | undefined; set: (value: string) => void }> = [
      {
        key: 'asr.whisper.apiKey',
        get: () => resolved.whisper?.apiKey,
        set: (value) => {
          resolved.whisper = {
            ...(resolved.whisper ?? {
              id: 'openai',
              name: 'OpenAI',
              baseURL: 'https://api.openai.com/v1',
              apiKey: '',
              model: 'gpt-4o-mini-transcribe',
              streaming: { ...DEFAULT_WHISPER_STREAMING },
            }),
            apiKey: value
          }
        },
      },
      {
        key: 'asr.aliyun.accessKeyId',
        get: () => resolved.aliyun?.accessKeyId,
        set: (value) => {
          resolved.aliyun = { ...(resolved.aliyun ?? { appKey: '', accessKeyId: '', accessKeySecret: '' }), accessKeyId: value }
        },
      },
      {
        key: 'asr.aliyun.accessKeySecret',
        get: () => resolved.aliyun?.accessKeySecret,
        set: (value) => {
          resolved.aliyun = { ...(resolved.aliyun ?? { appKey: '', accessKeyId: '', accessKeySecret: '' }), accessKeySecret: value }
        },
      },
      {
        key: 'asr.tencent.secretId',
        get: () => resolved.tencent?.secretId,
        set: (value) => {
          resolved.tencent = { ...(resolved.tencent ?? { appId: '', secretId: '', secretKey: '' }), secretId: value }
        },
      },
      {
        key: 'asr.tencent.secretKey',
        get: () => resolved.tencent?.secretKey,
        set: (value) => {
          resolved.tencent = { ...(resolved.tencent ?? { appId: '', secretId: '', secretKey: '' }), secretKey: value }
        },
      },
    ]

    for (const item of secureMap) {
      const secureValue = await this.safeGetSecureValue(item.key)
      if (secureValue) {
        item.set(secureValue)
      } else {
        const plainValue = item.get()
        if (plainValue) {
          // 明文配置迁移到 Keychain
          await this.persistSecureValue(item.key, plainValue)
          migratedFromPlaintext = true
        }
      }
    }

    if (resolved.whisper) {
      resolved.whisper.streaming = normalizeWhisperStreamingConfig(resolved.whisper.streaming)
    }

    if (migratedFromPlaintext) {
      const sanitized = JSON.parse(JSON.stringify(asr)) as AppConfig['asr']
      if (sanitized.whisper) sanitized.whisper.apiKey = ''
      if (sanitized.aliyun) {
        sanitized.aliyun.accessKeyId = ''
        sanitized.aliyun.accessKeySecret = ''
      }
      if (sanitized.tencent) {
        sanitized.tencent.secretId = ''
        sanitized.tencent.secretKey = ''
      }
      this.store.set('asr', sanitized as never)
    }

    return resolved
  }

  private async persistSecureValue(key: string, value: string | undefined): Promise<void> {
    const trimmed = value?.trim()
    if (trimmed === '***') {
      return
    }
    try {
      if (trimmed) {
        await this.setSecure(key, trimmed)
      } else {
        await this.deleteSecure(key)
      }
    } catch (err) {
      log.warn('Keychain 写入失败', { key, error: err })
    }
  }

  private async safeGetSecureValue(key: string): Promise<string | null> {
    try {
      return await this.getSecure(key)
    } catch (err) {
      log.warn('Keychain 读取失败', { key, error: err })
      return null
    }
  }

  private migrateSystemPromptToLatestDefault(): void {
    const current = this.store.get('systemPrompt') as unknown
    const normalized = typeof current === 'string' ? current.trim() : ''

    if (!normalized) {
      this.store.set('systemPrompt', DEFAULT_SYSTEM_PROMPT as never)
      return
    }

    if (LEGACY_DEFAULT_SYSTEM_PROMPTS.has(normalized)) {
      this.store.set('systemPrompt', DEFAULT_SYSTEM_PROMPT as never)
      log.info('检测到旧版默认 system prompt，已自动升级到新版模板')
    }
  }

  private migrateProgrammingLanguageDefault(): void {
    const current = this.store.get('programmingLanguage') as unknown
    const normalized = typeof current === 'string' ? current.trim().toLowerCase() : ''
    if (!normalized || !PROGRAMMING_LANGUAGES.has(normalized)) {
      this.store.set('programmingLanguage', 'auto' as never)
    }
  }

  private migrateRecordingGateModeDefault(): void {
    const current = this.store.get('recordingGateMode') as unknown
    const normalized = typeof current === 'string' ? current.trim().toLowerCase() : ''
    if (!normalized || !RECORDING_GATE_MODES.has(normalized)) {
      this.store.set('recordingGateMode', 'strict' as never)
    }
  }
}

function normalizeWhisperStreamingConfig(
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
    vadThreshold: clampNumber(next.vadThreshold, 0.001, 0.2),
    minSpeechMs: clampInt(next.minSpeechMs, 80, 4000),
    minSilenceMs: clampInt(next.minSilenceMs, 120, 5000),
  }
}

function clampInt(value: unknown, min: number, max: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.round(n)))
}

function clampNumber(value: unknown, min: number, max: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}
