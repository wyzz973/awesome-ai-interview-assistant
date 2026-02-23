import type { ProgrammingLanguagePreference } from '@shared/types/config'
import { resolveLanguageLabel } from './codeLanguagePolicy'

const DEFAULT_SCREENSHOT_PROMPT = '请分析这张截图'

export function buildScreenshotPrompt(
  basePrompt: string | undefined,
  language: ProgrammingLanguagePreference | string | null | undefined,
): string {
  const normalizedBase = basePrompt?.trim() || DEFAULT_SCREENSHOT_PROMPT
  const label = resolveLanguageLabel(language)
  if (!label) return normalizedBase

  return `${normalizedBase}\n\n代码语言要求（强约束）：如果需要给出代码，最终答案中的代码块必须使用 ${label}。即使截图中出现其他语言示例，也先转换为 ${label} 再作答。只有当我在这条消息里明确要求其他语言时才切换。`
}
