import { desktopCapturer, screen } from 'electron'
import type { Display, NativeImage } from 'electron'
import type { StealthWindow } from '../window/StealthWindow'
import { getLogger } from '../logger'

const log = getLogger('ScreenCapture')

export interface CaptureRegion {
  x: number
  y: number
  width: number
  height: number
}

export interface CaptureResult {
  image: Buffer
  imageBase64: string
  region: CaptureRegion
}

export class ScreenCapture {
  private stealthWindow: StealthWindow

  constructor(stealthWindow: StealthWindow) {
    this.stealthWindow = stealthWindow
  }

  /** 自动截取当前屏幕（鼠标所在显示器） */
  async captureRegion(): Promise<CaptureResult | null> {
    log.debug('开始自动截屏')
    const wasVisible = this.stealthWindow.getWindow()?.isVisible() ?? false
    if (wasVisible) {
      this.stealthWindow.hide()
    }

    try {
      const display = this.getTargetDisplay()
      const image = await this.captureDisplay(display)
      const pngBuffer = image.toPNG()
      const base64 = pngBuffer.toString('base64')
      const region: CaptureRegion = {
        x: 0,
        y: 0,
        width: display.size.width,
        height: display.size.height,
      }

      log.debug('自动截屏完成', { width: region.width, height: region.height, displayId: display.id })
      return { image: pngBuffer, imageBase64: base64, region }
    } finally {
      if (wasVisible) {
        this.stealthWindow.show()
      }
    }
  }

  private getTargetDisplay(): Display {
    const cursorPoint = screen.getCursorScreenPoint()
    return screen.getDisplayNearestPoint(cursorPoint)
  }

  /** 截取指定显示器 */
  private async captureDisplay(display: Display): Promise<NativeImage> {
    const scaleFactor = display.scaleFactor || 1

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.max(1, Math.round(display.size.width * scaleFactor)),
        height: Math.max(1, Math.round(display.size.height * scaleFactor)),
      },
    })

    const displayId = String(display.id)
    const source = sources.find((item) => item.display_id === displayId) ?? sources[0]
    if (!source) {
      throw new Error('No screen source available')
    }
    if (source.display_id !== displayId) {
      log.warn('未匹配到当前显示器来源，回退首个屏幕源', {
        expectedDisplayId: displayId,
        selectedSource: source.id,
      })
    }
    if (source.thumbnail.isEmpty()) {
      throw new Error('Captured screen source is empty')
    }

    return source.thumbnail
  }
}
