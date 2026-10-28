import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal, type LucideIcon } from 'lucide-react'

export interface RowMenuItem { label: string; icon?: LucideIcon; onClick: () => void }

const ROW_H = 36

/** Three-dots button at the end of a table row. The menu is rendered in a portal so the table
 *  card's overflow clipping can't cut it off, and flips upwards near the bottom of the window.
 *  Destructive actions don't belong here; they live inside the edit popup. */
export default function RowMenu({ items }: { items: RowMenuItem[] }) {
  const [pos, setPos] = useState<{ right: number; top?: number; bottom?: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!pos) return
    const close = () => setPos(null)
    const onDown = (e: MouseEvent) => { if (!(e.target as Element).closest('[data-row-menu]')) close() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [pos])

  function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (pos) { setPos(null); return }
    const r = btnRef.current!.getBoundingClientRect()
    const right = window.innerWidth - r.right
    const needed = items.length * ROW_H + 20
    setPos(r.bottom + needed > window.innerHeight
      ? { right, bottom: window.innerHeight - r.top + 6 }
      : { right, top: r.bottom + 6 })
  }

  return (
    <>
      <button ref={btnRef} type="button" onClick={toggle} aria-haspopup="menu" aria-expanded={!!pos}
        className={`w-7 h-7 inline-flex items-center justify-center rounded-lg text-icon transition-colors ${pos ? 'bg-selected' : 'hover:bg-selected'}`}>
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {pos && createPortal(
        <div data-row-menu role="menu" style={{ position: 'fixed', right: pos.right, top: pos.top, bottom: pos.bottom }}
          className="z-50 min-w-[168px] bg-white border border-line rounded-xl shadow-[0_8px_30px_rgba(16,17,18,0.12)] p-1.5">
          {items.map(({ label, icon: Icon, onClick }) => (
            <button key={label} type="button" role="menuitem"
              onClick={e => { e.stopPropagation(); setPos(null); onClick() }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[14px] font-medium text-left text-ink hover:bg-selected transition-colors">
              {Icon && <Icon className="w-4 h-4 text-icon" strokeWidth={1.75} />}{label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
