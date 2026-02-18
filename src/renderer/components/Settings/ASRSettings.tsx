import { useSettingsStore } from '../../stores/settingsStore'
import { Input } from '../Common'
import type { ASRProviderType, ASRLanguage } from '@shared/types'

const ASR_PROVIDERS: { id: ASRProviderType; label: string }[] = [
  { id: 'whisper', label: 'Whisper (OpenAI 兼容)' },
  { id: 'aliyun', label: '阿里云 ASR' },
  { id: 'tencent', label: '腾讯云 ASR' },
  { id: 'google', label: 'Google Speech' },
]

const LANGUAGES: { id: ASRLanguage; label: string }[] = [
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'English' },
  { id: 'zh-en', label: '中英混合' },
]

export default function ASRSettings() {
  const { config, updateASR } = useSettingsStore()
  if (!config) return null

  const { asr } = config

  return (
    <div className="space-y-4">
      {/* 供应商 */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-text-secondary">语音识别供应商</label>
        <select
          value={asr.provider}
          onChange={(e) => updateASR({ provider: e.target.value as ASRProviderType })}
          className="h-9 px-3 text-sm rounded-lg bg-bg-tertiary text-text-primary border border-border-default focus:outline-none focus:border-border-focus"
        >
          {ASR_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* 语言 */}
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

      {/* Whisper 配置 */}
      {asr.provider === 'whisper' && (
        <div className="space-y-3 p-3 bg-bg-tertiary/50 rounded-lg border border-border-subtle">
          <h4 className="text-xs font-medium text-text-secondary">Whisper 配置</h4>
          <Input
            label="Base URL"
            value={asr.whisper?.baseURL ?? ''}
            onChange={(e) =>
              updateASR({ whisper: { ...asr.whisper!, baseURL: e.target.value } })
            }
            placeholder="https://api.openai.com"
          />
          <Input
            label="API Key"
            type="password"
            value={asr.whisper?.apiKey ?? ''}
            onChange={(e) =>
              updateASR({ whisper: { ...asr.whisper!, apiKey: e.target.value } })
            }
            placeholder="sk-..."
          />
        </div>
      )}

      {/* 阿里云配置 */}
      {asr.provider === 'aliyun' && (
        <div className="space-y-3 p-3 bg-bg-tertiary/50 rounded-lg border border-border-subtle">
          <h4 className="text-xs font-medium text-text-secondary">阿里云 ASR 配置</h4>
          <Input
            label="App Key"
            value={asr.aliyun?.appKey ?? ''}
            onChange={(e) =>
              updateASR({ aliyun: { ...asr.aliyun!, appKey: e.target.value } })
            }
          />
          <Input
            label="Access Key ID"
            value={asr.aliyun?.accessKeyId ?? ''}
            onChange={(e) =>
              updateASR({ aliyun: { ...asr.aliyun!, accessKeyId: e.target.value } })
            }
          />
          <Input
            label="Access Key Secret"
            type="password"
            value={asr.aliyun?.accessKeySecret ?? ''}
            onChange={(e) =>
              updateASR({ aliyun: { ...asr.aliyun!, accessKeySecret: e.target.value } })
            }
          />
        </div>
      )}

      {/* 腾讯云配置 */}
      {asr.provider === 'tencent' && (
        <div className="space-y-3 p-3 bg-bg-tertiary/50 rounded-lg border border-border-subtle">
          <h4 className="text-xs font-medium text-text-secondary">腾讯云 ASR 配置</h4>
          <Input
            label="App ID"
            value={asr.tencent?.appId ?? ''}
            onChange={(e) =>
              updateASR({ tencent: { ...asr.tencent!, appId: e.target.value } })
            }
          />
          <Input
            label="Secret ID"
            value={asr.tencent?.secretId ?? ''}
            onChange={(e) =>
              updateASR({ tencent: { ...asr.tencent!, secretId: e.target.value } })
            }
          />
          <Input
            label="Secret Key"
            type="password"
            value={asr.tencent?.secretKey ?? ''}
            onChange={(e) =>
              updateASR({ tencent: { ...asr.tencent!, secretKey: e.target.value } })
            }
          />
        </div>
      )}
    </div>
  )
}
