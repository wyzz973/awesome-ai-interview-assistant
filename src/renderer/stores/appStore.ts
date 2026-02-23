import { create } from 'zustand'

export type AppView = 'answer' | 'transcript' | 'history' | 'settings'

export interface RecordingIssue {
  message: string
  fatal: boolean
  code?: string
  timestamp: number
}

interface AppState {
  currentView: AppView
  isRecording: boolean
  currentSessionId: string | null
  recordingIssue: RecordingIssue | null
  interviewDraft: {
    company: string
    position: string
    round: string
    backgroundNote: string
    resumeFilePath: string
    resumeFileName: string
  }
  lastCompletedSessionId: string | null

  setView: (view: AppView) => void
  setRecording: (recording: boolean) => void
  setCurrentSessionId: (id: string | null) => void
  setRecordingIssue: (issue: RecordingIssue | null) => void
  setInterviewDraft: (draft: Partial<{
    company: string
    position: string
    round: string
    backgroundNote: string
    resumeFilePath: string
    resumeFileName: string
  }>) => void
  setLastCompletedSessionId: (id: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  currentView: 'answer',
  isRecording: false,
  currentSessionId: null,
  recordingIssue: null,
  interviewDraft: {
    company: '',
    position: '',
    round: '',
    backgroundNote: '',
    resumeFilePath: '',
    resumeFileName: '',
  },
  lastCompletedSessionId: null,

  setView: (view) => set({ currentView: view }),
  setRecording: (recording) => set({ isRecording: recording }),
  setCurrentSessionId: (id) => set({ currentSessionId: id }),
  setRecordingIssue: (issue) => set({ recordingIssue: issue }),
  setInterviewDraft: (draft) => set((state) => ({
    interviewDraft: {
      company: draft.company ?? state.interviewDraft.company,
      position: draft.position ?? state.interviewDraft.position,
      round: draft.round ?? state.interviewDraft.round,
      backgroundNote: draft.backgroundNote ?? state.interviewDraft.backgroundNote,
      resumeFilePath: draft.resumeFilePath ?? state.interviewDraft.resumeFilePath,
      resumeFileName: draft.resumeFileName ?? state.interviewDraft.resumeFileName,
    },
  })),
  setLastCompletedSessionId: (id) => set({ lastCompletedSessionId: id }),
}))
