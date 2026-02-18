/**
 * SessionRecorder Worker 线程
 *
 * 独立 Worker Thread，负责将会话数据实时写入 SQLite。
 * 主进程通过 postMessage 发送消息，Worker 收到后写入数据库。
 *
 * 消息协议:
 * - { type: 'start', dbPath: string, company: string, position: string } → 创建会话
 * - { type: 'transcript', speaker, text, timestamp, isFinal } → 记录转写
 * - { type: 'screenshotQA', timestamp, imagePath, question, answer, model } → 记录截屏问答
 * - { type: 'stop' } → 停止会话，更新状态
 */

import { parentPort, workerData } from 'worker_threads'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

export interface WorkerStartMessage {
  type: 'start'
  dbPath: string
  company: string
  position: string
}

export interface WorkerTranscriptMessage {
  type: 'transcript'
  speaker: 'interviewer' | 'me'
  text: string
  timestamp: number
  isFinal: boolean
}

export interface WorkerScreenshotQAMessage {
  type: 'screenshotQA'
  timestamp: number
  imagePath: string
  question: string
  answer: string
  model: string
}

export interface WorkerStopMessage {
  type: 'stop'
}

export type WorkerMessage =
  | WorkerStartMessage
  | WorkerTranscriptMessage
  | WorkerScreenshotQAMessage
  | WorkerStopMessage

export interface WorkerResponse {
  type: 'started' | 'stopped' | 'error'
  sessionId?: string
  error?: string
}

/**
 * 消息处理器（可独立测试）
 */
export class SessionWorkerHandler {
  private db: Database.Database | null = null
  private sessionId: string | null = null

  handleMessage(msg: WorkerMessage): WorkerResponse | null {
    switch (msg.type) {
      case 'start':
        return this.handleStart(msg)
      case 'transcript':
        this.handleTranscript(msg)
        return null
      case 'screenshotQA':
        this.handleScreenshotQA(msg)
        return null
      case 'stop':
        return this.handleStop()
      default:
        return null
    }
  }

  private handleStart(msg: WorkerStartMessage): WorkerResponse {
    try {
      this.db = new Database(msg.dbPath)
      this.db.pragma('journal_mode = WAL')
      this.db.pragma('foreign_keys = ON')

      this.sessionId = randomUUID()
      const startTime = Date.now()

      this.db
        .prepare(
          `INSERT INTO sessions (id, company, position, start_time, end_time, duration, status)
           VALUES (?, ?, ?, ?, 0, 0, 'recording')`
        )
        .run(this.sessionId, msg.company, msg.position, startTime)

      return { type: 'started', sessionId: this.sessionId }
    } catch (err) {
      return {
        type: 'error',
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }

  private handleTranscript(msg: WorkerTranscriptMessage): void {
    if (!this.db || !this.sessionId) return

    try {
      const id = randomUUID()
      this.db
        .prepare(
          `INSERT INTO transcript_entries (id, session_id, timestamp, speaker, text, is_final)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(id, this.sessionId, msg.timestamp, msg.speaker, msg.text, msg.isFinal ? 1 : 0)
    } catch {
      // Log but don't crash on individual write failures
    }
  }

  private handleScreenshotQA(msg: WorkerScreenshotQAMessage): void {
    if (!this.db || !this.sessionId) return

    try {
      const id = randomUUID()
      this.db
        .prepare(
          `INSERT INTO screenshot_qas (id, session_id, timestamp, image_path, question, answer, model)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id, this.sessionId, msg.timestamp, msg.imagePath, msg.question, msg.answer, msg.model)
    } catch {
      // Log but don't crash on individual write failures
    }
  }

  private handleStop(): WorkerResponse {
    if (!this.db || !this.sessionId) {
      return { type: 'error', error: 'No active session' }
    }

    try {
      const endTime = Date.now()
      const session = this.db
        .prepare('SELECT start_time FROM sessions WHERE id = ?')
        .get(this.sessionId) as { start_time: number } | undefined

      const duration = session ? endTime - session.start_time : 0

      this.db
        .prepare(
          `UPDATE sessions SET end_time = ?, duration = ?, status = 'completed' WHERE id = ?`
        )
        .run(endTime, duration, this.sessionId)

      const sessionId = this.sessionId
      this.sessionId = null
      this.db.close()
      this.db = null

      return { type: 'stopped', sessionId }
    } catch (err) {
      return {
        type: 'error',
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }

  /** 用于测试：获取当前 session ID */
  getSessionId(): string | null {
    return this.sessionId
  }

  /** 用于测试：获取数据库实例 */
  getDatabase(): Database.Database | null {
    return this.db
  }
}

// Worker 线程入口：仅在作为 Worker 运行时执行
if (parentPort) {
  const handler = new SessionWorkerHandler()

  parentPort.on('message', (msg: WorkerMessage) => {
    const response = handler.handleMessage(msg)
    if (response && parentPort) {
      parentPort.postMessage(response)
    }
  })
}
