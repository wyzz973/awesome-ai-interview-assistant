import {
  InterviewMemoryRepo,
  type InterviewMemoryChunk,
  type InterviewMemorySource,
} from '@main/db/repositories/InterviewMemoryRepo'
import { SessionContextRepo } from '@main/db/repositories/SessionContextRepo'

interface RetrievedChunk extends InterviewMemoryChunk {
  score: number
  textScore: number
  vectorScore: number
}

interface SessionMeta {
  round: string
  backgroundNote: string
  resumeFileName: string
}

const SOURCE_LABELS: Record<InterviewMemorySource, string> = {
  resume: '简历',
  interview_background: '面试背景',
  transcript: '实时转写',
  screenshot_question: '截图提问',
  screenshot_answer: '截图回答',
  chat_user: '普通提问',
  chat_assistant: '普通回答',
}

const SOURCE_BOOSTS: Record<InterviewMemorySource, number> = {
  resume: 1,
  interview_background: 0.98,
  transcript: 0.95,
  screenshot_question: 0.95,
  screenshot_answer: 0.95,
  chat_user: 0.9,
  chat_assistant: 0.85,
}

export class InterviewMemoryService {
  constructor(
    private contextRepo: SessionContextRepo,
    private memoryRepo: InterviewMemoryRepo,
  ) {}

  ingestSessionContext(data: {
    sessionId: string
    round?: string
    backgroundNote?: string
    resumeFileName?: string
    resumeFilePath?: string
    resumeText?: string
  }): void {
    this.contextRepo.upsert(data)

    const now = Date.now()
    const entries: Array<Omit<InterviewMemoryChunk, 'id' | 'createdAt'>> = []

    const normalizedResume = this.normalizeText(data.resumeText)
    if (normalizedResume) {
      for (const chunk of this.chunkText(normalizedResume, 800, 120)) {
        entries.push({
          sessionId: data.sessionId,
          source: 'resume',
          role: 'candidate',
          timestamp: now,
          text: chunk,
        })
      }
    }

    const round = data.round?.trim()
    const background = this.normalizeText(data.backgroundNote)
    const backgroundText =
      round && background
        ? `面试轮次：${round}\n${background}`
        : round
          ? `面试轮次：${round}`
          : background
            ? background
            : ''

    if (backgroundText) {
      entries.push({
        sessionId: data.sessionId,
        source: 'interview_background',
        role: 'system',
        timestamp: now,
        text: backgroundText,
      })
    }

    if (entries.length > 0) {
      this.memoryRepo.batchCreate(entries)
    }
  }

  appendTranscript(data: {
    sessionId: string
    speaker: 'interviewer' | 'me'
    text: string
    timestamp: number
    isFinal: boolean
  }): void {
    if (!data.isFinal) return
    const text = this.normalizeText(data.text)
    if (!text) return
    this.memoryRepo.create({
      sessionId: data.sessionId,
      source: 'transcript',
      role: data.speaker,
      timestamp: data.timestamp,
      text,
    })
  }

  appendScreenshotQA(data: {
    sessionId: string
    timestamp: number
    question?: string
    answer?: string
  }): void {
    const entries: Array<Omit<InterviewMemoryChunk, 'id' | 'createdAt'>> = []
    const question = this.normalizeText(data.question)
    if (question) {
      entries.push({
        sessionId: data.sessionId,
        source: 'screenshot_question',
        role: 'user',
        timestamp: data.timestamp,
        text: question,
      })
    }
    const answer = this.normalizeText(data.answer)
    if (answer) {
      entries.push({
        sessionId: data.sessionId,
        source: 'screenshot_answer',
        role: 'assistant',
        timestamp: data.timestamp,
        text: answer,
      })
    }
    if (entries.length > 0) {
      this.memoryRepo.batchCreate(entries)
    }
  }

  appendChatMessage(data: {
    sessionId: string
    role: 'user' | 'assistant'
    text: string
    timestamp?: number
  }): void {
    const text = this.normalizeText(data.text)
    if (!text) return
    this.memoryRepo.create({
      sessionId: data.sessionId,
      source: data.role === 'user' ? 'chat_user' : 'chat_assistant',
      role: data.role,
      timestamp: data.timestamp ?? Date.now(),
      text,
    })
  }

  searchRelevantChunks(params: {
    sessionId: string
    query: string
    limit?: number
  }): RetrievedChunk[] {
    const query = this.normalizeText(params.query)
    if (!query) return []

    const limit = Math.max(1, params.limit ?? 8)
    const candidateLimit = Math.max(24, limit * 4)
    const now = Date.now()

    const keywordResults = this.memoryRepo.searchKeyword(params.sessionId, query, candidateLimit)
    const vectorCandidates = this.memoryRepo.listRecentBySessionId(params.sessionId, 160)
    const queryTokens = this.tokenize(query)

    const byId = new Map<
      string,
      {
        chunk: InterviewMemoryChunk
        textScore: number
        vectorScore: number
      }
    >()

    for (const item of keywordResults) {
      byId.set(item.id, {
        chunk: item,
        textScore: item.textScore,
        vectorScore: 0,
      })
    }

    for (const chunk of vectorCandidates) {
      const score = this.jaccard(queryTokens, this.tokenize(chunk.text))
      if (score <= 0) continue
      const existing = byId.get(chunk.id)
      if (existing) {
        existing.vectorScore = Math.max(existing.vectorScore, score)
      } else {
        byId.set(chunk.id, { chunk, textScore: 0, vectorScore: score })
      }
    }

    const merged = Array.from(byId.values())
      .map(({ chunk, textScore, vectorScore }) => {
        const recency = this.recencyScore(chunk.source, chunk.timestamp, now)
        const sourceBoost = SOURCE_BOOSTS[chunk.source] ?? 0.9
        const score = (0.55 * vectorScore + 0.35 * textScore + 0.1 * recency) * sourceBoost
        return {
          ...chunk,
          score,
          textScore,
          vectorScore,
        }
      })
      .filter((item) => item.score > 0.03)
      .sort((a, b) => b.score - a.score)

    if (merged.length === 0) {
      return this.fallbackRecentChunks(params.sessionId, limit, now)
    }

    return this.mmrSelect(merged, limit)
  }

  buildInjectedContext(params: {
    sessionId: string
    query: string
    limit?: number
    maxChars?: number
  }): string {
    const meta = this.getSessionMeta(params.sessionId)
    const hits = this.searchRelevantChunks({
      sessionId: params.sessionId,
      query: params.query,
      limit: params.limit ?? 6,
    })

    if (hits.length === 0 && !meta) return ''

    const maxChars = Math.max(600, params.maxChars ?? 3200)
    const lines: string[] = ['当前面试会话检索上下文（仅作事实依据，优先引用相关片段）：']

    if (meta) {
      if (meta.round) {
        lines.push(`- 会话轮次：${meta.round}`)
      }
      if (meta.backgroundNote) {
        lines.push(`- 会话背景：${this.ellipsis(meta.backgroundNote, 260)}`)
      }
      if (meta.resumeFileName) {
        lines.push(`- 简历文件：${meta.resumeFileName}`)
      }
    }

    for (const hit of hits) {
      const label = SOURCE_LABELS[hit.source] ?? hit.source
      const content = this.ellipsis(hit.text, 320)
      lines.push(`- 来源：${label}`)
      lines.push(`  片段：${content}`)
    }

    lines.push('使用要求：优先基于上述会话事实回答；若信息不足，请明确说明缺失项。')
    return this.ellipsis(lines.join('\n'), maxChars)
  }

  private getSessionMeta(sessionId: string): SessionMeta | null {
    const context = this.contextRepo.getBySessionId(sessionId)
    if (!context) return null
    return {
      round: context.round?.trim() ?? '',
      backgroundNote: context.backgroundNote?.trim() ?? '',
      resumeFileName: context.resumeFileName?.trim() ?? '',
    }
  }

  private fallbackRecentChunks(sessionId: string, limit: number, now: number): RetrievedChunk[] {
    const fallback = this.memoryRepo.listRecentBySessionId(sessionId, Math.max(40, limit * 4))
    return fallback
      .map((chunk) => {
        const recency = this.recencyScore(chunk.source, chunk.timestamp, now)
        const sourceBoost = SOURCE_BOOSTS[chunk.source] ?? 0.9
        const score = (0.2 + 0.8 * recency) * sourceBoost
        return {
          ...chunk,
          score,
          textScore: 0,
          vectorScore: 0,
        }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  private mmrSelect(candidates: RetrievedChunk[], limit: number): RetrievedChunk[] {
    if (candidates.length <= limit) return candidates.slice(0, limit)

    const lambda = 0.72
    const selected: RetrievedChunk[] = []
    const selectedTokens: Set<string>[] = []
    const remaining = candidates.slice()
    const tokenCache = new Map<string, Set<string>>()

    const getTokens = (id: string, text: string): Set<string> => {
      const cached = tokenCache.get(id)
      if (cached) return cached
      const tokens = this.tokenize(text)
      tokenCache.set(id, tokens)
      return tokens
    }

    while (selected.length < limit && remaining.length > 0) {
      let bestIdx = 0
      let bestScore = Number.NEGATIVE_INFINITY

      for (let i = 0; i < remaining.length; i += 1) {
        const candidate = remaining[i]
        const candidateTokens = getTokens(candidate.id, candidate.text)
        const maxSimilarity = selectedTokens.reduce((max, tokens) => {
          const sim = this.jaccard(candidateTokens, tokens)
          return sim > max ? sim : max
        }, 0)
        const mmrScore = lambda * candidate.score - (1 - lambda) * maxSimilarity
        if (mmrScore > bestScore) {
          bestScore = mmrScore
          bestIdx = i
        }
      }

      const [picked] = remaining.splice(bestIdx, 1)
      selected.push(picked)
      selectedTokens.push(getTokens(picked.id, picked.text))
    }

    return selected
  }

  private normalizeText(input: string | undefined): string {
    if (!input) return ''
    return input.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  }

  private chunkText(text: string, maxChars: number, overlapChars: number): string[] {
    const paragraphs = text
      .split(/\n{2,}/)
      .map((entry) => entry.trim())
      .filter(Boolean)

    const chunks: string[] = []
    for (const paragraph of paragraphs) {
      if (paragraph.length <= maxChars) {
        chunks.push(paragraph)
        continue
      }

      let cursor = 0
      while (cursor < paragraph.length) {
        const end = Math.min(paragraph.length, cursor + maxChars)
        const slice = paragraph.slice(cursor, end).trim()
        if (slice) chunks.push(slice)
        if (end >= paragraph.length) break
        cursor = Math.max(0, end - overlapChars)
      }
    }

    return chunks.length > 0 ? chunks : [text]
  }

  private tokenize(text: string): Set<string> {
    const words =
      text
        .toLowerCase()
        .match(/[a-z0-9_]+/g)
        ?.map((token) => token.trim())
        .filter(Boolean) ?? []

    const cjkRuns = text.match(/[\p{Script=Han}]{2,}/gu) ?? []
    const cjkTokens: string[] = []
    for (const run of cjkRuns) {
      const chars = Array.from(run)
      if (chars.length <= 2) {
        cjkTokens.push(run)
        continue
      }
      for (let i = 0; i < chars.length - 1; i += 1) {
        cjkTokens.push(`${chars[i]}${chars[i + 1]}`)
      }
    }

    return new Set([...words, ...cjkTokens])
  }

  private jaccard(left: Set<string>, right: Set<string>): number {
    if (left.size === 0 || right.size === 0) return 0
    let intersection = 0
    const [small, large] = left.size <= right.size ? [left, right] : [right, left]
    for (const token of small) {
      if (large.has(token)) intersection += 1
    }
    const union = left.size + right.size - intersection
    return union === 0 ? 0 : intersection / union
  }

  private recencyScore(source: InterviewMemorySource, timestamp: number, now: number): number {
    if (source === 'resume' || source === 'interview_background') return 1
    const ageMs = Math.max(0, now - timestamp)
    const halfLifeMs = 1000 * 60 * 60 * 6 // 6 小时
    const lambda = Math.LN2 / halfLifeMs
    return Math.exp(-lambda * ageMs)
  }

  private ellipsis(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text
    return `${text.slice(0, Math.max(0, maxChars - 1))}…`
  }
}
