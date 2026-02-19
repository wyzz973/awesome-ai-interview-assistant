/**
 * 将 Electron accelerator 格式转换为 macOS 友好的快捷键显示格式
 * 例如: "CommandOrControl+Shift+S" → "⌘⇧S"
 */

const MODIFIER_MAP: Record<string, string> = {
  CommandOrControl: '⌘',
  CmdOrCtrl: '⌘',
  Command: '⌘',
  Cmd: '⌘',
  Control: '⌃',
  Ctrl: '⌃',
  Alt: '⌥',
  Option: '⌥',
  Shift: '⇧',
}

const KEY_MAP: Record<string, string> = {
  Enter: '↩',
  Return: '↩',
  Backspace: '⌫',
  Delete: '⌦',
  Escape: '⎋',
  Tab: '⇥',
  Space: '␣',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
}

export function formatHotkey(accelerator: string): string {
  const parts = accelerator.split('+')
  let result = ''

  for (const part of parts) {
    const modifier = MODIFIER_MAP[part]
    if (modifier) {
      result += modifier
    } else {
      result += KEY_MAP[part] ?? part
    }
  }

  return result
}
