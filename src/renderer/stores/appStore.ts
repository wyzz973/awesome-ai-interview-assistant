import { create } from 'zustand'

export type AppView = 'answer' | 'transcript' | 'history' | 'settings'

interface AppState {
  currentView: AppView
  isRecording: boolean
  currentSessionId: string | null

  setView: (view: AppView) => void
  setRecording: (recording: boolean) => void
  setCurrentSessionId: (id: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  currentView: 'answer',
  isRecording: false,
  currentSessionId: null,

  setView: (view) => set({ currentView: view }),
  setRecording: (recording) => set({ isRecording: recording }),
  setCurrentSessionId: (id) => set({ currentSessionId: id }),
}))
