import { useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import { useHistoryStore } from '../../stores/historyStore'
import Toolbar from './Toolbar'
import { AnswerPanel } from '../AnswerPanel'
import { TranscriptPanel } from '../TranscriptPanel'
import { HistoryList, SessionDetail } from '../History'
import { Settings } from '../Settings'

export default function MainLayout() {
  const { currentView } = useAppStore()
  const { loadSessionDetail, clearDetail, currentSession } = useHistoryStore()
  const [showDetail, setShowDetail] = useState(false)

  const handleSelectSession = (id: string) => {
    loadSessionDetail(id)
    setShowDetail(true)
  }

  const handleBack = () => {
    setShowDetail(false)
    clearDetail()
  }

  return (
    <div className="flex flex-col h-screen bg-bg-primary">
      <Toolbar />
      <div className="flex-1 overflow-hidden">
        {currentView === 'answer' && <AnswerPanel />}
        {currentView === 'transcript' && <TranscriptPanel />}
        {currentView === 'history' && (
          showDetail && currentSession
            ? <SessionDetail onBack={handleBack} />
            : <HistoryList onSelectSession={handleSelectSession} />
        )}
        {currentView === 'settings' && <Settings />}
      </div>
    </div>
  )
}
