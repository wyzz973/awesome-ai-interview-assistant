interface SessionSummaryInput {
  reviewSummary?: string | null
  screenshotQAs?: Array<{ question?: string | null; answer?: string | null }>
  transcripts?: Array<{
    speaker?: 'interviewer' | 'me' | string
    text?: string | null
    isFinal?: boolean
  }>
  maxLength?: number
}

const DEFAULT_SUMMARY = '暂无摘要'

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function clip(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  if (maxLength <= 3) return '.'.repeat(maxLength)
  return `${text.slice(0, maxLength - 3)}...`
}

export function buildSessionSummary(input: SessionSummaryInput): string {
  const maxLength = Number.isFinite(input.maxLength) ? Math.max(8, Number(input.maxLength)) : 120

  const reviewSummary = compactText(input.reviewSummary ?? '')
  if (reviewSummary) {
    return clip(reviewSummary, maxLength)
  }

  const firstQA = (input.screenshotQAs ?? []).find((item) => {
    return compactText(item.question ?? '').length > 0 || compactText(item.answer ?? '').length > 0
  })
  if (firstQA) {
    const question = compactText(firstQA.question ?? '')
    const answer = compactText(firstQA.answer ?? '')
    const merged = question && answer
      ? `${question} ${answer}`
      : question || answer
    if (merged) {
      return clip(merged, maxLength)
    }
  }

  const transcripts = input.transcripts ?? []
  const firstInterviewer = transcripts.find((entry) => {
    return entry.speaker === 'interviewer' && entry.isFinal !== false && compactText(entry.text ?? '').length > 0
  })
  if (firstInterviewer) {
    return clip(compactText(firstInterviewer.text ?? ''), maxLength)
  }

  const firstFinal = transcripts.find((entry) => entry.isFinal !== false && compactText(entry.text ?? '').length > 0)
  if (firstFinal) {
    return clip(compactText(firstFinal.text ?? ''), maxLength)
  }

  return DEFAULT_SUMMARY
}
