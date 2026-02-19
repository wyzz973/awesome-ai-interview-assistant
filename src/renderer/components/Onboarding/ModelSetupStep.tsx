import { useState } from 'react'
import { Bot } from 'lucide-react'
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

  const selectedPreset = LLM_PROVIDER_PRESETS.find((p) => p.id === form.id)

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
      onProviderChange(updated)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      const result = await window.api.llmTestConnection()
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

        {selectedPreset && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-text-muted">模型</label>
            <select
              value={form.model}
              onChange={(e) => updateForm({ model: e.target.value })}
              className="h-9 px-3 text-sm rounded-lg bg-bg-tertiary text-text-primary border border-border-default focus:outline-none focus:border-border-focus"
            >
              {selectedPreset.models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        )}

        <Button size="sm" variant="secondary" loading={testing} onClick={handleTest}>
          测试连接
        </Button>
      </div>
    </div>
  )
}
