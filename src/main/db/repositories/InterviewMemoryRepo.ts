import type Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

export type InterviewMemorySource =
  | 'resume'
  | 'interview_background'
  | 'transcript'
  | 'screenshot_question'
  | 'screenshot_answer'
  | 'chat_user'
  | 'chat_assistant'

export interface InterviewMemoryChunk {
  id: string
  sessionId: string
  source: InterviewMemorySource
  role: string
  timestamp: number
  text: string
  createdAt: number
}

interface InterviewMemoryChunkRow {
  id: string
  session_id: string
  source: InterviewMemorySource
  role: string
  timestamp: number
  text: string
  created_at: number
}

export interface KeywordSearchResult extends InterviewMemoryChunk {
  textScore: number
  rank: number
}

export class InterviewMemoryRepo {
  constructor(private db: Database.Database) {}

  create(data: Omit<InterviewMemoryChunk, 'id' | 'createdAt'>): InterviewMemoryChunk {
    const id = randomUUID()
    const createdAt = Date.now()
    this.db
      .prepare(
        `INSERT INTO interview_memory_chunks (id, session_id, source, role, timestamp, text, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        data.sessionId,
        data.source,
        data.role,
        data.timestamp,
        data.text,
        createdAt,
      )
    return { id, createdAt, ...data }
  }

  batchCreate(items: Array<Omit<InterviewMemoryChunk, 'id' | 'createdAt'>>): InterviewMemoryChunk[] {
    const insert = this.db.prepare(
      `INSERT INTO interview_memory_chunks (id, session_id, source, role, timestamp, text, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )

    const results: InterviewMemoryChunk[] = []
    this.db.transaction((entries: Array<Omit<InterviewMemoryChunk, 'id' | 'createdAt'>>) => {
      const now = Date.now()
      for (const item of entries) {
        const id = randomUUID()
        insert.run(id, item.sessionId, item.source, item.role, item.timestamp, item.text, now)
        results.push({ id, createdAt: now, ...item })
      }
    })(items)
    return results
  }

  listBySessionId(sessionId: string): InterviewMemoryChunk[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM interview_memory_chunks
         WHERE session_id = ?
         ORDER BY timestamp DESC, created_at DESC`
      )
      .all(sessionId) as InterviewMemoryChunkRow[]

    return rows.map((row) => this.toChunk(row))
  }

  listRecentBySessionId(sessionId: string, limit = 120): InterviewMemoryChunk[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM interview_memory_chunks
         WHERE session_id = ?
         ORDER BY timestamp DESC, created_at DESC
         LIMIT ?`
      )
      .all(sessionId, limit) as InterviewMemoryChunkRow[]

    return rows.map((row) => this.toChunk(row))
  }

  searchKeyword(sessionId: string, query: string, limit = 24): KeywordSearchResult[] {
    const ftsQuery = this.buildFtsQuery(query)
    if (!ftsQuery) return []

    const rows = this.db
      .prepare(
        `SELECT
          c.id,
          c.session_id,
          c.source,
          c.role,
          c.timestamp,
          c.text,
          c.created_at,
          bm25(interview_memory_chunks_fts) AS rank
         FROM interview_memory_chunks_fts
         JOIN interview_memory_chunks c ON c.rowid = interview_memory_chunks_fts.rowid
         WHERE interview_memory_chunks_fts MATCH ?
           AND interview_memory_chunks_fts.session_id = ?
         ORDER BY rank ASC
         LIMIT ?`
      )
      .all(ftsQuery, sessionId, limit) as Array<
      InterviewMemoryChunkRow & { rank: number }
    >

    return rows.map((row) => {
      const normalizedRank = Number.isFinite(row.rank) ? Math.max(0, row.rank) : 999
      const textScore = 1 / (1 + normalizedRank)
      return {
        ...this.toChunk(row),
        rank: normalizedRank,
        textScore,
      }
    })
  }

  deleteBySessionId(sessionId: string): number {
    return this.db
      .prepare('DELETE FROM interview_memory_chunks WHERE session_id = ?')
      .run(sessionId).changes
  }

  private buildFtsQuery(raw: string): string | null {
    const tokens = this.extractSearchTokens(raw)
    if (!tokens || tokens.length === 0) return null
    return tokens.map((token) => `"${token.replaceAll('"', '')}"`).join(' OR ')
  }

  private extractSearchTokens(raw: string): string[] {
    const words =
      raw
        .match(/[A-Za-z0-9_]+/g)
        ?.map((token) => token.trim().toLowerCase())
        .filter(Boolean) ?? []

    const cjkRuns = raw.match(/[\p{Script=Han}]{2,}/gu) ?? []
    const cjkTokens: string[] = []
    for (const run of cjkRuns) {
      const chars = Array.from(run)
      if (chars.length <= 2) {
        cjkTokens.push(run)
        continue
      }
      for (let i = 0; i < chars.length - 1; i += 1) {
        cjkTokens.push(`${chars[i]}${chars[i + 1]}`)
      }
    }

    return Array.from(new Set([...words, ...cjkTokens]))
  }

  private toChunk(row: InterviewMemoryChunkRow): InterviewMemoryChunk {
    return {
      id: row.id,
      sessionId: row.session_id,
      source: row.source,
      role: row.role,
      timestamp: row.timestamp,
      text: row.text,
      createdAt: row.created_at,
    }
  }
}
