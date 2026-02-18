import type Database from 'better-sqlite3'
import type { ReviewReport } from '@shared/types/session'
import { randomUUID } from 'crypto'

export class ReviewRepo {
  constructor(private db: Database.Database) {}

  create(data: Omit<ReviewReport, 'id'>): ReviewReport {
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO review_reports (id, session_id, generated_at, summary, questions, performance, suggestions, key_topics)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        data.sessionId,
        data.generatedAt,
        data.summary,
        JSON.stringify(data.questions),
        JSON.stringify(data.performance),
        JSON.stringify(data.suggestions),
        JSON.stringify(data.keyTopics)
      )

    return { id, ...data }
  }

  getBySessionId(sessionId: string): ReviewReport | null {
    const row = this.db
      .prepare('SELECT * FROM review_reports WHERE session_id = ?')
      .get(sessionId) as ReviewReportRow | undefined

    return row ? this.toReviewReport(row) : null
  }

  getById(id: string): ReviewReport | null {
    const row = this.db
      .prepare('SELECT * FROM review_reports WHERE id = ?')
      .get(id) as ReviewReportRow | undefined

    return row ? this.toReviewReport(row) : null
  }

  update(id: string, data: Omit<ReviewReport, 'id' | 'sessionId'>): ReviewReport | null {
    this.db
      .prepare(
        `UPDATE review_reports
         SET generated_at = ?, summary = ?, questions = ?, performance = ?, suggestions = ?, key_topics = ?
         WHERE id = ?`
      )
      .run(
        data.generatedAt,
        data.summary,
        JSON.stringify(data.questions),
        JSON.stringify(data.performance),
        JSON.stringify(data.suggestions),
        JSON.stringify(data.keyTopics),
        id
      )

    return this.getById(id)
  }

  deleteBySessionId(sessionId: string): boolean {
    const result = this.db
      .prepare('DELETE FROM review_reports WHERE session_id = ?')
      .run(sessionId)
    return result.changes > 0
  }

  private toReviewReport(row: ReviewReportRow): ReviewReport {
    return {
      id: row.id,
      sessionId: row.session_id,
      generatedAt: row.generated_at,
      summary: row.summary,
      questions: JSON.parse(row.questions),
      performance: JSON.parse(row.performance),
      suggestions: JSON.parse(row.suggestions),
      keyTopics: JSON.parse(row.key_topics),
    }
  }
}

interface ReviewReportRow {
  id: string
  session_id: string
  generated_at: number
  summary: string
  questions: string
  performance: string
  suggestions: string
  key_topics: string
}
