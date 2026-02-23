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

export function resolveLanguageLabel(
  language: ProgrammingLanguagePreference | string | null | undefined,
): string | null {
  const normalized = typeof language === 'string' ? language.trim().toLowerCase() : 'auto'
  if (normalized === 'auto') return null
  return LANGUAGE_LABELS[normalized as Exclude<ProgrammingLanguagePreference, 'auto'>] ?? null
}

export function buildCodeLanguageConstraint(
  language: ProgrammingLanguagePreference | string | null | undefined,
): string | null {
  const label = resolveLanguageLabel(language)
  if (!label) return null
  return `代码语言约束（严格执行）：仅当问题需要代码实现时，统一使用 ${label}。即使上下文出现其他语言示例，也请转换为 ${label}。`
}

