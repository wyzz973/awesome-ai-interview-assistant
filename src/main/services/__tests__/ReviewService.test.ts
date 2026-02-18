import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReviewService } from '../ReviewService'
import type { LLMService } from '../LLMService'
import type { TranscriptEntry, ScreenshotQA } from '@shared/types/session'

function createMockLLMService(responseText: string): LLMService {
  return {
    chat: vi.fn().mockResolvedValue(
      (async function* () {
        yield responseText
      })()
    ),
    analyzeScreenshot: vi.fn(),
    generateReview: vi.fn(),
    testConnection: vi.fn(),
    updateConfig: vi.fn()
  } as unknown as LLMService
}

const sampleTranscripts: TranscriptEntry[] = [
  {
    id: '1',
    sessionId: 'sess1',
    timestamp: 1700000000000,
    speaker: 'interviewer',
    text: '请做一下自我介绍',
    isFinal: true
  },
  {
    id: '2',
    sessionId: 'sess1',
    timestamp: 1700000010000,
    speaker: 'me',
    text: '我是一名前端工程师',
    isFinal: true
  },
  {
    id: '3',
    sessionId: 'sess1',
    timestamp: 1700000015000,
    speaker: 'interviewer',
    text: '正在说...',
    isFinal: false
  }
]

const sampleScreenshotQAs: ScreenshotQA[] = [
  {
    id: 'q1',
    sessionId: 'sess1',
    timestamp: 1700000020000,
    imagePath: '/img/001.png',
    question: '这段代码有什么问题？',
    answer: '缺少错误处理',
    model: 'gpt-4'
  }
]

describe('ReviewService', () => {
  describe('buildSessionSummary()', () => {
    it('should include final transcripts with speaker labels', () => {
      const llm = createMockLLMService('')
      const service = new ReviewService(llm)

      const summary = service.buildSessionSummary(sampleTranscripts, [])

      expect(summary).toContain('面试官: 请做一下自我介绍')
      expect(summary).toContain('我: 我是一名前端工程师')
    })

    it('should exclude non-final transcripts', () => {
      const llm = createMockLLMService('')
      const service = new ReviewService(llm)

      const summary = service.buildSessionSummary(sampleTranscripts, [])

      expect(summary).not.toContain('正在说')
    })

    it('should include screenshot QAs', () => {
      const llm = createMockLLMService('')
      const service = new ReviewService(llm)

      const summary = service.buildSessionSummary([], sampleScreenshotQAs)

      expect(summary).toContain('这段代码有什么问题？')
      expect(summary).toContain('缺少错误处理')
      expect(summary).toContain('gpt-4')
    })

    it('should handle empty data', () => {
      const llm = createMockLLMService('')
      const service = new ReviewService(llm)

      const summary = service.buildSessionSummary([], [])

      expect(summary).toBe('')
    })

    it('should combine transcripts and screenshot QAs', () => {
      const llm = createMockLLMService('')
      const service = new ReviewService(llm)

      const summary = service.buildSessionSummary(sampleTranscripts, sampleScreenshotQAs)

      expect(summary).toContain('面试对话记录')
      expect(summary).toContain('截屏问答记录')
    })
  })

  describe('generateReview()', () => {
    it('should call LLM chat with system prompt and summary', async () => {
      const validJson = JSON.stringify({
        summary: '表现良好',
        questions: ['自我介绍'],
        performance: {
          strengths: ['技术扎实'],
          weaknesses: ['项目经验不足']
        },
        suggestions: ['多做项目'],
        keyTopics: ['React']
      })

      const llm = createMockLLMService(validJson)
      const service = new ReviewService(llm)

      const result = await service.generateReview('sess1', sampleTranscripts, sampleScreenshotQAs)

      expect(llm.chat).toHaveBeenCalledTimes(1)
      const callArgs = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(callArgs[0].role).toBe('system')
      expect(callArgs[1].role).toBe('user')
    })

    it('should parse valid JSON response into ReviewReport', async () => {
      const validJson = JSON.stringify({
        summary: '面试表现优秀',
        questions: ['请做自我介绍', '什么是闭包'],
        performance: {
          strengths: ['回答清晰', '逻辑严谨'],
          weaknesses: ['紧张']
        },
        suggestions: ['放松心态'],
        keyTopics: ['JavaScript', 'React']
      })

      const llm = createMockLLMService(validJson)
      const service = new ReviewService(llm)

      const result = await service.generateReview('sess1', sampleTranscripts, [])

      expect(result.sessionId).toBe('sess1')
      expect(result.summary).toBe('面试表现优秀')
      expect(result.questions).toEqual(['请做自我介绍', '什么是闭包'])
      expect(result.performance.strengths).toEqual(['回答清晰', '逻辑严谨'])
      expect(result.performance.weaknesses).toEqual(['紧张'])
      expect(result.suggestions).toEqual(['放松心态'])
      expect(result.keyTopics).toEqual(['JavaScript', 'React'])
      expect(result.generatedAt).toBeGreaterThan(0)
    })

    it('should handle JSON wrapped in markdown code block', async () => {
      const response = '```json\n{"summary":"ok","questions":[],"performance":{"strengths":[],"weaknesses":[]},"suggestions":[],"keyTopics":[]}\n```'

      const llm = createMockLLMService(response)
      const service = new ReviewService(llm)

      const result = await service.generateReview('sess1', [], [])

      expect(result.summary).toBe('ok')
    })

    it('should fallback gracefully when LLM returns invalid JSON', async () => {
      const llm = createMockLLMService('This is not JSON at all')
      const service = new ReviewService(llm)

      const result = await service.generateReview('sess1', [], [])

      // Should not throw, should use fallback
      expect(result.summary).toBe('This is not JSON at all')
      expect(result.questions).toEqual([])
      expect(result.performance.strengths).toEqual([])
    })

    it('should handle partial JSON response', async () => {
      const partialJson = '{"summary":"部分数据","questions":["q1"]}'

      const llm = createMockLLMService(partialJson)
      const service = new ReviewService(llm)

      const result = await service.generateReview('sess1', [], [])

      expect(result.summary).toBe('部分数据')
      expect(result.questions).toEqual(['q1'])
      expect(result.performance.strengths).toEqual([])
    })
  })

  describe('updateLLMService()', () => {
    it('should use updated LLM service for subsequent calls', async () => {
      const llm1 = createMockLLMService('{}')
      const llm2 = createMockLLMService('{"summary":"new","questions":[],"performance":{"strengths":[],"weaknesses":[]},"suggestions":[],"keyTopics":[]}')

      const service = new ReviewService(llm1)
      service.updateLLMService(llm2)

      await service.generateReview('sess1', [], [])

      expect(llm1.chat).not.toHaveBeenCalled()
      expect(llm2.chat).toHaveBeenCalled()
    })
  })
})
