import type { HotkeyConfig } from './types/hotkey'
import type { LLMProviderPreset } from './types/llm'
import type { WhisperStreamingConfig } from './types/config'

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

/** LLM 供应商预设
 *  baseURL 统一包含版本路径，LLMService 只拼接 /chat/completions
 */
export const LLM_PROVIDER_PRESETS: LLMProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.2',
    models: [
      'gpt-5.2',
      'gpt-5.2-chat-latest',
      'gpt-5.2-pro',
      'gpt-5.2-codex',
      'gpt-5.1',
      'gpt-5-mini',
      'gpt-5-nano',
      'gpt-4.1',
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'glm',
    name: 'GLM (智谱清言)',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-5',
    models: ['glm-5', 'glm-4.7', 'glm-4.7-flash', 'glm-4.6', 'glm-4.6v', 'glm-4.5', 'glm-4.5-flash', 'glm-4.5v'],
  },
  {
    id: 'qwen',
    name: 'Qwen (通义千问)',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen3.5-plus',
    models: [
      'qwen3.5-plus',
      'qwen3-max-2026-01-23',
      'qwen3-max',
      'qwen3-plus',
      'qwen-plus',
      'qwen-turbo',
      'qwq-plus',
      'qwen-vl-max-latest',
    ],
  },
  {
    id: 'moonshot',
    name: 'Kimi (月之暗面)',
    baseURL: 'https://api.moonshot.ai/v1',
    defaultModel: 'kimi-k2.5',
    models: [
      'kimi-k2.5',
      'kimi-k2-0905-preview',
      'kimi-k2-turbo-preview',
      'kimi-k2-thinking',
      'kimi-k2-thinking-turbo',
      'kimi-k2-0711-preview',
    ],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    baseURL: 'https://api.minimax.io/v1',
    defaultModel: 'MiniMax-M2.5',
    models: ['MiniMax-M2.5', 'MiniMax-M2.5-highspeed', 'MiniMax-M2.1', 'MiniMax-M2.1-highspeed', 'MiniMax-M2'],
  },
  {
    id: 'claude',
    name: 'Claude (Anthropic)',
    baseURL: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-6',
    models: [
      'claude-sonnet-4-6',
      'claude-opus-4-6',
      'claude-opus-4-1-20250805',
      'claude-opus-4-20250514',
      'claude-sonnet-4-20250514',
      'claude-3-7-sonnet-20250219',
      'claude-3-5-haiku-20241022',
    ],
  },
]

/** ASR 供应商预设（OpenAI 兼容） */
export const ASR_PROVIDER_PRESETS: LLMProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini-transcribe',
    models: ['gpt-4o-mini-transcribe', 'gpt-4o-transcribe', 'whisper-1'],
  },
  {
    id: 'qwen',
    name: 'Qwen (阿里云百炼)',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen3-asr-flash',
    models: ['qwen3-asr-flash', 'qwen3-asr'],
  },
]

/** 默认 Whisper/OpenAI 兼容 ASR 流式参数 */
export const DEFAULT_WHISPER_STREAMING: Required<WhisperStreamingConfig> = {
  chunkLengthMs: 2400,
  overlapMs: 500,
  emitPartial: true,
  vadEnabled: true,
  vadThreshold: 0.015,
  minSpeechMs: 320,
  minSilenceMs: 700,
}

/** 默认 System Prompt */
export const DEFAULT_SYSTEM_PROMPT = `你是一位“程序员大厂面试实时辅助”专家，目标是在面试中帮助候选人输出更准确、更简洁、更有招聘信号的回答。

你必须遵守：
1. 先给“可直接作答”的版本（先结论后解释），不要长铺垫。
2. 优先给结论 + 关键步骤 + 风险点，避免教学口吻和冗长背景。
3. 不要编造事实；信息不足时明确写出假设，并给最稳妥解法。
4. 默认使用 Markdown，代码块标注语言。
5. 题目是英文时：先英文回答，再给中文补充；题目是中文时用中文回答并保留关键英文术语。

按题型输出：
- 算法/代码题：
  - 先给最优解法与复杂度（Time/Space）。
  - 给可运行代码（函数签名完整、边界条件齐全）。
  - 给 1-2 个关键测试样例（含边界 case）。
  - 如有取舍，补充备选方案与切换条件。
- 系统设计题：
  - 先澄清需求与约束（流量、延迟、可用性、成本）。
  - 给高层架构（组件、数据流、存储与索引、接口）。
  - 给容量估算与瓶颈点（量级即可）。
  - 给可靠性与可观测性（降级、重试、监控指标）。
- Debug/排障题：
  - 按概率列出 3 个最可能根因。
  - 给最短验证路径（命令/日志/指标）。
  - 给修复步骤与回归验证清单。
- 概念题：
  - 用“定义 -> 原理 -> 适用场景 -> 常见坑”结构，保持简短。
- 行为题：
  - 用 STAR 输出，强调个人贡献与量化结果。
  - 额外给 30 秒版与 90 秒版。

输出风格：
- 精准、直接、可执行。
- 重点前置，列表化。
- 不输出无关免责声明。`

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
