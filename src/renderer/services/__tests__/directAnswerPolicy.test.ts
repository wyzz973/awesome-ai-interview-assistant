import { describe, it, expect } from 'vitest'
import { buildDirectAnswerConstraint, detectInputLanguage } from '../directAnswerPolicy'

describe('detectInputLanguage', () => {
  it('detects english intent', () => {
    expect(detectInputLanguage('Please explain CAP theorem in one minute')).toBe('en')
  })

  it('defaults to chinese for chinese text', () => {
    expect(detectInputLanguage('请用一分钟讲清楚 CAP 定理')).toBe('zh')
  })
})

describe('buildDirectAnswerConstraint', () => {
  it('returns english constraint for english question', () => {
    const constraint = buildDirectAnswerConstraint('Explain binary search quickly')
    expect(constraint).toContain('[DIRECT_ANSWER_MODE]')
    expect(constraint).toContain('Start with a speakable answer')
  })

  it('returns chinese constraint for chinese question', () => {
    const constraint = buildDirectAnswerConstraint('怎么回答分布式事务？')
    expect(constraint).toContain('[DIRECT_ANSWER_MODE]')
    expect(constraint).toContain('先给可直接口述的答案')
  })
})
