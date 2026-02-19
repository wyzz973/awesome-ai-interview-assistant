import { useEffect, useState } from 'react'
import { MainLayout } from './components/Layout'
import { Onboarding } from './components/Onboarding'
import { ToastContainer, Loading, toast } from './components/Common'
import { useSettingsStore } from './stores/settingsStore'
import { useAppStore } from './stores/appStore'
import { useChatStore } from './stores/chatStore'
import type { AppView } from './stores/appStore'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api as Record<string, (...args: never[]) => unknown> | undefined

function App(): JSX.Element {
  const { config, loading, loadConfig } = useSettingsStore()
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  useEffect(() => {
    if (config && !config.onboardingCompleted) {
      setShowOnboarding(true)
    }
  }, [config])

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
            useAppStore.getState().setCurrentSessionId(data.sessionId)
          }
        )
      )
    }

    if (api.onRecordingStopped) {
      cleanups.push(
        (api.onRecordingStopped as (cb: () => void) => () => void)(() => {
          useAppStore.getState().setRecording(false)
          useAppStore.getState().setCurrentSessionId(null)
        })
      )
    }

    if (api.onRecordingError) {
      cleanups.push(
        (api.onRecordingError as (cb: (data: { message: string }) => void) => () => void)(
          (data) => {
            toast.error(`录制错误: ${data.message}`)
          }
        )
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

    return () => {
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
