import { desktopCapturer, screen } from 'electron'
import type { NativeImage } from 'electron'
import type { StealthWindow } from '../window/StealthWindow'
import type { SelectorWindow, SelectionRegion } from '../window/SelectorWindow'

export interface CaptureResult {
  image: Buffer
  imageBase64: string
  region: SelectionRegion
}

export class ScreenCapture {
  private stealthWindow: StealthWindow
  private selectorWindow: SelectorWindow

  constructor(stealthWindow: StealthWindow, selectorWindow: SelectorWindow) {
    this.stealthWindow = stealthWindow
    this.selectorWindow = selectorWindow
  }

  /** 完整截屏流程：隐藏窗口 → 截全屏 → 选区 → 裁剪 → 恢复窗口 */
  async captureRegion(): Promise<CaptureResult | null> {
    // 隐藏隐身窗口避免截到自身
    this.stealthWindow.hide()

    try {
      // 先截取全屏图像
      const fullImage = await this.captureFullScreen()
      const screenshotDataURL = fullImage.toDataURL()

      // 打开选区窗口，把截图当背景
      const region = await this.selectorWindow.selectRegion(screenshotDataURL)
      if (!region) return null

      // 从已截取的全屏图像中裁剪选区
      const scaleFactor = screen.getPrimaryDisplay().scaleFactor
      const cropped = fullImage.crop({
        x: Math.round(region.x * scaleFactor),
        y: Math.round(region.y * scaleFactor),
        width: Math.round(region.width * scaleFactor),
        height: Math.round(region.height * scaleFactor),
      })

      const pngBuffer = cropped.toPNG()
      const base64 = pngBuffer.toString('base64')

      return { image: pngBuffer, imageBase64: base64, region }
    } finally {
      // 恢复隐身窗口
      this.stealthWindow.show()
    }
  }

  /** 截取全屏 */
  private async captureFullScreen(): Promise<NativeImage> {
    const display = screen.getPrimaryDisplay()
    const scaleFactor = display.scaleFactor

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: display.size.width * scaleFactor,
        height: display.size.height * scaleFactor,
      },
    })

    const primarySource = sources[0]
    if (!primarySource) {
      throw new Error('No screen source available')
    }

    return primarySource.thumbnail
  }
}
