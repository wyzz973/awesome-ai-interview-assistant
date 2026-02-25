import { useEffect, useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { useSettingsStore } from '../../stores/settingsStore'
import { Loading } from '../Common'
import ModelSettings from './ModelSettings'
import ASRSettings from './ASRSettings'
import HotkeySettings from './HotkeySettings'
import AppearanceSettings from './AppearanceSettings'
import StorageSettings from './StorageSettings'

const ADVANCED_TABS = [
  { id: 'model', label: 'AI 模型' },
  { id: 'asr', label: '语音识别' },
  { id: 'hotkey', label: '快捷键' },
  { id: 'appearance', label: '外观' },
  { id: 'storage', label: '存储' },
]

export default function Settings() {
  const { config, loading, loadConfig, updateRecordingGateMode } = useSettingsStore()
  const [mode, setMode] = useState<'basic' | 'advanced'>('basic')

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  if (loading || !config) {
    return <Loading text="加载配置中..." />
  }

  return (
    <div className="flex flex-col h-full bg-bg-secondary">
      <div className="px-4 pt-3 pb-2 border-b border-border-default space-y-2">
        <h2 className="text-base font-semibold text-text-primary">设置</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode('basic')}
            className={`
              h-7 px-2.5 rounded-md text-xs border transition-colors
              ${mode === 'basic'
                ? 'border-accent-primary/35 bg-accent-primary/10 text-accent-primary'
                : 'border-border-default bg-bg-tertiary text-text-secondary hover:bg-bg-hover'
              }
            `}
          >
            基础设置
          </button>
          <button
            type="button"
            onClick={() => setMode('advanced')}
            className={`
              h-7 px-2.5 rounded-md text-xs border transition-colors
              ${mode === 'advanced'
                ? 'border-accent-primary/35 bg-accent-primary/10 text-accent-primary'
                : 'border-border-default bg-bg-tertiary text-text-secondary hover:bg-bg-hover'
              }
            `}
          >
            高级设置
          </button>
        </div>
      </div>

      {mode === 'basic' ? (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div className="space-y-2 p-3 bg-bg-tertiary/50 rounded-lg border border-border-subtle">
            <h4 className="text-xs font-medium text-text-secondary">录制门禁策略</h4>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-muted">开始面试时的健康检查策略</label>
              <select
                value={config.recordingGateMode}
                onChange={(e) => void updateRecordingGateMode(e.target.value as 'strict' | 'lenient')}
                className="h-9 px-3 text-sm rounded-lg bg-bg-tertiary text-text-primary border border-border-default focus:outline-none focus:border-border-focus"
              >
                <option value="strict">Strict（关键链路异常禁止开始）</option>
                <option value="lenient">Lenient（允许开始并持续告警）</option>
              </select>
              <p className="text-xs text-text-muted">
                高压面试推荐 Strict，可避免“开始后才发现链路不可用”。
              </p>
            </div>
          </div>
          <ModelSettings basicOnly />
          <ASRSettings basicOnly />
        </div>
      ) : (
        <Tabs.Root defaultValue="model" className="flex flex-col flex-1 overflow-hidden">
          <Tabs.List className="flex gap-1 px-4 py-2 border-b border-border-default">
            {ADVANCED_TABS.map((tab) => (
              <Tabs.Trigger
                key={tab.id}
                value={tab.id}
                className="
                  px-3 py-1.5 text-xs font-medium rounded-md
                  transition-colors cursor-pointer border-none
                  text-text-muted hover:text-text-secondary hover:bg-bg-hover
                  data-[state=active]:text-accent-primary data-[state=active]:bg-accent-primary/10
                "
              >
                {tab.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            <Tabs.Content value="model"><ModelSettings /></Tabs.Content>
            <Tabs.Content value="asr"><ASRSettings /></Tabs.Content>
            <Tabs.Content value="hotkey"><HotkeySettings /></Tabs.Content>
            <Tabs.Content value="appearance"><AppearanceSettings /></Tabs.Content>
            <Tabs.Content value="storage"><StorageSettings /></Tabs.Content>
          </div>
        </Tabs.Root>
      )}
    </div>
  )
}
