import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '../Common'
import { toast } from '../Common'
import { useHistoryStore } from '../../stores/historyStore'

interface ExportButtonProps {
  sessionId: string
}

export default function ExportButton({ sessionId }: ExportButtonProps) {
  const { exportSession } = useHistoryStore()
  const [exporting, setExporting] = useState(false)

  const handleExport = async (format: 'pdf' | 'markdown' | 'json') => {
    setExporting(true)
    try {
      await exportSession(sessionId, format)
      toast.success(`导出 ${format.toUpperCase()} 成功`)
    } catch {
      toast.error('导出失败')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="secondary" loading={exporting} onClick={() => handleExport('pdf')}>
        <Download size={14} />
        PDF
      </Button>
      <Button size="sm" variant="secondary" loading={exporting} onClick={() => handleExport('markdown')}>
        <Download size={14} />
        Markdown
      </Button>
      <Button size="sm" variant="secondary" loading={exporting} onClick={() => handleExport('json')}>
        <Download size={14} />
        JSON
      </Button>
    </div>
  )
}
