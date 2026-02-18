/** 主题颜色变量定义 */

export const darkTheme = {
  // 背景色
  bg: {
    primary: '#0f1117',
    secondary: '#1a1d27',
    tertiary: '#242836',
    elevated: '#2a2e3d',
    hover: '#323748',
  },
  // 文字色
  text: {
    primary: '#e4e6ed',
    secondary: '#9ca0ae',
    muted: '#6b7084',
    inverse: '#0f1117',
  },
  // 边框色
  border: {
    default: '#2e3347',
    subtle: '#232738',
    focus: '#5b8def',
  },
  // 品牌/强调色
  accent: {
    primary: '#5b8def',
    primaryHover: '#4a7de0',
    secondary: '#34d399',
    danger: '#f87171',
    warning: '#fbbf24',
  },
  // 状态色
  status: {
    success: '#34d399',
    error: '#f87171',
    info: '#60a5fa',
    warning: '#fbbf24',
  },
} as const

export const lightTheme = {
  bg: {
    primary: '#ffffff',
    secondary: '#f8f9fc',
    tertiary: '#f1f3f8',
    elevated: '#ffffff',
    hover: '#eef0f6',
  },
  text: {
    primary: '#1a1d27',
    secondary: '#5f6577',
    muted: '#9ca0ae',
    inverse: '#ffffff',
  },
  border: {
    default: '#e2e5ee',
    subtle: '#eef0f6',
    focus: '#5b8def',
  },
  accent: {
    primary: '#5b8def',
    primaryHover: '#4a7de0',
    secondary: '#10b981',
    danger: '#ef4444',
    warning: '#f59e0b',
  },
  status: {
    success: '#10b981',
    error: '#ef4444',
    info: '#3b82f6',
    warning: '#f59e0b',
  },
} as const

export type Theme = typeof darkTheme
