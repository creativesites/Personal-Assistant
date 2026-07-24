import { useState, useEffect } from 'react'

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

interface AvatarProps {
  name?: string
  src?: string
  size?: AvatarSize
  online?: boolean
  className?: string
  onClick?: (e: React.MouseEvent) => void
}

const sizes: Record<AvatarSize, { container: string; text: string }> = {
  xs: { container: 'w-6 h-6',   text: 'text-[10px]' },
  sm: { container: 'w-8 h-8',   text: 'text-xs' },
  md: { container: 'w-10 h-10', text: 'text-sm' },
  lg: { container: 'w-12 h-12', text: 'text-base' },
  xl: { container: 'w-16 h-16', text: 'text-xl' },
}

const dotSizes: Record<AvatarSize, string> = {
  xs: 'w-1.5 h-1.5',
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3',
  xl: 'w-4 h-4',
}

const BG_COLORS = [
  'bg-indigo-500', 'bg-purple-500', 'bg-pink-500',    'bg-rose-500',
  'bg-orange-500', 'bg-amber-500',  'bg-emerald-500', 'bg-teal-500',
  'bg-cyan-500',   'bg-sky-500',
]

function colorForName(name?: string) {
  if (!name) return BG_COLORS[0]
  const code = name.charCodeAt(0) + (name.charCodeAt(name.length - 1) ?? 0)
  return BG_COLORS[code % BG_COLORS.length]
}

function initials(name?: string) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return parts.length === 1
    ? parts[0][0].toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function Avatar({ name, src, size = 'md', online, className = '', onClick }: AvatarProps) {
  const s = sizes[size]
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    setImgError(false)
  }, [src])

  return (
    <span
      onClick={onClick}
      className={`relative inline-flex flex-shrink-0 ${onClick ? 'cursor-pointer hover:opacity-90' : ''} ${className}`}
    >
      <span className={`${s.container} rounded-full overflow-hidden flex items-center justify-center text-white font-semibold ${colorForName(name)}`}>
        {src && !imgError
          ? (
            <img
              src={src}
              alt={name ?? ''}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover"
            />
          )
          : <span className={s.text}>{initials(name)}</span>
        }
      </span>
      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 ${dotSizes[size]} rounded-full border-2 border-white ${online ? 'bg-green-500' : 'bg-gray-300'}`}
          aria-label={online ? 'Online' : 'Offline'}
        />
      )}
    </span>
  )
}
