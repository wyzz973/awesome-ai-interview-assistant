import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // 后续会在这里暴露 IPC 方法

  /** 截屏选区：确认选区 */
  selectorConfirm: (region: { x: number; y: number; width: number; height: number }): void => {
    ipcRenderer.send('selector:confirm', region)
  },
  /** 截屏选区：取消选区 */
  selectorCancel: (): void => {
    ipcRenderer.send('selector:cancel')
  },
})
