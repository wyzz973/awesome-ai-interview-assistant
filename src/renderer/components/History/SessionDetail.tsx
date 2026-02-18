import { ArrowLeft, RefreshCw } from 'lucide-react'
import { useHistoryStore } from '../../stores/historyStore'
import { Button, IconButton, Loading, StatusBadge } from '../Common'
import ExportButton from './ExportButton'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function SessionDetail({ onBack }: { onBack: () => void }) {
  const {
    currentSession,
    transcripts,
    screenshotQAs,
    review,
    loading,
    generateReview,
  } = useHistoryStore()

  if (!currentSession) return null

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-border-default">
        <IconButton icon={<ArrowLeft size={16} />} size="sm" label="返回" onClick={onBack} />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-text-primary truncate">
            {currentSession.company} - {currentSession.position}
          </h3>
          <span className="text-[11px] text-text-muted">
            {new Date(currentSession.startTime).toLocaleString('zh-CN')}
          </span>
        </div>
        <ExportButton sessionId={currentSession.id} />
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {/* 转写全文 */}
        <section>
          <h4 className="text-xs font-semibold text-text-secondary mb-3 uppercase tracking-wide">转写记录</h4>
          {transcripts.length === 0 ? (
            <p className="text-sm text-text-muted">暂无转写记录</p>
          ) : (
            <div className="space-y-2">
              {transcripts.map((t) => (
                <div key={t.id} className="flex gap-2">
                  <StatusBadge
                    variant={t.speaker === 'interviewer' ? 'warning' : 'info'}
                    className="shrink-0 mt-0.5"
                  >
                    {t.speaker === 'interviewer' ? '面试官' : '我'}
                  </StatusBadge>
                  <p className="text-sm text-text-primary leading-relaxed">{t.text}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 截屏问答 */}
        {screenshotQAs.length > 0 && (
          <section>
            <h4 className="text-xs font-semibold text-text-secondary mb-3 uppercase tracking-wide">截屏问答</h4>
            <div className="space-y-4">
              {screenshotQAs.map((qa) => (
                <div key={qa.id} className="p-3 rounded-lg bg-bg-tertiary/50 border border-border-subtle space-y-2">
                  <img
                    src={`file://${qa.imagePath}`}
                    alt="截屏"
                    className="rounded-md border border-border-default max-h-48 object-contain"
                  />
                  <p className="text-xs text-text-muted">{qa.question}</p>
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{qa.answer}</ReactMarkdown>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 复盘报告 */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">复盘报告</h4>
            <Button
              size="sm"
              variant="ghost"
              loading={loading}
              onClick={() => generateReview(currentSession.id)}
            >
              <RefreshCw size={14} />
              {review ? '重新生成' : '生成报告'}
            </Button>
          </div>

          {loading && <Loading text="生成报告中..." />}

          {review && !loading && (
            <div className="space-y-4">
              <p className="text-sm text-text-primary leading-relaxed">{review.summary}</p>

              {review.questions.length > 0 && (
                <div>
                  <h5 className="text-xs font-medium text-text-secondary mb-1.5">面试题目</h5>
                  <ul className="space-y-1">
                    {review.questions.map((q, i) => (
                      <li key={i} className="text-sm text-text-primary pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-text-muted">
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-accent-success/5 border border-accent-success/20">
                  <h5 className="text-xs font-medium text-accent-success mb-2">优势</h5>
                  <ul className="space-y-1">
                    {review.performance.strengths.map((s, i) => (
                      <li key={i} className="text-xs text-text-secondary">{s}</li>
                    ))}
                  </ul>
                </div>
                <div className="p-3 rounded-lg bg-accent-danger/5 border border-accent-danger/20">
                  <h5 className="text-xs font-medium text-accent-danger mb-2">待改进</h5>
                  <ul className="space-y-1">
                    {review.performance.weaknesses.map((w, i) => (
                      <li key={i} className="text-xs text-text-secondary">{w}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {review.keyTopics.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {review.keyTopics.map((topic, i) => (
                    <StatusBadge key={i} variant="neutral">{topic}</StatusBadge>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
