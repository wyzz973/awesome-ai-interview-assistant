import { useEffect, useMemo } from 'react'
import { Clock, Building, Briefcase, Trash2, ChevronRight } from 'lucide-react'
import { useHistoryStore, useFilteredSessions } from '../../stores/historyStore'
import { useAppStore } from '../../stores/appStore'
import { StatusBadge, Loading, IconButton, Button } from '../Common'
import { toast } from '../Common'
import type { Session } from '@shared/types'

function formatDuration(ms: number): string {
  const min = Math.floor(ms / 60000)
  return min < 60 ? `${min} 分钟` : `${Math.floor(min / 60)}h${min % 60}m`
}

function SessionCard({
  session,
  onSelect,
  onDelete,
}: {
  session: Session
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}) {
  const statusMap = {
    recording: { variant: 'error' as const, label: '录制中' },
    completed: { variant: 'success' as const, label: '已完成' },
    reviewed: { variant: 'info' as const, label: '已复盘' },
  }
  const status = statusMap[session.status]

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(session.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(session.id)
        }
      }}
      className="
        flex items-center gap-3 p-3 rounded-lg border border-border-subtle
        hover:bg-bg-hover hover:border-border-default
        transition-colors cursor-pointer group
        focus:outline-none focus:ring-2 focus:ring-border-focus/40
      "
    >
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <Building size={14} className="text-text-muted shrink-0" />
          <span className="text-sm font-medium text-text-primary truncate">{session.company}</span>
          <StatusBadge variant={status.variant} dot>{status.label}</StatusBadge>
        </div>
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span className="flex items-center gap-1">
            <Briefcase size={12} />
            {session.position}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {formatDuration(session.duration)}
          </span>
          <span>{new Date(session.startTime).toLocaleDateString('zh-CN')}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <IconButton
          icon={<Trash2 size={14} />}
          size="sm"
          label="删除"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(session.id)
          }}
          className="text-accent-danger hover:bg-accent-danger/10"
        />
        <ChevronRight size={16} className="text-text-muted" />
      </div>
    </div>
  )
}

export default function HistoryList({ onSelectSession }: { onSelectSession: (id: string) => void }) {
  const { filters, setFilters, loadSessions, deleteSession, loading, sessions } = useHistoryStore()
  const { setView } = useAppStore()
  const filtered = useFilteredSessions()

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  // 收集所有公司名用于筛选
  const companies = useMemo(
    () => [...new Set(sessions.map((s) => s.company))].sort(),
    [sessions]
  )

  const handleDelete = async (id: string) => {
    await deleteSession(id)
    toast.success('已删除')
  }

  if (loading) return <Loading text="加载历史记录..." />

  return (
    <div className="flex flex-col h-full">
      {/* 筛选栏 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-default">
        <select
          value={filters.company ?? ''}
          onChange={(e) => setFilters({ company: e.target.value || undefined })}
          className="h-7 px-2 text-xs rounded-md bg-bg-tertiary text-text-secondary border border-border-default focus:outline-none focus:border-border-focus"
        >
          <option value="">全部公司</option>
          {companies.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          value={filters.sortBy}
          onChange={(e) => setFilters({ sortBy: e.target.value as 'time-desc' | 'time-asc' })}
          className="h-7 px-2 text-xs rounded-md bg-bg-tertiary text-text-secondary border border-border-default focus:outline-none focus:border-border-focus"
        >
          <option value="time-desc">最新优先</option>
          <option value="time-asc">最早优先</option>
        </select>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full px-3">
            <div className="rounded-xl border border-border-default bg-bg-tertiary/60 p-4 text-center space-y-3 max-w-sm">
              <p className="text-sm text-text-primary font-medium">还没有可复盘的面试记录</p>
              <p className="text-xs text-text-muted">建议先开始一次 30-45 分钟的模拟面试，再回来生成复盘报告。</p>
              <Button size="sm" onClick={() => setView('answer')}>
                去开始一场面试
              </Button>
            </div>
          </div>
        ) : (
          filtered.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              onSelect={onSelectSession}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </div>
  )
}
