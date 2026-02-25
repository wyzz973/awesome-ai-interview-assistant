import type { HealthSnapshot, HealthCheck } from '@shared/types/health'

interface HealthStatusBarProps {
  snapshot: HealthSnapshot | null
  compact?: boolean
}

function stateClass(state: HealthCheck['state']): string {
  if (state === 'ok') return 'text-accent-success border-accent-success/25 bg-accent-success/10'
  if (state === 'warn') return 'text-accent-warning border-accent-warning/25 bg-accent-warning/10'
  if (state === 'error') return 'text-accent-danger border-accent-danger/25 bg-accent-danger/10'
  return 'text-text-muted border-border-default bg-bg-tertiary/60'
}

function stateLabel(state: HealthCheck['state']): string {
  if (state === 'ok') return '正常'
  if (state === 'warn') return '告警'
  if (state === 'error') return '异常'
  return '未知'
}

function latencyLabel(latencyMs: number | null): string {
  if (!Number.isFinite(latencyMs ?? NaN)) return '-'
  return `${Math.round(latencyMs ?? 0)}ms`
}

function HealthItem({
  title,
  check,
}: {
  title: string
  check: HealthCheck
}) {
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] ${stateClass(check.state)}`}>
      <span className="font-medium">{title}</span>
      <span>{stateLabel(check.state)}</span>
      <span className="opacity-80">{latencyLabel(check.latencyMs)}</span>
    </div>
  )
}

export default function HealthStatusBar({ snapshot, compact = false }: HealthStatusBarProps) {
  if (!snapshot) {
    return (
      <div className={`text-[11px] text-text-muted ${compact ? '' : 'px-3 py-2 border-b border-border-default'}`}>
        健康状态加载中...
      </div>
    )
  }

  const containerClass = compact
    ? 'flex flex-wrap items-center gap-1.5'
    : 'flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border-default bg-bg-secondary'

  return (
    <div className={containerClass}>
      <HealthItem title="音频" check={snapshot.checks.audio} />
      <HealthItem title="ASR" check={snapshot.checks.asr} />
      <HealthItem title="LLM" check={snapshot.checks.llm} />
      <span className="text-[11px] text-text-muted px-1">
        门禁: {snapshot.gate.mode === 'strict' ? 'Strict' : 'Lenient'}
      </span>
    </div>
  )
}
