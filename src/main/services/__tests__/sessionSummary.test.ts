import { describe, it, expect } from 'vitest'
import { buildSessionSummary } from '../sessionSummary'

describe('buildSessionSummary', () => {
  it('prioritizes review summary when available', () => {
    const summary = buildSessionSummary({
      reviewSummary: '候选人在系统设计题中展示了清晰的容量估算和降级思路。',
      screenshotQAs: [
        { question: 'Q1', answer: 'A1' },
      ],
    })

    expect(summary).toContain('系统设计题')
  })

  it('falls back to screenshot QA when review summary is absent', () => {
    const summary = buildSessionSummary({
      screenshotQAs: [
        { question: '如何设计限流？', answer: '令牌桶 + 熔断 + 监控告警。' },
      ],
    })

    expect(summary).toContain('如何设计限流')
    expect(summary).toContain('令牌桶')
  })

  it('falls back to interviewer transcript when no screenshot QA', () => {
    const summary = buildSessionSummary({
      transcripts: [
        { speaker: 'interviewer', text: '请比较 Redis 和 MySQL 的适用场景。', isFinal: true },
      ],
    })

    expect(summary).toContain('Redis')
    expect(summary).toContain('MySQL')
  })

  it('returns default copy when no signal exists', () => {
    expect(buildSessionSummary({})).toBe('暂无摘要')
  })

  it('truncates overly long text', () => {
    const summary = buildSessionSummary({
      reviewSummary: 'a'.repeat(300),
      maxLength: 60,
    })

    expect(summary.length).toBeLessThanOrEqual(60)
    expect(summary.endsWith('...')).toBe(true)
  })
})
