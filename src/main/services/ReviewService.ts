import type { TranscriptEntry, ScreenshotQA, ReviewReport } from '@shared/types/session'
import type { LLMService } from './LLMService'

/**
 * 复盘报告服务
 * 负责汇总会话数据并调用 LLM 生成结构化复盘报告。
 */
export class ReviewService {
  private llmService: LLMService

  constructor(llmService: LLMService) {
    this.llmService = llmService
  }

  /** 更新 LLM 服务实例 */
  updateLLMService(llmService: LLMService): void {
    this.llmService = llmService
  }

  /** 汇总会话数据为文本 */
  buildSessionSummary(
    transcripts: TranscriptEntry[],
    screenshotQAs: ScreenshotQA[]
  ): string {
    const parts: string[] = []

    // 转写记录
    if (transcripts.length > 0) {
      parts.push('## 面试对话记录\n')
      for (const entry of transcripts) {
        if (!entry.isFinal) continue
        const speaker = entry.speaker === 'interviewer' ? '面试官' : '我'
        const time = formatTimestamp(entry.timestamp)
        parts.push(`[${time}] ${speaker}: ${entry.text}`)
      }
    }

    // 截屏问答
    if (screenshotQAs.length > 0) {
      parts.push('\n## 截屏问答记录\n')
      for (const qa of screenshotQAs) {
        const time = formatTimestamp(qa.timestamp)
        parts.push(`[${time}] 问题: ${qa.question}`)
        parts.push(`回答 (${qa.model}): ${qa.answer}`)
        parts.push('')
      }
    }

    return parts.join('\n')
  }

  /** 调用 LLM 生成结构化复盘报告 */
  async generateReview(
    sessionId: string,
    transcripts: TranscriptEntry[],
    screenshotQAs: ScreenshotQA[]
  ): Promise<ReviewReport> {
    const summary = this.buildSessionSummary(transcripts, screenshotQAs)

    const systemPrompt = `你是一个面试复盘分析专家。请分析以下面试会话数据，生成一份结构化的JSON复盘报告。

请严格按照以下 JSON 格式输出（不要输出其他内容）：
{
  "summary": "面试概况总结（1-2段话）",
  "questions": ["面试官提出的关键问题1", "问题2", ...],
  "performance": {
    "strengths": ["表现亮点1", "亮点2", ...],
    "weaknesses": ["待改进之处1", "待改进之处2", ...]
  },
  "suggestions": ["改进建议1", "建议2", ...],
  "keyTopics": ["涉及的技术主题1", "主题2", ...]
}`

    const iter = await this.llmService.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: summary }
    ])

    let fullResponse = ''
    for await (const token of iter) {
      fullResponse += token
    }

    const parsed = parseReviewJSON(fullResponse)

    return {
      id: '',
      sessionId,
      generatedAt: Date.now(),
      summary: parsed.summary,
      questions: parsed.questions,
      performance: parsed.performance,
      suggestions: parsed.suggestions,
      keyTopics: parsed.keyTopics
    }
  }
}

/** 解析 LLM 返回的 JSON 报告 */
function parseReviewJSON(text: string): {
  summary: string
  questions: string[]
  performance: { strengths: string[]; weaknesses: string[] }
  suggestions: string[]
  keyTopics: string[]
} {
  // 尝试从文本中提取 JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return fallbackParse(text)
  }

  try {
    const parsed = JSON.parse(jsonMatch[0])
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      performance: {
        strengths: Array.isArray(parsed.performance?.strengths)
          ? parsed.performance.strengths
          : [],
        weaknesses: Array.isArray(parsed.performance?.weaknesses)
          ? parsed.performance.weaknesses
          : []
      },
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics : []
    }
  } catch {
    return fallbackParse(text)
  }
}

/** 无法解析 JSON 时的降级处理 */
function fallbackParse(text: string) {
  return {
    summary: text.slice(0, 500),
    questions: [],
    performance: { strengths: [], weaknesses: [] },
    suggestions: [],
    keyTopics: []
  }
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
}
