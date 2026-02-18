import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { DEFAULT_APPEARANCE } from '@shared/constants'

export class StealthWindow {
  private window: BrowserWindow | null = null
  private opacity: number = DEFAULT_APPEARANCE.opacity
  private isInteractable: boolean = false

  create(): BrowserWindow {
    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

    const winWidth = DEFAULT_APPEARANCE.panelWidth
    const winHeight = DEFAULT_APPEARANCE.panelHeight

    // 计算起始位置（默认右侧）
    const x = screenWidth - winWidth - 20
    const y = Math.round((screenHeight - winHeight) / 2)

    this.window = new BrowserWindow({
      width: winWidth,
      height: winHeight,
      x,
      y,
      show: false,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      focusable: false,
      resizable: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    })

    this.window.setContentProtection(true)
    this.window.setAlwaysOnTop(true, 'floating')
    this.window.setIgnoreMouseEvents(true, { forward: true })
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

  getWindow(): BrowserWindow | null {
    return this.window
  }
}
