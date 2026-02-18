import { create } from 'zustand'
import type {
  Session,
  TranscriptEntry,
  ScreenshotQA,
  ReviewReport,
} from '@shared/types'

interface HistoryFilters {
  company?: string
  sortBy: 'time-desc' | 'time-asc'
}

interface HistoryState {
  sessions: Session[]
  currentSession: Session | null
  transcripts: TranscriptEntry[]
  screenshotQAs: ScreenshotQA[]
  review: ReviewReport | null
  filters: HistoryFilters
  loading: boolean

  loadSessions: () => Promise<void>
  loadSessionDetail: (sessionId: string) => Promise<void>
  setFilters: (filters: Partial<HistoryFilters>) => void
  deleteSession: (sessionId: string) => Promise<void>
  exportSession: (sessionId: string, format: 'pdf' | 'markdown' | 'json') => Promise<void>
  generateReview: (sessionId: string) => Promise<void>
  clearDetail: () => void
}

function ipcInvoke(channel: string, ...args: unknown[]): Promise<unknown> {
  if (window.electron?.ipcRenderer) {
    return window.electron.ipcRenderer.invoke(channel, ...args)
  }
  console.warn(`[historyStore] IPC not available: ${channel}`, args)
  return Promise.resolve(null)
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  sessions: [],
  currentSession: null,
  transcripts: [],
  screenshotQAs: [],
  review: null,
  filters: { sortBy: 'time-desc' },
  loading: false,

  loadSessions: async () => {
    set({ loading: true })
    try {
      const sessions = (await ipcInvoke('session:list')) as Session[] | null
      set({ sessions: sessions ?? [] })
    } finally {
      set({ loading: false })
    }
  },

  loadSessionDetail: async (sessionId) => {
    set({ loading: true })
    try {
      const session = (await ipcInvoke('session:get', sessionId)) as
        | { session: Session; transcripts: TranscriptEntry[]; screenshotQAs: ScreenshotQA[]; review: ReviewReport | null }
        | null
      if (session) {
        set({
          currentSession: session.session,
          transcripts: session.transcripts,
          screenshotQAs: session.screenshotQAs,
          review: session.review,
        })
      }
    } finally {
      set({ loading: false })
    }
  },

  setFilters: (filters) => {
    set((state) => ({ filters: { ...state.filters, ...filters } }))
  },

  deleteSession: async (sessionId) => {
    await ipcInvoke('session:delete', sessionId)
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== sessionId),
      currentSession: state.currentSession?.id === sessionId ? null : state.currentSession,
    }))
  },

  exportSession: async (sessionId, format) => {
    await ipcInvoke('session:export', sessionId, format)
  },

  generateReview: async (sessionId) => {
    set({ loading: true })
    try {
      const review = (await ipcInvoke('review:generate', sessionId)) as ReviewReport | null
      if (review) {
        set({ review })
      }
    } finally {
      set({ loading: false })
    }
  },

  clearDetail: () => {
    set({
      currentSession: null,
      transcripts: [],
      screenshotQAs: [],
      review: null,
    })
  },
}))

/** 获取已排序和筛选的会话列表 */
export function useFilteredSessions() {
  const { sessions, filters } = useHistoryStore()

  let result = [...sessions]

  if (filters.company) {
    result = result.filter((s) => s.company === filters.company)
  }

  result.sort((a, b) =>
    filters.sortBy === 'time-desc' ? b.startTime - a.startTime : a.startTime - b.startTime
  )

  return result
}
