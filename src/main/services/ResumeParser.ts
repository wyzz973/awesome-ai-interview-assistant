import { readFile } from 'fs/promises'
import { basename, extname } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface ParsedResume {
  filePath: string
  fileName: string
  text: string
}

export class ResumeParser {
  async parse(filePath: string): Promise<ParsedResume> {
    const fileName = basename(filePath)
    const ext = extname(filePath).toLowerCase()

    const text = await this.parseByExtension(filePath, ext)
    const normalized = this.normalizeText(text)
    if (!normalized) {
      throw new Error('简历内容为空，无法用于检索')
    }

    return {
      filePath,
      fileName,
      text: normalized,
    }
  }

  private async parseByExtension(filePath: string, ext: string): Promise<string> {
    if (ext === '.txt' || ext === '.md' || ext === '.markdown') {
      return await readFile(filePath, 'utf-8')
    }

    if (ext === '.docx') {
      try {
        const mammoth = await import('mammoth')
        const result = await mammoth.extractRawText({ path: filePath })
        return result.value ?? ''
      } catch (err) {
        throw new Error(`DOCX 解析失败: ${this.toMessage(err)}`)
      }
    }

    if (ext === '.pdf') {
      try {
        const pdfParseModule = await import('pdf-parse')
        const pdfParse = (pdfParseModule.default ?? pdfParseModule) as (
          dataBuffer: Buffer,
        ) => Promise<{ text?: string }>
        const data = await readFile(filePath)
        const result = await pdfParse(data)
        return result.text ?? ''
      } catch (err) {
        throw new Error(`PDF 解析失败: ${this.toMessage(err)}`)
      }
    }

    if (ext === '.doc') {
      // macOS 上使用 textutil 进行老格式 Word 转文本
      try {
        const { stdout } = await execFileAsync('textutil', ['-convert', 'txt', '-stdout', filePath])
        return stdout ?? ''
      } catch (err) {
        throw new Error(`DOC 解析失败: ${this.toMessage(err)}`)
      }
    }

    throw new Error(`不支持的简历文件类型: ${ext || 'unknown'}`)
  }

  private normalizeText(raw: string): string {
    return raw
      .replace(/\r\n/g, '\n')
      .replace(/\u0000/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  private toMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
  }
}

