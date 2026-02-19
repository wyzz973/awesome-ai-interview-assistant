import { useState, useCallback } from 'react'
import { Keyboard } from 'lucide-react'
import { DEFAULT_HOTKEYS } from '@shared/constants'
import type { HotkeyAction, HotkeyConfig } from '@shared/types'
import { formatHotkey } from '../../utils/formatHotkey'

const HOTKEY_LABELS: Record<HotkeyAction, string> = {
  screenshot: '截屏',
  toggleWindow: '切换窗口',
  toggleStealth: '隐身模式',
  decreaseOpacity: '降低透明度',
  increaseOpacity: '提高透明度',
  toggleRecording: '开始/停止录音',
  sendMessage: '发送消息',
}

interface HotkeyStepProps {
  hotkeys: HotkeyConfig
  onChange: (hotkeys: HotkeyConfig) => void
}

export default function HotkeyStep({ hotkeys, onChange }: HotkeyStepProps) {
  const [recordingAction, setRecordingAction] = useState<HotkeyAction | null>(null)

  const handleKeyDown = useCallback(
    (action: HotkeyAction, e: React.KeyboardEvent) => {
      e.preventDefault()
      const parts: string[] = []
      if (e.metaKey || e.ctrlKey) parts.push('CommandOrControl')
      if (e.shiftKey) parts.push('Shift')
      if (e.altKey) parts.push('Alt')

      const key = e.key
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return

      let keyName = key.length === 1 ? key.toUpperCase() : key
      if (key === ' ') keyName = 'Space'

      parts.push(keyName)
      const accelerator = parts.join('+')
      onChange({ ...hotkeys, [action]: accelerator })
      setRecordingAction(null)
    },
    [hotkeys, onChange]
  )

  const actions = Object.keys(DEFAULT_HOTKEYS) as HotkeyAction[]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-primary/15 flex items-center justify-center">
          <Keyboard size={20} className="text-accent-primary" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-text-primary">快捷键设置</h3>
          <p className="text-xs text-text-muted">自定义操作快捷键（可稍后在设置中修改）</p>
        </div>
      </div>

      <div className="space-y-1">
        {actions.map((action) => (
          <div key={action} className="flex items-center justify-between py-2">
            <span className="text-sm text-text-primary">{HOTKEY_LABELS[action]}</span>
            <button
              onKeyDown={recordingAction === action ? (e) => handleKeyDown(action, e) : undefined}
              onClick={() => setRecordingAction(action)}
              onBlur={() => setRecordingAction(null)}
              className={`
                px-3 py-1.5 text-xs font-mono rounded-md border cursor-pointer
                transition-colors min-w-[140px] text-center bg-bg-tertiary
                ${recordingAction === action
                  ? 'border-accent-primary text-accent-primary animate-pulse'
                  : 'border-border-default text-text-secondary hover:border-border-focus'
                }
              `}
            >
              {recordingAction === action ? '按下快捷键...' : formatHotkey(hotkeys[action])}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
