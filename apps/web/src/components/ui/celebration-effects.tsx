'use client'

import { useEffect, useRef } from 'react'
import { Sparkles, Trophy, CheckCircle2, X, ArrowRight, ShieldCheck, Zap } from 'lucide-react'
import { Milestone } from '@/lib/celebrations'

interface CanvasProps {
  duration?: number
  onComplete?: () => void
}

export function ChampagneConfettiCanvas({ duration = 3500, onComplete }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    const startTime = Date.now()

    // Resize canvas
    const setSize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    setSize()
    window.addEventListener('resize', setSize)

    // Mature Palette: Gold, Champagne, Emerald, Deep Violet, Soft Pearl
    const colors = [
      '#D4AF37', // Gold
      '#F3E5AB', // Champagne
      '#10B981', // Emerald
      '#6366F1', // Indigo/Violet
      '#E2E8F0', // Pearl
      '#34D399', // Mint Emerald
    ]

    interface Particle {
      x: number
      y: number
      vx: number
      vy: number
      size: number
      color: string
      rotation: number
      vRotation: number
      opacity: number
      shape: 'rect' | 'circle' | 'spark'
    }

    const particleCount = 75
    const particles: Particle[] = []

    // Launch particles from center-bottom / sides
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.random() * Math.PI * 0.8) - Math.PI * 0.9 // angled upwards
      const speed = Math.random() * 12 + 8
      particles.push({
        x: canvas.width * 0.5 + (Math.random() - 0.5) * 200,
        y: canvas.height * 0.6 + (Math.random() - 0.5) * 50,
        vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 4,
        vy: Math.sin(angle) * speed - Math.random() * 4,
        size: Math.random() * 7 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * Math.PI * 2,
        vRotation: (Math.random() - 0.5) * 0.2,
        opacity: 1,
        shape: Math.random() > 0.6 ? 'rect' : Math.random() > 0.3 ? 'spark' : 'circle',
      })
    }

    const render = () => {
      const elapsed = Date.now() - startTime
      if (elapsed > duration) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        if (onComplete) onComplete()
        return
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const progress = elapsed / duration
      const globalFade = progress > 0.7 ? 1 - (progress - 0.7) / 0.3 : 1

      particles.forEach((p) => {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.25 // Gravity
        p.vx *= 0.98 // Friction
        p.rotation += p.vRotation

        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.globalAlpha = Math.max(0, p.opacity * globalFade)
        ctx.fillStyle = p.color

        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.6)
        } else if (p.shape === 'circle') {
          ctx.beginPath()
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2)
          ctx.fill()
        } else {
          // Diamond spark
          ctx.beginPath()
          ctx.moveTo(0, -p.size)
          ctx.lineTo(p.size / 2, 0)
          ctx.lineTo(0, p.size)
          ctx.lineTo(-p.size / 2, 0)
          ctx.closePath()
          ctx.fill()
        }

        ctx.restore()
      })

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      window.removeEventListener('resize', setSize)
      cancelAnimationFrame(animationFrameId)
    }
  }, [duration, onComplete])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[10000]"
    />
  )
}

export interface CelebrationBannerProps {
  milestone: Milestone
  customData?: Record<string, any>
  onDismiss: () => void
  onOpenReport?: () => void
}

export function CelebrationBanner({
  milestone,
  customData,
  onDismiss,
  onOpenReport,
}: CelebrationBannerProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss()
    }, 7000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-xl px-4 animate-in fade-in slide-in-from-top-6 duration-300">
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-slate-900/90 backdrop-blur-xl p-4 shadow-2xl shadow-amber-500/10 text-white">
        {/* Shimmer metallic background bar */}
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-emerald-500/10 to-indigo-500/10 opacity-50 pointer-events-none" />

        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 shadow-md shadow-amber-500/20">
              <Trophy className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300 border border-amber-400/20">
                  <Sparkles className="h-2.5 w-2.5" /> MILESTONE UNLOCKED
                </span>
                <span className="text-xs text-slate-400">{milestone.impactMetric}</span>
              </div>
              <p className="text-sm font-bold text-white truncate mt-0.5">
                🎉 {milestone.title}: {milestone.subtitle}
              </p>
              {customData?.detail && (
                <p className="text-xs text-slate-300 truncate mt-0.5">{customData.detail}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {onOpenReport && (
              <button
                onClick={() => {
                  onOpenReport()
                  onDismiss()
                }}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-300 transition-colors shadow-sm"
              >
                View ROI
                <ArrowRight className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={onDismiss}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
