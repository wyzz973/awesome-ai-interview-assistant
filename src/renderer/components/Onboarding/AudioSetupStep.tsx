import { useState, useEffect } from 'react'
import { Headphones, CheckCircle, AlertTriangle } from 'lucide-react'
import { Button, StatusBadge } from '../Common'

export default function AudioSetupStep() {
  const [blackholeInstalled, setBlackholeInstalled] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)

  const checkBlackHole = async () => {
    setChecking(true)
    try {
      const result = await Promise.race([
        window.api.audioCheckBlackhole(),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 3000)
        ),
      ])
      setBlackholeInstalled(result ? !!result.available : false)
    } catch {
      setBlackholeInstalled(false)
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    checkBlackHole()
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-primary/15 flex items-center justify-center">
          <Headphones size={20} className="text-accent-primary" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-text-primary">音频捕获设置</h3>
          <p className="text-xs text-text-muted">检测系统音频捕获环境</p>
        </div>
      </div>

      {/* BlackHole 检测 */}
      <div className="p-3 rounded-lg bg-bg-tertiary/50 border border-border-subtle space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-primary">BlackHole 虚拟音频设备</span>
          {blackholeInstalled === null ? (
            <StatusBadge variant="neutral">检测中...</StatusBadge>
          ) : blackholeInstalled ? (
            <StatusBadge variant="success" dot>
              <CheckCircle size={12} />
              已安装
            </StatusBadge>
          ) : (
            <StatusBadge variant="warning" dot>
              <AlertTriangle size={12} />
              未检测到
            </StatusBadge>
          )}
        </div>

        {blackholeInstalled === false && (
          <div className="text-xs text-text-muted space-y-1">
            <p>BlackHole 用于捕获系统音频（面试官的声音）。</p>
            <p>请安装 BlackHole 2ch 并在 macOS "Audio MIDI Setup" 中创建多输出设备。</p>
          </div>
        )}

        <Button size="sm" variant="secondary" loading={checking} onClick={checkBlackHole}>
          重新检测
        </Button>
      </div>
    </div>
  )
}
