'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { Eraser, RotateCcw, Check, Type, Edit3, Sparkles } from 'lucide-react'
import { Button } from './button'

interface SignaturePadProps {
  onSave: (dataUrl: string) => void
  initialValue?: string | null
  height?: number
  className?: string
}

interface Point {
  x: number
  y: number
  time: number
  pressure?: number
}

const FONT_STYLES = [
  { name: 'Classic Cursive', font: 'italic 38px "Dancing Script", "Caveat", cursive' },
  { name: 'Formal Script', font: '36px "Snell Roundhand", "Brush Script MT", cursive' },
  { name: 'Handwritten', font: 'bold 36px "Caveat", "Dancing Script", cursive' },
]

export function SignaturePad({
  onSave,
  initialValue = null,
  height = 200,
  className = '',
}: SignaturePadProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasContent, setHasContent] = useState(false)
  const [mode, setMode] = useState<'draw' | 'type'>('draw')
  const [typedName, setTypedName] = useState('')
  const [selectedFontIndex, setSelectedFontIndex] = useState(0)
  const [penColor, setPenColor] = useState('#1E1B4B') // Slate/Navy ink
  const [basePenWidth, setBasePenWidth] = useState(2.8)
  const [history, setHistory] = useState<ImageData[]>([])

  // Points buffer for active stroke
  const currentPointsRef = useRef<Point[]>([])
  const lastWidthRef = useRef<number>(2.8)

  // Clear canvas
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasContent(false)
    setHistory([])
    currentPointsRef.current = []
  }, [])

  // Save state snapshot for undo
  const saveState = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    try {
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
      setHistory((prev) => [...prev.slice(-12), data])
    } catch {
      // Ignore if context read fails
    }
  }, [])

  // Resize canvas to match display rect with Device Pixel Ratio (DPR)
  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const rect = container.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    const targetWidth = Math.floor(rect.width)
    const targetHeight = Math.floor(rect.height || height)

    // Save existing contents if any
    const ctx = canvas.getContext('2d')
    let tempImageData: ImageData | null = null;
    if (ctx && canvas.width > 0 && canvas.height > 0) {
      try {
        tempImageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      } catch {}
    }

    canvas.width = targetWidth * dpr
    canvas.height = targetHeight * dpr

    if (ctx) {
      ctx.scale(dpr, dpr)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      if (tempImageData) {
        ctx.putImageData(tempImageData, 0, 0)
      } else if (initialValue && initialValue.startsWith('data:image')) {
        const img = new Image()
        img.onload = () => {
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight)
          setHasContent(true)
        }
        img.src = initialValue
      }
    }
  }, [height, initialValue])

  // Sync canvas size on mount and container resize
  useEffect(() => {
    syncCanvasSize()
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => {
      syncCanvasSize()
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [syncCanvasSize])

  // Undo stroke
  const undo = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || history.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const newHistory = [...history]
    newHistory.pop() // Remove current frame
    const previous = newHistory[newHistory.length - 1]

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (previous) {
      ctx.putImageData(previous, 0, 0)
    } else {
      setHasContent(false)
    }
    setHistory(newHistory)
  }, [history])

  // Get point coordinates accurately in logical CSS pixels
  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      time: Date.now(),
      pressure: e.pressure && e.pressure > 0 ? e.pressure : undefined,
    }
  }

  // Calculate dynamic stroke width based on velocity & pressure for natural ink feel
  const computeStrokeWidth = (p1: Point, p2: Point) => {
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    const timeDelta = Math.max(p2.time - p1.time, 1)
    const speed = dist / timeDelta // px/ms

    // Faster speed -> slightly thinner stroke
    let targetWidth = basePenWidth
    if (speed > 0.5) {
      targetWidth = Math.max(basePenWidth * 0.6, basePenWidth - (speed - 0.5) * 1.2)
    } else if (speed < 0.1) {
      targetWidth = Math.min(basePenWidth * 1.4, basePenWidth + (0.1 - speed) * 3)
    }

    if (p2.pressure !== undefined) {
      targetWidth = basePenWidth * (0.5 + p2.pressure * 0.9)
    }

    // Smooth width transitions between segments
    const smoothedWidth = lastWidthRef.current * 0.6 + targetWidth * 0.4
    lastWidthRef.current = smoothedWidth
    return smoothedWidth
  }

  // Pointer Down — Start Stroke
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode !== 'draw') return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)

    saveState()
    setIsDrawing(true)

    const pt = getPoint(e)
    if (!pt) return

    currentPointsRef.current = [pt]
    lastWidthRef.current = basePenWidth

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Draw initial dot
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, basePenWidth / 2, 0, Math.PI * 2)
    ctx.fillStyle = penColor
    ctx.fill()
    setHasContent(true)
  }

  // Pointer Move — Draw Smooth Bézier Curve
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || mode !== 'draw') return
    e.preventDefault()

    const pt = getPoint(e)
    if (!pt) return

    const points = currentPointsRef.current
    points.push(pt)

    if (points.length < 2) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const p1 = points[points.length - 2]
    const p2 = points[points.length - 1]

    const calculatedWidth = computeStrokeWidth(p1, p2)

    ctx.beginPath()
    ctx.strokeStyle = penColor
    ctx.lineWidth = calculatedWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (points.length === 2) {
      ctx.moveTo(p1.x, p1.y)
      ctx.lineTo(p2.x, p2.y)
    } else {
      // Use midpoint quadratic curve for silky smooth lines
      const prevMidX = (points[points.length - 3].x + p1.x) / 2
      const prevMidY = (points[points.length - 3].y + p1.y) / 2
      const currMidX = (p1.x + p2.x) / 2
      const currMidY = (p1.y + p2.y) / 2

      ctx.moveTo(prevMidX, prevMidY)
      ctx.quadraticCurveTo(p1.x, p1.y, currMidX, currMidY)
    }

    ctx.stroke()
    setHasContent(true)
  }

  // Pointer Up — End Stroke
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    e.preventDefault()
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
    setIsDrawing(false)
    currentPointsRef.current = []
  }

  // Generate typed signature on canvas
  const handleTypeChange = (text: string, fontIdx = selectedFontIndex) => {
    setTypedName(text)
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const container = containerRef.current
    const rect = container?.getBoundingClientRect()
    const w = rect?.width || 500
    const h = rect?.height || height

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!text.trim()) {
      setHasContent(false)
      return
    }

    ctx.save()
    ctx.font = FONT_STYLES[fontIdx].font
    ctx.fillStyle = penColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, w / 2, h / 2)
    ctx.restore()

    setHasContent(true)
  }

  // Confirm & Save
  const handleConfirmSave = () => {
    const canvas = canvasRef.current
    if (!canvas || !hasContent) return

    // High resolution PNG export
    const dataUrl = canvas.toDataURL('image/png')
    onSave(dataUrl)
  }

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between border-b border-gray-100 pb-2.5 gap-2">
        {/* Draw / Type Mode Switcher */}
        <div className="flex items-center gap-1 bg-gray-100/80 p-1 rounded-xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => { setMode('draw'); clearCanvas() }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
              mode === 'draw' ? 'bg-white shadow-xs text-indigo-950 font-bold' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
            Draw Signature
          </button>
          <button
            type="button"
            onClick={() => { setMode('type'); clearCanvas() }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
              mode === 'type' ? 'bg-white shadow-xs text-indigo-950 font-bold' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Type className="w-3.5 h-3.5 text-indigo-600" />
            Type Signature
          </button>
        </div>

        {mode === 'draw' && (
          <div className="flex items-center gap-3">
            {/* Ink Palette */}
            <div className="flex items-center gap-1.5">
              {[
                { name: 'Navy', hex: '#1E1B4B' },
                { name: 'Black', hex: '#0F172A' },
                { name: 'Royal Blue', hex: '#1E40AF' },
                { name: 'Emerald', hex: '#065F46' },
              ].map((color) => (
                <button
                  key={color.hex}
                  type="button"
                  onClick={() => setPenColor(color.hex)}
                  title={color.name}
                  style={{ backgroundColor: color.hex }}
                  className={`w-5 h-5 rounded-full border border-white ring-1 transition-transform ${
                    penColor === color.hex ? 'ring-indigo-600 scale-110 shadow-sm' : 'ring-gray-200 hover:scale-105'
                  }`}
                />
              ))}
            </div>

            {/* Thickness Selector */}
            <div className="hidden sm:flex items-center gap-1 bg-gray-50 p-1 rounded-lg border border-gray-100">
              {[
                { label: 'Fine', width: 1.8 },
                { label: 'Medium', width: 2.8 },
                { label: 'Bold', width: 4.0 },
              ].map((t) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => setBasePenWidth(t.width)}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition ${
                    basePenWidth === t.width ? 'bg-indigo-600 text-white shadow-2xs' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Undo & Clear */}
            <div className="flex items-center gap-1 pl-1 border-l border-gray-100">
              <button
                type="button"
                onClick={undo}
                disabled={history.length === 0}
                className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded-lg hover:bg-gray-100 transition-colors"
                title="Undo last stroke"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={clearCanvas}
                disabled={!hasContent}
                className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-30 rounded-lg hover:bg-red-50 transition-colors"
                title="Clear canvas"
              >
                <Eraser className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Typed Signature Input & Style Picker */}
      {mode === 'type' && (
        <div className="space-y-2">
          <input
            type="text"
            value={typedName}
            onChange={(e) => handleTypeChange(e.target.value)}
            placeholder="Type your full name to generate signature..."
            className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-400 transition-all bg-white"
          />
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-gray-400">Style:</span>
            {FONT_STYLES.map((f, i) => (
              <button
                key={f.name}
                type="button"
                onClick={() => {
                  setSelectedFontIndex(i)
                  handleTypeChange(typedName, i)
                }}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium border transition-all ${
                  selectedFontIndex === i
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700 font-bold'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Touch-optimized Signature Canvas Container */}
      <div
        ref={containerRef}
        style={{ height: `${height}px` }}
        className="relative border-2 border-dashed border-gray-200 hover:border-indigo-300 rounded-2xl bg-white transition-all group overflow-hidden touch-none select-none shadow-xs"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="w-full h-full cursor-crosshair block touch-none"
        />

        {/* Empty Canvas Guidance Placeholder */}
        {!hasContent && mode === 'draw' && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-gray-400 gap-1.5">
            <div className="w-10 h-10 rounded-full bg-indigo-50/80 flex items-center justify-center text-indigo-600 mb-0.5">
              <Edit3 className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-gray-700">Draw your signature here</p>
            <p className="text-[11px] text-gray-400">Smooth ink strokes with touch, stylus, or mouse</p>
          </div>
        )}

        {/* Signature Line Overlay */}
        <div className="absolute bottom-5 left-6 right-6 border-b border-dashed border-gray-200 pointer-events-none flex items-center justify-between">
          <span className="text-[10px] font-bold text-gray-400/80 uppercase tracking-widest bg-white/90 px-1.5 rounded-xs">
            Sign Above
          </span>
          <span className="text-[10px] text-gray-400/80 font-mono bg-white/90 px-1">✕</span>
        </div>
      </div>

      {/* Bottom Save Action */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-1.5 text-gray-400 text-[11px]">
          <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
          <span>Smooth Calligraphic Vector Ink Engine</span>
        </div>
        <Button
          type="button"
          disabled={!hasContent}
          onClick={handleConfirmSave}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs py-2 px-4 rounded-xl font-bold flex items-center gap-1.5 transition-all shadow-xs active:scale-[0.98]"
        >
          <Check className="w-3.5 h-3.5" />
          Apply Signature
        </Button>
      </div>
    </div>
  )
}
