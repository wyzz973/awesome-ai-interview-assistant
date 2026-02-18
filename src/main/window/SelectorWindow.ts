import { BrowserWindow, screen, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

export interface SelectionRegion {
  x: number
  y: number
  width: number
  height: number
}

export class SelectorWindow {
  private window: BrowserWindow | null = null

  /** 打开选区窗口，返回用户选择的区域，取消返回 null */
  selectRegion(): Promise<SelectionRegion | null> {
    return new Promise((resolve) => {
      const display = screen.getPrimaryDisplay()
      const { width, height } = display.size

      this.window = new BrowserWindow({
        width,
        height,
        x: 0,
        y: 0,
        fullscreen: true,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        hasShadow: false,
        resizable: false,
        movable: false,
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          sandbox: false,
        },
      })

      this.window.setAlwaysOnTop(true, 'screen-saver')

      const onConfirm = (_event: Electron.IpcMainEvent, region: SelectionRegion): void => {
        cleanup()
        resolve(region)
      }

      const onCancel = (): void => {
        cleanup()
        resolve(null)
      }

      const cleanup = (): void => {
        ipcMain.removeListener('selector:confirm', onConfirm)
        ipcMain.removeListener('selector:cancel', onCancel)
        if (this.window && !this.window.isDestroyed()) {
          this.window.close()
        }
        this.window = null
      }

      ipcMain.once('selector:confirm', onConfirm)
      ipcMain.once('selector:cancel', onCancel)

      this.window.on('closed', () => {
        ipcMain.removeListener('selector:confirm', onConfirm)
        ipcMain.removeListener('selector:cancel', onCancel)
        this.window = null
        resolve(null)
      })

      // 加载选区页面 — 使用 hash 路由区分
      if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        this.window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/selector`)
      } else {
        this.window.loadFile(join(__dirname, '../renderer/index.html'), {
          hash: '/selector',
        })
      }

      this.window.once('ready-to-show', () => {
        this.window?.show()
      })
    })
  }

  close(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close()
    }
    this.window = null
  }
}
