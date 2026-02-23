import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { ResumeParser } from '@main/services/ResumeParser'

describe('ResumeParser', () => {
  let workdir: string
  let parser: ResumeParser

  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), 'resume-parser-'))
    parser = new ResumeParser()
  })

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true })
  })

  it('should parse plain text resumes', async () => {
    const filePath = join(workdir, 'resume.txt')
    writeFileSync(
      filePath,
      ['张三', '后端工程师', '熟悉 Go、MySQL、Redis'].join('\n'),
      'utf-8',
    )

    const result = await parser.parse(filePath)

    expect(result.fileName).toBe('resume.txt')
    expect(result.text).toContain('后端工程师')
    expect(result.text).toContain('Redis')
    expect(result.text.length).toBeGreaterThan(10)
  })

  it('should reject unsupported resume file types', async () => {
    const filePath = join(workdir, 'resume.png')
    writeFileSync(filePath, 'fake-image-content', 'utf-8')

    await expect(parser.parse(filePath)).rejects.toThrow(/不支持|unsupported/i)
  })
})
