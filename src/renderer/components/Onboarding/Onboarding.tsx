import { useState } from 'react'
import { ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { Button } from '../Common'
import { useSettingsStore } from '../../stores/settingsStore'
import WelcomeStep from './WelcomeStep'
import AudioSetupStep from './AudioSetupStep'
import ModelSetupStep from './ModelSetupStep'
import ASRSetupStep from './ASRSetupStep'
import HotkeyStep from './HotkeyStep'
import { DEFAULT_HOTKEYS } from '@shared/constants'
import type { LLMProvider, ASRConfig, HotkeyConfig } from '@shared/types'

const STEPS = ['欢迎', '音频', '模型', '语音', '快捷键']

interface OnboardingProps {
  onComplete: () => void
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0)
  const { config, updateLLMProvider, updateASR, updateHotkey } = useSettingsStore()

  const [llmProvider, setLlmProvider] = useState<LLMProvider | null>(null)
  const [asrConfig, setAsrConfig] = useState<ASRConfig>(
    config?.asr ?? {
      provider: 'whisper',
      language: 'zh-en',
      sampleRate: 16000,
    }
  )
  const [hotkeys, setHotkeys] = useState<HotkeyConfig>(
    config?.hotkeys ?? DEFAULT_HOTKEYS
  )

  const canNext = step < STEPS.length - 1
  const canPrev = step > 0
  const isLast = step === STEPS.length - 1

  const handleFinish = async () => {
    // 保存配置
    if (llmProvider) {
      await updateLLMProvider('screenshot', llmProvider)
      await updateLLMProvider('chat', llmProvider)
      await updateLLMProvider('review', llmProvider)
    }
    await updateASR(asrConfig)
    for (const [action, accelerator] of Object.entries(hotkeys)) {
      await updateHotkey(action as keyof HotkeyConfig, accelerator)
    }

    // 标记引导完成
    await window.api.configSet('onboardingCompleted', true)

    onComplete()
  }

  return (
    <div className="flex flex-col h-screen bg-bg-primary">
      {/* 进度指示 */}
      <div className="flex items-center justify-center gap-2 pt-6 pb-4">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`
                w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium
                transition-colors
                ${i < step
                  ? 'bg-accent-primary text-white'
                  : i === step
                    ? 'bg-accent-primary/20 text-accent-primary border-2 border-accent-primary'
                    : 'bg-bg-tertiary text-text-muted'
                }
              `}
            >
              {i < step ? <Check size={14} /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`w-8 h-0.5 rounded-full ${i < step ? 'bg-accent-primary' : 'bg-bg-tertiary'}`}
              />
            )}
          </div>
        ))}
      </div>

      {/* 步骤名 */}
      <div className="text-center mb-4">
        <span className="text-[11px] text-text-muted">{STEPS[step]}</span>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto px-6">
        {step === 0 && <WelcomeStep />}
        {step === 1 && <AudioSetupStep />}
        {step === 2 && (
          <ModelSetupStep
            initialProvider={llmProvider ?? config?.llm.chat}
            onProviderChange={setLlmProvider}
          />
        )}
        {step === 3 && <ASRSetupStep asr={asrConfig} onChange={setAsrConfig} />}
        {step === 4 && <HotkeyStep hotkeys={hotkeys} onChange={setHotkeys} />}
      </div>

      {/* 底部导航 */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-border-default">
        <Button
          variant="ghost"
          size="sm"
          disabled={!canPrev}
          onClick={() => setStep(step - 1)}
        >
          <ChevronLeft size={16} />
          上一步
        </Button>

        {isLast ? (
          <Button size="sm" onClick={handleFinish}>
            <Check size={16} />
            完成设置
          </Button>
        ) : (
          <Button size="sm" onClick={() => setStep(step + 1)} disabled={!canNext}>
            下一步
            <ChevronRight size={16} />
          </Button>
        )}
      </div>
    </div>
  )
}
