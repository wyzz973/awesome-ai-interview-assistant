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
  selectRegion(screenshotDataURL: string): Promise<SelectionRegion | null> {
    return new Promise((resolve) => {
      const display = screen.getPrimaryDisplay()
      const { width, height } = display.size

      this.window = new BrowserWindow({
        width,
        height,
        x: 0,
        y: 0,
        show: false,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        hasShadow: false,
        resizable: false,
        movable: false,
        enableLargerThanScreen: true,
        backgroundColor: '#000000',
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          sandbox: false,
        },
      })

      this.window.setAlwaysOnTop(true, 'screen-saver')
      this.window.setVisibleOnAllWorkspaces(true)

      const onConfirm = (_event: Electron.IpcMainEvent, region: SelectionRegion): void => {
        cleanup()
        resolve(region)
      }

      const onCancel = (): void => {
        cleanup()
        resolve(null)
      }

      // 渲染器请求截图数据
      const onRequestScreenshot = (event: Electron.IpcMainEvent): void => {
        event.reply('selector:screenshot', screenshotDataURL)
      }

      const cleanup = (): void => {
        ipcMain.removeListener('selector:confirm', onConfirm)
        ipcMain.removeListener('selector:cancel', onCancel)
        ipcMain.removeListener('selector:requestScreenshot', onRequestScreenshot)
        if (this.window && !this.window.isDestroyed()) {
          this.window.close()
        }
        this.window = null
      }

      ipcMain.once('selector:confirm', onConfirm)
      ipcMain.once('selector:cancel', onCancel)
      // 使用 on 而非 once，因为 React StrictMode 开发模式下组件会双重挂载
      // 导致 selectorRequestScreenshot 发送两次，once 只处理第一次
      ipcMain.on('selector:requestScreenshot', onRequestScreenshot)

      this.window.on('closed', () => {
        ipcMain.removeListener('selector:confirm', onConfirm)
        ipcMain.removeListener('selector:cancel', onCancel)
        ipcMain.removeListener('selector:requestScreenshot', onRequestScreenshot)
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
        this.window?.focus()
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
