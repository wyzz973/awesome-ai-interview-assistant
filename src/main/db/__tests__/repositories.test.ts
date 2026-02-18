import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { up as migration001 } from '../migrations/001_initial'
import { SessionRepo } from '../repositories/SessionRepo'
import { TranscriptRepo } from '../repositories/TranscriptRepo'
import { ScreenshotQARepo } from '../repositories/ScreenshotQARepo'
import { ReviewRepo } from '../repositories/ReviewRepo'

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  migration001(db)
  return db
}

describe('SessionRepo', () => {
  let db: Database.Database
  let repo: SessionRepo

  beforeEach(() => {
    db = createTestDb()
    repo = new SessionRepo(db)
  })

  afterEach(() => {
    db.close()
  })

  it('should create a session', () => {
    const session = repo.create({
      company: 'Google',
      position: 'SRE',
      startTime: Date.now(),
      status: 'recording',
    })

    expect(session.id).toBeDefined()
    expect(session.company).toBe('Google')
    expect(session.position).toBe('SRE')
    expect(session.status).toBe('recording')
  })

  it('should get a session by id', () => {
    const created = repo.create({
      company: 'Meta',
      position: 'Frontend',
      startTime: Date.now(),
      status: 'recording',
    })

    const found = repo.getById(created.id)
    expect(found).not.toBeNull()
    expect(found!.company).toBe('Meta')
  })

  it('should update session status', () => {
    const session = repo.create({
      company: 'Apple',
      position: 'iOS',
      startTime: Date.now(),
      status: 'recording',
    })

    const endTime = Date.now() + 3600000
    const updated = repo.update(session.id, {
      status: 'completed',
      endTime,
      duration: 3600,
    })

    expect(updated!.status).toBe('completed')
    expect(updated!.endTime).toBe(endTime)
    expect(updated!.duration).toBe(3600)
  })

  it('should list sessions with pagination', () => {
    for (let i = 0; i < 5; i++) {
      repo.create({
        company: `Company${i}`,
        position: 'Dev',
        startTime: Date.now() + i,
        status: 'completed',
      })
    }

    const { sessions, total } = repo.list({ limit: 2, offset: 0 })
    expect(total).toBe(5)
    expect(sessions).toHaveLength(2)

    const { sessions: page2 } = repo.list({ limit: 2, offset: 2 })
    expect(page2).toHaveLength(2)
  })

  it('should filter sessions by company', () => {
    repo.create({ company: 'Google', position: 'SRE', startTime: Date.now(), status: 'completed' })
    repo.create({ company: 'Meta', position: 'FE', startTime: Date.now(), status: 'completed' })
    repo.create({ company: 'Google Cloud', position: 'BE', startTime: Date.now(), status: 'completed' })

    const { sessions, total } = repo.list({ company: 'Google' })
    expect(total).toBe(2)
    expect(sessions.every((s) => s.company.includes('Google'))).toBe(true)
  })

  it('should delete a session and cascade', () => {
    const session = repo.create({
      company: 'Test',
      position: 'Test',
      startTime: Date.now(),
      status: 'recording',
    })

    // 添加关联数据
    const transcriptRepo = new TranscriptRepo(db)
    transcriptRepo.create({
      sessionId: session.id,
      timestamp: Date.now(),
      speaker: 'interviewer',
      text: 'Hello',
      isFinal: true,
    })

    const screenshotRepo = new ScreenshotQARepo(db)
    screenshotRepo.create({
      sessionId: session.id,
      timestamp: Date.now(),
      imagePath: '/tmp/test.png',
      question: 'What is this?',
      answer: 'A test',
      model: 'gpt-4o',
    })

    // 删除 session，关联数据应级联删除
    const deleted = repo.delete(session.id)
    expect(deleted).toBe(true)
    expect(repo.getById(session.id)).toBeNull()
    expect(transcriptRepo.getBySessionId(session.id)).toHaveLength(0)
    expect(screenshotRepo.getBySessionId(session.id)).toHaveLength(0)
  })
})

describe('TranscriptRepo', () => {
  let db: Database.Database
  let sessionRepo: SessionRepo
  let repo: TranscriptRepo
  let sessionId: string

  beforeEach(() => {
    db = createTestDb()
    sessionRepo = new SessionRepo(db)
    repo = new TranscriptRepo(db)
    const session = sessionRepo.create({
      company: 'Test',
      position: 'Test',
      startTime: Date.now(),
      status: 'recording',
    })
    sessionId = session.id
  })

  afterEach(() => {
    db.close()
  })

  it('should create a transcript entry', () => {
    const entry = repo.create({
      sessionId,
      timestamp: Date.now(),
      speaker: 'interviewer',
      text: 'Tell me about yourself',
      isFinal: true,
    })

    expect(entry.id).toBeDefined()
    expect(entry.speaker).toBe('interviewer')
    expect(entry.text).toBe('Tell me about yourself')
  })

  it('should batch insert transcript entries', () => {
    const now = Date.now()
    const entries = repo.batchCreate([
      { sessionId, timestamp: now, speaker: 'interviewer', text: 'Q1', isFinal: true },
      { sessionId, timestamp: now + 1000, speaker: 'me', text: 'A1', isFinal: true },
      { sessionId, timestamp: now + 2000, speaker: 'interviewer', text: 'Q2', isFinal: false },
    ])

    expect(entries).toHaveLength(3)
    expect(entries[0].text).toBe('Q1')
    expect(entries[2].isFinal).toBe(false)
  })

  it('should get entries by sessionId ordered by timestamp', () => {
    const now = Date.now()
    repo.create({ sessionId, timestamp: now + 2000, speaker: 'me', text: 'Second', isFinal: true })
    repo.create({ sessionId, timestamp: now, speaker: 'interviewer', text: 'First', isFinal: true })
    repo.create({ sessionId, timestamp: now + 1000, speaker: 'me', text: 'Middle', isFinal: true })

    const entries = repo.getBySessionId(sessionId)
    expect(entries).toHaveLength(3)
    expect(entries[0].text).toBe('First')
    expect(entries[1].text).toBe('Middle')
    expect(entries[2].text).toBe('Second')
  })
})

describe('ScreenshotQARepo', () => {
  let db: Database.Database
  let sessionRepo: SessionRepo
  let repo: ScreenshotQARepo
  let sessionId: string

  beforeEach(() => {
    db = createTestDb()
    sessionRepo = new SessionRepo(db)
    repo = new ScreenshotQARepo(db)
    const session = sessionRepo.create({
      company: 'Test',
      position: 'Test',
      startTime: Date.now(),
      status: 'recording',
    })
    sessionId = session.id
  })

  afterEach(() => {
    db.close()
  })

  it('should create a screenshot QA', () => {
    const qa = repo.create({
      sessionId,
      timestamp: Date.now(),
      imagePath: '/screenshots/test.png',
      question: 'Implement a binary search',
      answer: 'Here is the solution...',
      model: 'gpt-4o',
    })

    expect(qa.id).toBeDefined()
    expect(qa.question).toBe('Implement a binary search')
  })

  it('should get QAs by sessionId', () => {
    repo.create({ sessionId, timestamp: Date.now(), imagePath: '/s1.png', question: 'Q1', answer: 'A1', model: 'gpt-4o' })
    repo.create({ sessionId, timestamp: Date.now() + 1000, imagePath: '/s2.png', question: 'Q2', answer: 'A2', model: 'gpt-4o' })

    const qas = repo.getBySessionId(sessionId)
    expect(qas).toHaveLength(2)
  })

  it('should update answer', () => {
    const qa = repo.create({
      sessionId,
      timestamp: Date.now(),
      imagePath: '/s.png',
      question: 'Q',
      answer: 'old',
      model: 'gpt-4o',
    })

    const updated = repo.update(qa.id, { answer: 'new answer' })
    expect(updated!.answer).toBe('new answer')
  })
})

describe('ReviewRepo', () => {
  let db: Database.Database
  let sessionRepo: SessionRepo
  let repo: ReviewRepo
  let sessionId: string

  beforeEach(() => {
    db = createTestDb()
    sessionRepo = new SessionRepo(db)
    repo = new ReviewRepo(db)
    const session = sessionRepo.create({
      company: 'Test',
      position: 'Test',
      startTime: Date.now(),
      status: 'completed',
    })
    sessionId = session.id
  })

  afterEach(() => {
    db.close()
  })

  it('should create a review report', () => {
    const report = repo.create({
      sessionId,
      generatedAt: Date.now(),
      summary: 'Good interview',
      questions: ['Q1', 'Q2'],
      performance: { strengths: ['algo'], weaknesses: ['system design'] },
      suggestions: ['Practice more'],
      keyTopics: ['binary search', 'system design'],
    })

    expect(report.id).toBeDefined()
    expect(report.summary).toBe('Good interview')
    expect(report.questions).toEqual(['Q1', 'Q2'])
    expect(report.performance.strengths).toEqual(['algo'])
  })

  it('should get report by sessionId', () => {
    repo.create({
      sessionId,
      generatedAt: Date.now(),
      summary: 'Summary',
      questions: [],
      performance: { strengths: [], weaknesses: [] },
      suggestions: [],
      keyTopics: [],
    })

    const found = repo.getBySessionId(sessionId)
    expect(found).not.toBeNull()
    expect(found!.sessionId).toBe(sessionId)
  })

  it('should update a review report', () => {
    const report = repo.create({
      sessionId,
      generatedAt: Date.now(),
      summary: 'Old',
      questions: [],
      performance: { strengths: [], weaknesses: [] },
      suggestions: [],
      keyTopics: [],
    })

    const updated = repo.update(report.id, {
      generatedAt: Date.now(),
      summary: 'Updated summary',
      questions: ['New Q'],
      performance: { strengths: ['new strength'], weaknesses: [] },
      suggestions: ['new suggestion'],
      keyTopics: ['new topic'],
    })

    expect(updated!.summary).toBe('Updated summary')
    expect(updated!.questions).toEqual(['New Q'])
  })

  it('should cascade delete with session', () => {
    repo.create({
      sessionId,
      generatedAt: Date.now(),
      summary: 'Test',
      questions: [],
      performance: { strengths: [], weaknesses: [] },
      suggestions: [],
      keyTopics: [],
    })

    sessionRepo.delete(sessionId)
    expect(repo.getBySessionId(sessionId)).toBeNull()
  })
})
