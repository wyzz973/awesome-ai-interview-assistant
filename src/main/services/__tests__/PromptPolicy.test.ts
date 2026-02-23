import { describe, it, expect } from 'vitest'
import { buildRuntimeSystemPrompt } from '../PromptPolicy'

describe('PromptPolicy', () => {
  it('should keep base prompt unchanged when language is auto', () => {
    const base = 'base prompt'
    const result = buildRuntimeSystemPrompt(base, 'auto')
    expect(result).toBe(base)
  })

  it('should append language policy for python', () => {
    const base = 'base prompt'
    const result = buildRuntimeSystemPrompt(base, 'python')

    expect(result).toContain('base prompt')
    expect(result).toContain('Python')
    expect(result).toContain('高优先级')
    expect(result).toContain('转换为 Python')
  })

  it('should fallback to base prompt for unknown language', () => {
    const base = 'base prompt'
    const result = buildRuntimeSystemPrompt(base, 'haskell' as never)
    expect(result).toBe(base)
  })
})
