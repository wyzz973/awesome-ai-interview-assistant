import { create } from 'zustand'

export interface TranscriptEntryData {
  id: string
  timestamp: number
  speaker: 'interviewer' | 'me'
  text: string
  isFinal: boolean
}

interface TranscriptState {
  entries: TranscriptEntryData[]
  isRecording: boolean
  recordingStartTime: number | null
  selectedEntryIds: Set<string>

  addEntry: (entry: TranscriptEntryData) => void
  updateEntry: (id: string, text: string, isFinal: boolean) => void
  setRecording: (recording: boolean) => void
  toggleSelect: (id: string) => void
  getSelectedText: () => string
  clear: () => void
}

export const useTranscriptStore = create<TranscriptState>((set, get) => ({
  entries: [],
  isRecording: false,
  recordingStartTime: null,
  selectedEntryIds: new Set<string>(),

  addEntry: (entry) => {
    set((state) => ({ entries: [...state.entries, entry] }))
  },

  updateEntry: (id, text, isFinal) => {
    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === id ? { ...e, text, isFinal } : e
      ),
    }))
  },

  setRecording: (recording) => {
    set({
      isRecording: recording,
      recordingStartTime: recording ? Date.now() : null,
    })
  },

  toggleSelect: (id) => {
    set((state) => {
      const next = new Set(state.selectedEntryIds)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return { selectedEntryIds: next }
    })
  },

  getSelectedText: () => {
    const { entries, selectedEntryIds } = get()
    return entries
      .filter((e) => selectedEntryIds.has(e.id))
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((e) => `[${e.speaker === 'interviewer' ? '面试官' : '我'}] ${e.text}`)
      .join('\n')
  },

  clear: () => {
    set({ entries: [], selectedEntryIds: new Set() })
  },
}))
