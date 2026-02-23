import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { up as migration001 } from '@main/db/migrations/001_initial'
import { up as migration002 } from '@main/db/migrations/002_interview_memory'
import { SessionRepo } from '@main/db/repositories/SessionRepo'
import { SessionContextRepo } from '@main/db/repositories/SessionContextRepo'
import { InterviewMemoryRepo } from '@main/db/repositories/InterviewMemoryRepo'
import { InterviewMemoryService } from '@main/services/InterviewMemoryService'

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  migration001(db)
  migration002(db)
  return db
}

describe('InterviewMemoryService', () => {
  let db: Database.Database
  let sessionRepo: SessionRepo
  let contextRepo: SessionContextRepo
  let memoryRepo: InterviewMemoryRepo
  let service: InterviewMemoryService
  let sessionId: string

  beforeEach(() => {
    db = createTestDb()
    sessionRepo = new SessionRepo(db)
    contextRepo = new SessionContextRepo(db)
    memoryRepo = new InterviewMemoryRepo(db)
    service = new InterviewMemoryService(contextRepo, memoryRepo)

    const session = sessionRepo.create({
      company: 'OpenAI',
      position: 'Backend Engineer',
      startTime: Date.now(),
      status: 'recording',
    })
    sessionId = session.id
  })

  afterEach(() => {
    db.close()
  })

  it('should persist resume/background context and split into searchable chunks', () => {
    const resumeText = [
      '张三，后端工程师，5 年经验。',
      '主导过高并发订单系统，使用 Go + Redis + Kafka。',
      '熟悉微服务、MySQL、可观测性和性能优化。',
    ].join('\n')

    service.ingestSessionContext({
      sessionId,
      round: '二面',
      backgroundNote: '本轮重点考察系统设计和高可用',
      resumeFileName: 'zhangsan-resume.pdf',
      resumeText,
    })

    const context = contextRepo.getBySessionId(sessionId)
    expect(context).not.toBeNull()
    expect(context?.round).toBe('二面')
    expect(context?.resumeFileName).toBe('zhangsan-resume.pdf')

    const chunks = memoryRepo.listBySessionId(sessionId)
    expect(chunks.some((item) => item.source === 'resume')).toBe(true)
    expect(chunks.some((item) => item.source === 'interview_background')).toBe(true)
  })

  it('should index transcript/chat/screenshot memories and retrieve relevant snippets', () => {
    service.ingestSessionContext({
      sessionId,
      round: '一面',
      backgroundNote: '本轮偏重 Redis、缓存一致性',
      resumeFileName: 'resume.txt',
      resumeText: '候选人做过分布式缓存平台，熟悉 Redis 集群与哨兵。',
    })

    service.appendTranscript({
      sessionId,
      speaker: 'interviewer',
      timestamp: Date.now() - 30_000,
      text: '你讲讲 Redis 缓存击穿怎么处理？',
      isFinal: true,
    })

    service.appendScreenshotQA({
      sessionId,
      timestamp: Date.now() - 20_000,
      question: '请分析这段缓存更新代码',
      answer: '建议使用逻辑过期 + 后台重建，避免大面积击穿',
    })

    service.appendChatMessage({
      sessionId,
      role: 'assistant',
      timestamp: Date.now() - 10_000,
      text: '可以使用 singleflight 和互斥锁控制重建并发。',
    })

    const results = service.searchRelevantChunks({
      sessionId,
      query: 'Redis 缓存击穿怎么处理',
      limit: 5,
    })

    expect(results.length).toBeGreaterThan(0)
    expect(results.some((item) => /Redis|缓存击穿|逻辑过期/.test(item.text))).toBe(true)
  })

  it('should build an injected context block with source labels', () => {
    service.ingestSessionContext({
      sessionId,
      round: '终面',
      backgroundNote: '本轮看领导力与架构权衡',
      resumeFileName: 'resume.md',
      resumeText: '曾负责支付核心链路改造，峰值 QPS 5w+。',
    })

    service.appendChatMessage({
      sessionId,
      role: 'user',
      text: '我当时做了限流和降级。',
      timestamp: Date.now() - 5_000,
    })

    const injected = service.buildInjectedContext({
      sessionId,
      query: '请给我支付系统高可用回答框架',
      limit: 4,
      maxChars: 1200,
    })

    expect(injected).toContain('当前面试会话检索上下文')
    expect(injected).toMatch(/来源：简历|来源：面试背景|来源：普通问答/)
    expect(injected.length).toBeLessThanOrEqual(1200)
  })

  it('should still include session metadata when retrieval query has no overlap', () => {
    service.ingestSessionContext({
      sessionId,
      round: '终面',
      backgroundNote: '主考架构能力和跨团队沟通',
      resumeFileName: 'candidate.docx',
      resumeText: '候选人熟悉支付与风控系统。',
    })

    const injected = service.buildInjectedContext({
      sessionId,
      query: '这个项目里的芯片验证流程怎么做',
      limit: 4,
      maxChars: 1200,
    })

    expect(injected).toContain('会话轮次：终面')
    expect(injected).toContain('会话背景：主考架构能力和跨团队沟通')
    expect(injected).toContain('简历文件：candidate.docx')
  })
})
