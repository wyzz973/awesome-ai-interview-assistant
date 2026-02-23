import type { ProgrammingLanguagePreference } from '@shared/types/config'

const LANGUAGE_LABELS: Record<Exclude<ProgrammingLanguagePreference, 'auto'>, string> = {
  python: 'Python',
  java: 'Java',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  go: 'Go',
  cpp: 'C++',
  c: 'C',
  rust: 'Rust',
  csharp: 'C#',
  kotlin: 'Kotlin',
  swift: 'Swift',
  php: 'PHP',
}

export function buildRuntimeSystemPrompt(
  baseSystemPrompt: string,
  language: ProgrammingLanguagePreference,
): string {
  const base = (baseSystemPrompt ?? '').trim()
  if (language === 'auto') return base

  const label = LANGUAGE_LABELS[language as Exclude<ProgrammingLanguagePreference, 'auto'>]
  if (!label) return base

  const languageRule = `\n\n附加策略（代码语言偏好，高优先级）：当需要给出代码实现时，默认并优先使用 ${label}。即使截图、题干或上下文出现其他语言示例，也应转换为 ${label} 输出。只有当用户在“当前这条请求”中明确要求其他语言时才切换，并在答案开头用一句话说明切换原因。`
  return `${base}${languageRule}`.trim()
}
