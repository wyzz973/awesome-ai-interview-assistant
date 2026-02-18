import * as Slider from '@radix-ui/react-slider'
import { useSettingsStore } from '../../stores/settingsStore'

export default function AppearanceSettings() {
  const { config, updateAppearance } = useSettingsStore()
  if (!config) return null

  const { appearance } = config

  return (
    <div className="space-y-6">
      {/* 主题 */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-text-secondary">主题</label>
        <div className="flex gap-2">
          {(['dark', 'light', 'system'] as const).map((theme) => (
            <button
              key={theme}
              onClick={() => updateAppearance({ theme })}
              className={`
                flex-1 py-2 text-xs font-medium rounded-lg border cursor-pointer transition-colors
                ${appearance.theme === theme
                  ? 'bg-accent-primary/15 text-accent-primary border-accent-primary/30'
                  : 'bg-bg-tertiary text-text-secondary border-border-default hover:border-border-focus'
                }
              `}
            >
              {theme === 'dark' ? '暗色' : theme === 'light' ? '亮色' : '跟随系统'}
            </button>
          ))}
        </div>
      </div>

      {/* 透明度 */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-text-secondary">窗口透明度</label>
          <span className="text-xs text-text-muted font-mono">
            {Math.round(appearance.opacity * 100)}%
          </span>
        </div>
        <Slider.Root
          value={[appearance.opacity]}
          onValueChange={([v]) => updateAppearance({ opacity: v })}
          min={0.3}
          max={1}
          step={0.05}
          className="relative flex items-center h-5 w-full select-none touch-none"
        >
          <Slider.Track className="relative grow h-1.5 rounded-full bg-bg-tertiary">
            <Slider.Range className="absolute h-full rounded-full bg-accent-primary" />
          </Slider.Track>
          <Slider.Thumb className="block w-4 h-4 rounded-full bg-white border-2 border-accent-primary shadow focus:outline-none" />
        </Slider.Root>
      </div>

      {/* 字体大小 */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-text-secondary">字体大小</label>
          <span className="text-xs text-text-muted font-mono">{appearance.fontSize}px</span>
        </div>
        <Slider.Root
          value={[appearance.fontSize]}
          onValueChange={([v]) => updateAppearance({ fontSize: v })}
          min={12}
          max={20}
          step={1}
          className="relative flex items-center h-5 w-full select-none touch-none"
        >
          <Slider.Track className="relative grow h-1.5 rounded-full bg-bg-tertiary">
            <Slider.Range className="absolute h-full rounded-full bg-accent-primary" />
          </Slider.Track>
          <Slider.Thumb className="block w-4 h-4 rounded-full bg-white border-2 border-accent-primary shadow focus:outline-none" />
        </Slider.Root>
      </div>
    </div>
  )
}
