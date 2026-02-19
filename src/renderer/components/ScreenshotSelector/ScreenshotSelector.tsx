import { useCallback, useEffect, useRef, useState } from 'react'

interface Point {
  x: number
  y: number
}

interface Region {
  x: number
  y: number
  width: number
  height: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api as {
  selectorConfirm: (region: Region) => void
  selectorCancel: () => void
  selectorRequestScreenshot: () => void
  onSelectorScreenshot: (callback: (dataURL: string) => void) => () => void
}

function ScreenshotSelector(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bgImageRef = useRef<HTMLImageElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [startPoint, setStartPoint] = useState<Point | null>(null)
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null)
  const [imageReady, setImageReady] = useState(false)

  // 请求截图数据
  useEffect(() => {
    const cleanup = api.onSelectorScreenshot((dataURL: string) => {
      const img = new Image()
      img.onload = () => {
        bgImageRef.current = img
        setImageReady(true)
      }
      img.onerror = () => {
        // 图片加载失败，仍标记为就绪以显示遮罩（允许用户 ESC 退出）
        setImageReady(true)
      }
      img.src = dataURL
    })

    api.selectorRequestScreenshot()
    return cleanup
  }, [])

  const getRegion = useCallback((): Region | null => {
    if (!startPoint || !currentPoint) return null
    const x = Math.min(startPoint.x, currentPoint.x)
    const y = Math.min(startPoint.y, currentPoint.y)
    const width = Math.abs(currentPoint.x - startPoint.x)
    const height = Math.abs(currentPoint.y - startPoint.y)
    if (width < 5 || height < 5) return null
    return { x, y, width, height }
  }, [startPoint, currentPoint])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    // 绘制截图作为背景（无图时填充黑色避免白屏）
    if (bgImageRef.current) {
      ctx.drawImage(bgImageRef.current, 0, 0, canvas.width, canvas.height)
    } else {
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    // 半透明遮罩
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const region = getRegion()
    if (!region) return

    // 清除选区区域并重新绘制背景（露出清晰的截图）
    if (bgImageRef.current) {
      ctx.drawImage(
        bgImageRef.current,
        region.x * (bgImageRef.current.width / canvas.width),
        region.y * (bgImageRef.current.height / canvas.height),
        region.width * (bgImageRef.current.width / canvas.width),
        region.height * (bgImageRef.current.height / canvas.height),
        region.x,
        region.y,
        region.width,
        region.height,
      )
    } else {
      ctx.clearRect(region.x, region.y, region.width, region.height)
    }

    // 选区边框
    ctx.strokeStyle = '#00aaff'
    ctx.lineWidth = 2
    ctx.strokeRect(region.x, region.y, region.width, region.height)

    // 尺寸标注
    const label = `${region.width} × ${region.height}`
    ctx.font = '13px monospace'
    const textMetrics = ctx.measureText(label)
    const textHeight = 18
    const padding = 4
    const labelX = region.x
    const labelY = region.y > textHeight + padding * 2 + 4
      ? region.y - textHeight - padding
      : region.y + region.height + 4

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.fillRect(
      labelX,
      labelY,
      textMetrics.width + padding * 2,
      textHeight + padding,
    )
    ctx.fillStyle = '#ffffff'
    ctx.fillText(label, labelX + padding, labelY + textHeight)
  }, [getRegion, imageReady])

  useEffect(() => {
    draw()
  }, [draw])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true)
    setStartPoint({ x: e.clientX, y: e.clientY })
    setCurrentPoint({ x: e.clientX, y: e.clientY })
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return
    setCurrentPoint({ x: e.clientX, y: e.clientY })
  }, [isDragging])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const confirm = useCallback(() => {
    const region = getRegion()
    if (region) {
      api.selectorConfirm(region)
    }
  }, [getRegion])

  const cancel = useCallback(() => {
    api.selectorCancel()
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') {
        confirm()
      } else if (e.key === 'Escape') {
        cancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [confirm, cancel])

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        cursor: 'crosshair',
        zIndex: 99999,
      }}
    />
  )
}

export default ScreenshotSelector
