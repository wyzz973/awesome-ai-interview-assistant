import { useState } from 'react'
import type { ReviewReport as ReviewReportType } from '@shared/types/session'
import Button from '../Common/Button'
import { FileText, RefreshCw, Download } from 'lucide-react'

interface ReviewReportProps {
  report: ReviewReportType | null
  loading?: boolean
  onRegenerate?: () => void
  onExportPDF?: () => void
  onExportMarkdown?: () => void
}

export default function ReviewReport({
  report,
  loading = false,
  onRegenerate,
  onExportPDF,
  onExportMarkdown
}: ReviewReportProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'questions' | 'performance' | 'suggestions'>('overview')

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-text-secondary">
        <RefreshCw className="animate-spin mb-3" size={24} />
        <span className="text-sm">正在生成复盘报告...</span>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-text-secondary">
        <FileText size={32} className="mb-3 opacity-50" />
        <span className="text-sm">暂无复盘报告</span>
        {onRegenerate && (
          <Button variant="secondary" size="sm" className="mt-4" onClick={onRegenerate}>
            生成报告
          </Button>
        )}
      </div>
    )
  }

  const tabs = [
    { key: 'overview' as const, label: '概况' },
    { key: 'questions' as const, label: '问题' },
    { key: 'performance' as const, label: '表现' },
    { key: 'suggestions' as const, label: '建议' }
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
        <h3 className="text-sm font-semibold text-text-primary">复盘报告</h3>
        <div className="flex gap-1.5">
          {onRegenerate && (
            <Button variant="ghost" size="sm" onClick={onRegenerate}>
              <RefreshCw size={14} />
              重新生成
            </Button>
          )}
          {onExportMarkdown && (
            <Button variant="ghost" size="sm" onClick={onExportMarkdown}>
              <Download size={14} />
              Markdown
            </Button>
          )}
          {onExportPDF && (
            <Button variant="ghost" size="sm" onClick={onExportPDF}>
              <Download size={14} />
              PDF
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border-default px-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-accent-primary text-accent-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <p className="text-sm text-text-primary leading-relaxed">{report.summary}</p>
            {report.keyTopics.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-text-secondary mb-2">涉及主题</h4>
                <div className="flex flex-wrap gap-1.5">
                  {report.keyTopics.map((topic, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 text-xs rounded-full bg-accent-primary/10 text-accent-primary"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'questions' && (
          <div className="space-y-2">
            {report.questions.length > 0 ? (
              report.questions.map((q, i) => (
                <div key={i} className="flex gap-2 text-sm text-text-primary">
                  <span className="text-text-secondary shrink-0">{i + 1}.</span>
                  <span>{q}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-text-secondary">暂无问题记录</p>
            )}
          </div>
        )}

        {activeTab === 'performance' && (
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-semibold text-accent-success mb-2">亮点</h4>
              {report.performance.strengths.length > 0 ? (
                <ul className="space-y-1.5">
                  {report.performance.strengths.map((s, i) => (
                    <li key={i} className="flex gap-2 text-sm text-text-primary">
                      <span className="text-accent-success shrink-0">+</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-secondary">暂无数据</p>
              )}
            </div>
            <div>
              <h4 className="text-xs font-semibold text-accent-warning mb-2">待改进</h4>
              {report.performance.weaknesses.length > 0 ? (
                <ul className="space-y-1.5">
                  {report.performance.weaknesses.map((w, i) => (
                    <li key={i} className="flex gap-2 text-sm text-text-primary">
                      <span className="text-accent-warning shrink-0">-</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-secondary">暂无数据</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'suggestions' && (
          <div className="space-y-2">
            {report.suggestions.length > 0 ? (
              report.suggestions.map((s, i) => (
                <div key={i} className="flex gap-2 text-sm text-text-primary">
                  <span className="text-accent-primary shrink-0">→</span>
                  <span>{s}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-text-secondary">暂无建议</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** 导出报告为 Markdown 文本 */
export function exportReportAsMarkdown(report: ReviewReportType): string {
  const lines: string[] = []

  lines.push('# 面试复盘报告\n')
  lines.push(`生成时间: ${new Date(report.generatedAt).toLocaleString()}\n`)

  lines.push('## 概况\n')
  lines.push(report.summary + '\n')

  if (report.keyTopics.length > 0) {
    lines.push('## 涉及主题\n')
    lines.push(report.keyTopics.map((t) => `- ${t}`).join('\n') + '\n')
  }

  if (report.questions.length > 0) {
    lines.push('## 面试问题\n')
    report.questions.forEach((q, i) => {
      lines.push(`${i + 1}. ${q}`)
    })
    lines.push('')
  }

  lines.push('## 表现评估\n')
  if (report.performance.strengths.length > 0) {
    lines.push('### 亮点\n')
    lines.push(report.performance.strengths.map((s) => `- ${s}`).join('\n') + '\n')
  }
  if (report.performance.weaknesses.length > 0) {
    lines.push('### 待改进\n')
    lines.push(report.performance.weaknesses.map((w) => `- ${w}`).join('\n') + '\n')
  }

  if (report.suggestions.length > 0) {
    lines.push('## 改进建议\n')
    lines.push(report.suggestions.map((s) => `- ${s}`).join('\n') + '\n')
  }

  return lines.join('\n')
}
