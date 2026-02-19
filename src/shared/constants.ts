import type { HotkeyConfig } from './types/hotkey'
import type { LLMProviderPreset } from './types/llm'

/** 默认快捷键映射 */
export const DEFAULT_HOTKEYS: HotkeyConfig = {
  screenshot: 'CommandOrControl+Shift+S',
  toggleWindow: 'CommandOrControl+Shift+H',
  toggleStealth: 'CommandOrControl+Shift+L',
  decreaseOpacity: 'CommandOrControl+Shift+[',
  increaseOpacity: 'CommandOrControl+Shift+]',
  toggleRecording: 'CommandOrControl+Shift+R',
  sendMessage: 'CommandOrControl+Enter',
}

/** LLM 供应商预设 */
export const LLM_PROVIDER_PRESETS: LLMProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com',
    defaultModel: 'gpt-4.1',
    models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini', 'o3', 'o3-mini', 'o4-mini'],
  },
  {
    id: 'claude',
    name: 'Claude (Anthropic)',
    baseURL: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-6',
    models: [
      'claude-opus-4-6',
      'claude-sonnet-4-6',
      'claude-haiku-4-5-20251001',
      'claude-sonnet-4-5-20250929',
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'qwen',
    name: 'Qwen (通义千问)',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode',
    defaultModel: 'qwen-max',
    models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-vl-max', 'qwen-vl-plus'],
  },
  {
    id: 'glm',
    name: 'GLM (智谱清言)',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4.7',
    models: ['glm-5', 'glm-4.7', 'glm-4.7-FlashX', 'glm-4-plus'],
  },
  {
    id: 'moonshot',
    name: 'Kimi (月之暗面)',
    baseURL: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k2.5',
    models: ['kimi-k2.5', 'kimi-k2-instruct', 'moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k'],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    baseURL: 'https://api.minimax.chat/v1',
    defaultModel: 'MiniMax-M2.5',
    models: ['MiniMax-M2.5', 'MiniMax-M2.1', 'MiniMax-M1'],
  },
]

/** 默认 System Prompt */
export const DEFAULT_SYSTEM_PROMPT = `你是一位资深的技术面试辅助助手。你的任务是帮助用户在技术面试中获取实时辅助。

请遵循以下原则：
1. **直接给出答案**：面试时间有限，直接给出关键答案和要点
2. **代码题**：给出可运行的代码，附带简短的思路说明和时间/空间复杂度
3. **系统设计题**：给出清晰的架构方案，包含核心组件、数据流和关键技术选型
4. **概念题**：用简洁的语言解释核心概念，举例说明
5. **格式化输出**：使用 Markdown 格式，代码块标注语言类型
6. **中英双语**：如果题目是英文，先给英文答案，再附中文解释`

/** 默认截屏分析 Prompt */
export const DEFAULT_SCREENSHOT_PROMPT = `请分析这道面试题目，给出详细的解答。如果是代码题，请给出完整可运行的代码。如果是选择题，请给出正确选项和解释。`

/** 默认复盘报告 Prompt */
export const DEFAULT_REVIEW_PROMPT = `请根据以下面试记录生成一份结构化的面试复盘报告。

要求输出 JSON 格式，包含以下字段：
- summary: 面试概况（一段话概述）
- questions: 面试官提出的问题列表
- performance.strengths: 表现良好的方面
- performance.weaknesses: 需要改进的方面
- suggestions: 具体的改进建议
- keyTopics: 涉及的知识点标签列表`

/** 默认外观配置 */
export const DEFAULT_APPEARANCE = {
  theme: 'dark' as const,
  opacity: 0.85,
  fontSize: 14,
  panelWidth: 480,
  panelHeight: 600,
  startPosition: 'right' as const,
}

/** 默认存储配置 */
export const DEFAULT_STORAGE = {
  dataDir: '~/AIInterviewer',
  screenshotRetentionDays: 90,
  maxDatabaseSizeMB: 500,
}

/** 应用名称 */
export const APP_NAME = 'AI 面试助手'

/** 应用 ID */
export const APP_ID = 'com.ai-interview-assistant.app'
