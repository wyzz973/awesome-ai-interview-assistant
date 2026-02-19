import log from 'electron-log/renderer'

/**
 * 获取渲染器进程的带 scope logger
 * 日志通过 IPC 自动转发到主进程写入文件
 */
export function getLogger(scope: string) {
  return log.scope(scope)
}

export default log
