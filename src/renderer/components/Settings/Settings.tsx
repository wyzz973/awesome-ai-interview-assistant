import { useEffect } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { useSettingsStore } from '../../stores/settingsStore'
import { Loading } from '../Common'
import ModelSettings from './ModelSettings'
import ASRSettings from './ASRSettings'
import HotkeySettings from './HotkeySettings'
import AppearanceSettings from './AppearanceSettings'
import StorageSettings from './StorageSettings'

const TABS = [
  { id: 'model', label: 'AI 模型' },
  { id: 'asr', label: '语音识别' },
  { id: 'hotkey', label: '快捷键' },
  { id: 'appearance', label: '外观' },
  { id: 'storage', label: '存储' },
]

export default function Settings() {
  const { config, loading, loadConfig } = useSettingsStore()

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  if (loading || !config) {
    return <Loading text="加载配置中..." />
  }

  return (
    <div className="flex flex-col h-full bg-bg-secondary">
      <div className="px-4 pt-3 pb-1">
        <h2 className="text-base font-semibold text-text-primary">设置</h2>
      </div>

      <Tabs.Root defaultValue="model" className="flex flex-col flex-1 overflow-hidden">
        <Tabs.List className="flex gap-1 px-4 py-2 border-b border-border-default">
          {TABS.map((tab) => (
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
    </div>
  )
}
