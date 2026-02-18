import { app, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { DEFAULT_HOTKEYS } from '@shared/constants'
import type { HotkeyConfig } from '@shared/types/hotkey'

export type TrayStatus = 'ready' | 'recording'

export interface TrayCallbacks {
  onScreenshot: () => void
  onToggleRecording: () => void
  onToggleWindow: () => void
  onShowHistory: () => void
  onShowSettings: () => void
}

export class TrayManager {
  private tray: Tray | null = null
  private status: TrayStatus = 'ready'
  private callbacks: TrayCallbacks | null = null
  private hotkeys: HotkeyConfig = DEFAULT_HOTKEYS

  create(callbacks: TrayCallbacks): void {
    this.callbacks = callbacks

    const iconPath = join(__dirname, '../../resources/tray-icon.png')
    const icon = nativeImage.createFromPath(iconPath)
    icon.setTemplateImage(true)

    this.tray = new Tray(icon)
    this.tray.setToolTip('AI 面试助手')
    this.updateMenu()
  }

  /** 更新菜单（状态或快捷键变更后调用） */
  updateMenu(): void {
    if (!this.tray || !this.callbacks) return

    const isRecording = this.status === 'recording'
    const cb = this.callbacks
    const hk = this.hotkeys

    // 将 Electron accelerator 转为显示用的快捷键文本
    const formatAccelerator = (acc: string): string => {
      return acc
        .replace('CommandOrControl', process.platform === 'darwin' ? '⌘' : 'Ctrl')
        .replace('Shift', process.platform === 'darwin' ? '⇧' : 'Shift')
        .replace('Alt', process.platform === 'darwin' ? '⌥' : 'Alt')
        .replace(/\+/g, '')
    }

    const menu = Menu.buildFromTemplate([
      {
        label: `截屏分析    ${formatAccelerator(hk.screenshot)}`,
        click: () => cb.onScreenshot(),
      },
      {
        label: isRecording
          ? `停止录音    ${formatAccelerator(hk.toggleRecording)}`
          : `开始录音    ${formatAccelerator(hk.toggleRecording)}`,
        click: () => cb.onToggleRecording(),
      },
      { type: 'separator' },
      {
        label: `显示/隐藏    ${formatAccelerator(hk.toggleWindow)}`,
        click: () => cb.onToggleWindow(),
      },
      {
        label: '面试记录',
        click: () => cb.onShowHistory(),
      },
      {
        label: '设置',
        click: () => cb.onShowSettings(),
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => app.quit(),
      },
    ])

    this.tray.setContextMenu(menu)
  }

  /** 更新录音状态并刷新菜单 */
  setStatus(status: TrayStatus): void {
    this.status = status
    this.updateMenu()
  }

  /** 更新快捷键配置并刷新菜单 */
  setHotkeys(hotkeys: HotkeyConfig): void {
    this.hotkeys = hotkeys
    this.updateMenu()
  }

  /** 销毁托盘 */
  destroy(): void {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
    this.callbacks = null
  }
}
