import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'
import { Button, Input, toast } from '../Common'
import { ASR_PROVIDER_PRESETS, DEFAULT_WHISPER_STREAMING } from '@shared/constants'
import type { ASRProviderType, ASRLanguage, ASRConfig } from '@shared/types'

const ASR_PROVIDERS: { id: ASRProviderType; label: string }[] = [
  { id: 'whisper', label: '模型供应商（API Key）' },
  { id: 'aliyun', label: '阿里云 ASR（旧版 AK/SK）' },
  { id: 'tencent', label: '腾讯云 ASR（旧版 Secret）' },
  { id: 'google', label: 'Google Speech（即将支持）' },
]

const LANGUAGES: { id: ASRLanguage; label: string }[] = [
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'English' },
  { id: 'zh-en', label: '中英混合' },
]

type ASRDebugEvent = {
  id: string
  timestamp: number
  speaker: 'interviewer' | 'me'
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

function getDefaultWhisperConfig() {
  const preset = ASR_PROVIDER_PRESETS[0]
  return {
    id: preset.id,
    name: preset.name,
    baseURL: preset.baseURL,
    apiKey: '',
    model: preset.defaultModel,
    streaming: { ...DEFAULT_WHISPER_STREAMING },
  }
}

function normalizeWhisperStreaming(
  streaming?: NonNullable<ASRConfig['whisper']>['streaming'],
) {
  const next = { ...DEFAULT_WHISPER_STREAMING, ...(streaming ?? {}) }
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

function normalizeASRBaseURL(providerId: string, baseURL: string): string {
  const normalized = baseURL.trim().replace(/\/+$/, '')
  if (!normalized) return normalized
  const looksLikeDashScope = providerId === 'qwen' || normalized.includes('dashscope.aliyuncs.com')
  if (looksLikeDashScope && /\/api\/v1$/i.test(normalized)) {
    return normalized.replace(/\/api\/v1$/i, '/compatible-mode/v1')
  }
  return normalized
}

function filterASRModels(models: string[]): string[] {
  const normalized = models
    .map((m) => m.trim())
    .filter((m) => m.length > 0)

  const asrRegex = /(asr|transcribe|transcription|whisper|stt|speech[-_]?to[-_]?text|speech2text|audio[-_]?transcribe|omni)/i
  const excludeRegex = /(tts|text[-_]?to[-_]?speech|speech[-_]?synthesis|voice[-_]?clone)/i
  const matched = normalized.filter((m) => asrRegex.test(m) && !excludeRegex.test(m))
  return Array.from(new Set(matched))
}

function isLikelyTTSModel(model: string): boolean {
  return /(tts|text[-_]?to[-_]?speech|speech[-_]?synthesis|voice[-_]?clone)/i.test(model)
}

function inferProviderByBaseURL(baseURL: string) {
  const lower = baseURL.toLowerCase()
  if (lower.includes('dashscope.aliyuncs.com')) {
    return ASR_PROVIDER_PRESETS.find((p) => p.id === 'qwen') ?? null
  }
  if (lower.includes('api.openai.com')) {
    return ASR_PROVIDER_PRESETS.find((p) => p.id === 'openai') ?? null
  }
  return null
}

function getRecommendedASRModel(providerId: string, baseURL: string): string {
  const lower = baseURL.toLowerCase()
  if (providerId === 'qwen' || lower.includes('dashscope.aliyuncs.com')) {
    return 'qwen3-asr-flash'
  }
  return 'gpt-4o-mini-transcribe'
}

function formatDebugLine(event: ASRDebugEvent): string {
  const time = new Date(event.timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const speaker = event.speaker === 'interviewer' ? 'interviewer' : 'me'
  const status = event.status ? `status=${event.status}` : ''
  const latency = Number.isFinite(event.latencyMs) ? `lat=${Math.round(event.latencyMs ?? 0)}ms` : ''
  const utterance = Number.isFinite(event.utteranceMs) ? `utt=${Math.round(event.utteranceMs ?? 0)}ms` : ''
  const speech = Number.isFinite(event.speechMs) ? `speech=${Math.round(event.speechMs ?? 0)}ms` : ''
  const silence = Number.isFinite(event.silenceMs) ? `silence=${Math.round(event.silenceMs ?? 0)}ms` : ''
  const textLen = Number.isFinite(event.textLength) ? `len=${event.textLength}` : ''
  const mode = typeof event.isFinal === 'boolean' ? (event.isFinal ? 'final' : 'partial') : ''
  const reason = event.reason ? `reason=${event.reason}` : ''
  const endpoint = event.endpoint ? `ep=${event.endpoint}` : ''
  const vad = typeof event.vadSpeech === 'boolean' ? `vad=${event.vadSpeech ? 'speech' : 'silence'}` : ''
  const msg = event.message ? `msg=${event.message}` : ''

  return `[${time}] [${speaker}] ${event.stage} ${mode} ${reason} ${endpoint} ${status} ${latency} ${utterance} ${speech} ${silence} ${textLen} ${vad} ${msg}`
    .replace(/\s+/g, ' ')
    .trim()
}

export default function ASRSettings() {
  const { config, updateASR } = useSettingsStore()
  const [fetchingModels, setFetchingModels] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)
  const [remoteModels, setRemoteModels] = useState<string[]>([])
  const [modelPicker, setModelPicker] = useState('')
  const [debugEvents, setDebugEvents] = useState<ASRDebugEvent[]>([])
  if (!config) return null

  const { asr } = config
  const whisper = asr.whisper ?? getDefaultWhisperConfig()
  const streaming = normalizeWhisperStreaming(whisper.streaming)
  const modelLooksTTS = isLikelyTTSModel(whisper.model ?? '')
  const selectedPreset = ASR_PROVIDER_PRESETS.find((p) => p.id === whisper.id)

  const availableModels = useMemo(() => {
    const base = remoteModels.length > 0 ? remoteModels : selectedPreset?.models ?? []
    const merged = whisper.model && !base.includes(whisper.model)
      ? [whisper.model, ...base]
      : base
    return Array.from(new Set(merged))
  }, [remoteModels, selectedPreset, whisper.model])

  useEffect(() => {
    setRemoteModels([])
    setModelPicker('')
  }, [whisper.id, whisper.baseURL])

  useEffect(() => {
    if (!window.api.onASRDebug) return
    return window.api.onASRDebug((event: ASRDebugEvent) => {
      setDebugEvents((prev) => [event, ...prev].slice(0, 120))
    })
  }, [])

  const updateWhisper = useCallback(async (patch: Partial<NonNullable<ASRConfig['whisper']>>) => {
    const next = {
      ...whisper,
      ...patch,
    }
    next.baseURL = normalizeASRBaseURL(next.id, next.baseURL)
    next.streaming = normalizeWhisperStreaming(next.streaming)
    const inferredProvider = inferProviderByBaseURL(next.baseURL)
    if (inferredProvider) {
      next.id = inferredProvider.id
      next.name = inferredProvider.name
      if (!next.model || isLikelyTTSModel(next.model)) {
        next.model = inferredProvider.defaultModel
      }
    }
    await updateASR({
      provider: 'whisper',
      whisper: next,
    })
  }, [updateASR, whisper])

  const fetchModels = useCallback(async () => {
    const normalizedBaseURL = normalizeASRBaseURL(whisper.id, whisper.baseURL)
    if (!normalizedBaseURL || !whisper.apiKey) {
      toast.info('请先填写 Base URL 和 API Key')
      return
    }

    setFetchingModels(true)
    try {
      const result = await window.api.llmFetchModels(whisper.id, normalizedBaseURL, whisper.apiKey)
      if (result.models.length > 0) {
        const asrModels = filterASRModels(result.models)
        if (asrModels.length > 0) {
          setRemoteModels(asrModels)
          const sourceLabel = result.source === 'provider'
            ? '官方接口'
            : result.source === 'models.dev'
              ? 'models.dev'
              : '本地预设'
          toast.success(`获取到 ${asrModels.length} 个 ASR 相关模型（来源：${sourceLabel}）`)
        } else {
          setRemoteModels([])
          toast.info('接口返回中未筛到 ASR 模型，请手动输入模型 ID')
        }
        if (result.warning) {
          toast.info(result.warning)
        }
      } else {
        setRemoteModels([])
        toast.info(result.error ?? '未获取到模型，使用预设列表')
      }
    } catch {
      toast.error('获取模型列表失败')
    } finally {
      setFetchingModels(false)
    }
  }, [whisper.baseURL, whisper.apiKey, whisper.id])

  const handleTestConnection = useCallback(async () => {
    setTestingConnection(true)
    try {
      if (asr.provider === 'whisper') {
        const normalizedBaseURL = normalizeASRBaseURL(whisper.id, whisper.baseURL)
        if (!normalizedBaseURL || !whisper.apiKey || !whisper.model) {
          toast.info('请先填写 Base URL、API Key 和 ASR 模型')
          return
        }
        const inferredProvider = inferProviderByBaseURL(normalizedBaseURL)
        const providerId = inferredProvider?.id ?? whisper.id
        let modelToTest = whisper.model.trim()
        if (isLikelyTTSModel(modelToTest)) {
          modelToTest = getRecommendedASRModel(providerId, normalizedBaseURL)
          await updateWhisper({ model: modelToTest })
          toast.info(`检测到当前是 TTS 模型，已自动改为 ASR 模型：${modelToTest}`)
        }

        const result = await window.api.asrTestConnection({
          providerId,
          baseURL: normalizedBaseURL,
          apiKey: whisper.apiKey,
          model: modelToTest,
        })
        if (result.system.success && result.mic.success) {
          toast.success('ASR 连接成功')
        } else {
          const detail = result.system.error || result.mic.error || '连接失败'
          if (detail.includes('404')) {
            const recommendedModel = getRecommendedASRModel(providerId, normalizedBaseURL)
            toast.error(`ASR 连接失败: ${detail}（请确认是 ASR 模型，如 ${recommendedModel}）`)
          } else {
            toast.error(`ASR 连接失败: ${detail}`)
          }
        }
        return
      }

      const result = await window.api.asrTestConnection()
      if (result.system.success && result.mic.success) {
        toast.success('ASR 连接成功')
      } else {
        const detail = result.system.error || result.mic.error || '连接失败'
        toast.error(`ASR 连接失败: ${detail}`)
      }
    } catch {
      toast.error('ASR 连接失败')
    } finally {
      setTestingConnection(false)
    }
  }, [asr.provider, updateWhisper, whisper.baseURL, whisper.apiKey, whisper.id, whisper.model])

  const handlePresetChange = async (presetId: string) => {
    if (presetId === 'custom') {
      await updateWhisper({ id: 'custom', name: '自定义' })
      return
    }

    const preset = ASR_PROVIDER_PRESETS.find((p) => p.id === presetId)
    if (!preset) return

    await updateWhisper({
      id: preset.id,
      name: preset.name,
      baseURL: preset.baseURL,
      model: preset.defaultModel,
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-text-secondary">语音识别模式</label>
        <select
          value={asr.provider}
          onChange={(e) => updateASR({ provider: e.target.value as ASRProviderType })}
          className="h-9 px-3 text-sm rounded-lg bg-bg-tertiary text-text-primary border border-border-default focus:outline-none focus:border-border-focus"
        >
          {ASR_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id} disabled={p.id === 'google'}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-text-secondary">识别语言</label>
        <select
          value={asr.language}
          onChange={(e) => updateASR({ language: e.target.value as ASRLanguage })}
          className="h-9 px-3 text-sm rounded-lg bg-bg-tertiary text-text-primary border border-border-default focus:outline-none focus:border-border-focus"
        >
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
      </div>

      {asr.provider === 'whisper' && (
        <div className="space-y-3 p-3 bg-bg-tertiary/50 rounded-lg border border-border-subtle">
          <h4 className="text-xs font-medium text-text-secondary">模型供应商 ASR 配置</h4>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-text-muted">供应商预设</label>
            <select
              value={whisper.id}
              onChange={(e) => void handlePresetChange(e.target.value)}
              className="h-9 px-3 text-sm rounded-lg bg-bg-tertiary text-text-primary border border-border-default focus:outline-none focus:border-border-focus"
            >
              {ASR_PROVIDER_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
              <option value="custom">自定义</option>
            </select>
          </div>

          <Input
            label="Base URL"
            value={whisper.baseURL}
            onChange={(e) => void updateWhisper({ baseURL: e.target.value })}
            placeholder="https://api.openai.com/v1"
          />
          <Input
            label="API Key"
            type="password"
            value={whisper.apiKey}
            onChange={(e) => void updateWhisper({ apiKey: e.target.value })}
            placeholder="sk-..."
          />

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-text-muted">ASR 模型</label>
              <button
                type="button"
                onClick={fetchModels}
                disabled={fetchingModels}
                className="text-xs text-accent-primary hover:text-accent-primary/80 disabled:opacity-50 flex items-center gap-1"
              >
                <RefreshCw size={10} className={fetchingModels ? 'animate-spin' : ''} />
                {fetchingModels ? '获取中' : '从 API 获取'}
              </button>
            </div>

            <Input
              value={whisper.model}
              onChange={(e) => void updateWhisper({ model: e.target.value })}
              placeholder="输入模型 ID，如 gpt-4o-mini-transcribe / qwen3-asr-flash"
            />

            {modelLooksTTS && (
              <div className="text-xs text-red-300 flex items-center gap-2">
                <span>当前像 TTS 模型，不适用于语音识别。</span>
                <button
                  type="button"
                  className="text-accent-primary hover:text-accent-primary/80"
                  onClick={() => void updateWhisper({ model: getRecommendedASRModel(whisper.id, whisper.baseURL) })}
                >
                  改为推荐 ASR 模型
                </button>
              </div>
            )}

            {availableModels.length > 0 && (
              <select
                value={modelPicker}
                onChange={(e) => {
                  const model = e.target.value
                  setModelPicker('')
                  if (!model) return
                  void updateWhisper({ model })
                }}
                className="h-9 px-3 text-sm rounded-lg bg-bg-tertiary text-text-primary border border-border-default focus:outline-none focus:border-border-focus"
              >
                <option value="">从建议模型快速选择（可选）</option>
                {availableModels.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            )}

            {remoteModels.length > 0 && (
              <span className="text-xs text-text-muted">
                已从 API 获取 {remoteModels.length} 个 ASR 模型
              </span>
            )}
          </div>

          <div className="space-y-2 p-2 rounded-md bg-bg-primary/60 border border-border-subtle">
            <h5 className="text-xs font-medium text-text-secondary">实时转写参数（参考开源流式方案）</h5>

            <div className="grid grid-cols-2 gap-2">
              <Input
                label="chunk(ms)"
                type="number"
                min={800}
                max={12000}
                value={String(streaming.chunkLengthMs)}
                onChange={(e) => void updateWhisper({
                  streaming: { ...streaming, chunkLengthMs: clampInt(e.target.value, 800, 12000) },
                })}
              />
              <Input
                label="offset(ms)"
                type="number"
                min={0}
                max={2000}
                value={String(streaming.overlapMs)}
                onChange={(e) => void updateWhisper({
                  streaming: { ...streaming, overlapMs: clampInt(e.target.value, 0, 2000) },
                })}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-muted">VAD 门控</label>
                <select
                  value={streaming.vadEnabled ? 'on' : 'off'}
                  onChange={(e) => void updateWhisper({
                    streaming: { ...streaming, vadEnabled: e.target.value === 'on' },
                  })}
                  className="h-9 px-3 text-sm rounded-lg bg-bg-tertiary text-text-primary border border-border-default focus:outline-none focus:border-border-focus"
                >
                  <option value="on">开启</option>
                  <option value="off">关闭</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-muted">Partial 实时结果</label>
                <select
                  value={streaming.emitPartial ? 'on' : 'off'}
                  onChange={(e) => void updateWhisper({
                    streaming: { ...streaming, emitPartial: e.target.value === 'on' },
                  })}
                  className="h-9 px-3 text-sm rounded-lg bg-bg-tertiary text-text-primary border border-border-default focus:outline-none focus:border-border-focus"
                >
                  <option value="on">开启</option>
                  <option value="off">关闭</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Input
                label="VAD 阈值"
                type="number"
                min={0.001}
                max={0.2}
                step={0.001}
                value={String(streaming.vadThreshold)}
                onChange={(e) => void updateWhisper({
                  streaming: { ...streaming, vadThreshold: clampFloat(e.target.value, 0.001, 0.2) },
                })}
              />
              <Input
                label="最短语音(ms)"
                type="number"
                min={80}
                max={4000}
                value={String(streaming.minSpeechMs)}
                onChange={(e) => void updateWhisper({
                  streaming: { ...streaming, minSpeechMs: clampInt(e.target.value, 80, 4000) },
                })}
              />
              <Input
                label="静音结束(ms)"
                type="number"
                min={120}
                max={5000}
                value={String(streaming.minSilenceMs)}
                onChange={(e) => void updateWhisper({
                  streaming: { ...streaming, minSilenceMs: clampInt(e.target.value, 120, 5000) },
                })}
              />
            </div>
          </div>

          <div className="space-y-2 p-2 rounded-md bg-bg-primary/60 border border-border-subtle">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-medium text-text-secondary">ASR 调试日志（实时）</h5>
              <button
                type="button"
                className="text-xs text-accent-primary hover:text-accent-primary/80"
                onClick={() => setDebugEvents([])}
              >
                清空
              </button>
            </div>
            <div className="max-h-40 overflow-y-auto rounded border border-border-subtle bg-bg-tertiary/70 p-2 font-mono text-[11px] leading-5 text-text-secondary">
              {debugEvents.length === 0 ? (
                <div className="text-text-muted">开始录音后，这里会显示 VAD/分段/请求耗时日志。</div>
              ) : (
                debugEvents.map((event) => (
                  <div key={event.id} className="break-all">
                    {formatDebugLine(event)}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" loading={testingConnection} onClick={() => void handleTestConnection()}>
              测试连接
            </Button>
            <span className="text-xs text-text-muted">配置会自动保存</span>
          </div>
        </div>
      )}

      {asr.provider === 'aliyun' && (
        <div className="space-y-3 p-3 bg-bg-tertiary/50 rounded-lg border border-border-subtle">
          <h4 className="text-xs font-medium text-text-secondary">阿里云 ASR 配置（旧版）</h4>
          <Input
            label="App Key"
            value={asr.aliyun?.appKey ?? ''}
            onChange={(e) =>
              updateASR({ aliyun: { ...(asr.aliyun ?? { appKey: '', accessKeyId: '', accessKeySecret: '' }), appKey: e.target.value } })
            }
          />
          <Input
            label="Access Key ID"
            value={asr.aliyun?.accessKeyId ?? ''}
            onChange={(e) =>
              updateASR({ aliyun: { ...(asr.aliyun ?? { appKey: '', accessKeyId: '', accessKeySecret: '' }), accessKeyId: e.target.value } })
            }
          />
          <Input
            label="Access Key Secret"
            type="password"
            value={asr.aliyun?.accessKeySecret ?? ''}
            onChange={(e) =>
              updateASR({ aliyun: { ...(asr.aliyun ?? { appKey: '', accessKeyId: '', accessKeySecret: '' }), accessKeySecret: e.target.value } })
            }
          />
        </div>
      )}

      {asr.provider === 'tencent' && (
        <div className="space-y-3 p-3 bg-bg-tertiary/50 rounded-lg border border-border-subtle">
          <h4 className="text-xs font-medium text-text-secondary">腾讯云 ASR 配置（旧版）</h4>
          <Input
            label="App ID"
            value={asr.tencent?.appId ?? ''}
            onChange={(e) =>
              updateASR({ tencent: { ...(asr.tencent ?? { appId: '', secretId: '', secretKey: '' }), appId: e.target.value } })
            }
          />
          <Input
            label="Secret ID"
            value={asr.tencent?.secretId ?? ''}
            onChange={(e) =>
              updateASR({ tencent: { ...(asr.tencent ?? { appId: '', secretId: '', secretKey: '' }), secretId: e.target.value } })
            }
          />
          <Input
            label="Secret Key"
            type="password"
            value={asr.tencent?.secretKey ?? ''}
            onChange={(e) =>
              updateASR({ tencent: { ...(asr.tencent ?? { appId: '', secretId: '', secretKey: '' }), secretKey: e.target.value } })
            }
          />
        </div>
      )}
    </div>
  )
}
