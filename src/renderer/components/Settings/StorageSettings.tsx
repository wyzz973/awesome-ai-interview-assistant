import { useSettingsStore } from '../../stores/settingsStore'
import { Button, Input } from '../Common'
import { toast } from '../Common'
import { FolderOpen, Trash2, Download } from 'lucide-react'

export default function StorageSettings() {
  const { config, updateStorage } = useSettingsStore()
  if (!config) return null

  const { storage } = config

  const handleExport = async () => {
    try {
      const config = await window.api.configExport()
      if (!config) {
        toast.error('导出失败：无法读取配置')
        return
      }

      // BUG-24: mask 敏感字段
      const safeConfig = JSON.parse(JSON.stringify(config))
      for (const role of ['screenshot', 'chat', 'review'] as const) {
        if (safeConfig.llm?.[role]?.apiKey) {
          safeConfig.llm[role].apiKey = '***'
        }
      }
      if (safeConfig.asr?.whisper?.apiKey) safeConfig.asr.whisper.apiKey = '***'
      if (safeConfig.asr?.aliyun?.accessKeyId) safeConfig.asr.aliyun.accessKeyId = '***'
      if (safeConfig.asr?.aliyun?.accessKeySecret) safeConfig.asr.aliyun.accessKeySecret = '***'
      if (safeConfig.asr?.tencent?.secretId) safeConfig.asr.tencent.secretId = '***'
      if (safeConfig.asr?.tencent?.secretKey) safeConfig.asr.tencent.secretKey = '***'

      // BUG-25: 生成文件下载
      const json = JSON.stringify(safeConfig, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const today = new Date().toISOString().slice(0, 10)
      const a = document.createElement('a')
      a.href = url
      a.download = `config-export-${today}.json`
      a.click()
      URL.revokeObjectURL(url)

      toast.success('配置已导出')
    } catch {
      toast.error('导出失败')
    }
  }

  return (
    <div className="space-y-5">
      {/* 数据目录 */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-text-secondary">数据存储目录</label>
        <div className="flex items-center gap-2">
          <div className="flex-1 px-3 py-2 text-sm text-text-secondary bg-bg-tertiary rounded-lg border border-border-default truncate">
            {storage.dataDir}
          </div>
          <button
            className="shrink-0 h-9 w-9 rounded-lg bg-bg-tertiary border border-border-default text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer flex items-center justify-center"
            title="选择目录"
          >
            <FolderOpen size={16} />
          </button>
        </div>
      </div>

      {/* 截屏保留天数 */}
      <Input
        label="截屏保留天数"
        type="number"
        value={String(storage.screenshotRetentionDays)}
        onChange={(e) =>
          updateStorage({ screenshotRetentionDays: parseInt(e.target.value) || 90 })
        }
      />

      {/* 数据库大小上限 */}
      <Input
        label="数据库大小上限 (MB)"
        type="number"
        value={String(storage.maxDatabaseSizeMB)}
        onChange={(e) =>
          updateStorage({ maxDatabaseSizeMB: parseInt(e.target.value) || 500 })
        }
      />

      {/* 操作按钮 */}
      <div className="flex gap-2 pt-2">
        <Button size="sm" variant="secondary" onClick={handleExport}>
          <Download size={14} />
          导出配置
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={() => toast.info('清理功能将在后续版本实现')}
        >
          <Trash2 size={14} />
          清理数据
        </Button>
      </div>
    </div>
  )
}
