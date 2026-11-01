import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { UsageInfo } from '../../lib/stock'

/** The suggested minimum stock differs enough from the set one to be worth a hint. */
export function suggestionDirection(min: number, u: UsageInfo | undefined): 'up' | 'down' | null {
  if (!u || !u.enough || u.suggestedMin == null) return null
  const diff = u.suggestedMin - min
  if (min <= 0) return 'up'
  if (Math.abs(diff) < 1 || Math.abs(diff) / min < 0.25) return null
  return diff > 0 ? 'up' : 'down'
}

interface Props {
  direction: 'up' | 'down'
  title: string
  body: string
  footer: string
}

/** Small arrow next to the minimum stock; the explanation shows on hover. Drawn at the page level (fixed), so the table does not clip it. */
export default function MinSuggestion({ direction, title, body, footer }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const Icon = direction === 'up' ? ArrowUp : ArrowDown
  return (
    <>
      <span
        onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setPos({ x: r.left, y: r.top + r.height / 2 }) }}
        onMouseLeave={() => setPos(null)}
        className={`inline-flex items-center justify-center w-5 h-5 rounded-md ${direction === 'up' ? 'text-warn bg-warn/10' : 'text-accent bg-accent/10'}`}>
        <Icon className="w-3.5 h-3.5" strokeWidth={2} />
      </span>
      {pos && createPortal(
        <div role="tooltip" style={{ left: pos.x - 8, top: pos.y, transform: 'translate(-100%, -50%)' }}
          className="pointer-events-none fixed z-50 w-72 rounded-xl bg-ink px-3.5 py-2.5 text-left text-[13px] leading-5 font-normal text-white shadow-[0_8px_30px_rgba(16,17,18,0.25)]">
          <p className="font-medium">{title}</p>
          <p className="mt-1 text-white/80">{body}</p>
          <p className="mt-1.5 text-white/60 text-xs">{footer}</p>
        </div>, document.body)}
    </>
  )
}
