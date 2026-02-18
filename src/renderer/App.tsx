import { useEffect, useState } from 'react'
import { MainLayout } from './components/Layout'
import { Onboarding } from './components/Onboarding'
import { ToastContainer, Loading } from './components/Common'
import { useSettingsStore } from './stores/settingsStore'

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
