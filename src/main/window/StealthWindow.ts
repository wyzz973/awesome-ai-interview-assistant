import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { DEFAULT_APPEARANCE } from '@shared/constants'
import type { AppearanceConfig } from '@shared/types/config'
import { getLogger } from '../logger'

const log = getLogger('StealthWindow')

export class StealthWindow {
  private window: BrowserWindow | null = null
  private opacity: number = DEFAULT_APPEARANCE.opacity
  private isInteractable: boolean = true

  create(appearance?: Partial<AppearanceConfig>): BrowserWindow {
    log.debug('创建隐身窗口')
    const { width: screenWidth, height: screenHeight, x: screenX, y: screenY } = screen.getPrimaryDisplay().workArea
    const winWidth = appearance?.panelWidth ?? DEFAULT_APPEARANCE.panelWidth
    const winHeight = appearance?.panelHeight ?? DEFAULT_APPEARANCE.panelHeight
    const startPosition = appearance?.startPosition ?? DEFAULT_APPEARANCE.startPosition
    this.opacity = appearance?.opacity ?? DEFAULT_APPEARANCE.opacity

    // 计算起始位置（默认右侧，可配置）
    let x = screenX + (screenWidth - winWidth - 20)
    let y = screenY + Math.round((screenHeight - winHeight) / 2)
    if (startPosition === 'center') {
      x = screenX + Math.round((screenWidth - winWidth) / 2)
      y = screenY + Math.round((screenHeight - winHeight) / 2)
    } else if (typeof startPosition === 'object') {
      x = startPosition.x
      y = startPosition.y
    }

    this.window = new BrowserWindow({
      width: winWidth,
      height: winHeight,
      x,
      y,
      show: false,
      transparent: !is.dev,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      focusable: true,
      resizable: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    })

    // 开发模式下关闭内容保护，方便截图调试
    if (!is.dev) {
      this.window.setContentProtection(true)
    }
    this.window.setAlwaysOnTop(true, 'floating')
    this.window.setOpacity(this.opacity)

    this.window.on('closed', () => {
      this.window = null
    })

    return this.window
  }

  show(): void {
    if (!this.window) return
    this.window.show()
  }

  hide(): void {
    if (!this.window) return
    this.window.hide()
  }

  toggle(): void {
    if (!this.window) return
    log.debug('切换窗口可见性', { visible: !this.window.isVisible() })
    if (this.window.isVisible()) {
      this.hide()
    } else {
      this.show()
    }
  }

  setOpacity(value: number): void {
    this.opacity = Math.max(0.1, Math.min(1.0, value))
    if (this.window) {
      this.window.setOpacity(this.opacity)
    }
  }

  resize(width: number, height: number): void {
    if (!this.window) return
    const safeWidth = Math.max(320, Math.round(width))
    const safeHeight = Math.max(360, Math.round(height))
    this.window.setSize(safeWidth, safeHeight)
  }

  increaseOpacity(step: number = 0.1): void {
    this.setOpacity(this.opacity + step)
  }

  decreaseOpacity(step: number = 0.1): void {
    this.setOpacity(this.opacity - step)
  }

  enableInteraction(): void {
    if (!this.window) return
    this.isInteractable = true
    this.window.setIgnoreMouseEvents(false)
    this.window.setFocusable(true)
  }

  disableInteraction(): void {
    if (!this.window) return
    this.isInteractable = false
    this.window.setIgnoreMouseEvents(true, { forward: true })
    this.window.setFocusable(false)
  }

  toggleInteraction(): void {
    if (this.isInteractable) {
      this.disableInteraction()
    } else {
      this.enableInteraction()
    }
  }

  isInteractionEnabled(): boolean {
    return this.isInteractable
  }

  getWindow(): BrowserWindow | null {
    return this.window
  }
}
