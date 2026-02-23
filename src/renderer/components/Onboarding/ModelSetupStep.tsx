import { useState, useEffect, useCallback } from 'react'
import { Bot, RefreshCw } from 'lucide-react'
import { Button, Input } from '../Common'
import { toast } from '../Common'
import { LLM_PROVIDER_PRESETS } from '@shared/constants'
import type { LLMProvider } from '@shared/types'

interface ModelSetupStepProps {
  onProviderChange: (provider: LLMProvider) => void
  initialProvider?: LLMProvider
}

export default function ModelSetupStep({ onProviderChange, initialProvider }: ModelSetupStepProps) {
  const defaultPreset = LLM_PROVIDER_PRESETS[0]
  const [form, setForm] = useState<LLMProvider>(
    initialProvider ?? {
      id: defaultPreset.id,
      name: defaultPreset.name,
      baseURL: defaultPreset.baseURL,
      apiKey: '',
      model: defaultPreset.defaultModel,
      maxTokens: 4096,
      temperature: 0.7,
    }
  )
  const [testing, setTesting] = useState(false)
  const [fetchingModels, setFetchingModels] = useState(false)
  const [remoteModels, setRemoteModels] = useState<string[]>([])
  const [customModel, setCustomModel] = useState('')
  const [useCustomInput, setUseCustomInput] = useState(false)

  const selectedPreset = LLM_PROVIDER_PRESETS.find((p) => p.id === form.id)

  // 可用模型列表：远程获取 > 预设默认
  const availableModels = remoteModels.length > 0
    ? remoteModels
    : selectedPreset?.models ?? []

  const handlePresetChange = (presetId: string) => {
    const preset = LLM_PROVIDER_PRESETS.find((p) => p.id === presetId)
    if (preset) {
      const updated = {
        ...form,
        id: preset.id,
        name: preset.name,
        baseURL: preset.baseURL,
        model: preset.defaultModel,
      }
      setForm(updated)
      setRemoteModels([])
      setUseCustomInput(false)
      onProviderChange(updated)
    }
  }

  const fetchModels = useCallback(async () => {
    if (!form.apiKey) {
      toast.info('请先填写 API Key')
      return
    }
    if (!form.baseURL) {
      toast.info('请先填写 Base URL')
      return
    }
    setFetchingModels(true)
    try {
      const result = await window.api.llmFetchModels(form.id, form.baseURL, form.apiKey)
      if (result.models.length > 0) {
        setRemoteModels(result.models)
        const sourceLabel = result.source === 'provider'
          ? '官方接口'
          : result.source === 'models.dev'
            ? 'models.dev'
            : '本地预设'
        toast.success(`获取到 ${result.models.length} 个模型（来源：${sourceLabel}）`)
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
  }, [form.baseURL, form.apiKey])

  // API Key 填写后自动尝试获取模型列表
  useEffect(() => {
    if (form.apiKey.length > 10) {
      const timer = setTimeout(fetchModels, 800)
      return () => clearTimeout(timer)
    }
  }, [form.apiKey, form.baseURL, fetchModels])

  const handleTest = async () => {
    setTesting(true)
    try {
      const result = await window.api.llmTestConnection({
        baseURL: form.baseURL,
        apiKey: form.apiKey,
        model: form.model,
      })
      if (result?.success === false) {
        toast.error(result.error ?? '连接失败，请检查配置')
      } else {
        toast.success('连接成功')
      }
    } catch {
      toast.error('连接失败，请检查配置')
    } finally {
      setTesting(false)
    }
  }

  const updateForm = (patch: Partial<LLMProvider>) => {
    const updated = { ...form, ...patch }
    setForm(updated)
    onProviderChange(updated)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-primary/15 flex items-center justify-center">
          <Bot size={20} className="text-accent-primary" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-text-primary">AI 模型配置</h3>
          <p className="text-xs text-text-muted">配置用于截屏分析和对话的 AI 模型</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-text-muted">供应商</label>
          <select
            value={form.id}
            onChange={(e) => handlePresetChange(e.target.value)}
            className="h-9 px-3 text-sm rounded-lg bg-bg-tertiary text-text-primary border border-border-default focus:outline-none focus:border-border-focus"
          >
            {LLM_PROVIDER_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <Input
          label="API Key"
          type="password"
          value={form.apiKey}
          onChange={(e) => updateForm({ apiKey: e.target.value })}
          placeholder="sk-..."
        />

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs text-text-muted">模型</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchModels}
                disabled={fetchingModels}
                className="text-xs text-accent-primary hover:text-accent-primary/80 disabled:opacity-50 flex items-center gap-1"
              >
                <RefreshCw size={10} className={fetchingModels ? 'animate-spin' : ''} />
                {fetchingModels ? '获取中' : '刷新列表'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setUseCustomInput(!useCustomInput)
                  if (!useCustomInput) setCustomModel(form.model)
                }}
                className="text-xs text-accent-primary hover:text-accent-primary/80"
              >
                {useCustomInput ? '选择模型' : '手动输入'}
              </button>
            </div>
          </div>

          {useCustomInput ? (
            <Input
              value={customModel}
              onChange={(e) => {
                setCustomModel(e.target.value)
                updateForm({ model: e.target.value })
              }}
              placeholder="输入模型 ID，如 gpt-4o"
            />
          ) : (
            <select
              value={form.model}
              onChange={(e) => updateForm({ model: e.target.value })}
              className="h-9 px-3 text-sm rounded-lg bg-bg-tertiary text-text-primary border border-border-default focus:outline-none focus:border-border-focus"
            >
              {availableModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}

          {remoteModels.length > 0 && (
            <span className="text-xs text-text-muted">
              已从 API 获取 {remoteModels.length} 个可用模型
            </span>
          )}
        </div>

        <Button size="sm" variant="secondary" loading={testing} onClick={handleTest}>
          测试连接
        </Button>
      </div>
    </div>
  )
}
