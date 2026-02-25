export type InputLanguage = 'zh' | 'en'

const DIRECT_ANSWER_MARKER = '[DIRECT_ANSWER_MODE]'

export function detectInputLanguage(text: string): InputLanguage {
  const value = (text ?? '').trim()
  if (!value) return 'zh'

  const latin = (value.match(/[A-Za-z]/g) ?? []).length
  const cjk = (value.match(/[\u4e00-\u9fff]/g) ?? []).length
  if (latin === 0 && cjk > 0) return 'zh'
  if (cjk === 0 && latin > 0) return 'en'
  return latin >= cjk ? 'en' : 'zh'
}

export function buildDirectAnswerConstraint(userInput: string): string {
  const language = detectInputLanguage(userInput)
  if (language === 'en') {
    return `${DIRECT_ANSWER_MARKER} Start with a speakable answer in 2-4 lines. Keep only key steps and risks. Expand only when I ask for details.`
  }

  return `${DIRECT_ANSWER_MARKER} 先给可直接口述的答案（2-4 行），只保留关键步骤和风险点。只有我追问时再展开细节。`
}

export function isDirectAnswerConstraintMessage(text: string): boolean {
  return text.includes(DIRECT_ANSWER_MARKER)
}
