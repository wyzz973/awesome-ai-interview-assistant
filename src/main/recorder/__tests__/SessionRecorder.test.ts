import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { SessionWorkerHandler } from '../../../workers/sessionWorker'
import type {
  WorkerStartMessage,
  WorkerTranscriptMessage,
  WorkerScreenshotQAMessage,
  WorkerStopMessage
} from '../../../workers/sessionWorker'

// Test the handler directly (no actual Worker thread needed)
function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      company TEXT NOT NULL DEFAULT '',
      position TEXT NOT NULL DEFAULT '',
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL DEFAULT 0,
      duration INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'recording'
    )
  `)
  db.exec(`
    CREATE TABLE transcript_entries (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      speaker TEXT NOT NULL,
      text TEXT NOT NULL,
      is_final INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `)
  db.exec(`
    CREATE TABLE screenshot_qas (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      image_path TEXT NOT NULL,
      question TEXT NOT NULL DEFAULT '',
      answer TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `)
  return db
}

// For handler tests, we need the handler to use our test DB.
// Since the handler creates its own DB from dbPath, we'll test via a temp file.
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdirSync, rmSync, existsSync } from 'fs'

describe('SessionWorkerHandler', () => {
  let testDir: string
  let dbPath: string

  beforeEach(() => {
    testDir = join(tmpdir(), `session-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(testDir, { recursive: true })
    dbPath = join(testDir, 'test.db')

    // Pre-create the DB with schema so the handler can use it
    const db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    db.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        company TEXT NOT NULL DEFAULT '',
        position TEXT NOT NULL DEFAULT '',
        start_time INTEGER NOT NULL,
        end_time INTEGER NOT NULL DEFAULT 0,
        duration INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'recording'
      )
    `)
    db.exec(`
      CREATE TABLE transcript_entries (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        speaker TEXT NOT NULL,
        text TEXT NOT NULL,
        is_final INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `)
    db.exec(`
      CREATE TABLE screenshot_qas (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        image_path TEXT NOT NULL,
        question TEXT NOT NULL DEFAULT '',
        answer TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `)
    db.close()
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe('start', () => {
    it('should create a session and return sessionId', () => {
      const handler = new SessionWorkerHandler()
      const startMsg: WorkerStartMessage = {
        type: 'start',
        dbPath,
        company: 'TestCorp',
        position: 'Frontend'
      }

      const response = handler.handleMessage(startMsg)

      expect(response).not.toBeNull()
      expect(response!.type).toBe('started')
      expect(response!.sessionId).toBeDefined()
      expect(typeof response!.sessionId).toBe('string')
    })

    it('should insert session into database', () => {
      const handler = new SessionWorkerHandler()
      handler.handleMessage({
        type: 'start',
        dbPath,
        company: 'TestCorp',
        position: 'Backend'
      })

      const db = handler.getDatabase()!
      const session = db.prepare('SELECT * FROM sessions').get() as Record<string, unknown>
      expect(session).toBeDefined()
      expect(session.company).toBe('TestCorp')
      expect(session.position).toBe('Backend')
      expect(session.status).toBe('recording')
    })
  })

  describe('transcript', () => {
    it('should record transcript entries', () => {
      const handler = new SessionWorkerHandler()
      handler.handleMessage({ type: 'start', dbPath, company: '', position: '' })

      const msg: WorkerTranscriptMessage = {
        type: 'transcript',
        speaker: 'interviewer',
        text: 'Tell me about yourself',
        timestamp: 1000,
        isFinal: true
      }

      handler.handleMessage(msg)

      const db = handler.getDatabase()!
      const entries = db.prepare('SELECT * FROM transcript_entries').all() as Record<string, unknown>[]
      expect(entries).toHaveLength(1)
      expect(entries[0].speaker).toBe('interviewer')
      expect(entries[0].text).toBe('Tell me about yourself')
      expect(entries[0].is_final).toBe(1)
    })

    it('should record multiple transcripts', () => {
      const handler = new SessionWorkerHandler()
      handler.handleMessage({ type: 'start', dbPath, company: '', position: '' })

      handler.handleMessage({
        type: 'transcript',
        speaker: 'interviewer',
        text: 'Q1',
        timestamp: 1000,
        isFinal: true
      })
      handler.handleMessage({
        type: 'transcript',
        speaker: 'me',
        text: 'A1',
        timestamp: 2000,
        isFinal: true
      })

      const db = handler.getDatabase()!
      const entries = db.prepare('SELECT * FROM transcript_entries ORDER BY timestamp').all() as Record<string, unknown>[]
      expect(entries).toHaveLength(2)
      expect(entries[0].speaker).toBe('interviewer')
      expect(entries[1].speaker).toBe('me')
    })

    it('should ignore transcript if no session started', () => {
      const handler = new SessionWorkerHandler()
      // No start message sent
      const result = handler.handleMessage({
        type: 'transcript',
        speaker: 'me',
        text: 'test',
        timestamp: 1000,
        isFinal: true
      })
      expect(result).toBeNull()
    })
  })

  describe('screenshotQA', () => {
    it('should record screenshot QA entries', () => {
      const handler = new SessionWorkerHandler()
      handler.handleMessage({ type: 'start', dbPath, company: '', position: '' })

      const msg: WorkerScreenshotQAMessage = {
        type: 'screenshotQA',
        timestamp: 1000,
        imagePath: '/screenshots/001.png',
        question: 'What is this code?',
        answer: 'This is a React component',
        model: 'gpt-4'
      }

      handler.handleMessage(msg)

      const db = handler.getDatabase()!
      const entries = db.prepare('SELECT * FROM screenshot_qas').all() as Record<string, unknown>[]
      expect(entries).toHaveLength(1)
      expect(entries[0].image_path).toBe('/screenshots/001.png')
      expect(entries[0].question).toBe('What is this code?')
      expect(entries[0].answer).toBe('This is a React component')
      expect(entries[0].model).toBe('gpt-4')
    })
  })

  describe('stop', () => {
    it('should update session status to completed', () => {
      const handler = new SessionWorkerHandler()
      handler.handleMessage({ type: 'start', dbPath, company: '', position: '' })
      const sessionId = handler.getSessionId()

      const response = handler.handleMessage({ type: 'stop' })

      expect(response).not.toBeNull()
      expect(response!.type).toBe('stopped')
      expect(response!.sessionId).toBe(sessionId)

      // Verify in DB — need to reopen since handler closed it
      const db = new Database(dbPath)
      const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId!) as Record<string, unknown>
      expect(session.status).toBe('completed')
      expect(session.end_time).toBeGreaterThan(0)
      expect(session.duration).toBeGreaterThanOrEqual(0)
      db.close()
    })

    it('should return error if no session active', () => {
      const handler = new SessionWorkerHandler()
      const response = handler.handleMessage({ type: 'stop' })
      expect(response).not.toBeNull()
      expect(response!.type).toBe('error')
    })

    it('should clean up handler state after stop', () => {
      const handler = new SessionWorkerHandler()
      handler.handleMessage({ type: 'start', dbPath, company: '', position: '' })
      handler.handleMessage({ type: 'stop' })

      expect(handler.getSessionId()).toBeNull()
      expect(handler.getDatabase()).toBeNull()
    })
  })

  describe('data persistence (crash safety)', () => {
    it('should persist data immediately on each write', () => {
      const handler = new SessionWorkerHandler()
      handler.handleMessage({ type: 'start', dbPath, company: 'ACME', position: 'Dev' })
      const sessionId = handler.getSessionId()!

      handler.handleMessage({
        type: 'transcript',
        speaker: 'interviewer',
        text: 'Hi',
        timestamp: 1000,
        isFinal: true
      })

      // Simulate crash: read directly from another connection
      const checkDb = new Database(dbPath)
      const session = checkDb.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as Record<string, unknown>
      expect(session).toBeDefined()
      expect(session.company).toBe('ACME')

      const entries = checkDb.prepare('SELECT * FROM transcript_entries WHERE session_id = ?').all(sessionId)
      expect(entries).toHaveLength(1)
      checkDb.close()
    })
  })
})

describe('SessionRecorder', () => {
  // Test the public API surface (using mocks since we can't easily spawn workers in tests)
  it('should export from correct path', async () => {
    const { SessionRecorder } = await import('../../recorder/SessionRecorder')
    expect(SessionRecorder).toBeDefined()
    expect(typeof SessionRecorder).toBe('function')
  })

  it('should have correct API surface', async () => {
    const { SessionRecorder } = await import('../../recorder/SessionRecorder')
    const recorder = new SessionRecorder('/tmp/test.db')

    expect(typeof recorder.startSession).toBe('function')
    expect(typeof recorder.recordTranscript).toBe('function')
    expect(typeof recorder.recordScreenshotQA).toBe('function')
    expect(typeof recorder.stopSession).toBe('function')
    expect(typeof recorder.isRecording).toBe('function')
    expect(typeof recorder.getSessionId).toBe('function')
  })

  it('should start as not recording', async () => {
    const { SessionRecorder } = await import('../../recorder/SessionRecorder')
    const recorder = new SessionRecorder('/tmp/test.db')
    expect(recorder.isRecording()).toBe(false)
    expect(recorder.getSessionId()).toBeNull()
  })
})
