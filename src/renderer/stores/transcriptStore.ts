import { create } from 'zustand'

export interface TranscriptEntryData {
  id: string
  timestamp: number
  speaker: 'interviewer' | 'me'
  text: string
  isFinal: boolean
}

const MERGE_WINDOW_MS = 2600

function shouldMergeAdjacentEntries(prev: TranscriptEntryData, next: TranscriptEntryData): boolean {
  if (prev.speaker !== next.speaker) return false
  if (!prev.isFinal || !next.isFinal) return false

  const timeDelta = next.timestamp - prev.timestamp
  if (timeDelta < 0 || timeDelta > MERGE_WINDOW_MS) return false

  const prevText = prev.text.trim()
  const nextText = next.text.trim()
  if (!prevText || !nextText) return false

  if (/[。！？!?]$/.test(prevText) && timeDelta > 1200) return false
  return true
}

function mergeTranscriptText(prevText: string, nextText: string): string {
  const left = prevText.trim()
  const right = nextText.trim()
  if (!left) return right
  if (!right) return left
  if (left.endsWith(right)) return left
  if (right.startsWith(left)) return right

  const needSpace = /[A-Za-z0-9]$/.test(left) && /^[A-Za-z0-9]/.test(right)
  return `${left}${needSpace ? ' ' : ''}${right}`
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
    set((state) => {
      const last = state.entries[state.entries.length - 1]
      if (last && shouldMergeAdjacentEntries(last, entry)) {
        return {
          entries: [
            ...state.entries.slice(0, -1),
            {
              ...last,
              timestamp: entry.timestamp,
              text: mergeTranscriptText(last.text, entry.text),
            },
          ],
        }
      }
      return { entries: [...state.entries, entry] }
    })
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
