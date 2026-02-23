import log from 'electron-log/main'
import { app } from 'electron'
import { resolveLogPath, cleanOldLogs } from './transports'

let initialized = false

export function isIgnorableStreamWriteError(err: NodeJS.ErrnoException): boolean {
  if (!err) return false
  return err.code === 'EPIPE' || err.code === 'EIO' || err.code === 'ERR_STREAM_DESTROYED'
}

/**
 * 初始化日志系统（应在 app.whenReady 后调用一次）
 */
export function initializeLogger(): void {
  if (initialized) return

  // 忽略 stdout/stderr 写入错误（EPIPE/EIO），
  // 当启动 Electron 的终端关闭、stdio 失效时 electron-log console transport 会触发。
  // 这些错误不应导致主进程崩溃。
  process.stdout?.on?.('error', (err: NodeJS.ErrnoException) => {
    if (!isIgnorableStreamWriteError(err)) throw err
  })
  process.stderr?.on?.('error', (err: NodeJS.ErrnoException) => {
    if (!isIgnorableStreamWriteError(err)) throw err
  })

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
