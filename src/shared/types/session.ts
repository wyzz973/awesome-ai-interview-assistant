/** 面试会话 */
export interface Session {
  id: string
  company: string
  position: string
  startTime: number
  endTime: number
  duration: number
  status: 'recording' | 'completed' | 'reviewed'
}

/** 历史列表项（用于归档检索） */
export interface SessionListItem {
  id: string
  company: string
  position: string
  round: string
  summary: string
  startTime: number
  duration: number
  status: 'recording' | 'completed' | 'reviewed'
}

/** 转写记录条目 */
export interface TranscriptEntry {
  id: string
  sessionId: string
  timestamp: number
  speaker: 'interviewer' | 'me'
  text: string
  isFinal: boolean
}

/** 截屏问答记录 */
export interface ScreenshotQA {
  id: string
  sessionId: string
  timestamp: number
  imagePath: string
  question: string
  answer: string
  model: string
}

/** 复盘报告 */
export interface ReviewReport {
  id: string
  sessionId: string
  generatedAt: number
  summary: string
  questions: string[]
  performance: {
    strengths: string[]
    weaknesses: string[]
  }
  suggestions: string[]
  keyTopics: string[]
}

/** 会话绑定的上下文（简历/轮次/背景） */
export interface SessionContext {
  sessionId: string
  round: string
  backgroundNote: string
  resumeFileName: string
  resumeFilePath: string
  resumeText: string
  createdAt: number
  updatedAt: number
}
