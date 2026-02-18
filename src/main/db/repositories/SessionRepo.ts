import type Database from 'better-sqlite3'
import type { Session } from '@shared/types/session'
import { randomUUID } from 'crypto'

export interface SessionListOptions {
  company?: string
  status?: Session['status']
  offset?: number
  limit?: number
}

export class SessionRepo {
  constructor(private db: Database.Database) {}

  create(data: Omit<Session, 'id' | 'endTime' | 'duration'>): Session {
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO sessions (id, company, position, start_time, end_time, duration, status)
         VALUES (?, ?, ?, ?, 0, 0, ?)`
      )
      .run(id, data.company, data.position, data.startTime, data.status)

    return this.getById(id)!
  }

  getById(id: string): Session | null {
    const row = this.db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(id) as SessionRow | undefined

    return row ? this.toSession(row) : null
  }

  list(options: SessionListOptions = {}): { sessions: Session[]; total: number } {
    const { company, status, offset = 0, limit = 20 } = options
    const conditions: string[] = []
    const params: unknown[] = []

    if (company) {
      conditions.push('company LIKE ?')
      params.push(`%${company}%`)
    }
    if (status) {
      conditions.push('status = ?')
      params.push(status)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const total = (
      this.db
        .prepare(`SELECT COUNT(*) as count FROM sessions ${where}`)
        .get(...params) as { count: number }
    ).count

    const rows = this.db
      .prepare(
        `SELECT * FROM sessions ${where} ORDER BY start_time DESC LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as SessionRow[]

    return { sessions: rows.map((r) => this.toSession(r)), total }
  }

  update(id: string, data: Partial<Pick<Session, 'company' | 'position' | 'endTime' | 'duration' | 'status'>>): Session | null {
    const fields: string[] = []
    const params: unknown[] = []

    if (data.company !== undefined) {
      fields.push('company = ?')
      params.push(data.company)
    }
    if (data.position !== undefined) {
      fields.push('position = ?')
      params.push(data.position)
    }
    if (data.endTime !== undefined) {
      fields.push('end_time = ?')
      params.push(data.endTime)
    }
    if (data.duration !== undefined) {
      fields.push('duration = ?')
      params.push(data.duration)
    }
    if (data.status !== undefined) {
      fields.push('status = ?')
      params.push(data.status)
    }

    if (fields.length === 0) return this.getById(id)

    params.push(id)
    this.db
      .prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`)
      .run(...params)

    return this.getById(id)
  }

  delete(id: string): boolean {
    const result = this.db
      .prepare('DELETE FROM sessions WHERE id = ?')
      .run(id)
    return result.changes > 0
  }

  private toSession(row: SessionRow): Session {
    return {
      id: row.id,
      company: row.company,
      position: row.position,
      startTime: row.start_time,
      endTime: row.end_time,
      duration: row.duration,
      status: row.status as Session['status'],
    }
  }
}

interface SessionRow {
  id: string
  company: string
  position: string
  start_time: number
  end_time: number
  duration: number
  status: string
}
