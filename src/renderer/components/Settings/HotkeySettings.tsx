import { useState, useCallback } from 'react'
import { RotateCcw } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'
import { Button } from '../Common'
import { toast } from '../Common'
import type { HotkeyAction } from '@shared/types'

const HOTKEY_LABELS: Record<HotkeyAction, string> = {
  screenshot: '截屏',
  toggleWindow: '切换窗口',
  decreaseOpacity: '降低透明度',
  increaseOpacity: '提高透明度',
  toggleRecording: '开始/停止录音',
  sendMessage: '发送消息',
}

function HotkeyInput({
  action,
  value,
  onChange,
}: {
  action: HotkeyAction
  value: string
  onChange: (action: HotkeyAction, accelerator: string) => void
}) {
  const [recording, setRecording] = useState(false)
  const [display, setDisplay] = useState(value)

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const parts: string[] = []
      if (e.metaKey || e.ctrlKey) parts.push('CommandOrControl')
      if (e.shiftKey) parts.push('Shift')
      if (e.altKey) parts.push('Alt')

      // 忽略单独的修饰键
      const key = e.key
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return

      // 转换键名
      let keyName = key.length === 1 ? key.toUpperCase() : key
      if (key === ' ') keyName = 'Space'
      if (key === 'ArrowUp') keyName = 'Up'
      if (key === 'ArrowDown') keyName = 'Down'
      if (key === 'ArrowLeft') keyName = 'Left'
      if (key === 'ArrowRight') keyName = 'Right'

      parts.push(keyName)
      const accelerator = parts.join('+')
      setDisplay(accelerator)
      setRecording(false)
      onChange(action, accelerator)
    },
    [action, onChange]
  )

  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-text-primary">{HOTKEY_LABELS[action]}</span>
      <button
        onKeyDown={recording ? handleKeyDown : undefined}
        onClick={() => setRecording(true)}
        onBlur={() => setRecording(false)}
        className={`
          px-3 py-1.5 text-xs font-mono rounded-md border cursor-pointer
          transition-colors min-w-[160px] text-center bg-bg-tertiary
          ${recording
            ? 'border-accent-primary text-accent-primary animate-pulse'
            : 'border-border-default text-text-secondary hover:border-border-focus'
          }
        `}
      >
        {recording ? '按下快捷键...' : display}
      </button>
    </div>
  )
}

export default function HotkeySettings() {
  const { config, updateHotkey, resetHotkeys } = useSettingsStore()
  if (!config) return null

  const handleReset = async () => {
    await resetHotkeys()
    toast.info('快捷键已恢复默认')
  }

  const actions = Object.keys(config.hotkeys) as HotkeyAction[]

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-text-muted">点击输入框后按下快捷键进行设置</span>
        <Button size="sm" variant="ghost" onClick={handleReset}>
          <RotateCcw size={14} />
          恢复默认
        </Button>
      </div>

      <div className="space-y-1 divide-y divide-border-subtle">
        {actions.map((action) => (
          <HotkeyInput
            key={action}
            action={action}
            value={config.hotkeys[action]}
            onChange={updateHotkey}
          />
        ))}
      </div>
    </div>
  )
}
