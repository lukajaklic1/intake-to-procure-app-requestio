import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { avatarTone, initials } from './PersonCell'

interface AvatarStackProps {
  names: string[]
  max?: number
  /** Footer link of the member list (e.g. "Show in Users"). */
  openLabel?: string
  onOpen?: () => void
}

const circle = 'inline-flex items-center justify-center w-[22px] h-[22px] !rounded-full !text-[9px] !font-semibold !leading-none shrink-0'

/** Overlapping initials circles for a group of people (max 3, then "+N"). Hovering opens a rounded list of everyone. */
export default function AvatarStack({ names, max = 3, openLabel, onOpen }: AvatarStackProps) {
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null)
  const ref = useRef<HTMLSpanElement>(null)
  const timer = useRef<number | undefined>(undefined)

  if (names.length === 0) return <span className="text-ink2">-</span>
  const shown = names.slice(0, max)
  const rest = names.length - shown.length

  function show() {
    window.clearTimeout(timer.current)
    const r = ref.current!.getBoundingClientRect()
    const below = window.innerHeight - r.bottom
    setPos(below < 300 && r.top > below ? { left: r.left, bottom: window.innerHeight - r.top + 6 } : { left: r.left, top: r.bottom + 6 })
  }
  const hide = () => { timer.current = window.setTimeout(() => setPos(null), 120) }

  return (
    <>
      <span ref={ref} className="inline-flex items-center -space-x-1.5 align-middle" onMouseEnter={show} onMouseLeave={hide}>
        {shown.map((n, i) => <span key={n + i} className={`badge ${avatarTone(n)} !p-0 ${circle} shadow-[0_0_0_2px_white]`}>{initials(n)}</span>)}
        {rest > 0 && <span className={`badge badge-neutral !p-0 ${circle} shadow-[0_0_0_2px_white]`}>+{rest}</span>}
      </span>
      {pos && createPortal(
        <div onMouseEnter={() => window.clearTimeout(timer.current)} onMouseLeave={hide}
          style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom }}
          className="z-50 min-w-[200px] max-w-[300px] bg-white border border-line rounded-xl shadow-[0_8px_30px_rgba(16,17,18,0.12)] p-1.5">
          <div className="max-h-64 overflow-y-auto flex flex-col gap-0.5" style={{ scrollbarWidth: 'thin' }}>
            {names.map((n, i) => (
              <div key={n + i} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[14px] font-medium text-ink">
                <span className={`badge ${avatarTone(n)} !p-0 ${circle}`}>{initials(n)}</span>
                <span className="truncate">{n}</span>
              </div>
            ))}
          </div>
          {onOpen && openLabel && (
            <button type="button" onClick={onOpen}
              className="mt-1 w-full text-left px-2.5 py-2 rounded-lg border-t border-line text-[13px] font-medium text-primary hover:bg-selected transition-colors">
              {openLabel}
            </button>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}
