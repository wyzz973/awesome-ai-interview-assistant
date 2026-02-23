import { describe, expect, it } from 'vitest'
import { buildScreenshotPrompt } from '../screenshotPrompt'

describe('buildScreenshotPrompt', () => {
  it('returns base prompt when language is auto', () => {
    const result = buildScreenshotPrompt('分析这道题', 'auto')
    expect(result).toBe('分析这道题')
  })

  it('injects strong Java constraint when language is java', () => {
    const result = buildScreenshotPrompt('分析这道题', 'java')
    expect(result).toContain('分析这道题')
    expect(result).toContain('代码块必须使用 Java')
    expect(result).toContain('强约束')
  })

  it('falls back to default base prompt when base prompt is empty', () => {
    const result = buildScreenshotPrompt('   ', 'java')
    expect(result).toContain('请分析这张截图')
    expect(result).toContain('代码块必须使用 Java')
  })

  it('keeps base prompt when language is unknown', () => {
    const result = buildScreenshotPrompt('分析这道题', 'haskell')
    expect(result).toBe('分析这道题')
  })
})
