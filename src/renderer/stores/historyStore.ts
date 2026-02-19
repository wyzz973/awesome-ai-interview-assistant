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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api as {
  sessionList: (options?: unknown) => Promise<unknown>
  sessionGet: (id: string) => Promise<unknown>
  sessionDelete: (id: string) => Promise<unknown>
  sessionExport: (id: string, format: string) => Promise<unknown>
  reviewGenerate: (sessionId: string) => Promise<unknown>
} | undefined

export const useHistoryStore = create<HistoryState>((set, get) => ({
  sessions: [],
  currentSession: null,
  transcripts: [],
  screenshotQAs: [],
  review: null,
  filters: { sortBy: 'time-desc' },
  loading: false,

  loadSessions: async () => {
    if (!api) return
    set({ loading: true })
    try {
      const sessions = (await api.sessionList()) as Session[] | null
      set({ sessions: sessions ?? [] })
    } finally {
      set({ loading: false })
    }
  },

  loadSessionDetail: async (sessionId) => {
    if (!api) return
    set({ loading: true })
    try {
      const session = (await api.sessionGet(sessionId)) as
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
    if (!api) return
    await api.sessionDelete(sessionId)
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== sessionId),
      currentSession: state.currentSession?.id === sessionId ? null : state.currentSession,
    }))
  },

  exportSession: async (sessionId, format) => {
    if (!api) return
    await api.sessionExport(sessionId, format)
  },

  generateReview: async (sessionId) => {
    if (!api) return
    set({ loading: true })
    try {
      const review = (await api.reviewGenerate(sessionId)) as ReviewReport | null
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
