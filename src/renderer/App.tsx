import { useEffect, useRef, useState } from 'react'
import { MainLayout } from './components/Layout'
import { Onboarding } from './components/Onboarding'
import { ToastContainer, Loading, toast } from './components/Common'
import { useSettingsStore } from './stores/settingsStore'
import { useAppStore } from './stores/appStore'
import { useChatStore } from './stores/chatStore'
import { useTranscriptStore } from './stores/transcriptStore'
import type { AppView } from './stores/appStore'
import { AudioCaptureBridge } from './services/AudioCaptureBridge'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api as Record<string, (...args: never[]) => unknown> | undefined

interface RecordingErrorPayload {
  message: string
  fatal?: boolean
  code?: string
}

function buildRecordingRecoveryHint(message: string, code?: string): string {
  const lower = `${code ?? ''} ${message}`.toLowerCase()
  if (/permission|denied|notallowed|权限|麦克风/.test(lower)) {
    return '请在系统设置中授权麦克风权限后重试。'
  }
  if (/asr|404|model|模型/.test(lower)) {
    return '请到设置 > 语音识别检查 Base URL、API Key 和 ASR 模型。'
  }
  if (/network|fetch|timeout|连接|断开/.test(lower)) {
    return '请检查网络后重试，必要时在设置里点“测试连接”。'
  }
  return '可切到设置页重新测试连接后再开始面试。'
}

function App(): JSX.Element {
  const { config, loading, loadConfig } = useSettingsStore()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const audioCaptureRef = useRef<AudioCaptureBridge | null>(null)

  if (!audioCaptureRef.current) {
    audioCaptureRef.current = new AudioCaptureBridge()
  }

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  useEffect(() => {
    if (config && !config.onboardingCompleted) {
      setShowOnboarding(true)
    }
  }, [config])

  useEffect(() => {
    if (!config) return
    useChatStore.getState().setEnableHistory(!!config.enableHistoryContext)
  }, [config])

  useEffect(() => {
    const appearance = config?.appearance
    if (!appearance) return
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const useLightTheme = appearance.theme === 'light' || (appearance.theme === 'system' && !prefersDark)

    document.documentElement.classList.toggle('theme-light', useLightTheme)
    document.documentElement.style.fontSize = `${appearance.fontSize}px`

    if (api?.windowSetOpacity) {
      ;(api.windowSetOpacity as (opacity: number) => Promise<unknown>)(appearance.opacity).catch(() => {})
    }
  }, [config?.appearance.theme, config?.appearance.fontSize, config?.appearance.opacity])

  useEffect(() => {
    if (config?.appearance.theme !== 'system') return
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      document.documentElement.classList.toggle('theme-light', !mediaQuery.matches)
    }
    mediaQuery.addEventListener('change', onChange)
    return () => mediaQuery.removeEventListener('change', onChange)
  }, [config?.appearance.theme])

  // 注册主进程 → 渲染器事件监听
  useEffect(() => {
    if (!api) return

    const cleanups: (() => void)[] = []

    // 截屏捕获 → 发送给 AI 分析
    if (api.onScreenshotCaptured) {
      cleanups.push(
        (api.onScreenshotCaptured as (cb: (data: { imageBase64: string }) => void) => () => void)(
          (data) => {
            useChatStore.getState().sendScreenshot(data.imageBase64)
          }
        )
      )
    }

    // 录制状态
    if (api.onRecordingStarted) {
      cleanups.push(
        (api.onRecordingStarted as (cb: (data: { sessionId: string }) => void) => () => void)(
          (data) => {
            useAppStore.getState().setRecording(true)
            useAppStore.getState().setView('answer')
            useAppStore.getState().setCurrentSessionId(data.sessionId)
            useAppStore.getState().setRecordingIssue(null)
            useAppStore.getState().setLastCompletedSessionId(null)
            useTranscriptStore.getState().clear()
            useTranscriptStore.getState().setRecording(true)

            void (async () => {
              try {
                const result = await audioCaptureRef.current?.start()
                if (!result?.systemAudioEnabled) {
                  const message = '系统音频通道未就绪，无法区分“我”和“面试官”。请先完成 BlackHole/多输出设备配置。'
                  toast.error(message)
                  audioCaptureRef.current?.stop()
                  useAppStore.getState().setRecording(false)
                  useAppStore.getState().setCurrentSessionId(null)
                  useAppStore.getState().setRecordingIssue({
                    message,
                    fatal: true,
                    code: 'dual-channel-not-ready',
                    timestamp: Date.now(),
                  })
                  useTranscriptStore.getState().setRecording(false)
                  if (api.sessionStop) {
                    ;(api.sessionStop as () => Promise<unknown>)().catch(() => {})
                  }
                  return
                }
                for (const warning of result?.warnings ?? []) {
                  toast.info(warning)
                }
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err)
                toast.error(`录制错误: ${message}`)
                audioCaptureRef.current?.stop()
                useAppStore.getState().setRecording(false)
                useAppStore.getState().setCurrentSessionId(null)
                useAppStore.getState().setRecordingIssue({
                  message,
                  fatal: true,
                  code: 'renderer-audio-capture-start-failed',
                  timestamp: Date.now(),
                })
                useTranscriptStore.getState().setRecording(false)
                if (api.sessionStop) {
                  ;(api.sessionStop as () => Promise<unknown>)().catch(() => {})
                }
              }
            })()
          }
        )
      )
    }

    if (api.onRecordingStopped) {
      cleanups.push(
        (api.onRecordingStopped as (cb: (data: { sessionId?: string | null }) => void) => () => void)((data) => {
          audioCaptureRef.current?.stop()
          useAppStore.getState().setRecording(false)
          useAppStore.getState().setCurrentSessionId(null)
          useAppStore.getState().setRecordingIssue(null)
          useAppStore.getState().setLastCompletedSessionId(data?.sessionId ?? null)
          useTranscriptStore.getState().setRecording(false)
        })
      )
    }

    if (api.onRecordingError) {
      cleanups.push(
        (api.onRecordingError as (cb: (data: RecordingErrorPayload) => void) => () => void)(
          (data) => {
            const fatal = data.fatal !== false
            const hint = buildRecordingRecoveryHint(data.message, data.code)

            useAppStore.getState().setRecordingIssue({
              message: `${data.message} ${hint}`.trim(),
              fatal,
              code: data.code,
              timestamp: Date.now(),
            })

            if (fatal) {
              audioCaptureRef.current?.stop()
              toast.error(`录制错误: ${data.message}`)
              useAppStore.getState().setRecording(false)
              useAppStore.getState().setCurrentSessionId(null)
              useAppStore.getState().setLastCompletedSessionId(null)
              useTranscriptStore.getState().setRecording(false)
            } else {
              toast.info(data.message)
            }
          }
        )
      )
    }

    // ASR 转写结果
    if (api.onASRTranscript) {
      cleanups.push(
        (api.onASRTranscript as (cb: (entry: {
          id: string
          timestamp: number
          speaker: 'interviewer' | 'me'
          text: string
          isFinal: boolean
        }) => void) => () => void)((entry) => {
          const transcriptStore = useTranscriptStore.getState()
          const pending = [...transcriptStore.entries]
            .reverse()
            .find((e) => e.speaker === entry.speaker && !e.isFinal)

          if (pending) {
            transcriptStore.updateEntry(pending.id, entry.text, entry.isFinal)
          } else {
            transcriptStore.addEntry({
              id: entry.id || `asr-${entry.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
              timestamp: entry.timestamp,
              speaker: entry.speaker,
              text: entry.text,
              isFinal: entry.isFinal,
            })
          }
        })
      )
    }

    // 导航
    if (api.onNavigate) {
      cleanups.push(
        (api.onNavigate as (cb: (route: string) => void) => () => void)((route) => {
          const viewMap: Record<string, AppView> = {
            '/settings': 'settings',
            '/history': 'history',
            '/answer': 'answer',
            '/transcript': 'transcript',
          }
          const view = viewMap[route]
          if (view) {
            useAppStore.getState().setView(view)
          }
        })
      )
    }

    // 快捷键发送消息
    if (api.onHotkeySendMessage) {
      cleanups.push(
        (api.onHotkeySendMessage as (cb: () => void) => () => void)(() => {
          // 触发自定义事件，由 AnswerPanel 输入框监听处理
          window.dispatchEvent(new CustomEvent('hotkey:sendMessage'))
        })
      )
    }

    if (api.onHealthUpdate) {
      cleanups.push(
        (api.onHealthUpdate as (cb: (snapshot: unknown) => void) => () => void)((snapshot) => {
          useAppStore.getState().setHealthSnapshot(snapshot as never)
        })
      )
    }
    if (api.healthSubscribe) {
      ;(api.healthSubscribe as (intervalMs?: number) => Promise<unknown>)(2000).catch(() => {})
    }
    if (api.healthGetSnapshot) {
      ;(api.healthGetSnapshot as () => Promise<unknown>)()
        .then((snapshot) => useAppStore.getState().setHealthSnapshot(snapshot as never))
        .catch(() => {})
    }

    if (api.recordingStatus) {
      void (async () => {
        try {
          const status = await (api.recordingStatus as () => Promise<{
            isRecording: boolean
            sessionId: string | null
          }>)()
          if (!status?.isRecording) return

          useAppStore.getState().setRecording(true)
          useAppStore.getState().setCurrentSessionId(status.sessionId ?? null)
          useAppStore.getState().setRecordingIssue(null)
          useTranscriptStore.getState().setRecording(true)

          const result = await audioCaptureRef.current?.start()
          for (const warning of result?.warnings ?? []) {
            toast.info(warning)
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          if (/No handler registered for 'recording:status'/i.test(message)) {
            // 兼容旧版主进程：忽略一次状态同步失败，避免给用户制造噪音
            return
          }
          useAppStore.getState().setRecordingIssue({
            message: `录音状态同步失败：${message}`,
            fatal: false,
            code: 'recording-status-sync-failed',
            timestamp: Date.now(),
          })
        }
      })()
    }

    return () => {
      audioCaptureRef.current?.stop()
      if (api.healthUnsubscribe) {
        ;(api.healthUnsubscribe as () => Promise<unknown>)().catch(() => {})
      }
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [])

  if (loading && !config) {
    return <Loading text="加载中..." />
  }

  return (
    <>
      {showOnboarding ? (
        <Onboarding onComplete={() => setShowOnboarding(false)} />
      ) : (
        <MainLayout />
      )}
      <ToastContainer />
    </>
  )
}

export default App
