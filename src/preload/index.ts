import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // 后续会在这里暴露 IPC 方法
})
