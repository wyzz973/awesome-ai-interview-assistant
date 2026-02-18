import { Mic } from 'lucide-react'
import { Input } from '../Common'
import type { ASRProviderType, ASRLanguage, ASRConfig } from '@shared/types'

const PROVIDERS: { id: ASRProviderType; label: string }[] = [
  { id: 'whisper', label: 'Whisper (推荐)' },
  { id: 'aliyun', label: '阿里云 ASR' },
  { id: 'tencent', label: '腾讯云 ASR' },
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

export default function ASRSetupStep({ asr, onChange }: ASRSetupStepProps) {
  const update = (patch: Partial<ASRConfig>) => onChange({ ...asr, ...patch })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-primary/15 flex items-center justify-center">
          <Mic size={20} className="text-accent-primary" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-text-primary">语音识别配置</h3>
          <p className="text-xs text-text-muted">选择语音转文字服务</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-text-muted">供应商</label>
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
            <Input
              label="Whisper Base URL"
              value={asr.whisper?.baseURL ?? ''}
              onChange={(e) => update({ whisper: { ...asr.whisper!, baseURL: e.target.value } })}
              placeholder="https://api.openai.com"
            />
            <Input
              label="API Key"
              type="password"
              value={asr.whisper?.apiKey ?? ''}
              onChange={(e) => update({ whisper: { ...asr.whisper!, apiKey: e.target.value } })}
              placeholder="sk-..."
            />
          </div>
        )}
      </div>
    </div>
  )
}
