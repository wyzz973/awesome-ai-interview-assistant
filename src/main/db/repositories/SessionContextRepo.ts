import type Database from 'better-sqlite3'

export interface SessionContextRecord {
  sessionId: string
  round: string
  backgroundNote: string
  resumeFileName: string
  resumeFilePath: string
  resumeText: string
  createdAt: number
  updatedAt: number
}

interface SessionContextRow {
  session_id: string
  round: string
  background_note: string
  resume_file_name: string
  resume_file_path: string
  resume_text: string
  created_at: number
  updated_at: number
}

export class SessionContextRepo {
  constructor(private db: Database.Database) {}

  upsert(data: {
    sessionId: string
    round?: string
    backgroundNote?: string
    resumeFileName?: string
    resumeFilePath?: string
    resumeText?: string
  }): SessionContextRecord {
    const now = Date.now()
    const existing = this.getBySessionId(data.sessionId)

    const next: SessionContextRecord = {
      sessionId: data.sessionId,
      round: data.round ?? existing?.round ?? '',
      backgroundNote: data.backgroundNote ?? existing?.backgroundNote ?? '',
      resumeFileName: data.resumeFileName ?? existing?.resumeFileName ?? '',
      resumeFilePath: data.resumeFilePath ?? existing?.resumeFilePath ?? '',
      resumeText: data.resumeText ?? existing?.resumeText ?? '',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    this.db
      .prepare(
        `INSERT INTO session_contexts (
          session_id, round, background_note, resume_file_name, resume_file_path, resume_text, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          round = excluded.round,
          background_note = excluded.background_note,
          resume_file_name = excluded.resume_file_name,
          resume_file_path = excluded.resume_file_path,
          resume_text = excluded.resume_text,
          updated_at = excluded.updated_at`
      )
      .run(
        next.sessionId,
        next.round,
        next.backgroundNote,
        next.resumeFileName,
        next.resumeFilePath,
        next.resumeText,
        next.createdAt,
        next.updatedAt,
      )

    return next
  }

  getBySessionId(sessionId: string): SessionContextRecord | null {
    const row = this.db
      .prepare('SELECT * FROM session_contexts WHERE session_id = ?')
      .get(sessionId) as SessionContextRow | undefined
    return row ? this.toRecord(row) : null
  }

  deleteBySessionId(sessionId: string): number {
    return this.db
      .prepare('DELETE FROM session_contexts WHERE session_id = ?')
      .run(sessionId).changes
  }

  private toRecord(row: SessionContextRow): SessionContextRecord {
    return {
      sessionId: row.session_id,
      round: row.round,
      backgroundNote: row.background_note,
      resumeFileName: row.resume_file_name,
      resumeFilePath: row.resume_file_path,
      resumeText: row.resume_text,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}

