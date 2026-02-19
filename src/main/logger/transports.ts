import { app } from 'electron'
import { join } from 'path'
import { readdirSync, statSync, unlinkSync } from 'fs'

/**
 * 生成按日期命名的日志文件路径
 * 格式: userData/logs/2026-02-19.log
 */
export function resolveLogPath(): string {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const fileName = `${yyyy}-${mm}-${dd}.log`
  return join(app.getPath('userData'), 'logs', fileName)
}

/**
 * 清理超过指定天数的旧日志文件
 */
export function cleanOldLogs(maxAgeDays: number = 7): void {
  const logsDir = join(app.getPath('userData'), 'logs')
  try {
    const files = readdirSync(logsDir)
    const now = Date.now()
    const maxAge = maxAgeDays * 24 * 60 * 60 * 1000

    for (const file of files) {
      if (!file.endsWith('.log')) continue
      const filePath = join(logsDir, file)
      const stat = statSync(filePath)
      if (now - stat.mtimeMs > maxAge) {
        unlinkSync(filePath)
      }
    }
  } catch {
    // logs 目录不存在时忽略
  }
}
