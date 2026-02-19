/** 快捷键动作 */
export type HotkeyAction =
  | 'screenshot'
  | 'toggleWindow'
  | 'toggleStealth'
  | 'decreaseOpacity'
  | 'increaseOpacity'
  | 'toggleRecording'
  | 'sendMessage'

/** 快捷键配置：动作 -> Electron 加速键字符串 */
export type HotkeyConfig = Record<HotkeyAction, string>
