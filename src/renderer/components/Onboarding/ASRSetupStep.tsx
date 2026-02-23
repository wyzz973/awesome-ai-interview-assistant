import { useCallback, useEffect, useMemo, useState } from 'react'
import { Mic, RefreshCw } from 'lucide-react'
import { Input } from '../Common'
import { toast } from '../Common'
import { ASR_PROVIDER_PRESETS, DEFAULT_WHISPER_STREAMING } from '@shared/constants'
import type { ASRProviderType, ASRLanguage, ASRConfig } from '@shared/types'

const PROVIDERS: { id: ASRProviderType; label: string }[] = [
  { id: 'whisper', label: '模型供应商（API Key）' },
  { id: 'aliyun', label: '阿里云 ASR（旧版）' },
  { id: 'tencent', label: '腾讯云 ASR（旧版）' },
]

const LANGUAGES: { id: ASRLanguage; label: string }[] = [
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'English' },
  { id: 'zh-en', label: '中英混合' },
]

interface ASRSetupStepProps {
  asr: ASRConfig
  onChange: (asr: ASRConfig) => void
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
  return {
    ...DEFAULT_WHISPER_STREAMING,
    ...(streaming ?? {}),
  }
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

function normalizeASRBaseURL(providerId: string, baseURL: string): string {
  const normalized = baseURL.trim().replace(/\/+$/, '')
  if (!normalized) return normalized
  const looksLikeDashScope = providerId === 'qwen' || normalized.includes('dashscope.aliyuncs.com')
  if (looksLikeDashScope && /\/api\/v1$/i.test(normalized)) {
    return normalized.replace(/\/api\/v1$/i, '/compatible-mode/v1')
  }
  return normalized
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

export default function ASRSetupStep({ asr, onChange }: ASRSetupStepProps) {
  const [fetchingModels, setFetchingModels] = useState(false)
  const [remoteModels, setRemoteModels] = useState<string[]>([])
  const [modelPicker, setModelPicker] = useState('')

  const whisper = asr.whisper ?? getDefaultWhisperConfig()
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

  const update = useCallback((patch: Partial<ASRConfig>) => onChange({ ...asr, ...patch }), [asr, onChange])

  const updateWhisper = useCallback((patch: Partial<NonNullable<ASRConfig['whisper']>>) => {
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
    update({
      provider: 'whisper',
      whisper: next,
    })
  }, [update, whisper])

  const handlePresetChange = (presetId: string) => {
    if (presetId === 'custom') {
      updateWhisper({ id: 'custom', name: '自定义' })
      return
    }

    const preset = ASR_PROVIDER_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    updateWhisper({
      id: preset.id,
      name: preset.name,
      baseURL: preset.baseURL,
      model: preset.defaultModel,
    })
    setRemoteModels([])
    setModelPicker('')
  }

  const fetchModels = useCallback(async () => {
    const normalizedBaseURL = normalizeASRBaseURL(whisper.id, whisper.baseURL)
    if (!whisper.apiKey || !normalizedBaseURL) {
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
        toast.info(result.error ?? '未获取到模型，使用预设列表')
      }
    } catch {
      toast.error('获取模型列表失败')
    } finally {
      setFetchingModels(false)
    }
  }, [whisper.apiKey, whisper.baseURL, whisper.id])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-primary/15 flex items-center justify-center">
          <Mic size={20} className="text-accent-primary" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-text-primary">语音识别配置</h3>
          <p className="text-xs text-text-muted">选择语音识别供应商并填写 API Key</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-text-muted">识别模式</label>
          <select
            value={asr.provider}
            onChange={(e) => update({ provider: e.target.value as ASRProviderType })}
            className="h-9 px-3 text-sm rounded-lg bg-bg-tertiary text-text-primary border border-border-default focus:outline-none focus:border-border-focus"
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-text-muted">语言</label>
          <select
            value={asr.language}
            onChange={(e) => update({ language: e.target.value as ASRLanguage })}
            className="h-9 px-3 text-sm rounded-lg bg-bg-tertiary text-text-primary border border-border-default focus:outline-none focus:border-border-focus"
          >
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
        </div>

        {asr.provider === 'whisper' && (
          <div className="p-3 rounded-lg bg-bg-tertiary/50 border border-border-subtle space-y-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-muted">供应商预设</label>
              <select
                value={whisper.id}
                onChange={(e) => handlePresetChange(e.target.value)}
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
              onChange={(e) => updateWhisper({ baseURL: e.target.value })}
              placeholder="https://api.openai.com/v1"
            />
            <Input
              label="API Key"
              type="password"
              value={whisper.apiKey}
              onChange={(e) => updateWhisper({ apiKey: e.target.value })}
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
                onChange={(e) => updateWhisper({ model: e.target.value })}
                placeholder="输入模型 ID，如 gpt-4o-mini-transcribe / qwen3-asr-flash"
              />

              {modelLooksTTS && (
                <div className="text-xs text-red-300">
                  当前像 TTS 模型，不适用于语音识别。建议改为 `qwen3-asr-flash`。
                </div>
              )}

              {availableModels.length > 0 && (
                <select
                  value={modelPicker}
                  onChange={(e) => {
                    const model = e.target.value
                    setModelPicker('')
                    if (!model) return
                    updateWhisper({ model })
                  }}
                  className="h-9 px-3 text-sm rounded-lg bg-bg-tertiary text-text-primary border border-border-default focus:outline-none focus:border-border-focus"
                >
                  <option value="">从建议模型快速选择（可选）</option>
                  {availableModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}

        {asr.provider === 'aliyun' && (
          <div className="p-3 rounded-lg bg-bg-tertiary/50 border border-border-subtle space-y-3">
            <Input
              label="App Key"
              value={asr.aliyun?.appKey ?? ''}
              onChange={(e) =>
                update({ aliyun: { ...(asr.aliyun ?? { appKey: '', accessKeyId: '', accessKeySecret: '' }), appKey: e.target.value } })
              }
            />
            <Input
              label="Access Key ID"
              value={asr.aliyun?.accessKeyId ?? ''}
              onChange={(e) =>
                update({ aliyun: { ...(asr.aliyun ?? { appKey: '', accessKeyId: '', accessKeySecret: '' }), accessKeyId: e.target.value } })
              }
            />
            <Input
              label="Access Key Secret"
              type="password"
              value={asr.aliyun?.accessKeySecret ?? ''}
              onChange={(e) =>
                update({ aliyun: { ...(asr.aliyun ?? { appKey: '', accessKeyId: '', accessKeySecret: '' }), accessKeySecret: e.target.value } })
              }
            />
          </div>
        )}

        {asr.provider === 'tencent' && (
          <div className="p-3 rounded-lg bg-bg-tertiary/50 border border-border-subtle space-y-3">
            <Input
              label="App ID"
              value={asr.tencent?.appId ?? ''}
              onChange={(e) =>
                update({ tencent: { ...(asr.tencent ?? { appId: '', secretId: '', secretKey: '' }), appId: e.target.value } })
              }
            />
            <Input
              label="Secret ID"
              value={asr.tencent?.secretId ?? ''}
              onChange={(e) =>
                update({ tencent: { ...(asr.tencent ?? { appId: '', secretId: '', secretKey: '' }), secretId: e.target.value } })
              }
            />
            <Input
              label="Secret Key"
              type="password"
              value={asr.tencent?.secretKey ?? ''}
              onChange={(e) =>
                update({ tencent: { ...(asr.tencent ?? { appId: '', secretId: '', secretKey: '' }), secretKey: e.target.value } })
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}
