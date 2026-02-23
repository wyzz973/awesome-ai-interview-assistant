import { describe, expect, it } from 'vitest'
import { buildCodeLanguageConstraint, resolveLanguageLabel } from '../codeLanguagePolicy'

describe('codeLanguagePolicy', () => {
  it('resolves java label', () => {
    expect(resolveLanguageLabel('java')).toBe('Java')
  })

  it('returns null for auto language', () => {
    expect(resolveLanguageLabel('auto')).toBeNull()
    expect(buildCodeLanguageConstraint('auto')).toBeNull()
  })

  it('builds strict constraint text for java', () => {
    const text = buildCodeLanguageConstraint('java')
    expect(text).toContain('严格执行')
    expect(text).toContain('使用 Java')
  })
})

