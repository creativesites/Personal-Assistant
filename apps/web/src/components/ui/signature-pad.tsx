'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { Eraser, RotateCcw, Check, Type, Edit3, Palette } from 'lucide-react'
import { Button } from './button'

interface SignaturePadProps {
  onSave: (dataUrl: string) => void
  initialValue?: string | null
  height?: number
  width?: number
  className?: string
}

export function SignaturePad({
  onSave,
  initialValue = null,
  height = 200,
  width = 500,
  className = '',
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasContent, setHasContent] = useState(false)
  const [mode, setMode] = useState<'draw' | 'type'>('draw')
  const [typedName, setTypedName] = useState('')
  const [penColor, setPenColor] = useState('#1E1B4B') // Slate/Navy dark ink
  const [penWidth, setPenWidth] = useState(2.5)
  const [history, setImageDataHistory] = useState<ImageData[]>([])

  // Touch & Mouse coordinates calculation
  const getCoordinates = useCallback((e: MouseEvent | TouchEvent): { x: number; y: number } | null => {
    if (!canvasRef.current) return null
    const rect = canvasRef.current.getBoundingClientRect()
    const scaleX = canvasRef.current.width / rect.width
    const scaleY = canvasRef.current.height / rect.height

    if ('touches' in e) {
      if (e.touches.length === 0) return null
      const touch = e.touches[0]
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      }
    } else {
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      }
    }
  }, [])

  // Clear canvas
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasContent(false)
    setImageDataHistory([])
  }, [])

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set high-DPI scaling for crisp signatures
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = penColor
    ctx.lineWidth = penWidth

    if (initialValue && initialValue.startsWith('data:image')) {
      const img = new Image()
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height)
        setHasContent(true)
      }
      img.src = initialValue
    }
  }, [width, height, initialValue])

  // Save state for undo
  const saveState = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    setImageDataHistory((prev) => [...prev.slice(-10), data])
  }, [])

  // Undo
  const undo = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || history.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const newHistory = [...history]
    newHistory.pop() // Remove current
    const previous = newHistory[newHistory.length - 1]

    if (previous) {
      ctx.putImageData(previous, 0, 0)
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      setHasContent(false)
    }
    setImageDataHistory(newHistory)
  }, [history])

  // Start Drawing
  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (mode !== 'draw') return
    e.preventDefault()
    saveState()
    setIsDrawing(true)
    const coords = getCoordinates(e.nativeEvent)
    if (!coords) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.beginPath()
    ctx.moveTo(coords.x, coords.y)
    ctx.strokeStyle = penColor
    ctx.lineWidth = penWidth
  }

  // Draw Stroke
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || mode !== 'draw') return
    e.preventDefault()
    const coords = getCoordinates(e.nativeEvent)
    if (!coords) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.lineTo(coords.x, coords.y)
    ctx.stroke()
    setHasContent(true)
  }

  // Stop Drawing
  const stopDrawing = () => {
    if (!isDrawing) return
    setIsDrawing(false)
  }

  // Generate typed signature on canvas
  const handleTypeChange = (text: string) => {
    setTypedName(text)
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!text.trim()) {
      setHasContent(false)
      return
    }

    ctx.font = 'italic 38px "Dancing Script", "Caveat", "Brush Script MT", cursive'
    ctx.fillStyle = penColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, width / 2, height / 2)
    setHasContent(true)
  }

  // Save Signature
  const handleConfirmSave = () => {
    const canvas = canvasRef.current
    if (!canvas || !hasContent) return
    const dataUrl = canvas.toDataURL('image/png')
    onSave(dataUrl)
  }

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Mode & Controls Bar */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg text-xs">
          <button
            type="button"
            onClick={() => { setMode('draw'); clearCanvas() }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition ${
              mode === 'draw' ? 'bg-white shadow-xs text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            Draw Signature
          </button>
          <button
            type="button"
            onClick={() => { setMode('type'); clearCanvas() }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition ${
              mode === 'type' ? 'bg-white shadow-xs text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            Type Signature
          </button>
        </div>

        {mode === 'draw' && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              {['#1E1B4B', '#0F172A', '#1E40AF', '#065F46'].map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setPenColor(color)}
                  style={{ backgroundColor: color }}
                  className={`w-5 h-5 rounded-full border border-white ring-1 transition ${
                    penColor === color ? 'ring-indigo-600 scale-110' : 'ring-gray-300'
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={undo}
              disabled={history.length === 0}
              className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded-md hover:bg-gray-100"
              title="Undo last stroke"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={clearCanvas}
              disabled={!hasContent}
              className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-30 rounded-md hover:bg-red-50"
              title="Clear signature"
            >
              <Eraser className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Typed Input if Type mode */}
      {mode === 'type' && (
        <div className="mb-1">
          <input
            type="text"
            value={typedName}
            onChange={(e) => handleTypeChange(e.target.value)}
            placeholder="Type full name for signature style..."
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      )}

      {/* Canvas Area */}
      <div className="relative border-2 border-dashed border-gray-200 rounded-xl bg-slate-50/50 hover:bg-slate-50 transition group overflow-hidden touch-none">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-[200px] cursor-crosshair block"
        />

        {!hasContent && mode === 'draw' && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-gray-400 gap-1.5">
            <Edit3 className="w-6 h-6 stroke-1.5 opacity-60" />
            <p className="text-xs font-medium">Draw your signature here with touch or mouse</p>
          </div>
        )}

        {/* Signature Line Indicator */}
        <div className="absolute bottom-6 left-8 right-8 border-b border-gray-300/80 pointer-events-none flex items-center justify-between">
          <span className="text-[10px] text-gray-400 bg-white/80 px-1 font-mono uppercase tracking-wider">Sign Here</span>
          <span className="text-[10px] text-gray-400 bg-white/80 px-1 font-mono">❌</span>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-2 pt-1">
        <Button
          type="button"
          disabled={!hasContent}
          onClick={handleConfirmSave}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs py-2 px-4 rounded-lg flex items-center gap-1.5"
        >
          <Check className="w-3.5 h-3.5" />
          Save Signature
        </Button>
      </div>
    </div>
  )
}
