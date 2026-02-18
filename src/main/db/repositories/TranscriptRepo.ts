import type Database from 'better-sqlite3'
import type { TranscriptEntry } from '@shared/types/session'
import { randomUUID } from 'crypto'

export class TranscriptRepo {
  constructor(private db: Database.Database) {}

  create(data: Omit<TranscriptEntry, 'id'>): TranscriptEntry {
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO transcript_entries (id, session_id, timestamp, speaker, text, is_final)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, data.sessionId, data.timestamp, data.speaker, data.text, data.isFinal ? 1 : 0)

    return { id, ...data }
  }

  batchCreate(entries: Omit<TranscriptEntry, 'id'>[]): TranscriptEntry[] {
    const insert = this.db.prepare(
      `INSERT INTO transcript_entries (id, session_id, timestamp, speaker, text, is_final)
       VALUES (?, ?, ?, ?, ?, ?)`
    )

    const results: TranscriptEntry[] = []
    const batchInsert = this.db.transaction((items: Omit<TranscriptEntry, 'id'>[]) => {
      for (const entry of items) {
        const id = randomUUID()
        insert.run(id, entry.sessionId, entry.timestamp, entry.speaker, entry.text, entry.isFinal ? 1 : 0)
        results.push({ id, ...entry })
      }
    })

    batchInsert(entries)
    return results
  }

  getBySessionId(sessionId: string): TranscriptEntry[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM transcript_entries WHERE session_id = ? ORDER BY timestamp ASC'
      )
      .all(sessionId) as TranscriptRow[]

    return rows.map((r) => this.toEntry(r))
  }

  getById(id: string): TranscriptEntry | null {
    const row = this.db
      .prepare('SELECT * FROM transcript_entries WHERE id = ?')
      .get(id) as TranscriptRow | undefined

    return row ? this.toEntry(row) : null
  }

  deleteBySessionId(sessionId: string): number {
    const result = this.db
      .prepare('DELETE FROM transcript_entries WHERE session_id = ?')
      .run(sessionId)
    return result.changes
  }

  private toEntry(row: TranscriptRow): TranscriptEntry {
    return {
      id: row.id,
      sessionId: row.session_id,
      timestamp: row.timestamp,
      speaker: row.speaker as TranscriptEntry['speaker'],
      text: row.text,
      isFinal: row.is_final === 1,
    }
  }
}

interface TranscriptRow {
  id: string
  session_id: string
  timestamp: number
  speaker: string
  text: string
  is_final: number
}
