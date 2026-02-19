import log from 'electron-log/main'
import { app } from 'electron'
import { resolveLogPath, cleanOldLogs } from './transports'

let initialized = false

/**
 * 初始化日志系统（应在 app.whenReady 后调用一次）
 */
export function initializeLogger(): void {
  if (initialized) return

  const isDev = !app.isPackaged

  // 文件 transport 配置
  log.transports.file.resolvePathFn = resolveLogPath
  log.transports.file.level = isDev ? 'debug' : 'info'
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {scope} {text}'
  log.transports.file.maxSize = 0

  // 控制台 transport 配置
  log.transports.console.level = isDev ? 'debug' : 'warn'

  // 清理旧日志
  cleanOldLogs(7)

  // 初始化渲染器进程日志接收
  log.initialize()

  initialized = true
}

/**
 * 获取带 scope 的 logger 实例
 */
export function getLogger(scope: string) {
  return log.scope(scope)
}

export default log
