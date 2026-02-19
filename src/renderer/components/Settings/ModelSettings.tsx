import { useState, useCallback, useRef } from 'react'
import { RefreshCw } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'
import { Button, Input } from '../Common'
import { toast } from '../Common'
import { LLM_PROVIDER_PRESETS } from '@shared/constants'
import type { LLMProvider } from '@shared/types'

const LLM_ROLES = [
  { key: 'screenshot' as const, label: '截屏分析' },
  { key: 'chat' as const, label: '对话' },
  { key: 'review' as const, label: '复盘报告' },
]

function ProviderEditor({
  roleKey,
  roleLabel,
  provider,
  onSave,
}: {
  roleKey: string
  roleLabel: string
  provider: LLMProvider
  onSave: (provider: LLMProvider) => void
}) {
  const [form, setForm] = useState<LLMProvider>(provider)
  const [testing, setTesting] = useState(false)
  const [fetchingModels, setFetchingModels] = useState(false)
  const [remoteModels, setRemoteModels] = useState<string[]>([])

  // 当 provider prop 变化时（例如 loadConfig 重载），同步到表单状态
  const prevProviderRef = useRef(provider)
  if (JSON.stringify(provider) !== JSON.stringify(prevProviderRef.current)) {
    prevProviderRef.current = provider
    setForm(provider)
  }

  const selectedPreset = LLM_PROVIDER_PRESETS.find((p) => p.id === form.id)

  // 可用模型列表：远程获取 > 预设默认
  const baseModels = remoteModels.length > 0
    ? remoteModels
    : selectedPreset?.models ?? []
  // 确保当前已保存的模型始终出现在列表中（避免切换页面后 select 找不到值）
  const availableModels = form.model && !baseModels.includes(form.model)
    ? [form.model, ...baseModels]
    : baseModels

  const handlePresetChange = (presetId: string) => {
    const preset = LLM_PROVIDER_PRESETS.find((p) => p.id === presetId)
    if (preset) {
      setForm({
        ...form,
        id: preset.id,
        name: preset.name,
        baseURL: preset.baseURL,
        model: preset.defaultModel,
      })
      setRemoteModels([])
    }
  }

  const fetchModels = useCallback(async () => {
    if (!form.baseURL || !form.apiKey) {
      toast.info('请先填写 Base URL 和 API Key')
      return
    }
    setFetchingModels(true)
    try {
      const result = await window.api.llmFetchModels(form.baseURL, form.apiKey)
      if (result.models.length > 0) {
        setRemoteModels(result.models)
        toast.success(`获取到 ${result.models.length} 个模型`)
      } else {
        toast.info(result.error ?? '未获取到模型，使用预设列表')
      }
    } catch {
      toast.error('获取模型列表失败')
    } finally {
      setFetchingModels(false)
    }
  }, [form.baseURL, form.apiKey])

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

  return (
    <div className="space-y-3 p-3 bg-bg-tertiary/50 rounded-lg border border-border-subtle">
      <h4 className="text-xs font-medium text-text-secondary">{roleLabel}模型</h4>

      {/* 供应商选择 */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-text-muted">供应商预设</label>
        <select
          value={form.id}
          onChange={(e) => handlePresetChange(e.target.value)}
          className="h-9 px-3 text-sm rounded-lg bg-bg-tertiary text-text-primary border border-border-default focus:outline-none focus:border-border-focus"
        >
          {LLM_PROVIDER_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="custom">自定义</option>
        </select>
      </div>

      <Input
        label="Base URL"
        value={form.baseURL}
        onChange={(e) => setForm({ ...form, baseURL: e.target.value })}
        placeholder="https://api.openai.com/v1"
      />

      <Input
        label="API Key"
        type="password"
        value={form.apiKey}
        onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
        placeholder="sk-..."
      />

      {/* 模型选择 */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs text-text-muted">模型</label>
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

        {availableModels.length > 0 ? (
          <select
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            className="h-9 px-3 text-sm rounded-lg bg-bg-tertiary text-text-primary border border-border-default focus:outline-none focus:border-border-focus"
          >
            {availableModels.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        ) : (
          <Input
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            placeholder="输入模型 ID，如 gpt-4o"
          />
        )}

        {remoteModels.length > 0 && (
          <span className="text-xs text-text-muted">
            已从 API 获取 {remoteModels.length} 个可用模型
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSave(form)}>保存</Button>
        <Button size="sm" variant="secondary" loading={testing} onClick={handleTest}>
          测试连接
        </Button>
      </div>
    </div>
  )
}

export default function ModelSettings() {
  const { config, updateLLMProvider } = useSettingsStore()
  if (!config) return null

  const handleSave = async (key: 'screenshot' | 'chat' | 'review', provider: LLMProvider) => {
    try {
      await updateLLMProvider(key, provider)
      toast.success('保存成功')
    } catch {
      toast.error('保存失败')
    }
  }

  return (
    <div className="space-y-4">
      {LLM_ROLES.map(({ key, label }) => (
        <ProviderEditor
          key={key}
          roleKey={key}
          roleLabel={label}
          provider={config.llm[key]}
          onSave={(p) => handleSave(key, p)}
        />
      ))}
    </div>
  )
}
