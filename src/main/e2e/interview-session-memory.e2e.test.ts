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

describe('Interview Session Memory E2E', () => {
  let db: Database.Database
  let sessionRepo: SessionRepo
  let contextRepo: SessionContextRepo
  let memoryRepo: InterviewMemoryRepo
  let memoryService: InterviewMemoryService

  beforeEach(() => {
    db = createTestDb()
    sessionRepo = new SessionRepo(db)
    contextRepo = new SessionContextRepo(db)
    memoryRepo = new InterviewMemoryRepo(db)
    memoryService = new InterviewMemoryService(contextRepo, memoryRepo)
  })

  afterEach(() => {
    db.close()
  })

  it('should keep interview memory in one session and inject relevant multi-source context', () => {
    const sessionA = sessionRepo.create({
      company: 'ByteDance',
      position: 'Backend Engineer',
      startTime: Date.now() - 120_000,
      status: 'recording',
    })
    const sessionB = sessionRepo.create({
      company: 'OpenAI',
      position: 'ML Engineer',
      startTime: Date.now() - 60_000,
      status: 'recording',
    })

    memoryService.ingestSessionContext({
      sessionId: sessionA.id,
      round: '二面',
      backgroundNote: '偏系统设计，重点是缓存一致性与高可用',
      resumeFileName: 'candidate-a.pdf',
      resumeText: '候选人主导过电商缓存平台，熟悉 Redis 集群和热点治理。',
    })

    memoryService.appendTranscript({
      sessionId: sessionA.id,
      speaker: 'interviewer',
      text: '你讲讲缓存击穿和缓存雪崩的处理思路。',
      timestamp: Date.now() - 50_000,
      isFinal: true,
    })
    memoryService.appendTranscript({
      sessionId: sessionA.id,
      speaker: 'me',
      text: '我会结合互斥锁、逻辑过期和热点预热。',
      timestamp: Date.now() - 45_000,
      isFinal: true,
    })
    memoryService.appendScreenshotQA({
      sessionId: sessionA.id,
      timestamp: Date.now() - 40_000,
      question: '请分析这段 Redis 缓存更新代码',
      answer: '推荐使用双删策略并结合延迟队列修正脏读窗口。',
    })
    memoryService.appendChatMessage({
      sessionId: sessionA.id,
      role: 'user',
      text: '如果面试官追问一致性保障，我该怎么说？',
      timestamp: Date.now() - 30_000,
    })
    memoryService.appendChatMessage({
      sessionId: sessionA.id,
      role: 'assistant',
      text: '优先讲一致性目标、冲突窗口、补偿机制和可观测性指标。',
      timestamp: Date.now() - 20_000,
    })

    // 另一场面试写入无关数据，用于验证会话隔离
    memoryService.ingestSessionContext({
      sessionId: sessionB.id,
      round: '一面',
      backgroundNote: '偏机器学习基础',
      resumeFileName: 'candidate-b.pdf',
      resumeText: '候选人熟悉 LLM 推理优化。',
    })
    memoryService.appendTranscript({
      sessionId: sessionB.id,
      speaker: 'interviewer',
      text: '请解释 attention 机制。',
      timestamp: Date.now() - 10_000,
      isFinal: true,
    })

    const injected = memoryService.buildInjectedContext({
      sessionId: sessionA.id,
      query: '请给我缓存击穿与一致性问题的高分回答框架',
      limit: 8,
      maxChars: 2200,
    })

    expect(injected).toContain('当前面试会话检索上下文')
    expect(injected).toContain('会话轮次：二面')
    expect(injected).toContain('会话背景：偏系统设计，重点是缓存一致性与高可用')
    expect(injected).toContain('简历文件：candidate-a.pdf')
    expect(injected).toMatch(/来源：简历|来源：实时转写|来源：截图提问|来源：截图回答|来源：普通提问|来源：普通回答/)

    // 不能混入其他会话
    expect(injected).not.toContain('attention 机制')
    expect(injected).not.toContain('candidate-b.pdf')
  })

  it('should store one screenshot question and one screenshot answer in the same interview flow', () => {
    const session = sessionRepo.create({
      company: 'Google',
      position: 'SWE',
      startTime: Date.now(),
      status: 'recording',
    })

    // 模拟 IPC 截图流程：先记录问题，流式结束后记录答案
    memoryService.appendScreenshotQA({
      sessionId: session.id,
      timestamp: Date.now() - 5_000,
      question: '请分析这道算法题',
    })
    memoryService.appendScreenshotQA({
      sessionId: session.id,
      timestamp: Date.now(),
      answer: '先给 O(n) 思路，再补边界条件和测试样例。',
    })

    const chunks = memoryRepo
      .listBySessionId(session.id)
      .filter((item) => item.source === 'screenshot_question' || item.source === 'screenshot_answer')

    expect(chunks.filter((item) => item.source === 'screenshot_question')).toHaveLength(1)
    expect(chunks.filter((item) => item.source === 'screenshot_answer')).toHaveLength(1)
  })
})
