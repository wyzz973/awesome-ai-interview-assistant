import type Database from 'better-sqlite3'
import type { ScreenshotQA } from '@shared/types/session'
import { randomUUID } from 'crypto'

export class ScreenshotQARepo {
  constructor(private db: Database.Database) {}

  create(data: Omit<ScreenshotQA, 'id'>): ScreenshotQA {
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO screenshot_qas (id, session_id, timestamp, image_path, question, answer, model)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, data.sessionId, data.timestamp, data.imagePath, data.question, data.answer, data.model)

    return { id, ...data }
  }

  getBySessionId(sessionId: string): ScreenshotQA[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM screenshot_qas WHERE session_id = ? ORDER BY timestamp ASC'
      )
      .all(sessionId) as ScreenshotQARow[]

    return rows.map((r) => this.toScreenshotQA(r))
  }

  getById(id: string): ScreenshotQA | null {
    const row = this.db
      .prepare('SELECT * FROM screenshot_qas WHERE id = ?')
      .get(id) as ScreenshotQARow | undefined

    return row ? this.toScreenshotQA(row) : null
  }

  update(id: string, data: Partial<Pick<ScreenshotQA, 'answer' | 'question'>>): ScreenshotQA | null {
    const fields: string[] = []
    const params: unknown[] = []

    if (data.answer !== undefined) {
      fields.push('answer = ?')
      params.push(data.answer)
    }
    if (data.question !== undefined) {
      fields.push('question = ?')
      params.push(data.question)
    }

    if (fields.length === 0) return this.getById(id)

    params.push(id)
    this.db
      .prepare(`UPDATE screenshot_qas SET ${fields.join(', ')} WHERE id = ?`)
      .run(...params)

    return this.getById(id)
  }

  deleteBySessionId(sessionId: string): number {
    const result = this.db
      .prepare('DELETE FROM screenshot_qas WHERE session_id = ?')
      .run(sessionId)
    return result.changes
  }

  private toScreenshotQA(row: ScreenshotQARow): ScreenshotQA {
    return {
      id: row.id,
      sessionId: row.session_id,
      timestamp: row.timestamp,
      imagePath: row.image_path,
      question: row.question,
      answer: row.answer,
      model: row.model,
    }
  }
}

interface ScreenshotQARow {
  id: string
  session_id: string
  timestamp: number
  image_path: string
  question: string
  answer: string
  model: string
}
